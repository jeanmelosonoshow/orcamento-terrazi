// Seletores
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const productsGrid = document.getElementById('productsGrid');
const quoteItemsContainer = document.getElementById('quoteItems');
const generatePdfBtn = document.getElementById('generatePdfBtn');

let quoteCart = [];
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";

// Carregar itens iniciais ao abrir a página
window.onload = () => fetchProducts(true);

// 1. BUSCA DE PRODUTOS (Com flag para busca aleatória/inicial)
async function fetchProducts(isInitial = false) {
    const query = isInitial ? "" : searchInput.value.trim();
    
    productsGrid.innerHTML = '<div class="loader">Carregando curadoria...</div>';
    
    try {
        const response = await fetch(`/api/get-products?q=${encodeURIComponent(query)}`);
        let products = await response.json();

        if (isInitial) {
            // Embaralha e pega 8 itens aleatórios para a Home
            products = products.sort(() => 0.5 - Math.random()).slice(0, 8);
        }

        renderProducts(products);
    } catch (error) {
        productsGrid.innerHTML = '<p>Erro ao conectar com a galeria.</p>';
    }
}

// 2. RENDERIZAR CARDS NA VITRINE
function renderProducts(products) {
    productsGrid.innerHTML = '';
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku" style="font-size: 0.7rem; color: #999;">SKU: ${p.sku}</p>
                <p class="price" style="font-weight: bold; margin: 5px 0;">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <button class="btn-primary" style="width: 100%; font-size: 0.7rem;" onclick='adicionarAoOrcamento(${JSON.stringify(p).replace(/'/g, "&apos;")})'>
                    ADICIONAR AO PROJETO
                </button>
            </div>
        `;
        productsGrid.appendChild(card);
    });
}

// 3. ADICIONAR AO CARRINHO (Rápido, sem edição de descrição na tela)
function adicionarAoOrcamento(produto) {
    const novoItem = {
        ...produto,
        tempId: Date.now(),
        displayName: produto.name // Nome que será editável
    };
    quoteCart.push(novoItem);
    renderQuoteSidebar();
}

// 4. RENDERIZAR LATERAL (FOCO EM EDIÇÃO DE NOME E PREÇO)
function renderQuoteSidebar() {
    quoteItemsContainer.innerHTML = '';
    quoteCart.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-quote-edit';
        itemDiv.innerHTML = `
            <div class="edit-header">
                <img src="${item.image}">
                <div style="flex:1">
                    <input type="text" class="input-edit-name" value="${item.displayName}" 
                        onchange="atualizarDados(${index}, 'displayName', this.value)">
                </div>
                <button onclick="removerItem(${index})" class="btn-remove">×</button>
            </div>
            <div class="edit-body">
                <div class="input-group">
                    <span>R$</span>
                    <input type="number" step="0.01" value="${item.price}" 
                        onchange="atualizarDados(${index}, 'price', this.value)">
                </div>
            </div>
        `;
        quoteItemsContainer.appendChild(itemDiv);
    });
}

window.atualizarDados = (index, campo, valor) => { quoteCart[index][campo] = valor; };
window.removerItem = (index) => { quoteCart.splice(index, 1); renderQuoteSidebar(); };

// 5. GERAÇÃO DO PDF - LAYOUT MINIMALISTA DE LUXO
generatePdfBtn.addEventListener('click', () => {
    if (quoteCart.length === 0) return alert("Selecione itens primeiro.");

    const element = document.createElement('div');
    element.className = "pdf-container";

    const valorTotal = quoteCart.reduce((acc, item) => acc + parseFloat(item.price), 0);

    let html = `
        <style>
            .pdf-container { padding: 40px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1a1a; }
            .header { text-align: center; border-bottom: 0.5px solid #eaeaea; padding-bottom: 30px; margin-bottom: 40px; }
            .logo { height: 45px; margin-bottom: 10px; }
            .title { text-transform: uppercase; letter-spacing: 4px; font-size: 11px; color: #999; }
            
            .product-row { display: flex; gap: 40px; margin-bottom: 50px; page-break-inside: avoid; align-items: flex-start; }
            .product-image { width: 220px; height: 220px; object-fit: cover; filter: contrast(1.05); }
            .product-details { flex: 1; }
            .product-name { font-size: 18px; font-weight: 500; text-transform: uppercase; margin: 0 0 10px 0; border-bottom: 1px solid #1a1a1a; padding-bottom: 5px; }
            .product-sku { font-size: 9px; color: #bbb; margin-bottom: 15px; }
            .product-desc { font-size: 12px; line-height: 1.6; color: #444; text-align: justify; }
            .product-desc p, .product-desc ul { margin-bottom: 8px; }
            .product-price { font-size: 15px; font-weight: 600; margin-top: 15px; color: #1A3017; }
            
            .footer-total { margin-top: 60px; padding-top: 20px; border-top: 2px solid #1a1a1a; text-align: right; page-break-inside: avoid; }
            .total-label { font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 2px; }
            .total-value { font-size: 24px; font-weight: 700; color: #1A3017; }
        </style>

        <div class="header">
            <img src="${LOGO_URL}" class="logo">
            <div class="title">Curadoria de Mobiliário Contemporâneo</div>
        </div>
    `;

    quoteCart.forEach(item => {
        html += `
            <div class="product-row">
                <img src="${item.image}" class="product-image">
                <div class="product-details">
                    <h2 class="product-name">${item.displayName}</h2>
                    <div class="product-sku">REF: ${item.sku}</div>
                    <div class="product-desc">${item.description}</div>
                    <div class="product-price">R$ ${parseFloat(item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                </div>
            </div>
        `;
    });

    html += `
        <div class="footer-total">
            <div class="total-label">Investimento Total</div>
            <div class="total-value">R$ ${valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
        </div>
    `;

    element.innerHTML = html;

    const opt = {
        margin: [0.4, 0.4],
        filename: `Terrazi_Orcamento.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
});

searchBtn.addEventListener('click', () => fetchProducts(false));
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchProducts(false); });
