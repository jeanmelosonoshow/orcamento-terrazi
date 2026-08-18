import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function carregarGlobal(caminho, propriedade) {
    const fonte = await readFile(new URL(caminho, import.meta.url), 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(fonte, sandbox);
    return sandbox.window[propriedade];
}

function criarContexto(tipo = 'bar') {
    return {
        widget: { tipo },
        dados: {
            categorias: ['1', '2', '3', '4', '5', '6'],
            nomeDimensao: 'Periodo',
            series: [
                { nome: 'Realizado', formato: 'decimal', valores: [42, 68, 54, 84, 63, 76] },
                { nome: 'Meta', formato: 'decimal', valores: [50, 60, 62, 72, 70, 82] }
            ]
        },
        container: { clientWidth: 520, clientHeight: 300 },
        base: { tooltip: {}, legend: {}, grid: {} },
        paleta: ['#123865', '#1E65A7', '#43A6C6', '#8BD3DD', '#B8563F'],
        textoGrafico: '#17304A',
        compacto: false,
        muitasCategorias: false,
        formatar: valor => String(valor),
        converterNumero: Number
    };
}

test('cada modelo especializado gera uma estrutura visual propria', async () => {
    const renderizadores = await carregarGlobal('../public/assets/charts/chart-renderers.js', 'CRM_CHART_RENDERERS');
    const expectativas = {
        heatmap: ['heatmap'],
        cohort: ['heatmap'],
        scatter: ['scatter', 'scatter'],
        bubble: ['scatter'],
        waterfall: ['bar', 'bar', 'bar'],
        histogram: ['bar'],
        bullet: ['bar', 'scatter'],
        ranking: ['bar', 'bar'],
        sparkline: ['line', 'line'],
        funnel: ['funnel'],
        calendar: ['heatmap']
    };

    for (const [tipo, seriesEsperadas] of Object.entries(expectativas)) {
        const contexto = criarContexto(tipo);
        if (tipo === 'calendar') contexto.dados.categorias = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06'];
        const opcao = renderizadores[tipo](contexto);
        assert.deepEqual(Array.from(opcao.series, serie => serie.type), seriesEsperadas, tipo);
    }
});

test('funil mantem etapas legiveis e informa valor e participacao', async () => {
    const renderizadores = await carregarGlobal('../public/assets/charts/chart-renderers.js', 'CRM_CHART_RENDERERS');
    const contexto = criarContexto('funnel');
    contexto.dados.categorias = ['Expirado', 'Pendente', 'Gerou venda'];
    contexto.dados.series = [{ nome: 'Orcamentos', formato: 'integer', valores: [120, 45, 18] }];
    const opcao = renderizadores.funnel(contexto);
    const serie = opcao.series[0];

    assert.equal(serie.minSize, '34%');
    assert.equal(serie.maxSize, '98%');
    assert.equal(serie.label.position, 'inside');
    assert.equal(serie.labelLine.show, false);
    assert.match(serie.label.formatter({ name: 'Pendente', value: 45 }), /45/);
    assert.match(serie.label.formatter({ name: 'Pendente', value: 45 }), /37,5% da maior etapa/);
    assert.equal(serie.data.length, 3);
    assert.ok(serie.data.every(item => item.itemStyle.color && item.label.color));
});

test('catalogo de icones possui grupos, ids unicos e variedade', async () => {
    const icones = await carregarGlobal('../public/assets/icons/widget-icons.js', 'CRM_WIDGET_ICONS');
    assert.ok(icones.length >= 30);
    assert.equal(new Set(Array.from(icones, icone => icone.id)).size, icones.length);
    assert.ok(new Set(Array.from(icones, icone => icone.grupo)).size >= 5);
    assert.equal(icones[0].id, 'none');
});
