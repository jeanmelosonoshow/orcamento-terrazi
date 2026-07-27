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
function obterViewPorHash(hash) {
    return hash === '#orcamentos' ? 'orcamentos' : 'visao-geral';
}

function ativarView(viewName, hash = window.location.hash || '#visao-geral') {
    document.body.classList.toggle('crm-budget-mode', viewName === 'orcamentos');
    document.querySelectorAll('[data-crm-view]').forEach(view => {
        view.hidden = view.dataset.crmView !== viewName;
    });
    document.querySelectorAll('[data-crm-view-link]').forEach(link => {
        const href = link.getAttribute('href') || '#visao-geral';
        const isActive = viewName === 'orcamentos'
            ? href === '#orcamentos'
            : href === hash || (!hash && href === '#visao-geral');
        link.classList.toggle('is-active', isActive);
    });
    if (viewName === 'orcamentos') {
        try { definirPaginaOrcamento(); } catch (error) {}
    }
    if (viewName === 'visao-geral' && hash && hash !== '#visao-geral') {
        const target = document.querySelector(hash);
        if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
    }
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
        ativarView(obterViewPorHash(hash), hash);
    }
}, true);

window.addEventListener('hashchange', () => {
    const hash = window.location.hash || '#visao-geral';
    ativarView(obterViewPorHash(hash), hash);
});

const categoriaRaw = String(usuarioLogado.categoria || usuarioLogado.CATEGORIA || '').trim().toUpperCase();
const categoriaCodigo = categoriasTraduzidas[categoriaRaw] ? categoriaRaw : (categoriasPorNome[categoriaRaw] || categoriaRaw);
const categoria = categoriasTraduzidas[categoriaCodigo] || categoriaCodigo || 'USUÁRIO';

const crmUserName = document.getElementById('crmUserName');
const crmUserMeta = document.getElementById('crmUserMeta');
const crmUserFilial = document.getElementById('crmUserFilial');
const crmUserInitials = document.getElementById('crmUserInitials');
const crmDataInicial = document.querySelector('[data-date-start]');
const crmDataFinal = document.querySelector('[data-date-end]');
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
const podeEditarCenarios = Boolean(usuarioLogado.podeEditarCenarios || usuarioLogado.canEditScenarios);
const dashboardEditor = document.querySelector('[data-dashboard-editor]');
const dashboardCanvas = document.querySelector('[data-dashboard-canvas]');
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
const widgetSourceSelect = document.querySelector('[data-widget-source]');
const widgetSqlTextarea = document.querySelector('[data-widget-sql]');
const saveWidgetButton = document.querySelector('[data-save-widget]');
const widgetBackgroundModeSelect = document.querySelector('[data-widget-background-mode]');
const widgetBackgroundColorInput = document.querySelector('[data-widget-background-color]');
const widgetGradientStartInput = document.querySelector('[data-widget-gradient-start]');
const widgetGradientEndInput = document.querySelector('[data-widget-gradient-end]');
const widgetSolidColorField = document.querySelector('[data-widget-solid-color-field]');
const widgetGradientFields = Array.from(document.querySelectorAll('[data-widget-gradient-field]'));
const widgetPaletteOptions = document.querySelector('[data-widget-palette-options]');
const widgetIconOptions = document.querySelector('[data-widget-icon-options]');
const appearancePreview = document.querySelector('[data-appearance-preview]');
const closeWidgetButtons = Array.from(document.querySelectorAll('[data-close-widget-modal]'));
const budgetFrame = document.querySelector('[data-budget-frame]');
const dashboardStorageKey = 'crmDashboardScenario:v1';
const dashboardCanvasHeightKey = 'crmDashboardCanvasHeight:v1';
const dashboardCanvasMinHeight = 620;
const dashboardCanvasMaxHeight = 4000;
const dashboardCanvasHeightStep = 200;
let widgetEmEdicao = null;
let colunasConsultaAtual = [];
let dadosConsultaAtual = [];
let assinaturaConsultaAtual = '';
let etapaWidgetAtual = 'sql';
let modoEdicaoCenario = false;
const instanciasGraficosDashboard = new Map();
const observadoresGraficosDashboard = new Map();

const catalogoGraficos = [
    { id: 'kpi', nome: 'Indicador KPI', roles: ['valor'] },
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
    { id: 'table', nome: 'Tabela', roles: ['dimensao', 'linha', 'coluna', 'valor'] },
    { id: 'pivot', nome: 'Tabela dinamica', roles: ['linha', 'coluna', 'valor'] },
    { id: 'waterfall', nome: 'Cascata', roles: ['dimensao', 'valor'] },
    { id: 'histogram', nome: 'Histograma', roles: ['dimensao', 'valor'] },
    { id: 'bullet', nome: 'Meta x realizado', roles: ['dimensao', 'valor'] },
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

const iconesWidgets = [
    { id: 'none', nome: 'Sem icone', svg: '' },
    { id: 'money', nome: 'Financeiro', svg: '<circle cx="12" cy="12" r="9"></circle><path d="M16 8.5c-.8-.8-2-1.2-3.4-1.2-1.9 0-3.1.9-3.1 2.2 0 3.4 6.7 1.6 6.7 5 0 1.4-1.4 2.4-3.5 2.4-1.5 0-2.9-.5-3.8-1.4"></path><path d="M12.5 5.5v13"></path>' },
    { id: 'chart', nome: 'Desempenho', svg: '<path d="M4 19V9"></path><path d="M10 19V5"></path><path d="M16 19v-7"></path><path d="M22 19H2"></path>' },
    { id: 'trend', nome: 'Crescimento', svg: '<path d="m3 17 6-6 4 4 8-9"></path><path d="M15 6h6v6"></path>' },
    { id: 'target', nome: 'Meta', svg: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle>' },
    { id: 'users', nome: 'Clientes', svg: '<path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 20v-1.5a4 4 0 0 0-3-3.8"></path><path d="M16 3.3a4 4 0 0 1 0 7.4"></path>' },
    { id: 'store', nome: 'Filial', svg: '<path d="M3 10h18"></path><path d="m5 10 1-6h12l1 6"></path><path d="M5 10v10h14V10"></path><path d="M9 20v-6h6v6"></path>' },
    { id: 'cart', nome: 'Vendas', svg: '<circle cx="9" cy="20" r="1"></circle><circle cx="19" cy="20" r="1"></circle><path d="M3 4h2l2.5 11h11l2-7H6"></path>' },
    { id: 'calendar', nome: 'Periodo', svg: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>' },
    { id: 'star', nome: 'Destaque', svg: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"></path>' },
    { id: 'percent', nome: 'Conversao', svg: '<path d="m19 5-14 14"></path><circle cx="7" cy="7" r="2.5"></circle><circle cx="17" cy="17" r="2.5"></circle>' }
];

const aparenciaWidgetPadrao = Object.freeze({
    fundoTipo: 'light',
    fundoCor: '#FFFFFF',
    gradienteInicio: '#123865',
    gradienteFim: '#1A3017',
    paleta: 'brand',
    icone: 'none'
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
        aparencia: { ...aparenciaWidgetPadrao }
    };
}

function obterWidgetsDashboard() {
    try {
        const conteudoSalvo = localStorage.getItem(dashboardStorageKey);
        if (conteudoSalvo !== null) {
            const salvos = JSON.parse(conteudoSalvo);
            if (Array.isArray(salvos)) return salvos;
        }
    } catch (error) {
        // Mantem o painel utilizavel caso um rascunho local esteja invalido.
    }

    return [
        { ...criarWidgetPadrao('bar'), id: 'evolucao-comercial', titulo: 'Evolucao comercial', colunas: 8 },
        { ...criarWidgetPadrao('kpi'), id: 'ticket-medio', titulo: 'Ticket medio', colunas: 4, linhas: 1 },
        { ...criarWidgetPadrao('funnel'), id: 'funil-orcamentos', titulo: 'Funil de orcamentos', colunas: 6 },
        { ...criarWidgetPadrao('ranking'), id: 'ranking-vendedores', titulo: 'Ranking de vendedores', colunas: 6 }
    ];
}

function salvarWidgetsDashboard(widgets) {
    localStorage.setItem(dashboardStorageKey, JSON.stringify(widgets));
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
        icone: iconesWidgets.some(item => item.id === atual.icone) ? atual.icone : aparenciaWidgetPadrao.icone
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
    return `--widget-background:${fundo};--widget-color:${texto};--widget-muted:${textoSuave};--widget-line:${linha};--widget-accent:${paleta[0]};`;
}

function coletarAparenciaWidget() {
    return obterAparenciaWidget({
        aparencia: {
            fundoTipo: widgetBackgroundModeSelect?.value || 'light',
            fundoCor: widgetBackgroundColorInput?.value,
            gradienteInicio: widgetGradientStartInput?.value,
            gradienteFim: widgetGradientEndInput?.value,
            paleta: widgetPaletteOptions?.querySelector('input:checked')?.value || 'brand',
            icone: widgetIconOptions?.querySelector('input:checked')?.value || 'none'
        }
    });
}

function atualizarCamposAparencia() {
    const modo = widgetBackgroundModeSelect?.value || 'light';
    if (widgetSolidColorField) widgetSolidColorField.hidden = modo !== 'solid';
    widgetGradientFields.forEach(campo => { campo.hidden = modo !== 'gradient'; });
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
        widgetIconOptions.innerHTML = iconesWidgets.map(icone => `<label class="crm-icon-option"><input type="radio" name="widget-icon" value="${escapeHtml(icone.id)}"${icone.id === aparencia.icone ? ' checked' : ''}><span>${icone.svg ? renderizarIconeWidget(icone.id) : '<span class="crm-no-icon">--</span>'}<small>${escapeHtml(icone.nome)}</small></span></label>`).join('');
    }
}

function renderizarPreviaAparencia() {
    if (!appearancePreview) return;
    const aparencia = coletarAparenciaWidget();
    const widgetPrevia = { ...(widgetEmEdicao || {}), aparencia };
    const paleta = obterPaletaWidget(widgetPrevia);
    appearancePreview.innerHTML = `
        <div class="crm-appearance-preview-card" style="${obterEstiloAparenciaWidget(widgetPrevia)}">
            ${renderizarIconeWidget(aparencia.icone, 'is-preview')}
            <small>${escapeHtml(obterNomeGrafico(widgetTypeSelect?.value || widgetPrevia.tipo))}</small>
            <strong>${escapeHtml(widgetTitleInput?.value.trim() || 'Titulo do indicador')}</strong>
            <span>Conteudo ajustavel ao tamanho do card</span>
            <div class="crm-appearance-preview-bars">${[42, 68, 54, 84, 63].map((altura, index) => `<i style="height:${altura}%;background:${paleta[index % paleta.length]}"></i>`).join('')}</div>
        </div>`;
}

function carregarAparenciaWidget(widget) {
    const aparencia = obterAparenciaWidget(widget);
    if (widgetBackgroundModeSelect) widgetBackgroundModeSelect.value = aparencia.fundoTipo;
    if (widgetBackgroundColorInput) widgetBackgroundColorInput.value = aparencia.fundoCor;
    if (widgetGradientStartInput) widgetGradientStartInput.value = aparencia.gradienteInicio;
    if (widgetGradientEndInput) widgetGradientEndInput.value = aparencia.gradienteFim;
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

function prepararDadosGrafico(widget) {
    const linhas = Array.isArray(widget.dadosConsulta) ? widget.dadosConsulta : [];
    const mapeamentos = Array.isArray(widget.mapeamentos) ? widget.mapeamentos : [];
    const dimensao = mapeamentos.find(item => ['dimensao', 'linha'].includes(item.papel));
    const valores = mapeamentos.filter(item => item.papel === 'valor');
    if (!linhas.length || !valores.length) return null;

    const grupos = new Map();
    linhas.forEach((linha, index) => {
        const valorDimensao = dimensao ? obterValorLinha(linha, dimensao.coluna) : 'Total';
        const rotulo = dimensao ? formatarDimensao(valorDimensao, dimensao.formatoData) : 'Total';
        const chave = dimensao ? `${rotulo}::${String(valorDimensao)}` : 'total';
        if (!grupos.has(chave)) grupos.set(chave, { rotulo, linhas: [], ordem: index });
        grupos.get(chave).linhas.push(linha);
    });

    const gruposOrdenados = Array.from(grupos.values()).sort((a, b) => a.ordem - b.ordem);
    return {
        categorias: gruposOrdenados.map(grupo => grupo.rotulo),
        series: valores.map(mapeamento => ({
            nome: mapeamento.coluna,
            formato: mapeamento.formatoValor || 'decimal',
            valores: gruposOrdenados.map(grupo => calcularAgregacao(
                grupo.linhas.map(linha => obterValorLinha(linha, mapeamento.coluna)),
                mapeamento.agregacao || 'none'
            ))
        }))
    };
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

function montarOpcaoECharts(widget, dados) {
    const cores = obterCoresGraficos();
    const paleta = obterPaletaWidget(widget);
    const aparencia = obterAparenciaWidget(widget);
    const baseContraste = aparencia.fundoTipo === 'solid' ? aparencia.fundoCor : aparencia.gradienteInicio;
    const textoGrafico = aparencia.fundoTipo === 'light' ? cores.texto : obterContrasteCor(baseContraste);
    const primeiraSerie = dados.series[0];
    const formatarTooltip = valor => formatarValorGrafico(valor, primeiraSerie?.formato);
    const base = {
        animationDuration: 420,
        color: paleta,
        textStyle: { color: textoGrafico, fontFamily: 'Arial, sans-serif' },
        tooltip: { trigger: 'axis', valueFormatter: formatarTooltip },
        grid: { left: 18, right: 18, top: 22, bottom: 14, containLabel: true }
    };
    const seriesCartesianas = dados.series.map(serie => ({
        name: serie.nome,
        type: ['line', 'area', 'sparkline'].includes(widget.tipo) ? 'line' : 'bar',
        smooth: ['line', 'area', 'sparkline'].includes(widget.tipo),
        areaStyle: widget.tipo === 'area' ? { opacity: 0.18 } : undefined,
        stack: widget.tipo === 'stacked-bar' ? 'total' : undefined,
        barMaxWidth: 54,
        data: serie.valores
    }));

    if (widget.tipo === 'horizontal-bar' || widget.tipo === 'ranking') {
        return {
            ...base,
            yAxis: { type: 'category', data: dados.categorias, inverse: true, axisTick: { show: false } },
            xAxis: { type: 'value', axisLabel: { formatter: value => formatarValorGrafico(value, primeiraSerie.formato) } },
            series: seriesCartesianas
        };
    }
    if (widget.tipo === 'pie' || widget.tipo === 'donut') {
        return {
            ...base,
            tooltip: { trigger: 'item', valueFormatter: formatarTooltip },
            series: [{
                type: 'pie',
                radius: widget.tipo === 'donut' ? ['48%', '72%'] : '72%',
                data: dados.categorias.map((nome, index) => ({ name: nome, value: primeiraSerie.valores[index] })),
                label: { formatter: '{b}: {d}%' }
            }]
        };
    }
    if (widget.tipo === 'funnel') {
        return {
            ...base,
            tooltip: { trigger: 'item', valueFormatter: formatarTooltip },
            series: [{
                type: 'funnel',
                left: '10%',
                width: '80%',
                label: { formatter: '{b}' },
                data: dados.categorias.map((nome, index) => ({ name: nome, value: primeiraSerie.valores[index] }))
            }]
        };
    }
    if (widget.tipo === 'treemap') {
        return {
            ...base,
            tooltip: { trigger: 'item', valueFormatter: formatarTooltip },
            series: [{
                type: 'treemap',
                roam: false,
                breadcrumb: { show: false },
                data: dados.categorias.map((nome, index) => ({ name: nome, value: primeiraSerie.valores[index] }))
            }]
        };
    }
    if (widget.tipo === 'gauge') {
        return {
            ...base,
            series: [{
                type: 'gauge',
                progress: { show: true },
                detail: { formatter: value => formatarValorGrafico(value, primeiraSerie.formato) },
                data: [{ value: primeiraSerie.valores[0], name: primeiraSerie.nome }]
            }]
        };
    }
    return {
        ...base,
        xAxis: { type: 'category', data: dados.categorias, axisTick: { alignWithLabel: true } },
        yAxis: { type: 'value', axisLabel: { formatter: value => formatarValorGrafico(value, primeiraSerie.formato) } },
        series: seriesCartesianas
    };
}

function renderizarTabelaGrafico(container, dados) {
    const cabecalho = `<th>Dimensao</th>${dados.series.map(serie => `<th>${escapeHtml(serie.nome)}</th>`).join('')}`;
    const linhas = dados.categorias.map((categoria, index) => `
        <tr>
            <td>${escapeHtml(categoria)}</td>
            ${dados.series.map(serie => `<td>${escapeHtml(formatarValorGrafico(serie.valores[index], serie.formato))}</td>`).join('')}
        </tr>
    `).join('');
    container.innerHTML = `<div class="crm-chart-table-real"><table><thead><tr>${cabecalho}</tr></thead><tbody>${linhas}</tbody></table></div>`;
}

function limparGraficosDashboard() {
    observadoresGraficosDashboard.forEach(observador => observador.disconnect());
    observadoresGraficosDashboard.clear();
    instanciasGraficosDashboard.forEach(instancia => instancia.dispose());
    instanciasGraficosDashboard.clear();
}

function renderizarGraficosDashboard(widgets) {
    widgets.forEach(widget => {
        const seletorId = window.CSS?.escape ? window.CSS.escape(widget.id) : String(widget.id).replace(/"/g, '\\"');
        const container = dashboardCanvas?.querySelector(`[data-chart-widget="${seletorId}"]`);
        if (!container) return;
        const dados = prepararDadosGrafico(widget);
        if (!dados) {
            container.innerHTML = '<div class="crm-chart-empty">Execute e salve uma consulta para visualizar os dados.</div>';
            return;
        }
        if (widget.tipo === 'kpi') {
            const serie = dados.series[0];
            const total = serie.valores.reduce((soma, valor) => soma + converterNumero(valor), 0);
            container.innerHTML = `<div class="crm-chart-kpi-real"><strong>${escapeHtml(formatarValorGrafico(total, serie.formato))}</strong><span>${escapeHtml(serie.nome)}</span></div>`;
            return;
        }
        if (widget.tipo === 'table' || widget.tipo === 'pivot' || !window.echarts) {
            renderizarTabelaGrafico(container, dados);
            return;
        }

        const instancia = window.echarts.init(container);
        instancia.setOption(montarOpcaoECharts(widget, dados));
        instanciasGraficosDashboard.set(widget.id, instancia);
        if (window.ResizeObserver) {
            const observador = new ResizeObserver(() => instancia.resize());
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

function normalizarWidgetsDashboard(widgets) {
    return widgets.map((widget, index) => ({
        ...widget,
        aparencia: obterAparenciaWidget(widget),
        ...obterLayoutWidget(widget, index)
    }));
}

function obterAlturaCanvasPreferida() {
    const alturaSalva = Number(localStorage.getItem(dashboardCanvasHeightKey));
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
    localStorage.setItem(dashboardCanvasHeightKey, String(novaAltura));
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
    renderizarDashboard();
}

function renderizarDashboard() {
    if (!dashboardCanvas) return;
    limparGraficosDashboard();
    const editorAtivo = podeEditarCenarios && modoEdicaoCenario;
    const widgets = normalizarWidgetsDashboard(obterWidgetsDashboard());
    salvarWidgetsDashboard(widgets);
    atualizarAlturaCanvas(widgets);
    if (!widgets.length) {
        dashboardCanvas.innerHTML = `
            <div class="crm-dashboard-empty">
                <strong>Nenhum grafico neste painel</strong>
                <span>${editorAtivo ? 'Use Adicionar grafico para criar um novo indicador.' : 'Os indicadores ainda nao foram configurados.'}</span>
            </div>
        `;
        return;
    }
    dashboardCanvas.innerHTML = widgets.map((widget, index) => {
        const layout = obterLayoutWidget(widget, index);
        return `
            <article class="crm-dashboard-widget" data-widget-id="${escapeHtml(widget.id)}" style="left: ${layout.x}px; top: ${layout.y}px; width: ${layout.w}px; height: ${layout.h}px; ${obterEstiloAparenciaWidget(widget)}">
                <div class="crm-dashboard-widget-head" data-widget-drag-handle>
                    ${renderizarIconeWidget(obterAparenciaWidget(widget).icone)}
                    <div>
                        <span>${escapeHtml(obterNomeGrafico(widget.tipo))}</span>
                        <strong>${escapeHtml(widget.titulo)}</strong>
                    </div>
                    ${editorAtivo ? `
                        <div class="crm-dashboard-widget-actions">
                            <button type="button" data-edit-widget>Editar</button>
                            <button type="button" class="crm-danger-button" data-delete-widget>Excluir</button>
                        </div>
                    ` : ''}
                </div>
                ${renderizarVisualGrafico(widget)}
                <div class="crm-dashboard-widget-meta">
                    <span>${escapeHtml(widget.fonte || 'firebird')}</span>
                    <span>${widget.sql ? 'SQL definido' : 'Aguardando consulta'}</span>
                </div>
                ${editorAtivo ? '<span class="crm-dashboard-resize" data-resize-widget aria-hidden="true"></span>' : ''}
            </article>
        `;
    }).join('');
    renderizarGraficosDashboard(widgets);
}

function obterConfigGrafico(tipo) {
    return catalogoGraficos.find(item => item.id === tipo) || catalogoGraficos[1];
}

function obterPapeisGrafico(tipo) {
    return obterConfigGrafico(tipo).roles || ['dimensao', 'valor'];
}

function setEtapaWidget(etapa) {
    etapaWidgetAtual = etapa;
    widgetSteps.forEach(step => {
        step.hidden = step.dataset.widgetStep !== etapa;
    });
    widgetStepIndicators.forEach(indicator => {
        indicator.classList.toggle('is-active', indicator.dataset.stepIndicator === etapa);
    });
    if (prevWidgetStepButton) prevWidgetStepButton.hidden = etapa === 'sql';
    if (testWidgetQueryButton) testWidgetQueryButton.hidden = etapa !== 'sql';
    if (nextWidgetStepButton) nextWidgetStepButton.hidden = etapa !== 'sql';
    if (nextAppearanceStepButton) nextAppearanceStepButton.hidden = etapa !== 'mapping';
    if (saveWidgetButton) saveWidgetButton.hidden = etapa !== 'appearance';
    if (etapa === 'appearance') renderizarPreviaAparencia();
}

function obterFiltrosCenario() {
    return {
        dataInicial: crmDataInicial?.value || '',
        dataFinal: crmDataFinal?.value || '',
        filiais: getFiliaisSelecionadas(),
        vendedores: getVendedoresSelecionados(),
        idfuncionario: idFuncionarioLogado || '',
        idfilial: filialId || '',
        idvendedor: idVendedorLogado || ''
    };
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
    return opcoes.map(papel => `<option value="${papel}"${papel === selecionado ? ' selected' : ''}>${papel}</option>`).join('');
}

function atualizarCamposMapeamento(row) {
    if (!row) return;
    const papel = row.querySelector('[data-map-role]')?.value || 'ignorar';
    const valorAtivo = papel === 'valor';
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

function renderizarMapeamentoColunas() {
    if (!columnMappingBox) return;
    const tipo = widgetTypeSelect?.value || widgetEmEdicao?.tipo || 'bar';
    const existentes = Array.isArray(widgetEmEdicao?.mapeamentos) ? widgetEmEdicao.mapeamentos : [];
    const porNome = new Map(existentes.map(item => [String(item.coluna).toLowerCase(), item]));

    if (!colunasConsultaAtual.length) {
        columnMappingBox.innerHTML = '';
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
                    Uso
                    <select data-map-role>${montarOpcoesPapel(tipo, atual.papel || 'ignorar')}</select>
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
}

function coletarMapeamentosColunas() {
    if (!columnMappingBox) return [];
    return Array.from(columnMappingBox.querySelectorAll('[data-column-name]')).map(row => {
        const papel = row.querySelector('[data-map-role]')?.value || 'ignorar';
        const valorAtivo = papel === 'valor';
        const dimensaoAtiva = ['dimensao', 'linha', 'coluna'].includes(papel);
        return {
            coluna: row.dataset.columnName,
            papel,
            agregacao: valorAtivo ? (row.querySelector('[data-map-aggregation]')?.value || 'none') : 'none',
            formatoValor: valorAtivo ? (row.querySelector('[data-map-value-format]')?.value || 'decimal') : null,
            formatoData: dimensaoAtiva ? (row.querySelector('[data-map-date-format]')?.value || 'none') : 'none'
        };
    }).filter(item => item.papel !== 'ignorar');
}

async function testarConsultaWidget() {
    if (!widgetSqlTextarea || !widgetSourceSelect) return false;
    const sql = widgetSqlTextarea.value.trim();
    if (!sql) {
        renderizarResultadoConsulta('Digite uma consulta SELECT para testar.', 'error');
        return false;
    }

    renderizarResultadoConsulta('Executando consulta...', 'info');
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
                fonte: widgetSourceSelect.value,
                sql,
                filtros: obterFiltrosCenario()
            })
        });
        const data = await response.json();
        if (response.status === 401) window.fazerLogout();
        if (!response.ok) throw new Error(data.details || data.error || 'Erro ao executar consulta.');
        colunasConsultaAtual = Array.isArray(data.colunas) ? data.colunas : [];
        dadosConsultaAtual = Array.isArray(data.amostra) ? data.amostra : [];
        assinaturaConsultaAtual = obterAssinaturaConsulta(widgetSourceSelect.value, sql);
        renderizarMapeamentoColunas();
        renderizarTabelaConsulta(data);
        renderizarResultadoConsulta(`${colunasConsultaAtual.length} colunas retornadas. ${data.linhas || 0} linhas exibidas.`, 'success');
        return true;
    } catch (error) {
        colunasConsultaAtual = [];
        dadosConsultaAtual = [];
        assinaturaConsultaAtual = '';
        renderizarMapeamentoColunas();
        if (queryTableWrap) { queryTableWrap.hidden = true; queryTableWrap.innerHTML = ''; }
        renderizarResultadoConsulta(error.message || 'Erro ao executar consulta.', 'error');
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

function abrirModalWidget(widgetId) {
    if (!widgetModal) return;
    const widgets = obterWidgetsDashboard();
    widgetEmEdicao = widgets.find(widget => widget.id === widgetId) || criarWidgetPadrao();
    colunasConsultaAtual = Array.isArray(widgetEmEdicao.colunasConsulta) ? widgetEmEdicao.colunasConsulta : [];
    dadosConsultaAtual = Array.isArray(widgetEmEdicao.dadosConsulta) ? widgetEmEdicao.dadosConsulta : [];
    assinaturaConsultaAtual = dadosConsultaAtual.length
        ? obterAssinaturaConsulta(widgetEmEdicao.fonte, widgetEmEdicao.sql)
        : '';

    if (widgetTypeSelect) {
        widgetTypeSelect.innerHTML = catalogoGraficos.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nome)}</option>`).join('');
        widgetTypeSelect.value = widgetEmEdicao.tipo;
    }
    if (widgetTitleInput) widgetTitleInput.value = widgetEmEdicao.titulo || '';
    if (widgetSourceSelect) widgetSourceSelect.value = widgetEmEdicao.fonte || 'firebird';
    if (widgetSqlTextarea) widgetSqlTextarea.value = widgetEmEdicao.sql || '';
    if (queryResultBox) queryResultBox.hidden = true;
    if (queryTableWrap) { queryTableWrap.hidden = true; queryTableWrap.innerHTML = ''; }
    renderizarMapeamentoColunas();
    carregarAparenciaWidget(widgetEmEdicao);
    setEtapaWidget('sql');
    widgetModal.hidden = false;
}

function fecharModalWidget() {
    if (widgetModal) widgetModal.hidden = true;
    widgetEmEdicao = null;
    colunasConsultaAtual = [];
    dadosConsultaAtual = [];
    assinaturaConsultaAtual = '';
}

function validarMapeamentoWidget(mapeamentos) {
    const tipo = widgetTypeSelect?.value || widgetEmEdicao?.tipo || 'bar';
    const papeis = obterPapeisGrafico(tipo);
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
    const assinaturaEsperada = obterAssinaturaConsulta(widgetSourceSelect?.value, widgetSqlTextarea?.value);
    if (assinaturaConsultaAtual !== assinaturaEsperada) {
        renderizarResultadoConsulta('Execute novamente a consulta antes de salvar o cenario.', 'error');
        setEtapaWidget('sql');
        return;
    }
    const mapeamentos = coletarMapeamentosColunas();
    if (!validarMapeamentoWidget(mapeamentos)) return;
    const widgets = obterWidgetsDashboard();
    const atualizado = {
        ...widgetEmEdicao,
        titulo: widgetTitleInput?.value.trim() || obterNomeGrafico(widgetTypeSelect?.value),
        tipo: widgetTypeSelect?.value || 'bar',
        fonte: widgetSourceSelect?.value || 'firebird',
        sql: widgetSqlTextarea?.value.trim() || '',
        colunasConsulta: colunasConsultaAtual,
        dadosConsulta: dadosConsultaAtual,
        consultaAtualizadaEm: new Date().toISOString(),
        mapeamentos,
        aparencia: coletarAparenciaWidget()
    };
    const index = widgets.findIndex(widget => widget.id === atualizado.id);
    if (index >= 0) {
        widgets[index] = atualizado;
    } else {
        widgets.push(atualizado);
    }
    salvarWidgetsDashboard(widgets);
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
    if (nextWidgetStepButton) {
        nextWidgetStepButton.addEventListener('click', async () => {
            const assinaturaEsperada = obterAssinaturaConsulta(widgetSourceSelect?.value, widgetSqlTextarea?.value);
            if (!colunasConsultaAtual.length || assinaturaConsultaAtual !== assinaturaEsperada) {
                const ok = await testarConsultaWidget();
                if (!ok) return;
            }
            setEtapaWidget('mapping');
        });
    }
    if (nextAppearanceStepButton) {
        nextAppearanceStepButton.addEventListener('click', () => {
            if (widgetEmEdicao) widgetEmEdicao.mapeamentos = coletarMapeamentosColunas();
            const mapeamentos = coletarMapeamentosColunas();
            if (!validarMapeamentoWidget(mapeamentos)) return;
            setEtapaWidget('appearance');
        });
    }
    if (prevWidgetStepButton) {
        prevWidgetStepButton.addEventListener('click', () => {
            setEtapaWidget(etapaWidgetAtual === 'appearance' ? 'mapping' : 'sql');
        });
    }
    if (columnMappingBox) {
        columnMappingBox.addEventListener('change', event => {
            if (!event.target.matches('[data-map-role]')) return;
            atualizarCamposMapeamento(event.target.closest('[data-column-name]'));
        });
    }
    if (widgetTypeSelect) {
        widgetTypeSelect.addEventListener('change', () => {
            if (widgetEmEdicao) widgetEmEdicao.mapeamentos = coletarMapeamentosColunas();
            renderizarMapeamentoColunas();
            renderizarPreviaAparencia();
        });
    }
    if (widgetTitleInput) widgetTitleInput.addEventListener('input', renderizarPreviaAparencia);
    [
        widgetBackgroundModeSelect,
        widgetBackgroundColorInput,
        widgetGradientStartInput,
        widgetGradientEndInput
    ].forEach(campo => {
        if (!campo) return;
        campo.addEventListener('input', atualizarCamposAparencia);
        campo.addEventListener('change', atualizarCamposAparencia);
    });
    if (widgetPaletteOptions) widgetPaletteOptions.addEventListener('change', renderizarPreviaAparencia);
    if (widgetIconOptions) widgetIconOptions.addEventListener('change', renderizarPreviaAparencia);

    if (dashboardCanvas) {
        dashboardCanvas.addEventListener('click', event => {
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
    }

    closeWidgetButtons.forEach(button => button.addEventListener('click', fecharModalWidget));
    if (saveWidgetButton) saveWidgetButton.addEventListener('click', salvarWidgetAtual);
}
function inicializarPeriodo() {
    if (crmDataInicial) {
        crmDataInicial.value = sessionStorage.getItem('crmDataInicial') || '';
        crmDataInicial.addEventListener('change', () => {
            sessionStorage.setItem('crmDataInicial', crmDataInicial.value || '');
        });
    }

    if (crmDataFinal) {
        crmDataFinal.value = sessionStorage.getItem('crmDataFinal') || '';
        crmDataFinal.addEventListener('change', () => {
            sessionStorage.setItem('crmDataFinal', crmDataFinal.value || '');
        });
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
    const nomesSelecionados = filiais
        .filter(filial => selecionadas.includes(String(filial.idfilial)))
        .map(filial => filial.nomefilial);

    if (!nomesSelecionados.length) {
        crmFilialTrigger.textContent = 'Selecione as filiais';
    } else if (nomesSelecionados.length === 1) {
        crmFilialTrigger.textContent = nomesSelecionados[0];
    } else {
        crmFilialTrigger.textContent = `${nomesSelecionados.length} filiais selecionadas`;
    }
}

function renderizarOpcoesFiliais(filiais, termo = '') {
    if (!crmFilialOptions) return;
    const selecionadas = getFiliaisSelecionadas();
    const termoBusca = termo.trim().toLowerCase();
    const filtradas = filiais.filter(filial => {
        const texto = `${filial.idfilial} ${filial.nomefilial}`.toLowerCase();
        return texto.includes(termoBusca);
    });

    if (!filtradas.length) {
        crmFilialOptions.innerHTML = '<div class="crm-multiselect-empty">Nenhuma filial encontrada.</div>';
        return;
    }

    crmFilialOptions.innerHTML = filtradas.map(filial => {
        const id = String(filial.idfilial);
        const checked = selecionadas.includes(id) ? ' checked' : '';
        return `
            <label class="crm-multiselect-option">
                <input type="checkbox" value="${escapeHtml(id)}"${checked} data-filial-checkbox>
                <span>${escapeHtml(filial.nomefilial)}</span>
            </label>
        `;
    }).join('');
}
function formatarVendedor(vendedor) {
    const idFilial = String(vendedor?.idfilial || '').trim();
    const idVendedor = String(vendedor?.idvendedor || '').trim();
    const nomeVendedor = String(vendedor?.nomefuncionario || '').trim();
    return [idFilial, idVendedor, nomeVendedor].filter(Boolean).join('-');
}

function atualizarResumoVendedores(vendedores, selecionados) {
    if (!crmVendedorTrigger) return;
    const nomesSelecionados = vendedores
        .filter(vendedor => selecionados.includes(String(vendedor.idvendedor)))
        .map(formatarVendedor);

    if (!nomesSelecionados.length) {
        crmVendedorTrigger.textContent = 'Selecione os vendedores';
    } else if (nomesSelecionados.length === 1) {
        crmVendedorTrigger.textContent = nomesSelecionados[0];
    } else {
        crmVendedorTrigger.textContent = `${nomesSelecionados.length} vendedores selecionados`;
    }
}

function renderizarOpcoesVendedores(vendedores, termo = '') {
    if (!crmVendedorOptions) return;
    const selecionados = getVendedoresSelecionados();
    const termoBusca = termo.trim().toLowerCase();
    const filtrados = vendedores.filter(vendedor => {
        const texto = `${vendedor.idfilial} ${vendedor.idvendedor} ${vendedor.nomefuncionario}`.toLowerCase();
        return texto.includes(termoBusca);
    });

    if (!filtrados.length) {
        crmVendedorOptions.innerHTML = '<div class="crm-multiselect-empty">Nenhum vendedor encontrado.</div>';
        return;
    }

    crmVendedorOptions.innerHTML = filtrados.map(vendedor => {
        const id = String(vendedor.idvendedor);
        const checked = selecionados.includes(id) ? ' checked' : '';
        return `
            <label class="crm-multiselect-option">
                <input type="checkbox" value="${escapeHtml(id)}"${checked} data-vendedor-checkbox>
                <span>${escapeHtml(formatarVendedor(vendedor))}</span>
            </label>
        `;
    }).join('');
}

async function carregarVendedores() {
    const podeFiltrarVendedor = ['DI', 'SU', 'GR'].includes(categoriaCodigo);
    if (!crmSellerFilter || !crmVendedorTrigger || !crmVendedorOptions) return;

    if (!podeFiltrarVendedor) {
        crmSellerFilter.hidden = true;
        setVendedoresSelecionados(idVendedorLogado ? [idVendedorLogado] : []);
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
            filiais: getFiliaisSelecionadas().join(',')
        });
        const data = await fetchJsonComTimeout(`/api/vendedores?${params.toString()}`);
        const vendedores = Array.isArray(data.vendedores) ? data.vendedores : [];

        if (!vendedores.length) {
            crmVendedorTrigger.textContent = 'Nenhum vendedor encontrado';
            crmVendedorTrigger.disabled = true;
            crmVendedorOptions.innerHTML = '<div class="crm-multiselect-empty">Nenhum vendedor encontrado.</div>';
            return;
        }

        const idsDisponiveis = vendedores.map(vendedor => String(vendedor.idvendedor));
        let selecionados = getVendedoresSelecionados().filter(id => idsDisponiveis.includes(String(id)));
        if (!selecionados.length) selecionados = idsDisponiveis;
        setVendedoresSelecionados(selecionados);
        atualizarResumoVendedores(vendedores, selecionados);
        renderizarOpcoesVendedores(vendedores);
        crmVendedorTrigger.disabled = false;

        crmVendedorTrigger.onclick = () => {
            crmVendedorPanel.hidden = !crmVendedorPanel.hidden;
            if (!crmVendedorPanel.hidden && crmVendedorSearch) crmVendedorSearch.focus();
        };

        if (crmVendedorSearch) {
            crmVendedorSearch.oninput = () => renderizarOpcoesVendedores(vendedores, crmVendedorSearch.value);
        }

        crmVendedorOptions.onchange = event => {
            if (!event.target.matches('[data-vendedor-checkbox]')) return;
            const valor = String(event.target.value);
            const selecionadosAtuais = new Set(getVendedoresSelecionados());
            if (event.target.checked) {
                selecionadosAtuais.add(valor);
            } else {
                selecionadosAtuais.delete(valor);
            }
            const novaSelecao = Array.from(selecionadosAtuais);
            setVendedoresSelecionados(novaSelecao.length ? novaSelecao : [String(vendedores[0].idvendedor)]);
            atualizarResumoVendedores(vendedores, getVendedoresSelecionados());
            renderizarOpcoesVendedores(vendedores, crmVendedorSearch?.value || '');
        };
    } catch (error) {
        crmVendedorTrigger.textContent = 'Erro ao carregar vendedores';
        crmVendedorTrigger.disabled = true;
    }
}

async function carregarFiliais() {
    if (!crmFilialTrigger || !crmFilialReadonly) return;

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
        const data = await fetchJsonComTimeout(`/api/filiais?${params.toString()}`);
        const filiais = Array.isArray(data.filiais) ? data.filiais : [];

        if (!filiais.length) {
            const fallbackNome = usuarioLogado.nomefilial || `Filial ${usuarioLogado.idfilial || ''}`.trim();
            setFiliaisSelecionadas(usuarioLogado.idfilial ? [usuarioLogado.idfilial] : []);
            crmFilialReadonly.textContent = fallbackNome || 'Filial nao encontrada';
            crmFilialTrigger.hidden = true;
            crmFilialReadonly.hidden = false;
            atualizarFilialUsuario(fallbackNome);
            return;
        }

        const filialUsuario = filiais.find(filial => String(filial.idfilial).toUpperCase() === String(usuarioLogado.idfilial || '').toUpperCase());
        atualizarFilialUsuario(filialUsuario?.nomefilial);

        const idsDisponiveis = filiais.map(filial => String(filial.idfilial));
        let selecionadas = getFiliaisSelecionadas().filter(id => idsDisponiveis.includes(String(id)));
        if (!selecionadas.length) {
            selecionadas = podeSelecionar ? idsDisponiveis : [String(filiais[0].idfilial)];
        }
        if (!podeSelecionar) selecionadas = [String(filiais[0].idfilial)];
        setFiliaisSelecionadas(selecionadas);
        definirPaginaOrcamento();

        crmFilialReadonly.textContent = filiais.find(filial => String(filial.idfilial) === selecionadas[0])?.nomefilial || filiais[0].nomefilial;
        atualizarResumoFiliais(filiais, selecionadas);
        renderizarOpcoesFiliais(filiais);

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

        if (crmFilialSearch) {
            crmFilialSearch.oninput = () => renderizarOpcoesFiliais(filiais, crmFilialSearch.value);
        }

        if (crmFilialOptions) {
            crmFilialOptions.onchange = event => {
                if (!event.target.matches('[data-filial-checkbox]')) return;
                const valor = String(event.target.value);
                const selecionadasAtuais = new Set(getFiliaisSelecionadas());
                if (event.target.checked) {
                    selecionadasAtuais.add(valor);
                } else {
                    selecionadasAtuais.delete(valor);
                }
                const novaSelecao = Array.from(selecionadasAtuais);
                setFiliaisSelecionadas(novaSelecao.length ? novaSelecao : [String(filiais[0].idfilial)]);
                atualizarResumoFiliais(filiais, getFiliaisSelecionadas());
                renderizarOpcoesFiliais(filiais, crmFilialSearch?.value || '');
                definirPaginaOrcamento();
                carregarVendedores();
            };
        }
    } catch (error) {
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

    iniciarModulo('navegacao', () => ativarView(obterViewPorHash(hashInicial), hashInicial));
    iniciarModulo('orcamentos', definirPaginaOrcamento);
    iniciarModulo('periodo', inicializarPeriodo);
    iniciarModulo('editor de cenarios', inicializarEditorDashboard);
    iniciarModulo('filtros', async () => {
        await carregarFiliais();
        await carregarVendedores();
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




