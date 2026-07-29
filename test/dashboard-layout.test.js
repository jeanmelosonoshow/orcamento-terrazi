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


test('a tela integra o seletor de categorias e o modulo responsivo', async () => {
    const [html, javascript] = await Promise.all([
        readFile(new URL('../public/crm.html', import.meta.url), 'utf8'),
        readFile(new URL('../public/crm.js', import.meta.url), 'utf8')
    ]);
    assert.match(html, /data-widget-category-options/);
    assert.ok(html.includes('assets/dashboard/dashboard-layout.js'));
    assert.match(javascript, /categoriasPermitidas/);
    assert.match(javascript, /ajustarLargurasDireita/);
    assert.ok(javascript.includes('todosWidgets.filter(widget => widgetVisivelParaCategoria(widget))'));
});
