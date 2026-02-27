// Seletores
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const productsGrid = document.getElementById('productsGrid');
const quoteItemsContainer = document.getElementById('quoteItems');
const generatePdfBtn = document.getElementById('generatePdfBtn');

// Novos seletores para dados do orçamento
const custName = document.getElementById('custName');
const custDoc = document.getElementById('custDoc');
const quoteValid = document.getElementById('quoteValid');
const sellerName = document.getElementById('sellerName');
const sellerPhone = document.getElementById('sellerPhone');

let quoteCart = [];
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";

// Carregar itens iniciais ao abrir a página
window.onload = () => fetchProducts(true);

// 1. BUSCA DE PRODUTOS (Filtro de visibilidade, estoque e 12 itens na home)
/*async function fetchProducts(isInitial = false) {
    const query = isInitial ? "" : searchInput.value.trim();
    productsGrid.innerHTML = '<div class="loader">Carregando curadoria...</div>';
    
    try {
        // Buscamos os produtos da sua API na Vercel
        const response = await fetch(`/api/get-products?q=${encodeURIComponent(query)}`);
        let products = await response.json();

        // CORREÇÃO DO FILTRO:
        // Só removemos se for EXPLICITAMENTE falso. 
        // Se a propriedade não existir (undefined), o produto será exibido.
        products = products.filter(p => {
            const isVisible = p.visible !== false;
            const isPublished = p.published !== false;
            return isVisible || isPublished;
        });

        if (isInitial) {
            // Embaralha e pega os 12 para a home
            products = products.sort(() => 0.5 - Math.random()).slice(0, 12);
        }

        renderProducts(products);
    } catch (error) {
        console.error("Erro ao carregar produtos:", error);
        productsGrid.innerHTML = '<p>Erro ao conectar com a galeria.</p>';
    }
}*/

async function fetchProducts(isInitial = false) {
    const query = isInitial ? "" : searchInput.value.trim();
    productsGrid.innerHTML = '<div class="loader">Carregando curadoria...</div>';
    
    try {
        const response = await fetch(`/api/get-products?q=${encodeURIComponent(query)}`);
        let products = await response.json();

        // FILTRO: Só remove se for explicitamente falso.
        // Se a propriedade não vier do backend, ele assume que o produto é visível.
        products = products.filter(p => p.published !== false && p.visible !== false);

        if (isInitial) {
            // Agora, com per_page=100 no backend, teremos itens de sobra aqui
            products = products.sort(() => 0.5 - Math.random()).slice(0, 12);
        }

        renderProducts(products);
    } catch (error) {
        console.error(error);
        productsGrid.innerHTML = '<p>Erro ao conectar com a galeria.</p>';
    }
}

// 2. RENDERIZAR CARDS NA VITRINE (Com exibição de estoque)
function renderProducts(products) {
    productsGrid.innerHTML = '';
    products.forEach(p => {
        const stockQty = p.stock !== null && p.stock !== undefined ? p.stock : 0;
        const stockLabel = stockQty > 0 ? `${stockQty} un. em estoque` : "Sob consulta";
        const stockColor = stockQty > 0 ? "#2D5A27" : "#cc0000";

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku" style="font-size: 0.7rem; color: #999;">SKU: ${p.sku}</p>
                <p class="stock" style="font-size: 0.65rem; color: ${stockColor}; font-weight: bold; margin-bottom: 5px;">${stockLabel}</p>
                <p class="price" style="font-weight: bold; margin: 5px 0;">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <button class="btn-primary" style="width: 100%; font-size: 0.7rem;" onclick='adicionarAoOrcamento(${JSON.stringify(p).replace(/'/g, "&apos;")})'>
                    ADICIONAR AO PROJETO
                </button>
            </div>
        `;
        productsGrid.appendChild(card);
    });
}

// 3. ADICIONAR AO CARRINHO
function adicionarAoOrcamento(produto) {
    const novoItem = {
        ...produto,
        tempId: Date.now(),
        displayName: produto.name 
    };
    quoteCart.push(novoItem);
    renderQuoteSidebar();
}

// 4. RENDERIZAR LATERAL (Com Scroll e Edição)
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

// 5. GERAÇÃO DO PDF - OTIMIZADO (Dados de cliente, vendedor e 2 itens por página)
generatePdfBtn.addEventListener('click', () => {
    if (quoteCart.length === 0) return alert("Selecione itens primeiro.");

    const element = document.createElement('div');
    
    // CÁLCULO TOTAL CONSIDERANDO QTD
    const valorTotalOrcamento = quoteCart.reduce((acc, item) => {
        const qtd = parseInt(item.quantity) || 1;
        const preco = parseFloat(item.price) || 0;
        return acc + (preco * qtd);
    }, 0);

    const dataValidade = quoteValid.value ? new Date(quoteValid.value).toLocaleDateString('pt-BR') : 'A consultar';
    
    const textoInstitucionalFinal = `
        CADA PEÇA DA CASA TERRAZI É FRUTO DO DESIGN BRASILEIRO, CRIADA E PRODUZIDA INTEGRALMENTE NO BRASIL. 
        VALORIZAMOS A PRODUÇÃO LOCAL, O TALENTO DOS NOSSOS PROFISSIONAIS E A QUALIDADE QUE SÓ O OLHAR ATENTO 
        DE QUEM ENTENDE DO PRÓPRIO TERRITÓRIO PODE OFERECER. AO ESCOLHER UM DOS NOSSOS MÓVEIS, 
        VOCÊ LEVA PARA CASA NÃO APENAS SOFISTICAÇÃO E FUNCIONALIDADE, MAS TAMBÉM UMA HISTÓRIA FEITA AQUI 
        - COM ORIGINALIDADE, CUIDADO E IDENTIDADE BRASILEIRA.`;

    let html = `
        <style>
            .pdf-container { padding: 30px; font-family: 'Helvetica', sans-serif; color: #1a1a1a; }
            .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3017; padding-bottom: 10px; margin-bottom: 20px; }
            .pdf-logo { height: 40px; }
            .info-box { background: #f9f9f9; padding: 12px; border-radius: 4px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 10px; }

            .product-block { 
                display: block; width: 100%; margin-bottom: 25px; padding-bottom: 15px; 
                border-bottom: 1px solid #eee; page-break-inside: avoid !important; 
            }
            .product-content { display: flex; gap: 20px; }
            .left-column { width: 180px; flex-shrink: 0; }
            .product-image { width: 180px; height: 180px; object-fit: cover; border-radius: 4px; margin-bottom: 8px; }
            
            .dimensoes-box { font-size: 8.5px; line-height: 1.3; color: #1A3017; background: #E8F5E9; padding: 8px; border-radius: 4px; }
            .dimensoes-box strong { display: block; margin-bottom: 3px; text-transform: uppercase; font-size: 7.5px; border-bottom: 1px solid rgba(26,48,23,0.1); }

            .right-column { flex: 1; display: flex; flex-direction: column; }
            .product-title { font-size: 14px; font-weight: bold; text-transform: uppercase; margin: 0; color: #1A3017; }
            .sku-label { font-size: 8px; color: #999; margin-bottom: 6px; display: block; }
            .product-desc { font-size: 9.5px; line-height: 1.4; color: #444; text-align: justify; margin-bottom: 8px; flex-grow: 1; }
            
            .tech-info-box { font-size: 8.5px; line-height: 1.3; color: #555; border-top: 1px dashed #ccc; padding-top: 6px; margin-bottom: 10px; }

            /* TABELA DE PREÇOS POR ITEM */
            .item-price-table { width: 100%; border-collapse: collapse; margin-top: auto; background: #fdfdfd; border: 1px solid #eee; }
            .item-price-table th { font-size: 7px; text-transform: uppercase; color: #777; padding: 4px 8px; text-align: center; border-bottom: 1px solid #eee; }
            .item-price-table td { font-size: 11px; padding: 6px 8px; text-align: center; font-weight: bold; color: #1A3017; }
            .td-total { background: #f5f5f5; width: 40%; text-align: right !important; }

            .inst-footer { margin-top: 40px; padding: 15px; border-top: 1px solid #eee; font-size: 8.5px; color: #777; text-align: center; line-height: 1.5; font-style: italic; page-break-inside: avoid; }
            .total-final { margin-top: 5px; text-align: right; background: #1A3017; color: white; padding: 15px; border-radius: 4px; page-break-inside: avoid; }
        </style>

        <div class="pdf-container">
            <div class="pdf-header">
                <img src="${LOGO_URL}" class="pdf-logo">
                <div style="font-size: 9px; text-align: right;">
                    <strong>ORÇAMENTO TERRAZI</strong><br>
                    Data: ${new Date().toLocaleDateString('pt-BR')} | Validade: ${dataValidade}
                </div>
            </div>
            <div class="info-box">
                <div><strong>CLIENTE:</strong> ${custName.value || '---'}<br><strong>DOC:</strong> ${custDoc.value || '---'}</div>
                <div><strong>VENDEDOR:</strong> ${sellerName.value || '---'}<br><strong>CONTATO:</strong> ${sellerPhone.value || '---'}</div>
            </div>
    `;

    quoteCart.forEach(item => {
        const limparProfundo = (txt) => {
            if (!txt) return "";
            let limpo = txt.replace(/<\/?[^>]+(>|$)/g, "");
            const padraoInstitucional = /cada peça da casa terrazi[\s\S]*identidade brasileira/gi;
            const padraoDesign = /fruto do design brasileiro[\s\S]*identidade brasileira/gi;
            limpo = limpo.replace(padraoInstitucional, "").replace(padraoDesign, "").replace(/além dos produtos disponíveis no site[\s\S]*WHATSAPP/gi, "");
            return limpo.replace(/^[•\-\s*·]+|[•\-\s*·]+$/gm, "").trim();
        };

        const qtd = parseInt(item.quantity) || 1;
        const vUnit = parseFloat(item.price) || 0;
        const vTotalItem = qtd * vUnit;

        let rawText = item.description || "";
        let parts = rawText.split(/(características|medidas|dimensões|especificações|caraterísticas)/i);
        let emocional = limparProfundo(parts[0]);
        let tecnico = "";
        let dimensoes = "";

        for (let i = 1; i < parts.length; i += 2) {
            let label = parts[i].toLowerCase();
            let content = limparProfundo(parts[i+1]);
            if (content) {
                if (label.includes("dimensões") || label.includes("medidas")) dimensoes += content + "<br>";
                else tecnico += content + "<br>";
            }
        }

        html += `
            <div class="product-block">
                <div class="product-content">
                    <div class="left-column">
                        <img src="${item.image}" class="product-image">
                        ${dimensoes ? `<div class="dimensoes-box"><strong>Dimensões</strong>${dimensoes}</div>` : ''}
                    </div>
                    <div class="right-column">
                        <h2 class="product-title">${item.displayName}</h2>
                        <span class="sku-label">SKU: ${item.sku}</span>
                        <div class="product-desc">${emocional}</div>
                        ${tecnico ? `<div class="tech-info-box"><strong>Características</strong><br>${tecnico}</div>` : ''}
                        
                        <table class="item-price-table">
                            <thead>
                                <tr>
                                    <th>Qtd</th>
                                    <th>Valor Unitário</th>
                                    <th class="td-total">Subtotal Item</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>${qtd}</td>
                                    <td>R$ ${vUnit.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                    <td class="td-total">R$ ${vTotalItem.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
            <div class="inst-footer">${textoInstitucionalFinal}</div>
            <div class="total-final">
                <span style="font-size: 9px; text-transform: uppercase; opacity: 0.8;">Total Geral do Orçamento:</span><br>
                <span style="font-size: 22px;">R$ ${valorTotalOrcamento.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
        </div>
    `;

    element.innerHTML = html;
    html2pdf().set({
        margin: [0.4, 0.4],
        filename: `Terrazi_${custName.value || 'Orcamento'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
});

searchBtn.addEventListener('click', () => fetchProducts(false));
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchProducts(false); });

// Chame esta função sempre que mudar uma quantidade ou preço na tela
function atualizarDestaqueTotal() {
    const totalGeral = quoteCart.reduce((acc, item) => {
        const qtd = parseInt(item.quantity) || 1;
        const preco = parseFloat(item.price) || 0;
        return acc + (preco * qtd);
    }, 0);

    // Supondo que você tenha um elemento com id "total-destaque-tela"
    const display = document.getElementById('total-destaque-tela');
    if(display) {
        display.innerHTML = `Subtotal Geral: <strong>R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>`;
    }
}
