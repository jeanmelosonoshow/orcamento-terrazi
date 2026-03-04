const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioLogado'));
if (!usuarioLogado) { window.location.href = 'login.html'; }

window.todosOrcamentos = []; 
const LOGO_URL = "https://acdn-us.mitiendanube.com/stores/005/667/009/themes/common/logo-1922118012-1769009009-757fb821fbae032664390fbbb9a301c71769009009-480-0.webp";

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
        renderizarCards(orcamentos);
    } catch (error) {
        grid.innerHTML = '<p style="color:red;">Erro ao carregar histórico.</p>';
    }
}

function renderizarCards(lista) {
    const grid = document.getElementById('orcamentosGrid');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); 
    
    grid.innerHTML = '';

    lista.forEach(o => {
        let dataExibicao = "Sem data";
        let dataValidade = null;
        
        if (o.data_validade || o.valid_until) {
            const dataRaw = o.data_validade || o.valid_until;
            const partes = dataRaw.split('T')[0].split('-'); 
            dataValidade = new Date(partes[0], partes[1] - 1, partes[2]);
            dataValidade.setHours(0, 0, 0, 0);
            dataExibicao = dataValidade.toLocaleDateString('pt-BR');
        }
        
        let statusFinal = (o.status || 'Pendente').trim().toUpperCase();
        if (dataValidade && dataValidade < hoje && statusFinal === 'PENDENTE') {
            statusFinal = 'EXPIRADO';
        }

        let badgeColor = "#856404"; 
        let badgeBg = "#fff3cd";    
        
        if (statusFinal === 'EXPIRADO' || statusFinal === 'CANCELADO') {
            badgeColor = "#721c24"; 
            badgeBg = "#f8d7da";    
        } else if (statusFinal === 'GEROU VENDA' || statusFinal === 'VENDIDO' || statusFinal === 'FECHADO') {
            badgeColor = "#1A3017"; 
            badgeBg = "#E8F5E9";    
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
                <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Vendedor: ${o.vendedor_nome}</p>
                <div class="total" style="font-size: 18px; font-weight: 700; color: #1A3017;">
                    R$ ${parseFloat(o.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </div>
                <div class="badge-status" style="margin-top:10px; display:inline-block; padding:4px 12px; border-radius:12px; font-size:10px; font-weight:bold; text-transform:uppercase; color: ${badgeColor}; background-color: ${badgeBg};">
                    ${statusFinal}
                </div>
            </div>
            <div class="card-footer" style="display:flex; gap:8px; padding: 12px; background: #f9f9f9; border-top: 1px solid #eee;">
                <button class="btn-reabrir" onclick="clonagemRapida(this, ${o.id})" 
                    style="flex:1; background:#1A3017; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:600;">REABRIR</button>
                <button class="btn-imprimir" onclick="gerarImpressaoRapida(this, ${o.id})" 
                    style="flex:1; background:white; color:#1A3017; border:1px solid #1A3017; padding:8px; border-radius:4px; cursor:pointer; font-weight:600;">IMPRIMIR</button>
            </div>`;
        grid.appendChild(card);
    });
}

window.filtrarCards = () => {
    const termo = document.getElementById('filterInput').value.toLowerCase().trim();
    const status = document.getElementById('statusFilter').value;

    if (termo === "" && status === "") {
        renderizarCards(window.todosOrcamentos);
        return;
    }

    const filtrados = window.todosOrcamentos.filter(o => {
        const nomeCliente = (o.cliente_nome || "").toLowerCase();
        const docCliente = (o.cliente_doc || "").toLowerCase();
        const bateTexto = nomeCliente.includes(termo) || docCliente.includes(termo);
        const bateStatus = status === "" || o.status === status;
        return bateTexto && bateStatus;
    });

    renderizarCards(filtrados);
};

// 1. REABRIR (Redireciona para o index para edição)
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

// 2. IMPRIMIR (Abre em nova aba usando a estrutura de "visualização" do sistema)
window.gerarImpressaoRapida = async (btn, id) => {
    const originalText = btn.innerText;
    btn.innerText = "AGUARDE...";
    btn.disabled = true;

    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const data = await res.json();
        
        // Simula o carregamento no localStorage para a página de impressão ler
        localStorage.setItem('impressao_temp', JSON.stringify(data));
        
        // Abre uma nova janela que você deve criar (ex: imprimir.html) 
        // ou redireciona para uma rota que gere o PDF com a mesma lógica do index
        // Para ser imediato sem criar arquivo novo, vamos usar a técnica do Blob no código abaixo:
        
        imprimirViaLayoutOriginal(data);

        btn.innerText = originalText;
        btn.disabled = false;
    } catch (e) {
        console.error(e);
        alert("Erro ao carregar dados para impressão.");
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

// Esta função garante que o layout seja exatamente o que você quer (com totalizador e itens)
function imprimirViaLayoutOriginal(data) {
    const win = window.open('', '_blank');
    
    // Pegamos a lógica de tratamento de dados para garantir que nada venha em branco
    const totalGeral = parseFloat(data.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2});
    const dataEmissao = data.data_criacao ? new Date(data.data_criacao).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
    const dataValidade = data.data_validade ? new Date(data.data_validade.split('T')[0] + 'T03:00:00').toLocaleDateString('pt-BR') : 'A consultar';

    let itensHtml = '';
    data.items.forEach(item => {
        const subtotal = (parseFloat(item.quantidade) * parseFloat(item.preco_unitario)).toLocaleString('pt-BR', {minimumFractionDigits: 2});
        itensHtml += `
            <div style="display: flex; gap: 20px; border-bottom: 1px solid #eee; padding: 15px 0; page-break-inside: avoid;">
                <img src="${item.imagem_url || ''}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 4px;">
                <div style="flex: 1;">
                    <h2 style="margin: 0; color: #1A3017; font-size: 16px; text-transform: uppercase;">${item.nome_produto}</h2>
                    <p style="font-size: 11px; color: #555; margin: 10px 0;">${item.descricao_tecnica || ''}</p>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                        <tr style="background: #fafafa; font-size: 9px; color: #999; text-transform: uppercase;">
                            <th style="padding: 5px; border: 1px solid #eee;">Qtd</th>
                            <th style="padding: 5px; border: 1px solid #eee;">Unitário</th>
                            <th style="padding: 5px; border: 1px solid #eee;">Subtotal</th>
                        </tr>
                        <tr style="font-weight: bold; text-align: center; font-size: 12px;">
                            <td style="padding: 8px; border: 1px solid #eee;">${item.quantidade}</td>
                            <td style="padding: 8px; border: 1px solid #eee;">R$ ${parseFloat(item.preco_unitario).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            <td style="padding: 8px; border: 1px solid #eee;">R$ ${subtotal}</td>
                        </tr>
                    </table>
                </div>
            </div>`;
    });

    win.document.write(`
        <html>
        <head>
            <title>Orçamento #${data.id}</title>
            <style>
                body { font-family: sans-serif; margin: 0; padding: 40px; color: #333; }
                .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #1A3017; padding-bottom: 10px; }
                .total-box { background: #1A3017; color: white; padding: 20px; text-align: right; font-size: 24px; font-weight: bold; border-radius: 4px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="header">
                <img src="${LOGO_URL}" style="height: 60px;">
                <div style="text-align: right;">
                    <h1 style="margin:0; color: #1A3017;">ORÇAMENTO #${data.id}</h1>
                    <p style="margin:0; font-size: 12px;">Emissão: ${dataEmissao} | Validade: ${dataValidade}</p>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; background: #f9f9f9; padding: 15px; margin: 20px 0; font-size: 12px; border-radius: 4px;">
                <div><strong>CLIENTE:</strong> ${data.cliente_nome || '---'}<br><strong>DOC:</strong> ${data.cliente_doc || '---'}</div>
                <div style="text-align: right;"><strong>VENDEDOR:</strong> ${data.vendedor_nome}<br><strong>FILIAL:</strong> ${data.idfilial}</div>
            </div>
            ${itensHtml}
            <div class="total-box">TOTAL GERAL: R$ ${totalGeral}</div>
            <script>
                // Pequeno delay para carregar imagens antes de chamar o print
                window.onload = () => { 
                    window.print(); 
                    // win.close(); // Opcional: fechar a aba após imprimir
                };
            </script>
        </body>
        </html>
    `);
    win.document.close();
}

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
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    exibirUsuarioLogado();
    carregarHistorico();
});
