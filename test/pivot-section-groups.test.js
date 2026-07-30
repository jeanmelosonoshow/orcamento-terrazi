import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const htmlPath = new URL('../public/crm.html', import.meta.url);
const scriptPath = new URL('../public/crm.js', import.meta.url);
const stylePath = new URL('../public/crm-style.css', import.meta.url);

test('editor da tabela dinamica permite varios agrupamentos e subtotais por nivel', async () => {
    const [html, script] = await Promise.all([
        readFile(htmlPath, 'utf8'),
        readFile(scriptPath, 'utf8')
    ]);

    assert.match(html, /data-group-options/);
    assert.match(script, /data-group-field/);
    assert.match(script, /agrupamentos: Array\.isArray\(atual\.agrupamentos\)/);
    assert.match(script, /Subtotais dos agrupamentos/);
});

test('renderizador cria secoes, cabecalhos repetidos, subtotais e total geral', async () => {
    const script = await readFile(scriptPath, 'utf8');

    assert.match(script, /renderizarAgrupamentos/);
    assert.match(script, /crm-pivot-group-band/);
    assert.match(script, /crm-pivot-group-columns/);
    assert.match(script, /configuracao\.subtotais\.includes\(String\(campo\.coluna\)\)/);
    assert.match(script, /crm-pivot-grand-total/);
    assert.match(script, /renderizarControleDrill/);
});

test('tabela agrupada possui hierarquia visual sem substituir estilos existentes', async () => {
    const style = await readFile(stylePath, 'utf8');

    assert.match(style, /\.crm-pivot-table\.is-sectioned/);
    assert.match(style, /\.crm-pivot-group-band th/);
    assert.match(style, /--group-level/);
    assert.match(style, /\.crm-pivot-subtotal/);
});
