// Seletores
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const productsGrid = document.getElementById('productsGrid');
const quoteItemsContainer = document.getElementById('quoteItems');
const generatePdfBtn = document.getElementById('generatePdfBtn');

// Seletores para dados do orçamento
const custName = document.getElementById('custName');
const custDoc = document.getElementById('custDoc');
const quoteValid = document.getElementById('quoteValid');
const sellerName = document.getElementById('sellerName');
const sellerPhone = document.getElementById('sellerPhone');
const generalObs = document.getElementById('generalObs');
const displayTotalGeral = document.getElementById('displayTotalGeral');

let quoteCart = [];
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";

// 1. INICIALIZAÇÃO E CLONAGEM
window.onload = () => {
    fetchProducts(true);
    
    const clonarData = localStorage.getItem('clonar_orcamento');
    if (clonarData) {
        const data = JSON.parse(clonarData);
        custName.value = data.cliente_nome || '';
        custDoc.value = data.cliente_doc || '';
        sellerName.value = data.vendedor_nome || '';
        sellerPhone.value = data.vendedor_contato || '';
        generalObs.value = data.obs_geral || '';
        
        quoteCart = data.items.map(item => ({
            sku: item.sku,
            displayName: item.nome_produto,
            price: parseFloat(item.preco_unitario),
            quantity: item.quantidade,
            variation: item.variacao,
            image: item.imagem_url,
            description: item.descricao_tecnica,
            tempId: Date.now() + Math.random()
        }));
        
        renderQuoteSidebar();
        localStorage.removeItem('clonar_orcamento');
    }
};

// 2. BUSCA DE PRODUTOS COM RESTAURAÇÃO AUTOMÁTICA
async function fetchProducts(isInitial = false) {
    const query = searchInput.value.trim();
    
    // Se não for inicial e o campo estiver vazio, volta para a exibição inicial
    if (!isInitial && query === "") {
        return fetchProducts(true);
    }

    productsGrid.innerHTML = '<div class="loader">Carregando curadoria...</div>';
    
    try {
        const url = isInitial ? `/api/get-products?q=` : `/api/get-products?q=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        let products = await response.json();
        
        // Filtro de segurança (já feito no backend, mas mantido por precaução)
        products = products.filter(p => p.published !== false);
        
        // Se for a carga inicial, embaralha e pega 12
        if (isInitial) {
            products = products.sort(() => 0.5 - Math.random()).slice(0, 12);
        }
        
        renderProducts(products);
    } catch (error) {
        console.error(error);
        productsGrid.innerHTML = '<p>Erro ao conectar com a galeria.</p>';
    }
}

// 3. RENDERIZAÇÃO COM EXIBIÇÃO DE ESTOQUE
function renderProducts(products) {
    productsGrid.innerHTML = '';
    
    if (products.length === 0) {
        productsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 20px;">Nenhum produto encontrado.</p>';
        return;
    }

    products.forEach(p => {
        // Lógica de cor para o estoque
        const isLowStock = typeof p.stock === 'number' && p.stock <= 3;
        const stockLabel = p.stock === "Sob Consulta" ? "Sob Consulta" : `Estoque: ${p.stock}`;
        const stockColor = isLowStock ? "#d9534f" : "#5cb85c";

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku" style="font-size: 0.7rem; color: #999;">SKU: ${p.sku}</p>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin: 8px 0;">
                    <p class="price" style="font-weight: bold; margin: 0; color: #1A3017;">
                        R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </p>
                    <span class="stock-badge" style="font-size: 0.65rem; padding: 2px 6px; border-radius: 10px; background: #f0f0f0; color: ${stockColor}; font-weight: bold; border: 1px solid #eee;">
                        ${stockLabel}
                    </span>
                </div>

                <button class="btn-primary" style="width: 100%; font-size: 0.7rem;" onclick='adicionarAoOrcamento(${JSON.stringify(p).replace(/'/g, "&apos;")})'>
                    ADICIONAR AO PROJETO
                </button>
            </div>
        `;
        productsGrid.appendChild(card);
    });
}

// --- Eventos de Busca Atualizados ---

// 1. Monitora digitação (Input) para voltar ao início ao apagar
searchInput.addEventListener('input', () => {
    if (searchInput.value.trim() === "") {
        fetchProducts(true);
    }
});

// 2. Busca ao clicar no botão
searchBtn.addEventListener('click', () => fetchProducts(false));

// 3. Busca ao apertar Enter
searchInput.addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') fetchProducts(false); 
});

// --- Restante das Funções (Mantidas conforme script original) ---

function adicionarAoOrcamento(produto) {
    const novoItem = {
        ...produto,
        tempId: Date.now(),
        displayName: produto.name,
        quantity: 1,
        variation: ""
    };
    quoteCart.push(novoItem);
    renderQuoteSidebar();
}

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
            <div style="margin-bottom: 8px;">
                <input type="text" placeholder="Variação (Tecido, Cor, Acabamento...)" value="${item.variation || ''}" 
                    style="width: 100%; font-size: 10px; padding: 4px; border: 1px solid #eee; border-radius: 3px; background: #fdfdfd;"
                    onchange="atualizarDados(${index}, 'variation', this.value)">
            </div>
            <div class="edit-body" style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px;">
                <div class="input-group"><label style="font-size: 9px; color: #666;">QTD</label>
                    <input type="number" min="1" value="${item.quantity || 1}" style="width: 100%; font-size: 11px; padding: 4px;" onchange="atualizarDados(${index}, 'quantity', this.value)">
                </div>
                <div class="input-group"><label style="font-size: 9px; color: #666;">PREÇO UNIT. (R$)</label>
                    <input type="number" step="0.01" value="${item.price}" style="width: 100%; font-size: 11px; padding: 4px;" onchange="atualizarDados(${index}, 'price', this.value)">
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

// ... (Funções atualizarDados, removerItem, atualizarDestaqueTotal, salvarNoBanco e generatePdfBtn permanecem iguais)
