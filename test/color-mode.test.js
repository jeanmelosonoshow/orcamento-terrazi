import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('todas as visoes carregam o controlador e os estilos de luminosidade', () => {
    const pages = [
        'public/crm.html',
        'public/index.html',
        'public/index-sonoshow.html',
        'public/lista-orcamentos.html',
        'public/login.html'
    ];

    pages.forEach(page => {
        const html = read(page);
        assert.match(html, /color-mode\.js/);
        assert.match(html, /color-mode\.css/);
        assert.ok(html.indexOf('color-mode.js') < html.indexOf('</head>'));
    });
});

test('preferencia inicia clara, persiste e notifica componentes dinamicos', () => {
    const script = read('public/color-mode.js');
    const brandTheme = read('public/theme-loader.js');
    assert.match(script, /terrazziColorMode/);
    assert.match(script, /return value === DARK \? DARK : LIGHT/);
    assert.match(script, /localStorage\.setItem/);
    assert.match(script, /appcolormodechange/);
    assert.match(script, /aria-pressed/);
    assert.match(script, /DARK_SURFACES/);
    assert.match(brandTheme, /AppColorMode\?\.refresh/);
});

test('tema escuro cobre as superficies principais sem alterar fundos customizados', () => {
    const css = read('public/color-mode.css');
    const crm = read('public/crm.js');
    assert.match(css, /html\[data-color-mode="dark"\]/);
    assert.match(css, /\.crm-dashboard-widget/);
    assert.match(css, /\.crm-modal-card/);
    assert.match(css, /\.crm-chart-table-real tbody tr:nth-child\(even\)/);
    assert.match(css, /\.crm-widget-detail-content \.crm-table-pagination/);
    assert.match(css, /\.crm-architect-form \{/);
    assert.match(css, /\.crm-architect-card \{/);
    assert.match(css, /\.crm-architect-card-contacts a \{/);
    assert.match(css, /\.crm-architect-cau \{/);
    assert.match(css, /\.product-card/);
    assert.match(css, /\.orcamento-card/);
    assert.match(css, /\.login-container/);
    assert.match(crm, /aparencia\.fundoTipo === 'light' \? \(temaEscuro/);
    assert.match(crm, /backgroundColor: temaEscuro/);
    assert.match(crm, /textBorderWidth: 0/);
    assert.match(crm, /textShadowBlur: 0/);
});
