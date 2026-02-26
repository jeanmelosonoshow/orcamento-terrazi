// Seletores de Elementos
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const productsGrid = document.getElementById('productsGrid');
const quoteItemsContainer = document.getElementById('quoteItems');
const generatePdfBtn = document.getElementById('generatePdfBtn');

let quoteCart = [];
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";

// --- NOVIDADE: CARREGAMENTO INICIAL ALEATÓRIO ---
window.onload = () => {
    fetchProducts(true); // Chama a busca sem termo para pegar itens iniciais
};

async function fetchProducts(isInitial = false) {
    const query = isInitial ? "mesa" : searchInput.value.trim(); // "mesa" como fallback para popular a home
    
    productsGrid.innerHTML = '<div class="loader">Carregando curadoria...</div>';
    
    try {
        const response = await fetch(`/api/get-products?q=${encodeURIComponent(query)}`);
        let products = await response.json();

        if (isInitial) {
            products = products.sort(() => 0.5 - Math.random()).slice(0, 8);
        }

        if (products.length === 0) {
            productsGrid.innerHTML = '<p>Nenhum produto encontrado.</p>';
            return;
        }

        renderProducts(products);
    } catch (error) {
        productsGrid.innerHTML = '<p>Erro ao conectar com a loja.</p>';
    }
}

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
                <p class="price">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <button class="btn-add" id="btn-${p.id}">+ ADICIONAR AO ORÇAMENTO</button>
            </div>
        `;
        
        card.querySelector('.btn-add').addEventListener('click', () => {
            adicionarAoOrcamento(p);
        });
        productsGrid.appendChild(card);
    });
}

async function adicionarAoOrcamento(produto) {
    const btn = document.getElementById(`btn-${produto.id}`);
    if(btn) { btn.innerText = "PROCESSANDO..."; btn.disabled = true; }

    const novoItem = {
        ...produto,
        tempId: Date.now(),
        editName: produto.name, // Nome editável
        briefingEditado: "Buscando detalhes técnicos..."
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
        itemDiv.innerHTML = `
            <div class="edit-header" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                <img src="${item.image}" width="45" height="45" style="object-fit:cover; border-radius:4px;">
                <input type="text" value="${item.editName}" 
                    style="flex:1; font-weight:600; border:none; border-bottom:1px solid #eee; padding:5px;"
                    onchange="atualizarDados(${index}, 'editName', this.value)">
                <button onclick="removerItem(${index})" class="btn-remove">×</button>
            </div>
            <div class="edit-body" style="display:flex; align-items:center; gap:10px;">
                <label style="font-size:11px;">R$</label>
                <input type="number" step="0.01" value="${item.price}" 
                    style="width:100%; border:1px solid #eee; padding:5px; border-radius:4px;"
                    onchange="atualizarDados(${index}, 'price', this.value)">
            </div>
            <div style="font-size:10px; color:#aaa; margin-top:5px;">Descrição vinculada para o PDF</div>
        `;
        quoteItemsContainer.appendChild(itemDiv);
    });
}

window.removerItem = (index) => { quoteCart.splice(index, 1); renderQuoteSidebar(); };
window.atualizarDados = (index, campo, valor) => { quoteCart[index][campo] = valor; };

// --- PDF COM LAYOUT MINUCIOSO E ELEGANTE ---
generatePdfBtn.addEventListener('click', () => {
    if (quoteCart.length === 0) return alert("Adicione itens primeiro.");

    const element = document.createElement('div');
    element.style.padding = "50px";
    element.style.backgroundColor = "#fff";

    const total = quoteCart.reduce((acc, item) => acc + parseFloat(item.price), 0);

    let html = `
        <div style="border-bottom: 2px solid #1A3017; padding-bottom: 20px; margin-bottom: 40px; display: flex; justify-content: space-between; align-items: flex-end;">
            <img src="${LOGO_URL}" style="height: 50px;">
            <div style="text-align: right; font-family: 'Montserrat', sans-serif;">
                <p style="margin:0; font-size:10px; letter-spacing:2px; color:#888;">ORÇAMENTO TÉCNICO</p>
                <p style="margin:0; font-size:12px; color:#1A3017;">DATA: ${new Date().toLocaleDateString('pt-BR')}</p>
            </div>
        </div>
    `;

    quoteCart.forEach(item => {
        html += `
            <div style="display: flex; gap: 40px; margin-bottom: 60px; page-break-inside: avoid; align-items: flex-start;">
                <div style="flex: 0 0 200px;">
                    <img src="${item.image}" style="width: 100%; height: auto; border-radius: 2px;">
                </div>
                <div style="flex: 1; font-family: 'Inter', sans-serif;">
                    <h2 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 600; text-transform: uppercase; border-bottom: 1px solid #eee; padding-bottom: 5px;">${item.editName}</h2>
                    <p style="font-size: 9px; color: #bbb; margin-bottom: 15px; letter-spacing: 1px;">SKU: ${item.sku}</p>
                    <div style="font-size: 12px; line-height: 1.6; color: #444; text-align: justify;">
                        ${item.briefingEditado}
                    </div>
                    <p style="font-size: 16px; font-weight: 600; margin-top: 20px; color: #1A3017;">
                        VALOR: R$ ${parseFloat(item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </p>
                </div>
            </div>
        `;
    });

    html += `
        <div style="margin-top: 50px; padding: 30px; background: #f9f9f9; text-align: right; page-break-inside: avoid;">
            <p style="margin:0; font-size:12px; color:#888;">INVESTIMENTO TOTAL</p>
            <h2 style="margin:0; font-size:28px; color:#1A3017;">R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h2>
        </div>
    `;

    element.innerHTML = html;

    const opt = {
        margin: [0.2, 0.2],
        filename: `Terrazi-Orcamento.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
});

searchBtn.addEventListener('click', () => fetchProducts(false));
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchProducts(false); });
