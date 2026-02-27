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
    const textoInstitucional = "Cada peça da Casa Terrazi é fruto do design brasileiro";

    let html = `
        <style>
            .pdf-container { padding: 20px; font-family: 'Helvetica', Arial, sans-serif; color: #1a1a1a; }
            .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3017; padding-bottom: 10px; margin-bottom: 20px; }
            .pdf-logo { height: 45px; }
            .header-info { font-size: 10px; text-align: right; color: #444; line-height: 1.4; }
            
            .client-vendedor-box { 
                background: #f4f4f4; padding: 12px; border-radius: 4px; margin-bottom: 20px; 
                display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 10px; border: 1px solid #eee;
            }

            /* Forçar 2 produtos por página */
            .product-block { 
                display: flex; gap: 25px; 
                padding: 20px 0;
                border-bottom: 1px solid #eee; 
                min-height: 440px; /* Altura ideal para caber exatamente 2 em um A4 */
                page-break-inside: avoid;
            }
            
            .left-column { width: 220px; flex-shrink: 0; display: flex; flex-direction: column; }
            .product-image { width: 220px; height: 220px; object-fit: cover; border-radius: 4px; margin-bottom: 12px; border: 1px solid #f0f0f0; }
            
            .tech-specs { 
                font-size: 9px; line-height: 1.4; color: #1A3017; background: #f9f9f9; 
                padding: 10px; border-radius: 4px; border-left: 3px solid #1A3017;
            }
            .tech-specs strong { display: block; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }

            .right-column { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; }
            .product-name { font-size: 18px; font-weight: bold; text-transform: uppercase; margin: 0 0 5px 0; color: #1A3017; border-bottom: 1px solid #1A3017; padding-bottom: 5px; }
            .product-sku { font-size: 10px; color: #888; margin-bottom: 15px; font-weight: bold; }
            .product-desc { font-size: 11px; line-height: 1.6; color: #333; text-align: justify; margin-bottom: 15px; }
            
            .product-price { 
                margin-top: auto; font-size: 16px; font-weight: bold; color: #1A3017; 
                background: #f0f3f0; padding: 10px; border-radius: 4px; text-align: right;
            }

            .footer-total { 
                margin-top: 30px; text-align: right; background: #1A3017; color: white; 
                padding: 20px; border-radius: 4px; page-break-inside: avoid;
            }
            .inst-footer { font-size: 9px; color: #777; text-align: center; margin-top: 15px; font-style: italic; }
        </style>

        <div class="pdf-container">
            <div class="pdf-header">
                <img src="${LOGO_URL}" class="pdf-logo">
                <div class="header-info">
                    <strong>ORÇAMENTO TERRAZI</strong><br>
                    Emissão: ${new Date().toLocaleDateString('pt-BR')}<br>
                    Validade: ${dataValidade}
                </div>
            </div>

            <div class="client-vendedor-box">
                <div>
                    <strong style="color:#1A3017">DADOS DO CLIENTE</strong><br>
                    Nome: ${custName.value || '---'}<br>
                    CPF/CNPJ: ${custDoc.value || '---'}
                </div>
                <div>
                    <strong style="color:#1A3017">CONSULTOR TERRAZI</strong><br>
                    Vendedor: ${sellerName.value || '---'}<br>
                    Contato: ${sellerPhone.value || '---'}
                </div>
            </div>
    `;

    quoteCart.forEach(item => {
        // --- TRATAMENTO DA DESCRIÇÃO ---
        let rawDesc = item.description || "";
        
        // Remove texto institucional repetido
        rawDesc = rawDesc.replace(/cada peça da casa terrazi/gi, "");

        // Tenta separar características (lista/medidas) da descrição emocional
        // Geralmente características técnicas vêm após palavras-chave como "características", "medidas" ou "estrutura"
        let descParts = rawDesc.split(/(características|medidas|especificações|estrutura do produto|dimensões)/i);
        let textoEmocional = descParts[0].trim();
        let textoTecnico = descParts.slice(1).join(" ").trim();

        html += `
            <div class="product-block">
                <div class="left-column">
                    <img src="${item.image}" class="product-image">
                    <div class="tech-specs">
                        <strong>Especificações Técnicas</strong>
                        ${textoTecnico || 'Consulte nossa equipe para detalhes de medidas e acabamentos personalizados.'}
                    </div>
                </div>
                <div class="right-column">
                    <h2 class="product-name">${item.displayName}</h2>
                    <div class="product-sku">REF: ${item.sku}</div>
                    <div class="product-desc">${textoEmocional}</div>
                    <div class="product-price">
                        <span style="font-size: 10px; font-weight: normal; text-transform: uppercase; display: block;">Valor Unitário</span>
                        R$ ${parseFloat(item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </div>
                </div>
            </div>
        `;
    });

    html += `
            <div class="footer-total">
                <span style="font-size: 11px; text-transform: uppercase; opacity: 0.8;">Valor Total do Projeto</span><br>
                <span style="font-size: 28px; letter-spacing: -1px;">R$ ${valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            <div class="inst-footer">
                ${textoInstitucional} e produzida integralmente no Brasil.
            </div>
        </div>
    `;

    element.innerHTML = html;
    
    const opt = {
        margin: [0.2, 0.2],
        filename: `Terrazi_Orcamento_${custName.value || 'Cliente'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
});

searchBtn.addEventListener('click', () => fetchProducts(false));
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchProducts(false); });
