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
    assert.match(script, /filiaisTodosRascunho/);
    assert.match(script, /vendedoresTodosRascunho/);
});

test('selecoes individuais ativam as diretivas e somente o clique em Todos as neutraliza', () => {
    assert.match(script, /event\.target\.matches\('\[data-filial-checkbox\]'\)[\s\S]*?filiaisTodosRascunho = false;/);
    assert.match(script, /event\.target\.matches\('\[data-vendedor-checkbox\]'\)[\s\S]*?vendedoresTodosRascunho = false;/);
    assert.match(script, /event\.target\.matches\('\[data-filial-all\]'\)[\s\S]*?filiaisTodosRascunho = event\.target\.checked;/);
    assert.match(script, /event\.target\.matches\('\[data-vendedor-all\]'\)[\s\S]*?vendedoresTodosRascunho = event\.target\.checked;/);
    assert.doesNotMatch(script, /todosCheckbox\.indeterminate = (?:filiais|vendedores)Rascunho/);
});

test('status final e simples e identifica nominalmente cards com erro', () => {
    assert.match(script, /atualizarStatusFiltros\('Atualizacao concluida\.'\)/);
    assert.match(script, /Atualizacao concluida com erro em:/);
    assert.match(script, /widgets\[index\]\?\.titulo/);
    assert.match(script, /cardsComErro\.join/);
});

test('opcoes dos filtros usam texto escuro com alto contraste e cache renovado', () => {
    assert.match(style, /\.crm-multiselect-option > span\s*\{[\s\S]*?color:\s*#17324d !important;/);
    assert.match(html, /font-awesome\/7\.3\.0\/css\/all\.min\.css/);
    assert.match(html, /crm-style\.css\?v=crm-20260820-5/);
    assert.match(html, /crm\.js\?v=crm-20260824-2/);
});
test('restauracao recarrega todas as opcoes permitidas antes de aplicar', () => {
    const inicio = script.indexOf('async function restaurarFiltrosPadrao()');
    const fim = script.indexOf('\nfunction escapeHtml', inicio);
    const rotina = script.slice(inicio, fim);

    assert.match(rotina, /await carregarFiliais\(\)/);
    assert.match(rotina, /await carregarVendedores\(true\)/);
    assert.match(rotina, /await aplicarFiltrosDashboard\(\)/);
});

test('visualizador SQL mostra as filiais permitidas da sessao assinada', () => {
    assert.match(script, /'data_final', 'filiais_permitidas', 'filiais'/);
    assert.match(script, /filiais_permitidas: Array\.isArray\(sessao\.filiaisPermitidas\)/);
    assert.match(script, /obterSessaoAssinadaVisualizadorSql/);
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
