import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const crmJsUrl = new URL('../public/crm.js', import.meta.url);
const crmHtmlUrl = new URL('../public/crm.html', import.meta.url);

test('catalogo oferece KPI com meta, KPI calculado e papel Meta no bullet', async () => {
    const fonte = await readFile(crmJsUrl, 'utf8');
    assert.ok(fonte.includes("id: 'kpi-target', nome: 'KPI com meta', roles: ['valor', 'meta']"));
    assert.ok(fonte.includes("id: 'kpi-calculated', nome: 'KPI calculado'"));
    assert.ok(fonte.includes("id: 'bullet', nome: 'Meta x realizado', roles: ['dimensao', 'valor', 'meta']"));
    assert.ok(fonte.includes("papel === 'valor' || papel === 'meta'"));
});

test('editor carrega o avaliador e os controles de formula e mascara', async () => {
    const html = await readFile(crmHtmlUrl, 'utf8');
    assert.match(html, /data-kpi-formula/);
    assert.match(html, /data-kpi-reference-list/);
    assert.match(html, /data-kpi-output-format/);
    assert.match(html, /kpi-calculator.js/);
});
