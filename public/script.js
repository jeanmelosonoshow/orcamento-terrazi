// 0. VERIFICAÇÃO DE LOGIN E DADOS DO USUÁRIO
const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioLogado'));

if (!usuarioLogado) {
    window.location.href = 'login.html';
}

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

let isModoImpressao = false;
let statusParaImpressao = "";
let idParaImpressao = "";

// 1. INICIALIZAÇÃO
window.onload = () => {
    // Exibe dados no topo
    exibirUsuarioLogado();

    // Trava nome do vendedor no formulário
    if (sellerName) {
        sellerName.value = usuarioLogado.nomefuncionario;
        sellerName.readOnly = true;
    }

    fetchProducts(true);
    
    const urlParams = new URLSearchParams(window.location.search);
    isModoImpressao = urlParams.get('modo') === 'impressao';
    
    const clonarData = localStorage.getItem('clonar_orcamento');
    if (clonarData) {
        const data = JSON.parse(clonarData);
        statusParaImpressao = data.status_atual || "";
        idParaImpressao = data.id_impressao || "";

        custName.value = data.cliente_nome || '';
        custDoc.value = data.cliente_doc || '';
        sellerPhone.value = data.vendedor_contato || '';
        generalObs.value = data.obs_geral || '';
        
        if (data.data_validade) {
            quoteValid.value = data.data_validade.split('T')[0];
        }
        
        quoteCart = (data.items || data.itens || []).map(item => ({
            sku: item.sku,
            displayName: item.nome_produto || item.displayName,
            price: parseFloat(item.preco_unitario || item.price),
            quantity: parseInt(item.quantidade || item.quantity),
            variation: item.variacao || item.variation || '',
            image: item.imagem_url || item.image,
            description: item.descricao_tecnica || item.description,
            tempId: Date.now() + Math.random()
        }));
        
        renderQuoteSidebar();
        localStorage.removeItem('clonar_orcamento'); 

        if (isModoImpressao) {
            setTimeout(() => { if (generatePdfBtn) generatePdfBtn.click(); }, 3000);
        }
    }
};

// 2. BUSCA E RENDERIZAÇÃO
async function fetchProducts(isInitial = false) {
    const query = isInitial ? "" : searchInput.value.trim();
    productsGrid.innerHTML = '<div class="loader">Carregando curadoria...</div>';
    try {
        const response = await fetch(`/api/get-products?q=${encodeURIComponent(query)}`);
        let products = await response.json();
        products = products.filter(p => p.published !== false && p.visible !== false);
        if (isInitial) products = products.sort(() => 0.5 - Math.random()).slice(0, 12);
        renderProducts(products);
    } catch (error) {
        productsGrid.innerHTML = '<p>Erro ao conectar com a galeria.</p>';
    }
}

function renderProducts(products) {
    productsGrid.innerHTML = '';
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku">SKU: ${p.sku}</p>
                <p class="price">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <button class="btn-primary" onclick='adicionarAoOrcamento(${JSON.stringify(p).replace(/'/g, "&apos;")})'>ADICIONAR</button>
            </div>`;
        productsGrid.appendChild(card);
    });
}

// 3. CARRINHO E EDIÇÃO
function adicionarAoOrcamento(produto) {
    quoteCart.push({ ...produto, tempId: Date.now(), displayName: produto.name, quantity: 1, variation: "" });
    renderQuoteSidebar();
}

function renderQuoteSidebar() {
    quoteItemsContainer.innerHTML = '';
    quoteCart.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-quote-edit';
        itemDiv.innerHTML = `
            <div style="display:flex; gap:10px;">
                <img src="${item.image}" style="width:40px;">
                <input type="text" value="${item.displayName}" onchange="atualizarDados(${index}, 'displayName', this.value)" style="flex:1">
                <button onclick="removerItem(${index})">×</button>
            </div>
            <input type="text" placeholder="Variação..." value="${item.variation || ''}" onchange="atualizarDados(${index}, 'variation', this.value)">
            <div style="display:flex; gap:5px;">
                <input type="number" value="${item.quantity}" onchange="atualizarDados(${index}, 'quantity', this.value)">
                <input type="number" step="0.01" value="${item.price}" onchange="atualizarDados(${index}, 'price', this.value)">
            </div>`;
        quoteItemsContainer.appendChild(itemDiv);
    });
    atualizarDestaqueTotal();
}

window.atualizarDados = (index, campo, valor) => {
    quoteCart[index][campo] = (campo === 'price' || campo === 'quantity') ? parseFloat(valor) : valor;
    atualizarDestaqueTotal();
};

window.removerItem = (index) => { quoteCart.splice(index, 1); renderQuoteSidebar(); };

function atualizarDestaqueTotal() {
    const total = quoteCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    if (displayTotalGeral) displayTotalGeral.innerText = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

// 4. SALVAMENTO E PDF
async function salvarNoBanco() {
    const totalGeral = quoteCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const payload = {
        cust_name: custName.value,
        cust_doc: custDoc.value,
        valid_until: quoteValid.value,
        seller_name: sellerName.value,
        seller_phone: sellerPhone.value,
        general_obs: generalObs.value,
        total_value: totalGeral,
        items: quoteCart,
        dados_vendedor: {
            idfuncionario: usuarioLogado.idfuncionario,
            nomefuncionario: usuarioLogado.nomefuncionario,
            categoria: usuarioLogado.categoria,
            idfilial: usuarioLogado.idfilial
        }
    };

    try {
        const response = await fetch('/api/salvar-orcamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await response.json();
    } catch (error) { console.error("Erro ao salvar:", error); }
}

generatePdfBtn.addEventListener('click', async () => {
    if (quoteCart.length === 0) return alert("Selecione itens.");
    if (!isModoImpressao) await salvarNoBanco();
    // ... (Logica de HTML do PDF mantida conforme sua versão anterior)
    alert("Gerando PDF...");
    // Chame aqui sua lógica de html2pdf
});

// 5. FUNÇÕES DE SESSÃO
function exibirUsuarioLogado() {
    const infoTopo = document.getElementById('user-info-topo');
    if (infoTopo && usuarioLogado) {
        infoTopo.innerHTML = `
            <span><strong>Vendedor:</strong> ${usuarioLogado.nomefuncionario}</span> | 
            <span><strong>Categoria:</strong> ${usuarioLogado.categoria}</span> | 
            <span><strong>Filial:</strong> ${usuarioLogado.idfilial}</span>
            <button onclick="fazerLogout()" style="margin-left:15px; background:#c0392b; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;">Sair</button>
        `;
    }
}

window.fazerLogout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };
