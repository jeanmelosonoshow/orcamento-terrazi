// script-lista.js

async function carregarHistorico() {
    const grid = document.getElementById('orcamentosGrid');
    
    try {
        const response = await fetch('/api/listar-orcamentos');
        const orcamentos = await response.json();

        if (orcamentos.length === 0) {
            grid.innerHTML = '<div class="loader">Nenhum orçamento encontrado.</div>';
            return;
        }

        // Armazena globalmente para o filtro funcionar
        window.todosOrcamentos = orcamentos;
        
        // Renderiza os cards
        renderizarCards(orcamentos);

    } catch (error) {
        console.error("Erro ao carregar:", error);
        grid.innerHTML = '<div class="loader" style="color: red;">Erro ao carregar histórico.</div>';
    }
}

function renderizarCards(lista) {
    const grid = document.getElementById('orcamentosGrid');
    grid.innerHTML = '';

    lista.forEach(o => {
        // Define se o orçamento permite alteração de status
        const ehPendente = o.status === 'Pendente';
        
        // Normaliza o status para classes CSS (ex: "Gerou Venda" vira "gerou-venda")
        const statusClass = o.status.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s/g, '-');
        
        const dataFormatada = new Date(o.data_criacao).toLocaleDateString('pt-BR');
        
        const card = document.createElement('div');
        card.className = `orcamento-card status-${statusClass}`;
        card.innerHTML = `
            <div class="card-header">
                <span class="id-orcamento">#${o.id}</span>
                <span class="data-orcamento">${dataFormatada}</span>
            </div>
            
            <div class="card-body">
                <h3 class="cliente-nome">${o.cliente_nome || 'Consumidor'}</h3>
                <p class="vendedor-info">Vendedor: <strong>${o.vendedor_nome || 'Geral'}</strong></p>
                <div class="status-badge">${o.status.toUpperCase()}</div>
            </div>

            <div class="card-footer">
                <div class="total-valor">
                    <span class="label">Total</span>
                    <span class="valor">R$ ${parseFloat(o.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
                
                <div class="acoes-grid">
                    ${ehPendente ? `
                        <select onchange="alterarStatus(${o.id}, this.value)" class="select-status-inline">
                            <option value="" disabled selected>Alterar Status</option>
                            <option value="Gerou Venda">Gerou Venda</option>
                            <option value="Cancelado">Cancelado</option>
                        </select>
                    ` : `<div class="status-fechado-msg">Status Finalizado</div>`}

                    <button onclick="clonarOrcamento(${o.id})" class="btn-clonar" title="Clonar Orçamento">
                        REABRIR / CLONAR
                    </button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Funções Globais de Ação
window.alterarStatus = async (id, novoStatus) => {
    if (!novoStatus) return;

    const confirmar = confirm(`Deseja alterar o status para "${novoStatus}"? Esta ação não pode ser desfeita.`);
    if (!confirmar) {
        location.reload();
        return;
    }

    try {
        const res = await fetch('/api/status-orcamento', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: novoStatus })
        });
        
        if (res.ok) {
            alert("Status atualizado!");
            carregarHistorico(); // Recarrega a lista
        } else {
            const err = await res.json();
            alert(`Erro: ${err.error}`);
            location.reload();
        }
    } catch (error) {
        alert("Erro ao conectar com o servidor.");
    }
};

window.clonarOrcamento = async (id) => {
    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const orcamento = await res.json();
        localStorage.setItem('clonar_orcamento', JSON.stringify(orcamento));
        window.location.href = 'index.html';
    } catch (error) {
        alert("Erro ao recuperar dados para clonagem.");
    }
};

window.filtrarCards = () => {
    const termo = document.getElementById('filterInput').value.toLowerCase();
    const status = document.getElementById('statusFilter').value;
    
    const filtrados = window.todosOrcamentos.filter(o => {
        const bateNome = (o.cliente_nome || "").toLowerCase().includes(termo);
        const bateDoc = (o.cliente_doc || "").includes(termo);
        const bateStatus = status === "" || o.status === status;
        return (bateNome || bateDoc) && bateStatus;
    });

    renderizarCards(filtrados);
};

document.addEventListener('DOMContentLoaded', carregarHistorico);
