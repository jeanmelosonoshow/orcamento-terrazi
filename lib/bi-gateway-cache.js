import crypto from 'crypto';

function ordenarValor(valor) {
    if (Array.isArray(valor)) return valor.map(ordenarValor);
    if (!valor || typeof valor !== 'object') return valor;
    return Object.keys(valor).sort().reduce((resultado, chave) => {
        resultado[chave] = ordenarValor(valor[chave]);
        return resultado;
    }, {});
}

export function criarChaveConsulta(requisicao) {
    const conteudo = JSON.stringify(ordenarValor({
        versao: 1,
        fonte: 'firebird',
        sql: String(requisicao.sql || ''),
        params: Array.isArray(requisicao.params) ? requisicao.params : [],
        limite: requisicao.opcoes?.limite ?? null,
        fallbackCharset: requisicao.opcoes?.permitirFallbackCharset === true,
        tabelasTemporarias: Array.isArray(requisicao.opcoes?.tabelasTemporarias)
            ? [...requisicao.opcoes.tabelasTemporarias].map(String).sort()
            : []
    }));
    return crypto.createHash('sha256').update(conteudo).digest('hex');
}

export class CacheMemoriaGateway {
    constructor({ agora = () => Date.now() } = {}) {
        this.agora = agora;
        this.itens = new Map();
        this.bloqueios = new Map();
    }

    async obter(chave) {
        const item = this.itens.get(chave);
        if (!item) return null;
        if (item.staleUntil <= this.agora()) {
            this.itens.delete(chave);
            return null;
        }
        return structuredClone(item);
    }

    async definir(chave, item) {
        this.itens.set(chave, structuredClone(item));
    }

    async adquirirBloqueio(chave, token, duracaoMs) {
        const atual = this.bloqueios.get(chave);
        if (atual && atual.expiraEm > this.agora()) return false;
        this.bloqueios.set(chave, { token, expiraEm: this.agora() + duracaoMs });
        return true;
    }

    async liberarBloqueio(chave, token) {
        const atual = this.bloqueios.get(chave);
        if (atual?.token === token) this.bloqueios.delete(chave);
    }

    async renovarBloqueio(chave, token, duracaoMs) {
        const atual = this.bloqueios.get(chave);
        if (atual?.token !== token || atual.expiraEm <= this.agora()) return false;
        atual.expiraEm = this.agora() + duracaoMs;
        return true;
    }
}

export class ClienteRedisRest {
    constructor({
        url,
        token,
        fetchImpl = globalThis.fetch,
        timeoutMs = 1800,
        retries = 1,
        backoffBaseMs = 100,
        circuitFailureThreshold = 3,
        circuitOpenMs = 10000,
        agora = () => Date.now(),
        random = Math.random
    }) {
        this.url = String(url || '').replace(/\/+$/, '');
        this.token = String(token || '');
        try {
            this.host = new URL(this.url).hostname;
        } catch (error) {
            this.host = 'invalido';
        }
        this.fetchImpl = fetchImpl;
        this.timeoutMs = Math.max(250, Number(timeoutMs) || 1800);
        this.retries = Math.max(0, Math.min(5, Number(retries) || 0));
        this.backoffBaseMs = Math.max(10, Number(backoffBaseMs) || 100);
        this.circuitFailureThreshold = Math.max(1, Number(circuitFailureThreshold) || 3);
        this.circuitOpenMs = Math.max(1000, Number(circuitOpenMs) || 10000);
        this.agora = agora;
        this.random = random;
        this.circuito = { falhas: 0, abertoAte: 0, probeEmAndamento: false };
    }

    async comando(...argumentos) {
        const inicio = this.agora();
        const operacao = String(argumentos[0] || '').toUpperCase();
        try {
            this.validarCircuito();
        } catch (error) {
            error.redisOperation = operacao;
            error.redisHost = this.host;
            error.durationMs = this.agora() - inicio;
            throw error;
        }
        const totalTentativas = this.retries + 1;
        let ultimoErro;
        for (let tentativa = 1; tentativa <= totalTentativas; tentativa += 1) {
            try {
                const resultado = await this.enviarComando(argumentos);
                this.registrarSucesso();
                return resultado;
            } catch (error) {
                error.redisOperation = operacao;
                error.redisHost = this.host;
                error.attempts = tentativa;
                ultimoErro = error;
                if (!this.erroTransitorio(error) || tentativa >= totalTentativas) break;
                const espera = (this.backoffBaseMs * (2 ** (tentativa - 1)))
                    + Math.floor(this.random() * this.backoffBaseMs);
                await new Promise(resolve => setTimeout(resolve, espera));
            }
        }
        ultimoErro.durationMs = this.agora() - inicio;
        this.registrarFalha(ultimoErro);
        throw ultimoErro;
    }

    async enviarComando(argumentos) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchImpl(this.url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(argumentos),
                signal: controller.signal
            });
            let payload;
            try {
                payload = await response.json();
            } catch (cause) {
                const error = new Error('Redis retornou uma resposta invalida.');
                error.code = 'BI_REDIS_INVALID_RESPONSE';
                error.status = response.status;
                error.cause = cause;
                throw error;
            }
            if (!response.ok || payload?.error) {
                const mensagem = String(payload?.error || `Redis respondeu HTTP ${response.status}.`);
                const error = new Error(mensagem);
                error.code = [401, 403].includes(response.status) || /WRONGPASS|NOAUTH|NOPERM/i.test(mensagem)
                    ? 'BI_REDIS_AUTH_ERROR'
                    : 'BI_REDIS_ERROR';
                error.status = response.status;
                throw error;
            }
            return payload?.result;
        } catch (error) {
            if (String(error?.code || '').startsWith('BI_REDIS_')) throw error;
            const timeoutAtingido = error?.name === 'AbortError';
            const redisError = new Error(timeoutAtingido
                ? 'Tempo limite ao comunicar com o Redis.'
                : 'Falha de comunicacao com o Redis.');
            redisError.code = timeoutAtingido ? 'BI_REDIS_TIMEOUT' : 'BI_REDIS_UNAVAILABLE';
            redisError.cause = error;
            throw redisError;
        } finally {
            clearTimeout(timeout);
        }
    }

    erroTransitorio(error) {
        return ['BI_REDIS_TIMEOUT', 'BI_REDIS_UNAVAILABLE', 'BI_REDIS_INVALID_RESPONSE'].includes(error?.code)
            || Number(error?.status) === 429
            || Number(error?.status) >= 500;
    }

    validarCircuito() {
        const agora = this.agora();
        if (this.circuito.abertoAte > agora) {
            const error = new Error('Circuit breaker do Redis temporariamente aberto.');
            error.code = 'BI_REDIS_CIRCUIT_OPEN';
            error.retryAfterMs = this.circuito.abertoAte - agora;
            throw error;
        }
        if (this.circuito.falhas >= this.circuitFailureThreshold) {
            if (this.circuito.probeEmAndamento) {
                const error = new Error('Teste de recuperacao do Redis em andamento.');
                error.code = 'BI_REDIS_CIRCUIT_OPEN';
                throw error;
            }
            this.circuito.probeEmAndamento = true;
        }
    }

    registrarSucesso() {
        this.circuito = { falhas: 0, abertoAte: 0, probeEmAndamento: false };
    }

    registrarFalha(error) {
        this.circuito.probeEmAndamento = false;
        if (!this.erroTransitorio(error)) return;
        this.circuito.falhas += 1;
        if (this.circuito.falhas >= this.circuitFailureThreshold) {
            this.circuito.abertoAte = this.agora() + this.circuitOpenMs;
        }
    }

    status() {
        return {
            estado: this.circuito.abertoAte > this.agora() ? 'aberto' : 'fechado',
            falhas: this.circuito.falhas,
            abertoAte: this.circuito.abertoAte || null
        };
    }

    async avaliar(script, chaves = [], argumentos = []) {
        return this.comando('EVAL', script, chaves.length, ...chaves, ...argumentos);
    }
}

const LIBERAR_BLOQUEIO_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const ADQUIRIR_BLOQUEIO_SCRIPT = `
local atual = redis.call("GET", KEYS[1])
if atual == ARGV[1] then
  redis.call("PEXPIRE", KEYS[1], ARGV[2])
  return 1
end
if redis.call("SET", KEYS[1], ARGV[1], "NX", "PX", ARGV[2]) then return 1 end
return 0
`;

const RENOVAR_BLOQUEIO_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("PEXPIRE", KEYS[1], ARGV[2])
  return 1
end
return 0
`;

export class CacheRedisGateway {
    constructor(cliente, { prefixo = 'terrazi:bi' } = {}) {
        this.cliente = cliente;
        this.prefixo = prefixo;
    }

    chaveCache(chave) {
        return `${this.prefixo}:cache:${chave}`;
    }

    chaveBloqueio(chave) {
        return `${this.prefixo}:lock:${chave}`;
    }

    async obter(chave) {
        const valor = await this.cliente.comando('GET', this.chaveCache(chave));
        if (!valor) return null;
        try {
            return JSON.parse(valor);
        } catch (error) {
            await this.cliente.comando('DEL', this.chaveCache(chave));
            return null;
        }
    }

    async definir(chave, item) {
        const ttlMs = Math.max(1000, Number(item.staleUntil) - Date.now());
        await this.cliente.comando('SET', this.chaveCache(chave), JSON.stringify(item), 'PX', Math.ceil(ttlMs));
    }

    async adquirirBloqueio(chave, token, duracaoMs) {
        const resultado = await this.cliente.avaliar(
            ADQUIRIR_BLOQUEIO_SCRIPT,
            [this.chaveBloqueio(chave)],
            [token, Math.ceil(duracaoMs)]
        );
        return Number(resultado) === 1;
    }

    async liberarBloqueio(chave, token) {
        await this.cliente.avaliar(LIBERAR_BLOQUEIO_SCRIPT, [this.chaveBloqueio(chave)], [token]);
    }

    async renovarBloqueio(chave, token, duracaoMs) {
        const resultado = await this.cliente.avaliar(
            RENOVAR_BLOQUEIO_SCRIPT,
            [this.chaveBloqueio(chave)],
            [token, Math.ceil(duracaoMs)]
        );
        return Number(resultado) === 1;
    }

    status() {
        return { tipo: 'redis', circuito: this.cliente.status?.() || null };
    }
}

export class CacheResilienteGateway {
    constructor({ compartilhado = null, local = new CacheMemoriaGateway(), logger = console } = {}) {
        this.compartilhado = compartilhado;
        this.local = local;
        this.logger = logger;
        this.avisos = new Map();
        this.intervaloAvisoMs = 10000;
    }

    avisar(evento, error, extra = {}) {
        const agora = Date.now();
        const chave = `${evento}:${error?.code || error?.message || 'erro'}`;
        const anterior = this.avisos.get(chave);
        if (anterior && agora - anterior.ultimo < this.intervaloAvisoMs) {
            anterior.suprimidos += 1;
            return;
        }
        this.avisos.set(chave, { ultimo: agora, suprimidos: 0 });
        this.logger.warn?.(`[bi-gateway] ${evento}`, {
            ...extra,
            code: error?.code || null,
            causeCode: error?.cause?.code || null,
            status: error?.status || null,
            attempts: error?.attempts || null,
            redisOperation: error?.redisOperation || null,
            redisHost: error?.redisHost || null,
            durationMs: error?.durationMs ?? null,
            suprimidos: anterior?.suprimidos || 0,
            message: error?.message
        });
    }

    async obter(chave) {
        if (this.compartilhado) {
            try {
                const item = await this.compartilhado.obter(chave);
                if (item) await this.local.definir(chave, item);
                return item;
            } catch (error) {
                this.avisar('cache compartilhado indisponivel', error, { operacao: 'obter' });
            }
        }
        return this.local.obter(chave);
    }

    async definir(chave, item) {
        await this.local.definir(chave, item);
        if (!this.compartilhado) return;
        try {
            await this.compartilhado.definir(chave, item);
        } catch (error) {
            this.avisar('falha ao gravar cache compartilhado', error, { operacao: 'definir' });
        }
    }

    async adquirirBloqueio(chave, token, duracaoMs) {
        if (this.compartilhado) {
            try {
                return await this.compartilhado.adquirirBloqueio(chave, token, duracaoMs);
            } catch (error) {
                this.avisar('bloqueio compartilhado indisponivel', error, { operacao: 'adquirir' });
            }
        }
        return this.local.adquirirBloqueio(chave, token, duracaoMs);
    }

    async liberarBloqueio(chave, token) {
        if (this.compartilhado) {
            try {
                await this.compartilhado.liberarBloqueio(chave, token);
                return;
            } catch (error) {
                this.avisar('falha ao liberar bloqueio compartilhado', error, { operacao: 'liberar' });
            }
        }
        await this.local.liberarBloqueio(chave, token);
    }

    async renovarBloqueio(chave, token, duracaoMs) {
        if (this.compartilhado) {
            try {
                return await this.compartilhado.renovarBloqueio(chave, token, duracaoMs);
            } catch (error) {
                this.avisar('falha ao renovar bloqueio compartilhado', error, { operacao: 'renovar' });
                return false;
            }
        }
        return this.local.renovarBloqueio(chave, token, duracaoMs);
    }

    status() {
        return {
            tipo: this.compartilhado ? 'resiliente-compartilhado' : 'memoria-local',
            compartilhado: this.compartilhado?.status?.() || null
        };
    }
}

export function obterCredenciaisRedisAmbiente(ambiente = process.env) {
    const upstash = {
        url: String(ambiente.UPSTASH_REDIS_REST_URL || '').trim(),
        token: String(ambiente.UPSTASH_REDIS_REST_TOKEN || '').trim()
    };
    if (upstash.url && upstash.token) return upstash;
    return {
        url: String(ambiente.KV_REST_API_URL || '').trim(),
        token: String(ambiente.KV_REST_API_TOKEN || '').trim()
    };
}

export function criarCacheGatewayAmbiente({ fetchImpl, logger = console, clienteRedis = null } = {}) {
    const { url, token } = obterCredenciaisRedisAmbiente();
    const compartilhado = url && token
        ? new CacheRedisGateway(clienteRedis || new ClienteRedisRest({ url, token, fetchImpl }))
        : null;
    return new CacheResilienteGateway({ compartilhado, logger });
}
