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
        window.todosOrcamentos = orcamentos;
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
        const ehPendente = o.status === 'Pendente';
        const statusClass = o.status.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s/g, '-');
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
                        R$ ${parseFloat(o.valor_total || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
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

// FUNÇÃO DE IMPRESSÃO COMPILADA E CORRIGIDA
window.gerarImpressao = async (id, statusAtual) => {
    try {
        const response = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const orcamento = await response.json();
        
        if (!orcamento) return alert("Erro ao carregar dados.");

        // Salva os dados no localStorage
        orcamento.status_atual = statusAtual;
        orcamento.id_impressao = id;
        localStorage.setItem('clonar_orcamento', JSON.stringify(orcamento));
        
        // Criar iframe "invisível" mas renderizável
        const iframe = document.createElement('iframe');
        iframe.id = 'print-helper-frame';
        iframe.style.position = 'fixed';
        iframe.style.bottom = '0';
        iframe.style.right = '0';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.opacity = '0.01'; // Quase invisível, mas existe para o browser
        iframe.style.border = 'none';
        
        iframe.src = 'index.html?modo=impressao';
        document.body.appendChild(iframe);

        // Limpeza após o download
        setTimeout(() => {
            if (document.getElementById('print-helper-frame')) {
                document.body.removeChild(iframe);
            }
        }, 15000); // Tempo para garantir o processamento

    } catch (error) {
        console.error("Erro ao preparar impressão:", error);
    }
};

window.alterarStatus = async (id, novoStatus) => {
    if (!novoStatus) return;
    if (!confirm(`Deseja alterar para "${novoStatus}"?`)) { location.reload(); return; }
    try {
        const res = await fetch('/api/status-orcamento', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: novoStatus })
        });
        if (res.ok) { alert("Status atualizado!"); carregarHistorico(); }
    } catch (error) { alert("Erro de conexão."); }
};

window.clonarOrcamento = async (id) => {
    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const orcamento = await res.json();
        localStorage.setItem('clonar_orcamento', JSON.stringify(orcamento));
        window.location.href = 'index.html';
    } catch (error) { alert("Erro ao clonar."); }
};

window.filtrarCards = () => {
    const termo = document.getElementById('filterInput').value.toLowerCase();
    const status = document.getElementById('statusFilter').value;
    const filtrados = window.todosOrcamentos.filter(o => {
        const bateNome = (o.cliente_nome || "").toLowerCase().includes(termo);
        const bateStatus = status === "" || o.status === status;
        return bateNome && bateStatus;
    });
    renderizarCards(filtrados);
};

document.addEventListener('DOMContentLoaded', carregarHistorico);
