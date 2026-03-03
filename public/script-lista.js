const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioLogado'));

if (!usuarioLogado) {
    window.location.href = 'login.html';
}

async function carregarHistorico() {
    const grid = document.getElementById('orcamentosGrid');
    
    // Filtros de hierarquia automáticos enviados para a API
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
        card.className = `orcamento-card status-${o.status.toLowerCase()}`;
        card.innerHTML = `
            <div class="card-header"><span>#${o.id}</span> <span>${new Date(o.data_criacao).toLocaleDateString()}</span></div>
            <div class="card-body">
                <h3>${o.cliente_nome || 'Consumidor'}</h3>
                <p>Vendedor: ${o.vendedor_nome}</p>
                <p style="font-size:10px;">Filial: ${o.id_filial || '---'}</p>
                <div class="total">R$ ${parseFloat(o.valor_total).toLocaleString('pt-BR')}</div>
            </div>
            <div class="card-footer">
                <button onclick="clonarOrcamento(${o.id})">REABRIR / CLONAR</button>
                <button onclick="gerarImpressao(${o.id}, '${o.status}')">IMPRIMIR</button>
            </div>`;
        grid.appendChild(card);
    });
}

window.clonarOrcamento = async (id) => {
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
            <button onclick="fazerLogout()" style="margin-left:15px; background:#c0392b; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;">Sair</button>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    exibirUsuarioLogado();
    carregarHistorico();
});
