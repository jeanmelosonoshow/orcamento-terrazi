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

// Função de Impressão (Busca detalhes no banco e gera o PDF na hora)
window.gerarImpressao = async (id, statusAtual) => {
    try {
        const response = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const o = await response.json();

        if (!o || !o.itens) return alert("Erro ao carregar detalhes do orçamento.");

        const element = document.createElement('div');
        const dataValidade = o.data_validade ? new Date(o.data_validade).toLocaleDateString('pt-BR') : 'A consultar';
        
        // Mantendo a compatibilidade com a logo da index
        const LOGO_URL = window.LOGO_URL || "/logo.png"; 

        let html = `
            <style>
                .pdf-body { font-family: 'Helvetica', sans-serif; color: #1a1a1a; background: white; padding: 40px 40px 30px 60px; position: relative; }
                .brand-sidebar { position: absolute; left: 0; top: 0; bottom: 0; width: 8px; background: #1A3017; }
                .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3017; padding-bottom: 10px; margin-bottom: 20px; }
                .pdf-logo { height: 45px; }
                .header-info { text-align: right; font-size: 9px; color: #666; line-height: 1.4; }
                .info-box { background: #f9f9f9; padding: 12px; border-radius: 4px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 10px; border: 1px solid #eee; }
                .product-block { width: 100%; page-break-inside: avoid; margin-bottom: 25px; padding-top: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 15px; }
                .product-content { display: flex; gap: 20px; }
                .product-image { width: 150px; height: 150px; object-fit: cover; border-radius: 4px; }
                .product-title { font-size: 14px; font-weight: bold; color: #1A3017; margin: 0; text-transform: uppercase; }
                .item-price-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                .item-price-table td { font-size: 10px; padding: 6px; border: 1px solid #eee; text-align: center; font-weight: bold; }
                .td-label { background: #fafafa; font-size: 8px; color: #888; text-transform: uppercase; }
                
                /* Estilo do carimbo de status no cabeçalho */
                .status-carimbo { 
                    margin-top: 8px;
                    padding: 4px 8px;
                    border: 1.5px solid #1A3017;
                    color: #1A3017;
                    display: inline-block;
                    font-weight: 800;
                    font-size: 10px;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                }
            </style>
            <div class="pdf-body">
                <div class="brand-sidebar"></div>
                <div class="pdf-header">
                    <img src="${LOGO_URL}" class="pdf-logo">
                    <div class="header-info">
                        <strong>ORÇAMENTO TERRAZI #${o.id}</strong><br>
                        Emissão: ${new Date(o.data_criacao).toLocaleDateString('pt-BR')}<br>
                        Validade: ${dataValidade}<br>
                        <div class="status-carimbo">${statusAtual.toUpperCase()}</div>
                    </div>
                </div>
                <div class="info-box">
                    <div><strong>CLIENTE:</strong> ${o.cliente_nome || '---'}<br><strong>DOC:</strong> ${o.cliente_doc || '---'}</div>
                    <div><strong>VENDEDOR:</strong> ${o.vendedor_nome || '---'}<br><strong>CONTATO:</strong> ${o.vendedor_contato || '---'}</div>
                </div>`;

        o.itens.forEach(item => {
            html += `
                <div class="product-block">
                    <div class="product-content">
                        <img src="${item.image}" class="product-image">
                        <div style="flex: 1;">
                            <h2 class="product-title">${item.displayName || item.name}</h2>
                            <p style="font-size: 9px; margin: 5px 0; color: #555;">${item.description || ''}</p>
                            <table class="item-price-table">
                                <tr><td class="td-label">Qtd</td><td class="td-label">Unitário</td><td class="td-label">Subtotal</td></tr>
                                <tr>
                                    <td>${item.quantity}</td>
                                    <td>R$ ${parseFloat(item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                    <td>R$ ${(item.quantity * item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>`;
        });

        html += `
                <div style="background: #1A3017; color: white; padding: 15px; text-align: right; border-radius: 4px; margin-top: 20px;">
                    <span style="font-size: 18px; font-weight: bold;">TOTAL: R$ ${parseFloat(o.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
            </div>`;

        element.innerHTML = html;
        
        const opt = {
            margin: [20, 0, 20, 0],
            filename: `Terrazi_Orcamento_${o.id}.pdf`,
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
        };

        // Gera e abre em nova aba
        html2pdf().set(opt).from(element).toPdf().get('pdf').then(function (pdf) {
            window.open(pdf.output('bloburl'), '_blank');
        });

    } catch (error) {
        console.error("Erro:", error);
        alert("Erro ao gerar PDF.");
    }
};

window.alterarStatus = async (id, novoStatus) => {
    if (!novoStatus) return;
    if (!confirm(`Deseja alterar para "${novoStatus}"? Esta ação não pode ser desfeita.`)) { 
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
            alert("Erro ao atualizar status.");
        }
    } catch (error) { 
        alert("Erro de conexão com o servidor."); 
    }
};

window.clonarOrcamento = async (id) => {
    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const orcamento = await res.json();
        localStorage.setItem('clonar_orcamento', JSON.stringify(orcamento));
        window.location.href = 'index.html';
    } catch (error) { 
        alert("Erro ao clonar orçamento."); 
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

    const filtrados = window.todosOrcamentos.filter(o => {
        const bateNome = (o.cliente_nome || "").toLowerCase().includes(termo);
        const bateDoc = (o.cliente_doc || "").includes(termo);
        const bateStatus = status === "" || o.status === status;
        return (bateNome || bateDoc) && bateStatus;
    });
    renderizarCards(filtrados);
};

document.addEventListener('DOMContentLoaded', carregarHistorico);
