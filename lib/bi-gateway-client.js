import crypto from 'node:crypto';
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
const SERVICO_REMOTO_KEY = Symbol.for('terrazi.bi.gateway.remote.hmac');

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

function obterServicoRemoto() {
    if (!globalThis[SERVICO_REMOTO_KEY]) {
        globalThis[SERVICO_REMOTO_KEY] = criarServicoGatewayAmbiente({ executor: executarRemoto });
    }
    return globalThis[SERVICO_REMOTO_KEY];
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

function configuracaoGatewayRemoto() {
    return {
        url: String(process.env.FIREBIRD_GATEWAY_URL || '').trim().replace(/\/+$/, ''),
        tokenId: String(process.env.FIREBIRD_GATEWAY_TOKEN_ID || '').trim(),
        secret: String(process.env.FIREBIRD_GATEWAY_HMAC_SECRET || '').trim()
    };
}

function erroConfiguracaoGateway(mensagem) {
    const error = new Error(mensagem);
    error.code = 'BI_GATEWAY_CONFIG_ERROR';
    error.status = 500;
    error.isGatewayError = true;
    return error;
}

async function executarRemoto(sql, params, opcoes) {
    const { url, tokenId, secret } = configuracaoGatewayRemoto();
    if (!url || !tokenId || !secret) {
        throw erroConfiguracaoGateway(
            'FIREBIRD_GATEWAY_URL, FIREBIRD_GATEWAY_TOKEN_ID e FIREBIRD_GATEWAY_HMAC_SECRET sao obrigatorios.'
        );
    }
    const timeoutMs = Math.max(
        5000,
        (Number(opcoes.timeoutMs) || 15000) + numeroAmbienteGateway('BI_GATEWAY_HTTP_MARGIN_MS', 20000, 5000, 60000)
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const path = '/query';
    const tabelasTemporarias = Array.isArray(opcoes.tabelasTemporarias)
        ? opcoes.tabelasTemporarias
        : [];
    const body = JSON.stringify({
        sql,
        params,
        ...(tabelasTemporarias.length ? { temporary_tables: tabelasTemporarias } : {})
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const bodyHash = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
    const canonical = [timestamp, nonce, 'POST', path, bodyHash].join('\n');
    const signature = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
    let response;
    try {
        response = await fetch(`${url}${path}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${tokenId}`,
                'Content-Type': 'application/json',
                'X-Timestamp': timestamp,
                'X-Nonce': nonce,
                'X-Signature': signature
            },
            body,
            signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(payload.detail || payload.error || 'Gateway Firebird temporariamente indisponivel.');
            error.code = `BI_GATEWAY_${String(payload.error || response.status).toUpperCase()}`;
            error.status = response.status;
            error.isGatewayError = true;
            error.isFirebirdConnectionError = response.status === 503 || response.status === 504;
            throw error;
        }
        if (payload.success !== true || !Array.isArray(payload.rows)) {
            const error = new Error('Resposta invalida do Gateway Firebird.');
            error.code = 'BI_GATEWAY_INVALID_RESPONSE';
            error.status = 502;
            error.isGatewayError = true;
            error.isFirebirdConnectionError = true;
            throw error;
        }
        return Number.isFinite(opcoes.limite)
            ? payload.rows.slice(0, Math.max(0, Number(opcoes.limite)))
            : payload.rows;
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error('Tempo limite ao consultar o Gateway de BI.');
            timeoutError.code = 'BI_GATEWAY_HTTP_TIMEOUT';
            timeoutError.status = 504;
            timeoutError.isGatewayError = true;
            timeoutError.isFirebirdConnectionError = true;
            throw timeoutError;
        }
        if (error.isGatewayError) throw error;
        const networkError = new Error('Falha de comunicacao com o Gateway de BI.');
        networkError.code = 'BI_GATEWAY_UNREACHABLE';
        networkError.status = 503;
        networkError.isGatewayError = true;
        networkError.isFirebirdConnectionError = true;
        networkError.cause = error;
        throw networkError;
    } finally {
        clearTimeout(timeout);
    }
}

export async function executarConsultaFirebirdGateway(sql, params = [], opcoes = {}) {
    const remoto = configuracaoGatewayRemoto();
    if (remoto.url || remoto.tokenId || remoto.secret) {
        if (!remoto.url || !remoto.tokenId || !remoto.secret) {
            throw erroConfiguracaoGateway('Configuracao HMAC do Gateway Firebird esta incompleta.');
        }
        const resultado = await obterServicoRemoto().executar({
            sql,
            params,
            opcoes: limparOpcoes(opcoes),
            cache: montarCache(opcoes)
        });
        return resultado.linhas;
    }

    if (process.env.VERCEL_ENV) {
        throw erroConfiguracaoGateway('Gateway Firebird nao configurado na Vercel; conexao direta foi desativada.');
    }

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
