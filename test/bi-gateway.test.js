import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
    CacheMemoriaGateway,
    CacheResilienteGateway,
    ClienteRedisRest,
    criarChaveConsulta,
    obterCredenciaisRedisAmbiente
} from '../lib/bi-gateway-cache.js';
import { FilaCompostaGateway, FilaLimitadaGateway, FilaRedisGateway } from '../lib/bi-gateway-queue.js';
import { ServicoBiGateway } from '../lib/bi-gateway-service.js';
import { executarConsultaFirebirdGateway, statusHttpErroConsulta } from '../lib/bi-gateway-client.js';

function aguardar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function criarServico(executor, opcoes = {}) {
    const agora = opcoes.agora || (() => Date.now());
    return new ServicoBiGateway({
        executor,
        cache: new CacheResilienteGateway({
            local: new CacheMemoriaGateway({ agora }),
            logger: { warn() {} }
        }),
        fila: opcoes.fila || new FilaLimitadaGateway({ concorrencia: 2, limiteEspera: 10 }),
        agora,
        logger: { warn() {}, error() {} },
        circuitFailureThreshold: opcoes.circuitFailureThreshold,
        circuitOpenMs: opcoes.circuitOpenMs
    });
}

test('chave de cache considera SQL, parametros e opcoes relevantes', () => {
    const a = criarChaveConsulta({ sql: 'select ?', params: ['01'], opcoes: { limite: 10 } });
    const b = criarChaveConsulta({ opcoes: { limite: 10 }, params: ['01'], sql: 'select ?' });
    const c = criarChaveConsulta({ sql: 'select ?', params: ['02'], opcoes: { limite: 10 } });

    assert.equal(a, b);
    assert.notEqual(a, c);
});

test('single-flight executa consultas identicas simultaneas apenas uma vez', async () => {
    let execucoes = 0;
    const servico = criarServico(async () => {
        execucoes += 1;
        await aguardar(20);
        return [{ TOTAL: 10 }];
    });
    const requisicao = { sql: 'select total from vendas', cache: { ttlMs: 1000, staleMs: 1000 } };

    const resultados = await Promise.all(Array.from({ length: 20 }, () => servico.executar(requisicao)));

    assert.equal(execucoes, 1);
    assert.ok(resultados.every(resultado => resultado.linhas[0].TOTAL === 10));
});

test('cache fresco evita nova consulta ao Firebird', async () => {
    let execucoes = 0;
    const servico = criarServico(async () => [{ EXECUCAO: ++execucoes }]);
    const requisicao = { sql: 'select 1 from rdb$database', cache: { ttlMs: 1000, staleMs: 1000 } };

    const primeiro = await servico.executar(requisicao);
    const segundo = await servico.executar(requisicao);

    assert.equal(primeiro.meta.cache, 'MISS');
    assert.equal(segundo.meta.cache, 'HIT');
    assert.equal(segundo.linhas[0].EXECUCAO, 1);
    assert.equal(execucoes, 1);
});

test('fila limita concorrencia e preserva ordem de chegada', async () => {
    const fila = new FilaLimitadaGateway({ concorrencia: 2, limiteEspera: 10 });
    let ativos = 0;
    let maximo = 0;
    const concluidos = [];

    const resultados = await Promise.all(Array.from({ length: 8 }, (_, indice) => fila.executar(async () => {
        ativos += 1;
        maximo = Math.max(maximo, ativos);
        await aguardar(5);
        concluidos.push(indice);
        ativos -= 1;
        return indice;
    })));

    assert.equal(maximo, 2);
    assert.deepEqual(resultados, [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(concluidos, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('fila composta respeita a capacidade local antes da vaga global', async () => {
    const local = new FilaLimitadaGateway({ concorrencia: 2, limiteEspera: 10 });
    const compartilhada = {
        executar(tarefa) { return tarefa(); },
        status() { return { tipo: 'compartilhada-teste' }; }
    };
    const fila = new FilaCompostaGateway(local, compartilhada);
    let ativos = 0;
    let maximo = 0;

    await Promise.all(Array.from({ length: 8 }, () => fila.executar(async () => {
        ativos += 1;
        maximo = Math.max(maximo, ativos);
        await aguardar(5);
        ativos -= 1;
    })));

    assert.equal(maximo, 2);
    assert.equal(fila.status().tipo, 'composta');
    assert.equal(fila.status().local.concorrencia, 2);
});
test('fila rejeita excedente sem abrir mais execucoes', async () => {
    const fila = new FilaLimitadaGateway({ concorrencia: 1, limiteEspera: 1, timeoutEsperaMs: 1000 });
    let liberar;
    const bloqueio = new Promise(resolve => { liberar = resolve; });
    const primeira = fila.executar(() => bloqueio);
    const segunda = fila.executar(async () => 2);

    await assert.rejects(
        fila.executar(async () => 3),
        error => error.code === 'BI_GATEWAY_QUEUE_FULL'
    );
    liberar(1);
    assert.deepEqual(await Promise.all([primeira, segunda]), [1, 2]);
});

test('ultimo resultado valido e devolvido quando a atualizacao falha', async () => {
    let agora = 1000;
    let falhar = false;
    const servico = criarServico(async () => {
        if (falhar) {
            const error = new Error('Firebird indisponivel');
            error.code = 'FB_CONNECT_TIMEOUT';
            throw error;
        }
        return [{ TOTAL: 99 }];
    }, { agora: () => agora });
    const base = { sql: 'select sum(valor) total from vendas' };

    await servico.executar({ ...base, cache: { ttlMs: 100, staleMs: 1000 } });
    agora = 1200;
    falhar = true;
    const contingencia = await servico.executar({
        ...base,
        cache: { ttlMs: 100, staleMs: 1000, staleWhileRevalidate: false }
    });

    assert.equal(contingencia.meta.cache, 'STALE_IF_ERROR');
    assert.equal(contingencia.meta.contingencia, true);
    assert.equal(contingencia.meta.erroOriginal, 'FB_CONNECT_TIMEOUT');
    assert.equal(contingencia.linhas[0].TOTAL, 99);
});

test('cliente Redis REST envia comandos sem dependencia adicional', async () => {
    let requisicao;
    const cliente = new ClienteRedisRest({
        url: 'https://redis.example',
        token: 'segredo',
        fetchImpl: async (url, opcoes) => {
            requisicao = { url, opcoes };
            return { ok: true, json: async () => ({ result: 'OK' }) };
        }
    });

    assert.equal(await cliente.comando('SET', 'chave', 'valor'), 'OK');
    assert.equal(requisicao.url, 'https://redis.example');
    assert.equal(requisicao.opcoes.headers.Authorization, 'Bearer segredo');
    assert.deepEqual(JSON.parse(requisicao.opcoes.body), ['SET', 'chave', 'valor']);
});

test('distingue token invalido e permissao ACL negada no Redis', async () => {
    for (const resposta of [
        { ok: false, status: 401, payload: { error: 'WRONGPASS invalid token' } },
        { ok: true, status: 200, payload: { error: 'NOPERM user has no permissions' } }
    ]) {
        const cliente = new ClienteRedisRest({
            url: 'https://redis.example',
            token: 'restrito',
            fetchImpl: async () => ({
                ok: resposta.ok,
                status: resposta.status,
                json: async () => resposta.payload
            })
        });
        await assert.rejects(
            cliente.comando('GET', 'terrazi:bi:teste'),
            error => error.code === 'BI_REDIS_AUTH_ERROR'
        );
    }
});

test('aceita credenciais REST da integracao Vercel KV', () => {
    assert.deepEqual(obterCredenciaisRedisAmbiente({
        KV_REST_API_URL: 'https://kv.example',
        KV_REST_API_TOKEN: 'token-kv'
    }), { url: 'https://kv.example', token: 'token-kv' });

    assert.deepEqual(obterCredenciaisRedisAmbiente({
        UPSTASH_REDIS_REST_URL: 'https://upstash.example',
        UPSTASH_REDIS_REST_TOKEN: 'token-upstash',
        KV_REST_API_URL: 'https://kv.example',
        KV_REST_API_TOKEN: 'token-kv'
    }), { url: 'https://upstash.example', token: 'token-upstash' });

    assert.deepEqual(obterCredenciaisRedisAmbiente({
        UPSTASH_REDIS_REST_TOKEN: 'token-incompleto',
        KV_REST_API_URL: 'https://kv.example',
        KV_REST_API_TOKEN: 'token-kv'
    }), { url: 'https://kv.example', token: 'token-kv' });
});

test('rotas Firebird usam o Gateway e o cenario possui cache de painel', async () => {
    const arquivos = await Promise.all([
        readFile(new URL('../api/executar-cenario.js', import.meta.url), 'utf8'),
        readFile(new URL('../api/filiais.js', import.meta.url), 'utf8'),
        readFile(new URL('../api/vendedores.js', import.meta.url), 'utf8'),
        readFile(new URL('../api/login.js', import.meta.url), 'utf8')
    ]);

    assert.ok(arquivos.every(source => source.includes('executarConsultaFirebirdGateway')));
    assert.ok(arquivos[0].includes('BI_DASHBOARD_CACHE_TTL_MS || 300000'));
    assert.match(arquivos[0], /BI_DASHBOARD_CACHE_STALE_MS/);
    assert.match(arquivos[0], /Redis\/Upstash recusou o token ou as permissoes ACL/);
    assert.match(arquivos[0], /code: codigo/);
});
test('fila Redis adquire e libera lease compartilhado', async () => {
    const chamadas = [];
    const cliente = {
        async avaliar(script, chaves, argumentos) {
            chamadas.push({ tipo: 'eval', chaves, argumentos });
            return 1;
        },
        async comando(...argumentos) {
            chamadas.push({ tipo: 'comando', argumentos });
            return 1;
        }
    };
    const fila = new FilaRedisGateway(cliente, {
        concorrencia: 8,
        limiteEspera: 100,
        timeoutEsperaMs: 1000,
        intervaloMs: 1
    });

    assert.equal(await fila.executar(async () => 42), 42);
    assert.equal(chamadas.filter(chamada => chamada.tipo === 'eval').length, 2);
    assert.equal(chamadas.at(-1).argumentos[0], 'ZREM');
});

test('fila Redis rejeita imediatamente quando o limite global foi atingido', async () => {
    const cliente = {
        async avaliar() { return 0; },
        async comando() { return 1; }
    };
    const fila = new FilaRedisGateway(cliente, { timeoutEsperaMs: 1000 });

    await assert.rejects(
        fila.executar(async () => 1),
        error => error.code === 'BI_GATEWAY_QUEUE_FULL'
    );
});
test('circuit breaker interrompe repeticao de falhas e permite recuperacao', async () => {
    let agora = 1000;
    let falhar = true;
    let execucoes = 0;
    const servico = criarServico(async () => {
        execucoes += 1;
        if (falhar) {
            const error = new Error('timeout de login');
            error.code = 'FB_CONNECT_TIMEOUT';
            throw error;
        }
        return [{ OK: 1 }];
    }, {
        agora: () => agora,
        circuitFailureThreshold: 2,
        circuitOpenMs: 1000
    });
    const requisicao = { sql: 'select 1 from rdb$database' };

    await assert.rejects(servico.executar(requisicao), error => error.code === 'FB_CONNECT_TIMEOUT');
    await assert.rejects(servico.executar(requisicao), error => error.code === 'FB_CONNECT_TIMEOUT');
    await assert.rejects(servico.executar(requisicao), error => error.code === 'BI_GATEWAY_CIRCUIT_OPEN');
    assert.equal(execucoes, 2);
    assert.equal(servico.status().circuito.estado, 'aberto');

    agora = 2001;
    falhar = false;
    const recuperado = await servico.executar(requisicao);
    assert.equal(recuperado.linhas[0].OK, 1);
    assert.equal(servico.status().circuito.estado, 'fechado');
});
test('saturacao do pool e timeout de consulta nao abrem o circuit breaker', async () => {
    for (const codigo of ['FB_ACQUIRE_TIMEOUT', 'FB_QUERY_TIMEOUT']) {
        let execucoes = 0;
        const servico = criarServico(async () => {
            execucoes += 1;
            const error = new Error('capacidade temporariamente ocupada');
            error.code = codigo;
            error.isFirebirdConnectionError = codigo === 'FB_ACQUIRE_TIMEOUT';
            throw error;
        }, { circuitFailureThreshold: 2, circuitOpenMs: 1000 });
        const requisicao = { sql: 'select 1 from rdb$database' };

        await assert.rejects(servico.executar(requisicao), error => error.code === codigo);
        await assert.rejects(servico.executar(requisicao), error => error.code === codigo);
        await assert.rejects(servico.executar(requisicao), error => error.code === codigo);
        assert.equal(execucoes, 3);
        assert.equal(servico.status().circuito.estado, 'fechado');
    }
});
test('Gateway remoto assina a consulta com HMAC e preserva o formato de linhas', async () => {
    const ambienteAnterior = salvarAmbienteGateway();
    const fetchAnterior = globalThis.fetch;
    const secret = 'segredo-de-teste';
    let chamada;
    process.env.FIREBIRD_GATEWAY_URL = 'https://gateway.test';
    process.env.FIREBIRD_GATEWAY_TOKEN_ID = 'ssg_teste';
    process.env.FIREBIRD_GATEWAY_HMAC_SECRET = secret;
    globalThis.fetch = async (url, options) => {
        chamada = { url: String(url), options };
        return new Response(JSON.stringify({
            success: true,
            rows: [{ OK: 1 }, { OK: 2 }],
            row_count: 2,
            truncated: false
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
        const linhas = await executarConsultaFirebirdGateway('select ? from rdb$database', [1], {
            timeoutMs: 1000,
            limite: 1
        });
        assert.deepEqual(linhas, [{ OK: 1 }]);
        assert.equal(chamada.url, 'https://gateway.test/query');
        assert.equal(chamada.options.headers.Authorization, 'Bearer ssg_teste');
        assert.deepEqual(JSON.parse(chamada.options.body), {
            sql: 'select ? from rdb$database',
            params: [1]
        });
        const bodyHash = crypto.createHash('sha256').update(chamada.options.body, 'utf8').digest('hex');
        const canonical = [
            chamada.options.headers['X-Timestamp'],
            chamada.options.headers['X-Nonce'],
            'POST',
            '/query',
            bodyHash
        ].join('\n');
        const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
        assert.equal(chamada.options.headers['X-Signature'], expected);
    } finally {
        globalThis.fetch = fetchAnterior;
        restaurarAmbienteGateway(ambienteAnterior);
    }
});

test('Gateway remoto envia somente as GTTs confirmadas no corpo assinado', async () => {
    const ambienteAnterior = salvarAmbienteGateway();
    const fetchAnterior = globalThis.fetch;
    let corpo;
    process.env.FIREBIRD_GATEWAY_URL = 'https://gateway.test';
    process.env.FIREBIRD_GATEWAY_TOKEN_ID = 'ssg_teste';
    process.env.FIREBIRD_GATEWAY_HMAC_SECRET = 'segredo-de-teste';
    globalThis.fetch = async (_url, options) => {
        corpo = JSON.parse(options.body);
        return new Response(JSON.stringify({ success: true, rows: [], row_count: 0, truncated: false }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };
    try {
        await executarConsultaFirebirdGateway(
            `EXECUTE BLOCK RETURNS (N INT) AS BEGIN
                DELETE FROM GTT_CRM_CLIENTES;
                INSERT INTO GTT_CRM_CLIENTES (DOCUMENTO) SELECT '1' FROM RDB$DATABASE;
                N = 1;
                SUSPEND;
            END`,
            [],
            { tabelasTemporarias: ['GTT_CRM_CLIENTES'] }
        );
        assert.deepEqual(corpo.temporary_tables, ['GTT_CRM_CLIENTES']);
    } finally {
        globalThis.fetch = fetchAnterior;
        restaurarAmbienteGateway(ambienteAnterior);
    }
});

test('falha de rede do Gateway nao abre conexao Firebird direta', async () => {
    const ambienteAnterior = salvarAmbienteGateway();
    const fetchAnterior = globalThis.fetch;
    process.env.FIREBIRD_GATEWAY_URL = 'https://gateway.test';
    process.env.FIREBIRD_GATEWAY_TOKEN_ID = 'ssg_teste';
    process.env.FIREBIRD_GATEWAY_HMAC_SECRET = 'segredo-de-teste';
    globalThis.fetch = async () => { throw new Error('rede indisponivel'); };
    try {
        await assert.rejects(
            executarConsultaFirebirdGateway('select 1 from rdb$database', [], { timeoutMs: 1000 }),
            error => error.code === 'BI_GATEWAY_UNREACHABLE' && statusHttpErroConsulta(error) === 503
        );
    } finally {
        globalThis.fetch = fetchAnterior;
        restaurarAmbienteGateway(ambienteAnterior);
    }
});

test('credencial recusada pelo Gateway vira erro de integracao, nao login invalido', async () => {
    const ambienteAnterior = salvarAmbienteGateway();
    const fetchAnterior = globalThis.fetch;
    process.env.FIREBIRD_GATEWAY_URL = 'https://gateway.test';
    process.env.FIREBIRD_GATEWAY_TOKEN_ID = 'ssg_invalido';
    process.env.FIREBIRD_GATEWAY_HMAC_SECRET = 'segredo-incorreto';
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
    });
    try {
        await assert.rejects(
            executarConsultaFirebirdGateway('select 401 from rdb$database'),
            error => error.code === 'BI_GATEWAY_UNAUTHORIZED'
                && error.gatewayStatus === 401
                && statusHttpErroConsulta(error) === 502
        );
    } finally {
        globalThis.fetch = fetchAnterior;
        restaurarAmbienteGateway(ambienteAnterior);
    }
});

function salvarAmbienteGateway() {
    return Object.fromEntries([
        'FIREBIRD_GATEWAY_URL',
        'FIREBIRD_GATEWAY_TOKEN_ID',
        'FIREBIRD_GATEWAY_HMAC_SECRET'
    ].map(nome => [nome, process.env[nome]]));
}

function restaurarAmbienteGateway(anterior) {
    for (const [nome, valor] of Object.entries(anterior)) {
        if (valor === undefined) delete process.env[nome];
        else process.env[nome] = valor;
    }
}

test('Gateway rejeita nomes de GTT manipulados antes de executar SQL', async () => {
    let executou = false;
    const servico = criarServico(async () => {
        executou = true;
        return [];
    });

    await assert.rejects(
        servico.executar({
            sql: 'EXECUTE BLOCK AS BEGIN END',
            opcoes: { tabelasTemporarias: ['GTT_OK; DROP TABLE CLIENTE'] }
        }),
        error => error.code === 'BI_GATEWAY_INVALID_GTT' && error.status === 400
    );
    assert.equal(executou, false);
});
