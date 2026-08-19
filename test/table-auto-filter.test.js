import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function carregarMotorAutoFiltro() {
    const source = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    const inicio = source.indexOf('function chaveValorAutoFiltro');
    const fim = source.indexOf('function opcoesOperadorAutoFiltro', inicio);
    assert.ok(inicio >= 0 && fim > inicio);
    const dependencias = `
        const dashboardContextoAtivo = 'visao-geral';
        const filtrosColunaTabelaDashboard = new Map();
        const obterValorLinha = (registro, coluna) => registro[coluna];
        const compararValoresOrdenacao = (a, b) => {
            const numeroA = Number(a); const numeroB = Number(b);
            if (Number.isFinite(numeroA) && Number.isFinite(numeroB)) return numeroA - numeroB;
            return String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
        };
    `;
    return Function(`${dependencias}${source.slice(inicio, fim)}; return {
        filtrosColunaTabelaDashboard, chaveValorAutoFiltro, aplicarAutoFiltrosTabela
    };`)();
}

test('auto-filtro combina multiplos valores e filtros de colunas diferentes', async () => {
    const motor = await carregarMotorAutoFiltro();
    const filtros = new Map();
    filtros.set('STATUS', {
        selecionados: [motor.chaveValorAutoFiltro('PENDENTE'), motor.chaveValorAutoFiltro('FINALIZADO')],
        condicoes: []
    });
    filtros.set('TOTAL', {
        selecionados: null,
        combinacao: 'and',
        condicoes: [{ operador: 'gte', valor: '100' }, { operador: 'lt', valor: '300' }]
    });
    motor.filtrosColunaTabelaDashboard.set('visao-geral:relatorio', filtros);

    const resultado = motor.aplicarAutoFiltrosTabela('relatorio', [
        { STATUS: 'PENDENTE', TOTAL: 150 },
        { STATUS: 'AGUARDANDO', TOTAL: 200 },
        { STATUS: 'FINALIZADO', TOTAL: 350 },
        { STATUS: 'FINALIZADO', TOTAL: 250 }
    ]);

    assert.deepEqual(resultado, [{ STATUS: 'PENDENTE', TOTAL: 150 }, { STATUS: 'FINALIZADO', TOTAL: 250 }]);
});

test('auto-filtro permite combinar duas condicoes com OU', async () => {
    const motor = await carregarMotorAutoFiltro();
    motor.filtrosColunaTabelaDashboard.set('visao-geral:relatorio', new Map([['NOME', {
        selecionados: null,
        combinacao: 'or',
        condicoes: [{ operador: 'starts_with', valor: 'maria' }, { operador: 'contains', valor: 'silva' }]
    }]]));

    const resultado = motor.aplicarAutoFiltrosTabela('relatorio', [
        { NOME: 'Maria Clara' }, { NOME: 'Joao da Silva' }, { NOME: 'Ana Souza' }
    ]);
    assert.deepEqual(resultado.map(item => item.NOME), ['Maria Clara', 'Joao da Silva']);
});

test('tabela e tabela dinamica renderizam menus, pesquisa e resumo de filtros', async () => {
    const source = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    assert.match(source, /function renderizarMenuAutoFiltroTabela/);
    assert.match(source, /data-table-filter-search/);
    assert.match(source, /data-table-filter-combination/);
    assert.match(source, /aplicarAutoFiltrosTabela\(widget\.id, todosRegistros\)/);
    assert.match(source, /renderizarCabecalhoAutoFiltro\(widget, campoColunaPrincipal/);
    assert.match(source, /renderizarResumoAutoFiltrosTabela/);
});

test('auto-filtro atende tabelas e tabelas dinamicas tanto no principal quanto no detalhe', async () => {
    const source = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    const inicioTabelaDetalhe = source.indexOf('function renderizarTabelaSimplesRelatorioDetalhe');
    const fimTabelaDetalhe = source.indexOf('\nfunction renderizarRelatorioDetalheAtual', inicioTabelaDetalhe);
    const tabelaDetalhe = source.slice(inicioTabelaDetalhe, fimTabelaDetalhe);
    const inicioRenderDetalhe = source.indexOf('function renderizarRelatorioDetalheAtual');
    const fimRenderDetalhe = source.indexOf('\nfunction montarVisualizacaoRelatorioDetalhe', inicioRenderDetalhe);
    const renderDetalhe = source.slice(inicioRenderDetalhe, fimRenderDetalhe);

    assert.match(tabelaDetalhe, /aplicarAutoFiltrosTabela\(widget\.id, registrosBase\)/);
    assert.match(tabelaDetalhe, /renderizarCabecalhoAutoFiltro\(widget, campo, registrosBase\)/);
    assert.match(tabelaDetalhe, /renderizarResumoAutoFiltrosTabela\(widget\)/);
    assert.match(renderDetalhe, /renderizarTabelaSimplesRelatorioDetalhe/);
    assert.match(renderDetalhe, /renderizarTabelaGrafico/);
});

test('exportacao remove os controles de filtro, mas usa o conjunto filtrado', async () => {
    const source = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    assert.match(source, /\.crm-table-filter-control/);
    assert.match(source, /renderizarTabelaGrafico\(conteudo, widget, \{ exportarTudo: true \}\)/);
});
