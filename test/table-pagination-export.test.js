import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboardPath = new URL('../public/crm.js', import.meta.url);
const htmlPath = new URL('../public/crm.html', import.meta.url);

async function carregarPaginacao() {
    const source = await readFile(dashboardPath, 'utf8');
    const inicioConfig = source.indexOf('function normalizarQuantidadeTabela');
    const fimConfig = source.indexOf('function chaveCamposRegistro', inicioConfig);
    const inicioPaginacao = source.indexOf('function prepararPaginacaoTabela');
    const fimPaginacao = source.indexOf('function renderizarControlePaginacaoTabela', inicioPaginacao);
    assert.ok(inicioConfig >= 0 && fimConfig > inicioConfig);
    assert.ok(inicioPaginacao >= 0 && fimPaginacao > inicioPaginacao);
    return Function(`
        const paginasTabelaDashboard = new Map();
        ${source.slice(inicioConfig, fimConfig)}
        ${source.slice(inicioPaginacao, fimPaginacao)}
        return { prepararPaginacaoTabela, paginasTabelaDashboard };
    `)();
}

test('paginacao renderiza apenas a pagina atual e respeita o limite visual', async () => {
    const { prepararPaginacaoTabela, paginasTabelaDashboard } = await carregarPaginacao();
    const registros = Array.from({ length: 80 }, (_, indice) => ({ id: indice + 1 }));
    const widget = {
        id: 'tabela-vendas',
        tabela: { paginacao: true, registrosPorPagina: 25, limiteExibicao: 60 }
    };

    const primeira = prepararPaginacaoTabela(widget, registros);
    assert.equal(primeira.registros.length, 25);
    assert.equal(primeira.registros[0].id, 1);
    assert.equal(primeira.totalPaginas, 3);
    assert.equal(primeira.totalRegistros, 80);
    assert.equal(primeira.totalExibicao, 60);

    paginasTabelaDashboard.set(widget.id, 3);
    const terceira = prepararPaginacaoTabela(widget, registros);
    assert.equal(terceira.registros.length, 10);
    assert.equal(terceira.registros[0].id, 51);
    assert.equal(terceira.fim, 60);
});

test('exportacao ignora pagina e limite visual', async () => {
    const { prepararPaginacaoTabela, paginasTabelaDashboard } = await carregarPaginacao();
    const registros = Array.from({ length: 80 }, (_, indice) => ({ id: indice + 1 }));
    const widget = {
        id: 'tabela-vendas',
        tabela: { paginacao: true, registrosPorPagina: 10, limiteExibicao: 20 }
    };
    paginasTabelaDashboard.set(widget.id, 2);

    const exportacao = prepararPaginacaoTabela(widget, registros, true);

    assert.equal(exportacao.registros.length, 80);
    assert.equal(exportacao.mostrarControle, false);
    assert.equal(exportacao.totalRegistros, 80);
});

test('editor e cards oferecem paginacao, PDF, Excel e impressao', async () => {
    const [source, html] = await Promise.all([
        readFile(dashboardPath, 'utf8'),
        readFile(htmlPath, 'utf8')
    ]);

    assert.match(html, /data-table-pagination/);
    assert.match(html, /data-table-page-size/);
    assert.match(html, /data-table-display-limit/);
    assert.match(html, /html2pdf\.bundle\.min\.js/);
    assert.match(html, /xlsx\.full\.min\.js/);
    assert.match(source, /data-widget-export="pdf"/);
    assert.match(source, /data-widget-export="excel"/);
    assert.match(source, /data-widget-export="print"/);
    assert.match(source, /renderizarTabelaGrafico\(conteudo, widget, \{ exportarTudo: true \}\)/);
});