const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioLogado'));
if (!usuarioLogado) { window.location.href = 'login.html'; }

window.todosOrcamentos = []; // Cache para o filtro funcionar

async function carregarHistorico() {
    const grid = document.getElementById('orcamentosGrid');
    const params = new URLSearchParams({
        categoria: usuarioLogado.categoria,
        idfuncionario: usuarioLogado.idfuncionario,
        idfilial: usuarioLogado.idfilial
    });

    try {
        const response = await fetch(`/api/listar-orcamentos?${params.toString()}`);
        const orcamentos = await response.json();
        
        if (!orcamentos || orcamentos.length === 0) {
            grid.innerHTML = '<p>Nenhum orçamento encontrado.</p>';
            return;
        }
        window.todosOrcamentos = orcamentos;
        renderizarCards(orcamentos);
    } catch (error) {
        grid.innerHTML = '<p style="color:red;">Erro ao carregar histórico.</p>';
    }
}

function renderizarCards(lista) {
    const grid = document.getElementById('orcamentosGrid');
    grid.innerHTML = '';
    lista.forEach(o => {
        const card = document.createElement('div');
        card.className = `orcamento-card status-${(o.status || 'pendente').toLowerCase()}`;
        card.innerHTML = `
            <div class="card-header"><span>#${o.id}</span> <span>${new Date(o.data_criacao).toLocaleDateString()}</span></div>
            <div class="card-body">
                <h3>${o.cliente_nome || 'Consumidor'}</h3>
                <p>Vendedor: ${o.vendedor_nome}</p>
                <p style="font-size:10px;">Filial: ${o.id_filial || '---'}</p>
                <div class="total">R$ ${parseFloat(o.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
            </div>
            <div class="card-footer">
                <button onclick="clonagemRapida(${o.id})">REABRIR / CLONAR</button>
            </div>`;
        grid.appendChild(card);
    });
}

// FUNÇÃO DE FILTRO GLOBAL (Correção da funcionalidade)
window.filtrarCards = () => {
    const termo = document.getElementById('filterInput').value.toLowerCase().trim();
    const status = document.getElementById('statusFilter').value;

    // Se não houver termo nem status, mostra tudo original
    if (termo === "" && status === "") {
        renderizarCards(window.todosOrcamentos);
        return;
    }

    const filtrados = window.todosOrcamentos.filter(o => {
        const nomeCliente = (o.cliente_nome || "").toLowerCase();
        const docCliente = (o.cliente_doc || "").toLowerCase();
        const bateTexto = nomeCliente.includes(termo) || docCliente.includes(termo);
        const bateStatus = status === "" || o.status === status;
        return bateTexto && bateStatus;
    });

    renderizarCards(filtrados);
};

window.clonagemRapida = async (id) => {
    const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
    const orcamento = await res.json();
    localStorage.setItem('clonar_orcamento', JSON.stringify(orcamento));
    window.location.href = 'index.html';
};

window.fazerLogout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };

function exibirUsuarioLogado() {
    const infoTopo = document.getElementById('user-info-topo');
    if (infoTopo && usuarioLogado) {
        infoTopo.innerHTML = `
            <span><strong>Vendedor:</strong> ${usuarioLogado.nomefuncionario}</span> | 
            <span><strong>Categoria:</strong> ${usuarioLogado.categoria}</span> | 
            <span><strong>Filial:</strong> ${usuarioLogado.idfilial}</span>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    exibirUsuarioLogado();
    carregarHistorico();
});
