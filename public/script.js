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
            .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3017; padding-bottom: 15px; margin-bottom: 20px; }
            .pdf-logo { height: 45px; }
            
            .client-vendedor-box { 
                background: #f9f9f9; padding: 15px; border-radius: 4px; margin-bottom: 20px; 
                display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 10px;
            }

            .product-block { 
                display: flex; gap: 25px; margin-bottom: 20px; 
                padding-bottom: 20px; border-bottom: 1px solid #eee;
                page-break-inside: avoid; min-height: 400px; 
            }
            .left-column { width: 210px; flex-shrink: 0; }
            .product-image { width: 210px; height: 210px; object-fit: cover; border-radius: 4px; margin-bottom: 10px; }
            
            /* Apenas Dimensões abaixo da foto */
            .dimensoes-specs { font-size: 9px; line-height: 1.4; color: #1A3017; background: #E8F5E9; padding: 10px; border-radius: 4px; }
            .dimensoes-specs strong { display: block; margin-bottom: 5px; text-transform: uppercase; border-bottom: 1px solid rgba(26,48,23,0.2); }

            .right-column { flex: 1; display: flex; flex-direction: column; }
            .product-name { font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 0; color: #1A3017; }
            .product-sku { font-size: 9px; color: #999; margin-bottom: 10px; font-weight: bold; }
            .product-desc { font-size: 10.5px; line-height: 1.5; color: #444; text-align: justify; margin-bottom: 15px; }
            
            /* Info Técnica abaixo do descritivo */
            .tech-info-area { font-size: 9.5px; line-height: 1.4; color: #555; border-top: 1px dashed #ccc; padding-top: 10px; margin-top: auto; }
            .tech-info-area strong { color: #1A3017; text-transform: uppercase; font-size: 9px; }

            .product-price { font-size: 14px; font-weight: bold; margin-top: 15px; color: #1A3017; text-align: right; background: #f2f2f2; padding: 8px; border-radius: 4px; }

            .institutional-footer { margin-top: 30px; padding: 20px; border-top: 1px solid #eee; font-size: 9px; color: #666; text-align: center; line-height: 1.6; }
            .footer-total { margin-top: 10px; text-align: right; background: #1A3017; color: white; padding: 20px; border-radius: 4px; }
        </style>

        <div class="pdf-container">
            <div class="pdf-header">
                <img src="${LOGO_URL}" class="pdf-logo">
                <div style="font-size: 10px; text-align: right;">
                    <strong>ORÇAMENTO TERRAZI</strong><br>
                    Data: ${new Date().toLocaleDateString('pt-BR')}<br>
                    Validade: ${dataValidade}
                </div>
            </div>

            <div class="client-vendedor-box">
                <div><strong>DADOS DO CLIENTE</strong><br>Nome: ${custName.value || '---'}<br>Documento: ${custDoc.value || '---'}</div>
                <div><strong>CONSULTOR TERRAZI</strong><br>Vendedor: ${sellerName.value || '---'}<br>Contato: ${sellerPhone.value || '---'}</div>
            </div>
    `;

    quoteCart.forEach(item => {
        let descLimpa = item.description || "";

        // 1. Remove os textos repetitivos
        descLimpa = descLimpa.replace(/É FRUTO DO DESIGN BRASILEIRO[\s\S]*IDENTIDADE BRASILEIRA\./gi, "");
        descLimpa = descLimpa.replace(/além dos produtos disponíveis no site[\s\S]*WHATSAPP/gi, "");

        // 2. Separa Texto Emocional, Características (Técnico) e Dimensões
        let partes = descLimpa.split(/(características|medidas|dimensões|especificações)/i);
        let textoDescritivo = partes[0].trim();
        
        let textoTecnico = "";
        let textoDimensoes = "";

        // Organiza as partes encontradas
        for (let i = 1; i < partes.length; i += 2) {
            let chave = partes[i].toLowerCase();
            let valor = partes[i+1] ? partes[i+1].trim() : "";
            
            if (chave.includes("dimensões") || chave.includes("medidas")) {
                textoDimensoes += valor;
            } else {
                textoTecnico += `<strong>${partes[i]}:</strong> ${valor}<br>`;
            }
        }

        html += `
            <div class="product-block">
                <div class="left-column">
                    <img src="${item.image}" class="product-image">
                    ${textoDimensoes ? `
                    <div class="dimensoes-specs">
                        <strong>Dimensões</strong>
                        ${textoDimensoes}
                    </div>` : ''}
                </div>
                <div class="right-column">
                    <h2 class="product-name">${item.displayName}</h2>
                    <div class="product-sku">SKU: ${item.sku}</div>
                    
                    <div class="product-desc">${textoDescritivo}</div>
                    
                    ${textoTecnico ? `
                    <div class="tech-info-area">
                        ${textoTecnico}
                    </div>` : ''}
                    
                    <div class="product-price">VALOR UNITÁRIO: R$ ${parseFloat(item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                </div>
            </div>
        `;
    });

    html += `
            <div class="institutional-footer">
                ${textoInstitucionalFinal}
            </div>
            <div class="footer-total">
                <span style="font-size: 10px; text-transform: uppercase; opacity: 0.8;">Total Geral do Orçamento:</span><br>
                <span style="font-size: 24px;">R$ ${valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
        </div>
    `;

    element.innerHTML = html;
    html2pdf().set({
        margin: [0.3, 0.3],
        filename: `Terrazi_${custName.value || 'Orcamento'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
});

searchBtn.addEventListener('click', () => fetchProducts(false));
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchProducts(false); });
