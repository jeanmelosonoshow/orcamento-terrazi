const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioLogado'));
if (!usuarioLogado) { window.location.href = 'login.html'; }

window.todosOrcamentos = []; 
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";

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

// FUNÇÃO DE FILTRAGEM CORRIGIDA
function filtrarOrcamentos() {
    // Captura o termo de busca e remove espaços extras
    const termo = (document.getElementById('searchInput')?.value || "").toLowerCase().trim();
    const filtroStatus = document.getElementById('statusFilter')?.value.toUpperCase() || "TODOS";
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const filtrados = window.todosOrcamentos.filter(o => {
        // 1. Lógica de Status (Calcula EXPIRADO em tempo real)
        let statusFinal = (o.status || 'PENDENTE').trim().toUpperCase();
        if (o.data_validade || o.valid_until) {
            const dataRaw = o.data_validade || o.valid_until;
            const partes = dataRaw.split('T')[0].split('-');
            const dataVal = new Date(partes[0], partes[1] - 1, partes[2]);
            dataVal.setHours(0, 0, 0, 0);
            if (dataVal < hoje && statusFinal === 'PENDENTE') statusFinal = 'EXPIRADO';
        }

        // 2. Lógica de busca por texto (Nome, ID ou CPF)
        // Criamos uma string única com os dados do orçamento para facilitar a busca
        const nomeCliente = (o.cliente_nome || o.nome_cliente || "").toLowerCase();
        const documento = (o.cliente_doc || o.cpf || o.cnpj || "").toString().toLowerCase().replace(/[^\d]/g, ''); // Apenas números do CPF
        const idOrcamento = (o.id || "").toString();
        
        // Se o usuário digitou apenas números, tentamos bater com CPF limpo ou ID
        const termoLimpo = termo.replace(/[^\d]/g, '');
        
        const bateTexto = termo === "" || 
                         nomeCliente.includes(termo) || 
                         idOrcamento.includes(termo) || 
                         (termoLimpo !== "" && documento.includes(termoLimpo));
        
        // 3. Lógica de filtro por status dropdown
        const bateStatus = (filtroStatus === "TODOS") || (statusFinal === filtroStatus);

        return bateTexto && bateStatus;
    });

    renderizarCards(filtrados);
}

function renderizarCards(lista) {
    const grid = document.getElementById('orcamentosGrid');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); 
    grid.innerHTML = '';

    lista.forEach(o => {
        let dataExibicao = "Sem data";
        let dataValidade = null;
        
        if (o.data_validade || o.valid_until) {
            const dataRaw = o.data_validade || o.valid_until;
            const partes = dataRaw.split('T')[0].split('-'); 
            dataValidade = new Date(partes[0], partes[1] - 1, partes[2]);
            dataValidade.setHours(0, 0, 0, 0);
            dataExibicao = dataValidade.toLocaleDateString('pt-BR');
        }
        
        let statusFinal = (o.status || 'Pendente').trim().toUpperCase();
        if (dataValidade && dataValidade < hoje && statusFinal === 'PENDENTE') {
            statusFinal = 'EXPIRADO';
        }

        let badgeColor = "#856404"; let badgeBg = "#fff3cd"; 
        if (statusFinal === 'EXPIRADO' || statusFinal === 'CANCELADO') {
            badgeColor = "#721c24"; badgeBg = "#f8d7da"; 
        } else if (statusFinal === 'GEROU VENDA' || statusFinal === 'VENDIDO' || statusFinal === 'FECHADO') {
            badgeColor = "#1A3017"; badgeBg = "#E8F5E9"; 
        }

        let statusHtml = `
            <div class="badge-status" style="margin-top:10px; display:inline-block; padding:4px 12px; border-radius:12px; font-size:10px; font-weight:bold; text-transform:uppercase; color: ${badgeColor}; background-color: ${badgeBg};">
                ${statusFinal}
            </div>`;

        if (statusFinal === 'PENDENTE') {
            statusHtml = `
                <select onchange="alterarStatusOrcamento(this, ${o.id})" style="margin-top:10px; padding:4px 8px; border-radius:12px; font-size:10px; font-weight:bold; border: 1px solid #856404; background: #fff3cd; color: #856404; cursor:pointer;">
                    <option value="PENDENTE" selected>PENDENTE</option>
                    <option value="GEROU VENDA">GEROU VENDA</option>
                    <option value="CANCELADO">CANCELADO</option>
                </select>`;
        }

        const card = document.createElement('div');
        card.className = `orcamento-card status-${statusFinal.toLowerCase().replace(/\s+/g, '-')}`; 
        card.innerHTML = `
            <div class="card-header">
                <span>#${o.id}</span> 
                <span style="font-size:11px; font-weight:600;">Validade: ${dataExibicao}</span>
            </div>
            <div class="card-body">
                <h3 style="margin: 0 0 5px 0; font-size: 16px; color: #1A3017;">${o.cliente_nome || 'Consumidor'}</h3>
                <p style="font-size: 12px; color: #666; margin-bottom: 2px;">Vendedor: ${o.vendedor_nome}</p>
                ${o.cliente_doc ? `<p style="font-size: 11px; color: #888; margin-bottom: 2px;">CPF/CNPJ: ${o.cliente_doc}</p>` : ''}
                ${o.telefone_cliente ? `<p style="font-size: 11px; color: #888; margin-bottom: 10px;">Telefone: ${o.telefone_cliente}</p>` : ''}
                <div class="total" style="font-size: 18px; font-weight: 700; color: #1A3017;">
                    R$ ${parseFloat(o.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </div>
                ${statusHtml}
            </div>
            <div class="card-footer" style="display:flex; gap:8px; padding: 12px; background: #f9f9f9; border-top: 1px solid #eee;">
                <button class="btn-reabrir" onclick="clonagemRapida(this, ${o.id})" style="flex:1; background:#1A3017; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:600;">REABRIR</button>
                <button class="btn-imprimir" onclick="gerarImpressaoRapida(this, ${o.id})" style="flex:1; background:white; color:#1A3017; border:1px solid #1A3017; padding:8px; border-radius:4px; cursor:pointer; font-weight:600;">IMPRIMIR</button>
            </div>`;
        grid.appendChild(card);
    });
}

// Funções de ação (Status, Clone, Impressão) permanecem iguais...
window.alterarStatusOrcamento = async (select, id) => {
    const novoStatus = select.value;
    if (novoStatus === 'PENDENTE') return;
    if (!confirm(`Deseja alterar o status do orçamento #${id} para ${novoStatus}?`)) {
        select.value = 'PENDENTE';
        return;
    }
    select.disabled = true;
    try {
        const response = await fetch('/api/status-orcamento', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: novoStatus })
        });
        if (response.ok) {
            carregarHistorico();
        } else {
            const err = await response.json();
            alert("Erro: " + (err.error || "Não foi possível alterar."));
            carregarHistorico();
        }
    } catch (e) {
        alert("Erro na conexão com o servidor.");
        select.disabled = false;
    }
};

window.clonagemRapida = async (btn, id) => {
    const originalText = btn.innerText;
    btn.innerText = "AGUARDE...";
    btn.disabled = true;
    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const orcamento = await res.json();
        localStorage.setItem('clonar_orcamento', JSON.stringify(orcamento));
        window.location.href = 'index.html';
    } catch (e) {
        alert("Erro ao reabrir.");
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

window.gerarImpressaoRapida = async (btn, id) => {
    const originalText = btn.innerText;
    btn.innerText = "AGUARDE...";
    btn.disabled = true;
    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const data = await res.json();
        
        const nomeClienteFinanceiro = (data.cliente_nome || 'Consumidor').replace(/[/\\?%*:|"<>]/g, '-');
        const nomeArquivo = `Orcamento_${data.id}_${nomeClienteFinanceiro}.pdf`;

        const element = document.createElement('div');
        const dataValidade = data.data_validade ? new Date(data.data_validade.split('T')[0] + 'T03:00').toLocaleDateString('pt-BR') : 'A consultar';
        const dataEmissao = data.data_criacao ? new Date(data.data_criacao).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');

        let html = `
        <style>
            .pdf-body { font-family: 'Helvetica', sans-serif; color: #1a1a1a; padding: 40px 40px 60px 60px; position: relative; background: white; width: 520pt; box-sizing: border-box; }
            .brand-sidebar { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: #1A3017; }
            .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3017; padding-bottom: 10px; margin-bottom: 20px; }
            .order-id { font-size: 24px; font-weight: bold; color: #1A3017; }
            .header-meta { font-size: 10px; color: #666; text-align: right; }
            .info-box { background: #f9f9f9; padding: 15px; border-radius: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 10px; border: 1px solid #eee; margin-bottom: 25px; }
            .product-block { width: 100%; page-break-inside: avoid; margin-bottom: 30px; border-bottom: 1px solid #f0f0f0; padding-bottom: 20px; }
            .product-flex { display: flex; gap: 25px; }
            .col-left { width: 180px; flex-shrink: 0; }
            .col-right { flex: 1; }
            .img-main { width: 180px; height: 180px; object-fit: cover; border-radius: 4px; margin-bottom: 10px; }
            .dim-box { font-size: 9px; color: #1A3017; background: #F4F9F4; padding: 10px; border-radius: 4px; line-height: 1.3; }
            .prod-title { font-size: 18px; font-weight: bold; text-transform: uppercase; color: #1A3017; margin: 0; }
            .emocional-text { font-size: 11px; line-height: 1.5; color: #444; margin-bottom: 12px; text-align: justify; font-style: italic; }
            .specs-box { font-size: 10px; border-top: 1px dashed #ccc; padding-top: 10px; color: #555; line-height: 1.4; }
            .price-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .price-table td { border: 1px solid #eee; padding: 8px; text-align: center; font-size: 11px; font-weight: bold; }
            .label-cell { background: #fafafa; font-size: 8px; color: #999; text-transform: uppercase; }
            .total-destaque { background: #1A3017; color: white; padding: 15px 20px; text-align: right; font-size: 20px; font-weight: bold; border-radius: 4px; margin-top: 10px; }
            .inst-text { font-size: 9px; color: #555; line-height: 1.5; text-align: justify; margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px; }
            .footer-container { page-break-inside: avoid; margin-top: 20px; padding-bottom: 20px; }
        </style>
        <div class="pdf-body">
            <div class="brand-sidebar"></div>
            <div class="pdf-header">
                <img src="${LOGO_URL}" style="height: 50px;">
                <div class="header-meta">
                    <div class="order-id">ORÇAMENTO #${data.id}</div>
                    <strong style="color: #1A3017;">FILIAL: ${data.idfilial || usuarioLogado.idfilial}</strong><br>
                    Emissão: ${dataEmissao} | Validade: ${dataValidade}
                </div>
            </div>
            <div class="info-box">
                <div><strong>CLIENTE:</strong><br>${data.cliente_nome || 'Consumidor'}<br>DOC: ${data.cliente_doc || '---'}<br>TEL: ${data.telefone_cliente || '---'}</div>
                <div><strong>VENDEDOR:</strong><br>${data.vendedor_nome}<br>CONTATO: ${data.vendedor_contato || '---'}</div>
            </div>`;

        data.items.forEach(item => {
            const limparTxt = (t) => t ? t.replace(/<\/?[^>]+(>|$)/g, "").trim() : "";
            let raw = item.descricao_tecnica || item.description || "";
            
            let parts = raw.split(/(características|medidas|dimensões|especificações|técnico)/i);
            let emocional = limparTxt(parts[0]);
            let tecnico = ""; 
            let dimensoes = "";

            for (let i = 1; i < parts.length; i += 2) {
                let label = parts[i].toLowerCase();
                let content = limparTxt(parts[i+1]);
                if (label.includes("dimensões") || label.includes("medidas")) {
                    dimensoes += content + " ";
                } else {
                    tecnico += content + " ";
                }
            }

            html += `
            <div class="product-block">
                <div class="product-flex">
                    <div class="col-left">
                        <img src="${item.imagem_url || item.image}" class="img-main">
                        ${dimensoes ? `
                            <div class="dim-box">
                                <strong>DIMENSÕES:</strong><br>${dimensoes}<br>
                                
                            </div>` : ''}
                    </div>
                    <div class="col-right">
                        <h2 class="prod-title">${item.nome_produto || item.displayName}</h2>
                        <div class="emocional-text">${emocional}</div>
                        
                        ${tecnico ? `<div class="specs-box"><strong>CARACTERÍSTICAS:</strong><br>${tecnico}</div>` : ''}
                        
                        ${item.variacao ? `<div style="font-size:11px; font-weight:bold; color:#1A3017; margin:8px 0; text-transform:uppercase;">VARIAÇÃO: ${item.variacao}</div>` : ''}
                        <span style="font-size:9px; color:#999; display:block; margin-bottom:10px;">SKU: ${item.sku || '---'}</span>
                        
                        <table class="price-table">
                            <tr><td class="label-cell">Qtd</td><td class="label-cell">Valor Unitário</td><td class="label-cell">Subtotal</td></tr>
                            <tr>
                                <td>${item.quantidade}</td>
                                <td>R$ ${parseFloat(item.preco_unitario).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                <td>R$ ${(item.quantidade * item.preco_unitario).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>`;
        });

        html += `
            <div class="footer-container">
                ${data.obs_geral ? `<div style="font-size: 10px; background: #fdfdfd; padding: 10px; border: 1px solid #eee; margin-bottom: 5px;"><strong>OBSERVAÇÕES:</strong><br>${data.obs_geral}</div>` : ''}
                
                <div class="total-destaque">TOTAL GERAL: R$ ${parseFloat(data.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>

                <div class="inst-text">
                    <p><strong>INFORMAÇÕES ADICIONAIS:</strong> *itens decorativos que aparecem na ambientação não acompanham a compra.</p>
                    <p>cada peça da casa terrazi é fruto do design brasileiro, criada e produzida integralmente no brasil. valorizamos a produção local, o talento dos nossos profissionais e a qualidade que só o olhar atento de quem entende do próprio território pode oferecer. ao escolher um dos nossos móveis, você leva para casa não apenas sofisticação e funcionalidade, mas também uma história feita aqui — com originalidade, cuidado e identidade brasileira.</p>
                </div>
            </div>
        </div>`;

        element.innerHTML = html;
        const opt = {
            margin: [30, 0, 30, 0],
            filename: nomeArquivo,
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(element).save().then(function () {
            btn.innerText = originalText;
            btn.disabled = false;
        });
    } catch (e) {
        console.error(e);
        alert("Erro ao imprimir.");
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

window.fazerLogout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };

function exibirUsuarioLogado() {
    const infoTopo = document.getElementById('user-info-topo');
    if (infoTopo && usuarioLogado) {
        infoTopo.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px; width:100%;">
                <span><strong>Vendedor:</strong> ${usuarioLogado.nomefuncionario} | </span>
                <span><strong>Filial:</strong> ${usuarioLogado.idfilial} | </span>
                <span><strong>Categoria:</strong> ${usuarioLogado.categoria}  </span>
                <div style="flex-grow:1"></div>
                <button onclick="fazerLogout()" style="background:#c0392b; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-weight:bold;">SAIR</button>
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    exibirUsuarioLogado();
    carregarHistorico();

    // Eventos para busca e filtro
    document.getElementById('searchInput')?.addEventListener('input', filtrarOrcamentos);
    document.getElementById('statusFilter')?.addEventListener('change', filtrarOrcamentos);
});
