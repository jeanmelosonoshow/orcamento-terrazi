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
const crmSellerFilter = document.querySelector('[data-seller-filter]');
const crmVendedorTrigger = document.querySelector('[data-vendedor-trigger]');
const crmVendedorPanel = document.querySelector('[data-vendedor-panel]');
const crmVendedorSearch = document.querySelector('[data-vendedor-search]');
const crmVendedorOptions = document.querySelector('[data-vendedor-options]');

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
        setVendedoresSelecionados(usuarioLogado.idvendedor ? [usuarioLogado.idvendedor] : []);
        return;
    }

    crmSellerFilter.hidden = false;
    crmVendedorTrigger.disabled = true;
    crmVendedorTrigger.textContent = 'Carregando vendedores...';

    try {
        const params = new URLSearchParams({
            categoria: categoriaCodigo,
            idfuncionario: usuarioLogado.idfuncionario || '',
            idfilial: usuarioLogado.idfilial || ''
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
carregarVendedores();
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










