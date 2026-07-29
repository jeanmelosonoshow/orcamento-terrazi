import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/crm.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../public/crm.js', import.meta.url), 'utf8');

test('painel oferece acao compacta para restaurar filtros', () => {
    assert.match(html, /data-reset-filters/);
    assert.match(html, /aria-label="Limpar filtros"/);
    assert.match(script, /resetFiltersButton\.addEventListener\('click', restaurarFiltrosPadrao\)/);
});

test('recarregamento remove selecoes anteriores e aplica os filtros padrao', () => {
    const inicio = script.indexOf('function inicializarAplicacao()');
    const limpar = script.indexOf('limparFiltrosPersistidos();', inicio);
    const periodo = script.indexOf("iniciarModulo('periodo', inicializarPeriodo)", inicio);
    const aplicar = script.indexOf('await aplicarFiltrosDashboard();', periodo);

    assert.ok(limpar > inicio && limpar < periodo);
    assert.ok(aplicar > periodo);
    assert.match(script, /'crmDataInicial'[\s\S]*'crmVendedoresSelecionados'/);
});

test('restauracao recarrega todas as opcoes permitidas antes de aplicar', () => {
    const inicio = script.indexOf('async function restaurarFiltrosPadrao()');
    const fim = script.indexOf('\nfunction escapeHtml', inicio);
    const rotina = script.slice(inicio, fim);

    assert.match(rotina, /await carregarFiliais\(\)/);
    assert.match(rotina, /await carregarVendedores\(true\)/);
    assert.match(rotina, /await aplicarFiltrosDashboard\(\)/);
});
