import crypto from 'crypto';
import http from 'http';
import { criarServicoGatewayAmbiente, statusHttpErroConsulta } from '../lib/bi-gateway-client.js';
import { statusHttpErroGateway } from '../lib/bi-gateway-service.js';

const PORTA = Number(process.env.PORT || process.env.BI_GATEWAY_PORT || 8080);
const LIMITE_CORPO = 1024 * 1024;
const GATEWAY_TOKEN = String(process.env.BI_GATEWAY_TOKEN || '');
const VARIAVEIS_OBRIGATORIAS = ['DB_HOST_FB', 'DB_PATH_FB', 'DB_USER_FB', 'DB_PASSWORD_FB'];
const ausentes = VARIAVEIS_OBRIGATORIAS.filter(nome => !String(process.env[nome] || '').trim());
if (!GATEWAY_TOKEN || ausentes.length) {
    const faltantes = [...(!GATEWAY_TOKEN ? ['BI_GATEWAY_TOKEN'] : []), ...ausentes];
    throw new Error(`Gateway sem configuracao obrigatoria: ${faltantes.join(', ')}`);
}
const servico = criarServicoGatewayAmbiente();

function responder(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function tokenValido(req) {
    const esperado = GATEWAY_TOKEN;
    const recebido = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!esperado || !recebido) return false;
    const a = Buffer.from(esperado);
    const b = Buffer.from(recebido);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function lerJson(req) {
    return new Promise((resolve, reject) => {
        const partes = [];
        let tamanho = 0;
        let excedido = false;
        req.on('data', parte => {
            tamanho += parte.length;
            if (!excedido && tamanho > LIMITE_CORPO) {
                const error = new Error('Corpo da requisicao excede 1 MB.');
                error.code = 'BI_GATEWAY_BODY_TOO_LARGE';
                error.status = 413;
                excedido = true;
                reject(error);
                return;
            }
            if (!excedido) partes.push(parte);
        });
        req.on('end', () => {
            if (excedido) return;
            try {
                resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'));
            } catch (error) {
                error.code = 'BI_GATEWAY_INVALID_JSON';
                error.status = 400;
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

function statusErro(error) {
    const statusGateway = statusHttpErroGateway(error);
    return statusGateway !== 500 ? statusGateway : statusHttpErroConsulta(error);
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
        return responder(res, 200, servico.status());
    }
    if (req.method !== 'POST' || req.url !== '/v1/query') {
        return responder(res, 404, { error: 'Rota nao encontrada.' });
    }
    if (!tokenValido(req)) {
        return responder(res, 401, { error: 'Token do Gateway invalido.', code: 'BI_GATEWAY_UNAUTHORIZED' });
    }

    try {
        const requisicao = await lerJson(req);
        const resultado = await servico.executar(requisicao);
        return responder(res, 200, resultado);
    } catch (error) {
        const status = statusErro(error);
        console.error('[bi-gateway] consulta falhou', {
            code: error.code || null,
            status,
            message: error.message
        });
        return responder(res, status, {
            error: status >= 500 ? 'Gateway de BI temporariamente indisponivel.' : error.message,
            details: status < 503 ? error.message : undefined,
            code: error.code || 'BI_GATEWAY_QUERY_ERROR'
        });
    }
});

server.listen(PORTA, '0.0.0.0', () => {
    console.log(`[bi-gateway] ouvindo na porta ${PORTA}`);
});

function encerrar(signal) {
    console.log(`[bi-gateway] encerrando por ${signal}`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
