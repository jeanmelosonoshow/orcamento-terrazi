const usuarioLogadoRaw = sessionStorage.getItem('usuarioLogado');
if (!usuarioLogadoRaw) {
    window.top.location.replace('login.html');
    throw new Error('Sessao nao autenticada.');
}

const usuarioLogado = JSON.parse(usuarioLogadoRaw || '{}');
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
const addWidgetButton = document.querySelector('[data-add-widget]');
const widgetModal = document.querySelector('[data-widget-modal]');
const widgetTypeSelect = document.querySelector('[data-widget-type]');
const widgetTitleInput = document.querySelector('[data-widget-title]');
const widgetSteps = Array.from(document.querySelectorAll('[data-widget-step]'));
const widgetStepIndicators = Array.from(document.querySelectorAll('[data-step-indicator]'));
const testWidgetQueryButton = document.querySelector('[data-test-widget-query]');
const nextWidgetStepButton = document.querySelector('[data-next-widget-step]');
const prevWidgetStepButton = document.querySelector('[data-prev-widget-step]');
const queryResultBox = document.querySelector('[data-query-result]');
const queryTableWrap = document.querySelector('[data-query-table-wrap]');
const columnMappingBox = document.querySelector('[data-column-mapping]');
const mappingNote = document.querySelector('[data-mapping-note]');
const widgetSourceSelect = document.querySelector('[data-widget-source]');
const widgetSqlTextarea = document.querySelector('[data-widget-sql]');
const saveWidgetButton = document.querySelector('[data-save-widget]');
const closeWidgetButtons = Array.from(document.querySelectorAll('[data-close-widget-modal]'));
const dashboardStorageKey = 'crmDashboardScenario:v1';
let widgetEmEdicao = null;
let colunasConsultaAtual = [];
let etapaWidgetAtual = 'sql';
let modoEdicaoCenario = false;

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
        sql: ''
    };
}

function obterWidgetsDashboard() {
    try {
        const salvos = JSON.parse(localStorage.getItem(dashboardStorageKey) || '[]');
        if (Array.isArray(salvos) && salvos.length) return salvos;
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

function renderizarVisualGrafico(tipo) {
    if (tipo === 'kpi') return '<div class="crm-chart-kpi-preview"><strong>R$ 0,00</strong><span>Indicador</span></div>';
    if (tipo === 'pie' || tipo === 'donut' || tipo === 'gauge') return '<div class="crm-chart-circle-preview"></div>';
    if (tipo === 'funnel') return '<div class="crm-chart-funnel-preview"><span></span><span></span><span></span><span></span></div>';
    if (tipo === 'table' || tipo === 'pivot' || tipo === 'ranking') return '<div class="crm-chart-table-preview"><span></span><span></span><span></span><span></span></div>';
    if (tipo === 'line' || tipo === 'area' || tipo === 'sparkline') return '<div class="crm-chart-line-preview"><span></span></div>';
    if (tipo === 'heatmap' || tipo === 'calendar' || tipo === 'cohort') return '<div class="crm-chart-heat-preview">' + Array.from({ length: 24 }, () => '<span></span>').join('') + '</div>';
    return '<div class="crm-chart-bars-preview"><span></span><span></span><span></span><span></span><span></span></div>';
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
    return widgets.map((widget, index) => ({ ...widget, ...obterLayoutWidget(widget, index) }));
}

function atualizarAlturaCanvas(widgets) {
    if (!dashboardCanvas) return;
    const alturaNecessaria = widgets.reduce((maior, widget, index) => {
        const layout = obterLayoutWidget(widget, index);
        return Math.max(maior, layout.y + layout.h + 28);
    }, 520);
    dashboardCanvas.style.minHeight = `${alturaNecessaria}px`;
}

function atualizarLayoutWidget(widgetId, layoutParcial) {
    const widgets = normalizarWidgetsDashboard(obterWidgetsDashboard());
    const index = widgets.findIndex(widget => widget.id === widgetId);
    if (index < 0) return;
    widgets[index] = { ...widgets[index], ...layoutParcial };
    salvarWidgetsDashboard(widgets);
    atualizarAlturaCanvas(widgets);
}
function renderizarDashboard() {
    if (!dashboardCanvas) return;
    const editorAtivo = podeEditarCenarios && modoEdicaoCenario;
    const widgets = normalizarWidgetsDashboard(obterWidgetsDashboard());
    salvarWidgetsDashboard(widgets);
    atualizarAlturaCanvas(widgets);
    dashboardCanvas.innerHTML = widgets.map((widget, index) => {
        const layout = obterLayoutWidget(widget, index);
        return `
            <article class="crm-dashboard-widget" data-widget-id="${escapeHtml(widget.id)}" style="left: ${layout.x}px; top: ${layout.y}px; width: ${layout.w}px; height: ${layout.h}px;">
                <div class="crm-dashboard-widget-head" data-widget-drag-handle>
                    <div>
                        <span>${escapeHtml(obterNomeGrafico(widget.tipo))}</span>
                        <strong>${escapeHtml(widget.titulo)}</strong>
                    </div>
                    ${editorAtivo ? '<button type="button" data-edit-widget>Editar</button>' : ''}
                </div>
                ${renderizarVisualGrafico(widget.tipo)}
                <div class="crm-dashboard-widget-meta">
                    <span>${escapeHtml(widget.fonte || 'firebird')}</span>
                    <span>${widget.sql ? 'SQL definido' : 'Aguardando consulta'}</span>
                </div>
                ${editorAtivo ? '<span class="crm-dashboard-resize" data-resize-widget aria-hidden="true"></span>' : ''}
            </article>
        `;
    }).join('');
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
    if (saveWidgetButton) saveWidgetButton.hidden = etapa !== 'mapping';
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
    return fetch(url, { signal: controller.signal })
        .then(async response => {
            const data = await response.json().catch(() => ({}));
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
                <label>
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
                <label>
                    Formato valor
                    <select data-map-value-format>
                        <option value="money"${(atual.formatoValor || 'money') === 'money' ? ' selected' : ''}>Monetario</option>
                        <option value="percent"${atual.formatoValor === 'percent' ? ' selected' : ''}>Percentual</option>
                        <option value="integer"${atual.formatoValor === 'integer' ? ' selected' : ''}>Numerico inteiro</option>
                        <option value="decimal"${atual.formatoValor === 'decimal' ? ' selected' : ''}>Numerico decimal</option>
                    </select>
                </label>
                <label>
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
}

function coletarMapeamentosColunas() {
    if (!columnMappingBox) return [];
    return Array.from(columnMappingBox.querySelectorAll('[data-column-name]')).map(row => ({
        coluna: row.dataset.columnName,
        papel: row.querySelector('[data-map-role]')?.value || 'ignorar',
        agregacao: row.querySelector('[data-map-aggregation]')?.value || 'none',
        formatoValor: row.querySelector('[data-map-value-format]')?.value || 'money',
        formatoData: row.querySelector('[data-map-date-format]')?.value || 'none'
    })).filter(item => item.papel !== 'ignorar');
}

async function testarConsultaWidget() {
    if (!widgetSqlTextarea || !widgetSourceSelect) return false;
    const sql = widgetSqlTextarea.value.trim();
    if (!sql) {
        renderizarResultadoConsulta('Digite uma consulta SELECT para testar.', 'error');
        return false;
    }

    renderizarResultadoConsulta('Executando consulta...', 'info');
    try {
        const response = await fetch('/api/executar-cenario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fonte: widgetSourceSelect.value,
                sql,
                filtros: obterFiltrosCenario(),
                usuario: { idfuncionario: idFuncionarioLogado }
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.details || data.error || 'Erro ao executar consulta.');
        colunasConsultaAtual = Array.isArray(data.colunas) ? data.colunas : [];
        renderizarMapeamentoColunas();
        renderizarTabelaConsulta(data);
        renderizarResultadoConsulta(`${colunasConsultaAtual.length} colunas retornadas. ${data.linhas || 0} linhas exibidas.`, 'success');
        return true;
    } catch (error) {
        colunasConsultaAtual = [];
        renderizarMapeamentoColunas();
        if (queryTableWrap) { queryTableWrap.hidden = true; queryTableWrap.innerHTML = ''; }
        renderizarResultadoConsulta(error.message || 'Erro ao executar consulta.', 'error');
        return false;
    }
}

function abrirModalWidget(widgetId) {
    if (!widgetModal) return;
    const widgets = obterWidgetsDashboard();
    widgetEmEdicao = widgets.find(widget => widget.id === widgetId) || criarWidgetPadrao();
    colunasConsultaAtual = Array.isArray(widgetEmEdicao.colunasConsulta) ? widgetEmEdicao.colunasConsulta : [];

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
    setEtapaWidget('sql');
    widgetModal.hidden = false;
}

function fecharModalWidget() {
    if (widgetModal) widgetModal.hidden = true;
    widgetEmEdicao = null;
    colunasConsultaAtual = [];
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
        mapeamentos
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
        if (event.target.closest('[data-edit-widget]')) return;

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

    if (editModeToggle) editModeToggle.addEventListener('click', () => aplicarModoEdicaoCenario(!modoEdicaoCenario));
    if (addWidgetButton) addWidgetButton.addEventListener('click', () => abrirModalWidget());
    if (testWidgetQueryButton) testWidgetQueryButton.addEventListener('click', () => testarConsultaWidget());
    if (nextWidgetStepButton) {
        nextWidgetStepButton.addEventListener('click', async () => {
            if (!colunasConsultaAtual.length) {
                const ok = await testarConsultaWidget();
                if (!ok) return;
            }
            setEtapaWidget('mapping');
        });
    }
    if (prevWidgetStepButton) prevWidgetStepButton.addEventListener('click', () => setEtapaWidget('sql'));

    if (dashboardCanvas) {
        dashboardCanvas.addEventListener('click', event => {
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

        crmVendedorTrigger.addEventListener('click', () => {
            crmVendedorPanel.hidden = !crmVendedorPanel.hidden;
            if (!crmVendedorPanel.hidden && crmVendedorSearch) crmVendedorSearch.focus();
        });

        if (crmVendedorSearch) {
            crmVendedorSearch.addEventListener('input', () => renderizarOpcoesVendedores(vendedores, crmVendedorSearch.value));
        }

        crmVendedorOptions.addEventListener('change', event => {
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
        });
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
            crmFilialTrigger.addEventListener('click', () => {
                crmFilialPanel.hidden = !crmFilialPanel.hidden;
                if (!crmFilialPanel.hidden && crmFilialSearch) crmFilialSearch.focus();
            });
        }

        if (crmFilialSearch) {
            crmFilialSearch.addEventListener('input', () => renderizarOpcoesFiliais(filiais, crmFilialSearch.value));
        }

        if (crmFilialOptions) {
            crmFilialOptions.addEventListener('change', event => {
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
            });
        }
    } catch (error) {
        crmFilialTrigger.textContent = 'Erro ao carregar filiais';
        crmFilialReadonly.textContent = 'Erro ao carregar filiais';
        crmFilialTrigger.hidden = true;
        crmFilialReadonly.hidden = false;
    }
}

inicializarEditorDashboard();
inicializarPeriodo();
carregarFiliais().then(() => carregarVendedores());
document.addEventListener('click', event => {
    if (event.target.closest('[data-filial-multiselect]') || event.target.closest('[data-vendedor-multiselect]')) return;
    if (crmFilialPanel) crmFilialPanel.hidden = true;
    if (crmVendedorPanel) crmVendedorPanel.hidden = true;
});

window.fazerLogout = () => {
    sessionStorage.clear();
    window.location.href = 'login.html';
};

const budgetFrame = document.querySelector('[data-budget-frame]');
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

definirPaginaOrcamento();

ativarView(obterViewPorHash(window.location.hash || '#visao-geral'), window.location.hash || '#visao-geral');

const sidebarToggle = document.querySelector('[data-sidebar-toggle]');
if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        const collapsed = document.body.classList.toggle('crm-sidebar-collapsed');
        sidebarToggle.textContent = collapsed ? '›' : '‹';
        sidebarToggle.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Esconder menu');
        sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    });
}




