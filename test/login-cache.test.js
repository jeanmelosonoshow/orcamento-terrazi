import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

const redis = new Map();
const originalFetch = globalThis.fetch;
let loginHandler;
let setUserLoginCache;

before(async () => {
    globalThis.fetch = async (_url, options) => {
        const command = JSON.parse(options.body);
        if (command[0] === 'GET') {
            return jsonResponse({ result: redis.get(command[1]) ?? null });
        }
        if (command[0] === 'SET') {
            redis.set(command[1], command[2]);
            return jsonResponse({ result: 'OK' });
        }
        return jsonResponse({ error: 'Comando não suportado' }, 400);
    };

    process.env.KV_REST_API_URL = 'https://redis.test';
    process.env.KV_REST_API_TOKEN = 'token-de-teste';
    process.env.FIREBIRD_CONNECTION_MODE = 'redis-only';

    ({ setUserLoginCache } = await import('../lib/firebird-login.js'));
    ({ default: loginHandler } = await import('../api/login.js'));
});

after(() => {
    globalThis.fetch = originalFetch;
});

test('autentica pelo Redis sem carregar conexão Firebird', async () => {
    await setUserLoginCache(
        'usuario.teste',
        'e10adc3949ba59abbe56e057f20f883e',
        {
            idfuncionario: 'fun01',
            nomefuncionario: 'Funcionário Teste',
            categoria: 'vd',
            idfilial: '01',
        },
    );

    const result = await invokeLogin({ usuario: 'USUARIO.TESTE', senha: '123456' });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, {
        autorizado: true,
        idfuncionario: 'FUN01',
        nomefuncionario: 'Funcionário Teste',
        categoria: 'VD',
        idfilial: '01',
    });
});

test('rejeita senha incorreta', async () => {
    const result = await invokeLogin({ usuario: 'usuario.teste', senha: 'errada' });
    assert.equal(result.statusCode, 401);
    assert.equal(result.body.autorizado, false);
});

test('usa a cópia stale quando o cache principal expirou', async () => {
    for (const key of [...redis.keys()]) {
        if (!key.endsWith(':stale')) redis.delete(key);
    }

    const result = await invokeLogin({ usuario: 'Usuario.Teste', senha: '123456' });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.idfuncionario, 'FUN01');
});

async function invokeLogin(body) {
    const result = { statusCode: null, body: null, headers: {} };
    const response = {
        setHeader(name, value) { result.headers[name] = value; },
        status(statusCode) { result.statusCode = statusCode; return this; },
        json(payload) { result.body = payload; return this; },
        end() { return this; },
    };
    await loginHandler({ method: 'POST', body }, response);
    return result;
}

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
