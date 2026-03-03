// 0. VERIFICAÇÃO DE LOGIN E DADOS DO USUÁRIO (Proteção contra nulos)
const usuarioLogadoRaw = sessionStorage.getItem('usuarioLogado');
if (!usuarioLogadoRaw) { 
    window.location.href = 'login.html'; 
}
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

// 1. INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    // Resolve o "Carregando identificação..."
    exibirUsuarioLogado();

    if (sellerName && usuarioLogado) {
        sellerName.value = usuarioLogado.nomefuncionario || '';
        sellerName.readOnly = true;
    }

    fetchProducts(true);

    // VINCULAÇÃO DA BUSCA
    if (searchBtn) searchBtn.addEventListener('click', () => fetchProducts(false));
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchProducts(false); });
        searchInput.addEventListener('input', (e) => { if (e.target.value.trim() === "") fetchProducts(true); });
    }

    // Lógica de clonagem/impressão
    const urlParams = new URLSearchParams(window.location.search);
    const isModoImpressao = urlParams.get('modo') === 'impressao';
    const clonarData = localStorage.getItem('clonar_orcamento');

    if (clonarData) {
        const data = JSON.parse(clonarData);
        custName.value = data.cliente_nome || '';
        custDoc.value = data.cliente_doc || '';
        sellerPhone.value = data.vendedor_contato || '';
        generalObs.value = data.obs_geral || '';
        
        // CORREÇÃO DE DATA PARA EVITAR "INVALID DATE"
        if (data.data_validade) {
            quoteValid.value = data.data_validade.split('T')[0];
        }
        
        quoteCart = (data.items || data.itens || []).map(item => ({
            sku: item.sku,
            displayName: item.nome_produto || item.displayName,
            price: parseFloat(item.preco_unitario || item.price),
            quantity: parseInt(item.quantidade || item.quantity),
            variation: item.variacao || item.variation || '',
            image: item.imagem_url || item.image,
            description: item.descricao_tecnica || item.description,
            tempId: Date.now() + Math.random()
        }));
        
        renderQuoteSidebar();
        localStorage.removeItem('clonar_orcamento'); 
        if (isModoImpressao && generatePdfBtn) {
            setTimeout(() => { generatePdfBtn.click(); }, 3000);
        }
    }
});

// 2. BUSCA E RENDERIZAÇÃO
async function fetchProducts(isInitial = false) {
    const query = isInitial ? "" : (searchInput ? searchInput.value.trim() : "");
    productsGrid.innerHTML = '<div class="loader">Carregando curadoria...</div>';
    try {
        const response = await fetch(`/api/get-products?q=${encodeURIComponent(query)}`);
        let products = await response.json();
        products = products.filter(p => p.published !== false && p.visible !== false);
        if (isInitial) products = products.sort(() => 0.5 - Math.random()).slice(0, 12);
        renderProducts(products);
    } catch (error) {
        productsGrid.innerHTML = '<p>Erro ao conectar com a galeria.</p>';
    }
}

function renderProducts(products) {
    productsGrid.innerHTML = '';
    products.forEach(p => {
        const isLowStock = parseFloat(p.stock) < 1 || p.stock === "Sob Consulta";
        const stockColor = isLowStock ? "#c0392b" : "#1A3017";
        const stockLabel = p.stock === "Sob Consulta" ? "Sob Consulta" : `Estoque: ${p.stock}`;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku">SKU: ${p.sku}</p>
                <p class="stock" style="color: ${stockColor}; font-weight: bold; font-size: 11px;">${stockLabel}</p>
                <p class="price">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <button class="btn-primary" onclick='adicionarAoOrcamento(${JSON.stringify(p).replace(/'/g, "&apos;")})'>ADICIONAR</button>
            </div>`;
        productsGrid.appendChild(card);
    });
}

// 3. CARRINHO E EDIÇÃO
window.adicionarAoOrcamento = (produto) => {
    quoteCart.push({ ...produto, tempId: Date.now(), displayName: produto.name, quantity: 1, variation: "" });
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
                <input type="text" value="${item.displayName}" 
                    onchange="atualizarDados(${index}, 'displayName', this.value)" 
                    style="flex:1; font-weight:600; border:none; background:transparent; font-size:13px;">
                <button onclick="removerItem(${index})" style="background:none; border:none; color:#c0392b; cursor:pointer; font-size:18px;">&times;</button>
            </div>
            <div style="margin-bottom:8px;">
                <input type="text" placeholder="Adicionar variação..." value="${item.variation || ''}" 
                    onchange="atualizarDados(${index}, 'variation', this.value)" 
                    style="width:100%; font-size:11px; color:#666; border:none; border-bottom:1px solid #eee; background:transparent;">
            </div>
            <div style="display: grid; grid-template-columns: 60px 1fr; gap: 10px;">
                <input type="number" value="${item.quantity}" onchange="atualizarDados(${index}, 'quantity', this.value)" style="width:100%; padding:4px; font-size:12px;">
                <input type="number" step="0.01" value="${item.price}" onchange="atualizarDados(${index}, 'price', this.value)" style="width:100%; padding:4px; font-size:12px; font-weight:600;">
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
window.limparOrcamento = () => { quoteCart = []; renderQuoteSidebar(); };

function atualizarDestaqueTotal() {
    const total = quoteCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    if (displayTotalGeral) displayTotalGeral.innerText = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

// 4. SALVAMENTO E PDF (Restaurado e com Filial)
async function salvarNoBanco() {
    const totalGeral = quoteCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const payload = {
        cust_name: custName.value,
        cust_doc: custDoc.value,
        valid_until: quoteValid.value,
        seller_name: sellerName.value,
        seller_phone: sellerPhone.value,
        general_obs: generalObs.value,
        total_value: totalGeral,
        items: quoteCart,
        // Envia dados para vendedor_orcamento
        dados_vendedor: {
            idfuncionario: usuarioLogado.idfuncionario,
            nomefuncionario: usuarioLogado.nomefuncionario,
            idfilial: usuarioLogado.idfilial
        }
    };
    try {
        const response = await fetch('/api/salvar-orcamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await response.json();
    } catch (error) { console.error("Erro ao salvar:", error); }
}

if (generatePdfBtn) {
    generatePdfBtn.addEventListener('click', async () => {
        if (quoteCart.length === 0) return alert("Selecione itens.");
        const res = await salvarNoBanco();
        const idOrcamento = res?.id || "";
        
        // LÓGICA DO PDF (Incluindo Filial no cabeçalho)
        const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";
        const element = document.createElement('div');
        const dataValidadeFormatada = quoteValid.value ? new Date(quoteValid.value + 'T00:00').toLocaleDateString('pt-BR') : 'A consultar';

        let html = `
        <style>
            .pdf-body { font-family: Helvetica, sans-serif; padding: 40px; position: relative; }
            .brand-sidebar { position: absolute; left: 0; top: 0; bottom: 0; width: 8px; background: #1A3017; }
            .pdf-header { display: flex; justify-content: space-between; border-bottom: 2px solid #1A3017; padding-bottom: 10px; margin-bottom: 20px; }
            .info-box { background: #f9f9f9; padding: 12px; display: grid; grid-template-columns: 1fr 1fr; font-size: 10px; border: 1px solid #eee; margin-bottom: 20px; }
            .product-block { display: flex; gap: 20px; border-bottom: 1px solid #f0f0f0; padding: 15px 0; page-break-inside: avoid; }
        </style>
        <div class="pdf-body">
            <div class="brand-sidebar"></div>
            <div class="pdf-header">
                <img src="${LOGO_URL}" style="height:45px;">
                <div style="text-align:right; font-size:9px;">
                    <strong>ORÇAMENTO TERRAZI #${idOrcamento}</strong><br>
                    <strong>Filial: ${usuarioLogado.idfilial}</strong><br>
                    Emissão: ${new Date().toLocaleDateString('pt-BR')}<br>
                    Validade: ${dataValidadeFormatada}
                </div>
            </div>
            <div class="info-box">
                <div><strong>CLIENTE:</strong> ${custName.value || '---'}<br><strong>DOC:</strong> ${custDoc.value || '---'}</div>
                <div><strong>VENDEDOR:</strong> ${sellerName.value || '---'}<br><strong>FILIAL:</strong> ${usuarioLogado.idfilial}</div>
            </div>`;

        quoteCart.forEach(item => {
            html += `
            <div class="product-block">
                <img src="${item.image}" style="width:150px; height:150px; object-fit:cover;">
                <div style="flex:1">
                    <h2 style="font-size:14px; color:#1A3017; margin:0;">${item.displayName}</h2>
                    <p style="font-size:10px; color:#666;">SKU: ${item.sku}</p>
                    ${item.variation ? `<p style="font-size:10px;"><strong>VARIAÇÃO:</strong> ${item.variation}</p>` : ''}
                    <div style="margin-top:10px; font-weight:bold; font-size:12px;">
                        Qtd: ${item.quantity} | Unit: R$ ${item.price.toLocaleString('pt-BR')} | Subtotal: R$ ${(item.quantity * item.price).toLocaleString('pt-BR')}
                    </div>
                </div>
            </div>`;
        });

        html += `
            <div style="margin-top:20px; background:#1A3017; color:white; padding:15px; text-align:right; font-size:18px; font-weight:bold;">
                TOTAL: R$ ${displayTotalGeral.innerText}
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
}

// 5. FUNÇÕES DE SESSÃO
function exibirUsuarioLogado() {
    const infoTopo = document.getElementById('user-info-topo');
    if (infoTopo && usuarioLogado) {
        infoTopo.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px; width:100%; color: white; padding: 10px;">
                <span><strong>Vendedor:</strong> ${usuarioLogado.nomefuncionario}</span>
                <span><strong>Filial:</strong> ${usuarioLogado.idfilial}</span>
                <div style="flex-grow:1"></div>
                <button onclick="fazerLogout()" style="background:#c0392b; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer;">SAIR</button>
            </div>
        `;
    }
}

window.fazerLogout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };
