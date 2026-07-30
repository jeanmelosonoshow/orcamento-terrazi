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
const tableConfigBox = document.querySelector('[data-table-config]');
const tableTotalRowsInput = document.querySelector('[data-table-total-rows]');
const tableTotalColumnsInput = document.querySelector('[data-table-total-columns]');
const tableRepeatLabelsInput = document.querySelector('[data-table-repeat-labels]');
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
const secondaryQueryBox = document.querySelector('[data-secondary-query]');
const secondaryQueryAliasInput = document.querySelector('[data-secondary-query-alias]');
const secondaryQuerySourceSelect = document.querySelector('[data-secondary-query-source]');
const secondaryQuerySqlTextarea = document.querySelector('[data-secondary-query-sql]');
const removeSecondaryQueryButton = document.querySelector('[data-remove-secondary-query]');
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
const budgetFrame = document.querySelector('[data-budget-frame]');
const dashboardConfigPorView = Object.freeze({
    'visao-geral': { storage: 'crmDashboardScenario:v1', altura: 'crmDashboardCanvasHeight:v1' },
    clientes: { storage: 'crmDashboardScenario:clientes:v1', altura: 'crmDashboardCanvasHeight:clientes:v1' },
    funil: { storage: 'crmDashboardScenario:funil:v1', altura: 'crmDashboardCanvasHeight:funil:v1' },
    arquitetos: { storage: 'crmDashboardScenario:arquitetos:v1', altura: 'crmDashboardCanvasHeight:arquitetos:v1' },
    reativacao: { storage: 'crmDashboardScenario:reativacao:v1', altura: 'crmDashboardCanvasHeight:reativacao:v1' }
});

function obterConfigDashboardAtivo() {
    return dashboardConfigPorView[dashboardContextoAtivo] || dashboardConfigPorView['visao-geral'];
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
let configuracaoTabelaAtual = { totalLinhas: false, totalColunas: false, repetirRotulos: false, agrupamentos: [], subtotais: [] };
const instanciasGraficosDashboard = new Map();
const observadoresGraficosDashboard = new Map();
const estadosDrillDashboard = new Map();
const contextosDrillDashboard = new Map();
let instanciaPreviaAparencia = null;
let sequenciaContextoDrill = 0;
let observadorTamanhoDashboard = null;
let larguraDashboardObservada = 0;

function trocarContextoDashboard(viewName) {
    const proximoContexto = dashboardConfigPorView[viewName] ? viewName : 'visao-geral';
    const host = document.querySelector('[data-dashboard-host="' + proximoContexto + '"]');
    if (!host || !dashboardWorkspace) return;

    const mudouContexto = dashboardContextoAtivo !== proximoContexto;
    if (mudouContexto) {
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
    if (dashboardCanvas) {
        const titulo = document.querySelector('.crm-page-title h1')?.textContent || 'Painel';
        dashboardCanvas.setAttribute('aria-label', 'Area de inteligencia de negocio - ' + titulo);
    }
    renderizarDashboard();
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
        mapeamentos: [],
        fonte: 'firebird',
        sql: '',
        consultas: [],
        combinacaoConsultas: { modo: 'single', chavePrincipal: '', chaveSecundaria: '' },
        camposCalculados: [],
        calculo: { formula: '', formatoSaida: 'decimal', rotulo: 'Resultado calculado' },
        dadosConsultaAgregados: false,
        categoriasPermitidas: categoriasDashboard.map(item => item.codigo),
        aparencia: { ...aparenciaWidgetPadrao }
    };
}

function obterWidgetsDashboard() {
    try {
        const conteudoSalvo = localStorage.getItem(obterConfigDashboardAtivo().storage);
        if (conteudoSalvo !== null) {
            const salvos = JSON.parse(conteudoSalvo);
            if (Array.isArray(salvos)) return salvos;
        }
    } catch (error) {
        // Mantem o painel utilizavel caso um rascunho local esteja invalido.
    }

    if (dashboardContextoAtivo !== 'visao-geral') return [];

    return [
        { ...criarWidgetPadrao('bar'), id: 'evolucao-comercial', titulo: 'Evolucao comercial', colunas: 8 },
        { ...criarWidgetPadrao('kpi'), id: 'ticket-medio', titulo: 'Ticket medio', colunas: 4, linhas: 1 },
        { ...criarWidgetPadrao('funnel'), id: 'funil-orcamentos', titulo: 'Funil de orcamentos', colunas: 6 },
        { ...criarWidgetPadrao('ranking'), id: 'ranking-vendedores', titulo: 'Ranking de vendedores', colunas: 6 }
    ];
}

function salvarWidgetsDashboard(widgets) {
    localStorage.setItem(obterConfigDashboardAtivo().storage, JSON.stringify(widgets));
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
    const widgetPrevia = { ...(widgetEmEdicao || {}), tipo, aparencia };
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

function formatarDimensao(valor, formatoData = 'none') {
    if (valor === null || valor === undefined || valor === '') return 'Sem valor';
    if (!formatoData || formatoData === 'none') return String(valor);
    const data = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(data.getTime())) return String(valor);
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
        if (!grupos.has(chave)) grupos.set(chave, { rotulo, linhas: [], ordem: index });
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
        valores: gruposOrdenados.map(grupo => {
            const linhasSerie = membro === null
                ? grupo.linhas
                : grupo.linhas.filter(linha => formatarDimensao(obterValorLinha(linha, coluna.coluna), coluna.formatoData) === membro);
            return calcularAgregacao(
                linhasSerie.map(linha => obterValorLinha(linha, mapeamento.coluna)),
                agregacaoDados(mapeamento)
            );
        })
    })));

    return {
        categorias: gruposOrdenados.map(grupo => grupo.rotulo),
        nomeDimensao: dimensao ? obterApelidoMapeamento(dimensao) : '',
        series
    };
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
    if (widget.tipo === 'funnel') {
        return {
            ...base,
            tooltip: { ...base.tooltip, trigger: 'item' },
            series: [{
                type: 'funnel',
                left: compacto ? '4%' : '10%',
                width: compacto ? '92%' : '80%',
                top: 8,
                bottom: 8,
                minSize: '10%',
                label: { show: !compacto, formatter: '{b}' },
                data: dados.categorias.map((nome, index) => ({ name: nome, value: primeiraSerie.valores[index] }))
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

function obterConfiguracaoTabela(widget = {}) {
    const atual = widget.tabela && typeof widget.tabela === 'object' ? widget.tabela : {};
    return {
        totalLinhas: Boolean(atual.totalLinhas),
        totalColunas: Boolean(atual.totalColunas),
        repetirRotulos: Boolean(atual.repetirRotulos),
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
    return (widget.colunasConsulta || [])
        .filter(coluna => !colunasAtivas.has(String(coluna).toLowerCase()))
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

function renderizarTabelaSimples(container, widget, registros, camposLinha, camposColuna, valores, camposDetalhe, configuracao) {
    const dimensoes = [...camposLinha, ...camposColuna];
    const camposExibidos = [...dimensoes, ...valores];
    const cabecalho = camposExibidos.map(campo => `<th${atributoAlinhamentoCampo(campo, campo.papel === 'valor' ? 'right' : 'left')}>${escapeHtml(obterApelidoMapeamento(campo))}</th>`).join('');
    const corpo = registros.map(registro => {
        const filtrosLinha = [];
        const celulasDimensao = dimensoes.map((campo, index) => {
            const bruto = obterValorLinha(registro, campo.coluna);
            const rotulo = formatarDimensao(bruto, campo.formatoData);
            if (campo.papel === 'linha') {
                filtrosLinha.push({ coluna: campo.coluna, apelido: obterApelidoMapeamento(campo), valor: bruto, rotulo });
            }
            const controle = campo.papel === 'linha'
                ? renderizarControleDrill(widget, filtrosLinha.slice(), camposDetalhe)
                : '';
            return `<td class="is-dimension"${atributoAlinhamentoCampo(campo)}><span class="crm-dimension-cell"><span>${escapeHtml(rotulo)}</span>${controle}</span></td>`;
        }).join('');
        const celulasValor = valores.map(valor => {
            const bruto = obterValorLinha(registro, valor.coluna);
            const formatado = formatarValorGrafico(calcularAgregacao([bruto], valor.agregacao || 'none'), valor.formatoValor);
            return `<td class="is-value"${atributoAlinhamentoCampo(valor, 'right')}>${escapeHtml(formatado)}</td>`;
        }).join('');
        return `<tr>${celulasDimensao}${celulasValor}</tr>`;
    }).join('');
    const total = configuracao.totalLinhas ? `
        <tr class="crm-pivot-grand-total">
            <td${atributoAlinhamentoCampo(dimensoes[0])} colspan="${Math.max(1, dimensoes.length)}">Total geral</td>
            ${valores.map(valor => {
                const agregado = calcularAgregacao(registros.map(registro => obterValorLinha(registro, valor.coluna)), valor.agregacao || 'none');
                return `<td class="is-value"${atributoAlinhamentoCampo(valor, 'right')}>${escapeHtml(formatarValorGrafico(agregado, valor.formatoValor))}</td>`;
            }).join('')}
        </tr>` : '';
    container.innerHTML = `
        <div class="crm-chart-table-real">
            <table class="crm-pivot-table crm-simple-table">
                <thead><tr>${cabecalho}</tr></thead>
                <tbody>${corpo}${total}</tbody>
            </table>
        </div>
    `;
}

function renderizarTabelaGrafico(container, widget) {
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
    const registros = ordenarRegistrosPorCampos(todosRegistros, camposOrdenacao);

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
        container.innerHTML = `${renderizarBreadcrumbDrill(widget, estadoDrill)}<div class="crm-chart-empty">Nenhum registro encontrado neste detalhamento.</div>`;
        return;
    }

    const colunasFiltradas = new Set(filtrosAtivos.map(filtro => String(filtro.coluna).toLowerCase()));
    const camposDetalheDisponiveis = camposDetalhe.filter(campo =>
        !colunasFiltradas.has(String(campo.coluna).toLowerCase())
        && !camposLinha.some(linha => String(linha.coluna).toLowerCase() === String(campo.coluna).toLowerCase())
    );

    if (widget.tipo === 'table' && !estadoDrill?.campoAtual) {
        renderizarTabelaSimples(container, widget, registros, camposLinhaConfigurados, camposColuna, valores, camposDetalheDisponiveis, configuracao);
        return;
    }

    const colunasDinamicas = camposColuna.length
        ? Array.from(new Map(registros.map(registro => {
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
            `<th${atributoAlinhamentoCampo(campo)}${temCabecalhoDuplo ? ' rowspan="2"' : ''}>${escapeHtml(obterApelidoMapeamento(campo))}</th>`
        ).join('');
        return temCabecalhoDuplo
            ? `<tr>${cabecalhoLinhas}${colunasDinamicas.map(coluna => `<th${atributoAlinhamentoCampo(campoColunaPrincipal, 'center')} colspan="${quantidadeMetricas}">${escapeHtml(coluna.rotulo)}</th>`).join('')}${totalColunasAtivo ? `<th colspan="${quantidadeMetricas}">Total geral</th>` : ''}</tr>
               <tr>${colunasDinamicas.concat(totalColunasAtivo ? [{ chave: '__total__' }] : []).map(() => valores.map(valor => `<th${atributoAlinhamentoCampo(valor, 'right')}>${escapeHtml(obterApelidoMapeamento(valor))}</th>`).join('')).join('')}</tr>`
            : `<tr>${cabecalhoLinhas}${valores.map(valor => `<th${atributoAlinhamentoCampo(valor, 'right')}>${escapeHtml(obterApelidoMapeamento(valor))}</th>`).join('')}</tr>`;
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
                return `<td class="is-value"${atributoAlinhamentoCampo(valor, 'right')}>${escapeHtml(formatarValorGrafico(total, valor.formatoValor))}</td>`;
            }).join('');
        }).join('');
        const totais = totalColunasAtivo ? valores.map(valor => {
            const total = calcularAgregacao(
                registrosGrupo.map(registro => obterValorLinha(registro, valor.coluna)),
                valor.agregacao || 'none'
            );
            return `<td class="is-value is-total"${atributoAlinhamentoCampo(valor, 'right')}>${escapeHtml(formatarValorGrafico(total, valor.formatoValor))}</td>`;
        }).join('') : '';
        return porColuna + totais;
    };
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
            return `<td class="is-dimension"${atributoAlinhamentoCampo(item.campo)}><span class="crm-dimension-cell"><span>${exibir ? escapeHtml(item.rotulo) : ''}</span>${controle}</span></td>`;
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
                conteudo += `<tr class="crm-pivot-subtotal"><td${atributoAlinhamentoCampo(campo)} colspan="${camposLinha.length}">Subtotal ${escapeHtml(obterApelidoMapeamento(campo))}: ${escapeHtml(grupo.rotulo)}</td>${renderizarCelulasValor(grupo.registros)}</tr>`;
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
            return `<td class="is-dimension"${atributoAlinhamentoCampo(item.campo)}><span class="crm-dimension-cell"><span>${exibir ? escapeHtml(item.rotulo) : ''}</span>${controle}</span></td>`;
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
                ? `<tr class="crm-pivot-subtotal"><td${atributoAlinhamentoCampo(campo)} colspan="${quantidadeDimensoesDetalhe}">Subtotal ${escapeHtml(grupo.rotulo)}</td>${renderizarCelulasValor(grupo.registros)}</tr>`
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
        ? `<tr class="crm-pivot-grand-total"><td${atributoAlinhamentoCampo(campoRotuloTotal)} colspan="${colspanTotal}">Total geral</td>${renderizarCelulasValor(registros)}</tr>`
        : '';
    container.innerHTML = `
        ${renderizarBreadcrumbDrill(widget, estadoDrill)}
        <div class="crm-chart-table-real">
            <table class="crm-pivot-table${possuiAgrupamentos ? ' is-sectioned' : ''}">
                ${possuiAgrupamentos ? '' : `<thead>${cabecalho}</thead>`}
                <tbody>${corpo}${totalGeral}</tbody>
            </table>
        </div>
    `;
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

function renderizarGraficosDashboard(widgets, widgetsCalculo = widgets) {
    widgets.forEach(widget => {
        const seletorId = window.CSS?.escape ? window.CSS.escape(widget.id) : String(widget.id).replace(/"/g, '\\"');
        const container = dashboardCanvas?.querySelector(`[data-chart-widget="${seletorId}"]`);
        if (!container) return;
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
            container.innerHTML = `<div class="crm-chart-kpi-real"><strong>${escapeHtml(formatarValorGrafico(resultado.valor, configuracao.formatoSaida || 'decimal'))}</strong><span class="crm-kpi-label">${escapeHtml(configuracao.rotulo || 'Resultado calculado')}</span></div>`;
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
                container.innerHTML = `<div class="crm-chart-kpi-real is-target ${atingida ? 'is-reached' : 'is-pending'}"><strong>${escapeHtml(formatarValorGrafico(total, serie.formato))}</strong><span class="crm-kpi-label">${escapeHtml(serie.nome)}</span><small class="crm-kpi-target-detail"><span><i>Meta</i>${escapeHtml(formatarValorGrafico(meta, serieMeta.formato || serie.formato))}</span><b><i>Atingimento</i>${escapeHtml(percentualTexto)}</b></small></div>`;
            } else {
                container.innerHTML = `<div class="crm-chart-kpi-real"><strong>${escapeHtml(formatarValorGrafico(total, serie.formato))}</strong><span class="crm-kpi-label">${escapeHtml(serie.nome)}</span></div>`;
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
        categoriasPermitidas: obterCategoriasPermitidasWidget(widget),
        aparencia: obterAparenciaWidget(widget),
        ...obterLayoutWidget(widget, index)
    }));
}

function obterLayoutsRenderizacao(widgets) {
    const layoutsBase = widgets.map((widget, index) => ({ id: widget.id, ...obterLayoutWidget(widget, index) }));
    const larguraCanvas = dashboardCanvas?.clientWidth || 0;
    const layouts = larguraCanvas > 0 && window.CRM_DASHBOARD_LAYOUT?.ajustarLargurasDireita
        ? window.CRM_DASHBOARD_LAYOUT.ajustarLargurasDireita(layoutsBase, larguraCanvas)
        : layoutsBase;
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
    if (!dashboardCanvas) return;
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
    renderizarDashboard();
}

function renderizarIconeOlho() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
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
    const layoutsRenderizacao = editorAtivo
        ? new Map(widgets.map((widget, index) => [widget.id, obterLayoutWidget(widget, index)]))
        : obterLayoutsRenderizacao(widgets);
    atualizarAlturaCanvas(widgets);
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
    return {
        dataInicial: sessionStorage.getItem('crmDataInicial') || crmDataInicial?.value || '',
        dataFinal: sessionStorage.getItem('crmDataFinal') || crmDataFinal?.value || '',
        filiais: categoriaSemFiltrosFilialVendedor ? [] : getFiliaisSelecionadas(),
        vendedores: categoriaSemFiltrosFilialVendedor ? [] : getVendedoresSelecionados(),
        idfuncionario: idFuncionarioLogado || '',
        idfilial: categoriaCodigo === 'VD' ? '' : (filialId || ''),
        idvendedor: categoriaCodigo === 'CX' ? '' : (idVendedorLogado || '')
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
    const timeout = setTimeout(() => controller.abort(), 20000);
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
                visualizacao
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
    const timeout = setTimeout(() => controller.abort(), 20000);
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
                })
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
    const parametros = categoriaCodigo === 'VD'
        ? /:(data_inicial|data_final|idvendedor)\b/i
        : (categoriaCodigo === 'CX'
            ? /:(data_inicial|data_final|idfilial)\b/i
            : /:(data_inicial|data_final|filiais|vendedores)\b/i);
    return consultas.some(consulta => parametros.test(String(consulta.sql || '')));
}

async function executarWidgetComFiltros(widget, filtros) {
    const consultas = Array.isArray(widget.consultas) && widget.consultas.length ? widget.consultas : [];
    if (consultas.length > 1) {
        const resultados = await Promise.all(consultas.map(consulta => executarConsultaConfigurada(consulta, filtros)));
        const combinado = combinarConsultas(resultados, widget.combinacaoConsultas || { modo: 'single' }, widget.camposCalculados || []);
        return { ...widget, colunasConsulta: combinado.colunas, dadosConsulta: combinado.dados, dadosConsultaAgregados: false, consultaAtualizadaEm: new Date().toISOString() };
    }
    const visualizacao = montarVisualizacaoWidget(widget);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
        const response = await fetch('/api/executar-cenario', {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', ...(usuarioLogado.sessionToken ? { Authorization: 'Bearer ' + usuarioLogado.sessionToken } : {}) },
            body: JSON.stringify({ fonte: widget.fonte || 'firebird', sql: widget.sql, filtros, visualizacao })
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) window.fazerLogout();
        if (!response.ok) throw new Error(data.details || data.error || 'Erro ao atualizar o card.');
        return { ...widget, colunasConsulta: Array.isArray(data.colunas) ? data.colunas : [], dadosConsulta: Array.isArray(data.dados) ? data.dados : (Array.isArray(data.amostra) ? data.amostra : []), dadosConsultaAgregados: data.resultadoAgregado === true, consultaAtualizadaEm: new Date().toISOString() };
    } finally { clearTimeout(timeout); }
}

function atualizarStatusFiltros(mensagem, erro = false) {
    if (!filterStatus) return;
    filterStatus.textContent = mensagem;
    filterStatus.classList.toggle('is-error', erro);
}

async function aplicarFiltrosDashboard() {
    const dataInicial = crmDataInicial?.value || '';
    const dataFinal = crmDataFinal?.value || '';
    if (!dataInicial || !dataFinal) return atualizarStatusFiltros('Informe as duas datas.', true);
    if (dataInicial > dataFinal) return atualizarStatusFiltros('A data inicial deve ser anterior a data final.', true);
    if (!crmFilialFilter?.hidden && filiaisDisponiveis.length && !filiaisRascunho.length) return atualizarStatusFiltros('Selecione ao menos uma filial.', true);
    if (!crmSellerFilter?.hidden && vendedoresDisponiveis.length && !vendedoresRascunho.length) {
        return atualizarStatusFiltros('Selecione ao menos um vendedor.', true);
    }

    sessionStorage.setItem('crmDataInicial', dataInicial);
    sessionStorage.setItem('crmDataFinal', dataFinal);
    setFiliaisSelecionadas(filiaisRascunho);
    setVendedoresSelecionados(vendedoresRascunho);
    if (crmFilialPanel) crmFilialPanel.hidden = true;
    if (crmVendedorPanel) crmVendedorPanel.hidden = true;
    definirPaginaOrcamento();

    const widgets = obterWidgetsDashboard();
    const indices = widgets.map((widget, index) => widgetUtilizaFiltrosVisiveis(widget) ? index : -1).filter(index => index >= 0);
    if (!indices.length) return atualizarStatusFiltros('Filtros aplicados.');

    if (applyFiltersButton) {
        applyFiltersButton.disabled = true;
        applyFiltersButton.textContent = 'Aplicando...';
    }
    if (resetFiltersButton) resetFiltersButton.disabled = true;
    atualizarStatusFiltros('Atualizando ' + indices.length + ' card' + (indices.length === 1 ? '' : 's') + '...');
    const resultados = await Promise.allSettled(indices.map(index => executarWidgetComFiltros(widgets[index], obterFiltrosCenario())));
    let atualizados = 0;
    resultados.forEach((resultado, posicao) => {
        if (resultado.status !== 'fulfilled') return;
        widgets[indices[posicao]] = resultado.value;
        atualizados += 1;
    });
    if (atualizados) {
        salvarWidgetsDashboard(widgets);
        estadosDrillDashboard.clear();
        renderizarDashboard();
    }
    const falhas = indices.length - atualizados;
    if (falhas) atualizarStatusFiltros(atualizados + ' atualizado(s); ' + falhas + ' com erro.', true);
    else atualizarStatusFiltros(atualizados + ' card' + (atualizados === 1 ? '' : 's') + ' atualizado' + (atualizados === 1 ? '' : 's') + '.');
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

function renderizarMapeamentoColunas() {
    if (!columnMappingBox) return;
    const tipo = widgetTypeSelect?.value || widgetEmEdicao?.tipo || 'bar';
    const existentes = Array.isArray(widgetEmEdicao?.mapeamentos) ? widgetEmEdicao.mapeamentos : [];
    const porNome = new Map(existentes.map(item => [String(item.coluna).toLowerCase(), item]));

    if (!colunasConsultaAtual.length) {
        columnMappingBox.innerHTML = '';
        if (tableConfigBox) tableConfigBox.hidden = true;
        if (mappingNote) mappingNote.textContent = 'Execute a consulta para carregar as colunas retornadas.';
        return;
    }

    if (mappingNote) mappingNote.textContent = 'Defina como cada coluna retornada deve ser usada no grafico.';
    columnMappingBox.innerHTML = colunasConsultaAtual.map(coluna => {
        const atual = porNome.get(String(coluna).toLowerCase()) || {};
        return `
            <article class="crm-column-row" data-column-name="${escapeHtml(coluna)}">
                <strong>${escapeHtml(coluna)}</strong>
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
    renderizarConfiguracaoTabela();
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


function consultaSecundariaAtiva() { return Boolean(secondaryQueryBox && !secondaryQueryBox.hidden); }
function coletarConsultasEditor() {
    const consultas = [{ alias: widgetQueryAliasInput?.value.trim() || 'principal', fonte: widgetSourceSelect?.value || 'firebird', sql: widgetSqlTextarea?.value.trim() || '' }];
    if (consultaSecundariaAtiva()) consultas.push({ alias: secondaryQueryAliasInput?.value.trim() || 'secundaria', fonte: secondaryQuerySourceSelect?.value || 'postgres', sql: secondaryQuerySqlTextarea?.value.trim() || '' });
    return consultas;
}
function coletarCombinacaoEditor() { return { modo: queryCombinationModeSelect?.value || 'single', chavePrincipal: primaryKeySelect?.value || '', chaveSecundaria: secondaryKeySelect?.value || '' }; }
function coletarCamposCalculadosEditor() { return calculatedFieldList ? Array.from(calculatedFieldList.querySelectorAll('[data-calculated-field-row]')).map(row => ({ nome: row.querySelector('[data-calculated-name]')?.value.trim() || '', formula: row.querySelector('[data-calculated-formula]')?.value.trim() || '' })) : []; }
function assinaturaConsultasEditor() { return JSON.stringify({ consultas: coletarConsultasEditor(), combinacao: coletarCombinacaoEditor(), camposCalculados: coletarCamposCalculadosEditor() }); }
function preencherSelectCampos(select, colunas, selecionado) { if (!select) return; const lista = [...(colunas || [])]; if (selecionado && !lista.some(coluna => String(coluna) === String(selecionado))) lista.unshift(selecionado); select.innerHTML = '<option value="">Selecione...</option>' + lista.map(coluna => `<option value="${escapeHtml(coluna)}"${String(coluna) === String(selecionado) ? ' selected' : ''}>${escapeHtml(coluna)}</option>`).join(''); }
function atualizarControlesCombinacao() { const ativa = consultaSecundariaAtiva(); if (queryCombinationBox) queryCombinationBox.hidden = !ativa; const porChave = ativa && queryCombinationModeSelect?.value === 'key'; if (primaryKeyField) primaryKeyField.hidden = !porChave; if (secondaryKeyField) secondaryKeyField.hidden = !porChave; if (calculatedFieldsBox) calculatedFieldsBox.hidden = !ativa; }
function renderizarCamposCalculados(campos = []) { if (!calculatedFieldList) return; calculatedFieldList.innerHTML = campos.map(campo => `<div class="crm-calculated-field-row" data-calculated-field-row><label>Nome do campo<input type="text" value="${escapeHtml(campo.nome || '')}" data-calculated-name placeholder="ATINGIMENTO"></label><label>Fórmula<input type="text" value="${escapeHtml(campo.formula || '')}" data-calculated-formula placeholder="[principal.TOTAL] / [secundaria.META] * 100"></label><button type="button" data-remove-calculated-field aria-label="Remover campo" title="Remover campo">×</button></div>`).join(''); }
async function executarConsultaConfigurada(consulta, filtros, visualizacao = null) { const response = await fetch('/api/executar-cenario', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(usuarioLogado.sessionToken ? { Authorization: `Bearer ${usuarioLogado.sessionToken}` } : {}) }, body: JSON.stringify({ fonte: consulta.fonte, sql: consulta.sql, filtros, visualizacao }) }); const data = await response.json().catch(() => ({})); if (response.status === 401) window.fazerLogout(); if (!response.ok) throw new Error(data.details || data.error || `Erro na consulta ${consulta.alias}.`); return { ...consulta, colunas: Array.isArray(data.colunas) ? data.colunas : [], dados: Array.isArray(data.dados) ? data.dados : (Array.isArray(data.amostra) ? data.amostra : []) }; }
function combinarConsultas(resultados, combinacao, camposCalculados) { if (!window.CRM_COMPOSITE_DATASETS) throw new Error('Combinador de consultas indisponível.'); return window.CRM_COMPOSITE_DATASETS.combinar(resultados, combinacao, camposCalculados, window.CRM_KPI_CALCULATOR?.avaliar); }
function recombinarConsultasEditor() { const combinado = combinarConsultas(resultadosConsultasAtuais, coletarCombinacaoEditor(), coletarCamposCalculadosEditor()); colunasConsultaAtual = combinado.colunas; dadosConsultaAtual = combinado.dados; renderizarMapeamentoColunas(); renderizarTabelaConsulta({ colunas: combinado.colunas, amostra: combinado.dados.slice(0, 100), dados: combinado.dados, linhas: combinado.dados.length }); return combinado; }

async function testarConsultaWidget() {
    const consultas = coletarConsultasEditor();
    if (consultas.some(consulta => !consulta.sql)) { renderizarResultadoConsulta('Digite o SQL de todas as consultas.', 'error'); return false; }
    const aliases = consultas.map(consulta => consulta.alias.toLowerCase());
    if (new Set(aliases).size !== aliases.length) { renderizarResultadoConsulta('Use apelidos diferentes para as consultas.', 'error'); return false; }
    renderizarResultadoConsulta('Executando ' + consultas.length + ' consulta(s)...', 'info');
    try {
        resultadosConsultasAtuais = await Promise.all(consultas.map(consulta => executarConsultaConfigurada(consulta, obterFiltrosCenario())));
        const combinacaoSalva = coletarCombinacaoEditor();
        preencherSelectCampos(primaryKeySelect, resultadosConsultasAtuais[0]?.colunas, combinacaoSalva.chavePrincipal);
        preencherSelectCampos(secondaryKeySelect, resultadosConsultasAtuais[1]?.colunas, combinacaoSalva.chaveSecundaria);
        if (resultadosConsultasAtuais.length > 1 && resultadosConsultasAtuais.some(item => item.dados.length > 1) && queryCombinationModeSelect?.value === 'single') {
            queryCombinationModeSelect.value = 'key';
            const comuns = resultadosConsultasAtuais[0].colunas.filter(coluna => resultadosConsultasAtuais[1].colunas.some(item => String(item).toLowerCase() === String(coluna).toLowerCase()));
            if (comuns[0]) { primaryKeySelect.value = comuns[0]; secondaryKeySelect.value = resultadosConsultasAtuais[1].colunas.find(item => String(item).toLowerCase() === String(comuns[0]).toLowerCase()) || ''; }
        }
        atualizarControlesCombinacao();
        const combinado = recombinarConsultasEditor();
        assinaturaConsultaAtual = assinaturaConsultasEditor();
        renderizarResultadoConsulta(combinado.colunas.length + ' colunas combinadas. ' + combinado.dados.length + ' linhas disponíveis.', 'success');
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
    if (widgetTitleInput) widgetTitleInput.value = widgetEmEdicao.titulo || '';
    const consultasWidget = Array.isArray(widgetEmEdicao.consultas) && widgetEmEdicao.consultas.length
        ? widgetEmEdicao.consultas
        : [{ alias: 'principal', fonte: widgetEmEdicao.fonte || 'firebird', sql: widgetEmEdicao.sql || '' }];
    const principalWidget = consultasWidget[0];
    const secundariaWidget = consultasWidget[1];
    if (widgetSourceSelect) widgetSourceSelect.value = principalWidget.fonte || 'firebird';
    if (widgetSqlTextarea) widgetSqlTextarea.value = principalWidget.sql || '';
    if (widgetQueryAliasInput) widgetQueryAliasInput.value = principalWidget.alias || 'principal';
    if (secondaryQueryBox) secondaryQueryBox.hidden = !secundariaWidget;
    if (secondaryQueryAliasInput) secondaryQueryAliasInput.value = secundariaWidget?.alias || 'secundaria';
    if (secondaryQuerySourceSelect) secondaryQuerySourceSelect.value = secundariaWidget?.fonte || 'postgres';
    if (secondaryQuerySqlTextarea) secondaryQuerySqlTextarea.value = secundariaWidget?.sql || '';
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
        consultaAtualizadaEm: calculado ? null : new Date().toISOString(),
        mapeamentos,
        calculo: calculado ? configuracaoCalculo : (widgetEmEdicao.calculo || null),
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
    if (addSecondaryQueryButton) addSecondaryQueryButton.addEventListener('click', () => { secondaryQueryBox.hidden = false; atualizarControlesCombinacao(); assinaturaConsultaAtual = ''; });
    if (removeSecondaryQueryButton) removeSecondaryQueryButton.addEventListener('click', () => { secondaryQueryBox.hidden = true; resultadosConsultasAtuais = resultadosConsultasAtuais.slice(0, 1); renderizarCamposCalculados([]); atualizarControlesCombinacao(); assinaturaConsultaAtual = ''; });
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
        });
    }
    if (tableConfigBox) tableConfigBox.addEventListener('change', event => {
        coletarConfiguracaoTabela();
        if (event.target.matches('[data-group-field]')) renderizarConfiguracaoTabela();
    });
    if (widgetTypeSelect) {
        widgetTypeSelect.addEventListener('change', () => {
            if (widgetEmEdicao) widgetEmEdicao.mapeamentos = coletarMapeamentosColunas();
            atualizarModoConfiguracaoWidget();
            renderizarMapeamentoColunas();
            renderizarPreviaAparencia();
        });
    }
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
            const editButton = event.target.closest('[data-edit-widget]');
            if (!editButton) return;
            const card = editButton.closest('[data-widget-id]');
            if (card) abrirModalWidget(card.dataset.widgetId);
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

    closeWidgetButtons.forEach(button => button.addEventListener('click', fecharModalWidget));
    closeSqlViewerButtons.forEach(button => button.addEventListener('click', fecharVisualizadorSql));
    if (indentSqlViewerButton) indentSqlViewerButton.addEventListener('click', indentarSqlVisualizador);
    if (copySqlViewerButton) copySqlViewerButton.addEventListener('click', copiarSqlVisualizador);
    if (pasteSqlViewerButton) pasteSqlViewerButton.addEventListener('click', colarSqlVisualizador);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && sqlViewerModal && !sqlViewerModal.hidden) fecharVisualizadorSql();
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
    if (event.target.closest('[data-filial-multiselect]') || event.target.closest('[data-vendedor-multiselect]')) return;
    if (crmFilialPanel) crmFilialPanel.hidden = true;
    if (crmVendedorPanel) crmVendedorPanel.hidden = true;
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
    iniciarModulo('navegacao', () => ativarView(obterViewPorHash(hashInicial)));
    iniciarModulo('orcamentos', definirPaginaOrcamento);
    iniciarModulo('periodo', inicializarPeriodo);
    iniciarModulo('editor de cenarios', inicializarEditorDashboard);
    iniciarModulo('filtros', async () => {
        await carregarFiliais();
        await carregarVendedores();
        if (applyFiltersButton) applyFiltersButton.addEventListener('click', aplicarFiltrosDashboard);
        if (resetFiltersButton) resetFiltersButton.addEventListener('click', restaurarFiltrosPadrao);
        [crmDataInicial, crmDataFinal].forEach(input => input?.addEventListener('change', () => atualizarStatusFiltros('')));
        await aplicarFiltrosDashboard();
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




