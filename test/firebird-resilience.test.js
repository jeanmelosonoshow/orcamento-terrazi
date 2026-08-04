import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const clientPath = new URL('../lib/firebird-client.js', import.meta.url);
const dashboardPath = new URL('../public/crm.js', import.meta.url);

function extrairFuncao(source, nome, proximoMarcador) {
    const indiceFuncao = source.indexOf(`function ${nome}`);
    const inicio = source.slice(Math.max(0, indiceFuncao - 6), indiceFuncao) === 'async '
        ? indiceFuncao - 6
        : indiceFuncao;
    const fim = source.indexOf(proximoMarcador, indiceFuncao);
    assert.ok(indiceFuncao >= 0 && fim > indiceFuncao, `Funcao ${nome} nao encontrada.`);
    return Function(`return (${source.slice(inicio, fim).trim()})`)();
}

test('timeout de login e espera do pool possuem limites independentes', async () => {
    const source = await readFile(clientPath, 'utf8');

    assert.match(source, /FB_CONNECT_TIMEOUT_MS', 10000/);
    assert.match(source, /FB_ACQUIRE_TIMEOUT_MS', 12000/);
    assert.match(source, /error\.code = 'FB_ACQUIRE_TIMEOUT'/);
    assert.match(source, /error\?\.code === 'FB_ACQUIRE_TIMEOUT'\) break/);
});

test('timeout e quebra de socket exigem descarte da conexao', async () => {
    const source = await readFile(clientPath, 'utf8');
    const classificar = extrairFuncao(source, 'erroExigeDescarteConexao', 'function liberarConexao');

    assert.equal(classificar({ code: 'FB_QUERY_TIMEOUT' }), true);
    assert.equal(classificar(new Error('Connection reset by peer')), true);
    assert.equal(classificar(new Error('Dynamic SQL Error')), false);
    assert.match(source, /db\.connection\._pooled = false/);
});

test('atualizacao do painel limita concorrencia e preserva falhas individuais', async () => {
    const source = await readFile(dashboardPath, 'utf8');
    const executar = extrairFuncao(source, 'executarComConcorrenciaLimitada', 'async function aplicarFiltrosDashboard');
    let ativos = 0;
    let maximo = 0;
    const concluidos = [];
    const resultados = await executar([0, 1, 2, 3, 4, 5], 2, async item => {
        ativos += 1;
        maximo = Math.max(maximo, ativos);
        await new Promise(resolve => setTimeout(resolve, 5));
        ativos -= 1;
        if (item === 3) throw new Error('falha esperada');
        return item * 10;
    }, (resultado, item) => concluidos.push({ item, status: resultado.status }));

    assert.equal(maximo, 2);
    assert.equal(concluidos.length, 6);
    assert.equal(resultados[2].value, 20);
    assert.equal(resultados[3].status, 'rejected');
    assert.equal(resultados[5].value, 50);
    assert.match(source, /DASHBOARD_QUERY_CONCURRENCY = 3/);
});
