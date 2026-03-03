// 0. VERIFICAÇÃO DE LOGIN E DADOS DO USUÁRIO
const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioLogado'));
if (!usuarioLogado) { window.location.href = 'login.html'; }

// Seletores
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const productsGrid = document.getElementById('productsGrid');
const quoteItemsContainer = document.getElementById('quoteItems');
const generatePdfBtn = document.getElementById('generatePdfBtn');
const custName = document.getElementById('custName');
const custDoc = document.getElementById('custDoc');
const quoteValid = document.getElementById('quoteValid');
const sellerName = document.getElementById('sellerName');
const sellerPhone = document.getElementById('sellerPhone');
const generalObs = document.getElementById('generalObs');
const displayTotalGeral = document.getElementById('displayTotalGeral');

let quoteCart = [];

// 1. INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    exibirUsuarioLogado();

    if (sellerName) {
        sellerName.value = usuarioLogado.nomefuncionario;
        sellerName.readOnly = true;
    }

    // Carregamento inicial de produtos
    fetchProducts(true);

  
    // VINCULAÇÃO DA BUSCA COM VOLTA AO INICIAL AO APAGAR
        if (searchBtn) {
            searchBtn.addEventListener('click', () => fetchProducts(false));
        }
        
        if (searchInput) {
            // 1. Detecta o Enter
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') fetchProducts(false);
            });
        
            // 2. Detecta quando o usuário apaga o texto (Volta ao inicial)
            searchInput.addEventListener('input', (e) => {
                if (e.target.value.trim() === "") {
                    fetchProducts(true); // O 'true' ativa o modo inicial (aleatório/geral)
                }
            });
        }

    // Lógica de clonagem/impressão
    const urlParams = new URLSearchParams(window.location.search);
    const isModoImpressao = urlParams.get('modo') === 'impressao';
    const clonarData = localStorage.getItem('clonar_orcamento');

    if (clonarData) {
        const data = JSON.parse(clonarData);
        custName.value = data.cliente_nome || '';
        custDoc.value = data.cliente_doc || '';
        sellerPhone.value = data.vendedor_contato || '';
        generalObs.value = data.obs_geral || '';
        if (data.data_validade) quoteValid.value = data.data_validade.split('T')[0];
        
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
        if (isModoImpressao && generatePdfBtn) {
            setTimeout(() => { generatePdfBtn.click(); }, 3000);
        }
    }
});

// 2. BUSCA E RENDERIZAÇÃO
async function fetchProducts(isInitial = false) {
    const query = isInitial ? "" : (searchInput ? searchInput.value.trim() : "");
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
        // Lógica de Cor do Estoque
        const isLowStock = parseFloat(p.stock) < 1 || p.stock === "Sob Consulta";
        const stockColor = isLowStock ? "#c0392b" : "#1A3017";
        const stockLabel = p.stock === "Sob Consulta" ? "Sob Consulta" : `Estoque: ${p.stock}`;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku">SKU: ${p.sku}</p>
                <p class="stock" style="color: ${stockColor}; font-weight: bold; font-size: 11px;">${stockLabel}</p>
                <p class="price">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <button class="btn-primary" onclick='adicionarAoOrcamento(${JSON.stringify(p).replace(/'/g, "&apos;")})'>ADICIONAR</button>
            </div>`;
        productsGrid.appendChild(card);
    });
}

// 3. CARRINHO E EDIÇÃO
window.adicionarAoOrcamento = (produto) => {
    quoteCart.push({ ...produto, tempId: Date.now(), displayName: produto.name, quantity: 1, variation: "" });
    renderQuoteSidebar();
};

function renderQuoteSidebar() {
    quoteItemsContainer.innerHTML = '';
    quoteCart.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-quote-edit';
        
        // Estrutura Premium: Título e Delete na linha 1, Variação na 2, Controles na 3
        itemDiv.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center; margin-bottom:5px;">
                <img src="${item.image}" style="width:35px; height:35px; object-fit:cover; border-radius:4px;">
                <input type="text" value="${item.displayName}" 
                    onchange="atualizarDados(${index}, 'displayName', this.value)" 
                    style="flex:1; font-weight:600; border:none; background:transparent; font-size:13px;" title="Nome do Produto">
                <button onclick="removerItem(${index})" 
                    style="background:none; border:none; color:#c0392b; cursor:pointer; font-size:18px; font-weight:bold; padding:0 5px;">&times;</button>
            </div>
            
            <div style="margin-bottom:8px;">
                <input type="text" placeholder="Adicionar variação (ex: cor, tamanho)..." value="${item.variation || ''}" 
                    onchange="atualizarDados(${index}, 'variation', this.value)" 
                    style="width:100%; font-size:11px; color:#666; font-style:italic; padding:4px 0; border:none; border-bottom:1px solid #eee; background:transparent;">
            </div>

            <div class="item-controls-grid" style="display: grid; grid-template-columns: 60px 1fr; gap: 10px; align-items: center;">
                <div style="display:flex; flex-direction:column;">
                    <label style="font-size:9px; color:#999; text-transform:uppercase;">Qtd</label>
                    <input type="number" value="${item.quantity}" 
                        onchange="atualizarDados(${index}, 'quantity', this.value)" 
                        style="width:100%; padding:5px; border:1px solid #ddd; border-radius:4px; font-size:12px;">
                </div>
                <div style="display:flex; flex-direction:column;">
                    <label style="font-size:9px; color:#999; text-transform:uppercase;">Preço Unitário (R$)</label>
                    <input type="number" step="0.01" value="${item.price}" 
                        onchange="atualizarDados(${index}, 'price', this.value)" 
                        style="width:100%; padding:5px; border:1px solid #ddd; border-radius:4px; font-size:12px; font-weight:600; color:#1A3017;">
                </div>
            </div>
        `;
        quoteItemsContainer.appendChild(itemDiv);
    });
    
    // Atualiza o total no box de destaque
    if (typeof atualizarDestaqueTotal === "function") {
        atualizarDestaqueTotal();
    }
}

window.atualizarDados = (index, campo, valor) => {
    quoteCart[index][campo] = (campo === 'price' || campo === 'quantity') ? parseFloat(valor) : valor;
    atualizarDestaqueTotal();
};

window.removerItem = (index) => { quoteCart.splice(index, 1); renderQuoteSidebar(); };

window.limparOrcamento = () => { quoteCart = []; renderQuoteSidebar(); };

function atualizarDestaqueTotal() {
    const total = quoteCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    if (displayTotalGeral) displayTotalGeral.innerText = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

// 4. SALVAMENTO E PDF (Mantenha sua lógica de PDF completa aqui)
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

if (generatePdfBtn) {
    generatePdfBtn.addEventListener('click', async () => {
        if (quoteCart.length === 0) return alert("Selecione itens.");
        await salvarNoBanco();
        alert("Salvando e gerando PDF...");
    });
}

// 5. FUNÇÕES DE SESSÃO
function exibirUsuarioLogado() {
    const infoTopo = document.getElementById('user-info-topo');
    if (infoTopo && usuarioLogado) {
        infoTopo.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px; width:100%;">
                <span><strong>Vendedor:</strong> ${usuarioLogado.nomefuncionario}</span>
                <span><strong>Filial:</strong> ${usuarioLogado.idfilial}</span>
                <div style="flex-grow:1"></div>
                <button onclick="fazerLogout()" style="background:#c0392b; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-weight:bold;">SAIR</button>
            </div>
        `;
    }
}

window.fazerLogout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };
