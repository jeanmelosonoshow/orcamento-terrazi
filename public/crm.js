const usuarioLogadoRaw = sessionStorage.getItem('usuarioLogado');
if (!usuarioLogadoRaw) {
    window.top.location.replace('login.html');
    throw new Error('Sessao nao autenticada.');
}

const usuarioLogado = JSON.parse(usuarioLogadoRaw || '{}');
if (!usuarioLogado.sessionToken) {
    sessionStorage.clear();
    window.top.location.replace('login.html');
    throw new Error('Sessao anterior ao novo controle de acesso. Entre novamente.');
}

window.fazerLogout = () => {
    sessionStorage.clear();
    window.top.location.replace('login.html');
};

const nome = usuarioLogado.nomefuncionario || usuarioLogado.nome || 'Usuário';
const filialId = String(usuarioLogado.idfilial || usuarioLogado.id_filial || '').trim().toUpperCase();
const idFuncionarioLogado = usuarioLogado.idfuncionario || usuarioLogado.id_funcionario || usuarioLogado.IDFUNCIONARIO || '';
const idVendedorLogado = usuarioLogado.idvendedor || usuarioLogado.id_vendedor || usuarioLogado.IDVENDEDOR || '';
const categoriasTraduzidas = {
    VD: 'VENDEDOR',
    GR: 'GERENTE',
    SU: 'SUPERVISOR',
    DI: 'DIRETOR',
    CX: 'CAIXA'
};
const categoriasPorNome = Object.fromEntries(Object.entries(categoriasTraduzidas).map(([codigo, nomeCategoria]) => [nomeCategoria, codigo]));
const categoriasDashboard = window.CRM_DASHBOARD_LAYOUT?.categorias || Object.entries(categoriasTraduzidas).map(([codigo, nomeCategoria]) => ({ codigo, nome: nomeCategoria }));
const crmViewsDisponiveis = new Set(['visao-geral', 'clientes', 'funil', 'arquitetos', 'reativacao', 'orcamentos']);
const crmBiViews = new Set(['visao-geral', 'clientes', 'funil', 'arquitetos', 'reativacao']);
let dashboardContextoAtivo = 'visao-geral';
let contextoViewRenderizado = null;
let filtrosDashboardProntos = false;
let processandoAtualizacaoMenus = false;
let contextoAtualizacaoEmAndamento = null;
const filaAtualizacaoMenus = [];
const controladoresAtualizacaoMenus = new Map();
let temporizadorAtualizacaoMenu = null;
const DASHBOARD_QUERY_CONCURRENCY = 1;
const DASHBOARD_REQUEST_TIMEOUT_MS = 95000;
const DASHBOARD_QUEUE_RETRY_LIMIT = 1;
const DASHBOARD_QUEUE_RETRY_DELAY_MS = 1200;
const DASHBOARD_MENU_DEBOUNCE_MS = 700;

function obterViewPorHash(hash) {
    const view = String(hash || '#visao-geral').replace(/^#/, '');
    return crmViewsDisponiveis.has(view) ? view : 'visao-geral';
}

function atualizarTituloView(viewName) {
    const linkAtivo = document.querySelector('[data-crm-view-link="' + viewName + '"]');
    const titulo = linkAtivo?.lastElementChild?.textContent?.trim() || 'Visão Geral';
    const tituloPagina = document.querySelector('.crm-page-title h1');
    const iconePagina = document.querySelector('.crm-page-title-icon');
    const iconeMenu = linkAtivo?.querySelector('.crm-menu-icon');
    if (tituloPagina) tituloPagina.textContent = titulo;
    if (iconePagina && iconeMenu) iconePagina.innerHTML = iconeMenu.innerHTML;
}

function ativarView(viewName) {
    const viewValida = crmViewsDisponiveis.has(viewName) ? viewName : 'visao-geral';
    const orcamentosAtivo = viewValida === 'orcamentos';
    document.body.classList.toggle('crm-budget-mode', orcamentosAtivo);
    document.querySelectorAll('[data-crm-view]').forEach(view => {
        view.hidden = view.dataset.crmView !== viewValida;
    });
    document.querySelectorAll('[data-crm-view-link]').forEach(link => {
        link.classList.toggle('is-active', link.dataset.crmViewLink === viewValida);
    });
    const footer = document.querySelector('[data-crm-footer]');
    if (footer) footer.hidden = orcamentosAtivo;
    if (orcamentosAtivo) {
        try { definirPaginaOrcamento(); } catch (error) {}
        return;
    }
    atualizarTituloView(viewValida);
    if (crmBiViews.has(viewValida)) trocarContextoDashboard(viewValida);
}

document.addEventListener('click', event => {
    const link = event.target.closest('[data-crm-view-link]');
    if (!link) return;
    const hash = link.getAttribute('href') || '#visao-geral';
    if (!hash.startsWith('#')) return;
    event.preventDefault();
    if (window.location.hash !== hash) {
        window.location.hash = hash;
    } else {
        ativarView(obterViewPorHash(hash));
    }
}, true);

window.addEventListener('hashchange', () => {
    const hash = window.location.hash || '#visao-geral';
    ativarView(obterViewPorHash(hash));
});

const categoriaRaw = String(usuarioLogado.categoria || usuarioLogado.CATEGORIA || '').trim().toUpperCase();
const categoriaCodigo = categoriasTraduzidas[categoriaRaw] ? categoriaRaw : (categoriasPorNome[categoriaRaw] || categoriaRaw);
const categoria = categoriasTraduzidas[categoriaCodigo] || categoriaCodigo || 'USUÁRIO';
const categoriaSemFiltrosFilialVendedor = ['VD', 'CX'].includes(categoriaCodigo);

const crmUserName = document.getElementById('crmUserName');
const crmUserMeta = document.getElementById('crmUserMeta');
const crmUserFilial = document.getElementById('crmUserFilial');
const crmUserInitials = document.getElementById('crmUserInitials');
const crmDataInicial = document.querySelector('[data-date-start]');
const crmDataFinal = document.querySelector('[data-date-end]');
const crmFilialFilter = document.querySelector('[data-filial-filter]');
const crmFilialTrigger = document.querySelector('[data-filial-trigger]');
const crmFilialPanel = document.querySelector('[data-filial-panel]');
const crmFilialSearch = document.querySelector('[data-filial-search]');
const crmFilialOptions = document.querySelector('[data-filial-options]');
const crmFilialReadonly = document.getElementById('crmFilialReadonly');
const crmSellerFilter = document.querySelector('[data-seller-filter]');
const crmVendedorTrigger = document.querySelector('[data-vendedor-trigger]');
const crmVendedorPanel = document.querySelector('[data-vendedor-panel]');
const crmVendedorSearch = document.querySelector('[data-vendedor-search]');
const crmVendedorOptions = document.querySelector('[data-vendedor-options]');
const applyFiltersButton = document.querySelector('[data-apply-filters]');
const resetFiltersButton = document.querySelector('[data-reset-filters]');
const filterStatus = document.querySelector('[data-filter-status]');
const contactFilters = document.querySelector('[data-contact-filters]');
const contactFiltersTitle = document.querySelector('[data-contact-filters-title]');
const contactStatusInputs = Array.from(document.querySelectorAll('[data-contact-status]'));
const contactTypeInputs = Array.from(document.querySelectorAll('[data-contact-type]'));
const contactStatusAll = document.querySelector('[data-contact-status-all]');
const contactTypeAll = document.querySelector('[data-contact-type-all]');
const contactStatusDetails = document.querySelector('[data-contact-status-filter]');
const contactTypeDetails = document.querySelector('[data-contact-type-filter]');
const contactStatusSummary = document.querySelector('[data-contact-status-summary]');
const contactTypeSummary = document.querySelector('[data-contact-type-summary]');
const contactDateStart = document.querySelector('[data-contact-date-start]');
const contactDateEnd = document.querySelector('[data-contact-date-end]');

function aplicarVisibilidadeFiltrosPorCategoria() {
    if (crmFilialFilter) crmFilialFilter.hidden = categoriaSemFiltrosFilialVendedor;
    if (crmSellerFilter && categoriaSemFiltrosFilialVendedor) crmSellerFilter.hidden = true;
}

aplicarVisibilidadeFiltrosPorCategoria();

const podeEditarCenarios = Boolean(usuarioLogado.podeEditarCenarios || usuarioLogado.canEditScenarios);
const dashboardEditor = document.querySelector('[data-dashboard-editor]');
const dashboardCanvas = document.querySelector('[data-dashboard-canvas]');
const dashboardWorkspace = document.querySelector('[data-dashboard-workspace]');
const editModeToggle = document.querySelector('[data-edit-mode-toggle]');
const addWidgetButton = document.querySelector('[data-add-widget]');
const decreaseCanvasHeightButton = document.querySelector('[data-decrease-canvas-height]');
const increaseCanvasHeightButton = document.querySelector('[data-increase-canvas-height]');
const canvasHeightValue = document.querySelector('[data-canvas-height-value]');
const widgetModal = document.querySelector('[data-widget-modal]');
const widgetTypeSelect = document.querySelector('[data-widget-type]');
const widgetTitleInput = document.querySelector('[data-widget-title]');
const widgetSteps = Array.from(document.querySelectorAll('[data-widget-step]'));
const widgetStepIndicators = Array.from(document.querySelectorAll('[data-step-indicator]'));
const testWidgetQueryButton = document.querySelector('[data-test-widget-query]');
const nextWidgetStepButton = document.querySelector('[data-next-widget-step]');
const nextAppearanceStepButton = document.querySelector('[data-next-appearance-step]');
const prevWidgetStepButton = document.querySelector('[data-prev-widget-step]');
const queryResultBox = document.querySelector('[data-query-result]');
const queryTableWrap = document.querySelector('[data-query-table-wrap]');
const columnMappingBox = document.querySelector('[data-column-mapping]');
const mappingNote = document.querySelector('[data-mapping-note]');
const chartTopConfigBox = document.querySelector('[data-chart-top-config]');
const chartTopLimitInput = document.querySelector('[data-chart-top-limit]');
const funnelConfigBox = document.querySelector('[data-funnel-config]');
const funnelModeSelect = document.querySelector('[data-funnel-mode]');
const funnelStagesBox = document.querySelector('[data-funnel-stages]');
const funnelStageList = document.querySelector('[data-funnel-stage-list]');
const tableConfigBox = document.querySelector('[data-table-config]');
const tableTotalRowsInput = document.querySelector('[data-table-total-rows]');
const tableTotalColumnsInput = document.querySelector('[data-table-total-columns]');
const tableRepeatLabelsInput = document.querySelector('[data-table-repeat-labels]');
const tablePaginationInput = document.querySelector('[data-table-pagination]');
const tablePageSizeInput = document.querySelector('[data-table-page-size]');
const tableDisplayLimitInput = document.querySelector('[data-table-display-limit]');
const subtotalOptionsBox = document.querySelector('[data-subtotal-options]');
const groupOptionsBox = document.querySelector('[data-group-options]');
const widgetSourceSelect = document.querySelector('[data-widget-source]');
const widgetSourceField = document.querySelector('[data-widget-source-field]');
const widgetQueryConfig = document.querySelector('[data-widget-query-config]');
const calculationConfig = document.querySelector('[data-calculation-config]');
const kpiFormulaInput = document.querySelector('[data-kpi-formula]');
const kpiReferenceList = document.querySelector('[data-kpi-reference-list]');
const kpiOutputFormatSelect = document.querySelector('[data-kpi-output-format]');
const kpiOutputLabelInput = document.querySelector('[data-kpi-output-label]');
const kpiFormulaStatus = document.querySelector('[data-kpi-formula-status]');
const widgetSqlTextarea = document.querySelector('[data-widget-sql]');
const widgetQueryAliasInput = document.querySelector('[data-widget-query-alias]');
const addSecondaryQueryButton = document.querySelector('[data-add-secondary-query]');
const secondaryQueriesBox = document.querySelector('[data-secondary-queries]');
const queryCombinationBox = document.querySelector('[data-query-combination]');
const queryCombinationModeSelect = document.querySelector('[data-query-combination-mode]');
const primaryKeySelect = document.querySelector('[data-primary-key]');
const secondaryKeySelect = document.querySelector('[data-secondary-key]');
const primaryKeyField = document.querySelector('[data-primary-key-field]');
const secondaryKeyField = document.querySelector('[data-secondary-key-field]');
const calculatedFieldsBox = document.querySelector('[data-calculated-fields]');
const calculatedFieldList = document.querySelector('[data-calculated-field-list]');
const addCalculatedFieldButton = document.querySelector('[data-add-calculated-field]');
const saveWidgetButton = document.querySelector('[data-save-widget]');
const widgetBackgroundModeSelect = document.querySelector('[data-widget-background-mode]');
const widgetAlignmentSelect = document.querySelector('[data-widget-alignment]');
const widgetBackgroundColorInput = document.querySelector('[data-widget-background-color]');
const widgetGradientStartInput = document.querySelector('[data-widget-gradient-start]');
const widgetGradientEndInput = document.querySelector('[data-widget-gradient-end]');
const widgetSolidColorField = document.querySelector('[data-widget-solid-color-field]');
const widgetGradientFields = Array.from(document.querySelectorAll('[data-widget-gradient-field]'));
const widgetPaletteOptions = document.querySelector('[data-widget-palette-options]');
const widgetIconOptions = document.querySelector('[data-widget-icon-options]');
const widgetIconColorInput = document.querySelector('[data-widget-icon-color]');
const widgetCategoryOptions = document.querySelector('[data-widget-category-options]');
const widgetCategoryError = document.querySelector('[data-widget-category-error]');
const widgetDetailConfig = document.querySelector('[data-widget-detail-config]');
const widgetDetailEnabledInput = document.querySelector('[data-widget-detail-enabled]');
const widgetDetailFields = document.querySelector('[data-widget-detail-fields]');
const widgetDetailTitleInput = document.querySelector('[data-widget-detail-title]');
const widgetDetailTypeSelect = document.querySelector('[data-widget-detail-type]');
const widgetDetailSourceSelect = document.querySelector('[data-widget-detail-source]');
const widgetDetailSqlTextarea = document.querySelector('[data-widget-detail-sql]');
const widgetDetailTableFields = document.querySelector('[data-widget-detail-table-fields]');
const widgetDetailTableColumnsInput = document.querySelector('[data-widget-detail-table-columns]');
const widgetDetailPivotFields = document.querySelector('[data-widget-detail-pivot-fields]');
const widgetDetailRowsInput = document.querySelector('[data-widget-detail-rows]');
const widgetDetailColumnsInput = document.querySelector('[data-widget-detail-columns]');
const widgetDetailValuesInput = document.querySelector('[data-widget-detail-values]');
const widgetDetailAggregationSelect = document.querySelector('[data-widget-detail-aggregation]');
const widgetDetailTotalInput = document.querySelector('[data-widget-detail-total]');
const widgetDetailError = document.querySelector('[data-widget-detail-error]');
const appearancePreview = document.querySelector('[data-appearance-preview]');
const closeWidgetButtons = Array.from(document.querySelectorAll('[data-close-widget-modal]'));
const sqlViewerModal = document.querySelector('[data-sql-viewer-modal]');
const sqlViewerTitle = document.querySelector('[data-sql-viewer-title]');
const sqlViewerEditor = document.querySelector('[data-sql-viewer-editor]');
const sqlViewerStatus = document.querySelector('[data-sql-viewer-status]');
const sqlViewerParameters = document.querySelector('[data-sql-viewer-parameters]');
const indentSqlViewerButton = document.querySelector('[data-indent-sql-viewer]');
const copySqlViewerButton = document.querySelector('[data-copy-sql-viewer]');
const pasteSqlViewerButton = document.querySelector('[data-paste-sql-viewer]');
const closeSqlViewerButtons = Array.from(document.querySelectorAll('[data-close-sql-viewer]'));
const widgetDetailModal = document.querySelector('[data-widget-detail-modal]');
const widgetDetailModalTitle = document.querySelector('[data-widget-detail-modal-title]');
const widgetDetailContext = document.querySelector('[data-widget-detail-context]');
const widgetDetailStatus = document.querySelector('[data-widget-detail-status]');
const widgetDetailContent = document.querySelector('[data-widget-detail-content]');
const widgetDetailExportHost = document.querySelector('[data-widget-detail-export-host]');
const closeWidgetDetailButtons = Array.from(document.querySelectorAll('[data-close-widget-detail]'));
const contactModal = document.querySelector('[data-contact-modal]');
const closeContactModalButtons = Array.from(document.querySelectorAll('[data-close-contact-modal]'));
const contactForm = document.querySelector('[data-contact-form]');
const contactDocument = document.querySelector('[data-contact-document]');
const contactName = document.querySelector('[data-contact-name]');
const contactFormStatus = document.querySelector('[data-contact-form-status]');
const contactFormType = document.querySelector('[data-contact-form-type]');
const contactFormNotes = document.querySelector('[data-contact-form-notes]');
const contactFormMeta = document.querySelector('[data-contact-form-meta]');
const contactFormMessage = document.querySelector('[data-contact-form-message]');
const saveContactButton = document.querySelector('[data-save-contact]');
const budgetFrame = document.querySelector('[data-budget-frame]');
const dashboardConfigPorView = Object.freeze({
    'visao-geral': { storage: 'crmDashboardScenario:v1', altura: 'crmDashboardCanvasHeight:v1' },
    clientes: { storage: 'crmDashboardScenario:clientes:v1', altura: 'crmDashboardCanvasHeight:clientes:v1' },
    funil: { storage: 'crmDashboardScenario:funil:v1', altura: 'crmDashboardCanvasHeight:funil:v1' },
    arquitetos: { storage: 'crmDashboardScenario:arquitetos:v1', altura: 'crmDashboardCanvasHeight:arquitetos:v1' },
    reativacao: { storage: 'crmDashboardScenario:reativacao:v1', altura: 'crmDashboardCanvasHeight:reativacao:v1' }
});

function obterConfigDashboardAtivo(contexto = dashboardContextoAtivo) {
    return dashboardConfigPorView[contexto] || dashboardConfigPorView['visao-geral'];
}

function obterAssinaturaEstruturalCenario(conteudo) {
    try {
        const widgets = JSON.parse(conteudo);
        if (!Array.isArray(widgets) || !widgets.length) return '';
        return JSON.stringify(widgets.map(widget => {
            const configuracao = { ...widget };
            delete configuracao.dadosConsulta;
            delete configuracao.colunasConsulta;
            delete configuracao.dadosConsultaAgregados;
            delete configuracao.consultaAtualizadaEm;
            delete configuracao.proximidade;
            return configuracao;
        }));
    } catch (error) {
        return '';
    }
}

function repararCenariosDuplicadosEntreMenus() {
    const configVisaoGeral = dashboardConfigPorView['visao-geral'];
    const cenarioVisaoGeral = localStorage.getItem(configVisaoGeral.storage);
    const assinaturaVisaoGeral = obterAssinaturaEstruturalCenario(cenarioVisaoGeral);
    if (!assinaturaVisaoGeral) return;

    Object.entries(dashboardConfigPorView).forEach(([contexto, config]) => {
        if (contexto === 'visao-geral') return;
        const chaveReparo = 'crmDashboardContextIsolationRepair:v2:' + contexto;
        if (localStorage.getItem(chaveReparo)) return;
        const cenarioContexto = localStorage.getItem(config.storage);
        const assinaturaContexto = obterAssinaturaEstruturalCenario(cenarioContexto);
        if (cenarioContexto && assinaturaContexto === assinaturaVisaoGeral) {
            localStorage.setItem(config.storage + ':backup-contexto', cenarioContexto);
            localStorage.removeItem(config.storage);
        }
        localStorage.setItem(chaveReparo, 'concluido');
    });
}
const dashboardCanvasMinHeight = 620;
const dashboardCanvasMaxHeight = 4000;
const dashboardCanvasHeightStep = 200;
let widgetEmEdicao = null;
let colunasConsultaAtual = [];
let dadosConsultaAtual = [];
let assinaturaConsultaAtual = '';
let resultadosConsultasAtuais = [];
let etapaWidgetAtual = 'sql';
let modoEdicaoCenario = false;
let filiaisDisponiveis = [];
let vendedoresDisponiveis = [];
let filiaisRascunho = [];
let vendedoresRascunho = [];
let configuracaoTabelaAtual = { totalLinhas: false, totalColunas: false, repetirRotulos: false, paginacao: false, registrosPorPagina: 25, limiteExibicao: 0, agrupamentos: [], subtotais: [] };
let limiteTopAtual = 0;
let configuracaoFunilAtual = { modo: 'total', etapas: [] };
const instanciasGraficosDashboard = new Map();
const observadoresGraficosDashboard = new Map();
const estadosDrillDashboard = new Map();
const contextosDrillDashboard = new Map();
const paginasTabelaDashboard = new Map();
const filtrosColunaTabelaDashboard = new Map();
let instanciaPreviaAparencia = null;
let sequenciaContextoDrill = 0;
let observadorTamanhoDashboard = null;
let larguraDashboardObservada = 0;
let widgetDetalheModalAtual = null;
let contextoRelatorioDetalheAtual = null;
let origemFormularioContatoAtual = 'dashboard';
let versaoRelacionamentoDashboard = 0;

function cancelarAtualizacoesMenusInativos(contextoAtivo) {
    if (temporizadorAtualizacaoMenu) {
        clearTimeout(temporizadorAtualizacaoMenu);
        temporizadorAtualizacaoMenu = null;
    }
    for (let indice = filaAtualizacaoMenus.length - 1; indice >= 0; indice -= 1) {
        if (filaAtualizacaoMenus[indice] !== contextoAtivo) filaAtualizacaoMenus.splice(indice, 1);
    }
}

function trocarContextoDashboard(viewName) {
    const proximoContexto = dashboardConfigPorView[viewName] ? viewName : 'visao-geral';
    const host = document.querySelector('[data-dashboard-host="' + proximoContexto + '"]');
    if (!host || !dashboardWorkspace) return;

    const mudouContexto = dashboardContextoAtivo !== proximoContexto;
    const entrouNoContexto = contextoViewRenderizado !== proximoContexto;
    if (mudouContexto) {
        cancelarAtualizacoesMenusInativos(proximoContexto);
        modoEdicaoCenario = false;
        document.body.classList.remove('crm-scenario-editing');
        if (editModeToggle) {
            editModeToggle.textContent = 'Editar cenario';
            editModeToggle.setAttribute('aria-pressed', 'false');
        }
        limparGraficosDashboard();
        estadosDrillDashboard.clear();
        contextosDrillDashboard.clear();
        widgetEmEdicao = null;
        dashboardContextoAtivo = proximoContexto;
    }

    if (dashboardWorkspace.parentElement !== host) host.appendChild(dashboardWorkspace);
    const contextoComRelacionamento = ['clientes', 'funil'].includes(proximoContexto);
    if (contactFilters) contactFilters.hidden = !contextoComRelacionamento;
    if (contactFiltersTitle) {
        contactFiltersTitle.textContent = proximoContexto === 'funil'
            ? 'Relacionamento dos orcamentos'
            : 'Relacionamento';
    }
    if (dashboardCanvas) {
        const titulo = document.querySelector('.crm-page-title h1')?.textContent || 'Painel';
        dashboardCanvas.setAttribute('aria-label', 'Area de inteligencia de negocio - ' + titulo);
    }
    renderizarDashboard();
    contextoViewRenderizado = proximoContexto;
    if (entrouNoContexto) {
        const widgetsMenu = obterWidgetsDashboard(proximoContexto);
        const totalCards = widgetsMenu.filter(widgetVisivelParaCategoria).length;
        const quantidade = obterIndicesWidgetsExecutaveis(
            widgetsMenu, widgetVisivelParaCategoria, widgetUtilizaFiltrosVisiveis, false
        ).length;
        atualizarStatusFiltros(quantidade
            ? 'Aguardando atualizacao: ' + totalCards + ' card' + (totalCards === 1 ? '' : 's')
                + ', ' + quantidade + ' consulta' + (quantidade === 1 ? '' : 's') + '...'
            : totalCards + ' card' + (totalCards === 1 ? '' : 's') + '; nenhuma consulta necessaria.');
        solicitarAtualizacaoCenarioMenu(proximoContexto);
    }
}

function solicitarAtualizacaoCenarioMenu(contexto) {
    if (!dashboardConfigPorView[contexto]) return;
    const controladorAtual = controladoresAtualizacaoMenus.get(contexto);
    const execucaoAtiva = contextoAtualizacaoEmAndamento === contexto
        && Boolean(controladorAtual)
        && !controladorAtual.signal.aborted;
    if (!execucaoAtiva) {
        const indiceExistente = filaAtualizacaoMenus.indexOf(contexto);
        if (indiceExistente >= 0) filaAtualizacaoMenus.splice(indiceExistente, 1);
        filaAtualizacaoMenus.unshift(contexto);
    }
    if (temporizadorAtualizacaoMenu) clearTimeout(temporizadorAtualizacaoMenu);
    temporizadorAtualizacaoMenu = setTimeout(() => {
        temporizadorAtualizacaoMenu = null;
        if (filtrosDashboardProntos && dashboardContextoAtivo === contexto) {
            processarFilaAtualizacaoMenus();
        }
    }, DASHBOARD_MENU_DEBOUNCE_MS);
}

async function processarFilaAtualizacaoMenus() {
    if (!filtrosDashboardProntos || processandoAtualizacaoMenus) return;
    processandoAtualizacaoMenus = true;
    try {
        while (filaAtualizacaoMenus.length) {
            const contexto = filaAtualizacaoMenus.shift();
            if (contexto !== dashboardContextoAtivo) continue;
            contextoAtualizacaoEmAndamento = contexto;
            await aplicarFiltrosDashboard({ contexto, origem: 'menu' });
        }
    } finally {
        contextoAtualizacaoEmAndamento = null;
        processandoAtualizacaoMenus = false;
    }
}

const catalogoGraficos = [
    { id: 'kpi', nome: 'Indicador KPI', roles: ['valor'] },
    { id: 'kpi-target', nome: 'KPI com meta', roles: ['valor', 'meta'], required: ['valor', 'meta'] },
    { id: 'kpi-calculated', nome: 'KPI calculado', roles: [], required: [], calculated: true },
    { id: 'bar', nome: 'Barras verticais', roles: ['dimensao', 'valor'] },
    { id: 'horizontal-bar', nome: 'Barras horizontais', roles: ['dimensao', 'valor'] },
    { id: 'grouped-bar', nome: 'Barras agrupadas', roles: ['dimensao', 'coluna', 'valor'] },
    { id: 'stacked-bar', nome: 'Barras empilhadas', roles: ['dimensao', 'coluna', 'valor'] },
    { id: 'line', nome: 'Linha', roles: ['dimensao', 'valor'] },
    { id: 'area', nome: 'Area', roles: ['dimensao', 'valor'] },
    { id: 'combo', nome: 'Combinado barras e linha', roles: ['dimensao', 'valor'] },
    { id: 'pie', nome: 'Pizza', roles: ['dimensao', 'valor'] },
    { id: 'donut', nome: 'Rosca', roles: ['dimensao', 'valor'] },
    { id: 'gauge', nome: 'Velocimetro', roles: ['valor'] },
    { id: 'funnel', nome: 'Funil', roles: ['dimensao', 'valor'] },
    { id: 'treemap', nome: 'Mapa de arvore', roles: ['dimensao', 'valor'] },
    { id: 'heatmap', nome: 'Mapa de calor', roles: ['linha', 'coluna', 'valor'] },
    { id: 'scatter', nome: 'Dispersao', roles: ['dimensao', 'valor'] },
    { id: 'bubble', nome: 'Bolhas', roles: ['dimensao', 'valor'] },
    { id: 'ranking', nome: 'Ranking', roles: ['dimensao', 'valor'] },
    { id: 'table', nome: 'Tabela', roles: ['linha', 'coluna', 'valor'], required: ['linha', 'valor'] },
    { id: 'pivot', nome: 'Tabela dinamica', roles: ['linha', 'coluna', 'valor'], required: ['linha', 'valor'] },
    { id: 'waterfall', nome: 'Cascata', roles: ['dimensao', 'valor'] },
    { id: 'histogram', nome: 'Histograma', roles: ['dimensao', 'valor'] },
    { id: 'bullet', nome: 'Meta x realizado', roles: ['dimensao', 'valor', 'meta'], required: ['dimensao', 'valor', 'meta'] },
    { id: 'sparkline', nome: 'Mini linha', roles: ['dimensao', 'valor'] },
    { id: 'calendar', nome: 'Calendario de calor', roles: ['dimensao', 'valor'] },
    { id: 'cohort', nome: 'Coorte', roles: ['linha', 'coluna', 'valor'] }
];

const paletasGraficos = [
    { id: 'brand', nome: 'Marca', cores: [] },
    { id: 'ocean', nome: 'Oceano', cores: ['#123865', '#1E65A7', '#43A6C6', '#8BD3DD', '#F2C14E', '#E07A5F'] },
    { id: 'forest', nome: 'Floresta', cores: ['#173F35', '#2F6B4F', '#6B8F71', '#A7C4A0', '#D6A756', '#8C5A3C'] },
    { id: 'sunset', nome: 'Por do sol', cores: ['#8C2F39', '#D85C41', '#F29E4C', '#F7C967', '#5C4D7D', '#2D6A8B'] },
    { id: 'graphite', nome: 'Grafite', cores: ['#1F2933', '#52606D', '#7B8794', '#9FB3C8', '#CBD2D9', '#D9A441'] },
    { id: 'jewel', nome: 'Joias', cores: ['#0B6E69', '#9B1D5A', '#3D348B', '#E38B29', '#1F7A8C', '#7A9E3A'] },
    { id: 'soft', nome: 'Suave', cores: ['#729EA1', '#B5BD89', '#DFBE99', '#EC9192', '#DBAFC1', '#9A8C98'] }
];

const iconesWidgets = Array.isArray(window.CRM_WIDGET_ICONS) && window.CRM_WIDGET_ICONS.length
    ? window.CRM_WIDGET_ICONS
    : [{ id: 'none', nome: 'Sem icone', grupo: 'Geral', svg: '' }];

const aparenciaWidgetPadrao = Object.freeze({
    fundoTipo: 'light',
    fundoCor: '#FFFFFF',
    gradienteInicio: '#123865',
    gradienteFim: '#1A3017',
    paleta: 'brand',
    icone: 'none',
    iconeCor: '#C5A47E',
    alinhamento: 'left'
});
function separarCamposDetalhe(valor) {
    const itens = Array.isArray(valor) ? valor : String(valor || '').split(',');
    return Array.from(new Set(itens.map(item => String(item).trim()).filter(Boolean)));
}

function separarExpressoesTabelaDetalhe(valor) {
    if (Array.isArray(valor)) return Array.from(new Set(valor.map(item => String(item).trim()).filter(Boolean)));
    const itens = [];
    let atual = '';
    let profundidade = 0;
    let entreAspas = false;
    const texto = String(valor || '');
    for (let indice = 0; indice < texto.length; indice += 1) {
        const caractere = texto[indice];
        if (caractere === '"') {
            if (entreAspas && texto[indice + 1] === '"') {
                atual += '""';
                indice += 1;
                continue;
            }
            entreAspas = !entreAspas;
        } else if (!entreAspas && caractere === '(') {
            profundidade += 1;
        } else if (!entreAspas && caractere === ')') {
            profundidade -= 1;
            if (profundidade < 0) throw new Error('Parenteses invalidos nas colunas exibidas.');
        }
        if (!entreAspas && profundidade === 0 && caractere === ',') {
            if (atual.trim()) itens.push(atual.trim());
            atual = '';
        } else {
            atual += caractere;
        }
    }
    if (entreAspas) throw new Error('Aspas duplas nao finalizadas nas colunas exibidas.');
    if (profundidade !== 0) throw new Error('Parenteses invalidos nas colunas exibidas.');
    if (atual.trim()) itens.push(atual.trim());
    return Array.from(new Set(itens));
}

function normalizarConfiguracaoDetalhe(valor = {}) {
    const agregacoes = new Set(['none', 'sum', 'count', 'count_distinct', 'avg', 'min', 'max']);
    const tipo = valor.tipo === 'pivot' ? 'pivot' : 'table';
    return {
        habilitado: valor.habilitado === true,
        titulo: String(valor.titulo || '').trim(),
        tipo,
        fonte: String(valor.fonte || 'firebird').toLowerCase() === 'postgres' ? 'postgres' : 'firebird',
        sql: String(valor.sql || '').trim(),
        camposTabela: separarExpressoesTabelaDetalhe(valor.camposTabela),
        camposLinha: separarCamposDetalhe(valor.camposLinha),
        camposColuna: separarCamposDetalhe(valor.camposColuna),
        camposValor: separarCamposDetalhe(valor.camposValor),
        agregacao: agregacoes.has(valor.agregacao) ? valor.agregacao : 'sum',
        totalGeral: valor.totalGeral !== false
    };
}

function widgetPossuiRelatorioDetalhe(widget) {
    const detalhe = normalizarConfiguracaoDetalhe(widget?.detalhe);
    return detalhe.habilitado && Boolean(detalhe.sql) && !['table', 'pivot'].includes(String(widget?.tipo || ''));
}

function atualizarCamposConfiguracaoDetalhe() {
    const tipoWidget = widgetTypeSelect?.value || widgetEmEdicao?.tipo || 'bar';
    const permitido = !['table', 'pivot'].includes(tipoWidget);
    if (widgetDetailConfig) widgetDetailConfig.hidden = !permitido;
    const habilitado = permitido && Boolean(widgetDetailEnabledInput?.checked);
    if (widgetDetailFields) widgetDetailFields.hidden = !habilitado;
    if (widgetDetailTableFields) widgetDetailTableFields.hidden = !habilitado || widgetDetailTypeSelect?.value !== 'table';
    if (widgetDetailPivotFields) widgetDetailPivotFields.hidden = !habilitado || widgetDetailTypeSelect?.value !== 'pivot';
    if (widgetDetailError) widgetDetailError.hidden = true;
}

function carregarConfiguracaoDetalhe(widget) {
    const detalhe = normalizarConfiguracaoDetalhe(widget?.detalhe);
    if (widgetDetailEnabledInput) widgetDetailEnabledInput.checked = detalhe.habilitado;
    if (widgetDetailTitleInput) widgetDetailTitleInput.value = detalhe.titulo;
    if (widgetDetailTypeSelect) widgetDetailTypeSelect.value = detalhe.tipo;
    if (widgetDetailSourceSelect) widgetDetailSourceSelect.value = detalhe.fonte;
    if (widgetDetailSqlTextarea) widgetDetailSqlTextarea.value = detalhe.sql;
    if (widgetDetailTableColumnsInput) widgetDetailTableColumnsInput.value = detalhe.camposTabela.join(', ');
    if (widgetDetailRowsInput) widgetDetailRowsInput.value = detalhe.camposLinha.join(', ');
    if (widgetDetailColumnsInput) widgetDetailColumnsInput.value = detalhe.camposColuna.join(', ');
    if (widgetDetailValuesInput) widgetDetailValuesInput.value = detalhe.camposValor.join(', ');
    if (widgetDetailAggregationSelect) widgetDetailAggregationSelect.value = detalhe.agregacao;
    if (widgetDetailTotalInput) widgetDetailTotalInput.checked = detalhe.totalGeral;
    atualizarCamposConfiguracaoDetalhe();
}

function coletarConfiguracaoDetalhe() {
    return normalizarConfiguracaoDetalhe({
        habilitado: !widgetDetailConfig?.hidden && Boolean(widgetDetailEnabledInput?.checked),
        titulo: widgetDetailTitleInput?.value,
        tipo: widgetDetailTypeSelect?.value,
        fonte: widgetDetailSourceSelect?.value,
        sql: widgetDetailSqlTextarea?.value,
        camposTabela: widgetDetailTableColumnsInput?.value,
        camposLinha: widgetDetailRowsInput?.value,
        camposColuna: widgetDetailColumnsInput?.value,
        camposValor: widgetDetailValuesInput?.value,
        agregacao: widgetDetailAggregationSelect?.value,
        totalGeral: Boolean(widgetDetailTotalInput?.checked)
    });
}

function validarConfiguracaoDetalhe(detalhe) {
    if (!detalhe.habilitado) return true;
    let mensagem = '';
    if (!detalhe.sql) mensagem = 'Informe o SQL do relatorio de detalhe.';
    else if (detalhe.tipo === 'pivot' && !detalhe.camposLinha.length) mensagem = 'Informe ao menos um campo de linha para a tabela dinamica.';
    else if (detalhe.tipo === 'pivot' && !detalhe.camposValor.length) mensagem = 'Informe ao menos um campo de valor para a tabela dinamica.';
    if (!mensagem) return true;
    if (widgetDetailError) {
        widgetDetailError.textContent = mensagem;
        widgetDetailError.hidden = false;
    }
    setEtapaWidget('sql');
    return false;
}
function obterIniciais(nomeCompleto) {
    return String(nomeCompleto || 'U')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(parte => parte[0])
        .join('')
        .toUpperCase() || 'U';
}

function getFiliaisSelecionadas() {
    try {
        const salvas = JSON.parse(sessionStorage.getItem('crmFiliaisSelecionadas') || '[]');
        if (Array.isArray(salvas) && salvas.length) return salvas.map(String);
    } catch (error) {
        // Mantem compatibilidade com a selecao antiga.
    }

    const filialAntiga = sessionStorage.getItem('crmFilialSelecionada');
    return filialAntiga ? [String(filialAntiga)] : (filialId ? [filialId] : []);
}

function getFilialSelecionada() {
    return getFiliaisSelecionadas()[0] || filialId;
}

function setFiliaisSelecionadas(filiais) {
    const lista = Array.from(new Set((filiais || []).map(filial => String(filial)).filter(Boolean)));
    sessionStorage.setItem('crmFiliaisSelecionadas', JSON.stringify(lista));
    if (lista[0]) sessionStorage.setItem('crmFilialSelecionada', lista[0]);
}

function getVendedoresSelecionados() {
    try {
        const salvos = JSON.parse(sessionStorage.getItem('crmVendedoresSelecionados') || '[]');
        if (Array.isArray(salvos)) return salvos.map(String).filter(Boolean);
    } catch (error) {
        // Mantem a tela funcionando mesmo se houver dado antigo invalido.
    }

    return [];
}

function setVendedoresSelecionados(vendedores) {
    const lista = Array.from(new Set((vendedores || []).map(vendedor => String(vendedor)).filter(Boolean)));
    sessionStorage.setItem('crmVendedoresSelecionados', JSON.stringify(lista));
}
if (crmUserName) crmUserName.textContent = nome;
if (crmUserMeta) crmUserMeta.textContent = categoria;
function atualizarFilialUsuario(nomeFilial) {
    if (!crmUserFilial) return;
    const textoFilial = nomeFilial || usuarioLogado.nomefilial || (usuarioLogado.idfilial ? 'Filial: ' + usuarioLogado.idfilial : 'Filial nao informada');
    crmUserFilial.textContent = textoFilial;
}

atualizarFilialUsuario();
if (crmUserInitials) crmUserInitials.textContent = obterIniciais(nome);


function criarWidgetPadrao(tipo = 'bar') {
    const itemCatalogo = catalogoGraficos.find(item => item.id === tipo) || catalogoGraficos[1];
    return {
        id: `grafico-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        titulo: itemCatalogo.nome,
        tipo: itemCatalogo.id,
        x: 0,
        y: 0,
        w: 420,
        h: 300,
        limiteTop: 0,
        funil: { modo: 'total', etapas: [] },
        mapeamentos: [],
        fonte: 'firebird',
        sql: '',
        consultas: [],
        combinacaoConsultas: { modo: 'single', chavePrincipal: '', chaveSecundaria: '' },
        camposCalculados: [],
        calculo: { formula: '', formatoSaida: 'decimal', rotulo: 'Resultado calculado' },
        dadosConsultaAgregados: false,
        detalhe: { habilitado: false, titulo: '', tipo: 'table', fonte: 'firebird', sql: '', camposTabela: [], camposLinha: [], camposColuna: [], camposValor: [], agregacao: 'sum', totalGeral: true },
        categoriasPermitidas: categoriasDashboard.map(item => item.codigo),
        aparencia: { ...aparenciaWidgetPadrao }
    };
}

function obterWidgetsDashboard(contexto = dashboardContextoAtivo) {
    try {
        const conteudoSalvo = localStorage.getItem(obterConfigDashboardAtivo(contexto).storage);
        if (conteudoSalvo !== null) {
            const salvos = JSON.parse(conteudoSalvo);
            if (Array.isArray(salvos)) return salvos;
        }
    } catch (error) {
        // Mantem o painel utilizavel caso um rascunho local esteja invalido.
    }

    if (contexto !== 'visao-geral') return [];

    return [
        { ...criarWidgetPadrao('bar'), id: 'evolucao-comercial', titulo: 'Evolucao comercial', colunas: 8 },
        { ...criarWidgetPadrao('kpi'), id: 'ticket-medio', titulo: 'Ticket medio', colunas: 4, linhas: 1 },
        { ...criarWidgetPadrao('funnel'), id: 'funil-orcamentos', titulo: 'Funil de orcamentos', colunas: 6 },
        { ...criarWidgetPadrao('ranking'), id: 'ranking-vendedores', titulo: 'Ranking de vendedores', colunas: 6 }
    ];
}

function salvarWidgetsDashboard(widgets, contexto = dashboardContextoAtivo) {
    localStorage.setItem(obterConfigDashboardAtivo(contexto).storage, JSON.stringify(widgets));
}

function obterNomeGrafico(tipo) {
    return catalogoGraficos.find(item => item.id === tipo)?.nome || 'Grafico';
}

function normalizarCorHex(cor, fallback = '#FFFFFF') {
    const valor = String(cor || '').trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(valor) ? valor : fallback;
}

function obterAparenciaWidget(widget = {}) {
    const atual = widget.aparencia && typeof widget.aparencia === 'object' ? widget.aparencia : {};
    return {
        fundoTipo: ['light', 'solid', 'gradient'].includes(atual.fundoTipo) ? atual.fundoTipo : aparenciaWidgetPadrao.fundoTipo,
        fundoCor: normalizarCorHex(atual.fundoCor, aparenciaWidgetPadrao.fundoCor),
        gradienteInicio: normalizarCorHex(atual.gradienteInicio, aparenciaWidgetPadrao.gradienteInicio),
        gradienteFim: normalizarCorHex(atual.gradienteFim, aparenciaWidgetPadrao.gradienteFim),
        paleta: paletasGraficos.some(item => item.id === atual.paleta) ? atual.paleta : aparenciaWidgetPadrao.paleta,
        icone: iconesWidgets.some(item => item.id === atual.icone) ? atual.icone : aparenciaWidgetPadrao.icone,
        iconeCor: normalizarCorHex(atual.iconeCor, aparenciaWidgetPadrao.iconeCor),
        alinhamento: ['left', 'center', 'right'].includes(atual.alinhamento) ? atual.alinhamento : aparenciaWidgetPadrao.alinhamento
    };
}

function obterContrasteCor(corHex) {
    const cor = normalizarCorHex(corHex, '#FFFFFF').slice(1);
    const canais = [0, 2, 4].map(indice => parseInt(cor.slice(indice, indice + 2), 16) / 255)
        .map(canal => canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4);
    const luminancia = (0.2126 * canais[0]) + (0.7152 * canais[1]) + (0.0722 * canais[2]);
    return luminancia > 0.42 ? '#17304A' : '#FFFFFF';
}

function obterPaletaWidget(widget = {}) {
    const aparencia = obterAparenciaWidget(widget);
    const configurada = paletasGraficos.find(item => item.id === aparencia.paleta);
    if (configurada?.cores?.length) return configurada.cores;
    const cores = obterCoresGraficos();
    return [cores.principal, cores.secundaria, cores.destaque, '#2F6B9A', '#748C68', '#B8563F'];
}

function renderizarIconeWidget(iconeId, classe = '') {
    const icone = iconesWidgets.find(item => item.id === iconeId);
    if (!icone?.svg) return '';
    return `<span class="crm-widget-icon ${escapeHtml(classe)}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icone.svg}</svg></span>`;
}

function obterEstiloAparenciaWidget(widget = {}) {
    const aparencia = obterAparenciaWidget(widget);
    const paleta = obterPaletaWidget(widget);
    let fundo = 'rgba(255,255,255,0.94)';
    let baseContraste = '#FFFFFF';
    if (aparencia.fundoTipo === 'solid') {
        fundo = aparencia.fundoCor;
        baseContraste = aparencia.fundoCor;
    } else if (aparencia.fundoTipo === 'gradient') {
        fundo = `linear-gradient(135deg, ${aparencia.gradienteInicio}, ${aparencia.gradienteFim})`;
        baseContraste = aparencia.gradienteInicio;
    }
    const texto = aparencia.fundoTipo === 'light' ? '#17304A' : obterContrasteCor(baseContraste);
    const textoSuave = texto === '#FFFFFF' ? 'rgba(255,255,255,0.72)' : 'rgba(23,48,74,0.66)';
    const linha = texto === '#FFFFFF' ? 'rgba(255,255,255,0.20)' : 'rgba(23,48,74,0.13)';
    const iconeContraste = obterContrasteCor(aparencia.iconeCor);
    const alinhamentoFlex = { left: 'start', center: 'center', right: 'end' }[aparencia.alinhamento] || 'start';
    return `--widget-background:${fundo};--widget-color:${texto};--widget-muted:${textoSuave};--widget-line:${linha};--widget-accent:${paleta[0]};--widget-icon-color:${aparencia.iconeCor};--widget-icon-foreground:${iconeContraste};--widget-align:${aparencia.alinhamento};--widget-justify:${alinhamentoFlex};`;
}

function coletarAparenciaWidget() {
    return obterAparenciaWidget({
        aparencia: {
            fundoTipo: widgetBackgroundModeSelect?.value || 'light',
            fundoCor: widgetBackgroundColorInput?.value,
            gradienteInicio: widgetGradientStartInput?.value,
            gradienteFim: widgetGradientEndInput?.value,
            paleta: widgetPaletteOptions?.querySelector('input:checked')?.value || 'brand',
            icone: widgetIconOptions?.querySelector('input:checked')?.value || 'none',
            iconeCor: widgetIconColorInput?.value || aparenciaWidgetPadrao.iconeCor,
            alinhamento: widgetAlignmentSelect?.value || 'left'
        }
    });
}

function atualizarCamposAparencia() {
    const modo = widgetBackgroundModeSelect?.value || 'light';
    if (widgetSolidColorField) widgetSolidColorField.hidden = modo !== 'solid';
    widgetGradientFields.forEach(campo => { campo.hidden = modo !== 'gradient'; });
    if (widgetIconOptions && widgetIconColorInput) {
        widgetIconOptions.style.setProperty('--widget-icon-color', normalizarCorHex(widgetIconColorInput.value, aparenciaWidgetPadrao.iconeCor));
    }
    renderizarPreviaAparencia();
}

function renderizarOpcoesAparencia(aparencia) {
    if (widgetPaletteOptions) {
        widgetPaletteOptions.innerHTML = paletasGraficos.map(paleta => {
            const cores = paleta.cores.length ? paleta.cores : obterPaletaWidget({ aparencia: { ...aparencia, paleta: 'brand' } });
            return `<label class="crm-palette-option"><input type="radio" name="widget-palette" value="${escapeHtml(paleta.id)}"${paleta.id === aparencia.paleta ? ' checked' : ''}><span>${escapeHtml(paleta.nome)}</span><i>${cores.slice(0, 5).map(cor => `<b style="background:${normalizarCorHex(cor, '#123865')}"></b>`).join('')}</i></label>`;
        }).join('');
    }
    if (widgetIconOptions) {
        const gruposIcones = iconesWidgets.reduce((grupos, icone) => {
            const grupo = icone.grupo || 'Geral';
            if (!grupos.has(grupo)) grupos.set(grupo, []);
            grupos.get(grupo).push(icone);
            return grupos;
        }, new Map());
        widgetIconOptions.style.setProperty('--widget-icon-color', aparencia.iconeCor);
        widgetIconOptions.innerHTML = Array.from(gruposIcones, ([grupo, icones]) => `
            <section class="crm-icon-group">
                <strong>${escapeHtml(grupo)}</strong>
                <div class="crm-icon-group-grid">
                    ${icones.map(icone => `<label class="crm-icon-option"><input type="radio" name="widget-icon" value="${escapeHtml(icone.id)}"${icone.id === aparencia.icone ? ' checked' : ''}><span>${icone.svg ? renderizarIconeWidget(icone.id) : '<span class="crm-no-icon">--</span>'}<small>${escapeHtml(icone.nome)}</small></span></label>`).join('')}
                </div>
            </section>`).join('');
    }
}

function criarDadosPreviaGrafico(tipo) {
    const categorias = tipo === 'calendar'
        ? ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07']
        : ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
    if (tipo === 'heatmap' || tipo === 'cohort') {
        return {
            categorias: ['Grupo A', 'Grupo B', 'Grupo C', 'Grupo D'],
            nomeDimensao: 'Grupo',
            series: [
                { nome: 'Etapa 1', formato: 'decimal', valores: [100, 88, 76, 64] },
                { nome: 'Etapa 2', formato: 'decimal', valores: [82, 70, 61, 49] },
                { nome: 'Etapa 3', formato: 'decimal', valores: [64, 52, 44, 35] },
                { nome: 'Etapa 4', formato: 'decimal', valores: [48, 39, 31, 24] }
            ]
        };
    }
    const principal = { nome: 'Realizado', formato: 'decimal', valores: [42, 68, 54, 84, 63, 76] };
    const secundaria = { nome: tipo === 'bullet' ? 'Meta' : 'Comparativo', formato: 'decimal', valores: [50, 60, 62, 72, 70, 82] };
    return { categorias, nomeDimensao: 'Periodo', series: [principal, secundaria] };
}

function renderizarPreviaAparencia() {
    if (!appearancePreview) return;
    if (instanciaPreviaAparencia) {
        instanciaPreviaAparencia.dispose();
        instanciaPreviaAparencia = null;
    }
    const aparencia = coletarAparenciaWidget();
    const tipo = widgetTypeSelect?.value || widgetEmEdicao?.tipo || 'bar';
    const widgetPrevia = {
        ...(widgetEmEdicao || {}),
        tipo,
        aparencia,
        funil: tipo === 'funnel' ? coletarConfiguracaoFunil() : widgetEmEdicao?.funil
    };
    const titulo = widgetTitleInput?.value.trim() || 'Titulo do indicador';
    appearancePreview.innerHTML = `
        <div class="crm-appearance-preview-card" style="${obterEstiloAparenciaWidget(widgetPrevia)}">
            <small>${escapeHtml(obterNomeGrafico(tipo))}</small>
            <strong>${escapeHtml(titulo)}</strong>
            <div class="crm-appearance-preview-result">
                ${renderizarIconeWidget(aparencia.icone, 'is-preview')}
                <div class="crm-appearance-preview-chart" data-appearance-chart></div>
            </div>
        </div>`;
    const containerPrevia = appearancePreview.querySelector('[data-appearance-chart]');
    if (!containerPrevia) return;
    if (tipo === 'kpi' || tipo === 'kpi-target' || tipo === 'kpi-calculated') {
        if (tipo === 'kpi-target') {
            containerPrevia.innerHTML = '<div class="crm-preview-kpi is-target"><strong>R$ 128.450</strong><span>Realizado</span><small>Meta: R$ 150.000 <b>85,63%</b></small></div>';
        } else {
            const configuracao = tipo === 'kpi-calculated' ? coletarConfiguracaoKpiCalculado() : null;
            const valorPrevia = tipo === 'kpi-calculated' ? obterValorPreviaKpiCalculado(configuracao) : null;
            const valor = valorPrevia?.erro ? '--' : formatarValorGrafico(valorPrevia?.valor ?? 128450, configuracao?.formatoSaida || 'money');
            const rotulo = configuracao?.rotulo || (tipo === 'kpi-calculated' ? 'Resultado calculado' : 'Resultado');
            containerPrevia.innerHTML = `<div class="crm-preview-kpi"><strong>${escapeHtml(valor)}</strong><span>${escapeHtml(rotulo)}</span></div>`;
        }
        return;
    }
    if (tipo === 'table' || tipo === 'pivot') {
        containerPrevia.innerHTML = '<div class="crm-preview-table"><b>Categoria</b><b>Total</b><span>Filial 01</span><span>84.320</span><span>Filial 02</span><span>63.740</span><strong>Total</strong><strong>148.060</strong></div>';
        return;
    }
    if (!window.echarts) {
        containerPrevia.innerHTML = '<span class="crm-chart-empty">Previa indisponivel.</span>';
        return;
    }
    const dadosPrevia = criarDadosPreviaGrafico(tipo);
    instanciaPreviaAparencia = window.echarts.init(containerPrevia, null, { renderer: 'canvas' });
    instanciaPreviaAparencia.setOption(montarOpcaoECharts(widgetPrevia, dadosPrevia, containerPrevia), true);
    requestAnimationFrame(() => instanciaPreviaAparencia?.resize());
}

function carregarAparenciaWidget(widget) {
    const aparencia = obterAparenciaWidget(widget);
    if (widgetBackgroundModeSelect) widgetBackgroundModeSelect.value = aparencia.fundoTipo;
    if (widgetAlignmentSelect) widgetAlignmentSelect.value = aparencia.alinhamento;
    if (widgetBackgroundColorInput) widgetBackgroundColorInput.value = aparencia.fundoCor;
    if (widgetGradientStartInput) widgetGradientStartInput.value = aparencia.gradienteInicio;
    if (widgetGradientEndInput) widgetGradientEndInput.value = aparencia.gradienteFim;
    if (widgetIconColorInput) widgetIconColorInput.value = aparencia.iconeCor;
    renderizarOpcoesAparencia(aparencia);
    atualizarCamposAparencia();
}
function renderizarVisualGrafico(widget) {
    return `
        <div class="crm-chart-real"
             data-chart-widget="${escapeHtml(widget.id)}"
             role="img"
             aria-label="${escapeHtml(widget.titulo || obterNomeGrafico(widget.tipo))}">
        </div>
    `;
}

function obterAssinaturaConsulta(fonte = '', sql = '') {
    return `${String(fonte || '').trim().toLowerCase()}::${String(sql || '').trim()}`;
}

function obterValorLinha(linha, coluna) {
    if (!linha || !coluna) return null;
    if (Object.prototype.hasOwnProperty.call(linha, coluna)) return linha[coluna];
    const nome = Object.keys(linha).find(chave => chave.toLowerCase() === String(coluna).toLowerCase());
    return nome ? linha[nome] : null;
}

function converterNumero(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
    if (valor === null || valor === undefined || valor === '') return 0;
    const texto = String(valor).trim();
    if (!texto) return 0;
    const normalizado = texto.includes(',') && texto.includes('.')
        ? texto.replace(/\./g, '').replace(',', '.')
        : texto.replace(',', '.');
    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : 0;
}

function converterDataDimensao(valor) {
    if (valor instanceof Date) {
        if (Number.isNaN(valor.getTime())) return null;
        return new Date(
            valor.getUTCFullYear(),
            valor.getUTCMonth(),
            valor.getUTCDate(),
            12
        );
    }

    const texto = String(valor || '').trim();
    const timestampComFuso = texto.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i);
    const dataCivilUtc = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?Z$/i.test(texto);
    if (timestampComFuso && !dataCivilUtc) {
        const instante = new Date(texto);
        return Number.isNaN(instante.getTime()) ? null : instante;
    }
    const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/);
    if (iso) {
        const data = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    const brasileira = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/);
    if (brasileira) {
        const data = new Date(Number(brasileira[3]), Number(brasileira[2]) - 1, Number(brasileira[1]), 12);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
}

function formatarDimensao(valor, formatoData = 'none') {
    if (valor === null || valor === undefined || valor === '') return 'Sem valor';
    if (!formatoData || formatoData === 'none') return String(valor);
    const data = converterDataDimensao(valor);
    if (!data) return String(valor);
    if (formatoData === 'year') return String(data.getFullYear());
    if (formatoData === 'quarter') return `${Math.floor(data.getMonth() / 3) + 1}o tri/${data.getFullYear()}`;
    if (formatoData === 'month') {
        return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(data);
    }
    return new Intl.DateTimeFormat('pt-BR').format(data);
}

function formatarValorGrafico(valor, formato = 'decimal') {
    const numero = converterNumero(valor);
    if (formato === 'money') {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
    }
    if (formato === 'percent') {
        return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(numero / 100);
    }
    if (formato === 'integer') {
        return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(numero);
    }
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(numero);
}

function calcularAgregacao(valores, agregacao = 'none') {
    const preenchidos = valores.filter(valor => valor !== null && valor !== undefined && valor !== '');
    if (agregacao === 'count') return preenchidos.length;
    if (agregacao === 'count_distinct') return new Set(preenchidos.map(valor => String(valor))).size;
    const numeros = preenchidos.map(converterNumero);
    if (!numeros.length) return 0;
    if (agregacao === 'min') return Math.min(...numeros);
    if (agregacao === 'max') return Math.max(...numeros);
    if (agregacao === 'avg') return numeros.reduce((total, numero) => total + numero, 0) / numeros.length;
    if (agregacao === 'sum') return numeros.reduce((total, numero) => total + numero, 0);
    return numeros[0];
}

function normalizarLimiteTopGrafico(valor) {
    const limite = Math.floor(Number(valor));
    return Number.isFinite(limite) && limite > 0 ? Math.min(limite, 1000) : 0;
}

function normalizarChaveEtapaFunil(valor) {
    return String(valor ?? '').trim().toUpperCase();
}

function normalizarConfiguracaoFunil(valor = {}) {
    const modo = valor.modo === 'stages' ? 'stages' : 'total';
    const campoDimensao = String(valor.campoDimensao || '').trim();
    const chaves = new Set();
    const etapas = (Array.isArray(valor.etapas) ? valor.etapas : []).map((etapa, indice) => {
        const valorEtapa = String(etapa?.valor ?? '').trim();
        return {
            valor: valorEtapa,
            rotulo: String(etapa?.rotulo || valorEtapa).trim() || valorEtapa,
            ordem: Math.max(1, Math.floor(Number(etapa?.ordem) || (indice + 1)))
        };
    }).filter(etapa => {
        const chave = normalizarChaveEtapaFunil(etapa.valor);
        if (!chave || chaves.has(chave)) return false;
        chaves.add(chave);
        return true;
    });
    return { modo, campoDimensao, etapas };
}

function aplicarConfiguracaoFunil(widget, dados) {
    const configuracao = normalizarConfiguracaoFunil(widget?.funil);
    if (configuracao.modo !== 'stages') return { ...dados, funil: configuracao };
    const indicePorValor = new Map((dados.dimensoes || []).map((dimensao, indice) => [
        normalizarChaveEtapaFunil(dimensao.valor), indice
    ]));
    const usados = new Set();
    const etapasConfiguradas = [...configuracao.etapas]
        .sort((a, b) => (a.ordem - b.ordem) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
        .filter(etapa => indicePorValor.has(normalizarChaveEtapaFunil(etapa.valor)))
        .map(etapa => {
            const chave = normalizarChaveEtapaFunil(etapa.valor);
            usados.add(chave);
            return { ...etapa, indice: indicePorValor.get(chave) };
        });
    const etapasNovas = (dados.dimensoes || []).map((dimensao, indice) => ({
        valor: String(dimensao.valor ?? ''),
        rotulo: String(dimensao.rotulo || dimensao.valor || ''),
        ordem: etapasConfiguradas.length + indice + 1,
        indice
    })).filter(etapa => !usados.has(normalizarChaveEtapaFunil(etapa.valor)));
    const etapas = [...etapasConfiguradas, ...etapasNovas];
    if (!etapas.length) return { ...dados, funil: configuracao };
    return {
        ...dados,
        categorias: etapas.map(etapa => etapa.rotulo),
        dimensoes: etapas.map(etapa => ({ ...dados.dimensoes[etapa.indice], rotulo: etapa.rotulo })),
        series: dados.series.map(serie => ({
            ...serie,
            valores: etapas.map(etapa => serie.valores[etapa.indice])
        })),
        funil: {
            ...configuracao,
            etapas: etapas.map(({ indice, ...etapa }) => etapa)
        }
    };
}

function ordenarELimitarTopGrafico(grupos, limiteTop, obterValor) {
    const limite = normalizarLimiteTopGrafico(limiteTop);
    if (!limite || grupos.length <= 1) return grupos;
    return grupos
        .map((grupo, indice) => ({ grupo, indice, valor: Number(obterValor(grupo)) }))
        .sort((a, b) => {
            const valorA = Number.isFinite(a.valor) ? a.valor : 0;
            const valorB = Number.isFinite(b.valor) ? b.valor : 0;
            return (valorB - valorA) || (a.indice - b.indice);
        })
        .slice(0, limite)
        .map(item => item.grupo);
}

function obterApelidoMapeamento(mapeamento) {
    return String(mapeamento?.apelido || mapeamento?.coluna || '').trim();
}

function prepararDadosGrafico(widget) {
    const linhas = Array.isArray(widget.dadosConsulta) ? widget.dadosConsulta : [];
    const mapeamentos = Array.isArray(widget.mapeamentos) ? widget.mapeamentos : [];
    const dimensao = mapeamentos.find(item => ['dimensao', 'linha'].includes(item.papel));
    const coluna = mapeamentos.find(item => item.papel === 'coluna');
    const valores = mapeamentos.filter(item => item.papel === 'valor');
    const metas = mapeamentos.filter(item => item.papel === 'meta');
    const medidas = [...valores, ...metas];
    const agregacaoDados = mapeamento => widget.dadosConsultaAgregados ? 'none' : (mapeamento.agregacao || 'none');
    if (!linhas.length || !valores.length) return null;

    const grupos = new Map();
    linhas.forEach((linha, index) => {
        const valorDimensao = dimensao ? obterValorLinha(linha, dimensao.coluna) : 'Total';
        const rotulo = dimensao ? formatarDimensao(valorDimensao, dimensao.formatoData) : 'Total';
        const chave = dimensao ? `${rotulo}::${String(valorDimensao)}` : 'total';
        if (!grupos.has(chave)) grupos.set(chave, { rotulo, valor: valorDimensao, linhas: [], ordem: index });
        grupos.get(chave).linhas.push(linha);
    });

    const direcaoDimensao = obterOrdenacaoCampo(dimensao);
    const valoresOrdenados = valores.filter(valor => obterOrdenacaoCampo(valor) !== 'none');
    const gruposOrdenados = Array.from(grupos.values()).sort((a, b) => {
        if (direcaoDimensao !== 'none') {
            const brutoA = dimensao ? obterValorLinha(a.linhas[0], dimensao.coluna) : a.rotulo;
            const brutoB = dimensao ? obterValorLinha(b.linhas[0], dimensao.coluna) : b.rotulo;
            const comparacao = compararValoresOrdenacao(brutoA, brutoB);
            if (comparacao !== 0) return direcaoDimensao === 'desc' ? -comparacao : comparacao;
        }
        for (const valor of valoresOrdenados) {
            const agregadoA = calcularAgregacao(a.linhas.map(linha => obterValorLinha(linha, valor.coluna)), agregacaoDados(valor));
            const agregadoB = calcularAgregacao(b.linhas.map(linha => obterValorLinha(linha, valor.coluna)), agregacaoDados(valor));
            const comparacao = compararValoresOrdenacao(agregadoA, agregadoB);
            if (comparacao !== 0) return obterOrdenacaoCampo(valor) === 'desc' ? -comparacao : comparacao;
        }
        return a.ordem - b.ordem;
    });
    const valorRankingTop = valores.find(valor => obterOrdenacaoCampo(valor) !== 'none') || valores[0];
    const gruposExibidos = ordenarELimitarTopGrafico(
        gruposOrdenados,
        widget.tipo === 'funnel' && normalizarConfiguracaoFunil(widget.funil).modo === 'stages' ? 0 : widget.limiteTop,
        grupo => calcularAgregacao(
            grupo.linhas.map(linha => obterValorLinha(linha, valorRankingTop.coluna)),
            agregacaoDados(valorRankingTop)
        )
    );
    const membrosColuna = coluna
        ? Array.from(new Set(linhas.map(linha => formatarDimensao(obterValorLinha(linha, coluna.coluna), coluna.formatoData))))
            .sort((a, b) => {
                const comparacao = compararValoresOrdenacao(a, b);
                return obterOrdenacaoCampo(coluna) === 'desc' ? -comparacao : (obterOrdenacaoCampo(coluna) === 'asc' ? comparacao : 0);
            })
        : [null];
    const series = medidas.flatMap(mapeamento => membrosColuna.map(membro => ({
        nome: membro === null
            ? obterApelidoMapeamento(mapeamento)
            : (medidas.length === 1 ? membro : `${obterApelidoMapeamento(mapeamento)} - ${membro}`),
        formato: mapeamento.formatoValor || 'decimal',
        valores: gruposExibidos.map(grupo => {
            const linhasSerie = membro === null
                ? grupo.linhas
                : grupo.linhas.filter(linha => formatarDimensao(obterValorLinha(linha, coluna.coluna), coluna.formatoData) === membro);
            return calcularAgregacao(
                linhasSerie.map(linha => obterValorLinha(linha, mapeamento.coluna)),
                agregacaoDados(mapeamento)
            );
        })
    })));

    const dadosPreparados = {
        categorias: gruposExibidos.map(grupo => grupo.rotulo),
        dimensoes: gruposExibidos.map(grupo => ({ campo: dimensao?.coluna || '', apelido: dimensao ? obterApelidoMapeamento(dimensao) : '', valor: grupo.valor, rotulo: grupo.rotulo })),
        nomeDimensao: dimensao ? obterApelidoMapeamento(dimensao) : '',
        series
    };
    return widget.tipo === 'funnel' ? aplicarConfiguracaoFunil(widget, dadosPreparados) : dadosPreparados;
}

const tiposKpiCalculaveis = new Set(['kpi', 'kpi-target', 'kpi-calculated']);

function ehKpiCalculado(tipo = widgetTypeSelect?.value || widgetEmEdicao?.tipo) {
    return tipo === 'kpi-calculated';
}

function criarReferenciaIndicador(widget) {
    const base = String(widget?.titulo || widget?.id || 'indicador')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return base || 'indicador';
}

function atribuirReferenciasIndicadores(widgets) {
    const usados = new Set();
    return widgets.map(widget => {
        if (!tiposKpiCalculaveis.has(widget.tipo)) return widget;
        let referencia = String(widget.referenciaCalculo || '').trim();
        if (!referencia || usados.has(referencia.toLowerCase())) {
            const base = criarReferenciaIndicador(widget);
            referencia = base;
            let sufixo = 2;
            while (usados.has(referencia.toLowerCase())) {
                referencia = `${base}-${sufixo}`;
                sufixo += 1;
            }
        }
        usados.add(referencia.toLowerCase());
        return { ...widget, referenciaCalculo: referencia };
    });
}

function coletarConfiguracaoKpiCalculado() {
    return {
        formula: kpiFormulaInput?.value.trim() || '',
        formatoSaida: kpiOutputFormatSelect?.value || 'decimal',
        rotulo: kpiOutputLabelInput?.value.trim() || 'Resultado calculado'
    };
}

function obterIndicadoresParaCalculo(widgetAtual = widgetEmEdicao) {
    return atribuirReferenciasIndicadores(obterWidgetsDashboard())
        .filter(widget => tiposKpiCalculaveis.has(widget.tipo) && widget.id !== widgetAtual?.id);
}

function formulaKpiPossuiCiclo(configuracao, widgetAtual = widgetEmEdicao) {
    if (!widgetAtual) return false;
    let widgets = atribuirReferenciasIndicadores(obterWidgetsDashboard());
    const existente = widgets.find(widget => widget.id === widgetAtual.id);
    const candidato = {
        ...(existente || widgetAtual),
        tipo: 'kpi-calculated',
        calculo: configuracao
    };
    const indice = widgets.findIndex(widget => widget.id === candidato.id);
    if (indice >= 0) widgets[indice] = candidato;
    else widgets.push(candidato);
    widgets = atribuirReferenciasIndicadores(widgets);
    const porReferencia = new Map(widgets.map(widget => [String(widget.referenciaCalculo || '').toLowerCase(), widget]));
    const concluidos = new Set();

    function visitar(widget, caminho) {
        if (caminho.has(widget.id)) return true;
        if (concluidos.has(widget.id) || widget.tipo !== 'kpi-calculated') return false;
        const proximoCaminho = new Set(caminho);
        proximoCaminho.add(widget.id);
        const referencias = window.CRM_KPI_CALCULATOR.extrairReferencias(widget.calculo?.formula || '');
        for (const referencia of referencias) {
            const dependencia = porReferencia.get(referencia.toLowerCase());
            if (dependencia && visitar(dependencia, proximoCaminho)) return true;
        }
        concluidos.add(widget.id);
        return false;
    }

    const candidatoNormalizado = widgets.find(widget => widget.id === candidato.id);
    return candidatoNormalizado ? visitar(candidatoNormalizado, new Set()) : false;
}

function validarFormulaKpi(configuracao, widgetAtual = widgetEmEdicao) {
    if (!window.CRM_KPI_CALCULATOR) return { ok: false, erro: 'Avaliador de formulas indisponivel.' };
    try {
        const referencias = window.CRM_KPI_CALCULATOR.extrairReferencias(configuracao?.formula || '');
        if (!referencias.length) throw new Error('Inclua ao menos um indicador na formula.');
        const disponiveis = new Map(obterIndicadoresParaCalculo(widgetAtual).map(widget => [widget.referenciaCalculo.toLowerCase(), widget]));
        const ausentes = referencias.filter(referencia => !disponiveis.has(referencia.toLowerCase()));
        if (ausentes.length) throw new Error(`Indicador nao encontrado: ${ausentes.join(', ')}.`);
        const valoresTeste = Object.fromEntries(referencias.map(referencia => [referencia, 1]));
        window.CRM_KPI_CALCULATOR.avaliar(configuracao.formula, valoresTeste);
        if (formulaKpiPossuiCiclo(configuracao, widgetAtual)) {
            throw new Error('A formula cria uma referencia circular entre indicadores.');
        }
        return { ok: true, referencias };
    } catch (error) {
        return { ok: false, erro: error.message || 'Formula invalida.' };
    }
}

function obterValorIndicador(widget, widgets, pilha = []) {
    if (!widget) throw new Error('Indicador nao encontrado.');
    if (pilha.includes(widget.id)) throw new Error('Existe uma referencia circular entre os KPIs calculados.');
    if (widget.tipo !== 'kpi-calculated') {
        const dados = prepararDadosGrafico(widget);
        const serie = dados?.series?.[0];
        if (!serie) throw new Error(`O indicador ${widget.titulo || widget.id} ainda nao possui dados.`);
        return serie.valores.reduce((soma, valor) => soma + converterNumero(valor), 0);
    }

    const configuracao = widget.calculo || {};
    const referencias = window.CRM_KPI_CALCULATOR.extrairReferencias(configuracao.formula || '');
    const porReferencia = new Map(widgets.map(item => [String(item.referenciaCalculo || '').toLowerCase(), item]));
    const valores = {};
    referencias.forEach(referencia => {
        const dependencia = porReferencia.get(referencia.toLowerCase());
        if (!dependencia) throw new Error(`Indicador nao encontrado: ${referencia}.`);
        valores[referencia] = obterValorIndicador(dependencia, widgets, [...pilha, widget.id]);
    });
    return window.CRM_KPI_CALCULATOR.avaliar(configuracao.formula, valores);
}

function obterResultadoKpiCalculado(widget, widgets = atribuirReferenciasIndicadores(obterWidgetsDashboard())) {
    try {
        return { valor: obterValorIndicador(widget, widgets), erro: '' };
    } catch (error) {
        return { valor: 0, erro: error.message || 'Nao foi possivel calcular o indicador.' };
    }
}

function obterValorPreviaKpiCalculado(configuracao) {
    const validacao = validarFormulaKpi(configuracao);
    if (!validacao.ok) return { valor: 0, erro: validacao.erro };
    const widgets = atribuirReferenciasIndicadores(obterWidgetsDashboard());
    const temporario = {
        ...(widgetEmEdicao || criarWidgetPadrao('kpi-calculated')),
        tipo: 'kpi-calculated',
        calculo: configuracao
    };
    return obterResultadoKpiCalculado(temporario, widgets);
}

function atualizarStatusFormulaKpi() {
    if (!kpiFormulaStatus || !ehKpiCalculado()) return;
    const configuracao = coletarConfiguracaoKpiCalculado();
    if (!configuracao.formula) {
        kpiFormulaStatus.hidden = true;
        return;
    }
    const validacao = validarFormulaKpi(configuracao);
    const resultado = validacao.ok ? obterValorPreviaKpiCalculado(configuracao) : { erro: validacao.erro };
    kpiFormulaStatus.hidden = false;
    kpiFormulaStatus.className = `crm-formula-status ${resultado.erro ? 'is-error' : 'is-success'}`;
    kpiFormulaStatus.textContent = resultado.erro
        ? resultado.erro
        : `Resultado atual: ${formatarValorGrafico(resultado.valor, configuracao.formatoSaida)}`;
}

function inserirReferenciaKpi(referencia) {
    if (!kpiFormulaInput) return;
    const token = `[${referencia}]`;
    const inicio = kpiFormulaInput.selectionStart ?? kpiFormulaInput.value.length;
    const fim = kpiFormulaInput.selectionEnd ?? inicio;
    const prefixo = inicio > 0 && !/\s|[+\-*/^(]/.test(kpiFormulaInput.value[inicio - 1]) ? ' ' : '';
    const sufixo = fim < kpiFormulaInput.value.length && !/\s|[+\-*/^)]/.test(kpiFormulaInput.value[fim]) ? ' ' : '';
    kpiFormulaInput.setRangeText(prefixo + token + sufixo, inicio, fim, 'end');
    kpiFormulaInput.focus();
    atualizarStatusFormulaKpi();
    renderizarPreviaAparencia();
}

function renderizarReferenciasKpi() {
    if (!kpiReferenceList) return;
    const indicadores = obterIndicadoresParaCalculo();
    kpiReferenceList.innerHTML = indicadores.length
        ? `<strong>Indicadores disponiveis</strong><div>${indicadores.map(widget => `<button type="button" data-kpi-reference="${escapeHtml(widget.referenciaCalculo)}" title="Inserir [${escapeHtml(widget.referenciaCalculo)}]">${escapeHtml(widget.titulo || widget.referenciaCalculo)}</button>`).join('')}</div>`
        : '<span>Nenhum outro KPI disponivel neste cenario.</span>';
}

function carregarConfiguracaoKpiCalculado(widget) {
    const configuracao = widget?.calculo || {};
    if (kpiFormulaInput) kpiFormulaInput.value = configuracao.formula || '';
    if (kpiOutputFormatSelect) kpiOutputFormatSelect.value = configuracao.formatoSaida || 'decimal';
    if (kpiOutputLabelInput) kpiOutputLabelInput.value = configuracao.rotulo || 'Resultado calculado';
    renderizarReferenciasKpi();
    atualizarStatusFormulaKpi();
}

function atualizarModoConfiguracaoWidget() {
    const calculado = ehKpiCalculado();
    if (widgetSourceField) widgetSourceField.hidden = calculado;
    if (widgetQueryConfig) widgetQueryConfig.hidden = calculado;
    if (calculationConfig) calculationConfig.hidden = !calculado;
    const indicadorConsulta = widgetStepIndicators.find(item => item.dataset.stepIndicator === 'sql');
    const indicadorMapeamento = widgetStepIndicators.find(item => item.dataset.stepIndicator === 'mapping');
    const indicadorAparencia = widgetStepIndicators.find(item => item.dataset.stepIndicator === 'appearance');
    if (indicadorConsulta) indicadorConsulta.textContent = calculado ? '1. Calculo' : '1. Consulta';
    if (indicadorMapeamento) indicadorMapeamento.hidden = calculado;
    if (indicadorAparencia) indicadorAparencia.textContent = calculado ? '2. Aparencia' : '3. Aparencia';
    if (nextWidgetStepButton) nextWidgetStepButton.textContent = calculado ? 'Aparencia' : 'Proximo';
    renderizarReferenciasKpi();
    atualizarCamposConfiguracaoDetalhe();
}

function obterCoresGraficos() {
    const estilos = getComputedStyle(document.documentElement);
    const obter = (variavel, fallback) => estilos.getPropertyValue(variavel).trim() || fallback;
    return {
        principal: obter('--verde-escuro', '#1A3017'),
        secundaria: obter('--madeira', '#B98B5F'),
        destaque: obter('--dourado', '#C5A47E'),
        texto: obter('--text', '#243042')
    };
}

function montarOpcaoECharts(widget, dados, container) {
    const cores = obterCoresGraficos();
    const paleta = obterPaletaWidget(widget);
    const aparencia = obterAparenciaWidget(widget);
    const baseContraste = aparencia.fundoTipo === 'solid' ? aparencia.fundoCor : aparencia.gradienteInicio;
    const textoGrafico = aparencia.fundoTipo === 'light' ? cores.texto : obterContrasteCor(baseContraste);
    const primeiraSerie = dados.series[0];
    const largura = container?.clientWidth || 480;
    const altura = container?.clientHeight || 280;
    const compacto = largura < 390 || altura < 230;
    const muitasCategorias = dados.categorias.length > (compacto ? 6 : 12);
    const formatarTooltip = valor => formatarValorGrafico(valor, primeiraSerie?.formato);
    const base = {
        animationDuration: 360,
        animationDurationUpdate: 220,
        animationEasing: 'cubicOut',
        aria: { enabled: true, show: true },
        color: paleta,
        textStyle: { color: textoGrafico, fontFamily: 'Inter, Arial, sans-serif', fontSize: compacto ? 10 : 12 },
        tooltip: {
            trigger: 'axis',
            confine: true,
            backgroundColor: 'rgba(255,255,255,0.96)',
            borderColor: 'rgba(23,48,74,0.16)',
            textStyle: { color: cores.texto },
            valueFormatter: formatarTooltip
        },
        legend: {
            show: dados.series.length > 1 && !compacto,
            type: 'scroll',
            top: 0,
            textStyle: { color: textoGrafico }
        },
        grid: {
            left: compacto ? 8 : 16,
            right: compacto ? 8 : 16,
            top: dados.series.length > 1 && !compacto ? 34 : 14,
            bottom: muitasCategorias ? 38 : 12,
            containLabel: true
        }
    };
    const seriesCartesianas = dados.series.map((serie, index) => ({
        name: serie.nome,
        type: widget.tipo === 'combo' && index > 0
            ? 'line'
            : (['line', 'area', 'sparkline'].includes(widget.tipo) ? 'line' : 'bar'),
        smooth: ['line', 'area', 'sparkline', 'combo'].includes(widget.tipo),
        symbolSize: compacto ? 5 : 7,
        areaStyle: widget.tipo === 'area' ? { opacity: 0.18 } : undefined,
        stack: widget.tipo === 'stacked-bar' ? 'total' : undefined,
        barMaxWidth: compacto ? 30 : 52,
        label: {
            show: !compacto && dados.categorias.length <= 8,
            position: widget.tipo === 'horizontal-bar' || widget.tipo === 'ranking' ? 'right' : 'top',
            formatter: params => formatarValorGrafico(params.value, serie.formato),
            color: textoGrafico
        },
        emphasis: { focus: 'series' },
        data: serie.valores
    }));

    if (widget.tipo === 'horizontal-bar') {
        return {
            ...base,
            grid: { ...base.grid, bottom: 10 },
            yAxis: {
                type: 'category',
                data: dados.categorias,
                inverse: true,
                axisTick: { show: false },
                axisLabel: { hideOverlap: true, width: Math.max(70, Math.round(largura * 0.28)), overflow: 'truncate' }
            },
            xAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: 'rgba(120,130,145,0.14)' } },
                axisLabel: { formatter: value => formatarValorGrafico(value, primeiraSerie.formato) }
            },
            dataZoom: muitasCategorias ? [{ type: 'inside', yAxisIndex: 0 }, { type: 'slider', yAxisIndex: 0, width: 8, right: 2 }] : [],
            series: seriesCartesianas
        };
    }
    if (widget.tipo === 'pie' || widget.tipo === 'donut') {
        return {
            ...base,
            legend: { show: !compacto, type: 'scroll', orient: largura > 560 ? 'vertical' : 'horizontal', right: largura > 560 ? 0 : 'auto' },
            tooltip: { ...base.tooltip, trigger: 'item' },
            series: [{
                type: 'pie',
                radius: widget.tipo === 'donut' ? ['44%', '70%'] : '68%',
                center: largura > 560 ? ['42%', '52%'] : ['50%', '54%'],
                avoidLabelOverlap: true,
                data: dados.categorias.map((nome, index) => ({ name: nome, value: primeiraSerie.valores[index] })),
                label: { show: !compacto, formatter: '{b}\n{d}%', overflow: 'truncate' },
                emphasis: { scale: true, scaleSize: 8 }
            }]
        };
    }
    if (widget.tipo === 'treemap') {
        return {
            ...base,
            tooltip: { ...base.tooltip, trigger: 'item' },
            series: [{
                type: 'treemap',
                roam: false,
                breadcrumb: { show: false },
                label: { show: !compacto, overflow: 'truncate' },
                upperLabel: { show: false },
                data: dados.categorias.map((nome, index) => ({ name: nome, value: primeiraSerie.valores[index] }))
            }]
        };
    }
    if (widget.tipo === 'gauge') {
        return {
            ...base,
            series: [{
                type: 'gauge',
                radius: compacto ? '82%' : '92%',
                progress: { show: true, roundCap: true },
                axisLabel: { show: !compacto },
                detail: {
                    fontSize: compacto ? 16 : 24,
                    formatter: value => formatarValorGrafico(value, primeiraSerie.formato)
                },
                data: [{ value: primeiraSerie.valores[0], name: primeiraSerie.nome }]
            }]
        };
    }
    const renderizadorEspecializado = window.CRM_CHART_RENDERERS?.[widget.tipo];
    if (typeof renderizadorEspecializado === 'function') {
        return renderizadorEspecializado({
            widget,
            dados,
            container,
            base,
            paleta,
            textoGrafico,
            compacto,
            muitasCategorias,
            formatar: formatarValorGrafico,
            converterNumero
        });
    }

    return {
        ...base,
        xAxis: {
            type: 'category',
            name: compacto ? '' : dados.nomeDimensao,
            data: dados.categorias,
            axisTick: { alignWithLabel: true },
            axisLabel: { hideOverlap: true, rotate: muitasCategorias ? 28 : 0, overflow: 'truncate', width: compacto ? 54 : 90 }
        },
        yAxis: {
            type: 'value',
            splitLine: { lineStyle: { color: 'rgba(120,130,145,0.14)' } },
            axisLabel: { formatter: value => formatarValorGrafico(value, primeiraSerie.formato) }
        },
        dataZoom: muitasCategorias ? [{ type: 'inside', xAxisIndex: 0 }, { type: 'slider', xAxisIndex: 0, height: 12, bottom: 0 }] : [],
        series: seriesCartesianas
    };
}

function normalizarQuantidadeTabela(valor, fallback, minimo, maximo) {
    const numero = Math.floor(Number(valor));
    return Number.isFinite(numero) ? Math.min(maximo, Math.max(minimo, numero)) : fallback;
}

function obterConfiguracaoTabela(widget = {}) {
    const atual = widget.tabela && typeof widget.tabela === 'object' ? widget.tabela : {};
    return {
        totalLinhas: Boolean(atual.totalLinhas),
        totalColunas: Boolean(atual.totalColunas),
        repetirRotulos: Boolean(atual.repetirRotulos),
        paginacao: Boolean(atual.paginacao),
        registrosPorPagina: normalizarQuantidadeTabela(atual.registrosPorPagina, 25, 1, 500),
        limiteExibicao: normalizarQuantidadeTabela(atual.limiteExibicao, 0, 0, 1000),
        agrupamentos: Array.isArray(atual.agrupamentos) ? atual.agrupamentos.map(String) : [],
        subtotais: Array.isArray(atual.subtotais) ? atual.subtotais.map(String) : []
    };
}

function chaveCamposRegistro(registro, campos) {
    return JSON.stringify(campos.map(campo => obterValorLinha(registro, campo.coluna)));
}

function agruparRegistros(registros, campo, valores = []) {
    const grupos = new Map();
    registros.forEach(registro => {
        const bruto = obterValorLinha(registro, campo.coluna);
        const rotulo = formatarDimensao(bruto, campo.formatoData);
        const chave = JSON.stringify([bruto, rotulo]);
        if (!grupos.has(chave)) grupos.set(chave, { valor: bruto, rotulo, registros: [] });
        grupos.get(chave).registros.push(registro);
    });
    const direcaoDimensao = obterOrdenacaoCampo(campo);
    const valoresOrdenados = valores.filter(valor => obterOrdenacaoCampo(valor) !== 'none');
    return Array.from(grupos.values()).sort((a, b) => {
        if (direcaoDimensao !== 'none') {
            const comparacao = compararValoresOrdenacao(a.valor, b.valor);
            if (comparacao !== 0) return direcaoDimensao === 'desc' ? -comparacao : comparacao;
        }
        for (const valor of valoresOrdenados) {
            const agregadoA = calcularAgregacao(a.registros.map(registro => obterValorLinha(registro, valor.coluna)), valor.agregacao || 'none');
            const agregadoB = calcularAgregacao(b.registros.map(registro => obterValorLinha(registro, valor.coluna)), valor.agregacao || 'none');
            const comparacao = compararValoresOrdenacao(agregadoA, agregadoB);
            if (comparacao !== 0) return obterOrdenacaoCampo(valor) === 'desc' ? -comparacao : comparacao;
        }
        return 0;
    });
}

function obterCamposDetalheWidget(widget, mapeamentos) {
    if (Array.isArray(widget.consultas) && widget.consultas.length > 1) return [];
    const colunasAtivas = new Set(mapeamentos
        .filter(item => item.papel !== 'ignorar')
        .map(item => String(item.coluna).toLowerCase()));
    const configuracoes = new Map(mapeamentos.map(item => [String(item.coluna).toLowerCase(), item]));
    const colunasOrigem = Array.from(new Set([
        ...(Array.isArray(widget.colunasConsulta) ? widget.colunasConsulta : []),
        ...mapeamentos.map(item => item.coluna).filter(Boolean)
    ]));
    return colunasOrigem
        .filter(coluna => {
            const nome = String(coluna).toLowerCase();
            const configuracao = configuracoes.get(nome);
            if (configuracao) return configuracao.papel === 'ignorar';
            return !widget.dadosConsultaAgregados && !colunasAtivas.has(nome);
        })
        .map(coluna => {
            const configuracao = configuracoes.get(String(coluna).toLowerCase()) || {};
            return {
                coluna,
                apelido: configuracao.apelido || coluna,
                formatoData: configuracao.formatoData || 'none',
                alinhamento: configuracao.alinhamento || 'left',
                ordenacao: configuracao.ordenacao || 'none'
            };
        });
}

function obterAlinhamentoCampo(campo, padrao = 'left') {
    return ['left', 'center', 'right'].includes(campo?.alinhamento) ? campo.alinhamento : padrao;
}

function obterOrdenacaoCampo(campo) {
    return ['asc', 'desc'].includes(campo?.ordenacao) ? campo.ordenacao : 'none';
}

function compararValoresOrdenacao(a, b) {
    const vazioA = a === null || a === undefined || a === '';
    const vazioB = b === null || b === undefined || b === '';
    if (vazioA || vazioB) return vazioA === vazioB ? 0 : (vazioA ? 1 : -1);
    const numeroA = typeof a === 'number' ? a : Number(String(a).replace(',', '.'));
    const numeroB = typeof b === 'number' ? b : Number(String(b).replace(',', '.'));
    if (Number.isFinite(numeroA) && Number.isFinite(numeroB)) return numeroA - numeroB;
    return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function compararRegistrosPorCampos(a, b, campos = []) {
    for (const campo of campos) {
        const direcao = obterOrdenacaoCampo(campo);
        if (direcao === 'none') continue;
        const comparacao = compararValoresOrdenacao(
            obterValorLinha(a, campo.coluna),
            obterValorLinha(b, campo.coluna)
        );
        if (comparacao !== 0) return direcao === 'desc' ? -comparacao : comparacao;
    }
    return 0;
}

function ordenarRegistrosPorCampos(registros, campos = []) {
    if (!campos.some(campo => obterOrdenacaoCampo(campo) !== 'none')) return registros;
    return registros.map((registro, index) => ({ registro, index }))
        .sort((a, b) => compararRegistrosPorCampos(a.registro, b.registro, campos) || a.index - b.index)
        .map(item => item.registro);
}

function atributoAlinhamentoCampo(campo, padrao = 'left') {
    return ` style="text-align: ${obterAlinhamentoCampo(campo, padrao)}"`;
}

function registrarContextoDrill(widgetId, filtros, campos) {
    const token = `${widgetId}-${++sequenciaContextoDrill}`;
    contextosDrillDashboard.set(token, { widgetId, filtros, campos });
    return token;
}

function renderizarControleDrill(widget, filtros, campos) {
    if (!campos.length) return '';
    const token = registrarContextoDrill(widget.id, filtros, campos);
    return `
        <span class="crm-drill-control">
            <button class="crm-drill-trigger" type="button" data-drill-toggle aria-label="Detalhar por outro campo" title="Detalhar por outro campo">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.5 7.2v5.3l-3 1.5v-6.8z"></path></svg>
            </button>
            <span class="crm-drill-menu" data-drill-menu hidden>
                <small>Detalhar por</small>
                ${campos.map(campo => `<button type="button" data-drill-context="${escapeHtml(token)}" data-drill-field="${escapeHtml(campo.coluna)}">${escapeHtml(obterApelidoMapeamento(campo))}</button>`).join('')}
            </span>
        </span>
    `;
}

function renderizarBreadcrumbDrill(widget, estado) {
    if (!estado?.campoAtual) return '';
    const filtros = estado.filtros || [];
    const caminho = filtros.map(filtro => `<span><b>${escapeHtml(filtro.apelido || filtro.coluna)}:</b> ${escapeHtml(filtro.rotulo)}</span>`).join('');
    return `
        <div class="crm-drill-breadcrumb">
            <button type="button" data-drill-back-widget="${escapeHtml(widget.id)}" aria-label="Voltar um nível" title="Voltar um nível">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>
            </button>
            <div>${caminho}<strong>Detalhe por ${escapeHtml(obterApelidoMapeamento(estado.campoAtual))}</strong></div>
        </div>
    `;
}

function prepararPaginacaoTabela(widget, registros, exportarTudo = false) {
    const configuracao = obterConfiguracaoTabela(widget);
    const totalRegistros = registros.length;
    if (exportarTudo) {
        return { registros, totalRegistros, totalExibicao: totalRegistros, pagina: 1, totalPaginas: 1, inicio: 0, fim: totalRegistros, mostrarControle: false };
    }

    const limite = configuracao.limiteExibicao > 0 ? configuracao.limiteExibicao : totalRegistros;
    const registrosExibiveis = registros.slice(0, limite);
    const totalExibicao = registrosExibiveis.length;
    if (!configuracao.paginacao) {
        return {
            registros: registrosExibiveis,
            totalRegistros,
            totalExibicao,
            pagina: 1,
            totalPaginas: 1,
            inicio: totalExibicao ? 1 : 0,
            fim: totalExibicao,
            mostrarControle: totalExibicao < totalRegistros
        };
    }

    const porPagina = configuracao.registrosPorPagina;
    const totalPaginas = Math.max(1, Math.ceil(totalExibicao / porPagina));
    const paginaSalva = normalizarQuantidadeTabela(paginasTabelaDashboard.get(widget.id), 1, 1, totalPaginas);
    paginasTabelaDashboard.set(widget.id, paginaSalva);
    const indiceInicial = (paginaSalva - 1) * porPagina;
    const registrosPagina = registrosExibiveis.slice(indiceInicial, indiceInicial + porPagina);
    return {
        registros: registrosPagina,
        totalRegistros,
        totalExibicao,
        pagina: paginaSalva,
        totalPaginas,
        inicio: registrosPagina.length ? indiceInicial + 1 : 0,
        fim: indiceInicial + registrosPagina.length,
        mostrarControle: true
    };
}

function renderizarControlePaginacaoTabela(widget, paginacao) {
    if (!paginacao.mostrarControle) return '';
    const limitado = paginacao.totalExibicao < paginacao.totalRegistros
        ? ' Limite visual: ' + paginacao.totalExibicao + ' de ' + paginacao.totalRegistros + '.'
        : '';
    return `
        <div class="crm-table-pagination" data-table-pagination-widget="${escapeHtml(widget.id)}">
            <span>Exibindo ${paginacao.inicio}-${paginacao.fim} de ${paginacao.totalExibicao}.${limitado}</span>
            <div>
                <button type="button" data-table-page="-1" aria-label="Página anterior" title="Página anterior"${paginacao.pagina <= 1 ? ' disabled' : ''}>‹</button>
                <strong>${paginacao.pagina} / ${paginacao.totalPaginas}</strong>
                <button type="button" data-table-page="1" aria-label="Próxima página" title="Próxima página"${paginacao.pagina >= paginacao.totalPaginas ? ' disabled' : ''}>›</button>
            </div>
        </div>
    `;
}

function renderizarResumoProximidade(widget, quantidadeVisivel) {
    const proximidade = widget?.proximidade;
    if (!proximidade) return '';
    const semLocalizacao = Number(proximidade.clientesSemCep || 0)
        + Number(proximidade.clientesSemCoordenadas || 0);
    const filiais = Array.isArray(proximidade.filiaisConsideradas)
        ? proximidade.filiaisConsideradas.length
        : 0;
    const aproximadosPorCidade = Number(proximidade.clientesAproximadosPorCidade || 0);
    const localidadesPendentes = Number(proximidade.localidadesPendentes || 0);
    return `
        <div class="crm-table-proximity-summary">
            <strong>${escapeHtml(quantidadeVisivel)} cliente${quantidadeVisivel === 1 ? '' : 's'} no raio de ${escapeHtml(proximidade.raioKm)} km${proximidade.ufReferencia ? ` em ${escapeHtml(proximidade.ufReferencia)}` : ''}</strong>
            <span>Distancia aproximada por bairro${filiais ? `, comparada com ${filiais} filial${filiais === 1 ? '' : 'is'}` : ''}${aproximadosPorCidade ? `. ${aproximadosPorCidade} temporariamente estimado${aproximadosPorCidade === 1 ? '' : 's'} pela cidade` : ''}${localidadesPendentes ? `. ${localidadesPendentes} bairro${localidadesPendentes === 1 ? '' : 's'} na fila de precisao` : ''}${semLocalizacao ? `. ${semLocalizacao} sem localizacao` : ''}.</span>
        </div>
    `;
}

function chaveValorAutoFiltro(valor) {
    if (valor === null) return 'null:';
    if (valor === undefined) return 'undefined:';
    if (valor instanceof Date) return 'date:' + valor.toISOString();
    return typeof valor + ':' + String(valor);
}

function rotuloValorAutoFiltro(valor) {
    if (valor === null || valor === undefined || valor === '') return '(Vazios)';
    if (valor === true) return 'Sim';
    if (valor === false) return 'Nao';
    return String(valor);
}

function chaveEstadoAutoFiltroTabela(widgetId) {
    return `${dashboardContextoAtivo}:${String(widgetId || '')}`;
}

function obterFiltrosColunaWidget(widgetId, criar = false) {
    const chave = chaveEstadoAutoFiltroTabela(widgetId);
    if (!filtrosColunaTabelaDashboard.has(chave) && criar) {
        filtrosColunaTabelaDashboard.set(chave, new Map());
    }
    return filtrosColunaTabelaDashboard.get(chave) || new Map();
}

function limparFiltrosColunaWidget(widgetId) {
    filtrosColunaTabelaDashboard.delete(chaveEstadoAutoFiltroTabela(widgetId));
}

function condicaoAutoFiltroAtiva(condicao) {
    return condicao && String(condicao.operador || 'none') !== 'none';
}

function compararCondicaoAutoFiltro(valor, condicao) {
    const operador = String(condicao?.operador || 'none');
    if (operador === 'none') return true;
    const vazio = valor === null || valor === undefined || valor === '';
    if (operador === 'blank') return vazio;
    if (operador === 'not_blank') return !vazio;

    const texto = String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    const termo = String(condicao?.valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    if (operador === 'contains') return texto.includes(termo);
    if (operador === 'not_contains') return !texto.includes(termo);
    if (operador === 'starts_with') return texto.startsWith(termo);
    if (operador === 'ends_with') return texto.endsWith(termo);
    if (operador === 'equals') return texto === termo;
    if (operador === 'not_equals') return texto !== termo;

    const comparacao = compararValoresOrdenacao(valor, condicao?.valor ?? '');
    if (operador === 'gt') return comparacao > 0;
    if (operador === 'gte') return comparacao >= 0;
    if (operador === 'lt') return comparacao < 0;
    if (operador === 'lte') return comparacao <= 0;
    return true;
}

function aplicarAutoFiltrosTabela(widgetId, registros) {
    const filtros = obterFiltrosColunaWidget(widgetId);
    if (!filtros.size) return registros;
    return registros.filter(registro => Array.from(filtros.entries()).every(([coluna, filtro]) => {
        const valor = obterValorLinha(registro, coluna);
        if (Array.isArray(filtro.selecionados)) {
            if (!new Set(filtro.selecionados).has(chaveValorAutoFiltro(valor))) return false;
        }
        const condicoes = (Array.isArray(filtro.condicoes) ? filtro.condicoes : []).filter(condicaoAutoFiltroAtiva);
        if (!condicoes.length) return true;
        const resultados = condicoes.map(condicao => compararCondicaoAutoFiltro(valor, condicao));
        return String(filtro.combinacao || 'and').toLowerCase() === 'or'
            ? resultados.some(Boolean)
            : resultados.every(Boolean);
    }));
}

function opcoesOperadorAutoFiltro(selecionado = 'none') {
    const opcoes = [
        ['none', 'Sem condicao'], ['contains', 'Contem'], ['not_contains', 'Nao contem'],
        ['equals', 'Igual a'], ['not_equals', 'Diferente de'], ['starts_with', 'Comeca com'],
        ['ends_with', 'Termina com'], ['gt', 'Maior que'], ['gte', 'Maior ou igual'],
        ['lt', 'Menor que'], ['lte', 'Menor ou igual'], ['blank', 'Esta vazio'], ['not_blank', 'Nao esta vazio']
    ];
    return opcoes.map(([valor, rotulo]) => `<option value="${valor}"${valor === selecionado ? ' selected' : ''}>${rotulo}</option>`).join('');
}

function obterValoresDistintosAutoFiltro(registros, campo) {
    const valores = new Map();
    registros.forEach(registro => {
        const valor = obterValorLinha(registro, campo.coluna);
        const chave = chaveValorAutoFiltro(valor);
        if (!valores.has(chave)) valores.set(chave, { chave, valor, rotulo: rotuloValorAutoFiltro(valor) });
    });
    return Array.from(valores.values()).sort((a, b) => compararValoresOrdenacao(a.valor, b.valor));
}

function renderizarMenuAutoFiltroTabela(widget, campo, registrosBase) {
    const filtros = obterFiltrosColunaWidget(widget.id);
    const filtro = filtros.get(String(campo.coluna)) || {};
    const valores = obterValoresDistintosAutoFiltro(registrosBase, campo);
    const selecionados = Array.isArray(filtro.selecionados) ? new Set(filtro.selecionados) : null;
    const condicoes = Array.isArray(filtro.condicoes) ? filtro.condicoes : [];
    const primeira = condicoes[0] || { operador: 'none', valor: '' };
    const segunda = condicoes[1] || { operador: 'none', valor: '' };
    const ativo = selecionados !== null || condicoes.some(condicaoAutoFiltroAtiva);
    const todosMarcados = selecionados === null || valores.every(item => selecionados.has(item.chave));
    const quantidadeMarcada = selecionados === null ? valores.length : valores.filter(item => selecionados.has(item.chave)).length;
    return `
        <span class="crm-table-filter-control${ativo ? ' is-active' : ''}">
            <button type="button" data-table-filter-toggle data-filter-widget="${escapeHtml(widget.id)}" data-filter-field="${escapeHtml(campo.coluna)}" aria-label="Filtrar ${escapeHtml(obterApelidoMapeamento(campo))}" title="Filtrar coluna">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.5 7.2v5.3l-3 1.5v-6.8z"></path></svg>
            </button>
            <span class="crm-table-filter-menu" data-table-filter-menu data-filter-widget="${escapeHtml(widget.id)}" data-filter-field="${escapeHtml(campo.coluna)}" hidden>
                <span class="crm-table-filter-head"><strong>${escapeHtml(obterApelidoMapeamento(campo))}</strong><button type="button" data-table-filter-close aria-label="Fechar filtro">&times;</button></span>
                <input type="search" placeholder="Pesquisar valores..." data-table-filter-search>
                <span class="crm-table-filter-values" data-table-filter-values>
                    <label class="is-all"><input type="checkbox" data-table-filter-all${todosMarcados ? ' checked' : ''}${quantidadeMarcada > 0 && !todosMarcados ? ' data-indeterminate="true"' : ''}><span>Selecionar todos</span></label>
                    ${valores.map(item => `<label data-filter-option data-filter-search-text="${escapeHtml(item.rotulo.toLocaleLowerCase('pt-BR'))}"><input type="checkbox" value="${escapeHtml(item.chave)}" data-table-filter-value${selecionados === null || selecionados.has(item.chave) ? ' checked' : ''}><span>${escapeHtml(item.rotulo)}</span></label>`).join('')}
                </span>
                <span class="crm-table-filter-conditions">
                    <small>Condicoes personalizadas</small>
                    <span><select data-table-filter-operator="0">${opcoesOperadorAutoFiltro(primeira.operador)}</select><input type="text" value="${escapeHtml(primeira.valor || '')}" placeholder="Valor" data-table-filter-condition-value="0"></span>
                    <select data-table-filter-combination aria-label="Combinar condicoes"><option value="and"${filtro.combinacao !== 'or' ? ' selected' : ''}>E</option><option value="or"${filtro.combinacao === 'or' ? ' selected' : ''}>OU</option></select>
                    <span><select data-table-filter-operator="1">${opcoesOperadorAutoFiltro(segunda.operador)}</select><input type="text" value="${escapeHtml(segunda.valor || '')}" placeholder="Valor" data-table-filter-condition-value="1"></span>
                </span>
                <span class="crm-table-filter-actions"><button type="button" data-table-filter-clear>Limpar</button><button type="button" data-table-filter-apply>Aplicar</button></span>
            </span>
        </span>
    `;
}

function renderizarCabecalhoAutoFiltro(widget, campo, registrosBase, rotulo = '') {
    const texto = rotulo || obterApelidoMapeamento(campo);
    const conteudo = renderizarConteudoCelula(widget, campo, registrosBase?.[0] || {}, texto, { somenteIcones: true });
    return `<span class="crm-table-filter-heading"><span class="crm-table-filter-label">${conteudo}</span>${renderizarMenuAutoFiltroTabela(widget, campo, registrosBase)}</span>`;
}

function renderizarResumoAutoFiltrosTabela(widget) {
    const filtros = obterFiltrosColunaWidget(widget.id);
    if (!filtros.size) return '';
    const mapeamentos = new Map((widget.mapeamentos || []).map(item => [String(item.coluna), item]));
    return `<div class="crm-table-active-filters"><span><strong>Filtros ativos:</strong><span class="crm-table-filter-chips">${Array.from(filtros.keys()).map(coluna => `<button type="button" data-table-filter-clear-field data-filter-widget="${escapeHtml(widget.id)}" data-filter-field="${escapeHtml(coluna)}" title="Remover este filtro">${escapeHtml(obterApelidoMapeamento(mapeamentos.get(coluna) || { coluna }))} &times;</button>`).join('')}</span></span><button type="button" data-table-filter-clear-all data-filter-widget="${escapeHtml(widget.id)}">Limpar todos</button></div>`;
}

function fecharMenusAutoFiltroTabela(exceto = null) {
    document.querySelectorAll('[data-table-filter-menu]').forEach(menu => {
        if (menu !== exceto) menu.hidden = true;
    });
}

function posicionarMenuAutoFiltroTabela(menu, botao) {
    if (!menu || !botao) return;
    const retangulo = botao.getBoundingClientRect();
    const largura = Math.min(360, Math.max(280, window.innerWidth - 24));
    const esquerda = Math.min(window.innerWidth - largura - 12, Math.max(12, retangulo.right - largura));
    const topoPreferido = retangulo.bottom + 6;
    menu.style.width = largura + 'px';
    menu.style.left = esquerda + 'px';
    menu.style.top = Math.min(topoPreferido, Math.max(12, window.innerHeight - 520)) + 'px';
}

function atualizarSelecaoMenuAutoFiltro(menu) {
    if (!menu) return;
    const opcoes = Array.from(menu.querySelectorAll('[data-table-filter-value]'));
    const visiveis = opcoes.filter(input => !input.closest('[data-filter-option]')?.hidden);
    const marcadas = visiveis.filter(input => input.checked);
    const todos = menu.querySelector('[data-table-filter-all]');
    if (todos) {
        todos.checked = visiveis.length > 0 && marcadas.length === visiveis.length;
        todos.indeterminate = marcadas.length > 0 && marcadas.length < visiveis.length;
    }
}

function renderizarTabelaAposAutoFiltro(widgetId) {
    const id = String(widgetId || '');
    paginasTabelaDashboard.set(id, 1);
    if (widgetDetalheModalAtual && String(widgetDetalheModalAtual.id) === id) {
        renderizarRelatorioDetalheAtual();
        return;
    }
    const widget = obterWidgetExportacao(id);
    const seletor = window.CSS?.escape ? window.CSS.escape(id) : id.replace(/"/g, '\\"');
    const container = dashboardCanvas?.querySelector(`[data-widget-id="${seletor}"] [data-chart-widget]`);
    if (widget && container) renderizarTabelaGrafico(container, widget);
}

function tratarCliqueAutoFiltroTabela(event) {
    const alternador = event.target.closest('[data-table-filter-toggle]');
    if (alternador) {
        const controle = alternador.closest('.crm-table-filter-control');
        const menu = controle?.querySelector('[data-table-filter-menu]');
        const abrir = Boolean(menu?.hidden);
        fecharMenusAutoFiltroTabela(menu);
        if (menu) {
            menu.hidden = !abrir;
            if (abrir) {
                posicionarMenuAutoFiltroTabela(menu, alternador);
                menu.querySelectorAll('[data-indeterminate="true"]').forEach(input => { input.indeterminate = true; });
                atualizarSelecaoMenuAutoFiltro(menu);
                setTimeout(() => menu.querySelector('[data-table-filter-search]')?.focus(), 0);
            }
        }
        return true;
    }

    const menu = event.target.closest('[data-table-filter-menu]');
    const limparTodos = event.target.closest('[data-table-filter-clear-all]');
    if (limparTodos) {
        limparFiltrosColunaWidget(limparTodos.dataset.filterWidget);
        renderizarTabelaAposAutoFiltro(limparTodos.dataset.filterWidget);
        return true;
    }
    const limparCampo = event.target.closest('[data-table-filter-clear-field]');
    if (limparCampo) {
        const widgetId = String(limparCampo.dataset.filterWidget || '');
        const filtros = obterFiltrosColunaWidget(widgetId);
        filtros.delete(String(limparCampo.dataset.filterField || ''));
        if (!filtros.size) limparFiltrosColunaWidget(widgetId);
        renderizarTabelaAposAutoFiltro(widgetId);
        return true;
    }
    if (!menu) return false;
    if (event.target.closest('[data-table-filter-close]')) {
        menu.hidden = true;
        return true;
    }
    const widgetId = String(menu.dataset.filterWidget || '');
    const campo = String(menu.dataset.filterField || '');
    if (event.target.closest('[data-table-filter-clear]')) {
        const filtros = obterFiltrosColunaWidget(widgetId);
        filtros.delete(campo);
        if (!filtros.size) limparFiltrosColunaWidget(widgetId);
        renderizarTabelaAposAutoFiltro(widgetId);
        return true;
    }
    if (event.target.closest('[data-table-filter-apply]')) {
        const opcoes = Array.from(menu.querySelectorAll('[data-table-filter-value]'));
        const marcadas = opcoes.filter(input => input.checked).map(input => input.value);
        const condicoes = [0, 1].map(indice => ({
            operador: menu.querySelector(`[data-table-filter-operator="${indice}"]`)?.value || 'none',
            valor: menu.querySelector(`[data-table-filter-condition-value="${indice}"]`)?.value || ''
        }));
        const filtro = {
            selecionados: marcadas.length === opcoes.length ? null : marcadas,
            combinacao: menu.querySelector('[data-table-filter-combination]')?.value || 'and',
            condicoes
        };
        const ativo = filtro.selecionados !== null || condicoes.some(condicaoAutoFiltroAtiva);
        const filtros = obterFiltrosColunaWidget(widgetId, true);
        if (ativo) filtros.set(campo, filtro);
        else filtros.delete(campo);
        if (!filtros.size) limparFiltrosColunaWidget(widgetId);
        renderizarTabelaAposAutoFiltro(widgetId);
        return true;
    }
    return true;
}

function tratarPesquisaAutoFiltroTabela(event) {
    if (!event.target.matches('[data-table-filter-search]')) return;
    const menu = event.target.closest('[data-table-filter-menu]');
    const termo = String(event.target.value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    menu?.querySelectorAll('[data-filter-option]').forEach(opcao => {
        const texto = String(opcao.dataset.filterSearchText || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        opcao.hidden = Boolean(termo) && !texto.includes(termo);
    });
    atualizarSelecaoMenuAutoFiltro(menu);
}

function tratarSelecaoAutoFiltroTabela(event) {
    const menu = event.target.closest('[data-table-filter-menu]');
    if (!menu) return;
    if (event.target.matches('[data-table-filter-all]')) {
        menu.querySelectorAll('[data-table-filter-value]').forEach(input => {
            if (!input.closest('[data-filter-option]')?.hidden) input.checked = event.target.checked;
        });
    }
    if (event.target.matches('[data-table-filter-all], [data-table-filter-value]')) atualizarSelecaoMenuAutoFiltro(menu);
}

function renderizarTabelaSimples(container, widget, registros, registrosTotalizacao, registrosBase, camposExibidos, camposDetalhe, configuracao) {
    const cabecalho = camposExibidos.map(campo => `<th class="crm-filterable-header"${atributoAlinhamentoCampo(campo, campo.papel === 'valor' ? 'right' : 'left')}>${renderizarCabecalhoAutoFiltro(widget, campo, registrosBase)}</th>`).join('');
    const corpo = registros.map(registro => {
        const filtrosLinha = [];
        const celulas = camposExibidos.map(campo => {
            if (campo.papel === 'valor') {
                const bruto = obterValorLinha(registro, campo.coluna);
                const formatado = formatarValorGrafico(calcularAgregacao([bruto], campo.agregacao || 'none'), campo.formatoValor);
                return `<td class="is-value"${atributoAlinhamentoCampo(campo, 'right')}><span class="crm-cell-content">${renderizarConteudoCelula(widget, campo, registro, formatado)}</span></td>`;
            }
            const bruto = obterValorLinha(registro, campo.coluna);
            const rotulo = formatarDimensao(bruto, campo.formatoData);
            if (campo.papel === 'linha') {
                filtrosLinha.push({ coluna: campo.coluna, apelido: obterApelidoMapeamento(campo), valor: bruto, rotulo });
            }
            const controle = campo.papel === 'linha'
                ? renderizarControleDrill(widget, filtrosLinha.slice(), camposDetalhe)
                : '';
            return `<td class="is-dimension"${atributoAlinhamentoCampo(campo)}><span class="crm-dimension-cell"><span class="crm-cell-content">${renderizarConteudoCelula(widget, campo, registro, rotulo)}</span>${controle}</span></td>`;
        }).join('');
        return `<tr>${celulas}</tr>`;
    }).join('');
    let rotuloTotalInserido = false;
    const total = configuracao.totalLinhas ? `<tr class="crm-pivot-grand-total">${camposExibidos.map(campo => {
        if (campo.papel === 'valor') {
            const agregado = calcularAgregacao(registrosTotalizacao.map(registro => obterValorLinha(registro, campo.coluna)), campo.agregacao || 'none');
            return `<td class="is-value"${atributoAlinhamentoCampo(campo, 'right')}>${escapeHtml(formatarValorGrafico(agregado, campo.formatoValor))}</td>`;
        }
        const rotulo = rotuloTotalInserido ? '' : 'Total geral';
        rotuloTotalInserido = true;
        return `<td${atributoAlinhamentoCampo(campo)}>${rotulo}</td>`;
    }).join('')}</tr>` : '';
    container.innerHTML = `
        <div class="crm-chart-table-real">
            <table class="crm-pivot-table crm-simple-table">
                <thead><tr>${cabecalho}</tr></thead>
                <tbody>${corpo}${total}</tbody>
            </table>
        </div>
    `;
}

function renderizarTabelaGrafico(container, widget, opcoes = {}) {
    const estadoDrill = estadosDrillDashboard.get(widget.id);
    const todosRegistros = estadoDrill?.campoAtual
        ? (Array.isArray(estadoDrill.dados) ? estadoDrill.dados : [])
        : (Array.isArray(widget.dadosConsulta) ? widget.dadosConsulta : []);
    const mapeamentos = Array.isArray(widget.mapeamentos) ? widget.mapeamentos : [];
    const camposLinhaConfigurados = mapeamentos.filter(item => item.papel === 'linha');
    const camposColuna = mapeamentos.filter(item => item.papel === 'coluna');
    const valores = mapeamentos.filter(item => item.papel === 'valor');
    const camposDetalhe = obterCamposDetalheWidget(widget, mapeamentos);
    const configuracao = obterConfiguracaoTabela(widget);
    const camposAgrupamento = estadoDrill?.campoAtual
        ? []
        : camposLinhaConfigurados.filter(campo => configuracao.agrupamentos.includes(String(campo.coluna)));
    const chavesAgrupamento = new Set(camposAgrupamento.map(campo => String(campo.coluna)));
    const camposLinhaDetalhe = camposLinhaConfigurados.filter(campo => !chavesAgrupamento.has(String(campo.coluna)));
    const filtrosAtivos = estadoDrill?.filtros || [];
    const camposLinha = estadoDrill?.campoAtual ? [estadoDrill.campoAtual] : camposLinhaConfigurados;
    const camposOrdenacao = estadoDrill?.campoAtual
        ? [estadoDrill.campoAtual, ...valores]
        : mapeamentos.filter(item => item.papel !== 'ignorar');
    const registrosFiltrados = aplicarAutoFiltrosTabela(widget.id, todosRegistros);
    const registrosOrdenados = ordenarRegistrosPorCampos(registrosFiltrados, camposOrdenacao);
    const paginacao = prepararPaginacaoTabela(widget, registrosOrdenados, opcoes.exportarTudo === true);
    const registros = paginacao.registros;
    const resumoProximidade = estadoDrill?.campoAtual
        ? ''
        : renderizarResumoProximidade(widget, registrosOrdenados.length);
    const resumoAutoFiltros = renderizarResumoAutoFiltrosTabela(widget);

    if (!camposLinhaConfigurados.length || !valores.length) {
        container.innerHTML = '<div class="crm-chart-empty">Defina ao menos um campo de linha e um campo de valor.</div>';
        return;
    }
    if (estadoDrill?.carregando) {
        container.innerHTML = `${renderizarBreadcrumbDrill(widget, estadoDrill)}<div class="crm-chart-empty">Carregando detalhamento...</div>`;
        return;
    }
    if (estadoDrill?.erro) {
        container.innerHTML = `${renderizarBreadcrumbDrill(widget, estadoDrill)}<div class="crm-chart-empty">${escapeHtml(estadoDrill.erro)}</div>`;
        return;
    }
    if (!registros.length) {
        container.innerHTML = `${renderizarBreadcrumbDrill(widget, estadoDrill)}${resumoProximidade}${resumoAutoFiltros}<div class="crm-chart-empty">Nenhum registro encontrado neste relatorio.</div>`;
        return;
    }

    const colunasFiltradas = new Set(filtrosAtivos.map(filtro => String(filtro.coluna).toLowerCase()));
    const camposDetalheDisponiveis = camposDetalhe.filter(campo =>
        !colunasFiltradas.has(String(campo.coluna).toLowerCase())
        && !camposLinha.some(linha => String(linha.coluna).toLowerCase() === String(campo.coluna).toLowerCase())
    );

    if (widget.tipo === 'table' && !estadoDrill?.campoAtual) {
        renderizarTabelaSimples(
            container,
            widget,
            registros,
            registrosOrdenados,
            todosRegistros,
            mapeamentos.filter(item => item.papel !== 'ignorar'),
            camposDetalheDisponiveis,
            configuracao
        );
        container.insertAdjacentHTML('afterbegin', resumoProximidade);
        container.insertAdjacentHTML('afterbegin', resumoAutoFiltros);
        container.insertAdjacentHTML('beforeend', renderizarControlePaginacaoTabela(widget, paginacao));
        return;
    }

    const colunasDinamicas = camposColuna.length
        ? Array.from(new Map(registrosOrdenados.map(registro => {
            const chave = chaveCamposRegistro(registro, camposColuna);
            const rotulo = camposColuna
                .map(campo => formatarDimensao(obterValorLinha(registro, campo.coluna), campo.formatoData))
                .join(' / ');
            return [chave, { chave, rotulo }];
        })).values())
        : [{ chave: '__sem_coluna__', rotulo: '' }];
    const temCabecalhoDuplo = camposColuna.length > 0;
    const totalColunasAtivo = configuracao.totalColunas && temCabecalhoDuplo;
    const quantidadeMetricas = valores.length;
    const campoColunaPrincipal = camposColuna[0];
    const montarCabecalho = camposCabecalho => {
        const dimensoesCabecalho = camposCabecalho.length
            ? camposCabecalho
            : [{ coluna: '__resumo__', apelido: 'Resumo', alinhamento: 'left' }];
        const cabecalhoLinhas = dimensoesCabecalho.map(campo =>
            `<th class="crm-filterable-header"${atributoAlinhamentoCampo(campo)}${temCabecalhoDuplo ? ' rowspan="2"' : ''}>${campo.coluna === '__resumo__' ? escapeHtml(obterApelidoMapeamento(campo)) : renderizarCabecalhoAutoFiltro(widget, campo, todosRegistros)}</th>`
        ).join('');
        return temCabecalhoDuplo
            ? `<tr>${cabecalhoLinhas}${colunasDinamicas.map(coluna => `<th class="crm-filterable-header"${atributoAlinhamentoCampo(campoColunaPrincipal, 'center')} colspan="${quantidadeMetricas}">${renderizarCabecalhoAutoFiltro(widget, campoColunaPrincipal, todosRegistros, coluna.rotulo)}</th>`).join('')}${totalColunasAtivo ? `<th colspan="${quantidadeMetricas}">Total geral</th>` : ''}</tr>
               <tr>${colunasDinamicas.concat(totalColunasAtivo ? [{ chave: '__total__' }] : []).map(coluna => valores.map(valor => `<th${coluna.chave === '__total__' ? '' : ' class="crm-filterable-header"'}${atributoAlinhamentoCampo(valor, 'right')}>${coluna.chave === '__total__' ? escapeHtml(obterApelidoMapeamento(valor)) : renderizarCabecalhoAutoFiltro(widget, valor, todosRegistros)}</th>`).join('')).join('')}</tr>`
            : `<tr>${cabecalhoLinhas}${valores.map(valor => `<th class="crm-filterable-header"${atributoAlinhamentoCampo(valor, 'right')}>${renderizarCabecalhoAutoFiltro(widget, valor, todosRegistros)}</th>`).join('')}</tr>`;
    };
    const cabecalho = montarCabecalho(camposLinha);
    const estadoRotulos = { anteriores: [] };
    const renderizarCelulasValor = registrosGrupo => {
        const porColuna = colunasDinamicas.map(coluna => {
            const registrosColuna = temCabecalhoDuplo
                ? registrosGrupo.filter(registro => chaveCamposRegistro(registro, camposColuna) === coluna.chave)
                : registrosGrupo;
            return valores.map(valor => {
                const total = calcularAgregacao(
                    registrosColuna.map(registro => obterValorLinha(registro, valor.coluna)),
                    valor.agregacao || 'none'
                );
                const texto = formatarValorGrafico(total, valor.formatoValor);
                return `<td class="is-value"${atributoAlinhamentoCampo(valor, 'right')}><span class="crm-cell-content">${renderizarConteudoCelula(widget, valor, registrosColuna[0] || registrosGrupo[0] || {}, texto)}</span></td>`;
            }).join('');
        }).join('');
        const totais = totalColunasAtivo ? valores.map(valor => {
            const total = calcularAgregacao(
                registrosGrupo.map(registro => obterValorLinha(registro, valor.coluna)),
                valor.agregacao || 'none'
            );
            const texto = formatarValorGrafico(total, valor.formatoValor);
            return `<td class="is-value is-total"${atributoAlinhamentoCampo(valor, 'right')}><span class="crm-cell-content">${renderizarConteudoCelula(widget, valor, registrosGrupo[0] || {}, texto)}</span></td>`;
        }).join('') : '';
        return porColuna + totais;
    };
    const registrosDoCaminho = caminho => registrosOrdenados.filter(registro =>
        caminho.every(parte => compararValoresOrdenacao(obterValorLinha(registro, parte.campo.coluna), parte.valor) === 0)
    );
    const renderizarLinhaBase = (caminho, registrosGrupo) => {
        const primeiroAlterado = caminho.findIndex((item, index) => estadoRotulos.anteriores[index] !== item.rotulo);
        const celulasLinha = caminho.map((item, index) => {
            const exibir = configuracao.repetirRotulos || primeiroAlterado < 0 || index >= primeiroAlterado;
            const filtrosContexto = [...filtrosAtivos, ...caminho.slice(0, index + 1).map(parte => ({
                coluna: parte.campo.coluna,
                apelido: obterApelidoMapeamento(parte.campo),
                valor: parte.valor,
                rotulo: parte.rotulo
            }))];
            const controle = renderizarControleDrill(widget, filtrosContexto, camposDetalheDisponiveis);
            const conteudo = exibir ? renderizarConteudoCelula(widget, item.campo, registrosGrupo[0] || {}, item.rotulo) : '';
            return `<td class="is-dimension"${atributoAlinhamentoCampo(item.campo)}><span class="crm-dimension-cell"><span class="crm-cell-content">${conteudo}</span>${controle}</span></td>`;
        }).join('');
        estadoRotulos.anteriores = caminho.map(item => item.rotulo);
        return `<tr>${celulasLinha}${renderizarCelulasValor(registrosGrupo)}</tr>`;
    };
    const renderizarNivel = (registrosNivel, nivel = 0, caminho = []) => {
        const campo = camposLinha[nivel];
        return agruparRegistros(registrosNivel, campo, valores).map(grupo => {
            const novoCaminho = [...caminho, { campo, valor: grupo.valor, rotulo: grupo.rotulo }];
            let conteudo = nivel === camposLinha.length - 1
                ? renderizarLinhaBase(novoCaminho, grupo.registros)
                : renderizarNivel(grupo.registros, nivel + 1, novoCaminho);
            if (!estadoDrill?.campoAtual && configuracao.subtotais.includes(String(campo.coluna)) && nivel < camposLinha.length - 1) {
                conteudo += `<tr class="crm-pivot-subtotal"><td${atributoAlinhamentoCampo(campo)} colspan="${camposLinha.length}">Subtotal ${escapeHtml(obterApelidoMapeamento(campo))}: ${escapeHtml(grupo.rotulo)}</td>${renderizarCelulasValor(registrosDoCaminho(novoCaminho))}</tr>`;
                estadoRotulos.anteriores = [];
            }
            return conteudo;
        }).join('');
    };

    const quantidadeCelulasValor = (colunasDinamicas.length * quantidadeMetricas)
        + (totalColunasAtivo ? quantidadeMetricas : 0);
    const quantidadeDimensoesDetalhe = Math.max(1, camposLinhaDetalhe.length);
    const quantidadeColunasAgrupadas = quantidadeDimensoesDetalhe + quantidadeCelulasValor;

    const filtrosDoCaminho = caminho => [...filtrosAtivos, ...caminho.map(parte => ({
        coluna: parte.campo.coluna,
        apelido: obterApelidoMapeamento(parte.campo),
        valor: parte.valor,
        rotulo: parte.rotulo
    }))];

    const renderizarLinhaDetalheAgrupada = (caminhoGrupo, caminhoDetalhe, registrosGrupo) => {
        if (!caminhoDetalhe.length) {
            return `<tr class="crm-pivot-group-summary"><td class="is-dimension">Resultado</td>${renderizarCelulasValor(registrosGrupo)}</tr>`;
        }
        const primeiroAlterado = caminhoDetalhe.findIndex((item, index) => estadoRotulos.anteriores[index] !== item.rotulo);
        const celulas = caminhoDetalhe.map((item, index) => {
            const exibir = configuracao.repetirRotulos || primeiroAlterado < 0 || index >= primeiroAlterado;
            const controle = renderizarControleDrill(
                widget,
                filtrosDoCaminho([...caminhoGrupo, ...caminhoDetalhe.slice(0, index + 1)]),
                camposDetalheDisponiveis
            );
            const conteudo = exibir ? renderizarConteudoCelula(widget, item.campo, registrosGrupo[0] || {}, item.rotulo) : '';
            return `<td class="is-dimension"${atributoAlinhamentoCampo(item.campo)}><span class="crm-dimension-cell"><span class="crm-cell-content">${conteudo}</span>${controle}</span></td>`;
        }).join('');
        estadoRotulos.anteriores = caminhoDetalhe.map(item => item.rotulo);
        return `<tr>${celulas}${renderizarCelulasValor(registrosGrupo)}</tr>`;
    };

    const renderizarDetalhesAgrupados = (registrosGrupo, caminhoGrupo, nivel = 0, caminhoDetalhe = []) => {
        if (!camposLinhaDetalhe.length) return renderizarLinhaDetalheAgrupada(caminhoGrupo, [], registrosGrupo);
        const campo = camposLinhaDetalhe[nivel];
        return agruparRegistros(registrosGrupo, campo, valores).map(grupo => {
            const novoCaminho = [...caminhoDetalhe, { campo, valor: grupo.valor, rotulo: grupo.rotulo }];
            return nivel === camposLinhaDetalhe.length - 1
                ? renderizarLinhaDetalheAgrupada(caminhoGrupo, novoCaminho, grupo.registros)
                : renderizarDetalhesAgrupados(grupo.registros, caminhoGrupo, nivel + 1, novoCaminho);
        }).join('');
    };

    const renderizarAgrupamentos = (registrosGrupo, nivel = 0, caminhoGrupo = []) => {
        const campo = camposAgrupamento[nivel];
        return agruparRegistros(registrosGrupo, campo, valores).map(grupo => {
            const novoCaminho = [...caminhoGrupo, { campo, valor: grupo.valor, rotulo: grupo.rotulo }];
            const controle = renderizarControleDrill(widget, filtrosDoCaminho(novoCaminho), camposDetalheDisponiveis);
            const faixaGrupo = `<tr class="crm-pivot-group-band" style="--group-level:${nivel}"><th colspan="${quantidadeColunasAgrupadas}"><span class="crm-pivot-group-title"><small>${escapeHtml(obterApelidoMapeamento(campo))}</small><strong>${escapeHtml(grupo.rotulo)}</strong>${controle}</span></th></tr>`;
            estadoRotulos.anteriores = [];
            const conteudo = nivel === camposAgrupamento.length - 1
                ? `${montarCabecalho(camposLinhaDetalhe).replace(/<tr>/g, '<tr class="crm-pivot-group-columns">')}${renderizarDetalhesAgrupados(grupo.registros, novoCaminho)}`
                : renderizarAgrupamentos(grupo.registros, nivel + 1, novoCaminho);
            const subtotal = configuracao.subtotais.includes(String(campo.coluna))
                ? `<tr class="crm-pivot-subtotal"><td${atributoAlinhamentoCampo(campo)} colspan="${quantidadeDimensoesDetalhe}">Subtotal ${escapeHtml(grupo.rotulo)}</td>${renderizarCelulasValor(registrosDoCaminho(novoCaminho))}</tr>`
                : '';
            estadoRotulos.anteriores = [];
            return faixaGrupo + conteudo + subtotal;
        }).join('');
    };
    const possuiAgrupamentos = camposAgrupamento.length > 0;
    const corpo = possuiAgrupamentos
        ? renderizarAgrupamentos(registros)
        : renderizarNivel(registros);
    const campoRotuloTotal = possuiAgrupamentos
        ? (camposLinhaDetalhe[0] || camposAgrupamento[0])
        : camposLinha[0];
    const colspanTotal = possuiAgrupamentos ? quantidadeDimensoesDetalhe : camposLinha.length;
    const totalGeral = configuracao.totalLinhas
        ? `<tr class="crm-pivot-grand-total"><td${atributoAlinhamentoCampo(campoRotuloTotal)} colspan="${colspanTotal}">Total geral</td>${renderizarCelulasValor(registrosOrdenados)}</tr>`
        : '';
    container.innerHTML = `
        ${renderizarBreadcrumbDrill(widget, estadoDrill)}
        ${resumoProximidade}
        ${resumoAutoFiltros}
        <div class="crm-chart-table-real">
            <table class="crm-pivot-table${possuiAgrupamentos ? ' is-sectioned' : ''}">
                ${possuiAgrupamentos ? '' : `<thead>${cabecalho}</thead>`}
                <tbody>${corpo}${totalGeral}</tbody>
            </table>
        </div>
        ${renderizarControlePaginacaoTabela(widget, paginacao)}
    `;
}

function obterColunaDetalhe(colunas, nome) {
    const procurada = String(nome || '').trim().toLowerCase();
    return colunas.find(coluna => String(coluna).toLowerCase() === procurada) || '';
}

function separarAliasCampoDetalhe(valor) {
    const texto = String(valor || '').trim();
    const match = texto.match(/^([\s\S]+?)\s+AS\s+(?:"((?:[^"]|"")+)"|([a-z_][a-z0-9_$ ]*))$/i);
    if (!match) return { expressao: texto, apelido: texto };
    const apelido = String(match[2] ?? match[3] ?? '').replace(/""/g, '"').trim();
    if (!apelido) throw new Error('Informe um apelido valido para a coluna exibida.');
    return { expressao: match[1].trim(), apelido };
}

function decomporExpressaoTabelaDetalhe(expressao) {
    const texto = String(expressao || '').trim();
    const coalesce = texto.match(/^COALESCE\s*\(([\s\S]*)\)$/i);
    if (coalesce) {
        const argumentos = separarExpressoesTabelaDetalhe(coalesce[1]);
        if (argumentos.length < 2) throw new Error('COALESCE exige pelo menos dois campos.');
        return { tipo: 'coalesce', argumentos: argumentos.map(decomporExpressaoTabelaDetalhe) };
    }
    if (!/^[a-z_][a-z0-9_$.]*$/i.test(texto)) {
        throw new Error('Expressao nao suportada em Colunas exibidas: ' + texto + '. Use apenas campos e COALESCE.');
    }
    return { tipo: 'campo', campo: texto };
}

function camposExpressaoTabelaDetalhe(expressao) {
    const estrutura = typeof expressao === 'string' ? decomporExpressaoTabelaDetalhe(expressao) : expressao;
    return estrutura.tipo === 'campo'
        ? [estrutura.campo]
        : estrutura.argumentos.flatMap(camposExpressaoTabelaDetalhe);
}

function resolverExpressaoTabelaDetalhe(registro, colunas, expressao) {
    const estrutura = typeof expressao === 'string' ? decomporExpressaoTabelaDetalhe(expressao) : expressao;
    if (estrutura.tipo === 'campo') {
        const coluna = obterColunaDetalhe(colunas, estrutura.campo);
        return obterValorLinha(registro, coluna);
    }
    for (const argumento of estrutura.argumentos) {
        const valor = resolverExpressaoTabelaDetalhe(registro, colunas, argumento);
        if (valor !== null && valor !== undefined) return valor;
    }
    return null;
}

function normalizarNomeCampoContato(valor) {
    return String(valor || '').split('.').pop().trim().toUpperCase();
}

function encontrarCampoContato(linha, nomes) {
    const esperados = new Set(nomes.map(normalizarNomeCampoContato));
    return Object.keys(linha || {}).find(chave => esperados.has(normalizarNomeCampoContato(chave))) || '';
}

function obterValorContato(linha, nomes, fallback = null) {
    const campo = encontrarCampoContato(linha, nomes);
    const valor = campo ? linha[campo] : null;
    return valor === null || valor === undefined || valor === '' ? fallback : valor;
}

function dataLocalContato(valor) {
    if (!valor) return '';
    const texto = String(valor);
    const data = new Date(texto);
    if (Number.isNaN(data.getTime())) {
        const encontrado = texto.match(/^(\d{4}-\d{2}-\d{2})/);
        return encontrado ? encontrado[1] : '';
    }
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(data);
    const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return `${valores.year}-${valores.month}-${valores.day}`;
}

function aplicarFiltrosContatoRegistros(registros, filtros = {}) {
    if (!Array.isArray(registros) || filtros.contextoDashboard !== 'clientes') return registros;
    const statusSelecionados = new Set((filtros.statusContato || []).map(item => String(item).toUpperCase()));
    const tiposSelecionados = new Set((filtros.tiposContato || []).map(item => String(item).toUpperCase()));
    if (!statusSelecionados.size || !tiposSelecionados.size) return [];
    return registros.filter(linha => {
        const documento = String(obterValorContato(linha, ['DOCTOCLIENTE', 'DOCUMENTO'], '')).trim();
        if (!documento) return true;
        const campoStatus = encontrarCampoContato(linha, ['STATUS_CONTATO']);
        const campoTipo = encontrarCampoContato(linha, ['TIPO_CONTATO', 'ULTIMO_CANAL_CONTATO']);
        if (campoStatus && !linha[campoStatus]) linha[campoStatus] = 'PENDENTE';
        if (campoTipo && !linha[campoTipo]) linha[campoTipo] = 'SEM CONTATO';
        const status = String(obterValorContato(linha, ['STATUS_CONTATO'], 'PENDENTE')).toUpperCase();
        const tipo = String(obterValorContato(linha, ['TIPO_CONTATO', 'ULTIMO_CANAL_CONTATO'], 'SEM CONTATO')).toUpperCase();
        const dataAtualizacao = dataLocalContato(obterValorContato(linha, ['DATA_ULTIMA_ATUALIZACAO'], ''));
        if (statusSelecionados.size && !statusSelecionados.has(status)) return false;
        if (tiposSelecionados.size && !tiposSelecionados.has(tipo)) return false;
        if (filtros.dataContatoInicial && (!dataAtualizacao || dataAtualizacao < filtros.dataContatoInicial)) return false;
        if (filtros.dataContatoFinal && (!dataAtualizacao || dataAtualizacao > filtros.dataContatoFinal)) return false;
        return true;
    });
}

const colunasEnriquecimentoContato = [
    'NOME_CLIENTE', 'STATUS_CONTATO', 'TIPO_CONTATO', 'OBSERVACAO',
    'DATA_PRIMEIRO_CONTATO', 'DATA_ULTIMO_CONTATO', 'DATA_FINALIZACAO',
    'IDFUNCIONARIO', 'IDVENDEDOR', 'QTDE_CONTATO', 'DATA_ULTIMA_ATUALIZACAO'
];

function widgetMapeiaContato(widget) {
    return (Array.isArray(widget?.mapeamentos) ? widget.mapeamentos : [])
        .some(item => colunasEnriquecimentoContato.includes(normalizarNomeCampoContato(item.coluna)));
}

function widgetPossuiFiltroRelacionamentoNoServidor(widget) {
    const consultas = Array.isArray(widget?.consultas) && widget.consultas.length
        ? widget.consultas
        : [{ sql: widget?.sql || '' }];
    const consultasSql = consultas.filter(consulta => String(consulta?.sql || '').trim());
    return consultasSql.length > 0 && consultasSql.every(consulta =>
        /\/\*\s*(?:operador\s*=\s*(?:AND|OR)\s*\|\s*)?relacionamento\s*\|\s*campo\s*:/i.test(String(consulta.sql || ''))
    );
}

async function aplicarRelacionamentoResultadoWidget(widget, registros, colunas, filtros) {
    if (
        filtros.contextoDashboard === 'clientes'
        && widgetPossuiFiltroRelacionamentoNoServidor(widget)
        && !widgetMapeiaContato(widget)
    ) {
        return { registros, colunas };
    }
    const enriquecido = await enriquecerRegistrosContato(registros, colunas, filtros.contextoDashboard);
    return {
        registros: aplicarFiltrosContatoRegistros(enriquecido.registros, filtros),
        colunas: enriquecido.colunas
    };
}

function detalheMapeiaContato(detalhe) {
    return [...(detalhe?.camposTabela || []), ...(detalhe?.camposLinha || []), ...(detalhe?.camposColuna || []), ...(detalhe?.camposValor || [])]
        .some(campo => {
            const expressao = separarAliasCampoDetalhe(campo).expressao;
            return camposExpressaoTabelaDetalhe(expressao)
                .some(nome => colunasEnriquecimentoContato.includes(normalizarNomeCampoContato(nome)));
        });
}

async function enriquecerRegistrosContato(registros, colunas, contexto = dashboardContextoAtivo) {
    if (contexto !== 'clientes' || !Array.isArray(registros) || !registros.length) return { registros, colunas };
    if (encontrarCampoContato(registros[0], ['STATUS_CONTATO'])) return { registros, colunas };
    const documentos = Array.from(new Set(registros.map(linha => String(obterValorContato(linha, ['DOCTOCLIENTE', 'DOCUMENTO'], '')).trim()).filter(Boolean)));
    if (!documentos.length) return { registros, colunas };
    const contatos = [];
    const tamanhoLote = 5000;
    for (let inicio = 0; inicio < documentos.length; inicio += tamanhoLote) {
        const response = await fetch('/api/controle-contatos', {
            method: 'POST',
            headers: cabecalhosSessao(),
            body: JSON.stringify({ documentos: documentos.slice(inicio, inicio + tamanhoLote) })
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) window.fazerLogout();
        if (!response.ok) throw new Error(data.error || 'Não foi possível combinar os contatos.');
        contatos.push(...(Array.isArray(data.contatos) ? data.contatos : []));
    }
    const indice = new Map(contatos.map(contato => [String(contato.doctocliente), contato]));
    const mapa = {
        NOME_CLIENTE: 'nome_cliente', STATUS_CONTATO: 'status_contato', TIPO_CONTATO: 'tipo_contato', OBSERVACAO: 'observacao',
        DATA_PRIMEIRO_CONTATO: 'data_primeiro_contato', DATA_ULTIMO_CONTATO: 'data_ultimo_contato', DATA_FINALIZACAO: 'data_finalizacao',
        IDFUNCIONARIO: 'idfuncionario', IDVENDEDOR: 'idvendedor', QTDE_CONTATO: 'qtde_contato', DATA_ULTIMA_ATUALIZACAO: 'data_ultima_atualizacao'
    };
    registros.forEach(linha => {
        const documento = String(obterValorContato(linha, ['DOCTOCLIENTE', 'DOCUMENTO'], '')).trim();
        const contato = indice.get(documento);
        colunasEnriquecimentoContato.forEach(campo => {
            const padrao = campo === 'STATUS_CONTATO' ? 'PENDENTE' : (campo === 'TIPO_CONTATO' ? 'SEM CONTATO' : null);
            linha['CONTATO.' + campo] = contato?.[mapa[campo]] ?? padrao;
        });
    });
    const novasColunas = Array.from(new Set([...(colunas || []), ...colunasEnriquecimentoContato.map(campo => 'CONTATO.' + campo)]));
    return { registros, colunas: novasColunas };
}

function obterSqlWidget(widget) {
    if (widget?.relatorioDetalhe) return String(widget?.sql || '');
    const consultas = Array.isArray(widget?.consultas) ? widget.consultas.map(item => item.sql) : [];
    return Array.from(new Set([...consultas, widget?.sql]
        .map(sql => String(sql || '').trim())
        .filter(Boolean))).join('\n');
}

function obterDiretivasCelula(widget) {
    const diretivas = [];
    const sql = obterSqlWidget(widget);
    const regex = /\/\*\s*(icon|action)\s*:\s*([a-z0-9_-]+)([\s\S]*?)\*\//gi;
    const ocorrencias = Array.from(sql.matchAll(regex));
    ocorrencias.forEach((match, indice) => {
        const opcoes = {};
        String(match[3] || '').split('|').forEach(parte => {
            const divisao = parte.split(/[:=]/);
            if (divisao.length >= 2) opcoes[divisao.shift().trim().toLowerCase()] = divisao.join(':').trim();
        });
        let campo = String(opcoes.campo || opcoes.field || opcoes.coluna || opcoes.column || '').trim();
        if (!campo) {
            const inicioBusca = (match.index || 0) + match[0].length;
            const fimBusca = indice + 1 < ocorrencias.length ? ocorrencias[indice + 1].index : sql.length;
            const trecho = sql.slice(inicioBusca, fimBusca);
            const alias = trecho.match(/\bas\s+(?:"((?:[^"]|"")+)"|([a-z_][a-z0-9_$.]*))/i);
            campo = String(alias?.[1] || alias?.[2] || '').replace(/""/g, '"').trim();
        }
        if (!campo) return;
        diretivas.push({ tipo: match[1].toLowerCase(), valor: match[2].toLowerCase(), campo, ...opcoes });
    });
    return diretivas;
}

const iconesFontAwesomeMarca = new Set([
    'fa-whatsapp', 'fa-telegram', 'fa-facebook', 'fa-instagram', 'fa-linkedin',
    'fa-youtube', 'fa-x-twitter', 'fa-pix', 'fa-google', 'fa-apple'
]);

const coresIconesCelula = {
    whatsapp: '#25D366', 'fa-whatsapp': '#25D366',
    telegram: '#229ED9', 'fa-telegram': '#229ED9',
    email: '#C5221F', 'fa-envelope': '#C5221F',
    phone: '#155EEF', 'fa-phone': '#155EEF',
    sms: '#7A5AF8', 'fa-comment-sms': '#7A5AF8',
    link: '#175CD3', 'fa-link': '#175CD3',
    contact: '#0A7C66', 'fa-user-plus': '#0A7C66'
};

function sanitizarCssDiretiva(css) {
    const permitidas = new Set([
        'color', 'background', 'background-color', 'border-color', 'border-width',
        'border-style', 'border-radius', 'padding', 'gap', 'font-size', 'font-weight',
        'min-width', 'height', 'box-shadow', 'text-transform'
    ]);
    return String(css || '').split(';').map(declaracao => {
        const separador = declaracao.indexOf(':');
        if (separador < 1) return '';
        const propriedade = declaracao.slice(0, separador).trim().toLowerCase();
        const valor = declaracao.slice(separador + 1).trim();
        if (!permitidas.has(propriedade) || !valor || valor.length > 140) return '';
        if (/[{}<>\\]|url\s*\(|expression\s*\(|javascript\s*:|@import/i.test(valor)) return '';
        return `${propriedade}:${valor}`;
    }).filter(Boolean).join(';');
}

function iconeCelula(nome, opcoes = {}) {
    const identificador = String(nome || 'contact').trim().toLowerCase();
    if (/^fa-[a-z0-9-]+$/.test(identificador)) {
        const familiaInformada = String(opcoes.family || opcoes.familia || '').toLowerCase();
        const familia = familiaInformada === 'regular'
            ? 'fa-regular'
            : (familiaInformada === 'brands' || iconesFontAwesomeMarca.has(identificador) ? 'fa-brands' : 'fa-solid');
        return `<i class="${familia} ${identificador}" aria-hidden="true"></i>`;
    }
    const paths = {
        whatsapp: '<path d="M20 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1.1-4a8.4 8.4 0 1 1 15.9-4.5Z"></path><path d="M8.5 7.8c.4 3 2 4.6 5 5.7"></path>',
        phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1Z"></path>',
        email: '<path d="M4 4h16v16H4z"></path><path d="m4 6 8 6 8-6"></path>',
        sms: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>',
        telegram: '<path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path>',
        link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"></path><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"></path>',
        contact: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M19 8v6M22 11h-6"></path>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[identificador] || paths.contact}</svg>`;
}

function renderizarConteudoCelula(widget, campo, registro, texto, opcoesRenderizacao = {}) {
    const nomesCampo = new Set([
        normalizarNomeCampoContato(campo?.coluna || campo),
        normalizarNomeCampoContato(campo?.apelido || '')
    ].filter(Boolean));
    const diretivas = obterDiretivasCelula(widget).filter(item => nomesCampo.has(normalizarNomeCampoContato(item.campo)));
    let conteudo = `<span>${escapeHtml(texto)}</span>`;
    diretivas.filter(item => item.tipo === 'icon').forEach(item => {
        const corInformada = item.color || item.cor || coresIconesCelula[item.valor] || '';
        const cor = sanitizarCssDiretiva(`color:${corInformada}`).replace(/^color:/, '');
        const cssIcone = sanitizarCssDiretiva([
            cor ? `color:${cor}` : '',
            item.background || item.fundo ? `background:${item.background || item.fundo}` : '',
            item.size || item.tamanho ? `font-size:${item.size || item.tamanho}` : '',
            item.css || ''
        ].filter(Boolean).join(';'));
        const estilo = cssIcone ? ` style="${escapeHtml(cssIcone)}"` : '';
        const icone = `<span class="crm-cell-icon" title="${escapeHtml(item.valor)}"${estilo}>${iconeCelula(item.valor, item)}</span>`;
        conteudo = String(item.position || item.posicao).toLowerCase() === 'after' ? conteudo + icone : icone + conteudo;
    });
    diretivas.filter(item => !opcoesRenderizacao.somenteIcones && item.tipo === 'action' && item.valor === 'contact').forEach(item => {
        const documento = String(obterValorContato(registro, ['DOCTOCLIENTE', 'DOCUMENTO'], '')).trim();
        const nome = String(obterValorContato(registro, ['NOME_CLIENTE', 'NOMECLIENTE', 'NOME'], '')).trim();
        if (!documento) return;
        const rotulo = item.label || item.nome || 'Contato';
        const corInformada = item.color || item.cor || coresIconesCelula[item.icon || item.icone] || '#0A7C66';
        const cor = sanitizarCssDiretiva(`color:${corInformada}`).replace(/^color:/, '') || '#0A7C66';
        const cssBotao = sanitizarCssDiretiva(item.css || '');
        const estiloCompleto = [`--contact-action-color:${cor}`, cssBotao].filter(Boolean).join(';');
        const estilo = ` style="${escapeHtml(estiloCompleto)}"`;
        const botao = `<button type="button" class="crm-contact-action" data-contact-action data-document="${escapeHtml(documento)}" data-name="${escapeHtml(nome)}"${estilo}>${iconeCelula(item.icon || item.icone || 'contact', item)}<span>${escapeHtml(rotulo)}</span></button>`;
        conteudo = String(item.position || item.posicao).toLowerCase() === 'before' ? botao + conteudo : conteudo + botao;
    });
    diretivas.filter(item => !opcoesRenderizacao.somenteIcones && ['negotiation', 'negociacao'].includes(item.valor)).forEach(item => {
        const orcamentoId = String(obterValorContato(registro, ['ID_ORCAMENTO', 'ORCAMENTO_ID', 'IDORCAMENTO'], '')).trim();
        if (!/^\d+$/.test(orcamentoId)) return;
        const rotulo = item.label || item.nome || 'Negociar';
        const corInformada = item.color || item.cor || '#123C7C';
        const cor = sanitizarCssDiretiva(`color:${corInformada}`).replace(/^color:/, '') || '#123C7C';
        const cssBotao = sanitizarCssDiretiva(item.css || '');
        const estiloCompleto = [`--contact-action-color:${cor}`, cssBotao].filter(Boolean).join(';');
        const botao = `<button type="button" class="crm-contact-action" data-budget-negotiation-action data-budget-id="${escapeHtml(orcamentoId)}" style="${escapeHtml(estiloCompleto)}">${iconeCelula(item.icon || item.icone || 'fa-comments', item)}<span>${escapeHtml(rotulo)}</span></button>`;
        conteudo = String(item.position || item.posicao).toLowerCase() === 'before' ? botao + conteudo : conteudo + botao;
    });
    return conteudo;
}

function criarMapeamentosRelatorioDetalhe(detalhe, colunas, dados) {
    if (!colunas.length) return [];
    const linhasConfiguradas = detalhe.tipo === 'pivot'
        ? detalhe.camposLinha.map(nome => obterColunaDetalhe(colunas, nome)).filter(Boolean)
        : [];
    const colunasConfiguradas = detalhe.tipo === 'pivot'
        ? detalhe.camposColuna.map(nome => obterColunaDetalhe(colunas, nome)).filter(Boolean)
        : [];
    let valoresConfigurados = detalhe.tipo === 'pivot'
        ? detalhe.camposValor.map(nome => obterColunaDetalhe(colunas, nome)).filter(Boolean)
        : [];

    if (detalhe.tipo === 'pivot') {
        const camposAusentes = [...detalhe.camposLinha, ...detalhe.camposColuna, ...detalhe.camposValor]
            .filter(nome => !obterColunaDetalhe(colunas, nome));
        if (camposAusentes.length) throw new Error('Campos nao retornados pelo SQL: ' + camposAusentes.join(', ') + '.');
        return [
            ...linhasConfiguradas.map(coluna => ({ coluna, apelido: coluna, papel: 'linha', alinhamento: 'left', ordenacao: 'asc' })),
            ...colunasConfiguradas.map(coluna => ({ coluna, apelido: coluna, papel: 'coluna', alinhamento: 'center', ordenacao: 'asc' })),
            ...valoresConfigurados.map(coluna => ({ coluna, apelido: coluna, papel: 'valor', alinhamento: 'right', agregacao: detalhe.agregacao, formatoValor: 'decimal', ordenacao: 'none' }))
        ];
    }

    valoresConfigurados = colunas.filter(coluna => dados.some(registro => {
        const valor = obterValorLinha(registro, coluna);
        return valor !== null && valor !== '' && Number.isFinite(Number(valor));
    }));
    if (!valoresConfigurados.length) valoresConfigurados = [colunas[colunas.length - 1]];
    let linhas = colunas.filter(coluna => !valoresConfigurados.includes(coluna));
    if (!linhas.length && colunas.length > 1) {
        linhas = [colunas[0]];
        valoresConfigurados = valoresConfigurados.filter(coluna => coluna !== colunas[0]);
    }
    return [
        ...linhas.map(coluna => ({ coluna, apelido: coluna, papel: 'linha', alinhamento: 'left', ordenacao: 'none' })),
        ...valoresConfigurados.map(coluna => ({ coluna, apelido: coluna, papel: 'valor', alinhamento: 'right', agregacao: 'none', formatoValor: 'decimal', ordenacao: 'none' }))
    ];
}

function formatarCelulaRelatorioDetalhe(valor) {
    if (valor === null || valor === undefined) return '';
    if (typeof valor === 'number') return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(valor);
    if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(String(valor))) return formatarDimensao(valor, 'day');
    return String(valor);
}

function renderizarTabelaSimplesRelatorioDetalhe(container, widget, opcoes = {}) {
    const registros = Array.isArray(widget.dadosConsulta) ? widget.dadosConsulta : [];
    const colunas = Array.isArray(widget.colunasConsulta) ? widget.colunasConsulta : [];
    if (!registros.length || !colunas.length) {
        container.innerHTML = '<div class="crm-chart-empty">Nenhum registro encontrado.</div>';
        return;
    }
    const paginacao = prepararPaginacaoTabela(widget, registros, opcoes.exportarTudo === true);
    const numericas = new Set(colunas.filter(coluna => registros.some(registro => typeof obterValorLinha(registro, coluna) === 'number')));
    const cabecalho = colunas.map(coluna =>
        '<th' + (numericas.has(coluna) ? ' data-align="right"' : '') + '>' + escapeHtml(coluna) + '</th>'
    ).join('');
    const corpo = paginacao.registros.map(registro =>
        '<tr>' + colunas.map(coluna => {
            const alinhamento = numericas.has(coluna) ? ' data-align="right"' : '';
            return '<td' + alinhamento + '><span class="crm-cell-content">' + renderizarConteudoCelula(widget, coluna, registro, formatarCelulaRelatorioDetalhe(obterValorLinha(registro, coluna))) + '</span></td>';
        }).join('') + '</tr>'
    ).join('');
    const total = widget.tabela?.totalLinhas && numericas.size
        ? '<tr class="crm-pivot-grand-total">' + colunas.map((coluna, indice) => {
            if (indice === 0) return '<td>Total geral</td>';
            if (!numericas.has(coluna)) return '<td></td>';
            const soma = registros.reduce((acumulado, registro) => acumulado + converterNumero(obterValorLinha(registro, coluna)), 0);
            return '<td data-align="right">' + escapeHtml(formatarCelulaRelatorioDetalhe(soma)) + '</td>';
        }).join('') + '</tr>'
        : '';
    container.innerHTML = '<div class="crm-chart-table-real"><table class="crm-pivot-table crm-simple-table"><thead><tr>'
        + cabecalho + '</tr></thead><tbody>' + corpo + total + '</tbody></table></div>'
        + renderizarControlePaginacaoTabela(widget, paginacao);
}

function renderizarRelatorioDetalheAtual() {
    if (!widgetDetailContent || !widgetDetalheModalAtual) return;
    if (widgetDetalheModalAtual.tipo === 'table') {
        renderizarTabelaSimplesRelatorioDetalhe(widgetDetailContent, widgetDetalheModalAtual);
    } else {
        renderizarTabelaGrafico(widgetDetailContent, widgetDetalheModalAtual);
    }
}
function montarVisualizacaoRelatorioDetalhe(detalhe) {
    if (detalhe.tipo !== 'pivot') return null;
    return {
        agrupar: true,
        resultadoAgregado: true,
        dimensoes: detalhe.camposLinha.map(coluna => ({ coluna, ordenacao: 'asc' })),
        colunas: detalhe.camposColuna.map(coluna => ({ coluna, ordenacao: 'asc' })),
        valores: detalhe.camposValor.map(coluna => ({ coluna, agregacao: detalhe.agregacao, ordenacao: 'none' })),
        filtrosDimensao: []
    };
}

function fecharRelatorioDetalhe() {
    if (widgetDetailModal) widgetDetailModal.hidden = true;
    if (widgetDetalheModalAtual?.id) paginasTabelaDashboard.delete(widgetDetalheModalAtual.id);
    widgetDetalheModalAtual = null;
    contextoRelatorioDetalheAtual = null;
    if (widgetDetailContent) widgetDetailContent.innerHTML = '';
    atualizarExportacaoRelatorioDetalhe(false);
}

async function prepararDadosRelatorioDetalhe(detalhe, data, filtros) {
    let colunas = Array.isArray(data.colunas) ? data.colunas : [];
    const registrosBrutos = Array.isArray(data.dados) ? data.dados : (Array.isArray(data.amostra) ? data.amostra : []);
    const enriquecido = await enriquecerRegistrosContato(registrosBrutos, colunas, filtros.contextoDashboard);
    colunas = enriquecido.colunas;
    let registros = aplicarFiltrosContatoRegistros(enriquecido.registros, filtros);
    if (detalhe.tipo === 'table' && detalhe.camposTabela.length) {
        const definicoes = detalhe.camposTabela.map(item => {
            const definicao = separarAliasCampoDetalhe(item);
            return { ...definicao, estrutura: decomporExpressaoTabelaDetalhe(definicao.expressao) };
        });
        const camposAusentes = Array.from(new Set(definicoes
            .flatMap(item => camposExpressaoTabelaDetalhe(item.estrutura))
            .filter(nome => !obterColunaDetalhe(colunas, nome))));
        if (camposAusentes.length) throw new Error('Colunas nao retornadas pelo detalhe: ' + camposAusentes.join(', ') + '.');
        const apelidos = definicoes.map(item => item.apelido.toLowerCase());
        if (new Set(apelidos).size !== apelidos.length) throw new Error('Use apelidos diferentes nas colunas exibidas.');
        registros = registros.map(registro => {
            const linha = { ...registro };
            definicoes.forEach(item => {
                linha[item.apelido] = resolverExpressaoTabelaDetalhe(registro, colunas, item.estrutura);
            });
            return linha;
        });
        colunas = definicoes.map(item => item.apelido);
    }
    return { colunas, registros };
}

async function abrirRelatorioDetalhe(widget, selecao = {}) {
    const detalhe = normalizarConfiguracaoDetalhe(widget?.detalhe);
    if (!widgetPossuiRelatorioDetalhe(widget) || !widgetDetailModal) return;
    contextoRelatorioDetalheAtual = { widget, selecao: { ...selecao } };
    const contexto = [
        selecao.apelido && selecao.rotulo ? selecao.apelido + ': ' + selecao.rotulo : '',
        selecao.serie ? 'Serie: ' + selecao.serie : ''
    ].filter(Boolean).join(' | ');

    if (widgetDetalheModalAtual?.id) paginasTabelaDashboard.delete(widgetDetalheModalAtual.id);
    widgetDetalheModalAtual = null;
    widgetDetailModal.hidden = false;
    atualizarExportacaoRelatorioDetalhe(false);
    if (widgetDetailModalTitle) widgetDetailModalTitle.textContent = detalhe.titulo || ('Detalhe de ' + (widget.titulo || 'indicador'));
    if (widgetDetailContext) widgetDetailContext.textContent = contexto;
    if (widgetDetailStatus) {
        widgetDetailStatus.className = 'crm-widget-detail-status is-loading';
        widgetDetailStatus.textContent = 'Carregando relatorio...';
    }
    if (widgetDetailContent) widgetDetailContent.innerHTML = '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DASHBOARD_REQUEST_TIMEOUT_MS);
    try {
        const filtros = {
            ...obterFiltrosCenario(),
            detalheValor: selecao.valor ?? '',
            detalheCampo: selecao.campo || '',
            detalheSerie: selecao.serie || ''
        };
        const response = await fetch('/api/executar-cenario', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(usuarioLogado.sessionToken ? { Authorization: 'Bearer ' + usuarioLogado.sessionToken } : {})
            },
            body: JSON.stringify({
                fonte: detalhe.fonte,
                sql: detalhe.sql,
                filtros,
                visualizacao: detalheMapeiaContato(detalhe) ? null : montarVisualizacaoRelatorioDetalhe(detalhe),
                modoExecucao: 'detalhe'
            })
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) window.fazerLogout();
        if (!response.ok) throw new Error(data.details || data.error || 'Erro ao carregar o relatorio de detalhe.');
        const { colunas, registros } = await prepararDadosRelatorioDetalhe(detalhe, data, filtros);
        if (!colunas.length || !registros.length) {
            if (widgetDetailStatus) {
                widgetDetailStatus.className = 'crm-widget-detail-status';
                if (data.proximidade) {
                    const semLocalizacao = Number(data.proximidade.clientesSemCep || 0)
                        + Number(data.proximidade.clientesSemCoordenadas || 0);
                    widgetDetailStatus.textContent = 'Nenhum cliente localizado em ate '
                        + data.proximidade.raioKm + ' km'
                        + (semLocalizacao ? '; ' + semLocalizacao + ' sem localizacao.' : '.');
                } else {
                    widgetDetailStatus.textContent = 'Nenhum registro encontrado.';
                }
            }
            return;
        }
        const idDetalhe = 'relatorio-detalhe-' + widget.id;
        const mapeamentos = criarMapeamentosRelatorioDetalhe(detalhe, colunas, registros);
        widgetDetalheModalAtual = {
            id: idDetalhe,
            titulo: detalhe.titulo || widget.titulo,
            tipo: detalhe.tipo,
            relatorioDetalhe: true,
            sql: detalhe.sql,
            colunasConsulta: colunas,
            dadosConsulta: registros,
            dadosConsultaAgregados: data.resultadoAgregado === true,
            mapeamentos,
            tabela: {
                totalLinhas: detalhe.totalGeral,
                totalColunas: detalhe.tipo === 'pivot' && detalhe.camposColuna.length > 0,
                repetirRotulos: true,
                paginacao: true,
                registrosPorPagina: 50,
                limiteExibicao: 0,
                agrupamentos: [],
                subtotais: []
            }
        };
        paginasTabelaDashboard.set(idDetalhe, 1);
        renderizarRelatorioDetalheAtual();
        atualizarExportacaoRelatorioDetalhe(true);
        if (widgetDetailStatus) {
            widgetDetailStatus.className = 'crm-widget-detail-status is-success';
            if (data.proximidade) {
                const proximidade = data.proximidade;
                const pendencias = Number(proximidade.clientesSemCep || 0)
                    + Number(proximidade.clientesSemCoordenadas || 0);
                widgetDetailStatus.textContent = proximidade.clientesProximos
                    + ' cliente' + (proximidade.clientesProximos === 1 ? '' : 's')
                    + ' em ate ' + proximidade.raioKm + ' km'
                    + (proximidade.truncado ? '; exibindo ' + proximidade.registrosRetornados : '')
                    + (pendencias ? '; ' + pendencias + ' sem localizacao.' : '.');
            } else {
                widgetDetailStatus.textContent = registros.length + ' registro' + (registros.length === 1 ? '' : 's') + '.';
            }
        }
    } catch (error) {
        if (widgetDetailStatus) {
            widgetDetailStatus.className = 'crm-widget-detail-status is-error';
            widgetDetailStatus.textContent = error.name === 'AbortError'
                ? 'Tempo limite ao carregar o relatorio de detalhe.'
                : error.message;
        }
    } finally {
        clearTimeout(timeout);
    }
}
function limparGraficosDashboard() {
    contextosDrillDashboard.clear();
    observadoresGraficosDashboard.forEach(observador => observador.disconnect());
    observadoresGraficosDashboard.clear();
    instanciasGraficosDashboard.forEach(instancia => instancia.dispose());
    instanciasGraficosDashboard.clear();
}

function ajustarConteudoKpi(container) {
    const painel = container?.querySelector('.crm-chart-kpi-real');
    const valor = painel?.querySelector('strong');
    const rotulo = painel?.querySelector('.crm-kpi-label');
    const detalhe = painel?.querySelector('.crm-kpi-target-detail');
    if (!painel || !valor || !rotulo) return;

    const estilo = getComputedStyle(painel);
    const largura = Math.max(
        0,
        painel.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight)
    );
    const altura = Math.max(
        0,
        painel.clientHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom)
    );
    if (!largura) return;

    const tamanhoRotulo = Math.max(10, Math.min(16, largura / 24, altura ? altura / 8 : 10));
    rotulo.style.fontSize = `${tamanhoRotulo}px`;
    if (detalhe) detalhe.style.fontSize = `${Math.max(10, Math.min(15, tamanhoRotulo * 0.95))}px`;
    const espacoAuxiliar = rotulo.getBoundingClientRect().height
        + (detalhe ? detalhe.getBoundingClientRect().height + 4 : 0)
        + 6;
    const alturaValor = altura ? Math.max(12, altura - espacoAuxiliar) : Number.POSITIVE_INFINITY;
    const limiteAlturaValor = detalhe && altura
        ? Math.max(30, altura * 0.48)
        : alturaValor * 0.92;
    const fatorLargura = detalhe ? 0.46 : 0.38;
    let minimo = 12;
    let maximo = Math.max(minimo, Math.min(128, largura * fatorLargura, limiteAlturaValor));
    let melhor = minimo;

    valor.style.whiteSpace = 'nowrap';
    for (let tentativa = 0; tentativa < 9; tentativa += 1) {
        const tamanho = (minimo + maximo) / 2;
        valor.style.fontSize = `${tamanho}px`;
        const cabeNaAltura = detalhe || valor.scrollHeight <= alturaValor + 1;
        const cabe = valor.scrollWidth <= largura + 1 && cabeNaAltura;
        if (cabe) {
            melhor = tamanho;
            minimo = tamanho;
        } else {
            maximo = tamanho;
        }
    }
    valor.style.fontSize = `${Math.floor(melhor)}px`;
}

function observarAjusteKpi(container, widgetId) {
    ajustarConteudoKpi(container);
    if (!window.ResizeObserver) return;
    let framePendente = 0;
    const observador = new ResizeObserver(() => {
        cancelAnimationFrame(framePendente);
        framePendente = requestAnimationFrame(() => ajustarConteudoKpi(container));
    });
    observador.observe(container);
    observadoresGraficosDashboard.set(widgetId, observador);
}

function atributosAcaoRelatorioDetalhe(widget) {
    return widgetPossuiRelatorioDetalhe(widget)
        ? ' data-open-widget-detail="' + escapeHtml(widget.id) + '" role="button" tabindex="0" title="Abrir relatorio de detalhe"'
        : '';
}
function renderizarGraficosDashboard(widgets, widgetsCalculo = widgets) {
    widgets.forEach(widget => {
        const seletorId = window.CSS?.escape ? window.CSS.escape(widget.id) : String(widget.id).replace(/"/g, '\\"');
        const container = dashboardCanvas?.querySelector(`[data-chart-widget="${seletorId}"]`);
        if (!container) return;
        container.classList.toggle('is-detail-enabled', widgetPossuiRelatorioDetalhe(widget));
        if (widget.tipo === 'table' || widget.tipo === 'pivot') {
            renderizarTabelaGrafico(container, widget);
            return;
        }
        if (widget.tipo === 'kpi-calculated') {
            const configuracao = widget.calculo || {};
            const resultado = obterResultadoKpiCalculado(widget, widgetsCalculo);
            if (resultado.erro) {
                container.innerHTML = `<div class="crm-chart-empty">${escapeHtml(resultado.erro)}</div>`;
                return;
            }
            container.innerHTML = `<div class="crm-chart-kpi-real"${atributosAcaoRelatorioDetalhe(widget)}><strong>${escapeHtml(formatarValorGrafico(resultado.valor, configuracao.formatoSaida || 'decimal'))}</strong><span class="crm-kpi-label">${escapeHtml(configuracao.rotulo || 'Resultado calculado')}</span></div>`;
            observarAjusteKpi(container, widget.id);
            return;
        }
        const dados = prepararDadosGrafico(widget);
        if (!dados) {
            container.innerHTML = '<div class="crm-chart-empty">Execute e salve uma consulta para visualizar os dados.</div>';
            return;
        }
        if (widget.tipo === 'kpi' || widget.tipo === 'kpi-target') {
            const serie = dados.series[0];
            const total = serie.valores.reduce((soma, valor) => soma + converterNumero(valor), 0);
            if (widget.tipo === 'kpi-target') {
                const serieMeta = dados.series[1];
                if (!serieMeta) {
                    container.innerHTML = '<div class="crm-chart-empty">Defina o campo Meta no mapeamento.</div>';
                    return;
                }
                const meta = serieMeta.valores.reduce((soma, valor) => soma + converterNumero(valor), 0);
                const percentual = meta ? (total / meta) * 100 : null;
                const atingida = percentual !== null && percentual >= 100;
                const percentualTexto = percentual === null ? 'Sem percentual' : formatarValorGrafico(percentual, 'percent');
                container.innerHTML = `<div class="crm-chart-kpi-real is-target ${atingida ? 'is-reached' : 'is-pending'}"${atributosAcaoRelatorioDetalhe(widget)}><strong>${escapeHtml(formatarValorGrafico(total, serie.formato))}</strong><span class="crm-kpi-label">${escapeHtml(serie.nome)}</span><small class="crm-kpi-target-detail"><span><i>Meta</i>${escapeHtml(formatarValorGrafico(meta, serieMeta.formato || serie.formato))}</span><b><i>Atingimento</i>${escapeHtml(percentualTexto)}</b></small></div>`;
            } else {
                container.innerHTML = `<div class="crm-chart-kpi-real"${atributosAcaoRelatorioDetalhe(widget)}><strong>${escapeHtml(formatarValorGrafico(total, serie.formato))}</strong><span class="crm-kpi-label">${escapeHtml(serie.nome)}</span></div>`;
            }
            observarAjusteKpi(container, widget.id);
            return;
        }
        if (!window.echarts) {
            container.innerHTML = '<div class="crm-chart-empty">Biblioteca de graficos indisponivel.</div>';
            return;
        }

        const instancia = window.echarts.init(container, null, { renderer: 'canvas' });
        instancia.setOption(montarOpcaoECharts(widget, dados, container), true);
        if (widgetPossuiRelatorioDetalhe(widget)) {
            instancia.on('click', parametros => {
                const dimensao = dados.dimensoes?.[parametros.dataIndex] || {};
                abrirRelatorioDetalhe(widget, {
                    campo: dimensao.campo || '',
                    apelido: dimensao.apelido || dados.nomeDimensao || '',
                    valor: dimensao.valor ?? '',
                    rotulo: dimensao.rotulo || parametros.name || '',
                    serie: parametros.seriesName || ''
                });
            });
        }
        instanciasGraficosDashboard.set(widget.id, instancia);
        if (window.ResizeObserver) {
            let framePendente = 0;
            const observador = new ResizeObserver(() => {
                cancelAnimationFrame(framePendente);
                framePendente = requestAnimationFrame(() => {
                    instancia.resize();
                    instancia.setOption(montarOpcaoECharts(widget, dados, container), { notMerge: false, lazyUpdate: true });
                });
            });
            observador.observe(container);
            observadoresGraficosDashboard.set(widget.id, observador);
        }
    });
}

function obterLayoutWidget(widget, index = 0) {
    const larguraBase = Math.max(260, Number(widget.w || widget.largura || 0));
    const alturaBase = Math.max(180, Number(widget.h || widget.altura || 0));
    const temLayoutLivre = Number.isFinite(Number(widget.x)) && Number.isFinite(Number(widget.y)) && larguraBase && alturaBase;

    if (temLayoutLivre) {
        return {
            x: Math.max(0, Number(widget.x) || 0),
            y: Math.max(0, Number(widget.y) || 0),
            w: larguraBase,
            h: alturaBase
        };
    }

    const largura = Math.max(280, (Number(widget.colunas) || 6) * 78);
    const altura = Math.max(190, 150 + ((Number(widget.linhas) || 2) * 62));
    return {
        x: (index % 2) * (largura + 20),
        y: Math.floor(index / 2) * (altura + 20),
        w: largura,
        h: altura
    };
}

function obterCategoriasPermitidasWidget(widget = {}) {
    if (window.CRM_DASHBOARD_LAYOUT?.normalizarCategoriasPermitidas) {
        return window.CRM_DASHBOARD_LAYOUT.normalizarCategoriasPermitidas(widget.categoriasPermitidas);
    }
    if (!Array.isArray(widget.categoriasPermitidas)) return categoriasDashboard.map(item => item.codigo);
    const validas = new Set(categoriasDashboard.map(item => item.codigo));
    return Array.from(new Set(widget.categoriasPermitidas.map(String).map(item => item.toUpperCase()).filter(item => validas.has(item))));
}

function widgetVisivelParaCategoria(widget, codigo = categoriaCodigo) {
    if (window.CRM_DASHBOARD_LAYOUT?.widgetVisivelParaCategoria) {
        return window.CRM_DASHBOARD_LAYOUT.widgetVisivelParaCategoria(widget, codigo);
    }
    return obterCategoriasPermitidasWidget(widget).includes(String(codigo || '').toUpperCase());
}

function normalizarWidgetsDashboard(widgets) {
    return atribuirReferenciasIndicadores(widgets).map((widget, index) => ({
        ...widget,
        limiteTop: normalizarLimiteTopGrafico(widget.limiteTop),
        funil: normalizarConfiguracaoFunil(widget.funil),
        categoriasPermitidas: obterCategoriasPermitidasWidget(widget),
        aparencia: obterAparenciaWidget(widget),
        ...obterLayoutWidget(widget, index)
    }));
}

function obterLayoutsRenderizacao(widgets, alturaCanvas = 0) {
    const layoutsBase = widgets.map((widget, index) => ({ id: widget.id, ...obterLayoutWidget(widget, index) }));
    const larguraCanvas = dashboardCanvas?.clientWidth || 0;
    const layoutsLargura = larguraCanvas > 0 && window.CRM_DASHBOARD_LAYOUT?.ajustarLargurasDireita
        ? window.CRM_DASHBOARD_LAYOUT.ajustarLargurasDireita(layoutsBase, larguraCanvas)
        : layoutsBase;
    const layouts = alturaCanvas > 0 && window.CRM_DASHBOARD_LAYOUT?.ajustarAlturasAbaixo
        ? window.CRM_DASHBOARD_LAYOUT.ajustarAlturasAbaixo(layoutsLargura, alturaCanvas)
        : layoutsLargura;
    return new Map(layouts.map(layout => [layout.id, layout]));
}

function renderizarCategoriasWidget(widget) {
    if (!widgetCategoryOptions) return;
    const selecionadas = new Set(obterCategoriasPermitidasWidget(widget));
    const todasSelecionadas = categoriasDashboard.every(item => selecionadas.has(item.codigo));
    widgetCategoryOptions.innerHTML = `
        <label class="crm-category-option is-all">
            <input type="checkbox" data-widget-category-all${todasSelecionadas ? ' checked' : ''}>
            <span>Todas as categorias</span>
        </label>
        ${categoriasDashboard.map(item => `
            <label class="crm-category-option">
                <input type="checkbox" value="${escapeHtml(item.codigo)}" data-widget-category${selecionadas.has(item.codigo) ? ' checked' : ''}>
                <span>${escapeHtml(item.nome)}</span>
            </label>
        `).join('')}
    `;
    if (widgetCategoryError) widgetCategoryError.hidden = selecionadas.size > 0;
}

function coletarCategoriasWidget() {
    if (!widgetCategoryOptions) return categoriasDashboard.map(item => item.codigo);
    return Array.from(widgetCategoryOptions.querySelectorAll('[data-widget-category]:checked'), input => input.value);
}

function obterAlturaCanvasPreferida() {
    const alturaSalva = Number(localStorage.getItem(obterConfigDashboardAtivo().altura));
    if (!Number.isFinite(alturaSalva)) return dashboardCanvasMinHeight;
    return Math.min(dashboardCanvasMaxHeight, Math.max(dashboardCanvasMinHeight, alturaSalva));
}

function atualizarAlturaCanvas(widgets) {
    if (!dashboardCanvas) return 0;
    const alturaConteudo = widgets.reduce((maior, widget, index) => {
        const layout = obterLayoutWidget(widget, index);
        return Math.max(maior, layout.y + layout.h + 28);
    }, dashboardCanvasMinHeight);
    const alturaPreferida = obterAlturaCanvasPreferida();
    const alturaFinal = Math.max(alturaConteudo, alturaPreferida);
    dashboardCanvas.style.minHeight = `${alturaFinal}px`;
    if (canvasHeightValue) canvasHeightValue.textContent = `${alturaFinal} px`;
    if (decreaseCanvasHeightButton) {
        decreaseCanvasHeightButton.disabled = alturaPreferida <= dashboardCanvasMinHeight;
    }
    if (increaseCanvasHeightButton) {
        increaseCanvasHeightButton.disabled = alturaPreferida >= dashboardCanvasMaxHeight;
    }
    return alturaFinal;
}

function ajustarAlturaCanvas(direcao) {
    const alturaAtual = obterAlturaCanvasPreferida();
    const novaAltura = Math.min(
        dashboardCanvasMaxHeight,
        Math.max(dashboardCanvasMinHeight, alturaAtual + (direcao * dashboardCanvasHeightStep))
    );
    localStorage.setItem(obterConfigDashboardAtivo().altura, String(novaAltura));
    atualizarAlturaCanvas(normalizarWidgetsDashboard(obterWidgetsDashboard()));
}

function atualizarLayoutWidget(widgetId, layoutParcial) {
    const widgets = normalizarWidgetsDashboard(obterWidgetsDashboard());
    const index = widgets.findIndex(widget => widget.id === widgetId);
    if (index < 0) return;
    widgets[index] = { ...widgets[index], ...layoutParcial };
    salvarWidgetsDashboard(widgets);
    atualizarAlturaCanvas(widgets);
}
function excluirWidgetDashboard(widgetId) {
    const widgets = obterWidgetsDashboard();
    const widget = widgets.find(item => item.id === widgetId);
    if (!widget) return;
    const confirmado = window.confirm(`Excluir o grafico "${widget.titulo || obterNomeGrafico(widget.tipo)}"?`);
    if (!confirmado) return;
    salvarWidgetsDashboard(widgets.filter(item => item.id !== widgetId));
    estadosDrillDashboard.delete(widgetId);
    limparFiltrosColunaWidget(widgetId);
    renderizarDashboard();
}

function renderizarIconeOlho() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
}

function renderizarIconeExportar() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 20h14"></path></svg>';
}

function renderizarIconePdf() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"></path><path d="M14 2v5h5"></path><path d="M8 16h8"></path><path d="M8 12h5"></path></svg>';
}

function renderizarIconeExcel() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5z"></path><path d="m8 9 4 6"></path><path d="m12 9-4 6"></path><path d="M15 7h2"></path><path d="M15 11h2"></path><path d="M15 15h2"></path></svg>';
}

function renderizarIconeImprimir() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5"></path><path d="M7 17H4V9h16v8h-3"></path><path d="M7 14h10v7H7z"></path></svg>';
}

function renderizarMenuExportacaoWidget() {
    return `
        <span class="crm-widget-export">
            <button type="button" class="crm-widget-query-button" data-widget-export-toggle aria-label="Exportar relatório" title="Exportar relatório">${renderizarIconeExportar()}</button>
            <span class="crm-widget-export-menu" data-widget-export-menu hidden>
                <button type="button" data-widget-export="pdf">${renderizarIconePdf()}<span>PDF</span></button>
                <button type="button" data-widget-export="excel">${renderizarIconeExcel()}<span>Excel</span></button>
                <button type="button" data-widget-export="print">${renderizarIconeImprimir()}<span>Imprimir</span></button>
            </span>
        </span>
    `;
}

function renderizarMenuExportacaoRelatorioDetalhe() {
    return `
        <span class="crm-widget-export">
            <button type="button" class="crm-widget-query-button" data-widget-detail-export-toggle aria-label="Exportar relatório de detalhe" title="Exportar relatório" disabled>${renderizarIconeExportar()}</button>
            <span class="crm-widget-export-menu" data-widget-detail-export-menu hidden>
                <button type="button" data-widget-detail-export="pdf" disabled>${renderizarIconePdf()}<span>PDF</span></button>
                <button type="button" data-widget-detail-export="excel" disabled>${renderizarIconeExcel()}<span>Excel</span></button>
                <button type="button" data-widget-detail-export="print" disabled>${renderizarIconeImprimir()}<span>Imprimir</span></button>
            </span>
        </span>
    `;
}

function atualizarExportacaoRelatorioDetalhe(habilitada) {
    if (!widgetDetailExportHost) return;
    widgetDetailExportHost.querySelectorAll('[data-widget-detail-export-toggle], [data-widget-detail-export]').forEach(botao => {
        botao.disabled = !habilitada;
    });
    if (!habilitada) {
        const menu = widgetDetailExportHost.querySelector('[data-widget-detail-export-menu]');
        if (menu) menu.hidden = true;
    }
}

function nomeArquivoRelatorio(widget, extensao) {
    const base = String(widget?.titulo || 'relatorio')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'relatorio';
    return `${base}.${extensao}`;
}

function obterWidgetExportacao(widgetId) {
    return normalizarWidgetsDashboard(obterWidgetsDashboard()).find(widget => String(widget.id) === String(widgetId));
}

function criarElementoExportacao(widget) {
    const elemento = document.createElement('section');
    elemento.className = 'crm-report-export';
    elemento.style.cssText += obterEstiloAparenciaWidget(widget);
    elemento.innerHTML = `
        <header>
            <h1>${escapeHtml(widget.titulo || obterNomeGrafico(widget.tipo))}</h1>
            <span>${escapeHtml(crmDataInicial?.value || '')} a ${escapeHtml(crmDataFinal?.value || '')}</span>
        </header>
        <div class="crm-report-export-content"></div>
    `;
    const conteudo = elemento.querySelector('.crm-report-export-content');

    if (widget.relatorioDetalhe === true && widget.tipo === 'table') {
        renderizarTabelaSimplesRelatorioDetalhe(conteudo, widget, { exportarTudo: true });
    } else if (widget.tipo === 'table' || widget.tipo === 'pivot') {
        renderizarTabelaGrafico(conteudo, widget, { exportarTudo: true });
    } else {
        const seletor = window.CSS?.escape ? window.CSS.escape(widget.id) : String(widget.id).replace(/"/g, '\\"');
        const card = dashboardCanvas?.querySelector(`[data-widget-id="${seletor}"]`);
        const resultado = card?.querySelector('.crm-dashboard-widget-result')?.cloneNode(true);
        if (resultado) {
            resultado.querySelectorAll('button, [data-drill-menu]').forEach(item => item.remove());
            const areaGrafico = resultado.querySelector('[data-chart-widget]');
            const instancia = instanciasGraficosDashboard.get(widget.id);
            if (areaGrafico && instancia) {
                const imagem = document.createElement('img');
                imagem.className = 'crm-report-chart-image';
                imagem.alt = widget.titulo || 'Gráfico';
                imagem.src = instancia.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#FFFFFF' });
                areaGrafico.replaceChildren(imagem);
            }
            conteudo.appendChild(resultado);
        } else {
            conteudo.textContent = 'Relatório sem conteúdo para exportar.';
        }
    }

    elemento.querySelectorAll('button, .crm-drill-control, .crm-table-pagination, .crm-table-filter-control').forEach(item => item.remove());
    document.body.appendChild(elemento);
    return elemento;
}

function removerElementoExportacao(elemento) {
    if (elemento?.parentNode) elemento.parentNode.removeChild(elemento);
}

async function carregarRelatorioDetalheParaExportacao(widgetAtual) {
    const widgetOrigem = contextoRelatorioDetalheAtual?.widget;
    const selecao = contextoRelatorioDetalheAtual?.selecao || {};
    if (!widgetOrigem) return widgetAtual;
    const detalhe = normalizarConfiguracaoDetalhe(widgetOrigem.detalhe);
    const filtros = {
        ...obterFiltrosCenario(),
        detalheValor: selecao.valor ?? '',
        detalheCampo: selecao.campo || '',
        detalheSerie: selecao.serie || ''
    };
    const response = await fetch('/api/executar-cenario', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(usuarioLogado.sessionToken ? { Authorization: 'Bearer ' + usuarioLogado.sessionToken } : {})
        },
        body: JSON.stringify({
            fonte: detalhe.fonte,
            sql: detalhe.sql,
            filtros,
            visualizacao: detalheMapeiaContato(detalhe) ? null : montarVisualizacaoRelatorioDetalhe(detalhe),
            modoExecucao: 'exportacao'
        })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) window.fazerLogout();
    if (!response.ok) throw new Error(data.details || data.error || 'Erro ao preparar todos os registros do detalhe.');
    const { colunas, registros } = await prepararDadosRelatorioDetalhe(detalhe, data, filtros);
    return {
        ...widgetAtual,
        colunasConsulta: colunas,
        dadosConsulta: registros,
        dadosConsultaAgregados: data.resultadoAgregado === true,
        mapeamentos: criarMapeamentosRelatorioDetalhe(detalhe, colunas, registros)
    };
}

async function carregarWidgetParaExportacao(widget) {
    if (!widget || !['table', 'pivot'].includes(widget.tipo)) return widget;
    if (widget.relatorioDetalhe === true) return carregarRelatorioDetalheParaExportacao(widget);
    return executarWidgetComFiltros(widget, obterFiltrosCenario(), { modoExecucao: 'exportacao' });
}

async function exportarWidgetPdf(widget) {
    if (typeof window.html2pdf !== 'function') throw new Error('Gerador de PDF indisponível.');
    const elemento = criarElementoExportacao(widget);
    try {
        const paisagem = widget.tipo === 'table' || widget.tipo === 'pivot';
        await window.html2pdf().set({
            margin: 8,
            filename: nomeArquivoRelatorio(widget, 'pdf'),
            image: { type: 'jpeg', quality: 0.96 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#FFFFFF' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: paisagem ? 'landscape' : 'portrait' },
            pagebreak: { mode: ['css', 'legacy'], avoid: ['tr'] }
        }).from(elemento).save();
    } finally {
        removerElementoExportacao(elemento);
    }
}

function montarPlanilhaGrafico(widget) {
    if (widget.tipo === 'kpi-calculated') {
        const resultado = obterResultadoKpiCalculado(widget, normalizarWidgetsDashboard(obterWidgetsDashboard()));
        return [
            [widget.titulo || 'Indicador'],
            ['Resultado', resultado.erro ? resultado.erro : resultado.valor]
        ];
    }
    const dados = prepararDadosGrafico(widget);
    if (!dados) return [[widget.titulo || 'Relatório'], ['Sem dados']];
    const linhas = [
        [widget.titulo || 'Relatório'],
        ['Período', crmDataInicial?.value || '', crmDataFinal?.value || ''],
        [],
        [dados.nomeDimensao || 'Categoria', ...dados.series.map(serie => serie.nome)]
    ];
    dados.categorias.forEach((categoria, indice) => {
        linhas.push([categoria, ...dados.series.map(serie => serie.valores[indice] ?? '')]);
    });
    return linhas;
}

function exportarWidgetExcel(widget) {
    if (!window.XLSX) throw new Error('Gerador de Excel indisponível.');
    const workbook = window.XLSX.utils.book_new();
    if (widget.tipo === 'table' || widget.tipo === 'pivot') {
        const elemento = criarElementoExportacao(widget);
        try {
            const tabela = elemento.querySelector('table');
            if (!tabela) throw new Error('Tabela sem dados para exportar.');
            const planilha = window.XLSX.utils.table_to_sheet(tabela, { raw: true });
            window.XLSX.utils.book_append_sheet(workbook, planilha, 'Relatorio');
        } finally {
            removerElementoExportacao(elemento);
        }
    } else {
        const planilha = window.XLSX.utils.aoa_to_sheet(montarPlanilhaGrafico(widget));
        window.XLSX.utils.book_append_sheet(workbook, planilha, 'Relatorio');
    }
    window.XLSX.writeFile(workbook, nomeArquivoRelatorio(widget, 'xlsx'), { compression: true });
}

function imprimirWidget(widget) {
    const elemento = criarElementoExportacao(widget);
    const janela = window.open('', '_blank');
    if (!janela) {
        removerElementoExportacao(elemento);
        throw new Error('O navegador bloqueou a janela de impressão.');
    }
    janela.opener = null;
    const css = document.querySelector('link[href*="crm-style.css"]')?.href || 'crm-style.css';
    janela.addEventListener('load', () => setTimeout(() => { janela.focus(); janela.print(); }, 250), { once: true });
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(widget.titulo || 'Relatório')}</title><link rel="stylesheet" href="${css}"><style>body{margin:0;padding:12mm;background:#fff}.crm-report-export{position:static!important;width:auto!important}.crm-report-export-content{overflow:visible!important}.crm-chart-table-real{height:auto!important;overflow:visible!important}table{page-break-inside:auto}tr{page-break-inside:avoid}.crm-dashboard-widget-result{min-height:180px}@page{margin:10mm}</style></head><body>${elemento.outerHTML}</body></html>`);
    janela.document.close();
    removerElementoExportacao(elemento);
}

async function executarExportacao(widget, formato) {
    if (!widget) return;
    try {
        const widgetCompleto = await carregarWidgetParaExportacao(widget);
        if (formato === 'pdf') await exportarWidgetPdf(widgetCompleto);
        else if (formato === 'excel') exportarWidgetExcel(widgetCompleto);
        else if (formato === 'print') imprimirWidget(widgetCompleto);
    } catch (error) {
        window.alert(error.message || 'Não foi possível exportar o relatório.');
    }
}

async function executarExportacaoWidget(widgetId, formato) {
    await executarExportacao(obterWidgetExportacao(widgetId), formato);
}

function renderizarDashboard() {
    if (!dashboardCanvas) return;
    limparGraficosDashboard();
    const editorAtivo = podeEditarCenarios && modoEdicaoCenario;
    const todosWidgets = normalizarWidgetsDashboard(obterWidgetsDashboard());
    salvarWidgetsDashboard(todosWidgets);
    const widgets = editorAtivo
        ? todosWidgets
        : todosWidgets.filter(widget => widgetVisivelParaCategoria(widget));
    const alturaCanvas = atualizarAlturaCanvas(widgets);
    const layoutsRenderizacao = editorAtivo
        ? new Map(widgets.map((widget, index) => [widget.id, obterLayoutWidget(widget, index)]))
        : obterLayoutsRenderizacao(widgets, alturaCanvas);
    if (!widgets.length) {
        dashboardCanvas.innerHTML = `
            <div class="crm-dashboard-empty">
                <strong>Nenhum grafico neste painel</strong>
                <span>${editorAtivo ? 'Use Adicionar grafico para criar um novo indicador.' : 'Nao ha indicadores disponiveis para seu perfil.'}</span>
            </div>
        `;
        return;
    }
    dashboardCanvas.innerHTML = widgets.map((widget, index) => {
        const layout = layoutsRenderizacao.get(widget.id) || obterLayoutWidget(widget, index);
        const aparencia = obterAparenciaWidget(widget);
        const icone = renderizarIconeWidget(aparencia.icone, 'is-result');
        return `
            <article class="crm-dashboard-widget" data-widget-id="${escapeHtml(widget.id)}" data-widget-type="${escapeHtml(widget.tipo)}" data-widget-align="${escapeHtml(aparencia.alinhamento)}" style="left: ${layout.x}px; top: ${layout.y}px; width: ${layout.w}px; height: ${layout.h}px; ${obterEstiloAparenciaWidget(widget)}">
                <div class="crm-dashboard-widget-head" data-widget-drag-handle>
                    <strong>${escapeHtml(widget.titulo)}</strong>
                    <div class="crm-dashboard-widget-actions">
                        ${renderizarMenuExportacaoWidget()}
                        ${(widget.sql || widget.consultas?.length) ? `<button type="button" class="crm-widget-query-button" data-view-widget-sql aria-label="Ver consulta SQL" title="Ver consulta SQL">${renderizarIconeOlho()}</button>` : ''}
                        ${editorAtivo ? `
                            <button type="button" data-edit-widget>Editar</button>
                            <button type="button" class="crm-danger-button" data-delete-widget>Excluir</button>
                        ` : ''}
                    </div>
                </div>
                <div class="crm-dashboard-widget-result${icone ? ' has-icon' : ''}">
                    ${icone}
                    ${renderizarVisualGrafico(widget)}
                </div>
                ${editorAtivo ? '<span class="crm-dashboard-resize" data-resize-widget aria-hidden="true"></span>' : ''}
            </article>
        `;
    }).join('');
    renderizarGraficosDashboard(widgets, todosWidgets);
}

function atualizarStatusVisualizadorSql(mensagem, erro = false) {
    if (!sqlViewerStatus) return;
    sqlViewerStatus.textContent = mensagem;
    sqlViewerStatus.classList.toggle('is-error', erro);
}

function abrirVisualizadorSql(widgetId) {
    const widget = obterWidgetsDashboard().find(item => item.id === widgetId);
    if (!widget || !sqlViewerModal || !sqlViewerEditor) return;
    if (sqlViewerTitle) sqlViewerTitle.textContent = widget.titulo || 'Consulta SQL';
    const consultasSql = Array.isArray(widget.consultas) && widget.consultas.length ? widget.consultas : [{ alias: 'principal', fonte: widget.fonte, sql: widget.sql }];
    const sqlComposto = consultasSql.map((consulta, indice) => `/* CONSULTA ${indice + 1}: ${consulta.alias || 'consulta'} - ${consulta.fonte || 'firebird'} */\n${consulta.sql || ''}`).join('\n\n');
    sqlViewerEditor.value = sqlComposto;
    renderizarParametrosVisualizadorSql(sqlComposto);
    atualizarStatusVisualizadorSql('');
    sqlViewerModal.hidden = false;
    requestAnimationFrame(() => sqlViewerEditor.focus());
}

function obterSessaoAssinadaVisualizadorSql() {
    try {
        const payload = String(usuarioLogado.sessionToken || '').split('.')[0];
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const normalizado = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
        const bytes = Uint8Array.from(atob(normalizado), caractere => caractere.charCodeAt(0));
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
        return {
            categoria: categoriaCodigo,
            sub: idFuncionarioLogado,
            idfilial: filialId,
            idvendedor: idVendedorLogado
        };
    }
}

function obterNomesParametrosSql(sql) {
    const permitidos = new Set([
        'categoria', 'data_inicial', 'data_final', 'filiais',
        'vendedores', 'idfuncionario', 'idfilial', 'idvendedor'
    ]);
    const pesquisavel = String(sql || '').replace(
        /('(?:''|[^'])*'|"(?:""|[^"])*"|--[^\r\n]*|\/\*[\s\S]*?\*\/)/g,
        ' '
    );
    const encontrados = [];
    const padrao = /:([a-z_][a-z0-9_]*)\b/gi;
    let resultado = null;
    while ((resultado = padrao.exec(pesquisavel)) !== null) {
        const nome = resultado[1].toLowerCase();
        if (permitidos.has(nome) && !encontrados.includes(nome)) encontrados.push(nome);
    }
    return encontrados;
}

function formatarValorParametroSql(valor) {
    const formatarLiteral = item => `'${String(item).replace(/'/g, "''")}'`;
    if (Array.isArray(valor)) {
        if (!valor.length) return '<em>Sem valor</em>';
        return escapeHtml(valor.map(formatarLiteral).join(','));
    }
    if (valor === null || valor === undefined || valor === '') return '<em>Sem valor</em>';
    return escapeHtml(formatarLiteral(valor));
}

function renderizarParametrosVisualizadorSql(sql) {
    if (!sqlViewerParameters) return;
    const filtros = obterFiltrosCenario();
    const sessao = obterSessaoAssinadaVisualizadorSql();
    const valores = {
        categoria: String(sessao.categoria || '').trim().toUpperCase(),
        data_inicial: filtros.dataInicial,
        data_final: filtros.dataFinal,
        filiais: filtros.filiais,
        vendedores: filtros.vendedores,
        idfuncionario: String(sessao.sub || '').trim(),
        idfilial: String(sessao.idfilial || '').trim(),
        idvendedor: String(sessao.idvendedor || '').trim()
    };
    const nomes = obterNomesParametrosSql(sql);
    sqlViewerParameters.innerHTML = nomes.length
        ? nomes.map(nome => `
            <div class="crm-sql-viewer-parameter">
                <code>:${escapeHtml(nome)}</code>
                <span>${formatarValorParametroSql(valores[nome])}</span>
            </div>
        `).join('')
        : '<span class="crm-sql-viewer-parameter-empty">Nenhum parâmetro utilizado.</span>';
}

function fecharVisualizadorSql() {
    if (!sqlViewerModal) return;
    sqlViewerModal.hidden = true;
    atualizarStatusVisualizadorSql('');
}

function formatarSqlVisualizador(sql) {
    const protegidos = [];
    let protegido = String(sql || '').replace(
        /('(?:''|[^'])*'|"(?:""|[^"])*"|--[^\r\n]*|\/\*[\s\S]*?\*\/)/g,
        trecho => `__CRM_SQL_${protegidos.push(trecho) - 1}__`
    );
    protegido = protegido.replace(
        /\bBETWEEN\s+([^\s]+)\s+AND\s+([^\s,)]+)/gi,
        trecho => `__CRM_SQL_${protegidos.push(trecho.replace(/^between/i, 'BETWEEN').replace(/\s+and\s+/i, ' AND ')) - 1}__`
    );
    const palavras = [
        'UNION ALL', 'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
        'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'INNER JOIN', 'GROUP BY', 'ORDER BY',
        'UNION', 'SELECT', 'FROM', 'WHERE', 'HAVING', 'JOIN', 'ON', 'AND', 'OR',
        'WHEN', 'ELSE', 'END', 'LIMIT', 'OFFSET'
    ];
    const padrao = new RegExp(`\\b(${palavras.join('|').replace(/ /g, '\\s+')})\\b`, 'gi');
    const linhas = protegido
        .replace(/\s+/g, ' ')
        .replace(padrao, (_, palavra) => `\n${palavra.toUpperCase().replace(/\s+/g, ' ')}`)
        .trim()
        .split('\n')
        .map(linha => linha.trim())
        .filter(Boolean);
    let nivel = 0;
    const formatado = linhas.map(linha => {
        const fechamentosIniciais = (linha.match(/^\)+/)?.[0].length || 0);
        nivel = Math.max(0, nivel - fechamentosIniciais);
        const resultado = `${'    '.repeat(nivel)}${linha}`;
        const aberturas = (linha.match(/\(/g) || []).length;
        const fechamentos = (linha.match(/\)/g) || []).length - fechamentosIniciais;
        nivel = Math.max(0, nivel + aberturas - fechamentos);
        return resultado;
    }).join('\n');
    return protegidos.reduceRight(
        (resultado, trecho, indice) => resultado.replaceAll(`__CRM_SQL_${indice}__`, trecho),
        formatado
    );
}

function indentarSqlVisualizador() {
    if (!sqlViewerEditor) return;
    sqlViewerEditor.value = formatarSqlVisualizador(sqlViewerEditor.value);
    atualizarStatusVisualizadorSql('Consulta indentada.');
    sqlViewerEditor.focus();
}

async function copiarSqlVisualizador() {
    if (!sqlViewerEditor) return;
    try {
        await navigator.clipboard.writeText(sqlViewerEditor.value);
        atualizarStatusVisualizadorSql('Consulta copiada.');
    } catch (error) {
        sqlViewerEditor.select();
        const copiado = document.execCommand('copy');
        atualizarStatusVisualizadorSql(copiado ? 'Consulta copiada.' : 'Não foi possível copiar.', !copiado);
    }
}

async function colarSqlVisualizador() {
    if (!sqlViewerEditor) return;
    try {
        const texto = await navigator.clipboard.readText();
        const inicio = sqlViewerEditor.selectionStart;
        const fim = sqlViewerEditor.selectionEnd;
        sqlViewerEditor.setRangeText(texto, inicio, fim, 'end');
        atualizarStatusVisualizadorSql('Conteúdo colado.');
        sqlViewerEditor.focus();
    } catch (error) {
        atualizarStatusVisualizadorSql('Permita o acesso à área de transferência para colar.', true);
        sqlViewerEditor.focus();
    }
}

function obterConfigGrafico(tipo) {
    return catalogoGraficos.find(item => item.id === tipo) || catalogoGraficos[1];
}

function obterPapeisGrafico(tipo) {
    return obterConfigGrafico(tipo).roles || ['dimensao', 'valor'];
}

function obterPapeisObrigatoriosGrafico(tipo) {
    const configuracao = obterConfigGrafico(tipo);
    return configuracao.required || configuracao.roles || ['dimensao', 'valor'];
}

function setEtapaWidget(etapa) {
    etapaWidgetAtual = etapa;
    const calculado = ehKpiCalculado();
    widgetSteps.forEach(step => {
        step.hidden = step.dataset.widgetStep !== etapa;
    });
    widgetStepIndicators.forEach(indicator => {
        indicator.classList.toggle('is-active', indicator.dataset.stepIndicator === etapa);
    });
    if (prevWidgetStepButton) prevWidgetStepButton.hidden = etapa === 'sql';
    if (testWidgetQueryButton) testWidgetQueryButton.hidden = etapa !== 'sql' || calculado;
    if (nextWidgetStepButton) nextWidgetStepButton.hidden = etapa !== 'sql';
    if (nextAppearanceStepButton) nextAppearanceStepButton.hidden = etapa !== 'mapping';
    if (saveWidgetButton) saveWidgetButton.hidden = etapa !== 'appearance';
    if (etapa === 'appearance') renderizarPreviaAparencia();
}

function obterFiltrosCenario() {
    const filiaisSelecionadas = categoriaSemFiltrosFilialVendedor ? [] : getFiliaisSelecionadas();
    const vendedoresSelecionados = categoriaSemFiltrosFilialVendedor ? [] : getVendedoresSelecionados();
    const idsFiliaisDisponiveis = filiaisDisponiveis.map(filial => String(filial.idfilial));
    const idsVendedoresDisponiveis = vendedoresDisponiveis.map(vendedor => String(vendedor.idvendedor));
    return {
        contextoDashboard: dashboardContextoAtivo,
        dataInicial: sessionStorage.getItem('crmDataInicial') || crmDataInicial?.value || '',
        dataFinal: sessionStorage.getItem('crmDataFinal') || crmDataFinal?.value || '',
        filiais: filiaisSelecionadas,
        vendedores: vendedoresSelecionados,
        filiaisTodos: categoriaSemFiltrosFilialVendedor || (
            idsFiliaisDisponiveis.length > 0
            && idsFiliaisDisponiveis.every(id => filiaisSelecionadas.includes(id))
        ),
        vendedoresTodos: categoriaSemFiltrosFilialVendedor || (
            idsVendedoresDisponiveis.length > 0
            && idsVendedoresDisponiveis.every(id => vendedoresSelecionados.includes(id))
        ),
        idfuncionario: idFuncionarioLogado || '',
        idfilial: categoriaCodigo === 'VD' ? '' : (filialId || ''),
        idvendedor: categoriaCodigo === 'CX' ? '' : (idVendedorLogado || ''),
        statusContato: contactStatusInputs.filter(input => input.checked).map(input => input.value),
        tiposContato: contactTypeInputs.filter(input => input.checked).map(input => input.value),
        dataContatoInicial: contactDateStart?.value || '',
        dataContatoFinal: contactDateEnd?.value || '',
        versaoRelacionamento: versaoRelacionamentoDashboard
    };
}

function montarVisualizacaoWidget(widget, opcoes = {}) {
    const tipo = String(widget?.tipo || '');
    const ehPivot = tipo === 'pivot';
    const ehKpiAgregado = ['kpi', 'kpi-target'].includes(tipo);
    if (!ehPivot && !ehKpiAgregado) return null;

    const mapeamentos = Array.isArray(widget.mapeamentos) ? widget.mapeamentos : [];
    const dimensoes = ehPivot
        ? (opcoes.campoDrill ? [opcoes.campoDrill] : mapeamentos.filter(item => item.papel === 'linha'))
        : [];
    const colunas = ehPivot ? mapeamentos.filter(item => item.papel === 'coluna') : [];
    const valores = ehPivot
        ? mapeamentos.filter(item => item.papel === 'valor')
        : mapeamentos.filter(item => ['valor', 'meta'].includes(item.papel));
    const possuiAgregacao = valores.some(item => String(item.agregacao || 'none') !== 'none');
    if (!valores.length || (ehPivot && !dimensoes.length) || (ehKpiAgregado && !possuiAgregacao)) return null;

    return {
        agrupar: true,
        resultadoAgregado: ehKpiAgregado,
        cacheBaseDrill: ehPivot && Boolean(opcoes.campoDrill),
        dimensoes: dimensoes.map(item => ({ coluna: item.coluna, ordenacao: obterOrdenacaoCampo(item) })),
        colunas: colunas.map(item => ({ coluna: item.coluna, ordenacao: obterOrdenacaoCampo(item) })),
        valores: valores.map(item => ({
            coluna: item.coluna,
            agregacao: item.agregacao || 'sum',
            ordenacao: obterOrdenacaoCampo(item)
        })),
        filtrosDimensao: Array.isArray(opcoes.filtrosDimensao)
            ? opcoes.filtrosDimensao.map(item => ({ coluna: item.coluna, valor: item.valor }))
            : []
    };
}

async function atualizarDadosMapeadosWidget(mapeamentos) {
    if (coletarConsultasEditor().length > 1) {
        try { recombinarConsultasEditor(); if (widgetEmEdicao) widgetEmEdicao.dadosConsultaAgregados = false; return true; }
        catch (error) { renderizarResultadoConsulta(error.message, 'error'); return false; }
    }
    const tipo = widgetTypeSelect?.value || widgetEmEdicao?.tipo || 'bar';
    const widgetTemporario = {
        ...(widgetEmEdicao || {}),
        tipo,
        mapeamentos,
        fonte: widgetSourceSelect?.value || 'firebird',
        sql: widgetSqlTextarea?.value.trim() || ''
    };
    const visualizacao = montarVisualizacaoWidget(widgetTemporario);
    if (!visualizacao) {
        if (widgetEmEdicao) widgetEmEdicao.dadosConsultaAgregados = false;
        return true;
    }
    renderizarResultadoConsulta('Calculando todos os registros no banco...', 'info');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DASHBOARD_REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch('/api/executar-cenario', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(usuarioLogado.sessionToken ? { Authorization: `Bearer ${usuarioLogado.sessionToken}` } : {})
            },
            body: JSON.stringify({
                fonte: widgetTemporario.fonte,
                sql: widgetTemporario.sql,
                filtros: obterFiltrosCenario(),
                visualizacao,
                modoExecucao: 'edicao'
            })
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) window.fazerLogout();
        if (!response.ok) throw new Error(data.details || data.error || 'Erro ao calcular os dados no banco.');
        dadosConsultaAtual = Array.isArray(data.dados) ? data.dados : (Array.isArray(data.amostra) ? data.amostra : []);
        if (widgetEmEdicao) widgetEmEdicao.dadosConsultaAgregados = data.resultadoAgregado === true;
        renderizarResultadoConsulta(`${data.linhas || dadosConsultaAtual.length} resultado(s) calculado(s) no banco.`, 'success');
        return true;
    } catch (error) {
        renderizarResultadoConsulta(error.name === 'AbortError' ? 'Tempo limite ao calcular os dados.' : error.message, 'error');
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

async function executarDrillDownWidget(contexto, campo) {
    const widget = obterWidgetsDashboard().find(item => item.id === contexto.widgetId);
    if (!widget) return;
    const estadoAtual = estadosDrillDashboard.get(contexto.widgetId);
    const historico = Array.isArray(estadoAtual?.historico) ? [...estadoAtual.historico] : [];
    if (estadoAtual?.campoAtual) {
        historico.push({
            campoAtual: estadoAtual.campoAtual,
            filtros: estadoAtual.filtros || [],
            dados: estadoAtual.dados || []
        });
    }
    estadosDrillDashboard.set(contexto.widgetId, {
        campoAtual: campo,
        filtros: contexto.filtros,
        historico,
        dados: [],
        carregando: true
    });
    renderizarDashboard();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DASHBOARD_REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch('/api/executar-cenario', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(usuarioLogado.sessionToken ? { Authorization: `Bearer ${usuarioLogado.sessionToken}` } : {})
            },
            body: JSON.stringify({
                fonte: widget.fonte || 'firebird',
                sql: widget.sql,
                filtros: obterFiltrosCenario(),
                visualizacao: montarVisualizacaoWidget(widget, {
                    campoDrill: campo,
                    filtrosDimensao: contexto.filtros
                }),
                modoExecucao: 'drilldown'
            })
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) window.fazerLogout();
        if (!response.ok) throw new Error(data.details || data.error || 'Erro ao detalhar os dados.');
        estadosDrillDashboard.set(contexto.widgetId, {
            campoAtual: campo,
            filtros: contexto.filtros,
            historico,
            dados: Array.isArray(data.dados) ? data.dados : (Array.isArray(data.amostra) ? data.amostra : [])
        });
    } catch (error) {
        estadosDrillDashboard.set(contexto.widgetId, {
            campoAtual: campo,
            filtros: contexto.filtros,
            historico,
            dados: [],
            erro: error.name === 'AbortError' ? 'Tempo limite ao detalhar os dados.' : error.message
        });
    } finally {
        clearTimeout(timeout);
        renderizarDashboard();
    }
}

function widgetUtilizaFiltrosVisiveis(widget) {
    const consultas = Array.isArray(widget?.consultas) && widget.consultas.length ? widget.consultas : [{ sql: widget?.sql || '' }];
    if (dashboardContextoAtivo === 'clientes') return consultas.some(consulta => String(consulta.sql || '').trim());
    const usaRelacionamentoFunil = dashboardContextoAtivo === 'funil'
        && consultas.some(consulta => /\/\*\s*(?:operador\s*=\s*(?:AND|OR)\s*\|\s*)?relacionamento\s*\||:(?:status_contato|tipos_contato|data_contato_inicial|data_contato_final)\b/i.test(String(consulta.sql || '')));
    if (usaRelacionamentoFunil) return true;
    const parametros = categoriaCodigo === 'VD'
        ? /:(data_inicial|data_final|idvendedor)\b/i
        : (categoriaCodigo === 'CX'
            ? /:(data_inicial|data_final|idfilial)\b/i
            : /:(data_inicial|data_final|filiais|vendedores)\b/i);
    return consultas.some(consulta => parametros.test(String(consulta.sql || '')));
}

function obterIndicesWidgetsExecutaveis(
    widgets,
    visivel = widgetVisivelParaCategoria,
    utilizaFiltros = widgetUtilizaFiltrosVisiveis,
    somenteComFiltros = true
) {
    return widgets
        .map((widget, index) => {
            const consultas = Array.isArray(widget?.consultas) && widget.consultas.length
                ? widget.consultas
                : [{ sql: widget?.sql || '' }];
            const possuiConsulta = consultas.some(consulta => String(consulta?.sql || '').trim());
            return visivel(widget)
                && possuiConsulta
                && (!somenteComFiltros || utilizaFiltros(widget))
                    ? index
                    : -1;
        })
        .filter(index => index >= 0);
}

function prioridadeExecucaoWidget(widget) {
    const prioridades = {
        kpi: 0,
        'kpi-target': 0,
        'kpi-calculated': 0,
        gauge: 1,
        bullet: 1,
        bar: 2,
        line: 2,
        area: 2,
        donut: 2,
        pie: 2,
        ranking: 3,
        table: 5,
        pivot: 6
    };
    const consultas = Array.isArray(widget?.consultas) && widget.consultas.length
        ? widget.consultas
        : [{ sql: widget?.sql || '' }];
    const penalidadeConsultas = Math.max(0, consultas.length - 1);
    const consultaGeografica = consultas.some(consulta => /filtro\s*:\s*clientes_proximos/i.test(String(consulta?.sql || '')));
    return (prioridades[String(widget?.tipo || '').toLowerCase()] ?? 4)
        + penalidadeConsultas
        + (consultaGeografica ? 3 : 0);
}

function ordenarIndicesExecucaoWidgets(widgets, indices) {
    return [...indices].sort((indiceA, indiceB) => {
        const prioridade = prioridadeExecucaoWidget(widgets[indiceA]) - prioridadeExecucaoWidget(widgets[indiceB]);
        if (prioridade) return prioridade;
        const duracaoA = Number(widgets[indiceA]?.desempenhoExecucao?.duracaoMs) || 0;
        const duracaoB = Number(widgets[indiceB]?.desempenhoExecucao?.duracaoMs) || 0;
        if (duracaoA !== duracaoB) return duracaoA - duracaoB;
        return indiceA - indiceB;
    });
}

async function executarWidgetComFiltros(widget, filtros, opcoes = {}) {
    if (!widgetVisivelParaCategoria(widget)) {
        throw new Error('Card oculto para esta categoria.');
    }
    const consultas = Array.isArray(widget.consultas) && widget.consultas.length ? widget.consultas : [];
    if (consultas.length > 1) {
        const resultados = [];
        for (const consulta of consultas) {
            if (opcoes.signal?.aborted) throw Object.assign(new Error('Atualizacao substituida por outro menu.'), { code: 'DASHBOARD_CONTEXT_CHANGED' });
            resultados.push(await executarConsultaConfigurada(consulta, filtros, null, opcoes));
        }
        const combinado = combinarConsultas(resultados, widget.combinacaoConsultas || { modo: 'single' }, widget.camposCalculados || []);
        const enriquecido = await aplicarRelacionamentoResultadoWidget(widget, combinado.dados, combinado.colunas, filtros);
        const proximidade = resultados.find(resultado => resultado.proximidade)?.proximidade || null;
        return { ...widget, colunasConsulta: enriquecido.colunas, dadosConsulta: enriquecido.registros, dadosConsultaAgregados: false, proximidade, metricasServidor: resultados.map(resultado => resultado.metricas).filter(Boolean), consultaAtualizadaEm: new Date().toISOString() };
    }
    const visualizacao = widgetMapeiaContato(widget) ? null : montarVisualizacaoWidget(widget);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DASHBOARD_REQUEST_TIMEOUT_MS);
    const signalConsulta = opcoes.signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([opcoes.signal, controller.signal])
        : (opcoes.signal || controller.signal);
    try {
        const data = await executarCenarioComRetentativa({
                fonte: widget.fonte || 'firebird',
                sql: widget.sql,
                filtros,
                visualizacao,
                modoExecucao: opcoes.modoExecucao || 'painel'
            }, { signal: signalConsulta, mensagemErro: 'Erro ao atualizar o card.' });
        const colunasRetornadas = Array.isArray(data.colunas) ? data.colunas : [];
        const colunasConsulta = widget.tipo === 'pivot'
            ? Array.from(new Set([...(Array.isArray(widget.colunasConsulta) ? widget.colunasConsulta : []), ...colunasRetornadas]))
            : colunasRetornadas;
        const dadosRetornados = Array.isArray(data.dados) ? data.dados : (Array.isArray(data.amostra) ? data.amostra : []);
        const enriquecido = await aplicarRelacionamentoResultadoWidget(widget, dadosRetornados, colunasConsulta, filtros);
        return { ...widget, colunasConsulta: enriquecido.colunas, dadosConsulta: enriquecido.registros, dadosConsultaAgregados: data.resultadoAgregado === true, proximidade: data.proximidade || null, metricasServidor: data.metricas || null, consultaAtualizadaEm: new Date().toISOString() };
    } finally { clearTimeout(timeout); }
}

function atualizarStatusFiltros(mensagem, erro = false) {
    if (!filterStatus) return;
    filterStatus.textContent = mensagem;
    filterStatus.classList.toggle('is-error', erro);
}

async function executarComConcorrenciaLimitada(itens, limite, executor, aoConcluir = null) {
    const resultados = new Array(itens.length);
    let proximoIndice = 0;
    const quantidadeWorkers = Math.min(Math.max(1, limite), itens.length);
    const worker = async () => {
        while (proximoIndice < itens.length) {
            const indice = proximoIndice;
            proximoIndice += 1;
            try {
                resultados[indice] = { status: 'fulfilled', value: await executor(itens[indice], indice) };
            } catch (reason) {
                resultados[indice] = { status: 'rejected', reason };
            }
            if (typeof aoConcluir === 'function') {
                try {
                    await aoConcluir(resultados[indice], itens[indice], indice);
                } catch (error) {
                    console.error('Falha ao atualizar o progresso do painel.', error);
                }
            }
        }
    };
    await Promise.all(Array.from({ length: quantidadeWorkers }, () => worker()));
    return resultados;
}

async function aplicarFiltrosDashboard(opcoes = {}) {
    const contextoSolicitado = typeof opcoes?.contexto === 'string' ? opcoes.contexto : '';
    const contextoExecucao = dashboardConfigPorView[contextoSolicitado]
        ? contextoSolicitado
        : dashboardContextoAtivo;
    const atualizarInterface = (mensagem, erro = false) => {
        if (dashboardContextoAtivo === contextoExecucao) atualizarStatusFiltros(mensagem, erro);
    };
    const dataInicial = crmDataInicial?.value || '';
    const dataFinal = crmDataFinal?.value || '';
    if (!dataInicial || !dataFinal) return atualizarInterface('Informe as duas datas.', true);
    if (dataInicial > dataFinal) return atualizarInterface('A data inicial deve ser anterior a data final.', true);
    if (!crmFilialFilter?.hidden && filiaisDisponiveis.length && !filiaisRascunho.length) return atualizarInterface('Selecione ao menos uma filial.', true);
    if (!crmSellerFilter?.hidden && vendedoresDisponiveis.length && !vendedoresRascunho.length) {
        return atualizarInterface('Selecione ao menos um vendedor.', true);
    }

    sessionStorage.setItem('crmDataInicial', dataInicial);
    sessionStorage.setItem('crmDataFinal', dataFinal);
    setFiliaisSelecionadas(filiaisRascunho);
    setVendedoresSelecionados(vendedoresRascunho);
    if (crmFilialPanel) crmFilialPanel.hidden = true;
    if (crmVendedorPanel) crmVendedorPanel.hidden = true;
    definirPaginaOrcamento();

    const widgets = obterWidgetsDashboard(contextoExecucao);
    const atualizacaoMenu = opcoes?.origem === 'menu';
    const indices = ordenarIndicesExecucaoWidgets(widgets, obterIndicesWidgetsExecutaveis(
        widgets, widgetVisivelParaCategoria, widgetUtilizaFiltrosVisiveis, !atualizacaoMenu
    ));
    if (!indices.length) return atualizarInterface('Filtros aplicados.');

    const controladorMenu = atualizacaoMenu ? new AbortController() : null;
    if (controladorMenu) {
        controladoresAtualizacaoMenus.get(contextoExecucao)?.abort();
        controladoresAtualizacaoMenus.set(contextoExecucao, controladorMenu);
    }

    if (applyFiltersButton) {
        applyFiltersButton.disabled = true;
        applyFiltersButton.textContent = 'Aplicando...';
    }
    if (resetFiltersButton) resetFiltersButton.disabled = true;
    atualizarInterface('Preparando ' + indices.length + ' consulta' + (indices.length === 1 ? '' : 's') + '...');
    const filtrosConsulta = obterFiltrosCenario();
    let atualizados = 0;
    let falhas = 0;
    let cancelados = 0;
    let concluidos = 0;
    const cardsComErro = [];
    estadosDrillDashboard.clear();
    await executarComConcorrenciaLimitada(
        indices,
        DASHBOARD_QUERY_CONCURRENCY,
        async index => {
            if (controladorMenu?.signal.aborted || (atualizacaoMenu && dashboardContextoAtivo !== contextoExecucao)) {
                throw Object.assign(new Error('Atualizacao substituida por outro menu.'), { code: 'DASHBOARD_CONTEXT_CHANGED' });
            }
            const tituloCard = String(widgets[index]?.titulo || ('Card ' + (index + 1))).trim();
            atualizarInterface('Executando "' + tituloCard + '": ' + concluidos + ' de ' + indices.length + ' consultas concluidas...');
            const inicioExecucao = performance.now();
            const resultado = await executarWidgetComFiltros(widgets[index], filtrosConsulta, { signal: controladorMenu?.signal });
            return {
                ...resultado,
                desempenhoExecucao: {
                    duracaoMs: Math.round(performance.now() - inicioExecucao),
                    atualizadoEm: new Date().toISOString()
                }
            };
        },
        (resultado, index) => {
            concluidos += 1;
            if (resultado.status === 'fulfilled') {
                widgets[index] = resultado.value;
                atualizados += 1;
                salvarWidgetsDashboard(widgets, contextoExecucao);
                if (dashboardContextoAtivo === contextoExecucao) renderizarDashboard();
            } else if (
                resultado.reason?.code === 'DASHBOARD_CONTEXT_CHANGED'
                || (controladorMenu?.signal.aborted && resultado.reason?.name === 'AbortError')
            ) {
                cancelados += 1;
            } else {
                falhas += 1;
                const tituloCard = String(widgets[index]?.titulo || ('Card ' + (index + 1))).trim();
                if (!cardsComErro.includes(tituloCard)) cardsComErro.push(tituloCard);
            }
            const progresso = concluidos + ' de ' + indices.length + ' consulta' + (indices.length === 1 ? '' : 's') + ' concluida' + (concluidos === 1 ? '' : 's');
            if (!controladorMenu?.signal.aborted) {
                atualizarInterface(falhas ? progresso + '; ' + falhas + ' com erro.' : progresso + '...');
            }
        }
    );
    if (controladorMenu && controladoresAtualizacaoMenus.get(contextoExecucao) === controladorMenu) {
        controladoresAtualizacaoMenus.delete(contextoExecucao);
    }
    if (dashboardContextoAtivo === contextoExecucao) {
        if (falhas) {
            atualizarStatusFiltros('Atualizacao concluida com erro em: ' + cardsComErro.join(', ') + '.', true);
        } else if (!cancelados) {
            atualizarStatusFiltros('Atualizacao concluida.');
        }
    }
    if (applyFiltersButton) {
        applyFiltersButton.disabled = false;
        applyFiltersButton.textContent = 'Aplicar';
    }
    if (resetFiltersButton) resetFiltersButton.disabled = false;
}

function fetchJsonComTimeout(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = usuarioLogado.sessionToken
        ? { Authorization: `Bearer ${usuarioLogado.sessionToken}` }
        : {};
    return fetch(url, { signal: controller.signal, headers })
        .then(async response => {
            const data = await response.json().catch(() => ({}));
            if (response.status === 401) window.fazerLogout();
            if (!response.ok) throw new Error(data.error || data.details || 'Erro ao carregar dados.');
            return data;
        })
        .finally(() => clearTimeout(timeout));
}

function renderizarResultadoConsulta(mensagem, tipo = 'info') {
    if (!queryResultBox) return;
    queryResultBox.hidden = false;
    queryResultBox.className = `crm-query-result is-${tipo}`;
    queryResultBox.textContent = mensagem;
    if (tipo === 'error' && queryTableWrap) {
        queryTableWrap.hidden = true;
        queryTableWrap.innerHTML = '';
    }
}

function renderizarTabelaConsulta(dados = {}) {
    if (!queryTableWrap) return;
    const colunas = Array.isArray(dados.colunas) ? dados.colunas : [];
    const linhas = Array.isArray(dados.amostra) ? dados.amostra : [];

    if (!colunas.length) {
        queryTableWrap.hidden = false;
        queryTableWrap.innerHTML = '<div class="crm-query-table-empty">Consulta executada sem colunas retornadas.</div>';
        return;
    }

    const cabecalho = colunas.map(coluna => `<th>${escapeHtml(coluna)}</th>`).join('');
    const corpo = linhas.length
        ? linhas.map(linha => `<tr>${colunas.map(coluna => `<td>${escapeHtml(linha?.[coluna] ?? '')}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${colunas.length}">Consulta executada sem linhas para exibir.</td></tr>`;

    queryTableWrap.hidden = false;
    queryTableWrap.innerHTML = `
        <div class="crm-query-table-head">Previa da consulta: ${linhas.length} de ate ${dados.limite || 100} linhas</div>
        <table class="crm-query-table">
            <thead><tr>${cabecalho}</tr></thead>
            <tbody>${corpo}</tbody>
        </table>
    `;
}

function montarOpcoesPapel(tipo, selecionado = '') {
    const papeis = obterPapeisGrafico(tipo);
    const opcoes = ['ignorar', ...papeis];
    const rotulos = { ignorar: 'Ignorar', dimensao: 'Dimensao', linha: 'Linha', coluna: 'Coluna', valor: 'Realizado / valor', meta: 'Meta' };
    return opcoes.map(papel => `<option value="${papel}"${papel === selecionado ? ' selected' : ''}>${rotulos[papel] || papel}</option>`).join('');
}

function atualizarCamposMapeamento(row) {
    if (!row) return;
    const papel = row.querySelector('[data-map-role]')?.value || 'ignorar';
    const valorAtivo = papel === 'valor' || papel === 'meta';
    const dimensaoAtiva = ['dimensao', 'linha', 'coluna'].includes(papel);
    const campoAgregacao = row.querySelector('[data-map-config="aggregation"]');
    const campoFormatoValor = row.querySelector('[data-map-config="value-format"]');
    const campoFormatoData = row.querySelector('[data-map-config="date-format"]');
    if (campoAgregacao) campoAgregacao.hidden = !valorAtivo;
    if (campoFormatoValor) campoFormatoValor.hidden = !valorAtivo;
    if (campoFormatoData) campoFormatoData.hidden = !dimensaoAtiva;
    if (!valorAtivo) {
        const agregacao = row.querySelector('[data-map-aggregation]');
        if (agregacao) agregacao.value = 'none';
    }
    if (!dimensaoAtiva) {
        const formatoData = row.querySelector('[data-map-date-format]');
        if (formatoData) formatoData.value = 'none';
    }
}

function coletarConfiguracaoTabela() {
    configuracaoTabelaAtual = {
        totalLinhas: Boolean(tableTotalRowsInput?.checked),
        totalColunas: Boolean(tableTotalColumnsInput?.checked),
        repetirRotulos: Boolean(tableRepeatLabelsInput?.checked),
        paginacao: Boolean(tablePaginationInput?.checked),
        registrosPorPagina: normalizarQuantidadeTabela(tablePageSizeInput?.value, 25, 1, 500),
        limiteExibicao: normalizarQuantidadeTabela(tableDisplayLimitInput?.value, 0, 0, 1000),
        agrupamentos: groupOptionsBox
            ? Array.from(groupOptionsBox.querySelectorAll('[data-group-field]:checked')).map(input => input.value)
            : configuracaoTabelaAtual.agrupamentos,
        subtotais: subtotalOptionsBox
            ? Array.from(subtotalOptionsBox.querySelectorAll('[data-subtotal-field]:checked')).map(input => input.value)
            : configuracaoTabelaAtual.subtotais
    };
    return configuracaoTabelaAtual;
}

function renderizarConfiguracaoTabela() {
    if (!tableConfigBox) return;
    const tipo = widgetTypeSelect?.value || widgetEmEdicao?.tipo || 'bar';
    const ativa = tipo === 'table' || tipo === 'pivot';
    const ehPivot = tipo === 'pivot';
    tableConfigBox.hidden = !ativa;
    if (!ativa) return;
    if (tableTotalRowsInput) tableTotalRowsInput.checked = configuracaoTabelaAtual.totalLinhas;
    if (tableTotalColumnsInput) tableTotalColumnsInput.checked = configuracaoTabelaAtual.totalColunas;
    if (tableRepeatLabelsInput) tableRepeatLabelsInput.checked = configuracaoTabelaAtual.repetirRotulos;
    if (tablePaginationInput) tablePaginationInput.checked = configuracaoTabelaAtual.paginacao;
    if (tablePageSizeInput) {
        tablePageSizeInput.value = configuracaoTabelaAtual.registrosPorPagina;
        tablePageSizeInput.disabled = !configuracaoTabelaAtual.paginacao;
    }
    if (tableDisplayLimitInput) tableDisplayLimitInput.value = configuracaoTabelaAtual.limiteExibicao || '';

    const linhas = coletarMapeamentosColunas().filter(item => item.papel === 'linha');
    const colunasLinha = new Set(linhas.map(campo => String(campo.coluna)));
    configuracaoTabelaAtual.agrupamentos = configuracaoTabelaAtual.agrupamentos.filter(coluna => colunasLinha.has(String(coluna)));

    if (groupOptionsBox) {
        groupOptionsBox.hidden = !ehPivot;
        groupOptionsBox.innerHTML = !ehPivot
            ? ''
            : linhas.length > 1
                ? `<strong>Agrupamentos em seções</strong><span>Os campos marcados criam faixas de grupo; os demais permanecem como detalhes.</span><div>${linhas.map(campo => `
                    <label>
                        <input type="checkbox" value="${escapeHtml(campo.coluna)}"${configuracaoTabelaAtual.agrupamentos.includes(String(campo.coluna)) ? ' checked' : ''} data-group-field>
                        ${escapeHtml(obterApelidoMapeamento(campo))}
                    </label>
                `).join('')}</div>`
                : '<span>Adicione ao menos dois campos de linha para criar seções agrupadas.</span>';
    }

    if (!subtotalOptionsBox) return;
    const camposSubtotal = configuracaoTabelaAtual.agrupamentos.length
        ? linhas.filter(campo => configuracaoTabelaAtual.agrupamentos.includes(String(campo.coluna)))
        : linhas.slice(0, -1);
    configuracaoTabelaAtual.subtotais = configuracaoTabelaAtual.subtotais.filter(coluna =>
        camposSubtotal.some(campo => String(campo.coluna) === String(coluna))
    );
    subtotalOptionsBox.innerHTML = camposSubtotal.length
        ? `<strong>${configuracaoTabelaAtual.agrupamentos.length ? 'Subtotais dos agrupamentos' : 'Subtotais por dimensão'}</strong><span>Marque cada nível que deve gerar uma linha de subtotal.</span><div>${camposSubtotal.map(campo => `
            <label>
                <input type="checkbox" value="${escapeHtml(campo.coluna)}"${configuracaoTabelaAtual.subtotais.includes(String(campo.coluna)) ? ' checked' : ''} data-subtotal-field>
                ${escapeHtml(obterApelidoMapeamento(campo))}
            </label>
        `).join('')}</div>`
        : '<span>Selecione um agrupamento para configurar subtotais.</span>';
}

function obterDimensaoConfiguradaFunil() {
    return coletarMapeamentosColunas().find(item => item.papel === 'dimensao') || null;
}

function coletarConfiguracaoFunil() {
    const linhas = funnelStageList
        ? Array.from(funnelStageList.querySelectorAll('[data-funnel-stage-value]'))
        : [];
    const dimensao = obterDimensaoConfiguradaFunil();
    configuracaoFunilAtual = normalizarConfiguracaoFunil({
        modo: funnelModeSelect?.value || configuracaoFunilAtual.modo,
        campoDimensao: dimensao?.coluna || configuracaoFunilAtual.campoDimensao,
        etapas: linhas.length ? linhas.map((linha, indice) => ({
            valor: linha.dataset.funnelStageValue,
            rotulo: linha.querySelector('[data-funnel-stage-label]')?.value.trim() || linha.dataset.funnelStageValue,
            ordem: linha.querySelector('[data-funnel-stage-order]')?.value || (indice + 1)
        })) : configuracaoFunilAtual.etapas
    });
    return configuracaoFunilAtual;
}

function renderizarConfiguracaoFunil() {
    if (!funnelConfigBox) return;
    const tipo = widgetTypeSelect?.value || widgetEmEdicao?.tipo || 'bar';
    const ativo = tipo === 'funnel';
    funnelConfigBox.hidden = !ativo;
    if (!ativo) return;
    const dimensao = obterDimensaoConfiguradaFunil();
    const campoDimensao = String(dimensao?.coluna || '');
    const configuracaoAnterior = normalizarConfiguracaoFunil(configuracaoFunilAtual);
    if (funnelModeSelect) funnelModeSelect.value = configuracaoAnterior.modo;
    const etapasAnteriores = configuracaoAnterior.campoDimensao
        && campoDimensao
        && configuracaoAnterior.campoDimensao !== campoDimensao
        ? []
        : configuracaoAnterior.etapas;
    const etapasAnterioresPorValor = new Map(etapasAnteriores.map(etapa => [normalizarChaveEtapaFunil(etapa.valor), etapa]));
    const porValor = new Map();
    if (dimensao) {
        dadosConsultaAtual.forEach(linha => {
            const valor = obterValorLinha(linha, dimensao.coluna);
            const chave = normalizarChaveEtapaFunil(valor);
            if (!chave || porValor.has(chave)) return;
            const etapaAnterior = etapasAnterioresPorValor.get(chave);
            porValor.set(chave, {
                valor: String(valor),
                rotulo: etapaAnterior?.rotulo || formatarDimensao(valor, dimensao.formatoData),
                ordem: etapaAnterior?.ordem || 0
            });
        });
    }
    const ordensUtilizadas = new Set(Array.from(porValor.values()).map(etapa => etapa.ordem).filter(Boolean));
    let proximaOrdem = 1;
    porValor.forEach(etapa => {
        if (etapa.ordem) return;
        while (ordensUtilizadas.has(proximaOrdem)) proximaOrdem += 1;
        etapa.ordem = proximaOrdem;
        ordensUtilizadas.add(proximaOrdem);
        proximaOrdem += 1;
    });
    configuracaoFunilAtual = normalizarConfiguracaoFunil({
        modo: configuracaoAnterior.modo,
        campoDimensao,
        etapas: Array.from(porValor.values())
    });
    if (funnelModeSelect) funnelModeSelect.value = configuracaoFunilAtual.modo;
    if (funnelStagesBox) funnelStagesBox.hidden = configuracaoFunilAtual.modo !== 'stages';
    if (!funnelStageList) return;
    const etapasOrdenadas = [...configuracaoFunilAtual.etapas]
        .sort((a, b) => (a.ordem - b.ordem) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
    funnelStageList.innerHTML = !dimensao
        ? '<span class="crm-funnel-stage-empty">Selecione uma coluna como Dimensão para configurar as etapas.</span>'
        : etapasOrdenadas.length
            ? etapasOrdenadas.map((etapa, indice) => `
                <div class="crm-funnel-stage-row" data-funnel-stage-value="${escapeHtml(etapa.valor)}">
                    <label>Resultado da dimensão<output title="${escapeHtml(etapa.valor)}">${escapeHtml(etapa.valor)}</output></label>
                    <label>Nome exibido<input type="text" value="${escapeHtml(etapa.rotulo)}" data-funnel-stage-label></label>
                    <label>Ordem<input type="number" min="1" max="999" step="1" value="${etapa.ordem || (indice + 1)}" data-funnel-stage-order></label>
                </div>`).join('')
            : '<span class="crm-funnel-stage-empty">A consulta ainda não retornou valores para a dimensão selecionada.</span>';
}

function renderizarMapeamentoColunas() {
    if (!columnMappingBox) return;
    const tipo = widgetTypeSelect?.value || widgetEmEdicao?.tipo || 'bar';
    const existentes = Array.isArray(widgetEmEdicao?.mapeamentos) ? widgetEmEdicao.mapeamentos : [];
    const porNome = new Map(existentes.map(item => [String(item.coluna).toLowerCase(), item]));

    if (!colunasConsultaAtual.length) {
        columnMappingBox.innerHTML = '';
        if (chartTopConfigBox) chartTopConfigBox.hidden = true;
        if (funnelConfigBox) funnelConfigBox.hidden = true;
        if (tableConfigBox) tableConfigBox.hidden = true;
        if (mappingNote) mappingNote.textContent = 'Execute a consulta para carregar as colunas retornadas.';
        return;
    }

    if (mappingNote) mappingNote.textContent = 'Defina como cada coluna retornada deve ser usada no grafico.';
    const papeisTipo = obterPapeisGrafico(tipo);
    const permiteLimiteTop = tipo !== 'funnel' && papeisTipo.includes('dimensao') && papeisTipo.includes('valor');
    if (chartTopConfigBox) chartTopConfigBox.hidden = !permiteLimiteTop;
    if (chartTopLimitInput) chartTopLimitInput.value = limiteTopAtual || '';
    const colunasPorNome = new Map(colunasConsultaAtual.map(coluna => [String(coluna).toLowerCase(), coluna]));
    const colunasOrdenadas = [
        ...existentes.map(item => colunasPorNome.get(String(item.coluna).toLowerCase())).filter(Boolean),
        ...colunasConsultaAtual.filter(coluna => !porNome.has(String(coluna).toLowerCase()))
    ];
    columnMappingBox.innerHTML = Array.from(new Set(colunasOrdenadas)).map(coluna => {
        const atual = porNome.get(String(coluna).toLowerCase()) || {};
        return `
            <article class="crm-column-row" data-column-name="${escapeHtml(coluna)}">
                <div class="crm-column-identity">
                    <strong>${escapeHtml(coluna)}</strong>
                    <span class="crm-column-order-actions" aria-label="Ordenar coluna">
                        <button type="button" data-map-move="-1" aria-label="Mover ${escapeHtml(coluna)} para cima" title="Mover para cima">&#8593;</button>
                        <button type="button" data-map-move="1" aria-label="Mover ${escapeHtml(coluna)} para baixo" title="Mover para baixo">&#8595;</button>
                    </span>
                </div>
                <label>
                    Apelido do rótulo
                    <input type="text" value="${escapeHtml(atual.apelido || coluna)}" data-map-alias>
                </label>
                <label>
                    Uso
                    <select data-map-role>${montarOpcoesPapel(tipo, atual.papel || 'ignorar')}</select>
                </label>
                <label>
                    Alinhamento
                    <select data-map-alignment data-user-defined="${atual.alinhamento ? 'true' : 'false'}">
                        <option value="left"${obterAlinhamentoCampo(atual, ['valor', 'meta'].includes(atual.papel) ? 'right' : 'left') === 'left' ? ' selected' : ''}>Esquerda</option>
                        <option value="center"${obterAlinhamentoCampo(atual, ['valor', 'meta'].includes(atual.papel) ? 'right' : 'left') === 'center' ? ' selected' : ''}>Centro</option>
                        <option value="right"${obterAlinhamentoCampo(atual, ['valor', 'meta'].includes(atual.papel) ? 'right' : 'left') === 'right' ? ' selected' : ''}>Direita</option>
                    </select>
                </label>
                <label>
                    Ordenação
                    <select data-map-order>
                        <option value="none"${obterOrdenacaoCampo(atual) === 'none' ? ' selected' : ''}>Sem ordenação</option>
                        <option value="asc"${obterOrdenacaoCampo(atual) === 'asc' ? ' selected' : ''}>Crescente</option>
                        <option value="desc"${obterOrdenacaoCampo(atual) === 'desc' ? ' selected' : ''}>Decrescente</option>
                    </select>
                </label>
                <label data-map-config="aggregation">
                    Agregacao
                    <select data-map-aggregation>
                        <option value="none"${(atual.agregacao || 'none') === 'none' ? ' selected' : ''}>Nenhuma</option>
                        <option value="sum"${atual.agregacao === 'sum' ? ' selected' : ''}>SUM</option>
                        <option value="count"${atual.agregacao === 'count' ? ' selected' : ''}>COUNT</option>
                        <option value="count_distinct"${atual.agregacao === 'count_distinct' ? ' selected' : ''}>COUNT DISTINCT</option>
                        <option value="min"${atual.agregacao === 'min' ? ' selected' : ''}>MIN</option>
                        <option value="max"${atual.agregacao === 'max' ? ' selected' : ''}>MAX</option>
                        <option value="avg"${atual.agregacao === 'avg' ? ' selected' : ''}>AVG</option>
                    </select>
                </label>
                <label data-map-config="value-format">
                    Formato valor
                    <select data-map-value-format>
                        <option value="money"${(atual.formatoValor || 'money') === 'money' ? ' selected' : ''}>Monetario</option>
                        <option value="percent"${atual.formatoValor === 'percent' ? ' selected' : ''}>Percentual</option>
                        <option value="integer"${atual.formatoValor === 'integer' ? ' selected' : ''}>Numerico inteiro</option>
                        <option value="decimal"${atual.formatoValor === 'decimal' ? ' selected' : ''}>Numerico decimal</option>
                    </select>
                </label>
                <label data-map-config="date-format">
                    Formato data
                    <select data-map-date-format>
                        <option value="none"${(atual.formatoData || 'none') === 'none' ? ' selected' : ''}>Nao se aplica</option>
                        <option value="day"${atual.formatoData === 'day' ? ' selected' : ''}>Dia</option>
                        <option value="month"${atual.formatoData === 'month' ? ' selected' : ''}>Mes</option>
                        <option value="quarter"${atual.formatoData === 'quarter' ? ' selected' : ''}>Trimestre</option>
                        <option value="year"${atual.formatoData === 'year' ? ' selected' : ''}>Ano</option>
                    </select>
                </label>
            </article>
        `;
    }).join('');
    columnMappingBox.querySelectorAll('[data-column-name]').forEach(atualizarCamposMapeamento);
    atualizarControlesOrdemMapeamento();
    renderizarConfiguracaoTabela();
    renderizarConfiguracaoFunil();
}

function atualizarControlesOrdemMapeamento() {
    if (!columnMappingBox) return;
    const linhas = Array.from(columnMappingBox.querySelectorAll('[data-column-name]'));
    linhas.forEach((linha, indice) => {
        const subir = linha.querySelector('[data-map-move="-1"]');
        const descer = linha.querySelector('[data-map-move="1"]');
        if (subir) subir.disabled = indice === 0;
        if (descer) descer.disabled = indice === linhas.length - 1;
    });
}

function coletarMapeamentosColunas() {
    if (!columnMappingBox) return [];
    return Array.from(columnMappingBox.querySelectorAll('[data-column-name]')).map(row => {
        const papel = row.querySelector('[data-map-role]')?.value || 'ignorar';
        const valorAtivo = papel === 'valor' || papel === 'meta';
        const dimensaoAtiva = ['dimensao', 'linha', 'coluna'].includes(papel);
        return {
            coluna: row.dataset.columnName,
            apelido: row.querySelector('[data-map-alias]')?.value.trim() || row.dataset.columnName,
            papel,
            agregacao: valorAtivo ? (row.querySelector('[data-map-aggregation]')?.value || 'none') : 'none',
            formatoValor: valorAtivo ? (row.querySelector('[data-map-value-format]')?.value || 'decimal') : null,
            formatoData: dimensaoAtiva ? (row.querySelector('[data-map-date-format]')?.value || 'none') : 'none',
            alinhamento: row.querySelector('[data-map-alignment]')?.value || (valorAtivo ? 'right' : 'left'),
            ordenacao: row.querySelector('[data-map-order]')?.value || 'none'
        };
    });
}


function obterLinhasConsultasSecundarias() {
    return secondaryQueriesBox ? Array.from(secondaryQueriesBox.querySelectorAll('[data-secondary-query-row]')) : [];
}

function fecharFormularioContato() {
    if (contactModal) contactModal.hidden = true;
    if (contactFormMessage) contactFormMessage.textContent = '';
    origemFormularioContatoAtual = 'dashboard';
}

function cabecalhosSessao() {
    return { 'Content-Type': 'application/json', ...(usuarioLogado.sessionToken ? { Authorization: 'Bearer ' + usuarioLogado.sessionToken } : {}) };
}

function definirFormularioContato(contato, documento, nome) {
    const existente = Boolean(contato);
    if (contactDocument) contactDocument.textContent = documento;
    if (contactName) contactName.textContent = contato?.nomeCliente || nome;
    if (contactFormStatus) contactFormStatus.value = contato?.statusContato || 'PENDENTE';
    if (contactFormType) contactFormType.value = contato?.tipoContato || 'WHATSAPP';
    if (contactFormNotes) contactFormNotes.value = contato?.observacao || '';
    if (contactForm) {
        contactForm.dataset.document = documento;
        contactForm.dataset.name = contato?.nomeCliente || nome;
    }
    const bloqueado = contato?.finalizado === true;
    [contactFormStatus, contactFormType, contactFormNotes, saveContactButton].forEach(campo => { if (campo) campo.disabled = bloqueado; });
    if (contactFormMeta) {
        const partes = [existente ? 'Ação: atualizar' : 'Ação: incluir'];
        if (contato?.qtdeContato) partes.push('Ciclo de contato: ' + contato.qtdeContato);
        if (contato?.dataUltimaAtualizacao) {
            partes.push('Última atualização: ' + new Date(contato.dataUltimaAtualizacao).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo'
            }));
        }
        if (bloqueado) partes.push('Contato finalizado e bloqueado para alterações.');
        contactFormMeta.textContent = partes.join(' | ');
    }
}

async function abrirFormularioContato(documento, nome, origem = 'dashboard') {
    if (!contactModal || !documento) return;
    origemFormularioContatoAtual = origem;
    contactModal.hidden = false;
    if (contactFormMessage) contactFormMessage.textContent = 'Carregando contato...';
    [contactFormStatus, contactFormType, contactFormNotes, saveContactButton].forEach(campo => { if (campo) campo.disabled = true; });
    try {
        const response = await fetch('/api/controle-contato?documento=' + encodeURIComponent(documento), { headers: cabecalhosSessao() });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) window.fazerLogout();
        if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o contato.');
        definirFormularioContato(data.contato, documento, nome);
        if (contactFormMessage) contactFormMessage.textContent = '';
    } catch (error) {
        if (contactFormMessage) contactFormMessage.textContent = error.message;
    }
}

function definirValorContatoNaLinha(linha, campo, valor) {
    const existente = encontrarCampoContato(linha, [campo]);
    linha[existente || ('contato.' + campo)] = valor;
}

function atualizarContatoNoPainel(contato) {
    const widgets = obterWidgetsDashboard('clientes');
    const filtros = obterFiltrosCenario();
    filtros.contextoDashboard = 'clientes';
    widgets.forEach(widget => {
        const dados = Array.isArray(widget.dadosConsulta) ? widget.dadosConsulta : [];
        dados.forEach(linha => {
            const documento = String(obterValorContato(linha, ['DOCTOCLIENTE', 'DOCUMENTO'], '')).trim();
            if (documento !== String(contato.doctocliente)) return;
            definirValorContatoNaLinha(linha, 'STATUS_CONTATO', contato.statusContato);
            definirValorContatoNaLinha(linha, 'TIPO_CONTATO', contato.tipoContato);
            definirValorContatoNaLinha(linha, 'OBSERVACAO', contato.observacao);
            definirValorContatoNaLinha(linha, 'DATA_PRIMEIRO_CONTATO', contato.dataPrimeiroContato);
            definirValorContatoNaLinha(linha, 'DATA_ULTIMO_CONTATO', contato.dataUltimoContato);
            definirValorContatoNaLinha(linha, 'DATA_FINALIZACAO', contato.dataFinalizacao);
            definirValorContatoNaLinha(linha, 'QTDE_CONTATO', contato.qtdeContato);
            definirValorContatoNaLinha(linha, 'DATA_ULTIMA_ATUALIZACAO', contato.dataUltimaAtualizacao);
        });
        widget.dadosConsulta = aplicarFiltrosContatoRegistros(dados, filtros);
    });
    salvarWidgetsDashboard(widgets, 'clientes');
    if (dashboardContextoAtivo === 'clientes') renderizarDashboard();
}

async function salvarFormularioContato(event) {
    event.preventDefault();
    if (!contactForm || !saveContactButton) return;
    saveContactButton.disabled = true;
    if (contactFormMessage) contactFormMessage.textContent = 'Salvando contato...';
    try {
        const response = await fetch('/api/controle-contato', {
            method: 'POST', headers: cabecalhosSessao(),
            body: JSON.stringify({
                doctocliente: contactForm.dataset.document,
                nomeCliente: contactForm.dataset.name,
                statusContato: contactFormStatus?.value,
                tipoContato: contactFormType?.value,
                observacao: contactFormNotes?.value || ''
            })
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) window.fazerLogout();
        if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o contato.');
        versaoRelacionamentoDashboard = Date.now();
        const contextoDetalhe = origemFormularioContatoAtual === 'detalhe'
            ? contextoRelatorioDetalheAtual
            : null;
        atualizarContatoNoPainel(data.contato);
        fecharFormularioContato();
        if (contextoDetalhe && !widgetDetailModal?.hidden) {
            await abrirRelatorioDetalhe(contextoDetalhe.widget, contextoDetalhe.selecao);
            atualizarStatusFiltros('Contato salvo e relatório atualizado.');
        } else {
            atualizarStatusFiltros('Contato salvo.');
        }
    } catch (error) {
        if (contactFormMessage) contactFormMessage.textContent = error.message;
        saveContactButton.disabled = false;
    }
}

async function atualizarWidgetAposNegociacao(widgetId) {
    const widgets = obterWidgetsDashboard();
    const indice = widgets.findIndex(widget => String(widget.id) === String(widgetId));
    if (indice < 0) return;
    try {
        atualizarStatusFiltros('Atualizando relatorio da negociacao...');
        widgets[indice] = await executarWidgetComFiltros(widgets[indice], obterFiltrosCenario());
        salvarWidgetsDashboard(widgets);
        renderizarDashboard();
        atualizarStatusFiltros('Negociacao salva e relatorio atualizado.');
    } catch (error) {
        atualizarStatusFiltros('Negociacao salva, mas o relatorio nao pode ser atualizado.', true);
    }
}

function abrirGestaoNegociacao(elemento, origem = 'dashboard') {
    const orcamentoId = Number.parseInt(elemento?.dataset?.budgetId, 10);
    if (!orcamentoId || !window.BudgetNegotiation) return;
    const card = elemento.closest('[data-widget-id]');
    const widgetId = card?.dataset.widgetId || contextoRelatorioDetalheAtual?.widget?.id || widgetDetalheModalAtual?.id || '';
    window.BudgetNegotiation.open({
        orcamentoId,
        onSaved: async () => {
            if (widgetId) await atualizarWidgetAposNegociacao(widgetId);
            if (origem === 'detalhe' && contextoRelatorioDetalheAtual && !widgetDetailModal?.hidden) {
                await abrirRelatorioDetalhe(contextoRelatorioDetalheAtual.widget, contextoRelatorioDetalheAtual.selecao);
            }
        }
    });
}
function renderizarConsultasSecundarias(consultas = []) {
    if (!secondaryQueriesBox) return;
    secondaryQueriesBox.innerHTML = consultas.map((consulta, indice) => `
        <section class="crm-secondary-query" data-secondary-query-row>
            <div class="crm-query-source-head">
                <label>Apelido da consulta<input type="text" value="${escapeHtml(consulta.alias || ('consulta' + (indice + 2)))}" data-secondary-query-alias></label>
                <label>Fonte de dados<select data-secondary-query-source><option value="firebird"${(consulta.fonte || 'firebird') === 'firebird' ? ' selected' : ''}>Firebird</option><option value="postgres"${consulta.fonte === 'postgres' ? ' selected' : ''}>Postgres</option></select></label>
                <button type="button" data-remove-secondary-query aria-label="Remover consulta ${indice + 2}" title="Remover consulta">×</button>
            </div>
            <label class="crm-sql-field">Console SQL ${indice + 2}<textarea data-secondary-query-sql spellcheck="false" placeholder="Consulta adicional com colunas equivalentes.">${escapeHtml(consulta.sql || '')}</textarea></label>
        </section>
    `).join('');
}
function aguardarRetentativaFila(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(Object.assign(new DOMException('Operacao cancelada.', 'AbortError'), { code: 'DASHBOARD_CONTEXT_CHANGED' }));
            return;
        }
        const timeout = setTimeout(() => {
            signal?.removeEventListener('abort', cancelar);
            resolve();
        }, ms);
        const cancelar = () => {
            clearTimeout(timeout);
            reject(new DOMException('Operacao cancelada.', 'AbortError'));
        };
        signal?.addEventListener('abort', cancelar, { once: true });
    });
}

async function executarCenarioComRetentativa(payload, opcoes = {}) {
    for (let tentativa = 0; tentativa <= DASHBOARD_QUEUE_RETRY_LIMIT; tentativa += 1) {
        const response = await fetch('/api/executar-cenario', {
            method: 'POST',
            signal: opcoes.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(usuarioLogado.sessionToken ? { Authorization: 'Bearer ' + usuarioLogado.sessionToken } : {})
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) window.fazerLogout();
        const filaTemporariamenteOcupada = ['BI_GATEWAY_QUEUE_TIMEOUT', 'BI_GATEWAY_QUEUE_FULL'].includes(data.code);
        if (response.ok || !filaTemporariamenteOcupada || tentativa >= DASHBOARD_QUEUE_RETRY_LIMIT) {
            if (!response.ok) {
                const error = new Error(data.details || data.error || opcoes.mensagemErro || 'Erro ao atualizar o card.');
                error.code = data.code || 'DASHBOARD_QUERY_ERROR';
                throw error;
            }
            return data;
        }
        await aguardarRetentativaFila(DASHBOARD_QUEUE_RETRY_DELAY_MS + Math.floor(Math.random() * 600), opcoes.signal);
    }
    throw new Error(opcoes.mensagemErro || 'Erro ao atualizar o card.');
}
function consultaSecundariaAtiva() { return obterLinhasConsultasSecundarias().length > 0; }
function coletarConsultasEditor() {
    const consultas = [{ alias: widgetQueryAliasInput?.value.trim() || 'principal', fonte: widgetSourceSelect?.value || 'firebird', sql: widgetSqlTextarea?.value.trim() || '' }];
    obterLinhasConsultasSecundarias().forEach((row, indice) => consultas.push({
        alias: row.querySelector('[data-secondary-query-alias]')?.value.trim() || ('consulta' + (indice + 2)),
        fonte: row.querySelector('[data-secondary-query-source]')?.value || 'firebird',
        sql: row.querySelector('[data-secondary-query-sql]')?.value.trim() || ''
    }));
    return consultas;
}
function coletarCombinacaoEditor() { return { modo: queryCombinationModeSelect?.value || 'single', chavePrincipal: primaryKeySelect?.value || '', chaveSecundaria: secondaryKeySelect?.value || '' }; }
function coletarCamposCalculadosEditor() { return calculatedFieldList ? Array.from(calculatedFieldList.querySelectorAll('[data-calculated-field-row]')).map(row => ({ nome: row.querySelector('[data-calculated-name]')?.value.trim() || '', formula: row.querySelector('[data-calculated-formula]')?.value.trim() || '' })) : []; }
function assinaturaConsultasEditor() { return JSON.stringify({ consultas: coletarConsultasEditor(), combinacao: coletarCombinacaoEditor(), camposCalculados: coletarCamposCalculadosEditor() }); }
function preencherSelectCampos(select, colunas, selecionado) { if (!select) return; const lista = [...(colunas || [])]; if (selecionado && !lista.some(coluna => String(coluna) === String(selecionado))) lista.unshift(selecionado); select.innerHTML = '<option value="">Selecione...</option>' + lista.map(coluna => `<option value="${escapeHtml(coluna)}"${String(coluna) === String(selecionado) ? ' selected' : ''}>${escapeHtml(coluna)}</option>`).join(''); }
function atualizarControlesCombinacao() { const ativa = consultaSecundariaAtiva(); if (queryCombinationBox) queryCombinationBox.hidden = !ativa; const porChave = ativa && queryCombinationModeSelect?.value === 'key'; if (primaryKeyField) primaryKeyField.hidden = !porChave; if (secondaryKeyField) secondaryKeyField.hidden = !porChave; if (calculatedFieldsBox) calculatedFieldsBox.hidden = !ativa; }
function renderizarCamposCalculados(campos = []) { if (!calculatedFieldList) return; calculatedFieldList.innerHTML = campos.map(campo => `<div class="crm-calculated-field-row" data-calculated-field-row><label>Nome do campo<input type="text" value="${escapeHtml(campo.nome || '')}" data-calculated-name placeholder="ATINGIMENTO"></label><label>Fórmula<input type="text" value="${escapeHtml(campo.formula || '')}" data-calculated-formula placeholder="[principal.TOTAL] / [secundaria.META] * 100"></label><button type="button" data-remove-calculated-field aria-label="Remover campo" title="Remover campo">×</button></div>`).join(''); }
async function executarConsultaConfigurada(consulta, filtros, visualizacao = null, opcoes = {}) {
    const data = await executarCenarioComRetentativa({
            fonte: consulta.fonte,
            sql: consulta.sql,
            filtros,
            visualizacao,
            modoExecucao: opcoes.modoExecucao || 'painel'
        }, {
            signal: opcoes.signal,
            mensagemErro: `Erro na consulta ${consulta.alias}.`
        });
    return {
        ...consulta,
        colunas: Array.isArray(data.colunas) ? data.colunas : [],
        dados: Array.isArray(data.dados) ? data.dados : (Array.isArray(data.amostra) ? data.amostra : []),
        proximidade: data.proximidade || null,
        metricas: data.metricas || null
    };
}
function combinarConsultas(resultados, combinacao, camposCalculados) { if (!window.CRM_COMPOSITE_DATASETS) throw new Error('Combinador de consultas indisponível.'); return window.CRM_COMPOSITE_DATASETS.combinar(resultados, combinacao, camposCalculados, window.CRM_KPI_CALCULATOR?.avaliar); }
function recombinarConsultasEditor() { const combinado = combinarConsultas(resultadosConsultasAtuais, coletarCombinacaoEditor(), coletarCamposCalculadosEditor()); colunasConsultaAtual = combinado.colunas; dadosConsultaAtual = combinado.dados; renderizarMapeamentoColunas(); renderizarTabelaConsulta({ colunas: combinado.colunas, amostra: combinado.dados.slice(0, 100), dados: combinado.dados, linhas: combinado.dados.length }); return combinado; }

async function testarConsultaWidget() {
    const consultas = coletarConsultasEditor();
    if (consultas.some(consulta => !consulta.sql)) { renderizarResultadoConsulta('Digite o SQL de todas as consultas.', 'error'); return false; }
    const aliases = consultas.map(consulta => consulta.alias.toLowerCase());
    if (new Set(aliases).size !== aliases.length) { renderizarResultadoConsulta('Use apelidos diferentes para as consultas.', 'error'); return false; }
    renderizarResultadoConsulta('Executando ' + consultas.length + ' consulta(s)...', 'info');
    try {
        resultadosConsultasAtuais = [];
        const filtrosExecucao = obterFiltrosCenario();
        for (let indice = 0; indice < consultas.length; indice += 1) {
            renderizarResultadoConsulta('Executando consulta ' + (indice + 1) + ' de ' + consultas.length + '...', 'info');
            resultadosConsultasAtuais.push(await executarConsultaConfigurada(
                consultas[indice],
                filtrosExecucao,
                null,
                { modoExecucao: 'edicao' }
            ));
        }
        const combinacaoSalva = coletarCombinacaoEditor();
        preencherSelectCampos(primaryKeySelect, resultadosConsultasAtuais[0]?.colunas, combinacaoSalva.chavePrincipal);
        preencherSelectCampos(secondaryKeySelect, resultadosConsultasAtuais[1]?.colunas, combinacaoSalva.chaveSecundaria);
        if (resultadosConsultasAtuais.length > 1 && resultadosConsultasAtuais.some(item => item.dados.length > 1) && queryCombinationModeSelect?.value === 'single') {
            const assinaturaColunas = item => item.colunas.map(coluna => String(coluna).toLowerCase()).sort().join('|');
            const estruturasEquivalentes = resultadosConsultasAtuais.every(item => assinaturaColunas(item) === assinaturaColunas(resultadosConsultasAtuais[0]));
            queryCombinationModeSelect.value = estruturasEquivalentes || resultadosConsultasAtuais.length > 2 ? 'union' : 'key';
            if (queryCombinationModeSelect.value === 'key') {
                const comuns = resultadosConsultasAtuais[0].colunas.filter(coluna => resultadosConsultasAtuais[1].colunas.some(item => String(item).toLowerCase() === String(coluna).toLowerCase()));
                if (comuns[0]) { primaryKeySelect.value = comuns[0]; secondaryKeySelect.value = resultadosConsultasAtuais[1].colunas.find(item => String(item).toLowerCase() === String(comuns[0]).toLowerCase()) || ''; }
            }
        }
        atualizarControlesCombinacao();
        const combinado = recombinarConsultasEditor();
        const enriquecido = await enriquecerRegistrosContato(combinado.dados, combinado.colunas, dashboardContextoAtivo);
        colunasConsultaAtual = enriquecido.colunas;
        dadosConsultaAtual = enriquecido.registros;
        renderizarMapeamentoColunas();
        renderizarTabelaConsulta({ colunas: enriquecido.colunas, amostra: enriquecido.registros.slice(0, 100), dados: enriquecido.registros, linhas: enriquecido.registros.length });
        assinaturaConsultaAtual = assinaturaConsultasEditor();
        renderizarResultadoConsulta(enriquecido.colunas.length + ' colunas combinadas. ' + enriquecido.registros.length + ' linhas disponíveis.', 'success');
        return true;
    } catch (error) {
        colunasConsultaAtual = []; dadosConsultaAtual = []; assinaturaConsultaAtual = ''; renderizarMapeamentoColunas();
        if (queryTableWrap) { queryTableWrap.hidden = true; queryTableWrap.innerHTML = ''; }
        renderizarResultadoConsulta(error.message || 'Erro ao executar consultas.', 'error'); return false;
    }
}
function abrirModalWidget(widgetId) {
    if (!widgetModal) return;
    const widgets = normalizarWidgetsDashboard(obterWidgetsDashboard());
    salvarWidgetsDashboard(widgets);
    widgetEmEdicao = widgets.find(widget => widget.id === widgetId) || criarWidgetPadrao();
    colunasConsultaAtual = Array.isArray(widgetEmEdicao.colunasConsulta) ? widgetEmEdicao.colunasConsulta : [];
    dadosConsultaAtual = Array.isArray(widgetEmEdicao.dadosConsulta) ? widgetEmEdicao.dadosConsulta : [];
    assinaturaConsultaAtual = '';
    resultadosConsultasAtuais = [];

    if (widgetTypeSelect) {
        widgetTypeSelect.innerHTML = catalogoGraficos.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nome)}</option>`).join('');
        widgetTypeSelect.value = widgetEmEdicao.tipo;
    }
    configuracaoTabelaAtual = obterConfiguracaoTabela(widgetEmEdicao);
    limiteTopAtual = normalizarLimiteTopGrafico(widgetEmEdicao.limiteTop);
    configuracaoFunilAtual = normalizarConfiguracaoFunil(widgetEmEdicao.funil);
    if (widgetTitleInput) widgetTitleInput.value = widgetEmEdicao.titulo || '';
    const consultasWidget = Array.isArray(widgetEmEdicao.consultas) && widgetEmEdicao.consultas.length
        ? widgetEmEdicao.consultas
        : [{ alias: 'principal', fonte: widgetEmEdicao.fonte || 'firebird', sql: widgetEmEdicao.sql || '' }];
    const principalWidget = consultasWidget[0];
    if (widgetSourceSelect) widgetSourceSelect.value = principalWidget.fonte || 'firebird';
    if (widgetSqlTextarea) widgetSqlTextarea.value = principalWidget.sql || '';
    if (widgetQueryAliasInput) widgetQueryAliasInput.value = principalWidget.alias || 'principal';
    renderizarConsultasSecundarias(consultasWidget.slice(1));
    const combinacaoWidget = widgetEmEdicao.combinacaoConsultas || { modo: 'single' };
    if (queryCombinationModeSelect) queryCombinationModeSelect.value = combinacaoWidget.modo || 'single';
    preencherSelectCampos(primaryKeySelect, [], combinacaoWidget.chavePrincipal);
    preencherSelectCampos(secondaryKeySelect, [], combinacaoWidget.chaveSecundaria);
    renderizarCamposCalculados(widgetEmEdicao.camposCalculados || []);
    atualizarControlesCombinacao();
    assinaturaConsultaAtual = dadosConsultaAtual.length ? assinaturaConsultasEditor() : '';
    if (queryResultBox) queryResultBox.hidden = true;
    if (queryTableWrap) { queryTableWrap.hidden = true; queryTableWrap.innerHTML = ''; }
    renderizarMapeamentoColunas();
    carregarConfiguracaoKpiCalculado(widgetEmEdicao);
    carregarConfiguracaoDetalhe(widgetEmEdicao);
    carregarAparenciaWidget(widgetEmEdicao);
    renderizarCategoriasWidget(widgetEmEdicao);
    atualizarModoConfiguracaoWidget();
    setEtapaWidget('sql');
    widgetModal.hidden = false;
}

function fecharModalWidget() {
    if (widgetModal) widgetModal.hidden = true;
    if (instanciaPreviaAparencia) {
        instanciaPreviaAparencia.dispose();
        instanciaPreviaAparencia = null;
    }
    widgetEmEdicao = null;
    colunasConsultaAtual = [];
    dadosConsultaAtual = [];
    assinaturaConsultaAtual = '';
    resultadosConsultasAtuais = [];
    limiteTopAtual = 0;
    configuracaoFunilAtual = { modo: 'total', campoDimensao: '', etapas: [] };
}

function validarMapeamentoWidget(mapeamentos) {
    const tipo = widgetTypeSelect?.value || widgetEmEdicao?.tipo || 'bar';
    const papeis = obterPapeisObrigatoriosGrafico(tipo);
    const faltantes = papeis.filter(papel => !mapeamentos.some(item => item.papel === papel));
    if (faltantes.length) {
        renderizarResultadoConsulta(`Falta definir: ${faltantes.join(', ')}.`, 'error');
        setEtapaWidget('mapping');
        return false;
    }
    return true;
}

function validarConfiguracaoFunil(configuracao) {
    const tipo = widgetTypeSelect?.value || widgetEmEdicao?.tipo || 'bar';
    if (tipo !== 'funnel' || configuracao.modo !== 'stages') return true;
    if (!configuracao.etapas.length) {
        renderizarResultadoConsulta('A consulta precisa retornar as etapas do funil.', 'error');
        setEtapaWidget('mapping');
        return false;
    }
    const ordens = configuracao.etapas.map(etapa => etapa.ordem);
    if (new Set(ordens).size !== ordens.length) {
        renderizarResultadoConsulta('Defina uma ordem diferente para cada etapa do funil.', 'error');
        setEtapaWidget('mapping');
        return false;
    }
    return true;
}

function salvarWidgetAtual() {
    if (!widgetEmEdicao) return;
    const calculado = ehKpiCalculado();
    const configuracaoCalculo = coletarConfiguracaoKpiCalculado();
    if (calculado) {
        const validacao = validarFormulaKpi(configuracaoCalculo);
        if (!validacao.ok) {
            atualizarStatusFormulaKpi();
            setEtapaWidget('sql');
            kpiFormulaInput?.focus();
            return;
        }
    } else {
        const assinaturaEsperada = assinaturaConsultasEditor();
        if (assinaturaConsultaAtual !== assinaturaEsperada) {
            renderizarResultadoConsulta('Execute novamente a consulta antes de salvar o cenario.', 'error');
            setEtapaWidget('sql');
            return;
        }
    }
    const mapeamentos = calculado ? [] : coletarMapeamentosColunas();
    if (!calculado && !validarMapeamentoWidget(mapeamentos)) return;
    const configuracaoFunil = coletarConfiguracaoFunil();
    if (!calculado && !validarConfiguracaoFunil(configuracaoFunil)) return;
    const detalhe = coletarConfiguracaoDetalhe();
    if (!validarConfiguracaoDetalhe(detalhe)) return;
    const categoriasPermitidas = coletarCategoriasWidget();
    if (!categoriasPermitidas.length) {
        if (widgetCategoryError) widgetCategoryError.hidden = false;
        setEtapaWidget('appearance');
        return;
    }
    let widgets = normalizarWidgetsDashboard(obterWidgetsDashboard());
    const consultasEditor = calculado ? [] : coletarConsultasEditor();
    const atualizado = {
        ...widgetEmEdicao,
        titulo: widgetTitleInput?.value.trim() || obterNomeGrafico(widgetTypeSelect?.value),
        tipo: widgetTypeSelect?.value || 'bar',
        fonte: calculado ? '' : (consultasEditor[0]?.fonte || 'firebird'),
        sql: calculado ? '' : (consultasEditor[0]?.sql || ''),
        consultas: consultasEditor,
        combinacaoConsultas: calculado ? null : coletarCombinacaoEditor(),
        camposCalculados: calculado ? [] : coletarCamposCalculadosEditor(),
        colunasConsulta: calculado ? [] : colunasConsultaAtual,
        dadosConsulta: calculado ? [] : dadosConsultaAtual,
        proximidade: calculado
            ? null
            : (resultadosConsultasAtuais.find(resultado => resultado.proximidade)?.proximidade || widgetEmEdicao.proximidade || null),
        consultaAtualizadaEm: calculado ? null : new Date().toISOString(),
        limiteTop: calculado ? 0 : normalizarLimiteTopGrafico(limiteTopAtual),
        funil: calculado ? normalizarConfiguracaoFunil() : configuracaoFunil,
        mapeamentos,
        calculo: calculado ? configuracaoCalculo : (widgetEmEdicao.calculo || null),
        detalhe,
        categoriasPermitidas,
        tabela: coletarConfiguracaoTabela(),
        aparencia: coletarAparenciaWidget()
    };
    const index = widgets.findIndex(widget => widget.id === atualizado.id);
    if (index >= 0) {
        widgets[index] = atualizado;
    } else {
        widgets.push(atualizado);
    }
    widgets = atribuirReferenciasIndicadores(widgets);
    limparFiltrosColunaWidget(atualizado.id);
    salvarWidgetsDashboard(widgets);
    estadosDrillDashboard.delete(atualizado.id);
    fecharModalWidget();
    renderizarDashboard();
}

function inicializarInteracaoLivreDashboard() {
    if (!dashboardCanvas || !podeEditarCenarios) return;

    dashboardCanvas.addEventListener('pointerdown', event => {
        if (!modoEdicaoCenario) return;
        const card = event.target.closest('[data-widget-id]');
        if (!card) return;
        if (event.target.closest('button')) return;

        const resizeHandle = event.target.closest('[data-resize-widget]');
        const dragHandle = event.target.closest('[data-widget-drag-handle]');
        if (!resizeHandle && !dragHandle) return;

        event.preventDefault();
        card.setPointerCapture(event.pointerId);
        card.classList.add(resizeHandle ? 'is-resizing' : 'is-dragging');

        const canvasRect = dashboardCanvas.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const inicio = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            x: cardRect.left - canvasRect.left + dashboardCanvas.scrollLeft,
            y: cardRect.top - canvasRect.top + dashboardCanvas.scrollTop,
            w: cardRect.width,
            h: cardRect.height
        };

        function mover(pointerEvent) {
            const deltaX = pointerEvent.clientX - inicio.pointerX;
            const deltaY = pointerEvent.clientY - inicio.pointerY;

            if (resizeHandle) {
                const largura = Math.max(260, inicio.w + deltaX);
                const altura = Math.max(180, inicio.h + deltaY);
                card.style.width = `${largura}px`;
                card.style.height = `${altura}px`;
            } else {
                const limiteX = Math.max(0, dashboardCanvas.clientWidth - card.offsetWidth);
                const x = Math.max(0, Math.min(inicio.x + deltaX, limiteX));
                const y = Math.max(0, inicio.y + deltaY);
                card.style.left = `${x}px`;
                card.style.top = `${y}px`;
            }
        }

        function soltar() {
            card.classList.remove('is-dragging', 'is-resizing');
            card.releasePointerCapture(event.pointerId);
            card.removeEventListener('pointermove', mover);
            card.removeEventListener('pointerup', soltar);
            card.removeEventListener('pointercancel', soltar);
            atualizarLayoutWidget(card.dataset.widgetId, {
                x: Math.round(parseFloat(card.style.left) || 0),
                y: Math.round(parseFloat(card.style.top) || 0),
                w: Math.round(card.offsetWidth),
                h: Math.round(card.offsetHeight)
            });
            renderizarDashboard();
        }

        card.addEventListener('pointermove', mover);
        card.addEventListener('pointerup', soltar);
        card.addEventListener('pointercancel', soltar);
    });
}

function aplicarModoEdicaoCenario(ativo) {
    modoEdicaoCenario = Boolean(ativo && podeEditarCenarios);
    document.body.classList.toggle('crm-scenario-editing', modoEdicaoCenario);
    if (editModeToggle) {
        editModeToggle.textContent = modoEdicaoCenario ? 'Concluir edição' : 'Editar cenario';
        editModeToggle.setAttribute('aria-pressed', String(modoEdicaoCenario));
    }
    renderizarDashboard();
}
function inicializarEditorDashboard() {
    if (dashboardEditor) dashboardEditor.hidden = !podeEditarCenarios;
    aplicarModoEdicaoCenario(false);
    const echartsScript = document.getElementById('crmEchartsScript');
    if (!window.echarts && echartsScript) {
        echartsScript.addEventListener('load', () => renderizarDashboard(), { once: true });
    }

    if (editModeToggle) editModeToggle.addEventListener('click', () => aplicarModoEdicaoCenario(!modoEdicaoCenario));
    if (addWidgetButton) addWidgetButton.addEventListener('click', () => abrirModalWidget());
    if (decreaseCanvasHeightButton) decreaseCanvasHeightButton.addEventListener('click', () => ajustarAlturaCanvas(-1));
    if (increaseCanvasHeightButton) increaseCanvasHeightButton.addEventListener('click', () => ajustarAlturaCanvas(1));
    if (testWidgetQueryButton) testWidgetQueryButton.addEventListener('click', () => testarConsultaWidget());
    if (addSecondaryQueryButton) addSecondaryQueryButton.addEventListener('click', () => {
        const consultas = coletarConsultasEditor().slice(1);
        consultas.push({ alias: 'consulta' + (consultas.length + 2), fonte: 'firebird', sql: '' });
        renderizarConsultasSecundarias(consultas);
        atualizarControlesCombinacao();
        assinaturaConsultaAtual = '';
    });
    if (secondaryQueriesBox) secondaryQueriesBox.addEventListener('click', event => {
        const botao = event.target.closest('[data-remove-secondary-query]');
        if (!botao) return;
        botao.closest('[data-secondary-query-row]')?.remove();
        resultadosConsultasAtuais = [];
        atualizarControlesCombinacao();
        assinaturaConsultaAtual = '';
    });
    const recombinarAposConfiguracao = () => { atualizarControlesCombinacao(); if (!resultadosConsultasAtuais.length) return; try { recombinarConsultasEditor(); assinaturaConsultaAtual = assinaturaConsultasEditor(); renderizarResultadoConsulta('Resultados combinados novamente.', 'success'); } catch (error) { assinaturaConsultaAtual = ''; renderizarResultadoConsulta(error.message, 'error'); } };
    [queryCombinationModeSelect, primaryKeySelect, secondaryKeySelect].forEach(campo => campo?.addEventListener('change', recombinarAposConfiguracao));
    if (addCalculatedFieldButton) addCalculatedFieldButton.addEventListener('click', () => { renderizarCamposCalculados([...coletarCamposCalculadosEditor(), { nome: '', formula: '' }]); });
    if (calculatedFieldList) {
        calculatedFieldList.addEventListener('click', event => { const botao = event.target.closest('[data-remove-calculated-field]'); if (!botao) return; botao.closest('[data-calculated-field-row]')?.remove(); recombinarAposConfiguracao(); });
        calculatedFieldList.addEventListener('change', recombinarAposConfiguracao);
    }
    if (nextWidgetStepButton) {
        nextWidgetStepButton.addEventListener('click', async () => {
            if (ehKpiCalculado()) {
                const configuracao = coletarConfiguracaoKpiCalculado();
                const validacao = validarFormulaKpi(configuracao);
                if (!validacao.ok) {
                    atualizarStatusFormulaKpi();
                    kpiFormulaInput?.focus();
                    return;
                }
                if (widgetEmEdicao) widgetEmEdicao.calculo = configuracao;
                setEtapaWidget('appearance');
                return;
            }
            const assinaturaEsperada = assinaturaConsultasEditor();
            if (!colunasConsultaAtual.length || assinaturaConsultaAtual !== assinaturaEsperada) {
                const ok = await testarConsultaWidget();
                if (!ok) return;
            }
            setEtapaWidget('mapping');
        });
    }
    if (nextAppearanceStepButton) {
        nextAppearanceStepButton.addEventListener('click', async () => {
            const mapeamentos = coletarMapeamentosColunas();
            if (widgetEmEdicao) widgetEmEdicao.mapeamentos = mapeamentos;
            if (!validarMapeamentoWidget(mapeamentos)) return;
            if (!await atualizarDadosMapeadosWidget(mapeamentos)) return;
            setEtapaWidget('appearance');
        });
    }
    if (prevWidgetStepButton) {
        prevWidgetStepButton.addEventListener('click', () => {
            setEtapaWidget(etapaWidgetAtual === 'appearance' ? (ehKpiCalculado() ? 'sql' : 'mapping') : 'sql');
        });
    }
    if (columnMappingBox) {
        columnMappingBox.addEventListener('click', event => {
            const botao = event.target.closest('[data-map-move]');
            if (!botao || botao.disabled) return;
            const linha = botao.closest('[data-column-name]');
            const direcao = Number(botao.dataset.mapMove);
            const referencia = direcao < 0 ? linha?.previousElementSibling : linha?.nextElementSibling;
            if (!linha || !referencia) return;
            if (direcao < 0) columnMappingBox.insertBefore(linha, referencia);
            else columnMappingBox.insertBefore(referencia, linha);
            if (widgetEmEdicao) widgetEmEdicao.mapeamentos = coletarMapeamentosColunas();
            atualizarControlesOrdemMapeamento();
            renderizarConfiguracaoTabela();
        });
        columnMappingBox.addEventListener('change', event => {
            if (event.target.matches('[data-map-alignment]')) {
                event.target.dataset.userDefined = 'true';
                return;
            }
            if (!event.target.matches('[data-map-role]')) return;
            const row = event.target.closest('[data-column-name]');
            const alinhamento = row?.querySelector('[data-map-alignment]');
            if (alinhamento && alinhamento.dataset.userDefined !== 'true') {
                alinhamento.value = ['valor', 'meta'].includes(event.target.value) ? 'right' : 'left';
            }
            atualizarCamposMapeamento(row);
            const colunasLinhaAtuais = coletarMapeamentosColunas()
                .filter(item => item.papel === 'linha')
                .map(item => String(item.coluna));
            configuracaoTabelaAtual.agrupamentos = configuracaoTabelaAtual.agrupamentos.filter(coluna => colunasLinhaAtuais.includes(String(coluna)));
            configuracaoTabelaAtual.subtotais = configuracaoTabelaAtual.subtotais.filter(coluna => colunasLinhaAtuais.includes(String(coluna)));
            renderizarConfiguracaoTabela();
            renderizarConfiguracaoFunil();
        });
    }
    if (chartTopLimitInput) {
        chartTopLimitInput.addEventListener('input', () => {
            limiteTopAtual = normalizarLimiteTopGrafico(chartTopLimitInput.value);
        });
    }
    if (tableConfigBox) tableConfigBox.addEventListener('change', event => {
        coletarConfiguracaoTabela();
        if (event.target.matches('[data-group-field], [data-table-pagination]')) renderizarConfiguracaoTabela();
    });
    if (funnelModeSelect) {
        funnelModeSelect.addEventListener('change', () => {
            coletarConfiguracaoFunil();
            renderizarConfiguracaoFunil();
            renderizarPreviaAparencia();
        });
    }
    if (funnelStageList) {
        funnelStageList.addEventListener('input', () => coletarConfiguracaoFunil());
        funnelStageList.addEventListener('change', event => {
            coletarConfiguracaoFunil();
            if (event.target.matches('[data-funnel-stage-order]')) renderizarConfiguracaoFunil();
        });
    }
    if (widgetTypeSelect) {
        widgetTypeSelect.addEventListener('change', () => {
            if (widgetEmEdicao) widgetEmEdicao.mapeamentos = coletarMapeamentosColunas();
            atualizarModoConfiguracaoWidget();
            renderizarMapeamentoColunas();
            renderizarPreviaAparencia();
        });
    }
    [widgetDetailEnabledInput, widgetDetailTypeSelect].forEach(campo => {
        if (!campo) return;
        campo.addEventListener('change', atualizarCamposConfiguracaoDetalhe);
    });
    if (widgetTitleInput) widgetTitleInput.addEventListener('input', renderizarPreviaAparencia);
    [kpiFormulaInput, kpiOutputFormatSelect, kpiOutputLabelInput].forEach(campo => {
        if (!campo) return;
        campo.addEventListener('input', () => {
            atualizarStatusFormulaKpi();
            renderizarPreviaAparencia();
        });
        campo.addEventListener('change', () => {
            atualizarStatusFormulaKpi();
            renderizarPreviaAparencia();
        });
    });
    if (kpiReferenceList) {
        kpiReferenceList.addEventListener('click', event => {
            const botao = event.target.closest('[data-kpi-reference]');
            if (botao) inserirReferenciaKpi(botao.dataset.kpiReference);
        });
    }
    [
        widgetBackgroundModeSelect,
        widgetAlignmentSelect,
        widgetBackgroundColorInput,
        widgetGradientStartInput,
        widgetGradientEndInput,
        widgetIconColorInput
    ].forEach(campo => {
        if (!campo) return;
        campo.addEventListener('input', atualizarCamposAparencia);
        campo.addEventListener('change', atualizarCamposAparencia);
    });
    if (widgetPaletteOptions) widgetPaletteOptions.addEventListener('change', renderizarPreviaAparencia);
    if (widgetIconOptions) widgetIconOptions.addEventListener('change', renderizarPreviaAparencia);
    if (widgetCategoryOptions) {
        widgetCategoryOptions.addEventListener('change', event => {
            const opcoes = Array.from(widgetCategoryOptions.querySelectorAll('[data-widget-category]'));
            const opcaoTodas = widgetCategoryOptions.querySelector('[data-widget-category-all]');
            if (event.target.matches('[data-widget-category-all]')) {
                opcoes.forEach(opcao => { opcao.checked = event.target.checked; });
            } else if (opcaoTodas) {
                opcaoTodas.checked = opcoes.length > 0 && opcoes.every(opcao => opcao.checked);
            }
            if (widgetCategoryError) widgetCategoryError.hidden = opcoes.some(opcao => opcao.checked);
        });
    }

    if (dashboardCanvas) {
        dashboardCanvas.addEventListener('click', async event => {
            if (tratarCliqueAutoFiltroTabela(event)) return;
            const budgetAction = event.target.closest('[data-budget-negotiation-action]');
            if (budgetAction) {
                abrirGestaoNegociacao(budgetAction);
                return;
            }
            const contactAction = event.target.closest('[data-contact-action]');
            if (contactAction) {
                await abrirFormularioContato(contactAction.dataset.document, contactAction.dataset.name || '');
                return;
            }
            const exportAction = event.target.closest('[data-widget-export]');
            if (exportAction) {
                const card = exportAction.closest('[data-widget-id]');
                const menu = exportAction.closest('[data-widget-export-menu]');
                if (menu) menu.hidden = true;
                if (card) await executarExportacaoWidget(card.dataset.widgetId, exportAction.dataset.widgetExport);
                return;
            }

            const exportToggle = event.target.closest('[data-widget-export-toggle]');
            if (exportToggle) {
                const menu = exportToggle.parentElement?.querySelector('[data-widget-export-menu]');
                dashboardCanvas.querySelectorAll('[data-widget-export-menu]').forEach(item => {
                    if (item !== menu) item.hidden = true;
                });
                if (menu) menu.hidden = !menu.hidden;
                return;
            }

            const pageButton = event.target.closest('[data-table-page]');
            if (pageButton && !pageButton.disabled) {
                const paginador = pageButton.closest('[data-table-pagination-widget]');
                const card = pageButton.closest('[data-widget-id]');
                const widgetId = paginador?.dataset.tablePaginationWidget || card?.dataset.widgetId;
                const widget = obterWidgetExportacao(widgetId);
                const container = card?.querySelector('[data-chart-widget]');
                if (widget && container) {
                    const paginaAtual = paginasTabelaDashboard.get(widgetId) || 1;
                    paginasTabelaDashboard.set(widgetId, paginaAtual + Number(pageButton.dataset.tablePage || 0));
                    renderizarTabelaGrafico(container, widget);
                }
                return;
            }

            dashboardCanvas.querySelectorAll('[data-widget-export-menu]').forEach(item => { item.hidden = true; });
            const drillBackButton = event.target.closest('[data-drill-back-widget]');
            if (drillBackButton) {
                const widgetId = drillBackButton.dataset.drillBackWidget;
                const estadoAtual = estadosDrillDashboard.get(widgetId);
                const historico = Array.isArray(estadoAtual?.historico) ? [...estadoAtual.historico] : [];
                const anterior = historico.pop();
                if (anterior) estadosDrillDashboard.set(widgetId, { ...anterior, historico });
                else estadosDrillDashboard.delete(widgetId);
                renderizarDashboard();
                return;
            }

            const drillFieldButton = event.target.closest('[data-drill-field]');
            if (drillFieldButton) {
                const contexto = contextosDrillDashboard.get(drillFieldButton.dataset.drillContext);
                const campo = contexto?.campos.find(item => String(item.coluna) === String(drillFieldButton.dataset.drillField));
                if (!contexto || !campo) return;
                await executarDrillDownWidget(contexto, campo);
                return;
            }

            const drillToggle = event.target.closest('[data-drill-toggle]');
            if (drillToggle) {
                const menu = drillToggle.parentElement?.querySelector('[data-drill-menu]');
                dashboardCanvas.querySelectorAll('[data-drill-menu]').forEach(item => { if (item !== menu) item.hidden = true; });
                if (menu) menu.hidden = !menu.hidden;
                return;
            }

            dashboardCanvas.querySelectorAll('[data-drill-menu]').forEach(item => { item.hidden = true; });
            const viewSqlButton = event.target.closest('[data-view-widget-sql]');
            if (viewSqlButton) {
                const card = viewSqlButton.closest('[data-widget-id]');
                if (card) abrirVisualizadorSql(card.dataset.widgetId);
                return;
            }
            const deleteButton = event.target.closest('[data-delete-widget]');
            if (deleteButton) {
                const card = deleteButton.closest('[data-widget-id]');
                if (card) excluirWidgetDashboard(card.dataset.widgetId);
                return;
            }
            const detailButton = event.target.closest('[data-open-widget-detail]');
            if (detailButton) {
                const widget = obterWidgetsDashboard().find(item => item.id === detailButton.dataset.openWidgetDetail);
                if (widget) await abrirRelatorioDetalhe(widget);
                return;
            }
            const editButton = event.target.closest('[data-edit-widget]');
            if (!editButton) return;
            const card = editButton.closest('[data-widget-id]');
            if (card) abrirModalWidget(card.dataset.widgetId);
        });
        dashboardCanvas.addEventListener('keydown', async event => {
            const detailButton = event.target.closest('[data-open-widget-detail]');
            if (!detailButton || !['Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            const widget = obterWidgetsDashboard().find(item => item.id === detailButton.dataset.openWidgetDetail);
            if (widget) await abrirRelatorioDetalhe(widget);
        });
        inicializarInteracaoLivreDashboard();
        if (window.ResizeObserver && !observadorTamanhoDashboard) {
            larguraDashboardObservada = Math.round(dashboardCanvas.clientWidth || 0);
            let frameDashboard = 0;
            observadorTamanhoDashboard = new ResizeObserver(() => {
                const novaLargura = Math.round(dashboardCanvas.clientWidth || 0);
                if (!novaLargura || novaLargura === larguraDashboardObservada) return;
                larguraDashboardObservada = novaLargura;
                cancelAnimationFrame(frameDashboard);
                frameDashboard = requestAnimationFrame(renderizarDashboard);
            });
            observadorTamanhoDashboard.observe(dashboardCanvas);
        }
    }

    if (widgetDetailExportHost) {
        widgetDetailExportHost.innerHTML = renderizarMenuExportacaoRelatorioDetalhe();
        widgetDetailExportHost.addEventListener('click', async event => {
            const exportAction = event.target.closest('[data-widget-detail-export]');
            if (exportAction && !exportAction.disabled) {
                const menu = exportAction.closest('[data-widget-detail-export-menu]');
                if (menu) menu.hidden = true;
                await executarExportacao(widgetDetalheModalAtual, exportAction.dataset.widgetDetailExport);
                return;
            }
            const exportToggle = event.target.closest('[data-widget-detail-export-toggle]');
            if (exportToggle && !exportToggle.disabled) {
                const menu = widgetDetailExportHost.querySelector('[data-widget-detail-export-menu]');
                if (menu) menu.hidden = !menu.hidden;
            }
        });
    }
    if (widgetDetailContent) {
        widgetDetailContent.addEventListener('click', event => {
            if (tratarCliqueAutoFiltroTabela(event)) return;
            const budgetAction = event.target.closest('[data-budget-negotiation-action]');
            if (budgetAction) {
                abrirGestaoNegociacao(budgetAction, 'detalhe');
                return;
            }
            const contactAction = event.target.closest('[data-contact-action]');
            if (contactAction) {
                abrirFormularioContato(contactAction.dataset.document, contactAction.dataset.name || '', 'detalhe');
                return;
            }
            const pageButton = event.target.closest('[data-table-page]');
            if (!pageButton || pageButton.disabled || !widgetDetalheModalAtual) return;
            const paginaAtual = paginasTabelaDashboard.get(widgetDetalheModalAtual.id) || 1;
            paginasTabelaDashboard.set(widgetDetalheModalAtual.id, paginaAtual + Number(pageButton.dataset.tablePage || 0));
            renderizarRelatorioDetalheAtual();
        });
    }
    closeWidgetButtons.forEach(button => button.addEventListener('click', fecharModalWidget));
    closeSqlViewerButtons.forEach(button => button.addEventListener('click', fecharVisualizadorSql));
    closeWidgetDetailButtons.forEach(button => button.addEventListener('click', fecharRelatorioDetalhe));
    closeContactModalButtons.forEach(button => button.addEventListener('click', fecharFormularioContato));
    if (contactForm) contactForm.addEventListener('submit', salvarFormularioContato);
    if (indentSqlViewerButton) indentSqlViewerButton.addEventListener('click', indentarSqlVisualizador);
    if (copySqlViewerButton) copySqlViewerButton.addEventListener('click', copiarSqlVisualizador);
    if (pasteSqlViewerButton) pasteSqlViewerButton.addEventListener('click', colarSqlVisualizador);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && contactModal && !contactModal.hidden) fecharFormularioContato();
        else if (event.key === 'Escape' && widgetDetailModal && !widgetDetailModal.hidden) fecharRelatorioDetalhe();
        else if (event.key === 'Escape' && sqlViewerModal && !sqlViewerModal.hidden) fecharVisualizadorSql();
    });
    if (saveWidgetButton) saveWidgetButton.addEventListener('click', salvarWidgetAtual);
}
function formatarDataInput(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function inicializarPeriodo() {
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const dataInicial = sessionStorage.getItem('crmDataInicial') || formatarDataInput(primeiroDiaMes);
    const dataFinal = sessionStorage.getItem('crmDataFinal') || formatarDataInput(hoje);
    if (crmDataInicial) crmDataInicial.value = dataInicial;
    if (crmDataFinal) crmDataFinal.value = dataFinal;
    sessionStorage.setItem('crmDataInicial', dataInicial);
    sessionStorage.setItem('crmDataFinal', dataFinal);
}

function limparFiltrosPersistidos() {
    [
        'crmDataInicial',
        'crmDataFinal',
        'crmFiliaisSelecionadas',
        'crmFilialSelecionada',
        'crmVendedoresSelecionados'
    ].forEach(chave => sessionStorage.removeItem(chave));
}

function atualizarResumoFiltrosContato() {
    const status = contactStatusInputs.filter(input => input.checked);
    const tipos = contactTypeInputs.filter(input => input.checked);
    if (contactStatusSummary) contactStatusSummary.textContent = status.length === contactStatusInputs.length
        ? 'Todos os status'
        : (status.length === 1 ? status[0].parentElement?.textContent.trim() : (status.length ? `${status.length} status selecionados` : 'Nenhum status'));
    if (contactTypeSummary) contactTypeSummary.textContent = tipos.length === contactTypeInputs.length
        ? 'Todos os canais'
        : (tipos.length === 1 ? tipos[0].parentElement?.textContent.trim() : (tipos.length ? `${tipos.length} canais selecionados` : 'Nenhum canal'));
    if (contactStatusAll) {
        contactStatusAll.checked = status.length === contactStatusInputs.length;
        contactStatusAll.indeterminate = status.length > 0 && status.length < contactStatusInputs.length;
    }
    if (contactTypeAll) {
        contactTypeAll.checked = tipos.length === contactTypeInputs.length;
        contactTypeAll.indeterminate = tipos.length > 0 && tipos.length < contactTypeInputs.length;
    }
}

function restaurarFiltrosContatoPadrao() {
    contactStatusInputs.forEach(input => { input.checked = ['PENDENTE', 'AGUARDANDO RETORNO'].includes(input.value); });
    contactTypeInputs.forEach(input => { input.checked = true; });
    if (contactStatusAll) contactStatusAll.checked = false;
    if (contactTypeAll) contactTypeAll.checked = true;
    if (contactDateStart) contactDateStart.value = '';
    if (contactDateEnd) contactDateEnd.value = '';
    atualizarResumoFiltrosContato();
}

async function restaurarFiltrosPadrao() {
    if (resetFiltersButton) resetFiltersButton.disabled = true;
    atualizarStatusFiltros('Restaurando filtros padrão...');
    limparFiltrosPersistidos();
    filiaisRascunho = [];
    vendedoresRascunho = [];
    if (crmFilialSearch) crmFilialSearch.value = '';
    if (crmVendedorSearch) crmVendedorSearch.value = '';
    if (crmFilialPanel) crmFilialPanel.hidden = true;
    if (crmVendedorPanel) crmVendedorPanel.hidden = true;
    restaurarFiltrosContatoPadrao();
    inicializarPeriodo();

    try {
        await carregarFiliais();
        await carregarVendedores(true);
        await aplicarFiltrosDashboard();
    } catch (error) {
        atualizarStatusFiltros('Não foi possível restaurar os filtros.', true);
    } finally {
        if (resetFiltersButton) resetFiltersButton.disabled = false;
    }
}

function escapeHtml(valor) {
    return String(valor || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function atualizarResumoFiliais(filiais, selecionadas) {
    if (!crmFilialTrigger) return;
    const idsDisponiveis = filiais.map(filial => String(filial.idfilial));
    const nomesSelecionados = filiais
        .filter(filial => selecionadas.includes(String(filial.idfilial)))
        .map(filial => filial.nomefilial);

    if (idsDisponiveis.length && nomesSelecionados.length === idsDisponiveis.length) {
        crmFilialTrigger.textContent = 'Todas as filiais';
    } else if (!nomesSelecionados.length) {
        crmFilialTrigger.textContent = 'Selecione as filiais';
    } else if (nomesSelecionados.length === 1) {
        crmFilialTrigger.textContent = nomesSelecionados[0];
    } else {
        crmFilialTrigger.textContent = `${nomesSelecionados.length} filiais selecionadas`;
    }
}

function renderizarOpcoesFiliais(filiais, termo = '') {
    if (!crmFilialOptions) return;
    const termoBusca = termo.trim().toLowerCase();
    const filtradas = filiais.filter(filial => {
        const texto = `${filial.idfilial} ${filial.nomefilial}`.toLowerCase();
        return texto.includes(termoBusca);
    });
    const idsDisponiveis = filiais.map(filial => String(filial.idfilial));
    const todasSelecionadas = idsDisponiveis.length > 0 && idsDisponiveis.every(id => filiaisRascunho.includes(id));
    const opcaoTodos = `
        <label class="crm-multiselect-option is-all">
            <input type="checkbox"${todasSelecionadas ? ' checked' : ''} data-filial-all>
            <span>Todos</span>
        </label>
    `;
    const opcoes = filtradas.length ? filtradas.map(filial => {
        const id = String(filial.idfilial);
        const checked = filiaisRascunho.includes(id) ? ' checked' : '';
        return `
            <label class="crm-multiselect-option">
                <input type="checkbox" value="${escapeHtml(id)}"${checked} data-filial-checkbox>
                <span>${escapeHtml(filial.nomefilial)}</span>
            </label>
        `;
    }).join('') : '<div class="crm-multiselect-empty">Nenhuma filial encontrada.</div>';
    crmFilialOptions.innerHTML = opcaoTodos + opcoes;
    const todosCheckbox = crmFilialOptions.querySelector('[data-filial-all]');
    if (todosCheckbox) todosCheckbox.indeterminate = filiaisRascunho.length > 0 && !todasSelecionadas;
}
function formatarVendedor(vendedor) {
    const idFilial = String(vendedor?.idfilial || '').trim();
    const idVendedor = String(vendedor?.idvendedor || '').trim();
    const nomeVendedor = String(vendedor?.nomefuncionario || '').trim();
    return [idFilial, idVendedor, nomeVendedor].filter(Boolean).join('-');
}

function atualizarResumoVendedores(vendedores, selecionados) {
    if (!crmVendedorTrigger) return;
    const idsDisponiveis = vendedores.map(vendedor => String(vendedor.idvendedor));
    const nomesSelecionados = vendedores
        .filter(vendedor => selecionados.includes(String(vendedor.idvendedor)))
        .map(formatarVendedor);

    if (idsDisponiveis.length && nomesSelecionados.length === idsDisponiveis.length) {
        crmVendedorTrigger.textContent = 'Todos os vendedores';
    } else if (!nomesSelecionados.length) {
        crmVendedorTrigger.textContent = 'Selecione os vendedores';
    } else if (nomesSelecionados.length === 1) {
        crmVendedorTrigger.textContent = nomesSelecionados[0];
    } else {
        crmVendedorTrigger.textContent = `${nomesSelecionados.length} vendedores selecionados`;
    }
}

function renderizarOpcoesVendedores(vendedores, termo = '') {
    if (!crmVendedorOptions) return;
    const termoBusca = termo.trim().toLowerCase();
    const filtrados = vendedores.filter(vendedor => {
        const texto = `${vendedor.idfilial} ${vendedor.idvendedor} ${vendedor.nomefuncionario}`.toLowerCase();
        return texto.includes(termoBusca);
    });
    const idsDisponiveis = vendedores.map(vendedor => String(vendedor.idvendedor));
    const todosSelecionados = idsDisponiveis.length > 0 && idsDisponiveis.every(id => vendedoresRascunho.includes(id));
    const opcaoTodos = `
        <label class="crm-multiselect-option is-all">
            <input type="checkbox"${todosSelecionados ? ' checked' : ''} data-vendedor-all>
            <span>Todos</span>
        </label>
    `;
    const opcoes = filtrados.length ? filtrados.map(vendedor => {
        const id = String(vendedor.idvendedor);
        const checked = vendedoresRascunho.includes(id) ? ' checked' : '';
        return `
            <label class="crm-multiselect-option">
                <input type="checkbox" value="${escapeHtml(id)}"${checked} data-vendedor-checkbox>
                <span>${escapeHtml(formatarVendedor(vendedor))}</span>
            </label>
        `;
    }).join('') : '<div class="crm-multiselect-empty">Nenhum vendedor encontrado.</div>';
    crmVendedorOptions.innerHTML = opcaoTodos + opcoes;
    const todosCheckbox = crmVendedorOptions.querySelector('[data-vendedor-all]');
    if (todosCheckbox) todosCheckbox.indeterminate = vendedoresRascunho.length > 0 && !todosSelecionados;
}

async function carregarVendedores(selecionarTodos = false) {
    const podeFiltrarVendedor = ['DI', 'SU', 'GR'].includes(categoriaCodigo);
    if (!crmSellerFilter || !crmVendedorTrigger || !crmVendedorOptions) return;

    if (!podeFiltrarVendedor) {
        crmSellerFilter.hidden = true;
        vendedoresDisponiveis = [];
        vendedoresRascunho = [];
        sessionStorage.removeItem('crmVendedoresSelecionados');
        return;
    }

    crmSellerFilter.hidden = false;
    crmVendedorTrigger.disabled = true;
    crmVendedorTrigger.textContent = 'Carregando vendedores...';
    try {
        const params = new URLSearchParams({
            categoria: categoriaCodigo,
            idfuncionario: idFuncionarioLogado || '',
            idfilial: filialId || '',
            filiais: filiaisRascunho.join(',')
        });
        const data = await fetchJsonComTimeout('/api/vendedores?' + params.toString());
        vendedoresDisponiveis = Array.isArray(data.vendedores) ? data.vendedores : [];
        if (!vendedoresDisponiveis.length) {
            vendedoresRascunho = [];
            crmVendedorTrigger.textContent = 'Nenhum vendedor encontrado';
            crmVendedorTrigger.disabled = true;
            crmVendedorOptions.innerHTML = '<div class="crm-multiselect-empty">Nenhum vendedor encontrado.</div>';
            return;
        }

        const idsDisponiveis = vendedoresDisponiveis.map(vendedor => String(vendedor.idvendedor));
        const temSelecaoSalva = sessionStorage.getItem('crmVendedoresSelecionados') !== null;
        if (!vendedoresRascunho.length && temSelecaoSalva && !selecionarTodos) vendedoresRascunho = getVendedoresSelecionados();
        vendedoresRascunho = vendedoresRascunho.filter(id => idsDisponiveis.includes(String(id)));
        if (selecionarTodos || !temSelecaoSalva || !vendedoresRascunho.length) vendedoresRascunho = idsDisponiveis;
        if (!temSelecaoSalva) setVendedoresSelecionados(vendedoresRascunho);
        atualizarResumoVendedores(vendedoresDisponiveis, vendedoresRascunho);
        renderizarOpcoesVendedores(vendedoresDisponiveis);
        crmVendedorTrigger.disabled = false;

        crmVendedorTrigger.onclick = () => {
            crmVendedorPanel.hidden = !crmVendedorPanel.hidden;
            if (!crmVendedorPanel.hidden && crmVendedorSearch) crmVendedorSearch.focus();
        };
        if (crmVendedorSearch) crmVendedorSearch.oninput = () => renderizarOpcoesVendedores(vendedoresDisponiveis, crmVendedorSearch.value);
        crmVendedorOptions.onchange = event => {
            if (event.target.matches('[data-vendedor-all]')) {
                vendedoresRascunho = event.target.checked ? idsDisponiveis : [];
            } else if (event.target.matches('[data-vendedor-checkbox]')) {
                const valor = String(event.target.value);
                const selecionadosAtuais = new Set(vendedoresRascunho);
                if (event.target.checked) selecionadosAtuais.add(valor);
                else selecionadosAtuais.delete(valor);
                vendedoresRascunho = Array.from(selecionadosAtuais);
            } else return;
            atualizarResumoVendedores(vendedoresDisponiveis, vendedoresRascunho);
            renderizarOpcoesVendedores(vendedoresDisponiveis, crmVendedorSearch?.value || '');
            atualizarStatusFiltros('');
        };
    } catch (error) {
        vendedoresDisponiveis = [];
        crmVendedorTrigger.textContent = 'Erro ao carregar vendedores';
        crmVendedorTrigger.disabled = true;
    }
}

async function carregarFiliais() {
    if (!crmFilialTrigger || !crmFilialReadonly) return;
    if (categoriaSemFiltrosFilialVendedor) {
        if (crmFilialFilter) crmFilialFilter.hidden = true;
        filiaisDisponiveis = [];
        filiaisRascunho = [];
        sessionStorage.removeItem('crmFiliaisSelecionadas');
        sessionStorage.removeItem('crmFilialSelecionada');
        atualizarFilialUsuario(usuarioLogado.nomefilial);
        return;
    }
    if (crmFilialFilter) crmFilialFilter.hidden = false;
    const podeSelecionar = ['DI', 'SU'].includes(categoriaCodigo);
    crmFilialTrigger.disabled = true;
    crmFilialTrigger.textContent = 'Carregando filiais...';

    try {
        const params = new URLSearchParams({
            categoria: categoriaCodigo,
            idfuncionario: idFuncionarioLogado || '',
            idfilial: filialId || '',
            filiais: getFiliaisSelecionadas().join(',')
        });
        const data = await fetchJsonComTimeout('/api/filiais?' + params.toString());
        filiaisDisponiveis = Array.isArray(data.filiais) ? data.filiais : [];
        if (!filiaisDisponiveis.length) {
            const fallbackNome = usuarioLogado.nomefilial || ('Filial ' + (usuarioLogado.idfilial || '')).trim();
            filiaisRascunho = usuarioLogado.idfilial ? [String(usuarioLogado.idfilial)] : [];
            setFiliaisSelecionadas(filiaisRascunho);
            crmFilialReadonly.textContent = fallbackNome || 'Filial nao encontrada';
            crmFilialTrigger.hidden = true;
            crmFilialReadonly.hidden = false;
            atualizarFilialUsuario(fallbackNome);
            return;
        }

        const filialUsuario = filiaisDisponiveis.find(filial => String(filial.idfilial).toUpperCase() === String(usuarioLogado.idfilial || '').toUpperCase());
        atualizarFilialUsuario(filialUsuario?.nomefilial);
        const idsDisponiveis = filiaisDisponiveis.map(filial => String(filial.idfilial));
        const temSelecaoSalva = sessionStorage.getItem('crmFiliaisSelecionadas') !== null;
        filiaisRascunho = temSelecaoSalva ? getFiliaisSelecionadas().filter(id => idsDisponiveis.includes(String(id))) : [];
        if (!filiaisRascunho.length) filiaisRascunho = podeSelecionar ? idsDisponiveis : [String(filiaisDisponiveis[0].idfilial)];
        if (!podeSelecionar) filiaisRascunho = [String(filiaisDisponiveis[0].idfilial)];
        if (!temSelecaoSalva) setFiliaisSelecionadas(filiaisRascunho);
        definirPaginaOrcamento();

        crmFilialReadonly.textContent = filiaisDisponiveis.find(filial => String(filial.idfilial) === filiaisRascunho[0])?.nomefilial || filiaisDisponiveis[0].nomefilial;
        atualizarResumoFiliais(filiaisDisponiveis, filiaisRascunho);
        renderizarOpcoesFiliais(filiaisDisponiveis);
        if (podeSelecionar) {
            crmFilialTrigger.hidden = false;
            crmFilialReadonly.hidden = true;
            crmFilialTrigger.disabled = false;
        } else {
            crmFilialTrigger.hidden = true;
            crmFilialReadonly.hidden = false;
        }

        if (crmFilialTrigger && crmFilialPanel) {
            crmFilialTrigger.onclick = () => {
                crmFilialPanel.hidden = !crmFilialPanel.hidden;
                if (!crmFilialPanel.hidden && crmFilialSearch) crmFilialSearch.focus();
            };
        }
        if (crmFilialSearch) crmFilialSearch.oninput = () => renderizarOpcoesFiliais(filiaisDisponiveis, crmFilialSearch.value);
        if (crmFilialOptions) {
            crmFilialOptions.onchange = async event => {
                if (event.target.matches('[data-filial-all]')) {
                    filiaisRascunho = event.target.checked ? idsDisponiveis : [];
                } else if (event.target.matches('[data-filial-checkbox]')) {
                    const valor = String(event.target.value);
                    const selecionadasAtuais = new Set(filiaisRascunho);
                    if (event.target.checked) selecionadasAtuais.add(valor);
                    else selecionadasAtuais.delete(valor);
                    filiaisRascunho = Array.from(selecionadasAtuais);
                } else return;
                atualizarResumoFiliais(filiaisDisponiveis, filiaisRascunho);
                renderizarOpcoesFiliais(filiaisDisponiveis, crmFilialSearch?.value || '');
                atualizarStatusFiltros('');
                await carregarVendedores(true);
            };
        }
    } catch (error) {
        filiaisDisponiveis = [];
        crmFilialTrigger.textContent = 'Erro ao carregar filiais';
        crmFilialReadonly.textContent = 'Erro ao carregar filiais';
        crmFilialTrigger.hidden = true;
        crmFilialReadonly.hidden = false;
    }
}

document.addEventListener('click', event => {
    const dentroFilial = event.target.closest('[data-filial-multiselect]');
    const dentroVendedor = event.target.closest('[data-vendedor-multiselect]');
    const dentroStatusContato = event.target.closest('[data-contact-status-filter]');
    const dentroTipoContato = event.target.closest('[data-contact-type-filter]');

    if (!dentroFilial && crmFilialPanel) crmFilialPanel.hidden = true;
    if (!dentroVendedor && crmVendedorPanel) crmVendedorPanel.hidden = true;
    if (!dentroStatusContato && contactStatusDetails) contactStatusDetails.open = false;
    if (!dentroTipoContato && contactTypeDetails) contactTypeDetails.open = false;
});

document.addEventListener('input', tratarPesquisaAutoFiltroTabela);
document.addEventListener('change', tratarSelecaoAutoFiltroTabela);
document.addEventListener('click', event => {
    if (!event.target.closest('.crm-table-filter-control, [data-table-filter-menu]')) fecharMenusAutoFiltroTabela();
}, true);

[contactStatusDetails, contactTypeDetails].forEach(details => details?.addEventListener('toggle', () => {
    if (!details.open) return;
    [contactStatusDetails, contactTypeDetails].forEach(outro => {
        if (outro && outro !== details) outro.open = false;
    });
}));

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    [contactStatusDetails, contactTypeDetails].forEach(details => {
        if (details) details.open = false;
    });
});

async function definirPaginaOrcamento() {
    if (!budgetFrame) return;
    let budgetPage = 'index.html';

    try {
        const response = await fetch('filial-themes.json', { cache: 'no-store' });
        if (response.ok) {
            const config = await response.json();
            const filialContexto = String(filialId || usuarioLogado.idfilial || '').trim().toUpperCase();
            const themeName = config.branches?.[filialContexto] || config.defaultTheme || 'casaterrazi';
            window.crmBudgetThemeName = themeName;
            budgetPage = config.budgetPages?.[themeName] || config.themes?.[themeName]?.budgetPage || budgetPage;
        }
    } catch (error) {
        budgetPage = 'index.html';
    }

    const budgetUrl = `${budgetPage}?theme=${encodeURIComponent(window.crmBudgetThemeName || '')}&v=${Date.now()}`;
    const currentPage = budgetFrame.dataset.currentBudgetPage || '';
    const nextPageKey = `${budgetPage}:${window.crmBudgetThemeName || ''}`;
    if (currentPage !== nextPageKey) {
        budgetFrame.dataset.currentBudgetPage = nextPageKey;
        budgetFrame.src = budgetUrl;
    }
}

function iniciarModulo(nomeModulo, inicializador) {
    try {
        const resultado = inicializador();
        if (resultado && typeof resultado.catch === 'function') {
            resultado.catch(error => console.error(`[CRM] Falha no modulo ${nomeModulo}:`, error));
        }
        return resultado;
    } catch (error) {
        console.error(`[CRM] Falha no modulo ${nomeModulo}:`, error);
        return null;
    }
}

function inicializarAplicacao() {
    const hashInicial = window.location.hash || '#visao-geral';

    limparFiltrosPersistidos();
    iniciarModulo('isolamento dos menus', repararCenariosDuplicadosEntreMenus);
    iniciarModulo('navegacao', () => ativarView(obterViewPorHash(hashInicial)));
    iniciarModulo('orcamentos', definirPaginaOrcamento);
    iniciarModulo('periodo', inicializarPeriodo);
    iniciarModulo('editor de cenarios', inicializarEditorDashboard);
    iniciarModulo('filtros', async () => {
        atualizarResumoFiltrosContato();
        await carregarFiliais();
        await carregarVendedores();
        if (applyFiltersButton) applyFiltersButton.addEventListener('click', aplicarFiltrosDashboard);
        if (resetFiltersButton) resetFiltersButton.addEventListener('click', restaurarFiltrosPadrao);
        [crmDataInicial, crmDataFinal].forEach(input => input?.addEventListener('change', () => atualizarStatusFiltros('')));
        [...contactStatusInputs, ...contactTypeInputs].forEach(input => input.addEventListener('change', () => {
            atualizarResumoFiltrosContato();
            atualizarStatusFiltros('Filtros alterados. Clique em Aplicar.');
        }));
        contactStatusAll?.addEventListener('change', () => {
            contactStatusInputs.forEach(input => { input.checked = contactStatusAll.checked; });
            atualizarResumoFiltrosContato();
            atualizarStatusFiltros('Filtros alterados. Clique em Aplicar.');
        });
        contactTypeAll?.addEventListener('change', () => {
            contactTypeInputs.forEach(input => { input.checked = contactTypeAll.checked; });
            atualizarResumoFiltrosContato();
            atualizarStatusFiltros('Filtros alterados. Clique em Aplicar.');
        });
        [contactDateStart, contactDateEnd].forEach(input => input?.addEventListener('change', () => atualizarStatusFiltros('Filtros alterados. Clique em Aplicar.')));
        filtrosDashboardProntos = true;
        solicitarAtualizacaoCenarioMenu(dashboardContextoAtivo);
    });
}

inicializarAplicacao();

const sidebarToggle = document.querySelector('[data-sidebar-toggle]');
if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        const collapsed = document.body.classList.toggle('crm-sidebar-collapsed');
        sidebarToggle.textContent = collapsed ? '›' : '‹';
        sidebarToggle.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Esconder menu');
        sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    });
}
