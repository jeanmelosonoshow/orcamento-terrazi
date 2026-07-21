const usuarioLogadoRaw = sessionStorage.getItem('usuarioLogado');
if (!usuarioLogadoRaw) {
    window.location.href = 'login.html';
}

const usuarioLogado = JSON.parse(usuarioLogadoRaw || '{}');
const nome = usuarioLogado.nomefuncionario || usuarioLogado.nome || 'Usuário';
const filial = usuarioLogado.idfilial ? `Filial: ${usuarioLogado.idfilial}` : 'Casa Terrazi';
const categoria = usuarioLogado.categoria || 'Vendedor';

document.getElementById('crmUserName').textContent = nome;
document.getElementById('crmUserMeta').textContent = `${filial} · ${categoria}`;
document.getElementById('crmUserRole').textContent = categoria;

window.fazerLogout = () => {
    sessionStorage.clear();
    window.location.href = 'login.html';
};
const viewLinks = Array.from(document.querySelectorAll('[data-crm-view-link]'));
const views = Array.from(document.querySelectorAll('[data-crm-view]'));

function obterViewPorHash(hash) {
    return hash === '#orcamentos' ? 'orcamentos' : 'visao-geral';
}

function ativarView(viewName, hash = window.location.hash || '#visao-geral') {
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