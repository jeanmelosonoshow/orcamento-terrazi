const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioLogado'));
if (!usuarioLogado) { window.location.href = 'login.html'; }

window.todosOrcamentos = []; 
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";

// 1. CARREGAMENTO INICIAL
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

// 2. RENDERIZAÇÃO DOS CARDS
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
        if (dataValidade && dataValidade < hoje && statusFinal === 'PENDENTE') statusFinal = 'EXPIRADO';

        let badgeColor = "#856404"; let badgeBg = "#fff3cd"; 
        if (statusFinal === 'EXPIRADO' || statusFinal === 'CANCELADO') { badgeColor = "#721c24"; badgeBg = "#f8d7da"; }
        else if (['GEROU VENDA', 'VENDIDO', 'FECHADO'].includes(statusFinal)) { badgeColor = "#1A3017"; badgeBg = "#E8F5E9"; }

        const card = document.createElement('div');
        card.className = `orcamento-card`; 
        card.innerHTML = `
            <div class="card-header"><span>#${o.id}</span><span style="font-size:11px; font-weight:600;">Validade: ${dataExibicao}</span></div>
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
                <button class="btn-reabrir" onclick="clonagemRapida(this, ${o.id})" style="flex:1; background:#1A3017; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:600;">REABRIR</button>
                <button class="btn-imprimir" onclick="gerarImpressaoRapida(this, ${o.id})" style="flex:1; background:white; color:#1A3017; border:1px solid #1A3017; padding:8px; border-radius:4px; cursor:pointer; font-weight:600;">IMPRIMIR</button>
            </div>`;
        grid.appendChild(card);
    });
}

// 3. LOGICA DE REABRIR (CLONAR)
window.clonagemRapida = async (btn, id) => {
    const originalText = btn.innerText;
    btn.innerText = "REABRINDO...";
    btn.disabled = true;
    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const data = await res.json();
        localStorage.setItem('clonar_orcamento', JSON.stringify(data));
        window.location.href = 'index.html';
    } catch (e) {
        alert("Erro ao reabrir.");
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

// 4. IMPRESSÃO ROBUSTA (MONTAGE INVISÍVEL)
window.gerarImpressaoRapida = async (btn, id) => {
    const originalText = btn.innerText;
    btn.innerText = "MONTANDO PDF...";
    btn.disabled = true;

    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const data = await res.json();
        
        if (!data || !data.items) throw new Error("Dados inválidos");

        const element = document.createElement('div');
        // Garantir que o container esteja fora da visão mas acessível para renderização
        element.style.position = 'absolute';
        element.style.left = '-9999px';
        element.style.width = '800px'; 

        const dataValidade = data.data_validade ? new Date(data.data_validade.split('T')[0] + 'T03:00:00').toLocaleDateString('pt-BR') : 'A consultar';
        const dataEmissao = data.data_criacao ? new Date(data.data_criacao).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
        const valorTotalFormatado = parseFloat(data.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2});

        let html = `
        <style>
            .pdf-body { font-family: 'Helvetica', sans-serif; color: #1a1a1a; padding: 40px 40px 30px 60px; background: white; }
            .brand-sidebar { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: #1A3017; }
            .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3017; padding-bottom: 10px; margin-bottom: 20px; }
            .order-id { font-size: 24px; font-weight: bold; color: #1A3017; }
            .header-meta { font-size: 10px; color: #666; text-align: right; }
            .info-box { background: #f9f9f9; padding: 15px; border-radius: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 10px; border: 1px solid #eee; margin-bottom: 25px; }
            .product-block { width: 100%; page-break-inside: avoid; margin-bottom: 30px; border-bottom: 1px solid #f0f0f0; padding-bottom: 20px; }
            .product-flex { display: flex; gap: 25px; }
            .col-left { width: 180px; flex-shrink: 0; }
            .col-right { flex: 1; }
            .img-main { width: 180px; height: 180px; object-fit: cover; border-radius: 4px; }
            .prod-title { font-size: 16px; font-weight: bold; text-transform: uppercase; color: #1A3017; margin: 0; }
            .emocional-text { font-size: 10px; line-height: 1.4; color: #444; margin: 10px 0; text-align: justify; }
            .price-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .price-table td { border: 1px solid #eee; padding: 6px; text-align: center; font-size: 11px; font-weight: bold; }
            .label-cell { background: #fafafa; font-size: 8px; color: #999; text-transform: uppercase; }
            .total-destaque { background: #1A3017; color: white; padding: 15px; text-align: right; font-size: 18px; font-weight: bold; border-radius: 4px; margin-top: 20px; }
        </style>
        <div class="pdf-body">
            <div class="brand-sidebar"></div>
            <div class="pdf-header">
                <img src="${LOGO_URL}" style="height: 45px;">
                <div class="header-meta">
                    <div class="order-id">ORÇAMENTO #${data.id}</div>
                    <strong>UNIDADE: ${data.idfilial || 'Matriz'}</strong><br>
                    Emissão: ${dataEmissao} | Validade: ${dataValidade}
                </div>
            </div>
            <div class="info-box">
                <div><strong>CLIENTE:</strong><br>${data.cliente_nome || 'Consumidor'}<br>DOC: ${data.cliente_doc || '---'}</div>
                <div><strong>VENDEDOR:</strong><br>${data.vendedor_nome}<br>CONTATO: ${data.vendedor_contato || '---'}</div>
            </div>`;

        data.items.forEach(item => {
            const imgUrl = item.imagem_url || item.image || '';
            const nomeProd = item.nome_produto || item.displayName || 'Produto';
            const desc = item.descricao_tecnica || item.description || '';
            const preco = parseFloat(item.preco_unitario || item.price || 0);
            const qtd = parseInt(item.quantidade || item.quantity || 1);

            html += `
            <div class="product-block">
                <div class="product-flex">
                    <div class="col-left"><img src="${imgUrl}" class="img-main"></div>
                    <div class="col-right">
                        <h2 class="prod-title">${nomeProd}</h2>
                        <div class="emocional-text">${desc.split(/(características|medidas|dimensões)/i)[0]}</div>
                        <table class="price-table">
                            <tr><td class="label-cell">Qtd</td><td class="label-cell">Valor Unitário</td><td class="label-cell">Subtotal</td></tr>
                            <tr>
                                <td>${qtd}</td>
                                <td>R$ ${preco.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                <td>R$ ${(qtd * preco).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>`;
        });

        html += `
            <div style="page-break-inside: avoid;">
                ${data.obs_geral ? `<div style="font-size: 9px; padding: 10px; border: 1px solid #eee; margin-bottom: 10px;"><strong>OBSERVAÇÕES:</strong><br>${data.obs_geral}</div>` : ''}
                <div class="total-destaque">TOTAL GERAL: R$ ${valorTotalFormatado}</div>
            </div>
        </div>`;

        element.innerHTML = html;
        document.body.appendChild(element); // Adiciona temporariamente para o html2pdf capturar imagens

        const opt = {
            margin: [10, 0, 10, 0],
            filename: `Terrazi_${data.id}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
        };

        // Gera o PDF e abre em nova aba
        const pdfWorker = html2pdf().set(opt).from(element);
        const pdfBlob = await pdfWorker.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        window.open(url, '_blank');

        // Limpeza
        document.body.removeChild(element);
        btn.innerText = originalText;
        btn.disabled = false;

    } catch (e) {
        console.error("Erro na impressão:", e);
        alert("Erro ao processar PDF. Verifique os dados.");
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

// 5. AUXILIARES
window.fazerLogout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };

document.addEventListener('DOMContentLoaded', () => {
    carregarHistorico();
    const infoTopo = document.getElementById('user-info-topo');
    if (infoTopo) infoTopo.innerHTML = `<div style="color:white; font-size:12px; padding:10px;">Vendedor: ${usuarioLogado.nomefuncionario} | Filial: ${usuarioLogado.idfilial} <button onclick="fazerLogout()" style="margin-left:20px;">SAIR</button></div>`;
});
