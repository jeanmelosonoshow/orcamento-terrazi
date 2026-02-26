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
    const valorTotal = quoteCart.reduce((acc, item) => acc + parseFloat(item.price), 0);
    
    // Texto institucional que vamos remover dos itens e colocar no fim
    const textoInstitucional = "cada peça da casa terrazi é fruto do design brasileiro";

    let html = `
        <style>
            .pdf-container { padding: 30px; font-family: 'Helvetica', Arial, sans-serif; color: #1a1a1a; }
            .pdf-header { text-align: center; border-bottom: 1px solid #1A3017; padding-bottom: 15px; margin-bottom: 25px; }
            .pdf-logo { height: 40px; }
            
            /* Container do Produto: Ajustado para caber 2 por página */
            .product-block { 
                display: flex; 
                gap: 20px; 
                margin-bottom: 30px; 
                page-break-inside: avoid; 
                border-bottom: 1px solid #eee; 
                padding-bottom: 20px;
                min-height: 380px; /* Garante consistência para caber 2 */
            }
            
            .left-column { width: 180px; flex-shrink: 0; }
            .product-image { width: 180px; height: 180px; object-fit: cover; margin-bottom: 10px; }
            
            /* O destaque vermelho: agora compacto abaixo da foto */
            .tech-specs { 
                font-size: 9px; 
                line-height: 1.3; 
                color: #1A3017; 
                background: #f9f9f9; 
                padding: 8px; 
                border-radius: 4px;
            }
            .tech-specs strong { display: block; margin-bottom: 4px; color: #2D5A27; text-transform: uppercase; }

            .right-column { flex: 1; }
            .product-name { font-size: 15px; font-weight: bold; text-transform: uppercase; margin: 0 0 5px 0; color: #1A3017; }
            .product-sku { font-size: 9px; color: #999; margin-bottom: 10px; }
            
            /* Descrição principal limpa */
            .product-desc { font-size: 10.5px; line-height: 1.5; color: #444; text-align: justify; }
            .product-price { font-size: 14px; font-weight: bold; margin-top: 10px; color: #1A3017; }

            .institutional-footer { margin-top: 20px; padding: 15px; border-top: 1px solid #eee; font-size: 10px; color: #777; font-style: italic; text-align: center; }
            .footer-total { margin-top: 20px; text-align: right; background: #1A3017; color: white; padding: 15px; border-radius: 4px; }
        </style>

        <div class="pdf-container">
            <div class="pdf-header">
                <img src="${LOGO_URL}" class="pdf-logo">
            </div>
    `;

    quoteCart.forEach(item => {
        // 1. Limpeza da descrição: remove o texto institucional repetitivo
        let descLimpa = item.description;
        if (descLimpa.toLowerCase().includes("cada peça da casa terrazi")) {
            descLimpa = descLimpa.split(/cada peça da casa terrazi/i)[0];
        }

        // 2. Separação visual: vamos tentar identificar a parte de "características" 
        // Se houver uma tag de lista ou um marcador específico, poderíamos mover, 
        // mas aqui vamos tratar a descrição limpa no bloco principal.
        
        html += `
            <div class="product-block">
                <div class="left-column">
                    <img src="${item.image}" class="product-image">
                    <div class="tech-specs">
                        <strong>Especificações Técnicas</strong>
                        Referência: ${item.sku}<br>
                        Garantia: 12 meses estrutura<br>
                        Procedência: Brasil
                    </div>
                </div>
                <div class="right-column">
                    <h2 class="product-name">${item.displayName}</h2>
                    <div class="product-sku">REF: ${item.sku}</div>
                    <div class="product-desc">${descLimpa}</div>
                    <div class="product-price">Investimento: R$ ${parseFloat(item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                </div>
            </div>
        `;
    });

    html += `
            <div class="institutional-footer">
                ${textoInstitucional} e produzida integralmente no Brasil. Valorizamos a produção local e a identidade brasileira.
            </div>
            <div class="footer-total">
                <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Total do Orçamento:</span><br>
                <span style="font-size: 22px;">R$ ${valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
        </div>
    `;

    element.innerHTML = html;

    const opt = {
        margin: [0.3, 0.3], // Margens menores para ganhar espaço
        filename: `Terrazi_Orcamento.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
});

searchBtn.addEventListener('click', () => fetchProducts(false));
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchProducts(false); });
