import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('editor oferece relatorio de detalhe para cards e graficos', async () => {
    const [html, javascript] = await Promise.all([
        readFile(new URL('../public/crm.html', import.meta.url), 'utf8'),
        readFile(new URL('../public/crm.js', import.meta.url), 'utf8')
    ]);

    assert.match(html, /data-widget-detail-enabled/);
    assert.match(html, /data-widget-detail-type/);
    assert.match(html, /data-widget-detail-sql/);
    assert.match(html, /data-widget-detail-table-columns/);
    assert.match(html, /data-widget-detail-pivot-fields/);
    assert.match(html, /data-widget-detail-modal/);
    assert.match(javascript, /detalhe: \{ habilitado: false/);
    assert.match(javascript, /validarConfiguracaoDetalhe/);
    assert.match(javascript, /widgetPossuiRelatorioDetalhe/);
    assert.match(javascript, /camposTabela: separarExpressoesTabelaDetalhe/);
});

test('tabela detalhe permite escolher e ordenar colunas Firebird e contato', async () => {
    const javascript = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');

    assert.match(javascript, /const definicoes = detalhe\.camposTabela\.map/);
    assert.match(javascript, /resolverExpressaoTabelaDetalhe/);
    assert.match(javascript, /Colunas nao retornadas pelo detalhe/);
    assert.match(javascript, /\.\.\.\(detalhe\?\.camposTabela \|\| \[\]\)/);
    assert.match(javascript, /Use apelidos diferentes nas colunas exibidas/);
});

test('colunas do detalhe aceitam COALESCE e alias entre aspas duplas', async () => {
    const [html, javascript] = await Promise.all([
        readFile(new URL('../public/crm.html', import.meta.url), 'utf8'),
        readFile(new URL('../public/crm.js', import.meta.url), 'utf8')
    ]);

    assert.match(html, /COALESCE\(CAMPO1, CAMPO2\) AS &quot;Data contato&quot;|COALESCE\(CAMPO1, CAMPO2\) AS "Data contato"/);
    assert.match(javascript, /function separarExpressoesTabelaDetalhe/);
    assert.match(javascript, /COALESCE exige pelo menos dois campos/);
    assert.match(javascript, /replace\(\/""\/g, '"'\)/);
    assert.match(javascript, /Use apenas campos e COALESCE/);
});

test('clique no grafico encaminha dimensao e serie como filtros parametrizados', async () => {
    const javascript = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');

    assert.match(javascript, /instancia\.on\('click'/);
    assert.match(javascript, /detalheValor: selecao\.valor/);
    assert.match(javascript, /detalheCampo: selecao\.campo/);
    assert.match(javascript, /detalheSerie: selecao\.serie/);
    assert.match(javascript, /dados\.dimensoes\?\.\[parametros\.dataIndex\]/);
});

test('tabela dinamica de detalhe agrega no servidor e preserva o drill proprio', async () => {
    const javascript = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');

    assert.match(javascript, /function montarVisualizacaoRelatorioDetalhe/);
    assert.match(javascript, /resultadoAgregado: true/);
    assert.match(javascript, /!\['table', 'pivot'\]\.includes/);
    assert.match(javascript, /renderizarRelatorioDetalheAtual/);
    assert.match(javascript, /executarDrillDownWidget/);
});

test('relatorio detalhe permite imprimir e exportar todos os registros para PDF e Excel', async () => {
    const [html, javascript] = await Promise.all([
        readFile(new URL('../public/crm.html', import.meta.url), 'utf8'),
        readFile(new URL('../public/crm.js', import.meta.url), 'utf8')
    ]);

    assert.match(html, /data-widget-detail-export-host/);
    assert.match(javascript, /data-widget-detail-export="pdf"/);
    assert.match(javascript, /data-widget-detail-export="excel"/);
    assert.match(javascript, /data-widget-detail-export="print"/);
    assert.match(javascript, /renderizarTabelaSimplesRelatorioDetalhe\(conteudo, widget, \{ exportarTudo: true \}\)/);
    assert.match(javascript, /prepararPaginacaoTabela\(widget, registros, opcoes\.exportarTudo === true\)/);
});

test('salvar contato reprocessa somente o relatorio detalhe que abriu o formulario', async () => {
    const javascript = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');

    assert.match(javascript, /contextoRelatorioDetalheAtual = \{ widget, selecao: \{ \.\.\.selecao \} \}/);
    assert.match(javascript, /abrirFormularioContato\(contactAction\.dataset\.document, contactAction\.dataset\.name \|\| '', 'detalhe'\)/);
    assert.match(javascript, /const contextoDetalhe = origemFormularioContatoAtual === 'detalhe'/);
    assert.match(javascript, /await abrirRelatorioDetalhe\(contextoDetalhe\.widget, contextoDetalhe\.selecao\)/);
    assert.match(javascript, /Contato salvo e relatório atualizado\./);
});
