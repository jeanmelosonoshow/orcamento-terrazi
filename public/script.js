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
const displayTotalGeral = document.getElementById('displayTotalGeral');

let quoteCart = [];
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";

// Carregar itens iniciais ao abrir a página
window.onload = () => fetchProducts(true);

// 1. BUSCA DE PRODUTOS
async function fetchProducts(isInitial = false) {
    const query = isInitial ? "" : searchInput.value.trim();
    productsGrid.innerHTML = '<div class="loader">Carregando curadoria...</div>';
    
    try {
        const response = await fetch(`/api/get-products?q=${encodeURIComponent(query)}`);
        let products = await response.json();

        products = products.filter(p => p.published !== false && p.visible !== false);

        if (isInitial) {
            products = products.sort(() => 0.5 - Math.random()).slice(0, 12);
        }

        renderProducts(products);
    } catch (error) {
        console.error(error);
        productsGrid.innerHTML = '<p>Erro ao conectar com a galeria.</p>';
    }
}

// 2. RENDERIZAR CARDS NA VITRINE
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
        displayName: produto.name,
        quantity: 1 // Garantindo quantidade inicial
    };
    quoteCart.push(novoItem);
    renderQuoteSidebar();
}

// 4. RENDERIZAR LATERAL (Com Quantidade e Preço)
function renderQuoteSidebar() {
    quoteItemsContainer.innerHTML = '';
    quoteCart.forEach((item, index) => {
        const subtotalItem = (item.quantity || 1) * item.price;
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-quote-edit';
        itemDiv.style = "margin-bottom: 15px; padding: 10px; border: 1px solid #eee; border-radius: 4px; background: #fff;";
        
        itemDiv.innerHTML = `
            <div class="edit-header" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <img src="${item.image}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 3px;">
                <div style="flex:1">
                    <input type="text" class="input-edit-name" value="${item.displayName}" 
                        style="width: 100%; font-size: 11px; font-weight: bold; border: 1px solid transparent;"
                        onchange="atualizarDados(${index}, 'displayName', this.value)">
                </div>
                <button onclick="removerItem(${index})" class="btn-remove" style="background:none; border:none; color:red; cursor:pointer; font-weight:bold;">×</button>
            </div>
            <div class="edit-body" style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px;">
                <div class="input-group">
                    <label style="font-size: 9px; display: block; color: #666;">QTD</label>
                    <input type="number" min="1" value="${item.quantity || 1}" 
                        style="width: 100%; font-size: 11px; padding: 4px;"
                        onchange="atualizarDados(${index}, 'quantity', this.value)">
                </div>
                <div class="input-group">
                    <label style="font-size: 9px; display: block; color: #666;">PREÇO UNIT. (R$)</label>
                    <input type="number" step="0.01" value="${item.price}" 
                        style="width: 100%; font-size: 11px; padding: 4px;"
                        onchange="atualizarDados(${index}, 'price', this.value)">
                </div>
            </div>
            <div style="text-align: right; margin-top: 5px; font-size: 10px; color: #1A3017; font-weight: bold;">
                Subtotal: R$ ${subtotalItem.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
            </div>
        `;
        quoteItemsContainer.appendChild(itemDiv);
    });
    atualizarDestaqueTotal();
}

window.atualizarDados = (index, campo, valor) => { 
    if (campo === 'price' || campo === 'quantity') {
        quoteCart[index][campo] = parseFloat(valor) || 0;
    } else {
        quoteCart[index][campo] = valor;
    }
    renderQuoteSidebar(); // Re-renderiza para atualizar subtotais individuais e total geral
};

window.removerItem = (index) => { 
    quoteCart.splice(index, 1); 
    renderQuoteSidebar(); 
};

function atualizarDestaqueTotal() {
    const totalGeral = quoteCart.reduce((acc, item) => {
        const qtd = parseInt(item.quantity) || 1;
        const preco = parseFloat(item.price) || 0;
        return acc + (preco * qtd);
    }, 0);

    if (displayTotalGeral) {
        displayTotalGeral.innerText = `R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    }
}

// 5. GERAÇÃO DO PDF
generatePdfBtn.addEventListener('click', () => {
    if (quoteCart.length === 0) return alert("Selecione itens primeiro.");

    const element = document.createElement('div');
    
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
            .pdf-body { 
                font-family: 'Helvetica', sans-serif; 
                color: #1a1a1a; 
                background: white; 
                padding: 40px 40px 30px 60px; /* Padding superior para não colar no topo */
                position: relative;
            }
            
            .brand-sidebar {
                position: absolute;
                left: 0; top: 0; bottom: 0;
                width: 8px;
                background: #1A3017;
            }

            .pdf-header { 
                display: flex; justify-content: space-between; align-items: flex-end; 
                border-bottom: 2px solid #1A3017; padding-bottom: 10px; 
                margin-bottom: 20px; 
            }
            
            .pdf-logo { height: 45px; }

            .header-info { text-align: right; line-height: 1.3; }
            .header-info strong { font-size: 11px; color: #1A3017; letter-spacing: 1px; text-transform: uppercase; }
            .header-info span { font-size: 9px; color: #666; }

            .info-box { 
                background: #f9f9f9; padding: 12px; border-radius: 4px; 
                margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; 
                gap: 15px; font-size: 10px; border: 1px solid #eee;
            }

            .product-block { 
                width: 100%; 
                page-break-inside: avoid !important; 
                margin-bottom: 25px; 
                padding-top: 15px; /* Margem de segurança caso inicie no topo da página */
                border-bottom: 1px solid #f0f0f0;
                padding-bottom: 15px;
            }
            
            .product-content { display: flex; gap: 20px; }
            .left-column { width: 180px; flex-shrink: 0; }
            .product-image { width: 180px; height: 180px; object-fit: cover; border-radius: 4px; margin-bottom: 8px; }
            
            .dimensoes-box { 
                font-size: 9px; line-height: 1.3; color: #1A3017; 
                background: #F4F9F4; padding: 8px; border-radius: 4px; 
            }
            .dimensoes-box strong { display: block; margin-bottom: 2px; text-transform: uppercase; font-size: 8px; border-bottom: 1px solid rgba(26,48,23,0.1); }

            .right-column { flex: 1; display: flex; flex-direction: column; }
            .product-title { font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 0; color: #1A3017; }
            .sku-label { font-size: 8px; color: #999; margin-bottom: 8px; display: block; }
            .product-desc { font-size: 10px; line-height: 1.4; color: #333; text-align: justify; margin-bottom: 10px; }
            
            /* CARACTERÍSTICAS REATIVADAS */
            .tech-info-box { 
                font-size: 9.5px; line-height: 1.3; color: #444; 
                border-top: 1px dashed #ddd; padding-top: 8px; margin-bottom: 12px; 
            }
            .tech-info-box strong { font-size: 8px; text-transform: uppercase; color: #1A3017; }

            .item-price-table { width: 100%; border-collapse: collapse; margin-top: auto; border: 1px solid #eee; }
            .item-price-table td { font-size: 11px; padding: 8px; text-align: center; font-weight: bold; color: #1A3017; }
            .td-label { font-size: 7.5px; text-transform: uppercase; color: #888; background: #fafafa; border-bottom: 1px solid #eee; font-weight: normal; }

            .footer-area { page-break-inside: avoid; margin-top: 15px; }
            .inst-footer { padding: 15px; border-top: 1px solid #eee; font-size: 8.5px; color: #777; text-align: center; line-height: 1.5; font-style: italic; }
            .total-final { text-align: right; background: #1A3017; color: white; padding: 15px; border-radius: 4px; }
        </style>
        
        <div class="pdf-body">
            <div class="brand-sidebar"></div>
            
            <div class="pdf-header">
                <img src="${LOGO_URL}" class="pdf-logo">
                <div class="header-info">
                    <strong>ORÇAMENTO TERRAZI</strong><br>
                    <span>Emissão: ${new Date().toLocaleDateString('pt-BR')}</span><br>
                    <span>Validade: ${dataValidade}</span>
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
                        
                        ${tecnico ? `<div class="tech-info-box"><strong>Características do Produto:</strong><br>${tecnico}</div>` : ''}
                        
                        <table class="item-price-table">
                            <tr>
                                <td class="td-label">Qtd</td>
                                <td class="td-label">Valor Unitário</td>
                                <td class="td-label" style="background: #f1f1f1; color: #1A3017;">Subtotal Item</td>
                            </tr>
                            <tr>
                                <td>${qtd}</td>
                                <td>R$ ${vUnit.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                <td style="background: #f1f1f1;">R$ ${vTotalItem.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
            <div class="footer-area">
                <div class="inst-footer">${textoInstitucionalFinal}</div>
                <div class="total-final">
                    <span style="font-size: 9px; text-transform: uppercase; opacity: 0.8;">Total Geral:</span><br>
                    <span style="font-size: 22px; font-weight: bold;">R$ ${valorTotalOrcamento.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
            </div>
        </div>
    `;

    element.innerHTML = html;
    
    html2pdf().set({
        margin: [20, 0, 20, 0], // Margem de segurança externa
        filename: `Terrazi_${custName.value || 'Orcamento'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    }).from(element).save();
});

searchBtn.addEventListener('click', () => fetchProducts(false));
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchProducts(false); });

// Função para limpar todo o orçamento
window.limparOrcamento = () => {
    if (quoteCart.length === 0) return;
    if (confirm("Deseja remover todos os itens do orçamento?")) {
        quoteCart = [];
        renderQuoteSidebar();
    }
};

// Ajuste na pesquisa: Voltar ao início quando o campo for limpo
searchInput.addEventListener('input', (e) => {
    if (e.target.value.trim() === "") {
        fetchProducts(true); // Carrega os 12 aleatórios da home novamente
    }
});

// Garante que o botão BUSCAR também funcione se clicar após limpar
searchBtn.addEventListener('click', () => {
    if (searchInput.value.trim() === "") {
        fetchProducts(true);
    } else {
        fetchProducts(false);
    }
});
