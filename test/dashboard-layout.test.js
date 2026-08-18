import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function carregarLayoutDashboard() {
    const fonte = await readFile(
        new URL('../public/assets/dashboard/dashboard-layout.js', import.meta.url),
        'utf8'
    );
    const sandbox = { window: {} };
    vm.runInNewContext(fonte, sandbox);
    return sandbox.window.CRM_DASHBOARD_LAYOUT;
}

test('widgets antigos ficam visiveis para todas as categorias', async () => {
    const layout = await carregarLayoutDashboard();
    assert.equal(layout.widgetVisivelParaCategoria({}, 'DI'), true);
    assert.equal(layout.widgetVisivelParaCategoria({}, 'VD'), true);
});

test('respeita as categorias permitidas configuradas no widget', async () => {
    const layout = await carregarLayoutDashboard();
    const widget = { categoriasPermitidas: ['DI', 'SU'] };
    assert.equal(layout.widgetVisivelParaCategoria(widget, 'SU'), true);
    assert.equal(layout.widgetVisivelParaCategoria(widget, 'GR'), false);
});

test('expande o card ate o proximo card da mesma faixa vertical', async () => {
    const layout = await carregarLayoutDashboard();
    const ajustados = layout.ajustarLargurasDireita([
        { id: 'a', x: 0, y: 0, w: 300, h: 200 },
        { id: 'b', x: 620, y: 20, w: 260, h: 180 }
    ], 1000);

    assert.equal(ajustados[0].w, 608);
    assert.equal(ajustados[1].w, 368);
});

test('ignora cards abaixo e ocupa o espaco livre ate a borda direita', async () => {
    const layout = await carregarLayoutDashboard();
    const ajustados = layout.ajustarLargurasDireita([
        { id: 'a', x: 100, y: 0, w: 300, h: 180 },
        { id: 'b', x: 500, y: 220, w: 300, h: 180 }
    ], 1000);

    assert.equal(ajustados[0].w, 888);
    assert.equal(ajustados[1].w, 488);
});

test('expande o card para baixo ate o proximo card da mesma faixa horizontal', async () => {
    const layout = await carregarLayoutDashboard();
    const ajustados = layout.ajustarAlturasAbaixo([
        { id: 'a', x: 20, y: 40, w: 300, h: 200 },
        { id: 'b', x: 100, y: 520, w: 260, h: 180 }
    ], 1000);

    assert.equal(ajustados[0].h, 468);
    assert.equal(ajustados[1].h, 468);
});

test('ignora card oculto e ocupa verticalmente o espaco ate o limite do BI', async () => {
    const layout = await carregarLayoutDashboard();
    const visiveis = [
        { id: 'a', x: 20, y: 40, w: 300, h: 200 },
        { id: 'lateral', x: 500, y: 400, w: 260, h: 180 }
    ];
    const ajustados = layout.ajustarAlturasAbaixo(visiveis, 1000);

    assert.equal(ajustados[0].h, 948);
    assert.equal(ajustados[1].h, 588);
});

test('usa a largura expandida para detectar o proximo card abaixo', async () => {
    const layout = await carregarLayoutDashboard();
    const larguras = layout.ajustarLargurasDireita([
        { id: 'a', x: 20, y: 40, w: 260, h: 200 },
        { id: 'b', x: 700, y: 500, w: 260, h: 180 }
    ], 1000);
    const ajustados = layout.ajustarAlturasAbaixo(larguras, 1000);

    assert.equal(larguras[0].w, 968);
    assert.equal(ajustados[0].h, 448);
});


test('a tela integra o seletor de categorias e o modulo responsivo', async () => {
    const [html, javascript] = await Promise.all([
        readFile(new URL('../public/crm.html', import.meta.url), 'utf8'),
        readFile(new URL('../public/crm.js', import.meta.url), 'utf8')
    ]);
    assert.match(html, /data-widget-category-options/);
    assert.ok(html.includes('assets/dashboard/dashboard-layout.js'));
    assert.match(javascript, /categoriasPermitidas/);
    assert.match(javascript, /ajustarLargurasDireita/);
    assert.match(javascript, /ajustarAlturasAbaixo/);
    assert.ok(javascript.includes('todosWidgets.filter(widget => widgetVisivelParaCategoria(widget))'));
    assert.ok(javascript.includes('const layoutsRenderizacao = editorAtivo'));
    assert.ok(javascript.includes(': obterLayoutsRenderizacao(widgets, alturaCanvas)'));
});
