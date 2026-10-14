import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function carregarCompatibilidade() {
    const fonte = await readFile(new URL('../public/assets/charts/powerbi-compat.js', import.meta.url), 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(fonte, sandbox);
    return sandbox.window.CRM_POWERBI_COMPAT;
}

test('camada Power BI mapeia os visuais sem alterar dados e consultas', async () => {
    const compatibilidade = await carregarCompatibilidade();
    const opcao = {
        xAxis: { type: 'category', data: ['A', 'B'] },
        yAxis: { type: 'value' },
        series: [{ name: 'Total', type: 'bar', data: [10, 20] }],
        tooltip: {},
        legend: { show: true }
    };
    const original = JSON.stringify(opcao);
    const resultado = compatibilidade.aplicar(opcao, { tipo: 'bar', escuro: false });

    assert.equal(JSON.stringify(opcao), original);
    assert.deepEqual(Array.from(resultado.series[0].data), [10, 20]);
    assert.equal(resultado.series[0].type, 'bar');
    assert.equal(resultado.textStyle.fontFamily, 'Segoe UI, Inter, Arial, sans-serif');
    assert.equal(compatibilidade.obterEquivalente('bar'), 'clustered-column-chart');
    assert.equal(compatibilidade.obterEquivalente('pivot'), 'matrix');
    assert.equal(compatibilidade.obterEquivalente('waterfall'), 'waterfall-chart');
});

test('migracao inicia somente na Visao Geral e permite retorno por card', async () => {
    const [html, script] = await Promise.all([
        readFile(new URL('../public/crm.html', import.meta.url), 'utf8'),
        readFile(new URL('../public/crm.js', import.meta.url), 'utf8')
    ]);

    assert.match(html, /powerbi-compat\.js\?v=crm-20261014-powerbi-1/);
    assert.match(html, /data-widget-visual-engine/);
    assert.match(html, /value="powerbi-v1">Power BI compativel/);
    assert.match(html, /value="classic">Classico/);
    assert.match(script, /return contexto === 'visao-geral' \? 'powerbi-v1' : 'classic'/);
    assert.match(script, /data-visual-engine=/);
    assert.match(script, /window\.CRM_POWERBI_COMPAT\.aplicar/);
});
