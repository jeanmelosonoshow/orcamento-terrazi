// --- 4. SALVAMENTO E GERAÇÃO DE PDF RESTAURADA ---

async function salvarNoBanco() {
    const totalGeral = quoteCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    
    // Payload atualizado para incluir dados da filial e vendedor para o banco
    const payload = {
        cust_name: custName.value,
        cust_doc: custDoc.value,
        valid_until: quoteValid.value,
        seller_name: sellerName.value,
        seller_phone: sellerPhone.value,
        general_obs: generalObs.value,
        total_value: totalGeral,
        items: quoteCart,
        // Envia dados para a tabela vendedor_orcamento e filial
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
    } catch (error) { 
        console.error("Erro ao salvar no banco:", error); 
        return { success: false };
    }
}

if (generatePdfBtn) {
    generatePdfBtn.addEventListener('click', async () => {
        if (quoteCart.length === 0) return alert("Selecione itens primeiro.");

        // Recupera o ID do orçamento se estivermos em modo de impressão, ou salva um novo
        const urlParams = new URLSearchParams(window.location.search);
        const isModoImpressao = urlParams.get('modo') === 'impressao';
        let idParaExibir = "";

        if (!isModoImpressao) {
            const resultado = await salvarNoBanco();
            if (resultado && resultado.success) {
                idParaExibir = resultado.id; // Assume que a API retorna o ID gerado
                console.log("Orçamento salvo com sucesso!");
            }
        }

        // --- LÓGICA DE MONTAGEM DO PDF (RESTAURADA) ---
        const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";
        const element = document.createElement('div');
        const valorTotalOrcamento = quoteCart.reduce((acc, item) => acc + (parseFloat(item.price) * parseInt(item.quantity)), 0);
        const dataValidadeStr = quoteValid.value ? new Date(quoteValid.value + 'T00:00').toLocaleDateString('pt-BR') : 'A consultar';

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
                    <strong>ORÇAMENTO TERRAZI ${idParaExibir ? '#' + idParaExibir : ''}</strong><br>
                    <strong>Filial: ${usuarioLogado.idfilial}</strong><br>
                    Emissão: ${new Date().toLocaleDateString('pt-BR')}<br>
                    Validade: ${dataValidadeStr}
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
                <div style="page-break-inside: avoid; margin-top: 20px;">
                    ${generalObs.value ? `<div style="background: #f9f9f9; padding: 10px; border: 1px solid #eee; font-size: 10px; margin-bottom: 10px;"><strong>OBSERVAÇÕES:</strong><br>${generalObs.value.replace(/\n/g, '<br>')}</div>` : ''}
                    <div style="background: #1A3017; color: white; padding: 15px; border-radius: 4px; text-align: right;">
                        <span style="font-size: 20px; font-weight: bold;">TOTAL: R$ ${valorTotalOrcamento.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                    </div>
                </div>
            </div>`;

        element.innerHTML = html;
        
        const opt = {
            margin: [20, 0, 20, 0],
            filename: `Terrazi_${custName.value || 'Orcamento'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true },
            jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        html2pdf().set(opt).from(element).save();
    });
}

// 5. FUNÇÕES DE SESSÃO E LOGOUT
function exibirUsuarioLogado() {
    const infoTopo = document.getElementById('user-info-topo');
    if (infoTopo && usuarioLogado) {
        infoTopo.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px; width:100%;">
                <span><strong>Vendedor:</strong> ${usuarioLogado.nomefuncionario} | </span>
                <span><strong>Filial:</strong> ${usuarioLogado.idfilial} | </span>
                <span><strong>Categoria:</strong> ${usuarioLogado.categoria} </span>
                <div style="flex-grow:1"></div>
                <button onclick="fazerLogout()" style="background:#c0392b; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-weight:bold;">SAIR</button>
            </div>
        `;
    }
}

window.fazerLogout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };
