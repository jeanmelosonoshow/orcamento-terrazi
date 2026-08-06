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
}

export class ClienteRedisRest {
    constructor({ url, token, fetchImpl = globalThis.fetch }) {
        this.url = String(url || '').replace(/\/+$/, '');
        this.token = String(token || '');
        this.fetchImpl = fetchImpl;
    }

    async comando(...argumentos) {
        const response = await this.fetchImpl(this.url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(argumentos)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.error) {
            const error = new Error(payload.error || `Redis respondeu HTTP ${response.status}.`);
            error.code = 'BI_REDIS_ERROR';
            throw error;
        }
        return payload.result;
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
        const resultado = await this.cliente.comando(
            'SET', this.chaveBloqueio(chave), token, 'NX', 'PX', Math.ceil(duracaoMs)
        );
        return resultado === 'OK';
    }

    async liberarBloqueio(chave, token) {
        await this.cliente.avaliar(LIBERAR_BLOQUEIO_SCRIPT, [this.chaveBloqueio(chave)], [token]);
    }
}

export class CacheResilienteGateway {
    constructor({ compartilhado = null, local = new CacheMemoriaGateway(), logger = console } = {}) {
        this.compartilhado = compartilhado;
        this.local = local;
        this.logger = logger;
    }

    async obter(chave) {
        if (this.compartilhado) {
            try {
                const item = await this.compartilhado.obter(chave);
                if (item) await this.local.definir(chave, item);
                return item;
            } catch (error) {
                this.logger.warn?.('[bi-gateway] cache compartilhado indisponivel', {
                    operacao: 'obter', message: error.message
                });
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
            this.logger.warn?.('[bi-gateway] falha ao gravar cache compartilhado', { message: error.message });
        }
    }

    async adquirirBloqueio(chave, token, duracaoMs) {
        if (this.compartilhado) {
            try {
                return await this.compartilhado.adquirirBloqueio(chave, token, duracaoMs);
            } catch (error) {
                this.logger.warn?.('[bi-gateway] bloqueio compartilhado indisponivel', { message: error.message });
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
                this.logger.warn?.('[bi-gateway] falha ao liberar bloqueio compartilhado', { message: error.message });
            }
        }
        await this.local.liberarBloqueio(chave, token);
    }
}

export function obterCredenciaisRedisAmbiente(ambiente = process.env) {
    return {
        url: String(ambiente.UPSTASH_REDIS_REST_URL || ambiente.KV_REST_API_URL || '').trim(),
        token: String(ambiente.UPSTASH_REDIS_REST_TOKEN || ambiente.KV_REST_API_TOKEN || '').trim()
    };
}

export function criarCacheGatewayAmbiente({ fetchImpl, logger = console } = {}) {
    const { url, token } = obterCredenciaisRedisAmbiente();
    const compartilhado = url && token
        ? new CacheRedisGateway(new ClienteRedisRest({ url, token, fetchImpl }))
        : null;
    return new CacheResilienteGateway({ compartilhado, logger });
}
