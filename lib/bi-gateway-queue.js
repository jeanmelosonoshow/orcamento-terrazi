import crypto from 'crypto';

function erroFila(codigo, mensagem) {
    const error = new Error(mensagem);
    error.code = codigo;
    error.isGatewayCapacityError = true;
    return error;
}

export class FilaLimitadaGateway {
    constructor({ concorrencia = 8, limiteEspera = 100, timeoutEsperaMs = 30000 } = {}) {
        this.concorrencia = concorrencia;
        this.limiteEspera = limiteEspera;
        this.timeoutEsperaMs = timeoutEsperaMs;
        this.ativos = 0;
        this.pendentes = [];
    }

    executar(tarefa) {
        if (this.ativos < this.concorrencia) return this.iniciar(tarefa);
        if (this.pendentes.length >= this.limiteEspera) {
            return Promise.reject(erroFila('BI_GATEWAY_QUEUE_FULL', 'Fila global de consultas lotada.'));
        }
        return new Promise((resolve, reject) => {
            const item = { tarefa, resolve, reject };
            item.timeout = setTimeout(() => {
                const indice = this.pendentes.indexOf(item);
                if (indice >= 0) this.pendentes.splice(indice, 1);
                reject(erroFila('BI_GATEWAY_QUEUE_TIMEOUT', 'Tempo limite aguardando na fila global.'));
            }, this.timeoutEsperaMs);
            this.pendentes.push(item);
        });
    }

    async iniciar(tarefa) {
        this.ativos += 1;
        try {
            return await tarefa();
        } finally {
            this.ativos -= 1;
            this.avancar();
        }
    }

    avancar() {
        while (this.ativos < this.concorrencia && this.pendentes.length) {
            const item = this.pendentes.shift();
            clearTimeout(item.timeout);
            this.iniciar(item.tarefa).then(item.resolve, item.reject);
        }
    }

    status() {
        return {
            tipo: 'local',
            ativos: this.ativos,
            pendentes: this.pendentes.length,
            concorrencia: this.concorrencia,
            limiteEspera: this.limiteEspera
        };
    }
}

const ENTRAR_FILA_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
local tamanho = redis.call("ZCARD", KEYS[1])
if tamanho >= tonumber(ARGV[2]) then return 0 end
redis.call("ZADD", KEYS[1], ARGV[3], ARGV[4])
redis.call("PEXPIRE", KEYS[1], ARGV[5])
return 1
`;

const TENTAR_ADQUIRIR_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[2], "-inf", ARGV[1])
local primeiro = redis.call("ZRANGE", KEYS[1], 0, 0)
if primeiro[1] ~= ARGV[2] then return 0 end
if redis.call("ZCARD", KEYS[2]) >= tonumber(ARGV[3]) then return 0 end
redis.call("ZREM", KEYS[1], ARGV[2])
redis.call("ZADD", KEYS[2], ARGV[4], ARGV[2])
redis.call("PEXPIRE", KEYS[2], ARGV[5])
return 1
`;

export class FilaRedisGateway {
    constructor(cliente, {
        prefixo = 'terrazi:bi',
        concorrencia = 8,
        limiteEspera = 100,
        timeoutEsperaMs = 30000,
        intervaloMs = 250,
        leaseMs = 45000
    } = {}) {
        this.cliente = cliente;
        this.chaveFila = `${prefixo}:queue`;
        this.chaveAtivos = `${prefixo}:active`;
        this.concorrencia = concorrencia;
        this.limiteEspera = limiteEspera;
        this.timeoutEsperaMs = timeoutEsperaMs;
        this.intervaloMs = intervaloMs;
        this.leaseMs = leaseMs;
    }

    async executar(tarefa, { leaseMs = this.leaseMs } = {}) {
        const token = crypto.randomUUID();
        const inicio = Date.now();
        const entrou = await this.cliente.avaliar(
            ENTRAR_FILA_SCRIPT,
            [this.chaveFila],
            [
                inicio,
                this.limiteEspera,
                inicio + this.timeoutEsperaMs + Math.random(),
                token,
                this.timeoutEsperaMs * 3
            ]
        );
        if (Number(entrou) !== 1) {
            throw erroFila('BI_GATEWAY_QUEUE_FULL', 'Fila global de consultas lotada.');
        }

        let adquirido = false;
        try {
            while (Date.now() - inicio < this.timeoutEsperaMs) {
                const agora = Date.now();
                adquirido = Number(await this.cliente.avaliar(
                    TENTAR_ADQUIRIR_SCRIPT,
                    [this.chaveFila, this.chaveAtivos],
                    [agora, token, this.concorrencia, agora + leaseMs, leaseMs * 2]
                )) === 1;
                if (adquirido) return await tarefa();
                await new Promise(resolve => setTimeout(resolve, this.intervaloMs));
            }
            throw erroFila('BI_GATEWAY_QUEUE_TIMEOUT', 'Tempo limite aguardando na fila global.');
        } finally {
            try {
                await this.cliente.comando('ZREM', adquirido ? this.chaveAtivos : this.chaveFila, token);
            } catch (error) {
                console.warn('[bi-gateway] lease Redis sera liberado por expiracao', { message: error.message });
            }
        }
    }

    status() {
        return {
            tipo: 'redis',
            concorrencia: this.concorrencia,
            limiteEspera: this.limiteEspera
        };
    }
}

export function numeroAmbienteGateway(nome, fallback, minimo = 1, maximo = Number.MAX_SAFE_INTEGER) {
    const valor = Number(process.env[nome]);
    if (!Number.isFinite(valor)) return fallback;
    return Math.min(maximo, Math.max(minimo, Math.trunc(valor)));
}
