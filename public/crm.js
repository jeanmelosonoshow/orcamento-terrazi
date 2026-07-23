const usuarioLogadoRaw = sessionStorage.getItem('usuarioLogado');
if (!usuarioLogadoRaw) {
    window.location.href = 'login.html';
}

const usuarioLogado = JSON.parse(usuarioLogadoRaw || '{}');
const nome = usuarioLogado.nomefuncionario || usuarioLogado.nome || 'Usuário';
const filialId = String(usuarioLogado.idfilial || '').trim().toUpperCase();
const categoriaCodigo = String(usuarioLogado.categoria || '').trim().toUpperCase();
const categoriasTraduzidas = {
    VD: 'VENDEDOR',
    GR: 'GERENTE',
    SU: 'SUPERVISOR',
    DI: 'DIRETOR',
    CX: 'CAIXA'
};
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
if (crmUserName) crmUserName.textContent = nome;
if (crmUserMeta) crmUserMeta.textContent = categoria;
function atualizarFilialUsuario(nomeFilial) {
    if (!crmUserFilial) return;
    const textoFilial = nomeFilial || usuarioLogado.nomefilial || (usuarioLogado.idfilial ? 'Filial: ' + usuarioLogado.idfilial : 'Filial nao informada');
    crmUserFilial.textContent = textoFilial;
}

atualizarFilialUsuario();
if (crmUserInitials) crmUserInitials.textContent = obterIniciais(nome);

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

async function carregarFiliais() {
    if (!crmFilialTrigger || !crmFilialReadonly) return;

    const podeSelecionar = ['DI', 'SU'].includes(categoriaCodigo);
    crmFilialTrigger.disabled = true;
    crmFilialTrigger.textContent = 'Carregando filiais...';

    try {
        const params = new URLSearchParams({
            categoria: categoriaCodigo,
            idfuncionario: usuarioLogado.idfuncionario || '',
            idfilial: usuarioLogado.idfilial || ''
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
            });
        }
    } catch (error) {
        crmFilialTrigger.textContent = 'Erro ao carregar filiais';
        crmFilialReadonly.textContent = 'Erro ao carregar filiais';
        crmFilialTrigger.hidden = true;
        crmFilialReadonly.hidden = false;
    }
}

inicializarPeriodo();
carregarFiliais();
document.addEventListener('click', event => {
    if (!crmFilialPanel || crmFilialPanel.hidden) return;
    if (event.target.closest('[data-filial-multiselect]')) return;
    crmFilialPanel.hidden = true;
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
            const filialContexto = String(getFilialSelecionada() || filialId).trim().toUpperCase();
            const themeName = config.branches?.[filialContexto] || config.defaultTheme || 'casaterrazi';
            budgetPage = config.budgetPages?.[themeName] || config.themes?.[themeName]?.budgetPage || budgetPage;
        }
    } catch (error) {
        budgetPage = 'index.html';
    }

    if (!budgetFrame.src.endsWith(budgetPage)) {
        budgetFrame.src = budgetPage;
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

