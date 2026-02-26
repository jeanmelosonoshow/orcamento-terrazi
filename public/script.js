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
        
        // Prova Real: Se p.description existir, mostra os primeiros 50 caracteres, senão avisa que está vazio
        const textoDescricaoParaValidar = p.description && p.description.length > 0 
            ? p.description.substring(0, 60) + "..." 
            : "<span style='color:red;'>Sem descrição na API</span>";

        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}" loading="lazy">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku">SKU: ${p.sku}</p>
                <p class="price">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                
                <div style="background: #f4f4f4; padding: 5px; font-size: 10px; margin: 10px 0; border: 1px dashed #ccc;">
                    <strong>Debug Descrição:</strong><br>
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

// 3. ADICIONAR AO ORÇAMENTO + CHAMADA DE IA
async function adicionarAoOrcamento(produto) {
    const btn = document.getElementById(`btn-${produto.id}`);
    if(btn) {
        btn.innerText = "IA PROCESSANDO...";
        btn.disabled = true;
    }

    // 1. LIMPEZA DE HTML: Transforma a descrição em texto puro
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = produto.description;
    const descricaoPura = tempDiv.textContent || tempDiv.innerText || "";

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
                description: descricaoPura.substring(0, 3000) // Limite de segurança
            })
        });

        const aiData = await aiResponse.json();
        const index = quoteCart.findIndex(item => item.tempId === novoItem.tempId);
        
        if (index !== -1) {
            // Se a IA devolver o resumo, usamos. Se não, mantemos um aviso.
            quoteCart[index].briefingEditado = aiData.summary || "Por favor, preencha os dados técnicos manualmente.";
            renderQuoteSidebar();
        }

    } catch (error) {
        console.error("Erro na IA:", error);
    } finally {
        if(btn) {
            btn.innerText = "+ ADICIONAR AO ORÇAMENTO";
            btn.disabled = false;
        }
    }
}

// 4. RENDERIZAR LATERAL DE ORÇAMENTO
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

// 5. FUNÇÕES DE APOIO
window.removerItem = (index) => {
    quoteCart.splice(index, 1);
    renderQuoteSidebar();
};

window.atualizarDados = (index, campo, valor) => {
    quoteCart[index][campo] = valor;
};

// 6. GERAÇÃO DO PDF (IMPLEMENTAÇÃO COM LOGO E CORS)
generatePdfBtn.addEventListener('click', () => {
    if (quoteCart.length === 0) {
        alert("Adicione pelo menos um item ao orçamento.");
        return;
    }

    const element = document.createElement('div');
    element.style.padding = "40px";
    element.style.color = "#1A3017";
    element.style.fontFamily = "'Inter', sans-serif";

    // Cabeçalho do PDF com a Logo
    let htmlConteudo = `
        <div style="text-align: center; margin-bottom: 40px; border-bottom: 1px solid #1A3017; padding-bottom: 20px;">
            <img src="${LOGO_URL}" style="height: 60px; width: auto; margin-bottom: 10px;">
            <h2 style="font-weight: 300; text-transform: uppercase; font-size: 12px; letter-spacing: 4px; margin: 0;">Proposta Técnica de Mobiliário</h2>
        </div>
    `;

    // Listagem de Itens
    quoteCart.forEach(item => {
        // Converte quebras de linha em <br> para o PDF
        const briefingFormatado = item.briefingEditado.replace(/\n/g, '<br>');

        htmlConteudo += `
            <div style="display: flex; gap: 25px; margin-bottom: 40px; page-break-inside: avoid; align-items: flex-start;">
                <img src="${item.image}" style="width: 180px; height: auto; border-radius: 2px;">
                <div style="flex: 1;">
                    <h3 style="margin: 0 0 5px 0; font-size: 18px; color: #1A3017;">${item.name}</h3>
                    <p style="font-size: 11px; color: #666; margin-bottom: 15px;">REF/SKU: ${item.sku}</p>
                    <div style="font-size: 13px; line-height: 1.6; color: #333; margin-bottom: 15px;">
                        ${briefingFormatado}
                    </div>
                    <p style="font-weight: 600; font-size: 15px; color: #2D5A27;">
                        Valor Sugerido: R$ ${parseFloat(item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </p>
                </div>
            </div>
        `;
    });

    // Rodapé do PDF
    htmlConteudo += `
        <div style="margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px; font-size: 10px; color: #aaa; text-align: center;">
            Documento gerado em ${new Date().toLocaleDateString('pt-BR')} | Terrazi - Curadoria Técnica
        </div>
    `;

    element.innerHTML = htmlConteudo;

    const opt = {
        margin: [0.5, 0.5],
        filename: `orcamento-terrazi-${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2, 
            useCORS: true, // Crucial para carregar a logo e as fotos dos produtos no PDF
            logging: false,
            letterRendering: true
        },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
});

// Event Listeners
searchBtn.addEventListener('click', fetchProducts);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchProducts();
});
