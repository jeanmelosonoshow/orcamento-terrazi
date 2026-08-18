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

async function carregarConfiguracaoFunil() {
    const fonte = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    const inicio = fonte.indexOf('function normalizarChaveEtapaFunil');
    const fim = fonte.indexOf('function ordenarELimitarTopGrafico', inicio);
    assert.ok(inicio >= 0 && fim > inicio);
    return Function(`${fonte.slice(inicio, fim)}; return { normalizarConfiguracaoFunil, aplicarConfiguracaoFunil };`)();
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
    assert.match(serie.label.formatter({ name: 'Pendente', value: 45, dataIndex: 1 }), /24,6% do total/);
    assert.equal(serie.data.length, 3);
    assert.ok(serie.data.every(item => item.itemStyle.color && item.label.color));
});

test('funil por etapas preserva ordem e calcula conversao sobre a etapa anterior', async () => {
    const renderizadores = await carregarGlobal('../public/assets/charts/chart-renderers.js', 'CRM_CHART_RENDERERS');
    const contexto = criarContexto('funnel');
    contexto.widget.funil = { modo: 'stages' };
    contexto.dados.categorias = ['Criados', 'Em negociacao', 'Gerou venda'];
    contexto.dados.series = [{ nome: 'Orcamentos', formato: 'integer', valores: [100, 60, 15] }];
    const serie = renderizadores.funnel(contexto).series[0];

    assert.equal(serie.sort, 'none');
    assert.match(serie.label.formatter({ name: 'Criados', value: 100, dataIndex: 0 }), /100% etapa inicial/);
    assert.match(serie.label.formatter({ name: 'Em negociacao', value: 60, dataIndex: 1 }), /60% da etapa anterior/);
    assert.match(serie.label.formatter({ name: 'Gerou venda', value: 15, dataIndex: 2 }), /25% da etapa anterior/);
});

test('configuracao das etapas renomeia, reordena e preserva etapa sem movimento', async () => {
    const { aplicarConfiguracaoFunil } = await carregarConfiguracaoFunil();
    const dados = {
        categorias: ['Pendente', 'Venda'],
        dimensoes: [
            { campo: 'STATUS', valor: 'PENDENTE', rotulo: 'Pendente' },
            { campo: 'STATUS', valor: 'VENDA', rotulo: 'Venda' }
        ],
        nomeDimensao: 'Status',
        series: [{ nome: 'Total', valores: [100, 15] }]
    };
    const resultado = aplicarConfiguracaoFunil({
        funil: {
            modo: 'stages',
            etapas: [
                { valor: 'PENDENTE', rotulo: 'Orcamentos criados', ordem: 1 },
                { valor: 'NEGOCIACAO', rotulo: 'Em negociacao', ordem: 2 },
                { valor: 'VENDA', rotulo: 'Gerou venda', ordem: 3 }
            ]
        }
    }, dados);

    assert.deepEqual(resultado.categorias, ['Orcamentos criados', 'Em negociacao', 'Gerou venda']);
    assert.deepEqual(resultado.series[0].valores, [100, 0, 15]);
    assert.equal(resultado.dimensoes[1].valor, 'NEGOCIACAO');
});

test('editor oferece modos exclusivos e configuracao de nome e ordem das etapas', async () => {
    const [html, script] = await Promise.all([
        readFile(new URL('../public/crm.html', import.meta.url), 'utf8'),
        readFile(new URL('../public/crm.js', import.meta.url), 'utf8')
    ]);

    assert.match(html, /data-funnel-mode/);
    assert.match(html, /value="total">Percentual do total/);
    assert.match(html, /value="stages">Conversão por etapas/);
    assert.match(html, /data-funnel-stage-list/);
    assert.match(script, /data-funnel-stage-label/);
    assert.match(script, /data-funnel-stage-order/);
    assert.match(script, /function normalizarConfiguracaoFunil/);
    assert.match(script, /function aplicarConfiguracaoFunil/);
    assert.match(script, /funil: calculado \? normalizarConfiguracaoFunil\(\) : configuracaoFunil/);
});

test('catalogo de icones possui grupos, ids unicos e variedade', async () => {
    const icones = await carregarGlobal('../public/assets/icons/widget-icons.js', 'CRM_WIDGET_ICONS');
    assert.ok(icones.length >= 30);
    assert.equal(new Set(Array.from(icones, icone => icone.id)).size, icones.length);
    assert.ok(new Set(Array.from(icones, icone => icone.grupo)).size >= 5);
    assert.equal(icones[0].id, 'none');
});
