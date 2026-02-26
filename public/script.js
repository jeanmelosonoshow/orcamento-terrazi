const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const productsGrid = document.getElementById('productsGrid');
const quoteItemsContainer = document.getElementById('quoteItems');
const generatePdfBtn = document.getElementById('generatePdfBtn');

let quoteCart = [];
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";

// Carrega itens aleatórios ao abrir para não ficar vazio
window.onload = () => fetchProducts(true);

async function fetchProducts(isInitial = false) {
    const query = isInitial ? "mesa" : searchInput.value.trim();
    productsGrid.innerHTML = '<div class="loader">Buscando...</div>';
    
    try {
        const response = await fetch(`/api/get-products?q=${encodeURIComponent(query)}`);
        let products = await response.json();

        if (isInitial) {
            products = products.sort(() => 0.5 - Math.random()).slice(0, 8);
        }

        renderProducts(products);
    } catch (error) {
        productsGrid.innerHTML = '<p>Erro ao conectar.</p>';
    }
}

function renderProducts(products) {
    productsGrid.innerHTML = '';
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        // Mantendo exatamente o seu layout de miniatura com Debug Descrição
        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}" loading="lazy">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku">SKU: ${p.sku}</p>
                <p class="price">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <div style="background: #f4f4f4; padding: 5px; font-size: 10px; margin: 10px 0; border: 1px dashed #ccc; color: #666;">
                    <strong>Preview Descrição:</strong><br>
                    ${p.description ? p.description.substring(0, 50).replace(/<[^>]*>?/gm, '') + "..." : "Sem descrição"}
                </div>
                <button class="btn-add" id="btn-${p.id}">+ ADICIONAR AO ORÇAMENTO</button>
            </div>
        `;
        
        card.querySelector('.btn-add').addEventListener('click', () => adicionarAoOrcamento(p));
        productsGrid.appendChild(card);
    });
}

async function adicionarAoOrcamento(produto) {
    const btn = document.getElementById(`btn-${produto.id}`);
    if(btn) { btn.innerText = "PROCESSANDO..."; btn.disabled = true; }

    const novoItem = {
        ...produto,
        tempId: Date.now(),
        editName: produto.name, // Campo para você editar o nome
        briefingEditado: "Gerando resumo..."
    };

    quoteCart.push(novoItem);
    renderQuoteSidebar();

    try {
        const aiResponse = await fetch('/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productName: produto.name, description: produto.description })
        });
        const aiData = await aiResponse.json();
        const index = quoteCart.findIndex(item => item.tempId === novoItem.tempId);
        if (index !== -1) {
            // Se a IA falhar, usamos a descrição original (Fallback)
            quoteCart[index].briefingEditado = aiData.summary || produto.description;
            renderQuoteSidebar();
        }
    } catch (error) {
        const index = quoteCart.findIndex(item => item.tempId === novoItem.tempId);
        if (index !== -1) { quoteCart[index].briefingEditado = produto.description; }
    } finally {
        if(btn) { btn.innerText = "+ ADICIONAR AO ORÇAMENTO"; btn.disabled = false; }
    }
}

function renderQuoteSidebar() {
    quoteItemsContainer.innerHTML = '';
    quoteCart.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-quote-edit';
        // Layout do carrinho com campos editáveis de NOME e PREÇO
        itemDiv.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
                <img src="${item.image}" width="40" style="border-radius:4px;">
                <input type="text" value="${item.editName}" 
                    style="flex:1; font-weight:bold; border:none; border-bottom:1px solid #ddd;"
                    onchange="atualizarDados(${index}, 'editName', this.value)">
                <button onclick="removerItem(${index})" style="background:none; border:none; cursor:pointer;">×</button>
            </div>
            <div style="font-size:12px;">
                <label>Preço R$:</label>
                <input type="number" step="0.01" value="${item.price}" 
                    style="width:80px; margin-left:5px;"
                    onchange="atualizarDados(${index}, 'price', this.value)">
            </div>
            <hr style="border:0; border-top:1px solid #f0f0f0; margin:10px 0;">
        `;
        quoteItemsContainer.appendChild(itemDiv);
    });
}

window.removerItem = (index) => { quoteCart.splice(index, 1); renderQuoteSidebar(); };
window.atualizarDados = (index, campo, valor) => { quoteCart[index][campo] = valor; };

// GERAÇÃO DO PDF - ELEGANTE E SEM QUEBRAS ERRADAS
generatePdfBtn.addEventListener('click', () => {
    if (quoteCart.length === 0) return alert("Adicione itens.");

    const element = document.createElement('div');
    element.style.padding = "40px";
    element.style.fontFamily = "'Inter', sans-serif";

    const total = quoteCart.reduce((acc, item) => acc + parseFloat(item.price), 0);

    let html = `
        <div style="text-align:center; border-bottom:1px solid #1A3017; padding-bottom:20px; margin-bottom:30px;">
            <img src="${LOGO_URL}" style="height:50px;">
            <h2 style="font-weight:300; font-size:12px; letter-spacing:3px; margin-top:10px;">PROPOSTA TÉCNICA</h2>
        </div>
    `;

    quoteCart.forEach(item => {
        html += `
            <div style="display:flex; gap:30px; margin-bottom:40px; page-break-inside:avoid; align-items:flex-start;">
                <img src="${item.image}" style="width:180px; border-radius:4px;">
                <div style="flex:1;">
                    <h3 style="margin:0; font-size:16px; text-transform:uppercase;">${item.editName}</h3>
                    <p style="font-size:10px; color:#999; margin-bottom:10px;">SKU: ${item.sku}</p>
                    <div style="font-size:12px; line-height:1.6; color:#333;">
                        ${item.briefingEditado}
                    </div>
                    <p style="font-weight:bold; margin-top:10px; color:#1A3017;">R$ ${parseFloat(item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                </div>
            </div>
        `;
    });

    html += `
        <div style="margin-top:40px; padding:20px; background:#f9f9f9; text-align:right; page-break-inside:avoid;">
            <p style="margin:0; font-size:12px; color:#666;">TOTAL DO ORÇAMENTO</p>
            <h2 style="margin:0; font-size:24px; color:#1A3017;">R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h2>
        </div>
    `;

    element.innerHTML = html;
    html2pdf().set({
        margin: [0.5, 0.5],
        filename: 'Terrazi-Orcamento.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
});

searchBtn.addEventListener('click', () => fetchProducts(false));
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchProducts(false); });
