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
    element.pdfData = {
        orcamentoID,
        dataValidade,
        dataEmissao: new Date().toLocaleDateString('pt-BR'),
        filial: usuarioLogado.idfilial,
        clienteNome: custName.value || '---',
        clienteDoc: custDoc.value || '---',
        clienteTelefone: custPhone.value || '---',
        vendedorNome: sellerName.value || '---',
        vendedorContato: sellerPhone.value || '---',
        obsGeral: generalObs.value || '',
        totalGeral: displayTotalGeral.innerText,
        itens: quoteCart.map(item => ({ ...item }))
    };    return {
        element,
        filename: `Terrazi_${sanitizarNomeArquivo(custName.value || 'Orcamento')}_${orcamentoID}.pdf`
    };
}

async function gerarPdfBlob(element) {
    if (element.pdfData) return gerarPdfA4Programatico(element.pdfData);

    return html2pdf().set({
        margin: [30, 0, 30, 0],
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
    }).from(element).outputPdf('blob');
}

async function gerarPdfA4Programatico(dados) {
    const jsPDFConstructor = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFConstructor) throw new Error('Biblioteca jsPDF indisponivel.');

    const pdf = new jsPDFConstructor({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 36;
    const verde = [26, 48, 23];
    const cinzaTexto = [68, 68, 68];
    let y = 50;

    const limparTxt = (texto) => (texto || '').replace(/<\/p>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+(>|$)/g, '').replace(/&nbsp;/g, ' ').replace(/\s+\n/g, '\n').trim();
    const formatarMoeda = (valor) => Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    const novaPagina = () => {
        pdf.addPage();
        y = 42;
        desenharCabecalho(false);
    };

    const garantirEspaco = (altura) => {
        if (y + altura > pageHeight - 50) novaPagina();
    };

    const textoQuebrado = (texto, x, largura, tamanho = 10, estilo = 'normal', cor = cinzaTexto, linha = 1.35) => {
        pdf.setFont('helvetica', estilo);
        pdf.setFontSize(tamanho);
        pdf.setTextColor(...cor);
        const linhas = pdf.splitTextToSize(texto || '', largura);
        pdf.text(linhas, x, y, { lineHeightFactor: linha });
        y += linhas.length * tamanho * linha;
        return linhas.length;
    };

    const desenharCabecalho = (comDadosCliente = true) => {
        pdf.setFillColor(...verde);
        pdf.rect(0, 0, 8, pageHeight, 'F');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(24);
        pdf.setTextColor(...verde);
        pdf.text(`ORCAMENTO #${dados.orcamentoID}`, margin, y);

        pdf.setFontSize(10);
        pdf.text(`FILIAL: ${dados.filial || '---'}`, pageWidth - margin, y - 2, { align: 'right' });
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Emissao: ${dados.dataEmissao} | Validade: ${dados.dataValidade}`, pageWidth - margin, y + 14, { align: 'right' });

        y += 28;
        pdf.setDrawColor(...verde);
        pdf.setLineWidth(1.5);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 20;

        if (!comDadosCliente) return;

        pdf.setFillColor(249, 249, 249);
        pdf.setDrawColor(235, 235, 235);
        pdf.roundedRect(margin, y, pageWidth - (margin * 2), 58, 4, 4, 'FD');
        pdf.setFontSize(9);
        pdf.setTextColor(30, 30, 30);
        pdf.setFont('helvetica', 'bold');
        pdf.text('CLIENTE:', margin + 14, y + 16);
        pdf.text('VENDEDOR:', pageWidth / 2 + 8, y + 16);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${dados.clienteNome}`, margin + 14, y + 30);
        pdf.text(`DOC: ${dados.clienteDoc}`, margin + 14, y + 43);
        pdf.text(`TEL: ${dados.clienteTelefone}`, margin + 120, y + 43);
        pdf.text(`${dados.vendedorNome}`, pageWidth / 2 + 8, y + 30);
        pdf.text(`CONTATO: ${dados.vendedorContato}`, pageWidth / 2 + 8, y + 43);
        y += 82;
    };

    desenharCabecalho(true);

    for (const item of dados.itens) {
        garantirEspaco(210);
        const inicioBloco = y;
        const xImg = margin;
        const imgSize = 132;
        const xTexto = margin + imgSize + 20;
        const larguraTexto = pageWidth - xTexto - margin;

        const imagem = await carregarImagemPdf(item.image);
        if (imagem) {
            try { pdf.addImage(imagem, 'JPEG', xImg, y, imgSize, imgSize); } catch (e) { /* imagem opcional */ }
        } else {
            pdf.setDrawColor(235, 235, 235);
            pdf.setFillColor(250, 250, 250);
            pdf.rect(xImg, y, imgSize, imgSize, 'FD');
        }

        if (item.description) {
            const raw = item.description || '';
            const parts = raw.split(/(características|medidas|dimensões|especificações|técnico)/i);
            item.textoEmocional = limparTxt(parts[0]);
            item.textoTecnico = limparTxt(parts.slice(1).join(' '));
        }

        let yTexto = y;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(15);
        pdf.setTextColor(...verde);
        pdf.text(pdf.splitTextToSize((item.displayName || item.name || '').toUpperCase(), larguraTexto), xTexto, yTexto);
        yTexto += 32;

        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(9.5);
        pdf.setTextColor(...cinzaTexto);
        const emocional = pdf.splitTextToSize(item.textoEmocional || '', larguraTexto);
        pdf.text(emocional.slice(0, 8), xTexto, yTexto, { lineHeightFactor: 1.35 });
        yTexto += Math.min(emocional.length, 8) * 13;

        if (item.variation) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.setTextColor(...verde);
            pdf.text(`VARIACAO: ${item.variation}`, xTexto, yTexto + 4);
            yTexto += 18;
        }

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`SKU: ${item.sku || '---'}`, xTexto, yTexto);

        const tableY = Math.max(inicioBloco + imgSize + 18, yTexto + 16);
        const tableX = xTexto;
        const tableW = larguraTexto;
        pdf.setDrawColor(230, 230, 230);
        pdf.setFillColor(250, 250, 250);
        pdf.rect(tableX, tableY, tableW, 22, 'FD');
        pdf.rect(tableX, tableY + 22, tableW, 26);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text('QTD', tableX + 22, tableY + 14);
        pdf.text('VALOR UNITARIO', tableX + tableW / 2, tableY + 14, { align: 'center' });
        pdf.text('SUBTOTAL', tableX + tableW - 28, tableY + 14, { align: 'right' });
        pdf.setFontSize(10);
        pdf.setTextColor(30, 30, 30);
        pdf.text(String(item.quantity || 0), tableX + 24, tableY + 39);
        pdf.text(`R$ ${formatarMoeda(item.price)}`, tableX + tableW / 2, tableY + 39, { align: 'center' });
        pdf.text(`R$ ${formatarMoeda((item.quantity || 0) * (item.price || 0))}`, tableX + tableW - 28, tableY + 39, { align: 'right' });

        y = tableY + 70;
        pdf.setDrawColor(240, 240, 240);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 25;
    }

    garantirEspaco(150);
    if (dados.obsGeral) {
        pdf.setFillColor(253, 253, 253);
        pdf.setDrawColor(235, 235, 235);
        pdf.rect(margin, y, pageWidth - margin * 2, 48, 'FD');
        y += 15;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(30, 30, 30);
        pdf.text('OBSERVACOES:', margin + 10, y);
        y += 13;
        textoQuebrado(limparTxt(dados.obsGeral), margin + 10, pageWidth - margin * 2 - 20, 9);
        y += 12;
    }

    pdf.setFillColor(...verde);
    pdf.roundedRect(margin, y, pageWidth - margin * 2, 44, 4, 4, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(255, 255, 255);
    pdf.text(`TOTAL GERAL: ${dados.totalGeral}`, pageWidth - margin - 14, y + 28, { align: 'right' });
    y += 68;

    pdf.setTextColor(85, 85, 85);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    textoQuebrado('INFORMACOES ADICIONAIS: itens decorativos que aparecem na ambientacao nao acompanham a compra. Cada peca da Casa Terrazi e fruto do design brasileiro, criada e produzida integralmente no Brasil.', margin, pageWidth - margin * 2, 8);

    return pdf.output('blob');
}

function carregarImagemPdf(src) {
    if (!src) return Promise.resolve(null);
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            } catch (e) {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = src;
        setTimeout(() => resolve(null), 2500);
    });
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


