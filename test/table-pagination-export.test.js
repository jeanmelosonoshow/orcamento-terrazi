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
        const registrosPorPaginaAdaptativos = new Map();
        ${source.slice(inicioConfig, fimConfig)}
        ${source.slice(inicioPaginacao, fimPaginacao)}
        return {
            prepararPaginacaoTabela,
            calcularRegistrosPorPaginaAdaptativos,
            paginasTabelaDashboard,
            registrosPorPaginaAdaptativos
        };
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

test('paginacao acompanha a quantidade adaptativa calculada para a altura do card', async () => {
    const {
        prepararPaginacaoTabela,
        registrosPorPaginaAdaptativos
    } = await carregarPaginacao();
    const registros = Array.from({ length: 80 }, (_, indice) => ({ id: indice + 1 }));
    const widget = {
        id: 'tabela-adaptativa',
        tabela: { paginacao: true, registrosPorPagina: 14 }
    };

    registrosPorPaginaAdaptativos.set(widget.id, 24);
    const pagina = prepararPaginacaoTabela(widget, registros);

    assert.equal(pagina.registros.length, 24);
    assert.equal(pagina.porPagina, 24);
    assert.equal(pagina.totalPaginas, 4);
});

test('calculo adaptativo preenche a folga e nunca reduz abaixo da configuracao', async () => {
    const { calcularRegistrosPorPaginaAdaptativos } = await carregarPaginacao();

    assert.equal(calcularRegistrosPorPaginaAdaptativos({
        configurado: 14,
        atual: 14,
        alturaDisponivel: 800,
        alturaConteudo: 600,
        alturaLinha: 32,
        totalRegistros: 100
    }), 20);

    assert.equal(calcularRegistrosPorPaginaAdaptativos({
        configurado: 14,
        atual: 24,
        alturaDisponivel: 500,
        alturaConteudo: 700,
        alturaLinha: 32,
        totalRegistros: 100
    }), 18);

    assert.equal(calcularRegistrosPorPaginaAdaptativos({
        configurado: 14,
        atual: 14,
        alturaDisponivel: 400,
        alturaConteudo: 700,
        alturaLinha: 32,
        totalRegistros: 100
    }), 14);
});

test('editor e cards oferecem paginacao, PDF, Excel e impressao', async () => {
    const [source, html] = await Promise.all([
        readFile(dashboardPath, 'utf8'),
        readFile(htmlPath, 'utf8')
    ]);

    assert.match(html, /data-table-pagination/);
    assert.match(html, /data-table-page-size/);
    assert.match(html, /data-table-display-limit/);
    assert.match(html, /assets\/vendor\/html2pdf\/html2pdf\.bundle\.min\.js\?v=0\.10\.1/);
    assert.match(html, /xlsx\.full\.min\.js/);
    assert.match(source, /data-widget-export="pdf"/);
    assert.match(source, /data-widget-export="excel"/);
    assert.match(source, /data-widget-export="print"/);
    assert.match(source, /renderizarTabelaGrafico\(conteudo, widget, \{ exportarTudo: true \}\)/);
    assert.match(source, /observarPaginacaoAdaptativaTabela/);
    assert.match(source, /data-dashboard-record-row/);
    assert.match(source, /new ResizeObserver\(agendar\)/);
});

test('CRM carrega localmente os geradores de PDF e todas as fontes dos icones', async () => {
    const [html, html2pdf, jspdf, autotable, fontawesome, solid, regular, brands, compatibilidade] = await Promise.all([
        readFile(htmlPath, 'utf8'),
        readFile(new URL('../public/assets/vendor/html2pdf/html2pdf.bundle.min.js', import.meta.url)),
        readFile(new URL('../public/assets/vendor/jspdf/jspdf.umd.min.js', import.meta.url)),
        readFile(new URL('../public/assets/vendor/jspdf/jspdf.plugin.autotable.min.js', import.meta.url)),
        readFile(new URL('../public/assets/vendor/fontawesome/css/all.min.css', import.meta.url), 'utf8'),
        readFile(new URL('../public/assets/vendor/fontawesome/webfonts/fa-solid-900.woff2', import.meta.url)),
        readFile(new URL('../public/assets/vendor/fontawesome/webfonts/fa-regular-400.woff2', import.meta.url)),
        readFile(new URL('../public/assets/vendor/fontawesome/webfonts/fa-brands-400.woff2', import.meta.url)),
        readFile(new URL('../public/assets/vendor/fontawesome/webfonts/fa-v4compatibility.woff2', import.meta.url))
    ]);

    assert.match(html, /assets\/vendor\/fontawesome\/css\/all\.min\.css\?v=7\.3\.0/);
    assert.match(html, /assets\/vendor\/html2pdf\/html2pdf\.bundle\.min\.js\?v=0\.10\.1/);
    assert.match(html, /assets\/vendor\/jspdf\/jspdf\.umd\.min\.js\?v=2\.5\.1/);
    assert.match(html, /assets\/vendor\/jspdf\/jspdf\.plugin\.autotable\.min\.js\?v=3\.8\.4/);
    assert.match(fontawesome, /\.\.\/webfonts\/fa-solid-900\.woff2/);
    assert.match(fontawesome, /\.\.\/webfonts\/fa-regular-400\.woff2/);
    assert.match(fontawesome, /\.\.\/webfonts\/fa-brands-400\.woff2/);
    assert.match(fontawesome, /\.\.\/webfonts\/fa-v4compatibility\.woff2/);
    assert.ok(html2pdf.length > 800000);
    assert.ok(jspdf.length > 300000);
    assert.ok(autotable.length > 30000);
    assert.ok(solid.length > 100000);
    assert.ok(regular.length > 15000);
    assert.ok(brands.length > 100000);
    assert.ok(compatibilidade.length > 4000);
});

test('exportacao consulta novamente sem o limite visual de mil registros', async () => {
    const [source, api, access] = await Promise.all([
        readFile(dashboardPath, 'utf8'),
        readFile(new URL('../api/executar-cenario.js', import.meta.url), 'utf8'),
        readFile(new URL('../lib/scenario-execution-access.js', import.meta.url), 'utf8')
    ]);

    assert.match(source, /carregarWidgetParaExportacao/);
    assert.match(source, /modoExecucao: 'exportacao'/);
    assert.match(source, /const tamanhoLote = 5000/);
    assert.match(api, /const consultaCompleta = \['exportacao', 'relacionamento'\]\.includes\(modoNormalizado\)/);
    assert.match(api, /const limiteRetorno = consultaCompleta \? undefined : LIMITE_RETORNO/);
    assert.match(access, /'exportacao'/);
});

test('PDF normaliza cores modernas no clone antes de capturar o relatorio', async () => {
    const [source, html] = await Promise.all([
        readFile(dashboardPath, 'utf8'),
        readFile(htmlPath, 'utf8')
    ]);
    const inicio = source.indexOf('function converterComponenteCorPdf');
    const fim = source.indexOf('function sanitizarClonePdf', inicio);
    assert.ok(inicio >= 0 && fim > inicio);
    const { normalizarCoresCssParaPdf } = Function(
        source.slice(inicio, fim) + '; return { normalizarCoresCssParaPdf };'
    )();

    assert.equal(
        normalizarCoresCssParaPdf('color(srgb 0.1 0.5 1 / 0.25)'),
        'rgba(26, 128, 255, 0.25)'
    );
    assert.equal(
        normalizarCoresCssParaPdf('linear-gradient(color(display-p3 1 0 0), #fff)'),
        'linear-gradient(rgba(255, 0, 0, 1), #fff)'
    );
    assert.equal(
        normalizarCoresCssParaPdf('color(srgb-linear 0 0.25 0.5)'),
        'rgba(0, 64, 128, 1)'
    );
    assert.match(source, /onclone:\s*sanitizarClonePdf/);
    assert.match(source, /foreignObjectRendering:\s*true/);
    assert.match(source, /documentoClonado\.documentElement/);
    assert.match(source, /Array\.from\(estiloCalculado\)/);
    assert.match(source, /\*::before,.crm-report-export \*::after\{color:inherit!important/);
    assert.doesNotMatch(source, /\*::before,.crm-report-export \*::after\{content:none/);
    assert.match(html, /crm\.js\?v=crm-20261103-pdf-export-5/);
});

test('alerta de falha do PDF sempre possui fechamento independente do CSS', async () => {
    const source = await readFile(dashboardPath, 'utf8');
    const inicio = source.indexOf('function mostrarMensagemCrm');
    const fim = source.indexOf('\nwindow.alert = mostrarMensagemCrm', inicio);
    const alerta = source.slice(inicio, fim);

    assert.match(alerta, /botao\.onclick = fecharMensagemCrm/);
    assert.match(source, /modal\.hidden = true/);
    assert.match(source, /style\.setProperty\('display', 'none', 'important'\)/);
    assert.match(source, /event\.target\.closest\('\[data-crm-message-ok\]'\)/);
    assert.match(source, /event\.stopPropagation\(\)/);
});

test('PDF de tabelas refaz a consulta, preserva filtros e ordem e ignora a pagina atual', async () => {
    const source = await readFile(dashboardPath, 'utf8');
    const inicioTabela = source.indexOf('function renderizarTabelaGrafico');
    const fimTabela = source.indexOf('\nfunction obterColunaDetalhe', inicioTabela);
    const tabela = source.slice(inicioTabela, fimTabela);

    assert.match(source, /modoExecucao:\s*'exportacao'/);
    assert.match(tabela, /aplicarAutoFiltrosTabela\(widget\.id, todosRegistros\)/);
    assert.match(tabela, /ordenarRegistrosPorCampos\(registrosFiltrados, camposOrdenacao\)/);
    assert.match(tabela, /prepararPaginacaoTabela\(widget, registrosOrdenados, opcoes\.exportarTudo === true\)/);
    assert.match(source, /renderizarTabelaGrafico\(conteudo, widget, \{ exportarTudo: true \}\)/);
    assert.match(source, /ordenarRegistrosPorCampos\(registrosFiltrados, campos\)/);
    assert.match(source, /function exportarTabelaWidgetPdf/);
    assert.match(source, /documento\.autoTable\(/);
    assert.match(source, /showHead:\s*'everyPage'/);
    assert.match(source, /\['table', 'pivot'\]\.includes\(widget\.tipo\)/);
});
