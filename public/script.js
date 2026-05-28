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

// 1. INICIALIZAÇÃO E EVENTOS
document.addEventListener('DOMContentLoaded', () => {
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
        custDoc.value = data.cliente_doc || '';
        if (custPhone) custPhone.value = data.telefone_cliente || '';
        sellerPhone.value = data.vendedor_contato || '';
        generalObs.value = data.obs_geral || '';
        if (data.data_validade) quoteValid.value = data.data_validade.split('T')[0];
        currentOrcamentoId = data.id || null;
        currentCustomerKey = currentOrcamentoId ? obterChaveCliente() : '';
        if (currentOrcamentoId) generatePdfBtn.innerText = `GERAR ORÇAMENTO PDF #${currentOrcamentoId}`;
        quoteCart = (data.items || []).map(item => ({
            ...item,
            item_orcamento_id: item.item_orcamento_id || item.id || null,
            displayName: item.nome_produto || item.displayName,
            price: parseFloat(item.preco_unitario || item.price),
            quantity: parseInt(item.quantidade || item.quantity),
            variation: item.variacao || item.variation || '',
            image: item.imagem_url || item.image,
            description: item.descricao_tecnica || item.description,
            category: item.categoria || '',
            tempId: Date.now() + Math.random()
        }));
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
    products.forEach(p => {
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
        category: produto.category || "Geral" 
    });
    renderQuoteSidebar();
};

function renderQuoteSidebar() {
    quoteItemsContainer.innerHTML = '';
    quoteCart.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-quote-edit';
        itemDiv.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center; margin-bottom:5px;">
                <img src="${item.image}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">
                <input type="text" value="${item.displayName}" onchange="atualizarDados(${index}, 'displayName', this.value)" style="flex:1; font-weight:bold; border:none; background:transparent; font-size:12px;">
                <button onclick="removerItem(${index})" style="background:none; border:none; color:red; cursor:pointer;">&times;</button>
            </div>
            <input type="text" placeholder="Variação..." value="${item.variation || ''}" onchange="atualizarDados(${index}, 'variation', this.value)" style="width:100%; font-size:10px; margin-bottom:5px; border:1px solid #eee;">
            <div style="display:grid; grid-template-columns: 1fr 2fr; gap:8px;">
                <input type="number" value="${item.quantity}" onchange="atualizarDados(${index}, 'quantity', this.value)" style="width:100%;">
                <input type="number" step="0.01" value="${item.price}" onchange="atualizarDados(${index}, 'price', this.value)" style="width:100%; font-weight:bold;">
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

// 4. GERAÇÃO DE PDF + SALVAMENTO
const WHATSAPP_MESSAGE = 'Obrigado por Escolher a Casa Terrazi';

generatePdfBtn.addEventListener('click', async () => {
    if (!validarDadosObrigatorios()) return;

    const acao = await abrirDialogoAcaoPdf();
    if (!acao) return;

    const originalBtnText = generatePdfBtn.innerText;
    generatePdfBtn.innerText = acao === 'whatsapp' ? 'PREPARANDO WHATSAPP...' : 'GERANDO PDF, AGUARDE...';
    generatePdfBtn.disabled = true;
    generatePdfBtn.style.opacity = '0.7';

    try {
        const orcamentoID = await salvarOrcamento();
                marcarOrcamentoGerado(orcamentoID);
        const { element, filename } = montarDocumentoPdf(orcamentoID);
        const pdfBlob = await gerarPdfBlob(element);

        if (acao === 'whatsapp') {
            await enviarPdfWhatsApp(pdfBlob, filename);
        } else {
            baixarPdf(pdfBlob, filename);
        }
    } catch (error) {
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
        { el: custPhone, msg: 'Preencha o telefone do cliente.' },
        { el: quoteValid, msg: 'Preencha a data de validade do orçamento.' }
    ];

    const campoPendente = camposObrigatorios.find(campo => !campo.el || !campo.el.value.trim());
    if (campoPendente) {
        alert(campoPendente.msg);
        campoPendente.el?.focus();
        return false;
    }

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

async function avaliarOrcamentoExistente() {
    if (!currentOrcamentoId || currentCustomerKey !== obterChaveCliente()) return 'continue';
    return abrirDialogoOrcamentoExistente(currentOrcamentoId);
}

function abrirDialogoOrcamentoExistente(orcamentoId) {
    const dialog = document.getElementById('existingBudgetDialog');
    if (!dialog) {
        return Promise.resolve(confirm(`Já existe o orçamento ${orcamentoId} gerado para esse cliente. Deseja atualizar/imprimir novamente?`) ? 'update' : 'cancel');
    }

    const numero = dialog.querySelector('[data-existing-budget-id]');
    if (numero) numero.textContent = orcamentoId;

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
    quoteCart = [];
    currentOrcamentoId = null;
    currentCustomerKey = '';
    generatePdfBtn.innerText = 'GERAR ORÇAMENTO PDF';
    renderQuoteSidebar();
    custName.focus();
}

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

async function salvarOrcamento() {
    const payload = {
        orcamento_id: currentOrcamentoId && currentCustomerKey === obterChaveCliente() ? currentOrcamentoId : null,
        cust_name: custName.value,
        cust_doc: custDoc.value,
        cust_phone: custPhone.value,
        valid_until: quoteValid.value,
        seller_name: sellerName.value,
        seller_phone: sellerPhone.value,
        nome_funcionario: usuarioLogado.nomefuncionario,
        categoria: usuarioLogado.categoria || 'Geral',
        general_obs: generalObs.value,
        total_value: quoteCart.reduce((acc, item) => acc + (item.price * item.quantity), 0),
        items: quoteCart.map(item => ({
            ...item,
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
            throw new Error(saveResult.error || 'Erro ao salvar orçamento.');
        }

        atualizarIdsItensSalvos(saveResult.items || []);

        return saveResult.id || saveResult.insertId || saveResult.orcamentoId || `REF-${Date.now().toString().slice(-6)}`;
    } catch (error) {
        console.error('Erro no salvamento:', error);
        return `REF-${Date.now().toString().slice(-6)}`;
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
        .pdf-body { font-family: 'Helvetica', sans-serif; color: #1a1a1a; padding: 40px 40px 30px 60px; position: relative; background: white; }
        .brand-sidebar { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: #1A3017; }
        .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3017; padding-bottom: 10px; margin-bottom: 20px; }
        .order-id { font-size: 24px; font-weight: bold; color: #1A3017; }
        .header-meta { font-size: 10px; color: #666; line-height: 1.4; text-align: right; }
        .info-box { background: #f9f9f9; padding: 15px; border-radius: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 10px; border: 1px solid #eee; margin-bottom: 25px; }
        .product-block { width: 100%; page-break-inside: avoid; margin-bottom: 35px; border-bottom: 1px solid #f0f0f0; padding-bottom: 20px; }
        .product-flex { display: flex; gap: 25px; }
        .col-left { width: 200px; flex-shrink: 0; }
        .col-right { flex: 1; }
        .img-main { width: 200px; height: 200px; object-fit: cover; border-radius: 4px; margin-bottom: 10px; }
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
        let raw = item.description || '';
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

        html += `
        <div class="product-block">
            <div class="product-flex">
                <div class="col-left">
                    <img src="${item.image}" class="img-main">
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

async function gerarPdfBlob(element) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-render-wrapper';
    wrapper.appendChild(element);
    document.body.appendChild(wrapper);

    try {
        await esperarImagensDoPdf(element);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        return await html2pdf().set({
            margin: [20, 0, 20, 0],
            html2canvas: {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                scrollX: 0,
                scrollY: 0,
                windowWidth: 794,
                windowHeight: Math.max(1123, element.scrollHeight || 1123)
            },
            jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
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











