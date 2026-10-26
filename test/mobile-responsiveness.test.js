import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('auto-filtro esconde resultados da pesquisa sem perder opcoes nao visiveis', async () => {
    const [javascript, css] = await Promise.all([
        readFile(new URL('../public/crm.js', import.meta.url), 'utf8'),
        readFile(new URL('../public/crm-style.css', import.meta.url), 'utf8')
    ]);

    assert.match(javascript, /function normalizarTextoAutoFiltro/);
    assert.match(javascript, /opcao\.hidden = !visivel/);
    assert.match(javascript, /data-table-filter-empty/);
    assert.match(css, /\[data-filter-option\]\[hidden\][^}]*display:\s*none\s*!important/s);
    assert.match(javascript, /if \(!input\.closest\('\[data-filter-option\]'\)\?\.hidden\) input\.checked = event\.target\.checked/);
});

test('crm libera gestos de rolagem no uso normal e captura somente durante edicao', async () => {
    const css = await readFile(new URL('../public/crm-style.css', import.meta.url), 'utf8');
    assert.match(css, /\.crm-dashboard-widget\s*\{[^}]*touch-action:\s*pan-x pan-y/s);
    assert.match(css, /body\.crm-scenario-editing \.crm-dashboard-widget\s*\{[^}]*touch-action:\s*none/s);
    assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
    assert.match(css, /overscroll-behavior:\s*contain/);
});

test('relatorio detalhe usa tela inteira e viewport dinamica no mobile', async () => {
    const [javascript, css] = await Promise.all([
        readFile(new URL('../public/crm.js', import.meta.url), 'utf8'),
        readFile(new URL('../public/crm-style.css', import.meta.url), 'utf8')
    ]);

    assert.match(javascript, /classList\.add\('crm-widget-detail-open'\)/);
    assert.match(javascript, /classList\.remove\('crm-widget-detail-open'\)/);
    assert.match(css, /body\.crm-widget-detail-open\s*\{[^}]*overflow:\s*hidden/s);
    assert.match(css, /\.crm-modal-card\.crm-widget-detail-card\s*\{[^}]*height:\s*100dvh/s);
    assert.match(css, /\.crm-widget-detail-content\s*\{[^}]*flex:\s*1 1 auto/s);
});

test('menu mobile continua acessivel ao entrar em orcamentos', async () => {
    const css = await readFile(new URL('../public/crm-style.css', import.meta.url), 'utf8');

    assert.match(css, /body\.crm-budget-mode \.crm-sidebar\s*\{[^}]*display:\s*flex/s);
    assert.doesNotMatch(css, /body\.crm-budget-mode \.crm-sidebar\s*\{[^}]*display:\s*none/s);
    assert.match(css, /body\.crm-budget-mode \.crm-budget-frame-wrap\s*\{[^}]*height:\s*calc\(100dvh - 62px\)/s);
});

test('cards do dashboard formam uma coluna rolavel no mobile', async () => {
    const css = await readFile(new URL('../public/crm-style.css', import.meta.url), 'utf8');

    assert.match(css, /body:not\(\.crm-scenario-editing\) \.crm-dashboard-canvas\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*min-height:\s*0\s*!important/s);
    assert.match(css, /body:not\(\.crm-scenario-editing\) \.crm-dashboard-widget\s*\{[^}]*position:\s*relative\s*!important[^}]*inset:\s*auto\s*!important[^}]*width:\s*100%\s*!important/s);
    assert.match(css, /\.crm-chart-real canvas[^}]*touch-action:\s*pan-y pinch-zoom\s*!important/s);
    assert.match(css, /\.crm-chart-table-real \*[^}]*touch-action:\s*pan-x pan-y pinch-zoom\s*!important/s);
});
