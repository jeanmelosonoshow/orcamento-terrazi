import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    CacheMemoriaGateway,
    CacheResilienteGateway,
    ClienteRedisRest,
    criarChaveConsulta
} from '../lib/bi-gateway-cache.js';
import { FilaLimitadaGateway, FilaRedisGateway } from '../lib/bi-gateway-queue.js';
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

test('rotas Firebird usam o Gateway e o cenario possui cache de painel', async () => {
    const arquivos = await Promise.all([
        readFile(new URL('../api/executar-cenario.js', import.meta.url), 'utf8'),
        readFile(new URL('../api/filiais.js', import.meta.url), 'utf8'),
        readFile(new URL('../api/vendedores.js', import.meta.url), 'utf8'),
        readFile(new URL('../api/login.js', import.meta.url), 'utf8')
    ]);

    assert.ok(arquivos.every(source => source.includes('executarConsultaFirebirdGateway')));
    assert.match(arquivos[0], /BI_DASHBOARD_CACHE_TTL_MS/);
    assert.match(arquivos[0], /BI_DASHBOARD_CACHE_STALE_MS/);
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
test('falha de rede do Gateway nao abre conexao Firebird direta', async () => {
    const urlAnterior = process.env.BI_GATEWAY_URL;
    const tokenAnterior = process.env.BI_GATEWAY_TOKEN;
    process.env.BI_GATEWAY_URL = 'http://127.0.0.1:9';
    process.env.BI_GATEWAY_TOKEN = 'teste';
    try {
        await assert.rejects(
            executarConsultaFirebirdGateway('select 1 from rdb$database', [], { timeoutMs: 1000 }),
            error => error.code === 'BI_GATEWAY_UNREACHABLE' && statusHttpErroConsulta(error) === 503
        );
    } finally {
        if (urlAnterior === undefined) delete process.env.BI_GATEWAY_URL;
        else process.env.BI_GATEWAY_URL = urlAnterior;
        if (tokenAnterior === undefined) delete process.env.BI_GATEWAY_TOKEN;
        else process.env.BI_GATEWAY_TOKEN = tokenAnterior;
    }
});
