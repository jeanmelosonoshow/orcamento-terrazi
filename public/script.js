// Seletores
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const productsGrid = document.getElementById('productsGrid');
const orcamentoItemsContainer = document.getElementById('quoteItems'); 
const generatePdfBtn = document.getElementById('generatePdfBtn');

// Seletores para dados do orçamento
const custName = document.getElementById('custName');
const custDoc = document.getElementById('custDoc');
const orcamentoValid = document.getElementById('quoteValid');
const sellerName = document.getElementById('sellerName');
const sellerPhone = document.getElementById('sellerPhone');
const generalObs = document.getElementById('generalObs');
const displayTotalGeral = document.getElementById('displayTotalGeral');

let carrinhoOrcamento = [];
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";

// Início - Agora verifica se há dados clonados antes de carregar a vitrine padrão
window.onload = () => {
    fetchProducts(true);
    verificarClonagem();
};

// --- FUNÇÃO DE CLONAGEM ---
function verificarClonagem() {
    const dadosClonados = localStorage.getItem('clonar_orcamento');
    if (dadosClonados) {
        const o = JSON.parse(dadosClonados);
        
        // Preenche os campos do cliente
        if(custName) custName.value = o.cliente_nome || '';
        if(custDoc) custDoc.value = o.cliente_doc || '';
        if(sellerName) sellerName.value = o.vendedor_nome || '';
        if(sellerPhone) sellerPhone.value = o.vendedor_contato || '';
        if(generalObs) generalObs.value = o.obs_geral || '';
        
        // Mapeia os itens vindos do banco para o formato do carrinho local
        carrinhoOrcamento = o.items.map(item => ({
            sku: item.sku,
            displayName: item.nome_produto,
            price: parseFloat(item.preco_unitario),
            quantity: item.quantidade,
            variation: item.variacao,
            image: item.imagem_url,
            description: item.descricao_tecnica,
            tempId: Date.now() + Math.random()
        }));

        renderOrcamentoSidebar();
        
        // Limpa o cache de clonagem para não repetir no F5
        localStorage.removeItem('clonar_orcamento');
        alert("Itens do orçamento anterior carregados!");
    }
}

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

// 2. RENDERIZAR VITRINE
function renderProducts(products) {
    productsGrid.innerHTML = '';
    products.forEach(p => {
        const stockQty = p.stock ?? 0;
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

// 3. GESTÃO DO CARRINHO (ORÇAMENTO)
function adicionarAoOrcamento(produto) {
    const novoItem = {
        ...produto,
        tempId: Date.now(),
        displayName: produto.name,
        quantity: 1,
        variation: "" 
    };
    carrinhoOrcamento.push(novoItem);
    renderOrcamentoSidebar();
}

function renderOrcamentoSidebar() {
    orcamentoItemsContainer.innerHTML = '';
    carrinhoOrcamento.forEach((item, index) => {
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
        orcamentoItemsContainer.appendChild(itemDiv);
    });
    atualizarDestaqueTotal();
}

window.atualizarDados = (index, campo, valor) => { 
    if (campo === 'price' || campo === 'quantity') {
        carrinhoOrcamento[index][campo] = parseFloat(valor) || 0;
    } else {
        carrinhoOrcamento[index][campo] = valor;
    }
    renderOrcamentoSidebar(); 
};

window.removerItem = (index) => { 
    carrinhoOrcamento.splice(index, 1); 
    renderOrcamentoSidebar(); 
};

function atualizarDestaqueTotal() {
    const totalGeral = carrinhoOrcamento.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1)), 0);
    if (displayTotalGeral) {
        displayTotalGeral.innerText = `R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    }
}

// --- FUNÇÃO PARA SALVAR NO BANCO DE DADOS ---
async function salvarNoBanco() {
    if (carrinhoOrcamento.length === 0) return alert("Adicione itens antes de salvar.");

    const dados = {
        cust_name: custName.value,
        cust_doc: custDoc.value,
        valid_until: orcamentoValid.value,
        seller_name: sellerName.value,
        seller_phone: sellerPhone.value,
        general_obs: generalObs.value,
        total_value: carrinhoOrcamento.reduce((acc, i) => acc + (i.price * i.quantity), 0),
        items: carrinhoOrcamento
    };

    try {
        const res = await fetch('/api/salvar-orcamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (res.ok) {
            const data = await res.json();
            alert(`Orçamento #${data.orcamentoId} salvo com sucesso!`);
        } else {
            alert("Erro ao salvar no banco.");
        }
    } catch (error) {
        console.error(error);
        alert("Falha na conexão com o banco.");
    }
}

// 4. GERAÇÃO DO PDF (MODIFICADA PARA SALVAR NO BANCO ANTES)
generatePdfBtn.addEventListener('click', async () => {
    if (carrinhoOrcamento.length === 0) return alert("Selecione itens primeiro.");

    // Opcional: Salva automaticamente ao gerar PDF
    await salvarNoBanco();

    const element = document.createElement('div');
    const valorTotalOrcamento = carrinhoOrcamento.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const dataValidadeStr = orcamentoValid.value ? new Date(orcamentoValid.value).toLocaleDateString('pt-BR') : 'A consultar';
    
    let html = `
        <style>
            .pdf-body { font-family: 'Helvetica', sans-serif; color: #1a1a1a; background: white; padding: 40px 40px 30px 60px; position: relative; }
            .brand-sidebar { position: absolute; left: 0; top: 0; bottom: 0; width: 8px; background: #1A3017; }
            .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3017; padding-bottom: 10px; margin-bottom: 20px; }
            .pdf-logo { height: 45px; }
            .header-info { text-align: right; line-height: 1.3; }
            .header-info strong { font-size: 11px; color: #1A3017; letter-spacing: 1px; text-transform: uppercase; }
            .info-box { background: #f9f9f9; padding: 12px; border-radius: 4px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 10px; border: 1px solid #eee; }
            .product-block { width: 100%; page-break-inside: avoid !important; margin-bottom: 25px; border-bottom: 1px solid #f0f0f0; padding-bottom: 15px; }
            .product-content { display: flex; gap: 20px; }
            .left-column { width: 180px; flex-shrink: 0; }
            .product-image { width: 180px; height: 180px; object-fit: cover; border-radius: 4px; }
            .right-column { flex: 1; display: flex; flex-direction: column; }
            .product-title { font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 0; color: #1A3017; }
            .product-variation-pdf { font-size: 10px; color: #1A3017; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; }
            .item-price-table { width: 100%; border-collapse: collapse; margin-top: auto; border: 1px solid #eee; }
            .item-price-table td { font-size: 11px; padding: 8px; text-align: center; font-weight: bold; color: #1A3017; }
            .td-label { font-size: 7.5px; text-transform: uppercase; color: #888; background: #fafafa; }
            .total-final { text-align: right; background: #1A3017; color: white; padding: 15px; border-radius: 4px; }
            .obs-final-box { background: #f9f9f9; padding: 10px; border: 1px solid #eee; border-radius: 4px; font-size: 10px; margin-bottom: 15px; color: #333; }
        </style>
        <div class="pdf-body">
            <div class="brand-sidebar"></div>
            <div class="pdf-header">
                <img src="${LOGO_URL}" class="pdf-logo">
                <div class="header-info">
                    <strong>ORÇAMENTO TERRAZI</strong><br>
                    <span>Emissão: ${new Date().toLocaleDateString('pt-BR')}</span><br>
                    <span>Validade: ${dataValidadeStr}</span>
                </div>
            </div>
            <div class="info-box">
                <div><strong>CLIENTE:</strong> ${custName.value || '---'}<br><strong>DOC:</strong> ${custDoc.value || '---'}</div>
                <div><strong>VENDEDOR:</strong> ${sellerName.value || '---'}<br><strong>CONTATO:</strong> ${sellerPhone.value || '---'}</div>
            </div>
    `;

    carrinhoOrcamento.forEach(item => {
        const limparProfundo = (txt) => {
            if (!txt) return "";
            let limpo = txt.replace(/<\/?[^>]+(>|$)/g, "");
            return limpo.replace(/cada peça da casa terrazi[\s\S]*identidade brasileira/gi, "").trim();
        };

        html += `
            <div class="product-block">
                <div class="product-content">
                    <div class="left-column">
                        <img src="${item.image}" class="product-image">
                    </div>
                    <div class="right-column">
                        <h2 class="product-title">${item.displayName}</h2>
                        <span style="font-size: 8px; color: #999;">SKU: ${item.sku}</span>
                        ${item.variation ? `<div class="product-variation-pdf">Variação: ${item.variation}</div>` : ''}
                        <div style="font-size: 10px; color: #333; margin: 10px 0;">${limparProfundo(item.description)}</div>
                        <table class="item-price-table">
                            <tr>
                                <td class="td-label">Qtd</td>
                                <td class="td-label">Valor Unitário</td>
                                <td class="td-label" style="background: #f1f1f1;">Subtotal Item</td>
                            </tr>
                            <tr>
                                <td>${item.quantity}</td>
                                <td>R$ ${item.price.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                <td style="background: #f1f1f1;">R$ ${(item.price * item.quantity).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
            <div class="footer-area">
                ${generalObs.value ? `<div class="obs-final-box"><strong>OBSERVAÇÕES:</strong><br>${generalObs.value.replace(/\n/g, '<br>')}</div>` : ''}
                <div class="total-final">
                    <span style="font-size: 9px; opacity: 0.8;">TOTAL GERAL:</span><br>
                    <span style="font-size: 22px; font-weight: bold;">R$ ${valorTotalOrcamento.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
            </div>
        </div>
    `;

    element.innerHTML = html;
    html2pdf().set({
        margin: [20, 0, 20, 0],
        filename: `Terrazi_${custName.value || 'Orcamento'}.pdf`,
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
});

// Eventos de Busca
searchBtn.addEventListener('click', () => {
    if (searchInput.value.trim() === "") fetchProducts(true);
    else fetchProducts(false);
});

searchInput.addEventListener('input', (e) => {
    if (e.target.value.trim() === "") fetchProducts(true);
});

window.limparOrcamento = () => {
    if (confirm("Deseja remover todos os itens?")) {
        carrinhoOrcamento = [];
        renderOrcamentoSidebar();
    }
};
