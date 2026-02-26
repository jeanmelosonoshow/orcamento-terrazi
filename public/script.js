// Seletores de Elementos
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const productsGrid = document.getElementById('productsGrid');
const quoteItemsContainer = document.getElementById('quoteItems');
const generatePdfBtn = document.getElementById('generatePdfBtn');

// Estado da aplicação (itens no orçamento)
let quoteCart = [];

// URL da Logo oficial para o PDF
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";

// 1. BUSCA DE PRODUTOS
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
        
        const textoDescricaoParaValidar = p.description && p.description.length > 0 
            ? p.description.substring(0, 60).replace(/<[^>]*>?/gm, '') + "..." 
            : "<span style='color:red;'>Sem descrição na API</span>";

        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}" loading="lazy">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku">SKU: ${p.sku}</p>
                <p class="price">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                
                <div style="background: #f4f4f4; padding: 5px; font-size: 10px; margin: 10px 0; border: 1px dashed #ccc; color: #666;">
                    <strong>Preview Descrição:</strong><br>
                    ${textoDescricaoParaValidar}
                </div>

                <button class="btn-add" id="btn-${p.id}">+ ADICIONAR AO ORÇAMENTO</button>
            </div>
        `;
        
        card.querySelector('.btn-add').addEventListener('click', () => {
            adicionarAoOrcamento(p);
        });

        productsGrid.appendChild(card);
    });
}

// 3. ADICIONAR AO ORÇAMENTO + CHAMADA DE IA (COM FALLBACK)
async function adicionarAoOrcamento(produto) {
    const btn = document.getElementById(`btn-${produto.id}`);
    if(btn && btn.disabled) return;

    if(btn) {
        btn.innerText = "IA PROCESSANDO...";
        btn.disabled = true;
    }

    const novoItem = {
        ...produto,
        tempId: Date.now(),
        briefingEditado: "Gerando resumo técnico inteligente..."
    };

    quoteCart.push(novoItem);
    renderQuoteSidebar();

    try {
        const aiResponse = await fetch('/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                productName: produto.name, 
                description: produto.description 
            })
        });

        const aiData = await aiResponse.json();
        const index = quoteCart.findIndex(item => item.tempId === novoItem.tempId);
        
        if (index !== -1) {
            // Lógica de Fallback: Se a IA falhar em todas as chaves (vazio), usa a descrição original
            if (!aiData.summary || aiData.summary.trim() === "") {
                quoteCart[index].briefingEditado = produto.description;
            } else {
                quoteCart[index].briefingEditado = aiData.summary;
            }
            renderQuoteSidebar();
        }

    } catch (error) {
        console.error("Erro na IA:", error);
        const index = quoteCart.findIndex(item => item.tempId === novoItem.tempId);
        if (index !== -1) {
            quoteCart[index].briefingEditado = produto.description;
            renderQuoteSidebar();
        }
    } finally {
        if(btn) {
            btn.innerText = "+ ADICIONAR AO ORÇAMENTO";
            btn.disabled = false;
        }
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
                <img src="${item.image}" width="40" height="40" style="object-fit: cover; border-radius: 4px;">
                <strong>${item.name}</strong>
                <button onclick="removerItem(${index})" class="btn-remove">×</button>
            </div>
            <div class="edit-body">
                <label>Preço Unitário (R$):</label>
                <input type="number" step="0.01" value="${item.price}" 
                    onchange="atualizarDados(${index}, 'price', this.value)">
                
                <label>Briefing Técnico:</label>
                <textarea onchange="atualizarDados(${index}, 'briefingEditado', this.value)" 
                placeholder="Insira as especificações aqui...">${item.briefingEditado}</textarea>
            </div>
        `;
        quoteItemsContainer.appendChild(itemDiv);
    });
}

// 5. FUNÇÕES DE APOIO
window.removerItem = (index) => {
    quoteCart.splice(index, 1);
    renderQuoteSidebar();
};

window.atualizarDados = (index, campo, valor) => {
    quoteCart[index][campo] = valor;
};

// 6. GERAÇÃO DO PDF (LAYOUT DE LUXO COM TOTALIZAÇÃO)
generatePdfBtn.addEventListener('click', () => {
    if (quoteCart.length === 0) {
        alert("Adicione pelo menos um item ao orçamento.");
        return;
    }

    const element = document.createElement('div');
    element.style.padding = "45px";
    element.style.color = "#1A3017";
    element.style.fontFamily = "'Inter', sans-serif";

    // Cálculo do Total
    const valorTotalOrcamento = quoteCart.reduce((acc, item) => acc + parseFloat(item.price), 0);

    let htmlConteudo = `
        <div style="text-align: center; margin-bottom: 50px; border-bottom: 1px solid #1A3017; padding-bottom: 30px;">
            <img src="${LOGO_URL}" style="height: 55px; width: auto; margin-bottom: 15px;">
            <p style="text-transform: uppercase; font-size: 10px; letter-spacing: 5px; color: #888; margin: 0;">Proposta Técnica de Mobiliário</p>
        </div>
        
        <div style="margin-bottom: 40px;">
            <h1 style="font-weight: 300; font-size: 22px; margin: 0;">Orçamento para Cliente</h1>
            <p style="font-size: 12px; color: #666;">Data de emissão: ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
    `;

    quoteCart.forEach(item => {
        // Fallback: se o briefing tiver HTML (descrição original), ele será renderizado corretamente
        htmlConteudo += `
            <div style="display: flex; gap: 30px; margin-bottom: 45px; page-break-inside: avoid; border-bottom: 1px solid #f0f0f0; padding-bottom: 30px;">
                <img src="${item.image}" style="width: 160px; height: 160px; object-fit: cover; border-radius: 2px;">
                <div style="flex: 1;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; text-transform: uppercase;">${item.name}</h3>
                    <p style="font-size: 10px; color: #aaa; margin-bottom: 15px;">REF/SKU: ${item.sku}</p>
                    <div style="font-size: 12px; line-height: 1.7; color: #444;">
                        ${item.briefingEditado.replace(/\n/g, '<br>')}
                    </div>
                    <p style="font-size: 14px; font-weight: 600; margin-top: 15px;">
                        Valor Unitário: R$ ${parseFloat(item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </p>
                </div>
            </div>
        `;
    });

    // Bloco Final de Valor Total
    htmlConteudo += `
        <div style="margin-top: 40px; background-color: #fcfcfc; padding: 30px; border-radius: 4px; text-align: right; page-break-inside: avoid;">
            <p style="font-size: 12px; color: #888; margin-bottom: 5px;">Investimento Total Estimado</p>
            <h2 style="font-size: 28px; color: #1A3017; margin: 0;">R$ ${valorTotalOrcamento.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h2>
            <p style="font-size: 10px; color: #aaa; margin-top: 15px;">* Preços sujeitos a alteração sem aviso prévio conforme política comercial.</p>
        </div>
    `;

    element.innerHTML = htmlConteudo;

    const opt = {
        margin: [0.3, 0.3],
        filename: `Terrazi-Orcamento-${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
});

// Event Listeners Iniciais
searchBtn.addEventListener('click', fetchProducts);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchProducts();
});
