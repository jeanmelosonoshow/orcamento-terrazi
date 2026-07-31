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
}

function erroTransitorioBanco(error) {
    const codigos = new Set(['FB_ACQUIRE_TIMEOUT', 'FB_CONNECT_TIMEOUT', 'FB_QUERY_TIMEOUT']);
    return codigos.has(String(error?.code || '')) || error?.isFirebirdConnectionError === true;
}
export class ServicoBiGateway {
    constructor({
        executor,
        cache,
        fila,
        agora = () => Date.now(),
        logger = console,
        lockMs = 45000,
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
        let possuiBloqueio = !usaCache;
        if (usaCache) possuiBloqueio = await this.cache.adquirirBloqueio(chave, token, this.lockMs);

        if (!possuiBloqueio) {
            const compartilhado = await this.aguardarConsultaIgual(chave);
            if (compartilhado) return this.resposta(compartilhado.value, 'COALESCED', chave);
            possuiBloqueio = await this.cache.adquirirBloqueio(chave, token, this.lockMs);
            if (!possuiBloqueio) {
                throw erroGateway(
                    'BI_GATEWAY_SINGLE_FLIGHT_TIMEOUT',
                    'Outra execucao da mesma consulta ainda esta em andamento.',
                    503
                );
            }
        }

        try {
            this.validarCircuito();
            const timeoutMs = numero(requisicao.opcoes?.timeoutMs, 15000, 1000, 120000);
            const linhas = await this.fila.executar(
                () => this.executor(requisicao.sql, requisicao.params || [], requisicao.opcoes || {}),
                { leaseMs: Math.max(this.lockMs, timeoutMs + 15000) }
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
            if (possuiBloqueio && usaCache) {
                await this.cache.liberarBloqueio(chave, token);
            }
        }
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
