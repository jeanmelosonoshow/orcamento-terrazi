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

    executar(tarefa, { deadlineAt = null } = {}) {
        const possuiPrazo = deadlineAt !== null
            && deadlineAt !== undefined
            && Number.isFinite(Number(deadlineAt));
        const prazoRestanteMs = possuiPrazo
            ? Number(deadlineAt) - Date.now()
            : this.timeoutEsperaMs;
        if (prazoRestanteMs <= 0) {
            return Promise.reject(erroFila('BI_GATEWAY_QUEUE_TIMEOUT', 'Tempo limite aguardando na fila global.'));
        }
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
            }, Math.min(this.timeoutEsperaMs, prazoRestanteMs));
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

export class FilaCompostaGateway {
    constructor(filaLocal, filaCompartilhada) {
        this.filaLocal = filaLocal;
        this.filaCompartilhada = filaCompartilhada;
    }

    executar(tarefa, opcoes = {}) {
        const temposConfigurados = [
            this.filaLocal.timeoutEsperaMs,
            this.filaCompartilhada.timeoutEsperaMs
        ].map(Number).filter(valor => Number.isFinite(valor) && valor > 0);
        const prazoConfigurado = Date.now() + Math.min(...temposConfigurados);
        const possuiPrazo = opcoes.deadlineAt !== null
            && opcoes.deadlineAt !== undefined
            && Number.isFinite(Number(opcoes.deadlineAt));
        const deadlineAt = possuiPrazo
            ? Math.min(Number(opcoes.deadlineAt), prazoConfigurado)
            : prazoConfigurado;
        const opcoesComPrazo = { ...opcoes, deadlineAt };
        return this.filaLocal.executar(
            () => this.filaCompartilhada.executar(tarefa, opcoesComPrazo),
            opcoesComPrazo
        );
    }

    status() {
        return {
            tipo: 'composta',
            local: this.filaLocal.status(),
            compartilhada: this.filaCompartilhada.status()
        };
    }
}
const ENTRAR_FILA_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
if redis.call("ZSCORE", KEYS[1], ARGV[4]) then
  redis.call("PEXPIRE", KEYS[1], ARGV[5])
  return 1
end
local tamanho = redis.call("ZCARD", KEYS[1])
if tamanho >= tonumber(ARGV[2]) then return 0 end
redis.call("ZADD", KEYS[1], ARGV[3], ARGV[4])
redis.call("PEXPIRE", KEYS[1], ARGV[5])
return 1
`;

const TENTAR_ADQUIRIR_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[2], "-inf", ARGV[1])
if redis.call("ZSCORE", KEYS[2], ARGV[2]) then
  redis.call("ZADD", KEYS[2], ARGV[4], ARGV[2])
  redis.call("PEXPIRE", KEYS[2], ARGV[5])
  return 1
end
local primeiro = redis.call("ZRANGE", KEYS[1], 0, 0)
if primeiro[1] ~= ARGV[2] then return 0 end
if redis.call("ZCARD", KEYS[2]) >= tonumber(ARGV[3]) then return 0 end
redis.call("ZREM", KEYS[1], ARGV[2])
redis.call("ZADD", KEYS[2], ARGV[4], ARGV[2])
redis.call("PEXPIRE", KEYS[2], ARGV[5])
return 1
`;

const RENOVAR_LEASE_SCRIPT = `
if not redis.call("ZSCORE", KEYS[1], ARGV[1]) then return 0 end
redis.call("ZADD", KEYS[1], ARGV[2], ARGV[1])
redis.call("PEXPIRE", KEYS[1], ARGV[3])
return 1
`;

export class FilaRedisGateway {
    constructor(cliente, {
        prefixo = 'terrazi:bi',
        concorrencia = 8,
        limiteEspera = 100,
        timeoutEsperaMs = 30000,
        intervaloMs = 250,
        intervaloMaxMs = 1500,
        leaseMs = 45000,
        renovacaoMinMs = 1000,
        logger = console,
        random = Math.random
    } = {}) {
        this.cliente = cliente;
        this.chaveFila = `${prefixo}:queue`;
        this.chaveAtivos = `${prefixo}:active`;
        this.concorrencia = concorrencia;
        this.limiteEspera = limiteEspera;
        this.timeoutEsperaMs = timeoutEsperaMs;
        this.intervaloMs = intervaloMs;
        this.intervaloMaxMs = Math.max(intervaloMs, intervaloMaxMs);
        this.leaseMs = leaseMs;
        this.renovacaoMinMs = Math.max(5, renovacaoMinMs);
        this.logger = logger;
        this.random = random;
        this.ultimoAviso = new Map();
    }

    avisar(evento, error, extra = {}) {
        const agora = Date.now();
        const chave = `${evento}:${error?.code || error?.message || 'erro'}`;
        const anterior = this.ultimoAviso.get(chave);
        if (anterior && agora - anterior.ultimo < 10000) {
            anterior.suprimidos += 1;
            return;
        }
        this.ultimoAviso.set(chave, { ultimo: agora, suprimidos: 0 });
        this.logger.warn?.(`[bi-gateway] ${evento}`, {
            ...extra,
            code: error?.code || null,
            causeCode: error?.cause?.code || null,
            attempts: error?.attempts || null,
            redisOperation: error?.redisOperation || null,
            redisHost: error?.redisHost || null,
            durationMs: error?.durationMs ?? null,
            suprimidos: anterior?.suprimidos || 0,
            message: error?.message
        });
    }

    iniciarRenovacaoLease(token, leaseMs) {
        const intervalo = Math.max(this.renovacaoMinMs, Math.min(10000, Math.floor(leaseMs / 3)));
        let ativo = true;
        let renovando = false;
        let renovacaoEmAndamento = Promise.resolve();
        const renovar = async () => {
            if (!ativo || renovando) return;
            renovando = true;
            try {
                const agora = Date.now();
                const renovado = Number(await this.cliente.avaliar(
                    RENOVAR_LEASE_SCRIPT,
                    [this.chaveAtivos],
                    [token, agora + leaseMs, leaseMs * 2]
                )) === 1;
                if (!renovado && ativo) {
                    const error = new Error('Lease Redis nao encontrado durante a renovacao.');
                    error.code = 'BI_REDIS_LEASE_LOST';
                    this.avisar('lease Redis nao foi renovado', error);
                }
            } catch (error) {
                if (ativo) this.avisar('falha ao renovar lease Redis', error);
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

    async executar(tarefa, { leaseMs = this.leaseMs, deadlineAt = null } = {}) {
        const token = crypto.randomUUID();
        const inicio = Date.now();
        const possuiPrazo = deadlineAt !== null
            && deadlineAt !== undefined
            && Number.isFinite(Number(deadlineAt));
        const prazoFinal = possuiPrazo
            ? Math.min(Number(deadlineAt), inicio + this.timeoutEsperaMs)
            : inicio + this.timeoutEsperaMs;
        const prazoRestanteInicialMs = prazoFinal - inicio;
        if (prazoRestanteInicialMs <= 0) {
            throw erroFila('BI_GATEWAY_QUEUE_TIMEOUT', 'Tempo limite aguardando na fila global.');
        }
        const entrou = await this.cliente.avaliar(
            ENTRAR_FILA_SCRIPT,
            [this.chaveFila],
            [
                inicio,
                this.limiteEspera,
                prazoFinal + Math.random(),
                token,
                Math.max(1000, prazoRestanteInicialMs * 3)
            ]
        );
        if (Number(entrou) !== 1) {
            throw erroFila('BI_GATEWAY_QUEUE_FULL', 'Fila global de consultas lotada.');
        }

        let adquirido = false;
        let renovador = null;
        let intervaloAtual = this.intervaloMs;
        try {
            while (Date.now() < prazoFinal) {
                const agora = Date.now();
                adquirido = Number(await this.cliente.avaliar(
                    TENTAR_ADQUIRIR_SCRIPT,
                    [this.chaveFila, this.chaveAtivos],
                    [agora, token, this.concorrencia, agora + leaseMs, leaseMs * 2]
                )) === 1;
                if (adquirido) {
                    renovador = this.iniciarRenovacaoLease(token, leaseMs);
                    return await tarefa();
                }
                const jitter = Math.floor(this.random() * Math.max(1, intervaloAtual * 0.2));
                const esperaMs = Math.min(intervaloAtual + jitter, Math.max(0, prazoFinal - Date.now()));
                if (esperaMs <= 0) break;
                await new Promise(resolve => setTimeout(resolve, esperaMs));
                intervaloAtual = Math.min(this.intervaloMaxMs, Math.ceil(intervaloAtual * 1.7));
            }
            throw erroFila('BI_GATEWAY_QUEUE_TIMEOUT', 'Tempo limite aguardando na fila global.');
        } finally {
            if (renovador) await renovador.parar();
            try {
                await this.cliente.comando('ZREM', adquirido ? this.chaveAtivos : this.chaveFila, token);
            } catch (error) {
                this.avisar('lease Redis sera liberado por expiracao', error, {
                    adquirido,
                    leaseMs
                });
            }
        }
    }

    status() {
        return {
            tipo: 'redis',
            concorrencia: this.concorrencia,
            limiteEspera: this.limiteEspera,
            intervaloMs: this.intervaloMs,
            intervaloMaxMs: this.intervaloMaxMs,
            redis: this.cliente.status?.() || null
        };
    }
}

export function numeroAmbienteGateway(nome, fallback, minimo = 1, maximo = Number.MAX_SAFE_INTEGER) {
    const valor = Number(process.env[nome]);
    if (!Number.isFinite(valor)) return fallback;
    return Math.min(maximo, Math.max(minimo, Math.trunc(valor)));
}
