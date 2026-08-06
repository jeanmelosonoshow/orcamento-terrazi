import {
    ClienteRedisRest,
    criarCacheGatewayAmbiente,
    obterCredenciaisRedisAmbiente
} from './bi-gateway-cache.js';
import {
    FilaCompostaGateway,
    FilaLimitadaGateway,
    FilaRedisGateway,
    numeroAmbienteGateway
} from './bi-gateway-queue.js';
import { ServicoBiGateway } from './bi-gateway-service.js';

const SERVICO_LOCAL_KEY = Symbol.for('terrazi.bi.gateway.local');

async function executarConsultaFirebirdDireta(sql, params, opcoes) {
    const { executarConsultaFirebird } = await import('./firebird-client.js');
    return executarConsultaFirebird(sql, params, opcoes);
}

function statusHttpErroFirebirdLocal(error) {
    if (error?.code === 'FB_ACQUIRE_TIMEOUT') return 503;
    if (error?.code === 'FB_CONNECT_TIMEOUT' || error?.code === 'FB_QUERY_TIMEOUT') return 504;
    if (error?.isFirebirdConnectionError) return 503;
    return 500;
}

function criarFilaAmbiente() {
    const concorrenciaGlobal = numeroAmbienteGateway('BI_GATEWAY_CONCURRENCY', 8, 1, 32);
    const tamanhoPool = numeroAmbienteGateway('FB_POOL_SIZE', 3, 1, 10);
    const concorrenciaLocal = numeroAmbienteGateway(
        'BI_GATEWAY_LOCAL_CONCURRENCY',
        Math.min(concorrenciaGlobal, tamanhoPool, 3),
        1,
        tamanhoPool
    );
    const configuracao = {
        concorrencia: concorrenciaGlobal,
        limiteEspera: numeroAmbienteGateway('BI_GATEWAY_QUEUE_LIMIT', 100, 1, 1000),
        timeoutEsperaMs: numeroAmbienteGateway('BI_GATEWAY_QUEUE_TIMEOUT_MS', 30000, 1000, 120000),
        leaseMs: numeroAmbienteGateway('BI_GATEWAY_LEASE_MS', 45000, 5000, 180000),
        prefixo: process.env.BI_GATEWAY_REDIS_PREFIX || 'terrazi:bi'
    };
    const filaLocal = new FilaLimitadaGateway({ ...configuracao, concorrencia: concorrenciaLocal });
    const { url, token } = obterCredenciaisRedisAmbiente();
    if (url && token) {
        const filaCompartilhada = new FilaRedisGateway(new ClienteRedisRest({ url, token }), configuracao);
        return new FilaCompostaGateway(filaLocal, filaCompartilhada);
    }
    return filaLocal;
}

export function criarServicoGatewayAmbiente({ executor = executarConsultaFirebirdDireta, logger = console } = {}) {
    return new ServicoBiGateway({
        executor,
        cache: criarCacheGatewayAmbiente({ logger }),
        fila: criarFilaAmbiente(),
        logger,
        lockMs: numeroAmbienteGateway('BI_GATEWAY_LOCK_MS', 45000, 5000, 180000),
        esperaSingleFlightMs: numeroAmbienteGateway('BI_GATEWAY_SINGLE_FLIGHT_WAIT_MS', 5000, 250, 30000),
        circuitFailureThreshold: numeroAmbienteGateway('BI_GATEWAY_CIRCUIT_FAILURES', 5, 1, 50),
        circuitOpenMs: numeroAmbienteGateway('BI_GATEWAY_CIRCUIT_OPEN_MS', 15000, 1000, 120000)
    });
}

function obterServicoLocal() {
    if (!globalThis[SERVICO_LOCAL_KEY]) {
        globalThis[SERVICO_LOCAL_KEY] = criarServicoGatewayAmbiente();
    }
    return globalThis[SERVICO_LOCAL_KEY];
}

function montarCache(opcoes) {
    return {
        ttlMs: Number(opcoes.cacheTtlMs) || 0,
        staleMs: Number(opcoes.cacheStaleMs) || 0,
        staleWhileRevalidate: opcoes.staleWhileRevalidate !== false
    };
}

function limparOpcoes(opcoes) {
    const resultado = { ...opcoes };
    delete resultado.cacheTtlMs;
    delete resultado.cacheStaleMs;
    delete resultado.staleWhileRevalidate;
    return resultado;
}

async function executarRemoto(url, sql, params, opcoes) {
    const timeoutMs = Math.max(
        5000,
        (Number(opcoes.timeoutMs) || 15000) + numeroAmbienteGateway('BI_GATEWAY_HTTP_MARGIN_MS', 20000, 5000, 60000)
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await fetch(`${String(url).replace(/\/+$/, '')}/v1/query`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.BI_GATEWAY_TOKEN || ''}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sql,
                params,
                opcoes: limparOpcoes(opcoes),
                cache: montarCache(opcoes)
            }),
            signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(payload.details || payload.error || 'Gateway de BI temporariamente indisponivel.');
            error.code = payload.code || 'BI_GATEWAY_ERROR';
            error.status = response.status;
            error.isGatewayError = true;
            throw error;
        }
        return Array.isArray(payload.linhas) ? payload.linhas : [];
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error('Tempo limite ao consultar o Gateway de BI.');
            timeoutError.code = 'BI_GATEWAY_HTTP_TIMEOUT';
            timeoutError.status = 504;
            timeoutError.isGatewayError = true;
            throw timeoutError;
        }
        if (error.isGatewayError) throw error;
        const networkError = new Error('Falha de comunicacao com o Gateway de BI.');
        networkError.code = 'BI_GATEWAY_UNREACHABLE';
        networkError.status = 503;
        networkError.isGatewayError = true;
        networkError.cause = error;
        throw networkError;
    } finally {
        clearTimeout(timeout);
    }
}

export async function executarConsultaFirebirdGateway(sql, params = [], opcoes = {}) {
    const gatewayUrl = String(process.env.BI_GATEWAY_URL || '').trim();
    if (gatewayUrl && !String(process.env.BI_GATEWAY_TOKEN || '').trim()) {
        const error = new Error('BI_GATEWAY_TOKEN nao configurado na aplicacao.');
        error.code = 'BI_GATEWAY_CONFIG_ERROR';
        error.status = 500;
        error.isGatewayError = true;
        throw error;
    }
    if (gatewayUrl) return executarRemoto(gatewayUrl, sql, params, opcoes);

    const resultado = await obterServicoLocal().executar({
        sql,
        params,
        opcoes: limparOpcoes(opcoes),
        cache: montarCache(opcoes)
    });
    return resultado.linhas;
}

export function statusHttpErroConsulta(error) {
    const codigo = String(error?.code || '');
    if (codigo.startsWith('BI_REDIS_')) return 503;
    if (error?.isGatewayError || codigo.startsWith('BI_GATEWAY_')) {
        return Number(error.status) || (error.code === 'BI_GATEWAY_QUEUE_TIMEOUT' ? 504 : 503);
    }
    return statusHttpErroFirebirdLocal(error);
}
