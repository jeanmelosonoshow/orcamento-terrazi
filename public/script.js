// Seletores de Elementos
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const productsGrid = document.getElementById('productsGrid');
const quoteItemsContainer = document.getElementById('quoteItems');
const generatePdfBtn = document.getElementById('generatePdfBtn');

// Estado da aplicação (itens no orçamento)
let quoteCart = [];

// 1. BUSCA DE PRODUTOS (Trazendo tudo em uma chamada)
async function fetchProducts() {
    const query = searchInput.value.trim();
    if (!query) return;

    productsGrid.innerHTML = '<div class="loader">Buscando na Nuvemshop...</div>';
    
    try {
        const response = await fetch(`/api/get-products?q=${encodeURIComponent(query)}`);
        const products = await response.json();

        if (products.length === 0) {
            productsGrid.innerHTML = '<p>Nenhum produto encontrado.</p>';
            return;
        }

        renderProducts(products);
    } catch (error) {
        console.error("Erro na busca:", error);
        productsGrid.innerHTML = '<p>Erro ao conectar com a loja.</p>';
    }
}

// 2. RENDERIZAR RESULTADOS DA BUSCA
function renderProducts(products) {
    productsGrid.innerHTML = '';
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}" loading="lazy">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku">SKU: ${p.sku}</p>
                <p class="stock">Estoque: ${p.stock} un</p>
                <p class="price">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <button class="btn-add" id="btn-${p.id}">+ ADICIONAR AO ORÇAMENTO</button>
            </div>
        `;
        
        // Evento de clique para adicionar ao orçamento
        card.querySelector('.btn-add').addEventListener('click', () => {
            adicionarAoOrcamento(p);
        });

        productsGrid.appendChild(card);
    });
}

// 3. ADICIONAR AO ORÇAMENTO + CHAMADA DE IA (Summarize)
async function adicionarAoOrcamento(produto) {
    // Evita adicionar o mesmo ID repetidamente se desejar, ou apenas gera um novo item
    const btn = document.getElementById(`btn-${produto.id}`);
    btn.innerText = "PROCESSANDO IA...";
    btn.disabled = true;

    // Criamos o objeto inicial do item
    const novoItem = {
        ...produto,
        tempId: Date.now(),
        briefingEditado: "Gerando resumo técnico inteligente..."
    };

    // Adiciona ao carrinho visual imediatamente para dar feedback ao usuário
    quoteCart.push(novoItem);
    renderQuoteSidebar();

    try {
        // Chamada para a API de IA da Vercel
        const aiResponse = await fetch('/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                productName: produto.name, 
                description: produto.description 
            })
        });

        const aiData = await aiResponse.json();

        // Atualiza o item no carrinho com o texto da IA
        const index = quoteCart.findIndex(item => item.tempId === novoItem.tempId);
        if (index !== -1) {
            quoteCart[index].briefingEditado = aiData.summary;
            renderQuoteSidebar();
        }

    } catch (error) {
        console.error("Erro na IA:", error);
        const index = quoteCart.findIndex(item => item.tempId === novoItem.tempId);
        quoteCart[index].briefingEditado = "Não foi possível gerar o resumo. Por favor, edite manualmente.";
        renderQuoteSidebar();
    } finally {
        btn.innerText = "+ ADICIONAR AO ORÇAMENTO";
        btn.disabled = false;
    }
}

// 4. RENDERIZAR LATERAL DE ORÇAMENTO (EDITÁVEL)
function renderQuoteSidebar() {
    quoteItemsContainer.innerHTML = '';

    quoteCart.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-quote-edit';
        itemDiv.innerHTML = `
            <div class="edit-header">
                <img src="${item.image}" width="40">
                <strong>${item.name}</strong>
                <button onclick="removerItem(${index})" class="btn-remove">×</button>
            </div>
            <div class="edit-body">
                <label>Preço Unitário (R$):</label>
                <input type="number" step="0.01" value="${item.price}" 
                    onchange="atualizarDados(${index}, 'price', this.value)">
                
                <label>Briefing Técnico (IA):</label>
                <textarea onchange="atualizarDados(${index}, 'briefingEditado', this.value)">${item.briefingEditado}</textarea>
            </div>
        `;
        quoteItemsContainer.appendChild(itemDiv);
    });
}

// 5. FUNÇÕES DE APOIO À EDIÇÃO
window.removerItem = (index) => {
    quoteCart.splice(index, 1);
    renderQuoteSidebar();
};

window.atualizarDados = (index, campo, valor) => {
    quoteCart[index][campo] = valor;
};

// 6. GERAÇÃO DO PDF (Usando html2pdf)
generatePdfBtn.addEventListener('click', () => {
    if (quoteCart.length === 0) {
        alert("Adicione pelo menos um item ao orçamento.");
        return;
    }

    // Criamos um elemento invisível para formatar o PDF de forma luxuosa
    const element = document.createElement('div');
    element.style.padding = "40px";
    element.style.color = "#1A3017";
    element.style.fontFamily = "'Inter', sans-serif";

    let htmlConteudo = `
        <h1 style="text-align:center; letter-spacing: 5px; border-bottom: 1px solid #1A3017; padding-bottom: 20px;">TERRAZI</h1>
        <h2 style="font-weight: 300; text-transform: uppercase; font-size: 14px; margin-bottom: 40px;">Proposta Técnica de Mobiliário</h2>
    `;

    quoteCart.forEach(item => {
        htmlConteudo += `
            <div style="display: flex; gap: 30px; margin-bottom: 40px; page-break-inside: avoid;">
                <img src="${item.image}" style="width: 200px; border-radius: 4px;">
                <div>
                    <h3 style="margin-top: 0;">${item.name}</h3>
                    <p style="font-size: 12px; color: #666;">SKU: ${item.sku}</p>
                    <div style="white-space: pre-wrap; font-size: 13px; line-height: 1.6; color: #333;">${item.briefingEditado}</div>
                    <p style="font-weight: 600; font-size: 16px; color: #2D5A27; margin-top: 15px;">
                        Valor Sugerido: R$ ${parseFloat(item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </p>
                </div>
            </div>
        `;
    });

    element.innerHTML = htmlConteudo;

    const opt = {
        margin: [0.5, 0.5],
        filename: `orcamento-terrazi-${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
});

// Event Listeners Iniciais
searchBtn.addEventListener('click', fetchProducts);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchProducts();
});
