// script-lista.js

async function carregarHistorico() {
    const grid = document.getElementById('orcamentosGrid');
    const statusFilter = document.getElementById('statusFilter');
    
    try {
        const response = await fetch('/api/listar-orcamentos');
        const orcamentos = await response.json();

        if (orcamentos.length === 0) {
            grid.innerHTML = '<div class="loader">Nenhum orçamento encontrado.</div>';
            return;
        }

        // Renderiza os cards
        renderizarCards(orcamentos);

        // Armazena globalmente para o filtro funcionar sem nova requisição
        window.todosOrcamentos = orcamentos;

    } catch (error) {
        console.error("Erro ao carregar:", error);
        grid.innerHTML = '<div class="loader" style="color: red;">Erro ao carregar histórico.</div>';
    }
}

function renderizarCards(lista) {
    const grid = document.getElementById('orcamentosGrid');
    grid.innerHTML = '';

    lista.forEach(o => {
        // Ajuste de cores por status
        const statusClass = o.status.toLowerCase().replace(/\s/g, '-');
        
        // Formatação da data (Tratando data_criacao do seu banco)
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
                    <select onchange="alterarStatus(${o.id}, this.value)" class="select-status-inline">
                        <option value="" disabled selected>Alterar Status</option>
                        <option value="Finalizado com Venda">Venda</option>
                        <option value="Finalizado sem retorno">Sem Retorno</option>
                    </select>
                    <button onclick="clonarOrcamento(${o.id})" class="btn-clonar" title="Clonar Orçamento">
                        REABRIR / CLONAR
                    </button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Função de Filtro (Nome ou CPF)
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

// Inicializa
document.addEventListener('DOMContentLoaded', carregarHistorico);
