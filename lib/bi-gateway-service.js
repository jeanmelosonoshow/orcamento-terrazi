import crypto from 'crypto';
import { criarChaveConsulta } from './bi-gateway-cache.js';

function numero(valor, fallback, minimo, maximo) {
    const convertido = Number(valor);
    if (!Number.isFinite(convertido)) return fallback;
    return Math.min(maximo, Math.max(minimo, Math.trunc(convertido)));
}

function erroGateway(codigo, mensagem, status = 500) {
    const error = new Error(mensagem);
    error.code = codigo;
    error.status = status;
    return error;
}

function validarRequisicao(requisicao) {
    if (!requisicao || typeof requisicao !== 'object') {
        throw erroGateway('BI_GATEWAY_INVALID_REQUEST', 'Requisicao invalida.', 400);
    }
    if (!String(requisicao.sql || '').trim()) {
        throw erroGateway('BI_GATEWAY_INVALID_SQL', 'Consulta SQL nao informada.', 400);
    }
    if (Buffer.byteLength(String(requisicao.sql), 'utf8') > 200000) {
        throw erroGateway('BI_GATEWAY_SQL_TOO_LARGE', 'Consulta SQL excede o limite permitido.', 413);
    }
    if (requisicao.params !== undefined && !Array.isArray(requisicao.params)) {
        throw erroGateway('BI_GATEWAY_INVALID_PARAMS', 'Parametros devem ser uma lista.', 400);
    }
    const tabelasTemporarias = requisicao.opcoes?.tabelasTemporarias;
    if (tabelasTemporarias !== undefined && (
        !Array.isArray(tabelasTemporarias)
        || tabelasTemporarias.some(nome => !/^[A-Z_][A-Z0-9_$]*$/.test(String(nome || '').toUpperCase()))
    )) {
        throw erroGateway('BI_GATEWAY_INVALID_GTT', 'Lista de tabelas temporarias invalida.', 400);
    }
}

function erroTransitorioBanco(error) {
    const codigo = String(error?.code || '');
    if (['FB_ACQUIRE_TIMEOUT', 'FB_QUERY_TIMEOUT'].includes(codigo)) return false;
    return codigo === 'FB_CONNECT_TIMEOUT' || error?.isFirebirdConnectionError === true;
}
export class ServicoBiGateway {
    constructor({
        executor,
        cache,
        fila,
        agora = () => Date.now(),
        logger = console,
        lockMs = 45000,
        lockSafetyMs = 25000,
        lockRenewalMinMs = 1000,
        esperaSingleFlightMs = 5000,
        intervaloSingleFlightMs = 100,
        circuitFailureThreshold = 5,
        circuitOpenMs = 15000
    }) {
        this.executor = executor;
        this.cache = cache;
        this.fila = fila;
        this.agora = agora;
        this.logger = logger;
        this.lockMs = lockMs;
        this.lockSafetyMs = lockSafetyMs;
        this.lockRenewalMinMs = Math.max(5, lockRenewalMinMs);
        this.esperaSingleFlightMs = esperaSingleFlightMs;
        this.intervaloSingleFlightMs = intervaloSingleFlightMs;
        this.emExecucao = new Map();
        this.circuitFailureThreshold = circuitFailureThreshold;
        this.circuitOpenMs = circuitOpenMs;
        this.circuito = { falhas: 0, abertoAte: 0, probeEmAndamento: false };
    }

    async executar(requisicao) {
        validarRequisicao(requisicao);
        const ttlMs = numero(requisicao.cache?.ttlMs, 0, 0, 3600000);
        const staleMs = numero(requisicao.cache?.staleMs, 0, 0, 86400000);
        const chave = criarChaveConsulta(requisicao);
        const item = ttlMs > 0 ? await this.cache.obter(chave) : null;
        const agora = this.agora();

        if (item && item.freshUntil > agora) {
            return this.resposta(item.value, 'HIT', chave);
        }

        if (item && item.staleUntil > agora && requisicao.cache?.staleWhileRevalidate !== false) {
            this.atualizar(chave, requisicao, ttlMs, staleMs, item).catch(error => {
                this.logger.warn?.('[bi-gateway] revalidacao em segundo plano falhou', {
                    chave: chave.slice(0, 12),
                    code: error.code || null,
                    causeCode: error.cause?.code || null,
                    status: error.status || null,
                    gatewayStatus: error.gatewayStatus || null,
                    gatewayVersion: error.gatewayVersion || null,
                    gatewayRequestId: error.gatewayRequestId || null,
                    contentType: error.gatewayContentType || null,
                    responseShape: error.gatewayResponseShape || null,
                    message: error.message
                });
            });
            return this.resposta(item.value, 'STALE', chave);
        }

        return this.atualizar(chave, requisicao, ttlMs, staleMs, item);
    }

    async atualizar(chave, requisicao, ttlMs, staleMs, itemAnterior) {
        if (this.emExecucao.has(chave)) return this.emExecucao.get(chave);
        const promessa = this.executarAtualizacao(chave, requisicao, ttlMs, staleMs, itemAnterior)
            .finally(() => this.emExecucao.delete(chave));
        this.emExecucao.set(chave, promessa);
        return promessa;
    }

    async executarAtualizacao(chave, requisicao, ttlMs, staleMs, itemAnterior) {
        const token = crypto.randomUUID();
        const usaCache = ttlMs > 0;
        const timeoutMs = numero(requisicao.opcoes?.timeoutMs, 15000, 1000, 120000);
        const duracaoBloqueioMs = Math.max(this.lockMs, timeoutMs + this.lockSafetyMs);
        let possuiBloqueio = !usaCache;
        let renovadorBloqueio = null;
        if (usaCache) possuiBloqueio = await this.cache.adquirirBloqueio(chave, token, duracaoBloqueioMs);

        if (!possuiBloqueio) {
            const compartilhado = await this.aguardarConsultaIgual(chave);
            if (compartilhado) return this.resposta(compartilhado.value, 'COALESCED', chave);
            possuiBloqueio = await this.cache.adquirirBloqueio(chave, token, duracaoBloqueioMs);
            if (!possuiBloqueio) {
                throw erroGateway(
                    'BI_GATEWAY_SINGLE_FLIGHT_TIMEOUT',
                    'Outra execucao da mesma consulta ainda esta em andamento.',
                    503
                );
            }
        }

        try {
            if (possuiBloqueio && usaCache) {
                renovadorBloqueio = this.iniciarRenovacaoBloqueio(chave, token, duracaoBloqueioMs);
            }
            this.validarCircuito();
            const linhas = await this.fila.executar(
                () => this.executor(requisicao.sql, requisicao.params || [], requisicao.opcoes || {}),
                { leaseMs: Math.max(duracaoBloqueioMs, timeoutMs + this.lockSafetyMs) }
            );
            this.registrarSucessoCircuito();
            const value = { linhas };
            if (usaCache) {
                const agora = this.agora();
                await this.cache.definir(chave, {
                    value,
                    freshUntil: agora + ttlMs,
                    staleUntil: agora + ttlMs + staleMs
                });
            }
            return this.resposta(value, usaCache ? 'MISS' : 'BYPASS', chave);
        } catch (error) {
            this.registrarFalhaCircuito(error);
            if (itemAnterior && itemAnterior.staleUntil > this.agora()) {
                return this.resposta(itemAnterior.value, 'STALE_IF_ERROR', chave, error);
            }
            throw error;
        } finally {
            if (renovadorBloqueio) await renovadorBloqueio.parar();
            if (possuiBloqueio && usaCache) {
                await this.cache.liberarBloqueio(chave, token);
            }
        }
    }

    iniciarRenovacaoBloqueio(chave, token, duracaoMs) {
        if (typeof this.cache.renovarBloqueio !== 'function') return null;
        const intervalo = Math.max(this.lockRenewalMinMs, Math.min(10000, Math.floor(duracaoMs / 3)));
        let ativo = true;
        let renovando = false;
        let renovacaoEmAndamento = Promise.resolve();
        const renovar = async () => {
            if (!ativo || renovando) return;
            renovando = true;
            try {
                await this.cache.renovarBloqueio(chave, token, duracaoMs);
            } catch (error) {
                if (ativo) {
                    this.logger.warn?.('[bi-gateway] falha inesperada ao renovar single-flight', {
                        chave: chave.slice(0, 12),
                        code: error.code || null,
                        message: error.message
                    });
                }
            } finally {
                renovando = false;
            }
        };
        const timer = setInterval(() => {
            if (!ativo || renovando) return;
            renovacaoEmAndamento = renovar();
        }, intervalo);
        timer.unref?.();
        return {
            async parar() {
                ativo = false;
                clearInterval(timer);
                await renovacaoEmAndamento.catch(() => {});
            }
        };
    }

    validarCircuito() {
        const agora = this.agora();
        if (this.circuito.abertoAte > agora) {
            throw erroGateway('BI_GATEWAY_CIRCUIT_OPEN', 'Firebird em periodo de recuperacao.', 503);
        }
        if (this.circuito.falhas >= this.circuitFailureThreshold) {
            if (this.circuito.probeEmAndamento) {
                throw erroGateway('BI_GATEWAY_CIRCUIT_OPEN', 'Teste de recuperacao do Firebird em andamento.', 503);
            }
            this.circuito.probeEmAndamento = true;
        }
    }

    registrarSucessoCircuito() {
        this.circuito = { falhas: 0, abertoAte: 0, probeEmAndamento: false };
    }

    registrarFalhaCircuito(error) {
        if (error?.code === 'BI_GATEWAY_CIRCUIT_OPEN') return;
        if (!erroTransitorioBanco(error)) {
            this.circuito.probeEmAndamento = false;
            return;
        }
        this.circuito.falhas += 1;
        this.circuito.probeEmAndamento = false;
        if (this.circuito.falhas >= this.circuitFailureThreshold) {
            this.circuito.abertoAte = this.agora() + this.circuitOpenMs;
            this.logger.error?.('[bi-gateway] circuit breaker aberto', {
                falhas: this.circuito.falhas,
                reabrirEmMs: this.circuitOpenMs,
                code: error.code || null
            });
        }
    }
    async aguardarConsultaIgual(chave) {
        const inicio = this.agora();
        while (this.agora() - inicio < this.esperaSingleFlightMs) {
            await new Promise(resolve => setTimeout(resolve, this.intervaloSingleFlightMs));
            const item = await this.cache.obter(chave);
            if (item?.freshUntil > this.agora()) return item;
        }
        return null;
    }

    resposta(value, cacheStatus, chave, error = null) {
        return {
            linhas: Array.isArray(value?.linhas) ? value.linhas : [],
            meta: {
                cache: cacheStatus,
                chave: chave.slice(0, 12),
                contingencia: cacheStatus === 'STALE_IF_ERROR',
                erroOriginal: error?.code || null
            }
        };
    }

    status() {
        return {
            ok: true,
            fila: this.fila.status(),
            cache: this.cache.status?.() || null,
            singleFlightsLocais: this.emExecucao.size,
            circuito: {
                estado: this.circuito.abertoAte > this.agora() ? 'aberto' : 'fechado',
                falhas: this.circuito.falhas,
                abertoAte: this.circuito.abertoAte || null
            }
        };
    }
}

export function statusHttpErroGateway(error) {
    if (error?.status) return error.status;
    if (error?.code === 'BI_GATEWAY_QUEUE_FULL' || error?.code === 'BI_REDIS_ERROR') return 503;
    if (error?.code === 'BI_GATEWAY_QUEUE_TIMEOUT') return 504;
    return 500;
}
