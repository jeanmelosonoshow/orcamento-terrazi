// 0. CONTROLE DE ACESSO E IDENTIFICAÇÃO (Garante que não trave a página)
const usuarioLogadoRaw = sessionStorage.getItem('usuarioLogado');
if (!usuarioLogadoRaw) { window.location.href = 'login.html'; }
const usuarioLogado = JSON.parse(usuarioLogadoRaw);

// Seletores do DOM
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

// 1. INICIALIZAÇÃO E CARREGAMENTO DE DADOS
document.addEventListener('DOMContentLoaded', () => {
    exibirUsuarioLogado(); // Resolve o "Carregando identificação..."

    if (sellerName) {
        sellerName.value = usuarioLogado.nomefuncionario;
        sellerName.readOnly = true;
    }

    fetchProducts(true);

    // Gerenciamento de Busca
    if (searchBtn) searchBtn.addEventListener('click', () => fetchProducts(false));
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchProducts(false); });
        searchInput.addEventListener('input', (e) => { if (e.target.value.trim() === "") fetchProducts(true); });
    }

    // Processamento de Clonagem ou Impressão Direta do Histórico
    const urlParams = new URLSearchParams(window.location.search);
    const clonarData = localStorage.getItem('clonar_orcamento');

    if (clonarData) {
        const data = JSON.parse(clonarData);
        custName.value = data.cliente_nome || '';
        custDoc.value = data.cliente_doc || '';
        sellerPhone.value = data.vendedor_contato || '';
        generalObs.value = data.obs_geral || '';
        
        // Correção de Data para evitar "Invalid Date"
        if (data.data_validade) quoteValid.value = data.data_validade.split('T')[0];
        
        quoteCart = (data.items || data.itens || []).map(item => ({
            sku: item.sku,
            displayName: item.nome_produto || item.displayName,
            price: parseFloat(item.preco_unitario || item.price),
            quantity: parseInt(item.quantidade || item.quantity),
            variation: item.variacao || item.variation || '',
            image: item.imagem_url || item.image,
            description: item.descricao_tecnica || item.description || '',
            dimensions: item.dimensoes || item.dimensions || '',
            features: item.caracteristicas || item.features || '',
            tempId: Date.now() + Math.random()
        }));
        
        renderQuoteSidebar();
        localStorage.removeItem('clonar_orcamento'); 
        if (urlParams.get('modo') === 'impressao') {
            setTimeout(() => { generatePdfBtn.click(); }, 2500);
        }
    }
});

// 2. BUSCA E VITRINE (Mantém aleatoriedade inicial)
async function fetchProducts(isInitial = false) {
    const query = isInitial ? "" : (searchInput ? searchInput.value.trim() : "");
    productsGrid.innerHTML = '<div class="loader">Carregando curadoria...</div>';
    try {
        const response = await fetch(`/api/get-products?q=${encodeURIComponent(query)}`);
        let products = await response.json();
        if (isInitial) products = products.sort(() => 0.5 - Math.random()).slice(0, 12);
        renderProducts(products);
    } catch (error) { productsGrid.innerHTML = '<p>Erro ao conectar.</p>'; }
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

// 3. CARRINHO E EDIÇÃO (Não suprime os campos técnicos)
window.adicionarAoOrcamento = (produto) => {
    quoteCart.push({ 
        ...produto, 
        tempId: Date.now(), 
        displayName: produto.name, 
        quantity: 1, 
        variation: "",
        dimensions: produto.dimensions || "",
        features: produto.features || "",
        description: produto.description || ""
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
                <img src="${item.image}" style="width:35px; height:35px; object-fit:cover; border-radius:4px;">
                <input type="text" value="${item.displayName}" onchange="atualizarDados(${index}, 'displayName', this.value)" style="flex:1; font-weight:600; border:none; background:transparent; font-size:12px;">
                <button onclick="removerItem(${index})" style="background:none; border:none; color:#c0392b; cursor:pointer;">&times;</button>
            </div>
            <input type="text" placeholder="Variação (cor, tecido...)" value="${item.variation || ''}" onchange="atualizarDados(${index}, 'variation', this.value)" style="width:100%; font-size:11px; margin-bottom:5px; border:none; border-bottom:1px solid #eee;">
            <div style="display: grid; grid-template-columns: 50px 1fr; gap: 8px;">
                <input type="number" value="${item.quantity}" onchange="atualizarDados(${index}, 'quantity', this.value)" style="width:100%; padding:3px;">
                <input type="number" step="0.01" value="${item.price}" onchange="atualizarDados(${index}, 'price', this.value)" style="width:100%; padding:3px; font-weight:bold;">
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

// 4. SALVAMENTO E GERAÇÃO DO PDF (LAYOUT CATÁLOGO PREMIUM)
async function salvarNoBanco() {
    const payload = {
        cust_name: custName.value,
        cust_doc: custDoc.value,
        valid_until: quoteValid.value,
        seller_name: sellerName.value,
        seller_phone: sellerPhone.value,
        general_obs: generalObs.value,
        total_value: quoteCart.reduce((acc, item) => acc + (item.price * item.quantity), 0),
        items: quoteCart,
        dados_vendedor: {
            idfuncionario: usuarioLogado.idfuncionario,
            nomefuncionario: usuarioLogado.nomefuncionario,
            idfilial: usuarioLogado.idfilial
        }
    };
    const response = await fetch('/api/salvar-orcamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return await response.json();
}

if (generatePdfBtn) {
    generatePdfBtn.addEventListener('click', async () => {
        if (quoteCart.length === 0) return alert("Adicione itens primeiro.");
        
        const res = await salvarNoBanco();
        const nPedido = res.id || "---";

        const element = document.createElement('div');
        const dataValidade = quoteValid.value ? new Date(quoteValid.value + 'T00:00').toLocaleDateString('pt-BR') : '---';

        let html = `
        <style>
            .pdf-container { font-family: 'Helvetica', sans-serif; color: #333; padding: 0; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; padding: 30px 40px; border-bottom: 2px solid #1A3017; }
            .order-info { text-align: right; }
            .order-number { font-size: 24px; font-weight: bold; color: #1A3017; }
            .client-seller-info { background: #F4F4F4; padding: 15px 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 11px; }
            .product-row { display: flex; gap: 30px; padding: 40px; border-bottom: 1px solid #EEE; page-break-inside: avoid; }
            .product-img { width: 240px; height: 240px; object-fit: cover; border-radius: 4px; }
            .product-detail { flex: 1; }
            .product-detail h2 { font-size: 20px; color: #1A3017; margin: 0 0 10px 0; font-weight: bold; }
            .desc-text { font-size: 11px; line-height: 1.5; color: #444; margin-bottom: 15px; text-align: justify; }
            .specs-box { background: #F9F9F9; padding: 12px; border-radius: 4px; font-size: 10px; border-left: 3px solid #1A3017; margin-bottom: 15px; }
            .table-values { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .table-values th { background: #F4F4F4; padding: 8px; text-align: center; color: #666; font-size: 9px; text-transform: uppercase; }
            .table-values td { padding: 10px; text-align: center; border: 1px solid #EEE; font-size: 12px; }
            .footer-total { background: #1A3017; color: white; padding: 25px 40px; text-align: right; font-size: 22px; font-weight: bold; }
            .obs-section { padding: 20px 40px; font-size: 10px; color: #666; line-height: 1.4; border-top: 1px solid #EEE; }
        </style>
        <div class="pdf-container">
            <div class="header">
                <img src="https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp" style="height: 55px;">
                <div class="order-info">
                    <div class="order-number">ORÇAMENTO #${nPedido}</div>
                    <div style="font-size: 11px; margin-top: 5px;">
                        <strong>Filial: ${usuarioLogado.idfilial}</strong><br>
                        Emissão: ${new Date().toLocaleDateString('pt-BR')}<br>
                        Validade: ${dataValidade}
                    </div>
                </div>
            </div>
            <div class="client-seller-info">
                <div>
                    <strong>DADOS DO CLIENTE</strong><br>
                    NOME: ${custName.value || '---'}<br>
                    DOC: ${custDoc.value || '---'}
                </div>
                <div>
                    <strong>DADOS DO VENDEDOR</strong><br>
                    VENDEDOR: ${sellerName.value}<br>
                    CONTATO: ${sellerPhone.value || '---'}
                </div>
            </div>`;

        quoteCart.forEach(item => {
            html += `
            <div class="product-row">
                <img src="${item.image}" class="product-img">
                <div class="product-detail">
                    <h2>${item.displayName}</h2>
                    <div class="desc-text">${item.description}</div>
                    
                    ${item.variation ? `<div style="font-size:11px; margin-bottom:10px;"><strong>VARIAÇÃO:</strong> ${item.variation}</div>` : ''}

                    <div class="specs-box">
                        <strong>DIMENSÕES:</strong><br>${item.dimensions || 'Conforme padrão da peça'}<br><br>
                        <strong>CARACTERÍSTICAS:</strong><br>${item.features || 'Material de alta qualidade, acabamento refinado.'}
                    </div>

                    <table class="table-values">
                        <thead>
                            <tr><th>Qtd</th><th>Valor Unitário</th><th>Subtotal</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${item.quantity}</td>
                                <td>R$ ${item.price.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                <td><strong>R$ ${(item.quantity * item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>`;
        });

        if (generalObs.value) {
            html += `<div class="obs-section"><strong>OBSERVAÇÕES GERAIS:</strong><br>${generalObs.value.replace(/\n/g, '<br>')}</div>`;
        }

        html += `
            <div class="footer-total">
                VALOR TOTAL: R$ ${displayTotalGeral.innerText}
            </div>
        </div>`;

        element.innerHTML = html;
        html2pdf().set({
            margin: 0,
            filename: `Terrazi_Orcamento_${nPedido}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
        }).from(element).save();
    });
}

// 5. AUXILIARES DE INTERFACE
function exibirUsuarioLogado() {
    const infoTopo = document.getElementById('user-info-topo');
    if (infoTopo) {
        infoTopo.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px; width:100%; color: white; padding: 10px; font-size: 13px;">
                <span><strong>Vendedor:</strong> ${usuarioLogado.nomefuncionario} | <strong>Filial:</strong> ${usuarioLogado.idfilial}</span>
                <div style="flex-grow:1"></div>
                <button onclick="fazerLogout()" style="background:#c0392b; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">SAIR</button>
            </div>`;
    }
}
window.fazerLogout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };
