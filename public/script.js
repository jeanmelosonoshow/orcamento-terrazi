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
    const valorTotal = quoteCart.reduce((acc, item) => acc + parseFloat(item.price), 0);
    const dataValidade = quoteValid.value ? new Date(quoteValid.value).toLocaleDateString('pt-BR') : 'A consultar';
    
    const textoInstitucionalFinal = `
        É FRUTO DO DESIGN BRASILEIRO. CRIADA E PRODUZIDA INTEGRALMENTE NO BRASIL. 
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
                display: flex; gap: 25px; margin-bottom: 30px; padding-bottom: 20px; 
                border-bottom: 1px solid #eee; 
                page-break-inside: avoid; 
                break-inside: avoid;
            }
            
            .left-column { width: 210px; flex-shrink: 0; }
            .product-image { width: 210px; height: 210px; object-fit: cover; border-radius: 4px; margin-bottom: 8px; }
            
            .dimensoes-box { font-size: 9px; line-height: 1.3; color: #1A3017; background: #E8F5E9; padding: 8px; border-radius: 4px; }
            .dimensoes-box strong { display: block; margin-bottom: 3px; text-transform: uppercase; font-size: 8px; border-bottom: 1px solid rgba(26,48,23,0.2); }

            .right-column { flex: 1; }
            .product-title { font-size: 15px; font-weight: bold; text-transform: uppercase; margin: 0; color: #1A3017; }
            .sku-label { font-size: 9px; color: #999; margin-bottom: 8px; display: block; }
            
            .product-desc { font-size: 10px; line-height: 1.4; color: #444; text-align: justify; margin-bottom: 8px; }
            
            .tech-info-box { font-size: 9px; line-height: 1.3; color: #555; border-top: 1px dashed #ccc; padding-top: 8px; margin-top: 0; }
            .tech-info-box strong { color: #1A3017; text-transform: uppercase; font-size: 8.5px; display: block; margin-bottom: 4px; }

            .price-row { font-size: 13px; font-weight: bold; margin-top: 12px; color: #1A3017; text-align: right; background: #f5f5f5; padding: 6px 10px; border-radius: 4px; }

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
        // Função interna para limpar o lixo de qualquer string (Institucional, WhatsApp, Tags e Marcadores)
        const limparTexto = (txt) => {
            if (!txt) return "";
            return txt
                .replace(/cada peça da casa terrazi[\s\S]*identidade brasileira\./gi, "") // Remove o institucional (mesmo se estiver no meio das dimensões)
                .replace(/É FRUTO DO DESIGN BRASILEIRO[\s\S]*IDENTIDADE BRASILEIRA\./gi, "")
                .replace(/além dos produtos disponíveis no site[\s\S]*WHATSAPP/gi, "")
                .replace(/<\/?[^>]+(>|$)/g, "") // Remove tags HTML como <li>, <ul>, etc.
                .replace(/^[•\-\s*·]+|[•\-\s*·]+$/gm, "") // Remove pontos de lista e traços órfãos
                .trim();
        };

        let rawText = item.description || "";
        
        // Separação de blocos
        let parts = rawText.split(/(características|medidas|dimensões|especificações|caraterísticas)/i);
        let emocional = limparTexto(parts[0]);
        
        let tecnico = "";
        let dimensoes = "";

        for (let i = 1; i < parts.length; i += 2) {
            let label = parts[i].toLowerCase();
            let content = limparTexto(parts[i+1]);
            
            if (content) {
                if (label.includes("dimensões") || label.includes("medidas")) {
                    dimensoes += content + "<br>";
                } else {
                    tecnico += content + "<br>";
                }
            }
        }

        html += `
            <div class="product-block">
                <div class="left-column">
                    <img src="${item.image}" class="product-image">
                    ${dimensoes ? `<div class="dimensoes-box"><strong>Dimensões</strong>${dimensoes}</div>` : ''}
                </div>
                <div class="right-column">
                    <h2 class="product-title">${item.displayName}</h2>
                    <span class="sku-label">SKU: ${item.sku}</span>
                    
                    <div class="product-desc">${emocional}</div>
                    
                    ${tecnico ? `
                    <div class="tech-info-box">
                        <strong>Características do Produto</strong>
                        ${tecnico}
                    </div>` : ''}
                    
                    <div class="price-row">VALOR UNITÁRIO: R$ ${parseFloat(item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                </div>
            </div>
        `;
    });

    html += `
            <div class="inst-footer">${textoInstitucionalFinal}</div>
            <div class="total-final">
                <span style="font-size: 9px; text-transform: uppercase; opacity: 0.8;">Total Geral do Orçamento:</span><br>
                <span style="font-size: 22px;">R$ ${valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
        </div>
    `;

    element.innerHTML = html;
    html2pdf().set({
        margin: [0.4, 0.4],
        filename: `Terrazi_${custName.value || 'Orcamento'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
});

searchBtn.addEventListener('click', () => fetchProducts(false));
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchProducts(false); });
