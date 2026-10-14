import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    limparConfiguracaoWidgets,
    normalizarAlturaCanvas,
    normalizarContextoDashboard,
    podeEditarCenariosDashboard,
} from '../lib/dashboard-scenarios.js';

const crmScript = fs.readFileSync(new URL('../public/crm.js', import.meta.url), 'utf8');
const apiScript = fs.readFileSync(new URL('../api/dashboard-scenarios.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../database/dashboard-scenarios.sql', import.meta.url), 'utf8');

test('cenario compartilhado remove somente resultados temporarios', () => {
    const widgets = limparConfiguracaoWidgets([{
        id: 'vendas',
        titulo: 'Vendas',
        sql: 'SELECT * FROM VENDAS',
        dadosConsulta: [{ TOTAL: 10 }],
        colunasConsulta: ['TOTAL'],
        dadosConsultaAgregados: true,
        consultaAtualizadaEm: '2026-10-14T12:00:00Z',
        desempenhoExecucao: { duracaoMs: 15 },
        detalhe: { sql: 'SELECT * FROM ITENS' },
    }]);

    assert.equal(widgets[0].sql, 'SELECT * FROM VENDAS');
    assert.equal(widgets[0].detalhe.sql, 'SELECT * FROM ITENS');
    assert.equal('dadosConsulta' in widgets[0], false);
    assert.equal('colunasConsulta' in widgets[0], false);
    assert.equal('dadosConsultaAgregados' in widgets[0], false);
    assert.equal('consultaAtualizadaEm' in widgets[0], false);
    assert.equal('desempenhoExecucao' in widgets[0], false);
});

test('contexto, altura e permissao sao validados no servidor', () => {
    assert.equal(normalizarContextoDashboard('CLIENTES'), 'clientes');
    assert.equal(normalizarContextoDashboard('invalido'), '');
    assert.equal(normalizarAlturaCanvas(100), 620);
    assert.equal(normalizarAlturaCanvas(9999), 4000);
    assert.equal(podeEditarCenariosDashboard({ categoria: 'DI' }), true);
    assert.equal(podeEditarCenariosDashboard({ categoria: 'VD' }), false);
    assert.equal(podeEditarCenariosDashboard({ categoria: 'VD', canEditScenarios: true }), true);
});

test('frontend usa servidor como fonte oficial e localStorage apenas na migracao', () => {
    assert.match(crmScript, /fetch\('\/api\/dashboard-scenarios'/);
    assert.match(crmScript, /const dashboardCenarios = new Map\(\)/);
    assert.match(crmScript, /carregarCenariosDashboardCompartilhados/);
    assert.match(crmScript, /obterCenarioLocalLegado/);
    assert.doesNotMatch(
        crmScript.slice(crmScript.indexOf('function obterWidgetsDashboard'), crmScript.indexOf('function obterNomeGrafico')),
        /localStorage/,
    );
    assert.match(crmScript, /servidorAindaPadrao/);
    assert.match(crmScript, /localTemConteudo/);
    assert.match(crmScript, /usuarioLogado\.categoria[\s\S]*=== 'DI'/);
    assert.match(crmScript, /dashboardAssinaturasPersistidas\.set\(/);
});

test('API exige sessao, usa versao otimista e mantem historico', () => {
    assert.match(apiScript, /requireRequestSession/);
    assert.match(apiScript, /podeEditarCenariosDashboard/);
    assert.match(apiScript, /FOR UPDATE/);
    assert.match(apiScript, /versaoEsperada !== versaoAtual/);
    assert.match(apiScript, /status\(409\)/);
    assert.match(apiScript, /registrarHistorico/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS crm_dashboard_cenario/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS crm_dashboard_cenario_historico/);
});
