const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const productsGrid = document.getElementById('productsGrid');
const quoteItemsContainer = document.getElementById('quoteItems');

let cart = [];

// 1. Buscar Produtos na Nuvemshop (via sua API Vercel)
async function fetchProducts() {
    const query = searchInput.value;
    productsGrid.innerHTML = '<p>Buscando produtos...</p>';
    
    try {
        const response = await fetch(`/api/get-products?q=${query}`);
        const products = await response.json();
        renderProducts(products);
    } catch (error) {
        console.error("Erro na busca:", error);
    }
}

// 2. Renderizar Cards na Grid
function renderProducts(products) {
    productsGrid.innerHTML = '';
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}">
            <h4>${p.name}</h4>
            <p>Estoque: ${p.stock}</p>
            <button onclick="addToQuote('${p.id}', '${p.name}', '${p.image}', '${p.price}', \`${encodeURIComponent(p.description)}\`)">
                + Adicionar ao Orçamento
            </button>
        `;
        productsGrid.appendChild(card);
    });
}

// 3. Adicionar ao Orçamento e Chamar IA para Resumo Técnico
async function addToQuote(id, name, image, price, encodedDesc) {
    const description = decodeURIComponent(encodedDesc);
    
    // Placeholder enquanto a IA pensa
    const tempId = Date.now();
    const item = { id, tempId, name, image, price, briefing: 'Gerando resumo técnico...' };
    cart.push(item);
    renderQuote();

    // Chama o Agente de IA (sua API Vercel)
    try {
        const aiResponse = await fetch('/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productName: name, description: description })
        });
        const aiData = await aiResponse.json();
        
        // Atualiza o briefing com o retorno da IA
        const index = cart.findIndex(i => i.tempId === tempId);
        cart[index].briefing = aiData.summary;
        renderQuote();
    } catch (error) {
        console.error("Erro IA:", error);
    }
}

// 4. Renderizar Lista de Edição (Carrinho)
function renderQuote() {
    quoteItemsContainer.innerHTML = '';
    cart.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'item-quote-edit';
        div.innerHTML = `
            <strong>${item.name}</strong>
            <p>Valor (R$): <input type="number" value="${item.price}" onchange="updatePrice(${index}, this.value)" class="price-edit"></p>
            <textarea onchange="updateBriefing(${index}, this.value)">${item.briefing}</textarea>
            <button onclick="removeItem(${index})" style="color:red; background:none; font-size:10px;">Remover</button>
        `;
        quoteItemsContainer.appendChild(div);
    });
}

// Funções de atualização em tempo real
function updatePrice(index, val) { cart[index].price = val; }
function updateBriefing(index, val) { cart[index].briefing = val; }
function removeItem(index) { cart.splice(index, 1); renderQuote(); }

// 5. Gerar PDF (Simples usando html2pdf)
document.getElementById('generatePdfBtn').addEventListener('click', () => {
    const element = document.getElementById('quoteItems'); // Ou um template oculto mais bonito
    const opt = {
        margin: 1,
        filename: 'orcamento-terrazi.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
});

searchBtn.addEventListener('click', fetchProducts);
