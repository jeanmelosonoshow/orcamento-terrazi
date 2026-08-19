import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/crm.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../public/crm.js', import.meta.url), 'utf8');

const modulosBi = ['visao-geral', 'clientes', 'funil', 'arquitetos', 'reativacao'];

test('cada menu possui uma view e um host de BI proprio', () => {
    for (const modulo of modulosBi) {
        assert.match(html, new RegExp('data-crm-view="' + modulo + '"'));
        assert.match(html, new RegExp('data-dashboard-host="' + modulo + '"'));
        assert.match(script, new RegExp(modulo.replace('-', '\\-')));
    }
    assert.doesNotMatch(html, /Ficha de Fechamento|#fechamento/);
});

test('os cenarios e alturas usam armazenamento independente por modulo', () => {
    assert.match(script, /crmDashboardScenario:clientes:v1/);
    assert.match(script, /crmDashboardScenario:funil:v1/);
    assert.match(script, /crmDashboardScenario:arquitetos:v1/);
    assert.match(script, /crmDashboardScenario:reativacao:v1/);
    assert.ok(script.includes('obterConfigDashboardAtivo(contexto).storage'));
    assert.ok(script.includes('obterConfigDashboardAtivo().altura'));
});

test('visao geral, carteira de clientes e funil contem somente BI', () => {
    const inicioGeral = html.indexOf('data-crm-view="visao-geral"');
    const inicioClientes = html.indexOf('data-crm-view="clientes"');
    const inicioFunil = html.indexOf('data-crm-view="funil"');
    const inicioArquitetos = html.indexOf('data-crm-view="arquitetos"');
    const geral = html.slice(inicioGeral, inicioClientes);
    const clientes = html.slice(inicioClientes, inicioFunil);
    const funil = html.slice(inicioFunil, inicioArquitetos);
    assert.match(geral, /data-dashboard-workspace/);
    assert.doesNotMatch(geral, /crm-static-kpis|crm-operational-section|crm-modules/);
    assert.match(clientes, /data-dashboard-host="clientes"/);
    assert.doesNotMatch(clientes, /crm-module-content|crm-static-kpis|crm-operational-section/);
    assert.match(funil, /data-dashboard-host="funil"/);
    assert.doesNotMatch(funil, /crm-module-content|crm-static-kpis|crm-operational-section/);

    for (const modulo of ['arquitetos', 'reativacao']) {
        const inicio = html.indexOf('data-crm-view="' + modulo + '"');
        const proximo = html.indexOf('data-crm-view="', inicio + 20);
        const view = html.slice(inicio, proximo > inicio ? proximo : undefined);
        assert.match(view, /crm-module-content/);
    }
});

test('rodape institucional e compartilhado pelas paginas do CRM', () => {
    assert.match(html, /data-crm-footer/);
    assert.match(html, /Sono Show e Casa Terrazi/);
    assert.match(html, /Todos os direitos reservados/);
    assert.match(script, /footer.hidden = orcamentosAtivo/);
});

test('atualizacao assincrona permanece vinculada ao menu em que foi iniciada', () => {
    assert.match(script, /const contextoSolicitado = typeof opcoes\?\.contexto/);
    assert.match(script, /obterWidgetsDashboard\(contextoExecucao\)/);
    assert.match(script, /salvarWidgetsDashboard\(widgets, contextoExecucao\)/);
    assert.match(script, /dashboardContextoAtivo === contextoExecucao/);
    assert.match(script, /repararCenariosDuplicadosEntreMenus/);
    assert.match(script, /obterAssinaturaEstruturalCenario/);
    assert.match(script, /delete configuracao\.dadosConsulta/);
    assert.match(script, /crmDashboardContextIsolationRepair:v2/);
});

test('cada entrada em um menu agenda uma atualizacao unica e sequencial do cenario', () => {
    assert.match(script, /const entrouNoContexto = contextoViewRenderizado !== proximoContexto/);
    assert.match(script, /solicitarAtualizacaoCenarioMenu\(proximoContexto\)/);
    assert.match(script, /const filaAtualizacaoMenus = \[\]/);
    assert.match(script, /await aplicarFiltrosDashboard\(\{ contexto, origem: 'menu' \}\)/);
    assert.match(script, /filtrosDashboardProntos = true/);
    assert.match(script, /solicitarAtualizacaoCenarioMenu\(dashboardContextoAtivo\)/);
    assert.match(script, /cancelarAtualizacoesMenusInativos\(proximoContexto\)/);
    assert.match(script, /filaAtualizacaoMenus\.unshift\(contexto\)/);
    assert.match(script, /Aguardando atualizacao:/);
    assert.match(script, /if \(contexto !== dashboardContextoAtivo\) continue/);
    assert.match(script, /Boolean\(controladorAtual\)/);
    assert.match(script, /DASHBOARD_MENU_DEBOUNCE_MS = 700/);
    assert.match(script, /dashboardContextoAtivo === contexto/);
});
test('troca de menu drena a consulta ativa sem iniciar outro lote em paralelo', () => {
    const inicio = script.indexOf('function cancelarAtualizacoesMenusInativos');
    const fim = script.indexOf('\nfunction trocarContextoDashboard', inicio);
    const rotina = script.slice(inicio, fim);

    assert.doesNotMatch(rotina, /\.abort\(\)/);
    assert.match(rotina, /filaAtualizacaoMenus\.splice/);
    assert.match(script, /atualizacaoMenu && dashboardContextoAtivo !== contextoExecucao/);
});
