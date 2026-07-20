const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioLogado'));
if (!usuarioLogado) { window.location.href = 'login.html'; }

window.todosOrcamentos = [];
let orcamentosFiltrados = [];
let paginaAtual = 1;
const ITENS_POR_PAGINA = 15;
const statusSelecionadosFiltro = new Set(['PENDENTE', 'EXPIRADO']);
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";
const CUSTOM_PRODUCT_IMAGE_URL = "https://lh3.googleusercontent.com/pw/AP1GczNXEpE7d00qdZ8UbOSIrUFqUQRfZ2XoRMzOUDZ2_4vq52AC7m_73Z0RP64I-qfSKiPYthP4LBEA3L1eMDXSNASJ5I__WQyafHOS2hapKhAG4HkgUJ5LouyEI8Dz0ZUA2ZyGWonprLsUXbrroUGxdEzm=w911-h911-s-no-gm?authuser=0";
const CUSTOM_PRODUCT_IMAGE_KEY = "CUSTOM_PRODUCT_IMAGE";

function obterImagemItem(item) {
    const imagem = item?.imagem_url || item?.image || '';
    return imagem === CUSTOM_PRODUCT_IMAGE_KEY ? CUSTOM_PRODUCT_IMAGE_URL : imagem;
}

async function carregarHistorico() {
    const grid = document.getElementById('orcamentosGrid');
    const params = new URLSearchParams({
        categoria: usuarioLogado.categoria,
        idfuncionario: usuarioLogado.idfuncionario,
        idfilial: usuarioLogado.idfilial
    });

    try {
        const response = await fetch(`/api/listar-orcamentos?${params.toString()}`);
        const orcamentos = await response.json();
        
        if (!orcamentos || orcamentos.length === 0) {
            grid.innerHTML = '<p>Nenhum orçamento encontrado.</p>';
            return;
        }
        window.todosOrcamentos = orcamentos;
        filtrarOrcamentos();
    } catch (error) {
        grid.innerHTML = '<p style="color:red;">Erro ao carregar histórico.</p>';
    }
}

function obterDataValidade(orcamento) {
    const dataRaw = orcamento.data_validade || orcamento.valid_until;
    if (!dataRaw) return null;

    const partes = dataRaw.split('T')[0].split('-');
    if (partes.length !== 3) return null;

    const dataValidade = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
    dataValidade.setHours(0, 0, 0, 0);
    return dataValidade;
}

function obterStatusExibicao(orcamento) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let statusFinal = (orcamento.status || 'PENDENTE').trim().toUpperCase();
    const dataValidade = obterDataValidade(orcamento);

    if (dataValidade && dataValidade < hoje && statusFinal === 'PENDENTE') {
        statusFinal = 'EXPIRADO';
    }

    return statusFinal;
}

function obterStatusSelecionados() {
    return Array.from(statusSelecionadosFiltro);
}

function atualizarResumoStatus() {
    const summary = document.getElementById('statusFilterSummary');
    if (!summary) return;
    const selecionados = obterStatusSelecionados();
    summary.textContent = selecionados.length ? selecionados.join(', ') : 'Selecione status';

    document.querySelectorAll('[data-status-option]').forEach(option => {
        const status = option.dataset.statusOption;
        const ativo = statusSelecionadosFiltro.has(status);
        option.classList.toggle('is-selected', ativo);
    });
}

function inicializarFiltroStatus() {
    const filtro = document.getElementById('statusFilter');
    const toggle = document.getElementById('statusFilterToggle');
    const menu = document.getElementById('statusFilterMenu');
    if (!filtro || !toggle || !menu) return;

    const fecharMenu = () => {
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        filtro.classList.remove('is-open');
    };

    toggle.addEventListener('click', () => {
        const abrir = menu.hidden;
        menu.hidden = !abrir;
        toggle.setAttribute('aria-expanded', String(abrir));
        filtro.classList.toggle('is-open', abrir);
    });

    document.querySelectorAll('[data-status-option]').forEach(option => {
        option.addEventListener('click', () => {
            const status = option.dataset.statusOption;
            if (statusSelecionadosFiltro.has(status)) {
                statusSelecionadosFiltro.delete(status);
            } else {
                statusSelecionadosFiltro.add(status);
            }
            atualizarResumoStatus();
            filtrarOrcamentos();
        });
    });

    document.addEventListener('click', event => {
        if (!filtro.contains(event.target)) fecharMenu();
    });

    atualizarResumoStatus();
}

function filtrarOrcamentos() {
    const termo = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const statusSelecionados = obterStatusSelecionados();

    orcamentosFiltrados = window.todosOrcamentos.filter(o => {
        const statusFinal = obterStatusExibicao(o);
        const nomeCliente = (o.cliente_nome || o.nome_cliente || '').toLowerCase();
        const documento = (o.cliente_doc || o.cpf || o.cnpj || '').toString().toLowerCase().replace(/[^\d]/g, '');
        const idOrcamento = (o.id || '').toString();
        const termoLimpo = termo.replace(/[^\d]/g, '');

        const bateTexto = termo === '' ||
            nomeCliente.includes(termo) ||
            idOrcamento.includes(termo) ||
            (termoLimpo !== '' && documento.includes(termoLimpo));

        return bateTexto && statusSelecionados.includes(statusFinal);
    });

    paginaAtual = 1;
    renderizarPaginaAtual();
}

function renderizarPaginaAtual() {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const fim = inicio + ITENS_POR_PAGINA;
    renderizarCards(orcamentosFiltrados.slice(inicio, fim));
    renderizarPaginacao();
}

function renderizarPaginacao() {
    const container = document.getElementById('paginationControls');
    if (!container) return;

    const totalPaginas = Math.ceil(orcamentosFiltrados.length / ITENS_POR_PAGINA);
    if (totalPaginas <= 1) {
        container.innerHTML = '';
        return;
    }

    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA + 1;
    const fim = Math.min(paginaAtual * ITENS_POR_PAGINA, orcamentosFiltrados.length);

    container.innerHTML = `
        <button type="button" class="pagination-btn" onclick="mudarPagina(${paginaAtual - 1})" ${paginaAtual === 1 ? 'disabled' : ''}>ANTERIOR</button>
        <span class="pagination-summary">${inicio}-${fim} de ${orcamentosFiltrados.length} | Página ${paginaAtual} de ${totalPaginas}</span>
        <button type="button" class="pagination-btn" onclick="mudarPagina(${paginaAtual + 1})" ${paginaAtual === totalPaginas ? 'disabled' : ''}>PRÓXIMA</button>
    `;
}

window.mudarPagina = (novaPagina) => {
    const totalPaginas = Math.ceil(orcamentosFiltrados.length / ITENS_POR_PAGINA);
    if (novaPagina < 1 || novaPagina > totalPaginas) return;
    paginaAtual = novaPagina;
    renderizarPaginaAtual();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function renderizarCards(lista) {
    const grid = document.getElementById('orcamentosGrid');
    grid.innerHTML = '';

    if (!lista.length) {
        grid.innerHTML = '<p>Nenhum orçamento encontrado para os filtros selecionados.</p>';
        return;
    }

    lista.forEach(o => {
        const dataValidade = obterDataValidade(o);
        const dataExibicao = dataValidade ? dataValidade.toLocaleDateString('pt-BR') : 'Sem data';
        const statusFinal = obterStatusExibicao(o);

        let badgeColor = '#856404'; let badgeBg = '#fff3cd';
        if (statusFinal === 'EXPIRADO' || statusFinal === 'CANCELADO') {
            badgeColor = '#721c24'; badgeBg = '#f8d7da';
        } else if (statusFinal === 'GEROU VENDA' || statusFinal === 'VENDIDO' || statusFinal === 'FECHADO') {
            badgeColor = '#1A3017'; badgeBg = '#E8F5E9';
        }

        let statusHtml = `
            <div class="badge-status" style="margin-top:10px; display:inline-block; padding:4px 12px; border-radius:12px; font-size:10px; font-weight:bold; text-transform:uppercase; color: ${badgeColor}; background-color: ${badgeBg};">
                ${statusFinal}
            </div>`;

        if (statusFinal === 'PENDENTE') {
            statusHtml = `
                <select onchange="alterarStatusOrcamento(this, ${o.id})" style="margin-top:10px; padding:4px 8px; border-radius:12px; font-size:10px; font-weight:bold; border: 1px solid #856404; background: #fff3cd; color: #856404; cursor:pointer;">
                    <option value="PENDENTE" selected>PENDENTE</option>
                    <option value="GEROU VENDA">GEROU VENDA</option>
                    <option value="CANCELADO">CANCELADO</option>
                </select>`;
        }

        const card = document.createElement('div');
        card.className = `orcamento-card status-${statusFinal.toLowerCase().replace(/\s+/g, '-')}`;
        card.innerHTML = `
            <div class="card-header">
                <span>#${o.id}</span>
                <span style="font-size:11px; font-weight:600;">Validade: ${dataExibicao}</span>
            </div>
            <div class="card-body">
                <h3 style="margin: 0 0 5px 0; font-size: 16px; color: #1A3017;">${o.cliente_nome || 'Consumidor'}</h3>
                <p style="font-size: 12px; color: #666; margin-bottom: 2px;">Vendedor: ${o.vendedor_nome}</p>
                ${o.cliente_doc ? `<p style="font-size: 11px; color: #888; margin-bottom: 2px;">CPF/CNPJ: ${o.cliente_doc}</p>` : ''}
                ${o.telefone_cliente ? `<p style="font-size: 11px; color: #888; margin-bottom: 10px;">Telefone: ${o.telefone_cliente}</p>` : ''}
                <div class="total" style="font-size: 18px; font-weight: 700; color: #1A3017;">
                    R$ ${parseFloat(o.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </div>
                ${statusHtml}
            </div>
            <div class="card-footer" style="display:flex; gap:8px; padding: 12px; background: #f9f9f9; border-top: 1px solid #eee;">
                <button class="btn-reabrir" onclick="clonagemRapida(this, ${o.id})" style="flex:1; background:#1A3017; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:600;">REABRIR</button>
                <button class="btn-imprimir" onclick="gerarImpressaoRapida(this, ${o.id})" style="flex:1; background:white; color:#1A3017; border:1px solid #1A3017; padding:8px; border-radius:4px; cursor:pointer; font-weight:600;">IMPRIMIR</button>
            </div>`;
        grid.appendChild(card);
    });
}

window.filtrarCards = filtrarOrcamentos;
// Funções de ação (Status, Clone, Impressão) permanecem iguais...
window.alterarStatusOrcamento = async (select, id) => {
    const novoStatus = select.value;
    if (novoStatus === 'PENDENTE') return;
    if (!confirm(`Deseja alterar o status do orçamento #${id} para ${novoStatus}?`)) {
        select.value = 'PENDENTE';
        return;
    }
    select.disabled = true;
    try {
        const response = await fetch('/api/status-orcamento', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: novoStatus })
        });
        if (response.ok) {
            carregarHistorico();
        } else {
            const err = await response.json();
            alert("Erro: " + (err.error || "Não foi possível alterar."));
            carregarHistorico();
        }
    } catch (e) {
        alert("Erro na conexão com o servidor.");
        select.disabled = false;
    }
};

window.clonagemRapida = async (btn, id) => {
    const originalText = btn.innerText;
    btn.innerText = "AGUARDE...";
    btn.disabled = true;
    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const orcamento = await res.json();
        localStorage.setItem('clonar_orcamento', JSON.stringify(orcamento));
        window.location.href = 'index.html';
    } catch (e) {
        alert("Erro ao reabrir.");
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

window.gerarImpressaoRapida = async (btn, id) => {
    const originalText = btn.innerText;
    btn.innerText = "AGUARDE...";
    btn.disabled = true;
    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const data = await res.json();
        
        const nomeClienteFinanceiro = (data.cliente_nome || 'Consumidor').replace(/[/\\?%*:|"<>]/g, '-');
        const nomeArquivo = `Orcamento_${data.id}_${nomeClienteFinanceiro}.pdf`;

        const element = document.createElement('div');
        const dataValidade = data.data_validade ? new Date(data.data_validade.split('T')[0] + 'T03:00').toLocaleDateString('pt-BR') : 'A consultar';
        const dataEmissao = data.data_criacao ? new Date(data.data_criacao).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');

        let html = `
        <style>
            .pdf-body { font-family: 'Helvetica', sans-serif; color: #1a1a1a; padding: 40px 40px 60px 60px; position: relative; background: white; width: 520pt; box-sizing: border-box; }
            .brand-sidebar { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: #1A3017; }
            .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3017; padding-bottom: 10px; margin-bottom: 20px; }
            .order-id { font-size: 24px; font-weight: bold; color: #1A3017; }
            .header-meta { font-size: 10px; color: #666; text-align: right; }
            .info-box { background: #f9f9f9; padding: 15px; border-radius: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 10px; border: 1px solid #eee; margin-bottom: 25px; }
            .product-block { width: 100%; page-break-inside: avoid; margin-bottom: 30px; border-bottom: 1px solid #f0f0f0; padding-bottom: 20px; }
            .product-flex { display: flex; gap: 25px; }
            .col-left { width: 180px; flex-shrink: 0; }
            .col-right { flex: 1; }
            .img-main { width: 180px; height: 180px; object-fit: cover; border-radius: 4px; margin-bottom: 10px; }
            .dim-box { font-size: 9px; color: #1A3017; background: #F4F9F4; padding: 10px; border-radius: 4px; line-height: 1.3; }
            .prod-title { font-size: 18px; font-weight: bold; text-transform: uppercase; color: #1A3017; margin: 0; }
            .emocional-text { font-size: 11px; line-height: 1.5; color: #444; margin-bottom: 12px; text-align: justify; font-style: italic; }
            .specs-box { font-size: 10px; border-top: 1px dashed #ccc; padding-top: 10px; color: #555; line-height: 1.4; }
            .price-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .price-table td { border: 1px solid #eee; padding: 8px; text-align: center; font-size: 11px; font-weight: bold; }
            .label-cell { background: #fafafa; font-size: 8px; color: #999; text-transform: uppercase; }
            .total-destaque { background: #1A3017; color: white; padding: 15px 20px; text-align: right; font-size: 20px; font-weight: bold; border-radius: 4px; margin-top: 10px; }
            .inst-text { font-size: 9px; color: #555; line-height: 1.5; text-align: justify; margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px; }
            .footer-container { page-break-inside: avoid; margin-top: 20px; padding-bottom: 20px; }
        </style>
        <div class="pdf-body">
            <div class="brand-sidebar"></div>
            <div class="pdf-header">
                <img src="${LOGO_URL}" style="height: 50px;">
                <div class="header-meta">
                    <div class="order-id">ORÇAMENTO #${data.id}</div>
                    <strong style="color: #1A3017;">FILIAL: ${data.idfilial || usuarioLogado.idfilial}</strong><br>
                    Emissão: ${dataEmissao} | Validade: ${dataValidade}
                </div>
            </div>
            <div class="info-box">
                <div><strong>CLIENTE:</strong><br>${data.cliente_nome || 'Consumidor'}<br>DOC: ${data.cliente_doc || '---'}<br>TEL: ${data.telefone_cliente || '---'}</div>
                <div><strong>VENDEDOR:</strong><br>${data.vendedor_nome}<br>CONTATO: ${data.vendedor_contato || '---'}</div>
            </div>`;

        data.items.forEach(item => {
            const limparTxt = (t) => t ? t.replace(/<\/?[^>]+(>|$)/g, "").trim() : "";
            let raw = item.descricao_tecnica || item.description || "";
            
            let parts = raw.split(/(características|medidas|dimensões|especificações|técnico)/i);
            let emocional = limparTxt(parts[0]);
            let tecnico = ""; 
            let dimensoes = "";

            for (let i = 1; i < parts.length; i += 2) {
                let label = parts[i].toLowerCase();
                let content = limparTxt(parts[i+1]);
                if (label.includes("dimensões") || label.includes("medidas")) {
                    dimensoes += content + " ";
                } else {
                    tecnico += content + " ";
                }
            }

            html += `
            <div class="product-block">
                <div class="product-flex">
                    <div class="col-left">
                        <img src="${obterImagemItem(item)}" class="img-main">
                        ${dimensoes ? `
                            <div class="dim-box">
                                <strong>DIMENSÕES:</strong><br>${dimensoes}<br>
                                
                            </div>` : ''}
                    </div>
                    <div class="col-right">
                        <h2 class="prod-title">${item.nome_produto || item.displayName}</h2>
                        <div class="emocional-text">${emocional}</div>
                        
                        ${tecnico ? `<div class="specs-box"><strong>CARACTERÍSTICAS:</strong><br>${tecnico}</div>` : ''}
                        
                        ${item.variacao ? `<div style="font-size:11px; font-weight:bold; color:#1A3017; margin:8px 0; text-transform:uppercase;">VARIAÇÃO: ${item.variacao}</div>` : ''}
                        <span style="font-size:9px; color:#999; display:block; margin-bottom:10px;">SKU: ${item.sku || '---'}</span>
                        
                        <table class="price-table">
                            <tr><td class="label-cell">Qtd</td><td class="label-cell">Valor Unitário</td><td class="label-cell">Subtotal</td></tr>
                            <tr>
                                <td>${item.quantidade}</td>
                                <td>R$ ${parseFloat(item.preco_unitario).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                <td>R$ ${(item.quantidade * item.preco_unitario).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>`;
        });

        html += `
            <div class="footer-container">
                ${data.obs_geral ? `<div style="font-size: 10px; background: #fdfdfd; padding: 10px; border: 1px solid #eee; margin-bottom: 5px;"><strong>OBSERVAÇÕES:</strong><br>${data.obs_geral}</div>` : ''}
                
                <div class="total-destaque">TOTAL GERAL: R$ ${parseFloat(data.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>

                <div class="inst-text">
                    <p><strong>INFORMAÇÕES ADICIONAIS:</strong> *itens decorativos que aparecem na ambientação não acompanham a compra.</p>
                    <p>cada peça da casa terrazi é fruto do design brasileiro, criada e produzida integralmente no brasil. valorizamos a produção local, o talento dos nossos profissionais e a qualidade que só o olhar atento de quem entende do próprio território pode oferecer. ao escolher um dos nossos móveis, você leva para casa não apenas sofisticação e funcionalidade, mas também uma história feita aqui — com originalidade, cuidado e identidade brasileira.</p>
                </div>
            </div>
        </div>`;

        element.innerHTML = html;
        const isMobile = window.matchMedia('(max-width: 899px)').matches;
        const opt = {
            margin: isMobile ? [0, 0, 12, 0] : [30, 0, 30, 0],
            filename: nomeArquivo,
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        };

        html2pdf().set(opt).from(element).save().then(function () {
            btn.innerText = originalText;
            btn.disabled = false;
        });
    } catch (e) {
        console.error(e);
        alert("Erro ao imprimir.");
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

window.fazerLogout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };

function exibirUsuarioLogado() {
    const infoTopo = document.getElementById('user-info-topo');
    if (infoTopo && usuarioLogado) {
        infoTopo.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px; width:100%;">
                <span><strong>Vendedor:</strong> ${usuarioLogado.nomefuncionario} | </span>
                <span><strong>Filial:</strong> ${usuarioLogado.idfilial} | </span>
                <span><strong>Categoria:</strong> ${usuarioLogado.categoria}  </span>
                <div style="flex-grow:1"></div>
                <button onclick="fazerLogout()" style="background:#c0392b; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-weight:bold;">SAIR</button>
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    exibirUsuarioLogado();
    inicializarFiltroStatus();
    document.getElementById('searchInput')?.addEventListener('input', filtrarOrcamentos);
    carregarHistorico();
});
