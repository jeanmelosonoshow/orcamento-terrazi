import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/crm.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../public/crm.js', import.meta.url), 'utf8');
const style = fs.readFileSync(new URL('../public/crm-style.css', import.meta.url), 'utf8');

test('painel oferece acao compacta para restaurar filtros', () => {
    assert.match(html, /data-reset-filters/);
    assert.match(html, /aria-label="Limpar filtros"/);
    assert.match(script, /resetFiltersButton\.addEventListener\('click', restaurarFiltrosPadrao\)/);
});

test('recarregamento remove selecoes anteriores e aplica os filtros padrao', () => {
    const inicio = script.indexOf('function inicializarAplicacao()');
    const limpar = script.indexOf('limparFiltrosPersistidos();', inicio);
    const periodo = script.indexOf("iniciarModulo('periodo', inicializarPeriodo)", inicio);
    const liberarFila = script.indexOf('filtrosDashboardProntos = true;', periodo);
    const agendar = script.indexOf('solicitarAtualizacaoCenarioMenu(dashboardContextoAtivo);', liberarFila);

    assert.ok(limpar > inicio && limpar < periodo);
    assert.ok(liberarFila > periodo);
    assert.ok(agendar > liberarFila);
    assert.match(script, /'crmDataInicial'[\s\S]*'crmVendedoresSelecionados'/);
});

test('informa ao servidor quando Todos esta selecionado nos filtros visiveis', () => {
    assert.match(script, /filiaisTodos: categoriaSemFiltrosFilialVendedor/);
    assert.match(script, /vendedoresTodos: categoriaSemFiltrosFilialVendedor/);
    assert.match(script, /idsFiliaisDisponiveis\.every/);
    assert.match(script, /idsVendedoresDisponiveis\.every/);
});

test('restauracao recarrega todas as opcoes permitidas antes de aplicar', () => {
    const inicio = script.indexOf('async function restaurarFiltrosPadrao()');
    const fim = script.indexOf('\nfunction escapeHtml', inicio);
    const rotina = script.slice(inicio, fim);

    assert.match(rotina, /await carregarFiliais\(\)/);
    assert.match(rotina, /await carregarVendedores\(true\)/);
    assert.match(rotina, /await aplicarFiltrosDashboard\(\)/);
});


test('VD e CX ocultam filial e vendedor e nao enviam listas aos cards', () => {
    assert.match(html, /data-filial-filter/);
    assert.ok(script.includes("const categoriaSemFiltrosFilialVendedor = ['VD', 'CX'].includes(categoriaCodigo)"));
    assert.ok(script.includes('if (crmFilialFilter) crmFilialFilter.hidden = true'));
    assert.ok(script.includes('const filiaisSelecionadas = categoriaSemFiltrosFilialVendedor ? []'));
    assert.ok(script.includes('const vendedoresSelecionados = categoriaSemFiltrosFilialVendedor ? []'));
    assert.ok(script.includes("categoriaCodigo === 'VD'"));
    assert.ok(script.includes("categoriaCodigo === 'CX'"));
    assert.match(script, /aplicarVisibilidadeFiltrosPorCategoria\(\);/);
    assert.match(style, /\.crm-filial-filter\[hidden\]\s*\{\s*display:\s*none;/);
});
