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

// Variáveis de controle para o modo de impressão
let isModoImpressao = false;
let statusParaImpressao = "";
let idParaImpressao = "";

// 1. INICIALIZAÇÃO E CLONAGEM / IMPRESSÃO
window.onload = () => {
    fetchProducts(true);
    
    const urlParams = new URLSearchParams(window.location.search);
    isModoImpressao = urlParams.get('modo') === 'impressao';
    
    const clonarData = localStorage.getItem('clonar_orcamento');
    if (clonarData) {
        const data = JSON.parse(clonarData);
        
        // Captura dados extras para o cabeçalho do PDF
        statusParaImpressao = data.status_atual || "";
        idParaImpressao = data.id_impressao || "";

        custName.value = data.cliente_nome || '';
        custDoc.value = data.cliente_doc || '';
        sellerName.value = data.vendedor_nome || '';
        sellerPhone.value = data.vendedor_contato || '';
        generalObs.value = data.obs_geral || '';
        
        if (data.data_validade) {
            quoteValid.value = data.data_validade.split('T')[0];
        }
        
        // Mapeia os itens (suporta nomes de campos da API ou do Objeto local)
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

        // Se for apenas para imprimir, dispara o botão automaticamente
        if (isModoImpressao) {
            setTimeout(() => {
                if (generatePdfBtn) generatePdfBtn.click();
            }, 1000);
        }
    }
};

// 2. BUSCA DE PRODUTOS
async function fetchProducts(isInitial = false) {
    const query = isInitial ? "" : searchInput.value.trim();
    
    if (!isInitial && query === "") {
        return fetchProducts(true);
    }

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

// 3. RENDERIZAÇÃO DE PRODUTOS
function renderProducts(products) {
    productsGrid.innerHTML = '';
    products.forEach(p => {
        const estoqueNum = parseInt(p.stock);
        const corEstoque = (p.stock === "Sob Consulta" || estoqueNum < 1) ? "#d9534f" : "#1A3017";
        const textoEstoque = p.stock === "Sob Consulta" ? "Sob Consulta" : `Estoque: ${p.stock}`;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku" style="font-size: 0.7rem; color: #999;">SKU: ${p.sku}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin: 5px 0;">
                    <p class="price" style="font-weight: bold; margin: 0;">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                    <span style="font-size: 0.65rem; font-weight: bold; color: ${corEstoque}; background: #f4f4f4; padding: 2px 5px; border-radius: 3px;">
                        ${textoEstoque}
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

// EVENTOS DE BUSCA
searchBtn.addEventListener('click', () => fetchProducts(false));
searchInput.addEventListener('input', () => {
    if (searchInput.value.trim() === "") fetchProducts(true);
});
searchInput.addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') fetchProducts(false); 
});

// --- LÓGICA DO CARRINHO ---

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

window.atualizarDados = (index, campo, valor) => { 
    if (campo === 'price' || campo === 'quantity') {
        quoteCart[index][campo] = parseFloat(valor) || 0;
    } else {
        quoteCart[index][campo] = valor;
    }
    renderQuoteSidebar(); 
};

window.removerItem = (index) => { 
    quoteCart.splice(index, 1); 
    renderQuoteSidebar(); 
};

function atualizarDestaqueTotal() {
    const totalGeral = quoteCart.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1)), 0);
    if (displayTotalGeral) displayTotalGeral.innerText = `R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

async function salvarNoBanco() {
    const totalGeral = quoteCart.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1)), 0);
    const payload = {
        cust_name: custName.value,
        cust_doc: custDoc.value,
        valid_until: quoteValid.value,
        seller_name: sellerName.value,
        seller_phone: sellerPhone.value,
        general_obs: generalObs.value,
        total_value: totalGeral,
        items: quoteCart
    };
    try {
        const response = await fetch('/api/salvar-orcamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.success) console.log("Orçamento salvo no banco!");
    } catch (error) { console.error("Erro ao salvar no banco:", error); }
}

// --- GERAÇÃO DO PDF ---

generatePdfBtn.addEventListener('click', async () => {
    if (quoteCart.length === 0) return alert("Selecione itens primeiro.");
    
    // SÓ SALVA SE NÃO FOR MODO DE IMPRESSÃO DE HISTÓRICO
    if (!isModoImpressao) {
        salvarNoBanco();
    }

    const element = document.createElement('div');
    const valorTotalOrcamento = quoteCart.reduce((acc, item) => acc + (parseFloat(item.price) * parseInt(item.quantity)), 0);
    const dataValidade = quoteValid.value ? new Date(quoteValid.value).toLocaleDateString('pt-BR') : 'A consultar';
    
    // Carimbo de Status (Apenas se vier da lista)
    let carimboHtml = (isModoImpressao && statusParaImpressao) 
        ? `<div style="margin-top: 5px; padding: 3px 8px; border: 1.5px solid #1A3017; color: #1A3017; display: inline-block; font-weight: 900; font-size: 10px; text-transform: uppercase;">${statusParaImpressao}</div>`
        : "";

    let html = `
        <style>
            .pdf-body { font-family: 'Helvetica', sans-serif; color: #1a1a1a; background: white; padding: 40px 40px 30px 60px; position: relative; }
            .brand-sidebar { position: absolute; left: 0; top: 0; bottom: 0; width: 8px; background: #1A3017; }
            .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3017; padding-bottom: 10px; margin-bottom: 20px; }
            .pdf-logo { height: 45px; }
            .header-info { text-align: right; line-height: 1.3; font-size: 9px; color: #666; }
            .info-box { background: #f9f9f9; padding: 12px; border-radius: 4px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 10px; border: 1px solid #eee; }
            .product-block { width: 100%; page-break-inside: avoid !important; margin-bottom: 25px; padding-top: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 15px; }
            .product-content { display: flex; gap: 20px; }
            .left-column { width: 180px; flex-shrink: 0; }
            .product-image { width: 180px; height: 180px; object-fit: cover; border-radius: 4px; margin-bottom: 8px; }
            .dimensoes-box { font-size: 9px; line-height: 1.3; color: #1A3017; background: #F4F9F4; padding: 8px; border-radius: 4px; }
            .right-column { flex: 1; }
            .product-title { font-size: 16px; font-weight: bold; text-transform: uppercase; color: #1A3017; margin: 0; }
            .item-price-table { width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #eee; }
            .item-price-table td { font-size: 11px; padding: 8px; text-align: center; font-weight: bold; border: 1px solid #eee; }
            .td-label { background: #fafafa; font-size: 8px; color: #888; text-transform: uppercase; }
        </style>
        <div class="pdf-body">
            <div class="brand-sidebar"></div>
            <div class="pdf-header">
                <img src="${LOGO_URL}" class="pdf-logo">
                <div class="header-info">
                    <strong>ORÇAMENTO TERRAZI ${idParaImpressao ? '#' + idParaImpressao : ''}</strong><br>
                    Emissão: ${new Date().toLocaleDateString('pt-BR')}<br>
                    Validade: ${dataValidade}<br>
                    ${carimboHtml}
                </div>
            </div>
            <div class="info-box">
                <div><strong>CLIENTE:</strong> ${custName.value || '---'}<br><strong>DOC:</strong> ${custDoc.value || '---'}</div>
                <div><strong>VENDEDOR:</strong> ${sellerName.value || '---'}<br><strong>CONTATO:</strong> ${sellerPhone.value || '---'}</div>
            </div>`;

    quoteCart.forEach(item => {
        const limparProfundo = (txt) => {
            if (!txt) return "";
            let limpo = txt.replace(/<\/?[^>]+(>|$)/g, "");
            limpo = limpo.replace(/cada peça da casa terrazi[\s\S]*identidade brasileira/gi, "");
            return limpo.trim();
        };

        let rawText = item.description || "";
        let parts = rawText.split(/(características|medidas|dimensões|especificações)/i);
        let emocional = limparProfundo(parts[0]);
        let tecnico = "";
        let dimensoes = "";

        for (let i = 1; i < parts.length; i += 2) {
            let label = parts[i].toLowerCase();
            let content = limparProfundo(parts[i+1]);
            if (label.includes("dimensões") || label.includes("medidas")) dimensoes += content + "<br>";
            else tecnico += content + "<br>";
        }

        html += `
            <div class="product-block">
                <div class="product-content">
                    <div class="left-column">
                        <img src="${item.image}" class="product-image">
                        ${dimensoes ? `<div class="dimensoes-box"><strong>DIMENSÕES</strong><br>${dimensoes}</div>` : ''}
                    </div>
                    <div class="right-column">
                        <h2 class="product-title">${item.displayName}</h2>
                        <span style="font-size: 8px; color: #999;">SKU: ${item.sku}</span>
                        ${item.variation ? `<div style="font-size: 10px; color: #1A3017; font-weight: bold; margin: 5px 0;">VARIAÇÃO: ${item.variation}</div>` : ''}
                        <div style="font-size: 10px; line-height: 1.4; margin-top: 5px;">${emocional}</div>
                        ${tecnico ? `<div style="font-size: 9px; border-top: 1px dashed #ddd; margin-top: 8px; padding-top: 5px;"><strong>CARACTERÍSTICAS:</strong><br>${tecnico}</div>` : ''}
                        <table class="item-price-table">
                            <tr><td class="td-label">Qtd</td><td class="td-label">Valor Unit.</td><td class="td-label">Subtotal</td></tr>
                            <tr><td>${item.quantity}</td><td>R$ ${item.price.toLocaleString('pt-BR')}</td><td>R$ ${(item.quantity * item.price).toLocaleString('pt-BR')}</td></tr>
                        </table>
                    </div>
                </div>
            </div>`;
    });

    html += `
            <div style="page-break-inside: avoid; margin-top: 20px;">
                ${generalObs.value ? `<div style="background: #f9f9f9; padding: 10px; border: 1px solid #eee; font-size: 10px; margin-bottom: 10px;"><strong>OBSERVAÇÕES:</strong><br>${generalObs.value.replace(/\n/g, '<br>')}</div>` : ''}
                <div style="background: #1A3017; color: white; padding: 15px; border-radius: 4px; text-align: right;">
                    <span style="font-size: 20px; font-weight: bold;">TOTAL: R$ ${valorTotalOrcamento.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
            </div>
        </div>`;

    element.innerHTML = html;
    html2pdf().set({
        margin: [20, 0, 20, 0],
        filename: `Terrazi_${custName.value || 'Orcamento'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    }).from(element).save();
});

window.limparOrcamento = () => { if (confirm("Remover todos os itens?")) { quoteCart = []; renderQuoteSidebar(); } };
