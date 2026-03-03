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
        
        // Normaliza o status para classes CSS
        const statusClass = o.status.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s/g, '-');
        
        // Datas formatadas
        const dataCriacao = new Date(o.data_criacao).toLocaleDateString('pt-BR');
        const dataValidade = o.data_validade ? new Date(o.data_validade).toLocaleDateString('pt-BR') : '---';
        
        const card = document.createElement('div');
        card.className = `orcamento-card status-${statusClass}`;
        card.innerHTML = `
            <div class="card-header">
                <span class="id-orcamento">#${o.id}</span>
                <span class="data-orcamento">${dataCriacao}</span>
            </div>
            
            <div class="card-body">
                <h3 class="cliente-nome">${o.cliente_nome || 'Consumidor'}</h3>
                <p class="vendedor-info">Vendedor: <strong>${o.vendedor_nome || 'Geral'}</strong></p>
                <div class="status-badge">${o.status.toUpperCase()}</div>
            </div>

            <div class="card-footer">
                <div class="validade-row" style="font-size: 0.75rem; color: #999; margin-bottom: 8px; border-bottom: 1px solid #f5f5f5; padding-bottom: 5px;">
                    Validade: <strong style="color: #444;">${dataValidade}</strong>
                </div>

                <div class="total-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <span class="total-label" style="font-size: 0.8rem; color: #888; font-weight: 500;">TOTAL</span>
                    <span class="total-valor-bold" style="font-size: 1.25rem; font-weight: 700; color: #1A3017;">
                        R$ ${parseFloat(o.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </span>
                </div>
                
                <div class="acoes-grid">
                    ${ehPendente ? `
                        <select onchange="alterarStatus(${o.id}, this.value)" class="select-status-inline">
                            <option value="" disabled selected>Alterar Status</option>
                            <option value="Gerou Venda">Gerou Venda</option>
                            <option value="Cancelado">Cancelado</option>
                        </select>
                    ` : `<div class="status-fechado-msg" style="text-align: center; font-size: 0.7rem; color: #999; padding: 8px; background: #f9f9f9; border-radius: 4px; font-style: italic;">Status Finalizado</div>`}

                    <div class="botoes-acoes-row" style="display: flex; gap: 8px; margin-top: 8px;">
                        <button onclick="gerarImpressao(${o.id}, '${o.status}')" class="btn-imprimir" style="flex: 1; background: white; border: 1px solid #1A3017; color: #1A3017; padding: 10px; border-radius: 4px; font-weight: 600; font-size: 0.7rem; cursor: pointer;">
                            IMPRIMIR
                        </button>
                        <button onclick="clonarOrcamento(${o.id})" class="btn-clonar" style="flex: 1.5; background: #1A3017; color: white; border: none; padding: 10px; border-radius: 4px; font-weight: 600; font-size: 0.7rem; cursor: pointer;">
                            REABRIR / CLONAR
                        </button>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Nova Função de Impressão (Abre em nova aba com status atual)
window.gerarImpressao = (id, statusAtual) => {
    // Passamos o ID e o Status para que o PDF reflita se já foi vendido, cancelado, etc.
    const url = `/api/gerar-pdf?id=${id}&status=${encodeURIComponent(statusAtual)}&view=true`;
    window.open(url, '_blank');
};

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
            carregarHistorico(); 
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
    const statusSelect = document.getElementById('statusFilter');
    const termo = document.getElementById('filterInput').value.toLowerCase();
    const status = statusSelect.value;
    
    statusSelect.style.backgroundColor = "white";
    if (status === "Pendente") statusSelect.style.backgroundColor = "#fff9db";
    if (status === "Gerou Venda") statusSelect.style.backgroundColor = "#E8F5E9";
    if (status === "Cancelado") statusSelect.style.backgroundColor = "#fff5f5";
    if (status === "Expirado") statusSelect.style.backgroundColor = "#f1f3f5";

    const filtrados = window.todosOrcamentos.filter(o => {
        const bateNome = (o.cliente_nome || "").toLowerCase().includes(termo);
        const bateDoc = (o.cliente_doc || "").includes(termo);
        const bateStatus = status === "" || o.status === status;
        return (bateNome || bateDoc) && bateStatus;
    });

    renderizarCards(filtrados);
};

document.addEventListener('DOMContentLoaded', carregarHistorico);
