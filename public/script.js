// 0. VERIFICAÇÃO DE LOGIN
const usuarioLogadoRaw = sessionStorage.getItem('usuarioLogado');
if (!usuarioLogadoRaw) { window.location.href = 'login.html'; }
const usuarioLogado = JSON.parse(usuarioLogadoRaw);

// Seletores
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const productsGrid = document.getElementById('productsGrid');
const quoteItemsContainer = document.getElementById('quoteItems');
const generatePdfBtn = document.getElementById('generatePdfBtn');
const custName = document.getElementById('custName');
const custDoc = document.getElementById('custDoc');
const custPhone = document.getElementById('custPhone');
const quoteValid = document.getElementById('quoteValid');
const sellerName = document.getElementById('sellerName');
const sellerPhone = document.getElementById('sellerPhone');
const generalObs = document.getElementById('generalObs');
const displayTotalGeral = document.getElementById('displayTotalGeral');

let quoteCart = [];
let currentOrcamentoId = null;
let currentCustomerKey = '';
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";
const CUSTOM_PRODUCT_IMAGE_URL = "https://lh3.googleusercontent.com/pw/AP1GczNXEpE7d00qdZ8UbOSIrUFqUQRfZ2XoRMzOUDZ2_4vq52AC7m_73Z0RP64I-qfSKiPYthP4LBEA3L1eMDXSNASJ5I__WQyafHOS2hapKhAG4HkgUJ5LouyEI8Dz0ZUA2ZyGWonprLsUXbrroUGxdEzm=w911-h911-s-no-gm?authuser=0";
const CUSTOM_PRODUCT_SKU = "PERS";
const CUSTOM_PRODUCT_LEGACY_SKU = "PERSONALIZADO";
const CUSTOM_PRODUCT_IMAGE_KEY = "PERS_IMG";
const CUSTOM_PRODUCT_LEGACY_IMAGE_KEY = "CUSTOM_PRODUCT_IMAGE";
const CUSTOM_PRODUCT = {
    id: "produto-personalizado",
    sku: CUSTOM_PRODUCT_SKU,
    name: "Produto Personalizado",
    image: CUSTOM_PRODUCT_IMAGE_URL,
    price: 0,
    stock: "Item manual",
    category: "Personalizado",
    description: "",
    isCustomProduct: true
};

function obterImagemItem(item) {
    const imagem = item?.imagem_url || item?.image || '';
    return [CUSTOM_PRODUCT_IMAGE_KEY, CUSTOM_PRODUCT_LEGACY_IMAGE_KEY].includes(imagem) ? CUSTOM_PRODUCT_IMAGE_URL : imagem;
}

function obterImagemParaSalvar(item) {
    return obterImagemItem(item);
}

function obterImagemPdf(item) {
    const imagem = obterImagemItem(item);
    if (!imagem || imagem.startsWith('data:') || imagem.startsWith('/') || imagem.startsWith('./')) return imagem;
    return '/api/image-proxy?url=' + encodeURIComponent(imagem);
}

function normalizarUrlImagem(valor) {
    const url = String(valor || '').trim();
    if (!url) return '';

    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
    } catch (error) {
        return '';
    }
}

function extrairUrlImagemHtml(html) {
    const match = String(html || '').match(/<img[^>]+src=["']([^"']+)["']/i);
    return match ? match[1] : '';
}

function obterUrlImagemArrastada(event) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return '';

    if (dataTransfer.files && dataTransfer.files.length > 0) {
        alert('Por enquanto, use apenas URL de imagem. Arquivo local ainda não é permitido.');
        return '';
    }

    return normalizarUrlImagem(
        dataTransfer.getData('text/uri-list') ||
        extrairUrlImagemHtml(dataTransfer.getData('text/html')) ||
        dataTransfer.getData('text/plain')
    );
}

function definirImagemProdutoPersonalizado(index, url) {
    const item = quoteCart[index];
    if (!item || !ehProdutoPersonalizado(item)) return;

    const imagem = url || CUSTOM_PRODUCT_IMAGE_URL;
    item.image = imagem;
    item.imagem_url = imagem;
    renderQuoteSidebar();
}

window.atualizarImagemProdutoPersonalizado = (index, valor) => {
    const url = normalizarUrlImagem(valor);
    if (!url && String(valor || '').trim()) {
        alert('Informe uma URL de imagem válida, começando com http:// ou https://.');
        renderQuoteSidebar();
        return;
    }

    definirImagemProdutoPersonalizado(index, url);
};

function obterDialogoImagemProdutoPersonalizado() {
    let dialog = document.getElementById('customImageDialog');
    if (dialog) return dialog;

    dialog = document.createElement('div');
    dialog.id = 'customImageDialog';
    dialog.className = 'pdf-action-dialog';
    dialog.hidden = true;
    dialog.innerHTML = `
        <div class="pdf-action-card" role="dialog" aria-modal="true" aria-labelledby="customImageTitle">
            <button class="pdf-action-close" type="button" data-custom-image-action="cancel" aria-label="Fechar">&times;</button>
            <h2 id="customImageTitle">Imagem do item</h2>
            <p>Cole a URL da imagem que deseja usar no produto personalizado.</p>
            <input type="url" data-custom-image-url placeholder="https://..." style="width:100%; font-size:13px; padding:10px; border:1px solid #ddd; border-radius:4px; margin-bottom:14px;">
            <div class="pdf-action-buttons">
                <button type="button" class="pdf-action-secondary" data-custom-image-action="cancel">Cancelar</button>
                <button type="button" class="pdf-action-primary" data-custom-image-action="save">Salvar imagem</button>
            </div>
        </div>`;
    document.body.appendChild(dialog);
    return dialog;
}

window.abrirDialogoImagemProdutoPersonalizado = (index) => {
    const item = quoteCart[index];
    if (!item || !ehProdutoPersonalizado(item)) return;

    const dialog = obterDialogoImagemProdutoPersonalizado();
    const input = dialog.querySelector('[data-custom-image-url]');
    const salvar = dialog.querySelector('[data-custom-image-action="save"]');
    const cancelar = dialog.querySelectorAll('[data-custom-image-action="cancel"]');

    input.value = obterImagemItem(item) || '';
    dialog.hidden = false;
    dialog.classList.add('is-open');
    document.body.classList.add('modal-open');
    setTimeout(() => input.focus(), 60);

    const fechar = () => {
        dialog.classList.remove('is-open');
        document.body.classList.remove('modal-open');
        setTimeout(() => { dialog.hidden = true; }, 180);
        salvar.onclick = null;
        cancelar.forEach(btn => { btn.onclick = null; });
        input.onkeydown = null;
    };

    const confirmar = () => {
        const valor = input.value.trim();
        const url = normalizarUrlImagem(valor);
        if (!url && valor) {
            alert('Informe uma URL de imagem válida, começando com http:// ou https://.');
            input.focus();
            return;
        }
        definirImagemProdutoPersonalizado(index, url);
        fechar();
    };

    salvar.onclick = confirmar;
    cancelar.forEach(btn => { btn.onclick = fechar; });
    input.onkeydown = (event) => {
        if (event.key === 'Enter') confirmar();
        if (event.key === 'Escape') fechar();
    };
};
window.permitirArrastarImagemProdutoPersonalizado = (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
};

window.receberImagemProdutoPersonalizado = (event, index) => {
    event.preventDefault();
    const url = obterUrlImagemArrastada(event);
    if (!url) return;
    definirImagemProdutoPersonalizado(index, url);
};
function limparDimensoesPdf(texto) {
    return String(texto || '')
        .split(/cada\s+pe[cç]a\s+da\s+casa\s+terrazi/i)[0]
        .trim();
}
function escaparHtml(valor) {
    return String(valor || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function ehProdutoPersonalizado(item) {
    return Boolean(item?.isCustomProduct) || [CUSTOM_PRODUCT_SKU, CUSTOM_PRODUCT_LEGACY_SKU].includes(String(item?.sku || '').toUpperCase());
}

function extrairCamposProdutoPersonalizado(item) {
    const texto = String(item.descricao_tecnica || item.description || '')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/\r\n/g, '\n')
        .trim();

    const primeiraSecao = texto.search(/(?:^|\n)\s*(?:caracter[ií]sticas|dimens[oõ]es|medidas)\s*:/i);
    const descricao = primeiraSecao >= 0 ? texto.slice(0, primeiraSecao).trim() : texto;
    const caracteristicas = texto.match(/(?:^|\n)\s*caracter[ií]sticas\s*:\s*([\s\S]*?)(?=(?:\n\s*(?:dimens[oõ]es|medidas)\s*:)|$)/i)?.[1]?.trim() || '';
    const dimensoes = limparDimensoesPdf(texto.match(/(?:^|\n)\s*(?:dimens[oõ]es|medidas)\s*:\s*([\s\S]*)$/i)?.[1] || '');

    return {
        customSellerDescription: item.customSellerDescription || descricao,
        customCharacteristics: item.customCharacteristics || caracteristicas,
        customDimensions: item.customDimensions || dimensoes
    };
}
function montarDescricaoProdutoPersonalizado(item) {
    return [
        item.customSellerDescription || '',
        item.customCharacteristics ? `Características: ${item.customCharacteristics}` : '',
        item.customDimensions ? `Dimensões: ${item.customDimensions}` : ''
    ].filter(Boolean).join('\n\n');
}

function obterDescricaoItem(item) {
    if (!ehProdutoPersonalizado(item)) return item.description || '';
    return montarDescricaoProdutoPersonalizado(item) || item.description || '';
}
function obterApenasDigitos(valor, limite = Infinity) {
    return (valor || '').replace(/\D/g, '').slice(0, limite);
}

function formatarCpfCnpj(valor) {
    const digitos = obterApenasDigitos(valor, 14);

    if (digitos.length <= 11) {
        return digitos
            .replace(/^(\d{3})(\d)/, '$1.$2')
            .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d{1,2}).*/, '$1.$2.$3-$4');
    }

    return digitos
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
        .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d{1,2}).*/, '$1.$2.$3/$4-$5');
}

function formatarTelefone(valor) {
    const digitos = obterApenasDigitos(valor, 11);

    if (digitos.length <= 10) {
        return digitos
            .replace(/^(\d{2})(\d)/, '($1) $2')
            .replace(/^(\(\d{2}\) \d{4})(\d{1,4}).*/, '$1-$2');
    }

    return digitos
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/^(\(\d{2}\) \d)(\d{4})(\d{1,4}).*/, '$1 $2-$3');
}

function aplicarMascara(input, formatador) {
    if (!input) return;

    input.value = formatador(input.value);
    input.addEventListener('input', () => {
        input.value = formatador(input.value);
    });
}

function configurarMascarasFormulario() {
    aplicarMascara(custDoc, formatarCpfCnpj);
    aplicarMascara(custPhone, formatarTelefone);
    aplicarMascara(sellerPhone, formatarTelefone);
}
// 1. INICIALIZAÇÃO E EVENTOS
document.addEventListener('DOMContentLoaded', () => {
    configurarMascarasFormulario();
    exibirUsuarioLogado();
    if (sellerName) {
        sellerName.value = usuarioLogado.nomefuncionario;
        sellerName.readOnly = true;
    }
    fetchProducts(true);

    // Eventos de Busca
    if (searchBtn) searchBtn.addEventListener('click', () => fetchProducts(false));
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') fetchProducts(false);
            if (searchInput.value.trim() === "") fetchProducts(true); // Volta ao inicial se limpar
        });
    }

    const clonarData = localStorage.getItem('clonar_orcamento');
    if (clonarData) {
        const data = JSON.parse(clonarData);
        custName.value = data.cliente_nome || '';
        custDoc.value = formatarCpfCnpj(data.cliente_doc || '');
        if (custPhone) custPhone.value = formatarTelefone(data.telefone_cliente || '');
        sellerPhone.value = formatarTelefone(data.vendedor_contato || '');
        generalObs.value = data.obs_geral || '';
        if (data.data_validade) quoteValid.value = data.data_validade.split('T')[0];
        currentOrcamentoId = data.id || null;
        currentCustomerKey = currentOrcamentoId ? obterChaveCliente() : '';
        if (currentOrcamentoId) generatePdfBtn.innerText = `GERAR ORÇAMENTO PDF #${currentOrcamentoId}`;
        quoteCart = (data.items || []).map(item => {
            const isCustomProduct = ehProdutoPersonalizado(item);
            const camposPersonalizados = isCustomProduct ? extrairCamposProdutoPersonalizado(item) : {};

            return {
                ...item,
                item_orcamento_id: item.item_orcamento_id || item.id || null,
                displayName: item.nome_produto || item.displayName,
                price: parseFloat(item.preco_unitario || item.price),
                quantity: parseInt(item.quantidade || item.quantity),
                variation: item.variacao || item.variation || '',
                image: obterImagemItem(item),
                description: item.descricao_tecnica || item.description,
                customSellerDescription: camposPersonalizados.customSellerDescription || '',
                customCharacteristics: camposPersonalizados.customCharacteristics || '',
                customDimensions: camposPersonalizados.customDimensions || '',
                isCustomProduct,
                category: item.categoria || '',
                tempId: Date.now() + Math.random()
            };
        });
        renderQuoteSidebar();
        localStorage.removeItem('clonar_orcamento');
    }
});

// 2. BUSCA
async function fetchProducts(isInitial = false) {
    const query = isInitial ? "" : (searchInput?.value.trim() || "");
    productsGrid.innerHTML = '<div class="loader">Carregando curadoria...</div>';
    try {
        const response = await fetch(`/api/get-products?q=${encodeURIComponent(query)}`);
        let products = await response.json();
        if (isInitial) products = products.sort(() => 0.5 - Math.random()).slice(0, 12);
        renderProducts(products);
    } catch (error) { productsGrid.innerHTML = '<p>Erro ao carregar.</p>'; }
}

function renderProducts(products) {
    productsGrid.innerHTML = '';
    const productsWithCustom = [CUSTOM_PRODUCT, ...products];
    productsWithCustom.forEach(p => {
        const card = document.createElement('div');
        const stockValue = Number(p.stock);
        const hasNumericStock = Number.isFinite(stockValue);
        const isOutOfStock = hasNumericStock && stockValue <= 0;
        const stockText = isOutOfStock
            ? 'Consulte disponibilidade'
            : hasNumericStock
                ? `Estoque: ${stockValue}`
                : `Estoque: ${p.stock || 'Sob consulta'}`;

        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.image}" alt="${p.name}">
            <div class="card-info">
                <h4>${p.name}</h4>
                <p class="sku">SKU: ${p.sku}</p>
                <p class="stock ${isOutOfStock ? 'stock-unavailable' : ''}">${stockText}</p>
                <p class="price">R$ ${parseFloat(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <button class="btn-primary" onclick='adicionarAoOrcamento(${JSON.stringify(p).replace(/'/g, "&apos;")})'>ADICIONAR</button>
            </div>`;
        productsGrid.appendChild(card);
    });
}

// 3. CARRINHO
window.adicionarAoOrcamento = (produto) => {
    quoteCart.push({ 
        ...produto, 
        tempId: Date.now(), 
        item_orcamento_id: null,
        product_id: produto.id || null,
        displayName: produto.name, 
        quantity: 1, 
        variation: "",
        description: produto.description || "",
        customSellerDescription: produto.customSellerDescription || "",
        customCharacteristics: produto.customCharacteristics || "",
        customDimensions: produto.customDimensions || "",
        isCustomProduct: Boolean(produto.isCustomProduct),
        category: produto.category || "Geral" 
    });
    renderQuoteSidebar();
};

function ajustarAlturaItensOrcamento() {
    const maxVisibleItems = 4;
    const itensRenderizados = Array.from(quoteItemsContainer.querySelectorAll('.item-quote-edit'));

    if (itensRenderizados.length <= maxVisibleItems) {
        quoteItemsContainer.style.removeProperty('--quote-items-max-height');
        quoteItemsContainer.classList.remove('is-scrollable');
        return;
    }

    const alturaMaxima = itensRenderizados.slice(0, maxVisibleItems).reduce((total, item) => {
        const styles = window.getComputedStyle(item);
        const marginBottom = parseFloat(styles.marginBottom) || 0;
        return total + item.offsetHeight + marginBottom;
    }, 0);

    quoteItemsContainer.style.setProperty('--quote-items-max-height', `${Math.ceil(alturaMaxima)}px`);
    quoteItemsContainer.classList.add('is-scrollable');
}
function renderCamposProdutoPersonalizado(item, index) {
    if (!ehProdutoPersonalizado(item)) return '';
    const imagemAtual = obterImagemItem(item);

    return `
            <div class="custom-product-fields" style="display:grid; gap:6px; margin-top:2px;">
                <label style="font-size:10px; font-weight:bold; color:#1A3017;">Imagem</label>
                <button type="button" onclick="abrirDialogoImagemProdutoPersonalizado(${index})" ondragover="permitirArrastarImagemProdutoPersonalizado(event)" ondrop="receberImagemProdutoPersonalizado(event, ${index})" style="display:grid; grid-template-columns:64px 1fr; gap:10px; align-items:center; width:100%; min-height:78px; padding:8px; border:1px dashed #b9c9b8; border-radius:6px; background:#fbfdfb; cursor:pointer; text-align:left;">
                    <img src="${escaparHtml(imagemAtual)}" alt="Imagem do item personalizado" style="width:64px; height:60px; object-fit:cover; border-radius:4px; background:#f1f1f1;">
                    <span style="font-size:11px; line-height:1.35; color:#496246;">Arraste uma imagem da web ou clique para inserir URL</span>
                </button>
                <label style="font-size:10px; font-weight:bold; color:#1A3017;">Descrição</label>
                <textarea placeholder="Descrição vendedor" onchange="atualizarDados(${index}, 'customSellerDescription', this.value)" style="width:100%; min-height:54px; font-size:10px; padding:7px; border:1px solid #eee; resize:vertical;">${escaparHtml(item.customSellerDescription || '')}</textarea>
                <label style="font-size:10px; font-weight:bold; color:#1A3017;">Características</label>
                <textarea placeholder="Características" onchange="atualizarDados(${index}, 'customCharacteristics', this.value)" style="width:100%; min-height:54px; font-size:10px; padding:7px; border:1px solid #eee; resize:vertical;">${escaparHtml(item.customCharacteristics || '')}</textarea>
                <label style="font-size:10px; font-weight:bold; color:#1A3017;">Dimensão</label>
                <textarea placeholder="Dimensão" onchange="atualizarDados(${index}, 'customDimensions', this.value)" style="width:100%; min-height:44px; font-size:10px; padding:7px; border:1px solid #eee; resize:vertical;">${escaparHtml(item.customDimensions || '')}</textarea>
            </div>`;
}
function renderQuoteSidebar() {
    quoteItemsContainer.innerHTML = '';
    quoteCart.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-quote-edit';
        itemDiv.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center; margin-bottom:5px;">
                <img src="${obterImagemItem(item)}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">
                <input type="text" value="${item.displayName}" onchange="atualizarDados(${index}, 'displayName', this.value)" style="flex:1; font-weight:bold; border:none; background:transparent; font-size:12px;">
                <button onclick="removerItem(${index})" style="background:none; border:none; color:red; cursor:pointer;">&times;</button>
            </div>
            <input type="text" placeholder="Variação..." value="${escaparHtml(item.variation || '')}" onchange="atualizarDados(${index}, 'variation', this.value)" style="width:100%; font-size:10px; margin-bottom:5px; border:1px solid #eee;">
            ${renderCamposProdutoPersonalizado(item, index)}
            <div style="display:grid; grid-template-columns: 1fr 2fr; gap:8px;">
                <input type="number" value="${item.quantity}" onchange="atualizarDados(${index}, 'quantity', this.value)" style="width:100%;">
                <input type="number" step="0.01" value="${item.price}" onchange="atualizarDados(${index}, 'price', this.value)" style="width:100%; font-weight:bold;">
            </div>`;
        quoteItemsContainer.appendChild(itemDiv);
    });
    ajustarAlturaItensOrcamento();
    atualizarDestaqueTotal();
}

window.atualizarDados = (index, campo, valor) => {
    quoteCart[index][campo] = (campo === 'price' || campo === 'quantity') ? parseFloat(valor) : valor;
    if (ehProdutoPersonalizado(quoteCart[index])) quoteCart[index].description = obterDescricaoItem(quoteCart[index]);
    atualizarDestaqueTotal();
};
window.removerItem = (index) => { quoteCart.splice(index, 1); renderQuoteSidebar(); };
function atualizarDestaqueTotal() {
    const total = quoteCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    if (displayTotalGeral) displayTotalGeral.innerText = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

// 4. GERAÇÃO DE PDF + SALVAMENTO
const WHATSAPP_MESSAGE = 'Obrigado por Escolher a Casa Terrazi';

generatePdfBtn.addEventListener('click', async () => {
    if (!validarDadosObrigatorios()) return;

    const decisaoOrcamento = await avaliarOrcamentoExistente();
    if (decisaoOrcamento === 'cancel') return;

    if (decisaoOrcamento === 'update') currentCustomerKey = obterChaveCliente();
    const estadoAnterior = decisaoOrcamento === 'new' ? prepararNovoOrcamentoAPartirDoAtual() : null;

    const acao = await abrirDialogoAcaoPdf();
    if (!acao) {
        if (estadoAnterior) restaurarOrcamentoAnterior(estadoAnterior);
        return;
    }

    const originalBtnText = generatePdfBtn.innerText;
    generatePdfBtn.innerText = acao === 'whatsapp' ? 'PREPARANDO WHATSAPP...' : 'GERANDO PDF, AGUARDE...';
    generatePdfBtn.disabled = true;
    generatePdfBtn.style.opacity = '0.7';

    let gerouComSucesso = false;

    try {
        const orcamentoID = await salvarOrcamento();
        gerouComSucesso = true;
        marcarOrcamentoGerado(orcamentoID);
        const { element, filename } = montarDocumentoPdf(orcamentoID);

        if (acao === 'whatsapp') {
            const pdfBlob = await gerarPdfBlob(element);
            await enviarPdfWhatsApp(pdfBlob, filename);
        } else {
            await gerarDownloadPdf(element, filename);
        }
    } catch (error) {
        if (estadoAnterior && !gerouComSucesso) restaurarOrcamentoAnterior(estadoAnterior);
        console.error('Erro ao gerar orçamento:', error);
        alert(error.message || 'Erro ao gerar o orçamento. Tente novamente.');
    } finally {
        generatePdfBtn.innerText = currentOrcamentoId ? `GERAR ORÇAMENTO PDF #${currentOrcamentoId}` : originalBtnText;
        generatePdfBtn.disabled = false;
        generatePdfBtn.style.opacity = '1';
    }
});
function validarDadosObrigatorios() {
    if (quoteCart.length === 0) {
        alert('Selecione itens.');
        return false;
    }

    const camposObrigatorios = [
        { el: custName, msg: 'Preencha o nome do cliente.' },
        { el: custDoc, msg: 'Preencha o CPF ou CNPJ do cliente.' },
        { el: custPhone, msg: 'Preencha o telefone do cliente.' },
        { el: quoteValid, msg: 'Preencha a data de validade do orçamento.' }
    ];

    const campoPendente = camposObrigatorios.find(campo => !campo.el || !campo.el.value.trim());
    if (campoPendente) {
        alert(campoPendente.msg);
        campoPendente.el?.focus();
        return false;
    }

    const digitosDocumento = obterApenasDigitos(custDoc.value);
    if (![11, 14].includes(digitosDocumento.length)) {
        alert('Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos.');
        custDoc.focus();
        return false;
    }

    const digitosTelefoneCliente = obterApenasDigitos(custPhone.value);
    if (![10, 11].includes(digitosTelefoneCliente.length)) {
        alert('Informe um telefone do cliente com DDD e 10 ou 11 dígitos.');
        custPhone.focus();
        return false;
    }

    const digitosTelefoneVendedor = obterApenasDigitos(sellerPhone.value);
    if (digitosTelefoneVendedor.length > 0 && ![10, 11].includes(digitosTelefoneVendedor.length)) {
        alert('Informe um telefone do vendedor com DDD e 10 ou 11 dígitos.');
        sellerPhone.focus();
        return false;
    }

    custDoc.value = formatarCpfCnpj(custDoc.value);
    custPhone.value = formatarTelefone(custPhone.value);
    sellerPhone.value = formatarTelefone(sellerPhone.value);

    return true;
}
function obterChaveCliente() {
    return (custName.value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function marcarOrcamentoGerado(orcamentoId) {
    currentOrcamentoId = orcamentoId;
    currentCustomerKey = obterChaveCliente();
    generatePdfBtn.innerText = `GERAR ORÇAMENTO PDF #${orcamentoId}`;
}

function prepararNovoOrcamentoAPartirDoAtual() {
    const estadoAnterior = {
        currentOrcamentoId,
        currentCustomerKey,
        itemIds: quoteCart.map(item => item.item_orcamento_id || null)
    };

    currentOrcamentoId = null;
    currentCustomerKey = '';
    quoteCart.forEach(item => { item.item_orcamento_id = null; });
    generatePdfBtn.innerText = 'GERAR ORÇAMENTO PDF';
    return estadoAnterior;
}

function restaurarOrcamentoAnterior(estadoAnterior) {
    currentOrcamentoId = estadoAnterior.currentOrcamentoId;
    currentCustomerKey = estadoAnterior.currentCustomerKey;
    quoteCart.forEach((item, index) => {
        item.item_orcamento_id = estadoAnterior.itemIds[index] || null;
    });
    if (currentOrcamentoId) generatePdfBtn.innerText = `GERAR ORÇAMENTO PDF #${currentOrcamentoId}`;
}
async function avaliarOrcamentoExistente() {
    if (!currentOrcamentoId) return 'continue';
    return abrirDialogoOrcamentoExistente(currentOrcamentoId);
}

function abrirDialogoOrcamentoExistente(orcamentoId) {
    const dialog = document.getElementById('existingBudgetDialog');
    if (!dialog) {
        return Promise.resolve(confirm(`Já existe o orçamento #${orcamentoId} carregado. Clique em OK para atualizar/imprimir este orçamento, ou Cancelar para não continuar.`) ? 'update' : 'cancel');
    }

    const numero = dialog.querySelector('[data-existing-budget-id]');
    if (numero) numero.textContent = orcamentoId;

    const botaoNovo = dialog.querySelector('[data-existing-action="new"]');
    const botaoAtualizar = dialog.querySelector('[data-existing-action="update"]');
    if (botaoNovo) botaoNovo.textContent = 'Gerar novo orçamento (novo ID)';
    if (botaoAtualizar) botaoAtualizar.textContent = `Atualizar / Imprimir Orçamento #${orcamentoId}`;

    dialog.hidden = false;
    dialog.classList.add('is-open');
    document.body.classList.add('modal-open');

    return new Promise(resolve => {
        const fechar = (acao = 'cancel') => {
            dialog.classList.remove('is-open');
            document.body.classList.remove('modal-open');
            setTimeout(() => { dialog.hidden = true; }, 180);
            dialog.removeEventListener('click', cliqueFora);
            document.removeEventListener('keydown', fecharComEsc);
            resolve(acao);
        };

        const cliqueFora = (event) => {
            if (event.target === dialog) fechar('cancel');
        };

        const fecharComEsc = (event) => {
            if (event.key === 'Escape') fechar('cancel');
        };

        dialog.querySelector('[data-existing-action="update"]').onclick = () => fechar('update');
        dialog.querySelector('[data-existing-action="new"]').onclick = () => fechar('new');
        dialog.querySelector('[data-existing-action="cancel"]').onclick = () => fechar('cancel');
        dialog.addEventListener('click', cliqueFora);
        document.addEventListener('keydown', fecharComEsc);
    });
}

function limparFormularioOrcamento() {
    custName.value = '';
    custDoc.value = '';
    custPhone.value = '';
    quoteValid.value = '';
    sellerPhone.value = '';
    generalObs.value = '';
    if (sellerName) sellerName.value = usuarioLogado.nomefuncionario;

    quoteCart = [];
    currentOrcamentoId = null;
    currentCustomerKey = '';
    localStorage.removeItem('clonar_orcamento');

    generatePdfBtn.innerText = 'GERAR ORÇAMENTO PDF';
    renderQuoteSidebar();
    custName.focus();
}

window.limparOrcamento = limparFormularioOrcamento;
function abrirDialogoAcaoPdf() {
    const dialog = document.getElementById('pdfActionDialog');
    if (!dialog) return Promise.resolve('download');

    dialog.hidden = false;
    dialog.classList.add('is-open');
    document.body.classList.add('modal-open');

    return new Promise(resolve => {
        const fechar = (acao = null) => {
            dialog.classList.remove('is-open');
            document.body.classList.remove('modal-open');
            setTimeout(() => { dialog.hidden = true; }, 180);
            dialog.removeEventListener('click', cliqueFora);
            document.removeEventListener('keydown', fecharComEsc);
            resolve(acao);
        };

        const cliqueFora = (event) => {
            if (event.target === dialog) fechar(null);
        };

        const fecharComEsc = (event) => {
            if (event.key === 'Escape') fechar(null);
        };

        dialog.querySelector('[data-pdf-action="download"]').onclick = () => fechar('download');
        dialog.querySelector('[data-pdf-action="whatsapp"]').onclick = () => fechar('whatsapp');
        dialog.querySelector('[data-pdf-action="cancel"]').onclick = () => fechar(null);
        dialog.addEventListener('click', cliqueFora);
        document.addEventListener('keydown', fecharComEsc);
    });
}

async function confirmarOrcamentoPersistido(orcamentoId) {
    const res = await fetch(`/api/detalhe-orcamento?id=${encodeURIComponent(orcamentoId)}&t=${Date.now()}`, {
        cache: 'no-store'
    });
    const resultado = await res.json().catch(() => ({}));

    if (!res.ok || !resultado.id) {
        throw new Error(resultado.details || resultado.error || `O orçamento #${orcamentoId} não foi confirmado no banco.`);
    }

    return resultado;
}
async function salvarOrcamento() {
    const payload = {
        orcamento_id: currentOrcamentoId && currentCustomerKey === obterChaveCliente() ? currentOrcamentoId : null,
        cust_name: custName.value,
        cust_doc: obterApenasDigitos(custDoc.value),
        cust_phone: obterApenasDigitos(custPhone.value),
        valid_until: quoteValid.value,
        seller_name: sellerName.value,
        seller_phone: obterApenasDigitos(sellerPhone.value),
        nome_funcionario: usuarioLogado.nomefuncionario,
        categoria: usuarioLogado.categoria || 'Geral',
        general_obs: generalObs.value,
        total_value: quoteCart.reduce((acc, item) => acc + (item.price * item.quantity), 0),
        items: quoteCart.map(item => ({
            ...item,
            description: obterDescricaoItem(item),
            imagem_url: obterImagemParaSalvar(item),
            item_orcamento_id: item.item_orcamento_id || null,
            categoria: item.category || 'Geral'
        })),
        dados_vendedor: { 
            idfuncionario: usuarioLogado.idfuncionario, 
            idfilial: usuarioLogado.idfilial,
            nome_funcionario: usuarioLogado.nomefuncionario,
            categoria: usuarioLogado.categoria || 'Geral' 
        }
    };

    try {
        const res = await fetch('/api/salvar-orcamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const saveResult = await res.json();

        if (!res.ok) {
            throw new Error(saveResult.details || saveResult.error || 'Erro ao salvar orçamento.');
        }

        atualizarIdsItensSalvos(saveResult.items || []);

        const orcamentoSalvoId = saveResult.orcamentoId;
        if (!orcamentoSalvoId) throw new Error('O banco não retornou o número do orçamento salvo.');
        await confirmarOrcamentoPersistido(orcamentoSalvoId);
        return orcamentoSalvoId;
    } catch (error) {
        console.error('Erro no salvamento:', error);
        throw error;
    }
}

function atualizarIdsItensSalvos(itensSalvos) {
    itensSalvos.forEach(itemSalvo => {
        const itemCarrinho = quoteCart.find(item => String(item.tempId) === String(itemSalvo.tempId));
        if (itemCarrinho) itemCarrinho.item_orcamento_id = itemSalvo.item_orcamento_id;
    });
}

function montarDocumentoPdf(orcamentoID) {
    const element = document.createElement('div');
    const dataValidade = new Date(quoteValid.value + 'T00:00').toLocaleDateString('pt-BR');

    let html = `
    <style>
        .pdf-body { font-family: 'Helvetica', sans-serif; color: #1a1a1a; padding: 40px 40px 60px 60px; position: relative; background: white; width: 520pt; box-sizing: border-box; }
        .brand-sidebar { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: #1A3017; }
        .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3017; padding-bottom: 10px; margin-bottom: 20px; }
        .order-id { font-size: 24px; font-weight: bold; color: #1A3017; }
        .header-meta { font-size: 10px; color: #666; line-height: 1.4; text-align: right; }
        .info-box { background: #f9f9f9; padding: 15px; border-radius: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 10px; border: 1px solid #eee; margin-bottom: 25px; }
        .product-block { width: 100%; page-break-inside: avoid; margin-bottom: 35px; border-bottom: 1px solid #f0f0f0; padding-bottom: 20px; }
        .product-flex { display: flex; gap: 25px; }
        .col-left { width: 180px; flex-shrink: 0; }
        .col-right { flex: 1; }
        .img-main { width: 180px; height: 180px; object-fit: cover; border-radius: 4px; margin-bottom: 10px; }
        .dim-box { font-size: 9px; color: #1A3017; background: #F4F9F4; padding: 10px; border-radius: 4px; line-height: 1.3; }
        .prod-title { font-size: 18px; font-weight: bold; text-transform: uppercase; color: #1A3017; margin: 0; }
        .variation-text { font-size: 11px; color: #1A3017; font-weight: bold; margin: 8px 0; text-transform: uppercase; }
        .sku-text { font-size: 9px; color: #999; margin-bottom: 10px; display: block; }
        .emocional-text { font-size: 11px; line-height: 1.5; color: #444; margin-bottom: 12px; text-align: justify; font-style: italic; }
        .specs-box { font-size: 10px; border-top: 1px dashed #ccc; padding-top: 10px; color: #555; line-height: 1.4; }
        .price-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .price-table td { border: 1px solid #eee; padding: 8px; text-align: center; font-size: 11px; font-weight: bold; }
        .label-cell { background: #fafafa; font-size: 8px; color: #999; text-transform: uppercase; }
        .inst-text { font-size: 9px; color: #555; line-height: 1.5; text-align: justify; margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px; }
    </style>
    <div class="pdf-body">
        <div class="brand-sidebar"></div>
        <div class="pdf-header">
            <img src="${LOGO_URL}" style="height: 50px;">
            <div class="header-meta">
                <div class="order-id">ORÇAMENTO #${orcamentoID}</div>
                <strong style="color: #1A3017;">FILIAL: ${usuarioLogado.idfilial}</strong><br>
                Emissão: ${new Date().toLocaleDateString('pt-BR')} | Validade: ${dataValidade}
            </div>
        </div>
        <div class="info-box">
            <div><strong>CLIENTE:</strong><br>${custName.value || '---'}<br>DOC: ${custDoc.value || '---'}<br>TEL: ${custPhone.value || '---'}</div>
            <div><strong>VENDEDOR:</strong><br>${sellerName.value}<br>CONTATO: ${sellerPhone.value || '---'}</div>
        </div>`;

    quoteCart.forEach(item => {
        const limparTxt = (t) => t ? t.replace(/<\/?[^>]+(>|$)/g, '').trim() : '';
        let raw = obterDescricaoItem(item);
        let parts = raw.split(/(características|medidas|dimensões|especificações|técnico)/i);
        let emocional = limparTxt(parts[0]);
        let tecnico = ''; 
        let dimensoes = '';

        for (let i = 1; i < parts.length; i += 2) {
            let label = parts[i].toLowerCase();
            let content = limparTxt(parts[i + 1]);
            if (label.includes('dimensões') || label.includes('medidas')) {
                dimensoes += content + ' ';
            } else {
                tecnico += content + ' ';
            }
        }

        dimensoes = limparDimensoesPdf(dimensoes);

        html += `
        <div class="product-block">
            <div class="product-flex">
                <div class="col-left">
                    <img src="${obterImagemPdf(item)}" class="img-main">
                    ${dimensoes ? `
                        <div class="dim-box">
                            <strong>DIMENSÕES:</strong><br>${dimensoes}<br>
                        </div>` : ''}
                </div>
                <div class="col-right">
                    <h2 class="prod-title">${item.displayName}</h2>
                    <div class="emocional-text">${emocional}</div>
                    ${tecnico ? `<div class="specs-box"><strong>CARACTERÍSTICAS:</strong><br>${tecnico}</div>` : ''}
                    ${item.variation ? `<div class="variation-text">VARIAÇÃO: ${item.variation}</div>` : ''}
                    <span class="sku-text">SKU: ${item.sku}</span>
                    <table class="price-table">
                        <tr><td class="label-cell">Qtd</td><td class="label-cell">Valor Unitário</td><td class="label-cell">Subtotal</td></tr>
                        <tr>
                            <td>${item.quantity}</td>
                            <td>R$ ${item.price.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            <td>R$ ${(item.quantity * item.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                        </tr>
                    </table>
                </div>
            </div>
        </div>`;
    });

    html += `
        <div style="page-break-inside: avoid;">
            ${generalObs.value ? `<div style="font-size: 10px; background: #fdfdfd; padding: 10px; border: 1px solid #eee; margin-bottom: 15px;"><strong>OBSERVAÇÕES:</strong><br>${generalObs.value}</div>` : ''}
            <div style="background: #1A3017; color: white; padding: 20px; text-align: right; font-size: 20px; font-weight: bold; border-radius: 4px;">
                TOTAL GERAL: R$ ${displayTotalGeral.innerText}
            </div>
            <div class="inst-text">
                <p><strong>INFORMAÇÕES ADICIONAIS:</strong> *itens decorativos que aparecem na ambientação não acompanham a compra.</p>
                <p>cada peça da casa terrazi é fruto do design brasileiro, criada e produzida integralmente no brasil. valorizamos a produção local, o talento dos nossos profissionais e a qualidade que só o olhar atento de quem entende do próprio território pode oferecer. ao escolher um dos nossos móveis, você leva para casa não apenas sofisticação e funcionalidade, mas também uma história feita aqui — com originalidade, cuidado e identidade brasileira.</p>
            </div>
        </div>
    </div>`;

    element.innerHTML = html;
    return {
        element,
        filename: `Terrazi_${sanitizarNomeArquivo(custName.value || 'Orcamento')}_${orcamentoID}.pdf`
    };
}

async function gerarDownloadPdf(element, filename) {
    if (window.matchMedia('(min-width: 900px)').matches) {
        await esperarImagensDoPdf(element);
        await html2pdf().set({
            margin: [30, 0, 30, 0],
            filename,
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
        }).from(element).save();
        return;
    }

    const pdfBlob = await gerarPdfBlob(element);
    baixarPdf(pdfBlob, filename);
}
async function gerarPdfBlob(element) {
    if (window.matchMedia('(min-width: 900px)').matches) {
        element.style.width = '520pt';
        element.style.maxWidth = '520pt';
        return await html2pdf().set({
            margin: [30, 0, 30, 0],
            html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(element).outputPdf('blob');
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-render-wrapper';
    wrapper.style.position = 'absolute';
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.width = '794px';
    wrapper.style.background = '#ffffff';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '0';

    element.style.width = '794px';
    element.style.maxWidth = '794px';
    wrapper.appendChild(element);
    document.body.appendChild(wrapper);

    try {
        await esperarImagensDoPdf(element);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const alturaRender = Math.max(900, element.scrollHeight || wrapper.scrollHeight || 900);
        return await html2pdf().set({
            margin: [0, 0, 12, 0],
            html2canvas: {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                logging: false,
                backgroundColor: '#ffffff',
                scrollX: 0,
                scrollY: 0,
                width: 794,
                windowWidth: 794,
                windowHeight: alturaRender
            },
            jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(element).outputPdf('blob');
    } finally {
        wrapper.remove();
    }
}
function esperarImagensDoPdf(element) {
    const imagens = Array.from(element.querySelectorAll('img'));
    if (imagens.length === 0) return Promise.resolve();

    return Promise.all(imagens.map(img => new Promise(resolve => {
        img.crossOrigin = 'anonymous';
        if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
        }
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 2500);
    })));
}

function baixarPdf(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function enviarPdfWhatsApp(blob, filename) {
    const file = new File([blob], filename, { type: 'application/pdf' });
    const shareData = {
        files: [file],
        text: WHATSAPP_MESSAGE,
        title: filename
    };

    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        await navigator.share(shareData);
        abrirWhatsAppComTexto();
        return;
    }

    baixarPdf(blob, filename);
    abrirWhatsAppComTexto();
}

function abrirWhatsAppComTexto() {
    const telefone = normalizarTelefoneWhatsApp(custPhone.value);
    const texto = encodeURIComponent(WHATSAPP_MESSAGE);
    const url = telefone ? `https://wa.me/${telefone}?text=${texto}` : `https://wa.me/?text=${texto}`;
    window.open(url, '_blank', 'noopener');
}

function normalizarTelefoneWhatsApp(valor) {
    const apenasDigitos = (valor || '').replace(/\D/g, '');
    if (!apenasDigitos) return '';
    if (apenasDigitos.startsWith('55')) return apenasDigitos;
    if (apenasDigitos.length === 10 || apenasDigitos.length === 11) return `55${apenasDigitos}`;
    return apenasDigitos;
}

function sanitizarNomeArquivo(valor) {
    return valor.replace(/[\/\\?%*:|"<>]/g, '-').trim() || 'Orcamento';
}

function exibirUsuarioLogado() {
    const infoTopo = document.getElementById('user-info-topo');
    if (infoTopo) {
        infoTopo.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px; width:100%; color: white; padding: 10px; font-size: 13px;">
                <span><strong>Vendedor:</strong> ${usuarioLogado.nomefuncionario} | <strong>Filial:</strong> ${usuarioLogado.idfilial} | <strong>Categoria:</strong> ${usuarioLogado.categoria || 'Geral'}</span>
                <div style="flex-grow:1"></div>
                <button onclick="fazerLogout()" style="background:#c0392b; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer;">SAIR</button>
            </div>`;
    }
}
window.fazerLogout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };
