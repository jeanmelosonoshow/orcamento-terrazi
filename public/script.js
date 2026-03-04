// 0. VERIFICAÇÃO DE LOGIN
const usuarioLogadoRaw = sessionStorage.getItem('usuarioLogado');
if (!usuarioLogadoRaw) { window.location.href = 'login.html'; }
const usuarioLogado = JSON.parse(usuarioLogadoRaw);

// Seletores
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const productsGrid = document.getElementById('productsGrid');
const quoteItemsContainer = document.getElementById('quoteItems');
const generatePdfBtn = document.getElementById('generatePdfBtn');
const custName = document.getElementById('custName');
const custDoc = document.getElementById('custDoc');
const quoteValid = document.getElementById('quoteValid');
const sellerName = document.getElementById('sellerName');
const sellerPhone = document.getElementById('sellerPhone');
const generalObs = document.getElementById('generalObs');
const displayTotalGeral = document.getElementById('displayTotalGeral');

let quoteCart = [];
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";

// 1. INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    exibirUsuarioLogado();
    if (sellerName) {
        sellerName.value = usuarioLogado.nomefuncionario;
        sellerName.readOnly = true;
    }
    fetchProducts(true);

    const clonarData = localStorage.getItem('clonar_orcamento');
    if (clonarData) {
        const data = JSON.parse(clonarData);
        custName.value = data.cliente_nome || '';
        custDoc.value = data.cliente_doc || '';
        sellerPhone.value = data.vendedor_contato || '';
        generalObs.value = data.obs_geral || '';
        if (data.data_validade) quoteValid.value = data.data_validade.split('T')[0];
        quoteCart = (data.items || []).map(item => ({
            ...item,
            displayName: item.nome_produto || item.displayName,
            price: parseFloat(item.preco_unitario || item.price),
            quantity: parseInt(item.quantidade || item.quantity),
            variation: item.variacao || item.variation || '',
            image: item.imagem_url || item.image,
            description: item.descricao_tecnica || item.description,
            category: item.categoria || '',
            tempId: Date.now() + Math.random()
        }));
        renderQuoteSidebar();
        localStorage.removeItem('clonar_orcamento');
    }
});

// 2. BUSCA
async function fetchProducts(isInitial = false) {
    const query = isInitial ? "" : (searchInput?.value.trim() || "");
    productsGrid.innerHTML = '<div class="loader">Carregando curadoria...</div>';
    try {
        const response = await fetch(`/api/get-products?q=${encodeURIComponent(query)}`);
        let products = await response.json();
        if (isInitial) products = products.sort(() => 0.5 - Math.random()).slice(0, 12);
        renderProducts(products);
    } catch (error) { productsGrid.innerHTML = '<p>Erro ao carregar.</p>'; }
}

function renderProducts(products) {
    productsGrid.innerHTML = '';
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku">SKU: ${p.sku}</p>
                <p class="price">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <button class="btn-primary" onclick='adicionarAoOrcamento(${JSON.stringify(p).replace(/'/g, "&apos;")})'>ADICIONAR</button>
            </div>`;
        productsGrid.appendChild(card);
    });
}

// 3. CARRINHO
window.adicionarAoOrcamento = (produto) => {
    quoteCart.push({ 
        ...produto, 
        tempId: Date.now(), 
        displayName: produto.name, 
        quantity: 1, 
        variation: "",
        category: produto.category || "" 
    });
    renderQuoteSidebar();
};

function renderQuoteSidebar() {
    quoteItemsContainer.innerHTML = '';
    quoteCart.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-quote-edit';
        itemDiv.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center; margin-bottom:5px;">
                <img src="${item.image}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">
                <input type="text" value="${item.displayName}" onchange="atualizarDados(${index}, 'displayName', this.value)" style="flex:1; font-weight:bold; border:none; background:transparent; font-size:12px;">
                <button onclick="removerItem(${index})" style="background:none; border:none; color:red; cursor:pointer;">&times;</button>
            </div>
            <input type="text" placeholder="Variação..." value="${item.variation || ''}" onchange="atualizarDados(${index}, 'variation', this.value)" style="width:100%; font-size:10px; margin-bottom:5px; border:1px solid #eee;">
            <div style="display:grid; grid-template-columns: 1fr 2fr; gap:8px;">
                <input type="number" value="${item.quantity}" onchange="atualizarDados(${index}, 'quantity', this.value)" style="width:100%;">
                <input type="number" step="0.01" value="${item.price}" onchange="atualizarDados(${index}, 'price', this.value)" style="width:100%; font-weight:bold;">
            </div>`;
        quoteItemsContainer.appendChild(itemDiv);
    });
    atualizarDestaqueTotal();
}

window.atualizarDados = (index, campo, valor) => {
    quoteCart[index][campo] = (campo === 'price' || campo === 'quantity') ? parseFloat(valor) : valor;
    atualizarDestaqueTotal();
};
window.removerItem = (index) => { quoteCart.splice(index, 1); renderQuoteSidebar(); };
function atualizarDestaqueTotal() {
    const total = quoteCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    if (displayTotalGeral) displayTotalGeral.innerText = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

// 4. GERAÇÃO DE PDF + SALVAMENTO
generatePdfBtn.addEventListener('click', async () => {
    if (quoteCart.length === 0) return alert("Selecione itens.");

    // Lógica para obter o Número do Pedido (Preview ou Banco)
    let orcamentoID = "---";
    try {
        // Primeiro salvamos para garantir o ID real
        const res = await fetch('/api/salvar-orcamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cust_name: custName.value,
                cust_doc: custDoc.value,
                valid_until: quoteValid.value,
                seller_name: sellerName.value,
                seller_phone: sellerPhone.value,
                nome_funcionario: usuarioLogado.nomefuncionario, // Novo campo solicitado
                general_obs: generalObs.value,
                total_value: quoteCart.reduce((acc, item) => acc + (item.price * item.quantity), 0),
                items: quoteCart,
                dados_vendedor: { idfuncionario: usuarioLogado.idfuncionario, idfilial: usuarioLogado.idfilial }
            })
        });
        const saveResult = await res.json();
        orcamentoID = saveResult.id;
    } catch (e) {
        console.error("Erro ao salvar, buscando último ID...");
        // Fallback: Busca último ID existente e soma 1
        const lastIdRes = await fetch('/api/get-last-id'); 
        const lastData = await lastIdRes.json();
        orcamentoID = (parseInt(lastData.lastId) || 0) + 1;
    }

    const element = document.createElement('div');
    const dataValidade = quoteValid.value ? new Date(quoteValid.value + 'T00:00').toLocaleDateString('pt-BR') : 'A consultar';

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
        .variation-text { font-size: 11px; color: #1A3017; font-weight: bold; margin: 8px 0; }
        .sku-text { font-size: 9px; color: #999; margin-bottom: 10px; display: block; }
        .emocional-text { font-size: 11px; line-height: 1.5; color: #444; margin-bottom: 12px; text-align: justify; }
        .specs-box { font-size: 10px; border-top: 1px dashed #ccc; padding-top: 10px; color: #555; }
        .price-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .price-table td { border: 1px solid #eee; padding: 8px; text-align: center; font-size: 11px; font-weight: bold; }
        .label-cell { background: #fafafa; font-size: 8px; color: #999; text-transform: uppercase; }
        .institucional { font-size: 9px; color: #888; text-align: justify; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px; }
    </style>
    <div class="pdf-body">
        <div class="brand-sidebar"></div>
        <div class="pdf-header">
            <img src="${LOGO_URL}" style="height: 50px;">
            <div class="header-meta">
                <div class="order-id">ORÇAMENTO #${orcamentoID}</div>
                <strong>FILIAL: ${usuarioLogado.idfilial}</strong><br>
                Emissão: ${new Date().toLocaleDateString('pt-BR')} | Validade: ${dataValidade}
            </div>
        </div>
        <div class="info-box">
            <div><strong>CLIENTE:</strong><br>${custName.value || '---'}<br>DOC: ${custDoc.value || '---'}</div>
            <div><strong>VENDEDOR:</strong><br>${sellerName.value}<br>CONTATO: ${sellerPhone.value || '---'}</div>
        </div>`;

    quoteCart.forEach(item => {
        const limparTxt = (t) => t ? t.replace(/<\/?[^>]+(>|$)/g, "").replace(/cada peça da casa terrazi[\s\S]*identidade brasileira/gi, "").trim() : "";
        let raw = item.description || "";
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
                    <img src="${item.image}" class="img-main">
                    ${dimensoes ? `<div class="dim-box"><strong>DIMENSÕES</strong><br>${dimensoes}</div>` : ''}
                </div>
                <div class="col-right">
                    <h2 class="prod-title">${item.displayName}</h2>
                    <div class="emocional-text">${emocional}</div>
                    ${item.variation ? `<div class="variation-text">VARIAÇÃO: ${item.variation}</div>` : ''}
                    <span class="sku-text">SKU: ${item.sku}</span>
                    ${tecnico ? `<div class="specs-box"><strong>DETALHES TÉCNICOS:</strong><br>${tecnico}</div>` : ''}
                    <table class="price-table">
                        <tr><td class="label-cell">Qtd</td><td class="label-cell">Valor Unitário</td><td class="label-cell">Subtotal</td></tr>
                        <tr><td>${item.quantity}</td><td>R$ ${item.price.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td><td>R$ ${(item.quantity * item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td></tr>
                    </table>
                </div>
            </div>
        </div>`;
    });

    html += `
        <div style="page-break-inside: avoid;">
            ${generalObs.value ? `<div style="font-size: 10px; background: #fdfdfd; padding: 10px; border: 1px solid #eee; margin-bottom: 15px;"><strong>OBSERVAÇÕES:</strong><br>${generalObs.value}</div>` : ''}
            <div style="background: #1A3017; color: white; padding: 20px; text-align: right; font-size: 20px; font-weight: bold; border-radius: 4px;">
                TOTAL GERAL: R$ ${displayTotalGeral.innerText}
            </div>
            <div class="institucional">
                CADA PEÇA DA CASA TERRAZI É FRUTO DO DESIGN BRASILEIRO, UNINDO O SABER ARTESANAL À SOFISTICAÇÃO CONTEMPORÂNEA. NOSSA CURADORIA CELEBRA A NOBREZA DA MADEIRA E A EXCLUSIVIDADE DOS MATERIAIS, TRANSFORMANDO AMBIENTES EM EXPERIÊNCIAS DE CONFORTO E IDENTIDADE BRASILEIRA.
            </div>
        </div>
    </div>`;

    element.innerHTML = html;
    html2pdf().set({
        margin: [20, 0, 20, 0],
        filename: `Terrazi_${custName.value || 'Orcamento'}.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
});

function exibirUsuarioLogado() {
    const infoTopo = document.getElementById('user-info-topo');
    if (infoTopo) {
        infoTopo.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px; width:100%; color: white; padding: 10px; font-size: 13px;">
                <span><strong>Vendedor:</strong> ${usuarioLogado.nomefuncionario} | <strong>Filial:</strong> ${usuarioLogado.idfilial}</span>
                <div style="flex-grow:1"></div>
                <button onclick="fazerLogout()" style="background:#c0392b; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer;">SAIR</button>
            </div>`;
    }
}
window.fazerLogout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };
