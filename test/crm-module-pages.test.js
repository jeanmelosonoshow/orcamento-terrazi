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

test('visao geral contem somente BI e os demais modulos possuem area operacional', () => {
    const inicioGeral = html.indexOf('data-crm-view="visao-geral"');
    const inicioClientes = html.indexOf('data-crm-view="clientes"');
    const geral = html.slice(inicioGeral, inicioClientes);
    assert.match(geral, /data-dashboard-workspace/);
    assert.doesNotMatch(geral, /crm-static-kpis|crm-operational-section|crm-modules/);

    for (const modulo of ['clientes', 'funil', 'arquitetos', 'reativacao']) {
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
    assert.match(script, /const contextoExecucao = dashboardContextoAtivo/);
    assert.match(script, /obterWidgetsDashboard\(contextoExecucao\)/);
    assert.match(script, /salvarWidgetsDashboard\(widgets, contextoExecucao\)/);
    assert.match(script, /dashboardContextoAtivo === contextoExecucao/);
    assert.match(script, /repararCenariosDuplicadosEntreMenus/);
});
