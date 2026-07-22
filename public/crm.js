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
const crmUserInitials = document.getElementById('crmUserInitials');
const crmFilialSelect = document.querySelector('[data-filial-select]');
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

function getFilialSelecionada() {
    return sessionStorage.getItem('crmFilialSelecionada') || filialId;
}

function setFilialSelecionada(filial) {
    if (!filial) return;
    sessionStorage.setItem('crmFilialSelecionada', String(filial));
}

if (crmUserName) crmUserName.textContent = nome;
if (crmUserMeta) crmUserMeta.textContent = categoria;
if (crmUserInitials) crmUserInitials.textContent = obterIniciais(nome);

async function carregarFiliais() {
    if (!crmFilialSelect || !crmFilialReadonly) return;

    const podeSelecionar = ['DI', 'SU'].includes(categoriaCodigo);
    crmFilialSelect.disabled = true;
    crmFilialSelect.innerHTML = '<option value="">Carregando filiais...</option>';

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
            crmFilialSelect.innerHTML = `<option value="${usuarioLogado.idfilial || ''}">${fallbackNome}</option>`;
            crmFilialReadonly.textContent = fallbackNome || 'Filial não encontrada';
            crmFilialSelect.hidden = true;
            crmFilialReadonly.hidden = false;
            return;
        }

        const filialAtual = filiais.find(filial => String(filial.idfilial).toUpperCase() === String(getFilialSelecionada()).toUpperCase()) || filiais[0];
        setFilialSelecionada(filialAtual.idfilial);
        definirPaginaOrcamento();

        crmFilialSelect.innerHTML = filiais.map(filial => {
            const selected = String(filial.idfilial).toUpperCase() === String(filialAtual.idfilial).toUpperCase() ? ' selected' : '';
            return `<option value="${filial.idfilial}"${selected}>${filial.nomefilial}</option>`;
        }).join('');

        crmFilialReadonly.textContent = filialAtual.nomefilial;

        if (podeSelecionar) {
            crmFilialSelect.hidden = false;
            crmFilialReadonly.hidden = true;
            crmFilialSelect.disabled = false;
        } else {
            crmFilialSelect.hidden = true;
            crmFilialReadonly.hidden = false;
        }
    } catch (error) {
        crmFilialSelect.innerHTML = '<option value="">Erro ao carregar filiais</option>';
        crmFilialReadonly.textContent = 'Erro ao carregar filiais';
        crmFilialSelect.hidden = true;
        crmFilialReadonly.hidden = false;
    }
}

if (crmFilialSelect) {
    crmFilialSelect.addEventListener('change', () => {
        setFilialSelecionada(crmFilialSelect.value);
        definirPaginaOrcamento();
    });
}

carregarFiliais();
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

