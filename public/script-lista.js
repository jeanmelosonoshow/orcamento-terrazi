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

        let badgeColor = "#856404"; 
        let badgeBg = "#fff3cd";    
        
        if (statusFinal === 'EXPIRADO' || statusFinal === 'CANCELADO') {
            badgeColor = "#721c24"; 
            badgeBg = "#f8d7da";    
        } else if (statusFinal === 'GEROU VENDA' || statusFinal === 'VENDIDO' || statusFinal === 'FECHADO') {
            badgeColor = "#1A3017"; 
            badgeBg = "#E8F5E9";    
        }

        const card = document.createElement('div');
        card.className = `orcamento-card`; 
        
        card.innerHTML = `
            <div class="card-header">
                <span>#${o.id}</span> 
                <span style="font-size:11px; font-weight:600;">Validade: ${dataExibicao}</span>
            </div>
            <div class="card-body">
                <h3 style="margin: 0 0 5px 0; font-size: 16px; color: #1A3017;">${o.cliente_nome || 'Consumidor'}</h3>
                <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Vendedor: ${o.vendedor_nome}</p>
                <div class="total" style="font-size: 18px; font-weight: 700; color: #1A3017;">
                    R$ ${parseFloat(o.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </div>
                <div class="badge-status" style="margin-top:10px; display:inline-block; padding:4px 12px; border-radius:12px; font-size:10px; font-weight:bold; text-transform:uppercase; color: ${badgeColor}; background-color: ${badgeBg};">
                    ${statusFinal}
                </div>
            </div>
            <div class="card-footer" style="display:flex; gap:8px; padding: 12px; background: #f9f9f9; border-top: 1px solid #eee;">
                <button class="btn-reabrir" onclick="clonagemRapida(this, ${o.id})" 
                    style="flex:1; background:#1A3017; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:600; transition: 0.3s;">REABRIR</button>
                <button class="btn-imprimir" onclick="gerarImpressaoRapida(this, ${o.id})" 
                    style="flex:1; background:white; color:#1A3017; border:1px solid #1A3017; padding:8px; border-radius:4px; cursor:pointer; font-weight:600; transition: 0.3s;">IMPRIMIR</button>
            </div>`;
        grid.appendChild(card);
    });
}

// 1. REABRIR COM ANIMAÇÃO
window.clonagemRapida = async (btn, id) => {
    const originalText = btn.innerText;
    btn.innerText = "CARREGANDO...";
    btn.disabled = true;
    btn.style.opacity = "0.7";

    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const orcamento = await res.json();
        localStorage.setItem('clonar_orcamento', JSON.stringify(orcamento));
        window.location.href = 'index.html';
    } catch (e) {
        alert("Erro ao reabrir.");
        btn.innerText = originalText;
        btn.disabled = false;
        btn.style.opacity = "1";
    }
};

// 2. IMPRIMIR INVISÍVEL E ABRIR EM NOVA ABA
window.gerarImpressaoRapida = async (btn, id) => {
    const originalText = btn.innerText;
    btn.innerText = "AGUARDE...";
    btn.disabled = true;
    btn.style.background = "#eee";

    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const data = await res.json();
        
        const element = document.createElement('div');
        const dataValidade = data.data_validade ? new Date(data.data_validade).toLocaleDateString('pt-BR') : 'A consultar';
        const dataEmissao = data.data_criacao ? new Date(data.data_criacao).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');

        let html = `
        <style>
            .pdf-body { font-family: 'Helvetica', sans-serif; color: #1a1a1a; padding: 40px 40px 30px 60px; position: relative; background: white; }
            .brand-sidebar { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: #1A3017; }
            .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3017; padding-bottom: 10px; margin-bottom: 20px; }
            .order-id { font-size: 24px; font-weight: bold; color: #1A3017; }
            .header-meta { font-size: 10px; color: #666; line-height: 1.4; text-align: right; }
            .info-box { background: #f9f9f9; padding: 15px; border-radius: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 10px; border: 1px solid #eee; margin-bottom: 25px; }
            .product-block { width: 100%; page-break-inside: avoid; margin-bottom: 35px; border-bottom: 1px solid #f0f0f0; padding-bottom: 20px; }
            .product-flex { display: flex; gap: 25px; }
            .col-left { width: 200px; flex-shrink: 0; }
            .col-right { flex: 1; }
            .img-main { width: 200px; height: 200px; object-fit: cover; border-radius: 4px; margin-bottom: 10px; }
            .dim-box { font-size: 9px; color: #1A3017; background: #F4F9F4; padding: 10px; border-radius: 4px; }
            .prod-title { font-size: 18px; font-weight: bold; text-transform: uppercase; color: #1A3017; margin: 0; }
            .variation-text { font-size: 11px; color: #1A3017; font-weight: bold; margin: 8px 0; text-transform: uppercase; }
            .sku-text { font-size: 9px; color: #999; margin-bottom: 10px; display: block; }
            .emocional-text { font-size: 11px; line-height: 1.5; color: #444; margin-bottom: 12px; text-align: justify; }
            .specs-box { font-size: 10px; border-top: 1px dashed #ccc; padding-top: 10px; color: #555; }
            .price-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .price-table td { border: 1px solid #eee; padding: 8px; text-align: center; font-size: 11px; font-weight: bold; }
            .label-cell { background: #fafafa; font-size: 8px; color: #999; text-transform: uppercase; }
        </style>
        <div class="pdf-body">
            <div class="brand-sidebar"></div>
            <div class="pdf-header">
                <img src="${LOGO_URL}" style="height: 50px;">
                <div class="header-meta">
                    <div class="order-id">ORÇAMENTO #${data.id}</div>
                    <strong style="color: #1A3017;">UNIDADE: ${data.idfilial || usuarioLogado.idfilial}</strong><br>
                    Emissão: ${dataEmissao} | Validade: ${dataValidade}
                </div>
            </div>
            <div class="info-box">
                <div><strong>CLIENTE:</strong><br>${data.cliente_nome || '---'}<br>DOC: ${data.cliente_doc || '---'}</div>
                <div><strong>VENDEDOR:</strong><br>${data.vendedor_nome}<br>CONTATO: ${data.vendedor_contato || '---'}</div>
            </div>`;

        data.items.forEach(item => {
            const limparTxt = (t) => t ? t.replace(/<\/?[^>]+(>|$)/g, "").trim() : "";
            let raw = item.descricao_tecnica || "";
            let parts = raw.split(/(características|medidas|dimensões|especificações)/i);
            let emocional = limparTxt(parts[0]);
            let tecnico = ""; let dimensoes = "";

            for (let i = 1; i < parts.length; i += 2) {
                let label = parts[i].toLowerCase();
                let content = limparTxt(parts[i+1]);
                if (label.includes("dimensões") || label.includes("medidas")) dimensoes += content + " ";
                else tecnico += content + " ";
            }

            html += `
            <div class="product-block">
                <div class="product-flex">
                    <div class="col-left">
                        <img src="${item.imagem_url}" class="img-main">
                        ${dimensoes ? `<div class="dim-box"><strong>DIMENSÕES</strong><br>${dimensoes}</div>` : ''}
                    </div>
                    <div class="col-right">
                        <h2 class="prod-title">${item.nome_produto}</h2>
                        <div class="emocional-text">${emocional}</div>
                        ${item.variacao ? `<div class="variation-text">VARIAÇÃO: ${item.variacao}</div>` : ''}
                        <span class="sku-text">SKU: ${item.sku || '---'}</span>
                        ${tecnico ? `<div class="specs-box"><strong>DETALHES TÉCNICOS:</strong><br>${tecnico}</div>` : ''}
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
            <div style="page-break-inside: avoid;">
                ${data.obs_geral ? `<div style="font-size: 10px; background: #fdfdfd; padding: 10px; border: 1px solid #eee; margin-bottom: 15px;"><strong>OBSERVAÇÕES:</strong><br>${data.obs_geral}</div>` : ''}
                <div style="background: #1A3017; color: white; padding: 20px; text-align: right; font-size: 20px; font-weight: bold; border-radius: 4px;">
                    TOTAL GERAL: R$ ${parseFloat(data.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </div>
            </div>
        </div>`;

        element.innerHTML = html;

        const opt = {
            margin: [20, 0, 20, 0],
            filename: `Terrazi_Orcamento_${data.id}.pdf`,
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
        };

        // Gera o Blob e abre em nova aba
        const pdfWorker = html2pdf().set(opt).from(element);
        const pdfBlob = await pdfWorker.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        window.open(url, '_blank');

        // Restaura botão
        btn.innerText = originalText;
        btn.disabled = false;
        btn.style.background = "white";

    } catch (e) {
        console.error(e);
        alert("Erro ao gerar impressão.");
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

window.filtrarCards = () => {
    const termo = document.getElementById('filterInput').value.toLowerCase().trim();
    const status = document.getElementById('statusFilter').value;

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
});
