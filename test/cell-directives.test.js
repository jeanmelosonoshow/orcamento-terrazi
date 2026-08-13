import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function carregarDiretivas() {
    const source = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    const inicio = source.indexOf('const iconesFontAwesomeMarca');
    const fim = source.indexOf('function renderizarConteudoCelula', inicio);
    assert.ok(inicio >= 0 && fim > inicio);
    return Function(`${source.slice(inicio, fim)}; return { sanitizarCssDiretiva, iconeCelula };`)();
}

test('diretiva renderiza Font Awesome solid, regular e marcas', async () => {
    const { iconeCelula } = await carregarDiretivas();
    assert.match(iconeCelula('fa-user-plus'), /class="fa-solid fa-user-plus"/);
    assert.match(iconeCelula('fa-address-card', { family: 'regular' }), /class="fa-regular fa-address-card"/);
    assert.match(iconeCelula('fa-whatsapp'), /class="fa-brands fa-whatsapp"/);
});

test('CSS da diretiva aceita somente propriedades visuais seguras', async () => {
    const { sanitizarCssDiretiva } = await carregarDiretivas();
    const css = sanitizarCssDiretiva('background:#25D366;color:#fff;border-radius:14px;padding:7px 12px;position:fixed;background-image:url(https://x)');
    assert.equal(css, 'background:#25D366;color:#fff;border-radius:14px;padding:7px 12px');
    assert.doesNotMatch(css, /position|url|background-image/);
});
