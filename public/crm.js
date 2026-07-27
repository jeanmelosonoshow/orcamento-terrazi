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
const widgetColsSelect = document.querySelector('[data-widget-cols]');
const widgetRowsSelect = document.querySelector('[data-widget-rows]');
const widgetDimensionInput = document.querySelector('[data-widget-dimension]');
const widgetRowInput = document.querySelector('[data-widget-row]');
const widgetColumnInput = document.querySelector('[data-widget-column]');
const widgetValueInput = document.querySelector('[data-widget-value]');
const widgetValueFormatSelect = document.querySelector('[data-widget-value-format]');
const widgetDateFormatSelect = document.querySelector('[data-widget-date-format]');
const widgetSourceSelect = document.querySelector('[data-widget-source]');
const widgetSqlTextarea = document.querySelector('[data-widget-sql]');
const saveWidgetButton = document.querySelector('[data-save-widget]');
const closeWidgetButtons = Array.from(document.querySelectorAll('[data-close-widget-modal]'));
const dashboardStorageKey = 'crmDashboardScenario:v1';
let widgetEmEdicao = null;

const catalogoGraficos = [
    { id: 'kpi', nome: 'Indicador KPI' },
    { id: 'bar', nome: 'Barras verticais' },
    { id: 'horizontal-bar', nome: 'Barras horizontais' },
    { id: 'grouped-bar', nome: 'Barras agrupadas' },
    { id: 'stacked-bar', nome: 'Barras empilhadas' },
    { id: 'line', nome: 'Linha' },
    { id: 'area', nome: 'Area' },
    { id: 'combo', nome: 'Combinado barras e linha' },
    { id: 'pie', nome: 'Pizza' },
    { id: 'donut', nome: 'Rosca' },
    { id: 'gauge', nome: 'Velocimetro' },
    { id: 'funnel', nome: 'Funil' },
    { id: 'treemap', nome: 'Mapa de arvore' },
    { id: 'heatmap', nome: 'Mapa de calor' },
    { id: 'scatter', nome: 'Dispersao' },
    { id: 'bubble', nome: 'Bolhas' },
    { id: 'ranking', nome: 'Ranking' },
    { id: 'table', nome: 'Tabela' },
    { id: 'pivot', nome: 'Tabela dinamica' },
    { id: 'waterfall', nome: 'Cascata' },
    { id: 'histogram', nome: 'Histograma' },
    { id: 'bullet', nome: 'Meta x realizado' },
    { id: 'sparkline', nome: 'Mini linha' },
    { id: 'calendar', nome: 'Calendario de calor' },
    { id: 'cohort', nome: 'Coorte' }
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
        colunas: 6,
        linhas: 2,
        dimensao: '',
        linha: '',
        coluna: '',
        valor: '',
        formatoValor: 'money',
        formatoData: 'none',
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

function renderizarDashboard() {
    if (!dashboardCanvas) return;
    const widgets = obterWidgetsDashboard();
    dashboardCanvas.innerHTML = widgets.map(widget => `
        <article class="crm-dashboard-widget" draggable="${podeEditarCenarios}" data-widget-id="${escapeHtml(widget.id)}" style="grid-column: span ${Number(widget.colunas) || 6}; min-height: ${150 + ((Number(widget.linhas) || 2) * 62)}px;">
            <div class="crm-dashboard-widget-head">
                <div>
                    <span>${escapeHtml(obterNomeGrafico(widget.tipo))}</span>
                    <strong>${escapeHtml(widget.titulo)}</strong>
                </div>
                ${podeEditarCenarios ? '<button type="button" data-edit-widget>Editar</button>' : ''}
            </div>
            ${renderizarVisualGrafico(widget.tipo)}
            <div class="crm-dashboard-widget-meta">
                <span>${escapeHtml(widget.fonte || 'firebird')}</span>
                <span>${widget.sql ? 'SQL definido' : 'Aguardando consulta'}</span>
            </div>
        </article>
    `).join('');
}

function abrirModalWidget(widgetId) {
    if (!widgetModal) return;
    const widgets = obterWidgetsDashboard();
    widgetEmEdicao = widgets.find(widget => widget.id === widgetId) || criarWidgetPadrao();

    if (widgetTypeSelect) {
        widgetTypeSelect.innerHTML = catalogoGraficos.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nome)}</option>`).join('');
        widgetTypeSelect.value = widgetEmEdicao.tipo;
    }
    if (widgetTitleInput) widgetTitleInput.value = widgetEmEdicao.titulo || '';
    if (widgetColsSelect) widgetColsSelect.value = String(widgetEmEdicao.colunas || 6);
    if (widgetRowsSelect) widgetRowsSelect.value = String(widgetEmEdicao.linhas || 2);
    if (widgetDimensionInput) widgetDimensionInput.value = widgetEmEdicao.dimensao || '';
    if (widgetRowInput) widgetRowInput.value = widgetEmEdicao.linha || '';
    if (widgetColumnInput) widgetColumnInput.value = widgetEmEdicao.coluna || '';
    if (widgetValueInput) widgetValueInput.value = widgetEmEdicao.valor || '';
    if (widgetValueFormatSelect) widgetValueFormatSelect.value = widgetEmEdicao.formatoValor || 'money';
    if (widgetDateFormatSelect) widgetDateFormatSelect.value = widgetEmEdicao.formatoData || 'none';
    if (widgetSourceSelect) widgetSourceSelect.value = widgetEmEdicao.fonte || 'firebird';
    if (widgetSqlTextarea) widgetSqlTextarea.value = widgetEmEdicao.sql || '';
    widgetModal.hidden = false;
}

function fecharModalWidget() {
    if (widgetModal) widgetModal.hidden = true;
    widgetEmEdicao = null;
}

function salvarWidgetAtual() {
    if (!widgetEmEdicao) return;
    const widgets = obterWidgetsDashboard();
    const atualizado = {
        ...widgetEmEdicao,
        titulo: widgetTitleInput?.value.trim() || obterNomeGrafico(widgetTypeSelect?.value),
        tipo: widgetTypeSelect?.value || 'bar',
        colunas: Number(widgetColsSelect?.value || 6),
        linhas: Number(widgetRowsSelect?.value || 2),
        dimensao: widgetDimensionInput?.value.trim() || '',
        linha: widgetRowInput?.value.trim() || '',
        coluna: widgetColumnInput?.value.trim() || '',
        valor: widgetValueInput?.value.trim() || '',
        formatoValor: widgetValueFormatSelect?.value || 'money',
        formatoData: widgetDateFormatSelect?.value || 'none',
        fonte: widgetSourceSelect?.value || 'firebird',
        sql: widgetSqlTextarea?.value.trim() || ''
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

function inicializarEditorDashboard() {
    if (dashboardEditor) dashboardEditor.hidden = !podeEditarCenarios;
    renderizarDashboard();

    if (addWidgetButton) addWidgetButton.addEventListener('click', () => abrirModalWidget());

    if (dashboardCanvas) {
        let draggedId = null;
        dashboardCanvas.addEventListener('click', event => {
            const editButton = event.target.closest('[data-edit-widget]');
            if (!editButton) return;
            const card = editButton.closest('[data-widget-id]');
            if (card) abrirModalWidget(card.dataset.widgetId);
        });
        dashboardCanvas.addEventListener('dragstart', event => {
            const card = event.target.closest('[data-widget-id]');
            if (!card || !podeEditarCenarios) return;
            draggedId = card.dataset.widgetId;
            card.classList.add('is-dragging');
        });
        dashboardCanvas.addEventListener('dragend', event => {
            event.target.closest('[data-widget-id]')?.classList.remove('is-dragging');
            draggedId = null;
        });
        dashboardCanvas.addEventListener('dragover', event => {
            if (!draggedId) return;
            event.preventDefault();
        });
        dashboardCanvas.addEventListener('drop', event => {
            if (!draggedId) return;
            const destino = event.target.closest('[data-widget-id]');
            if (!destino || destino.dataset.widgetId === draggedId) return;
            const widgets = obterWidgetsDashboard();
            const origemIndex = widgets.findIndex(widget => widget.id === draggedId);
            const destinoIndex = widgets.findIndex(widget => widget.id === destino.dataset.widgetId);
            if (origemIndex < 0 || destinoIndex < 0) return;
            const movido = widgets.splice(origemIndex, 1)[0];
            widgets.splice(destinoIndex, 0, movido);
            salvarWidgetsDashboard(widgets);
            renderizarDashboard();
        });
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
        const response = await fetch(`/api/vendedores?${params.toString()}`);
        const data = await response.json();
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
        const response = await fetch(`/api/filiais?${params.toString()}`);
        const data = await response.json();
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

const viewLinks = Array.from(document.querySelectorAll('[data-crm-view-link]'));
const views = Array.from(document.querySelectorAll('[data-crm-view]'));

function obterViewPorHash(hash) {
    return hash === '#orcamentos' ? 'orcamentos' : 'visao-geral';
}

function ativarView(viewName, hash = window.location.hash || '#visao-geral') {
    document.body.classList.toggle('crm-budget-mode', viewName === 'orcamentos');

    views.forEach(view => {
        view.hidden = view.dataset.crmView !== viewName;
    });

    viewLinks.forEach(link => {
        const isActive = viewName === 'orcamentos'
            ? link.getAttribute('href') === '#orcamentos'
            : link.getAttribute('href') === hash || (!hash && link.getAttribute('href') === '#visao-geral');
        link.classList.toggle('is-active', isActive);
    });

    if (viewName === 'visao-geral' && hash && hash !== '#visao-geral') {
        const target = document.querySelector(hash);
        if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
    }
}

viewLinks.forEach(link => {
    link.addEventListener('click', event => {
        const hash = link.getAttribute('href') || '#visao-geral';
        if (!hash.startsWith('#')) return;

        event.preventDefault();
        if (window.location.hash !== hash) {
            window.location.hash = hash;
        } else {
            ativarView(obterViewPorHash(hash), hash);
        }
    });
});

window.addEventListener('hashchange', () => {
    const hash = window.location.hash || '#visao-geral';
    ativarView(obterViewPorHash(hash), hash);
});

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

















