const usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioLogado'));
if (!usuarioLogado) { window.location.href = 'login.html'; }

window.todosOrcamentos = []; // Cache para o filtro funcionar

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
    hoje.setHours(0, 0, 0, 0); // Normaliza para comparar apenas a data
    
    grid.innerHTML = '';

    lista.forEach(o => {
        // Garante que a data seja lida corretamente independente do formato do banco
        const dataValidade = new Date(o.data_validade || o.valid_until);
        dataValidade.setHours(0, 0, 0, 0); 
        
        let statusFinal = o.status || 'Pendente';

        // Regra de Expiração Automática: se a validade é anterior a hoje e não foi vendido
        if (dataValidade < hoje && (statusFinal.toLowerCase() === 'pendente' || statusFinal.toLowerCase() === 'novo')) {
            statusFinal = 'Expirado';
        }

        const card = document.createElement('div');
        // Mantém a classe de status para o CSS aplicar as cores (amarelo, vermelho ou verde)
        card.className = `orcamento-card status-${statusFinal.toLowerCase()}`; 
        
        card.innerHTML = `
            <div class="card-header">
                <span>#${o.id}</span> 
                <span style="font-size:11px; font-weight:600;">Vencimento: ${dataValidade.toLocaleDateString('pt-BR')}</span>
            </div>
            <div class="card-body">
                <h3 style="margin: 0 0 5px 0; font-size: 16px; color: #1A3017;">${o.cliente_nome || 'Consumidor'}</h3>
                <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Vendedor: ${o.vendedor_nome}</p>
                <div class="total" style="font-size: 18px; font-weight: 700; color: #1A3017;">
                    R$ ${parseFloat(o.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </div>
                <div class="badge-status" style="margin-top:10px; display:inline-block; padding:4px 10px; border-radius:12px; font-size:10px; font-weight:bold; text-transform:uppercase;">
                    ${statusFinal}
                </div>
            </div>
            <div class="card-footer" style="display:flex; gap:8px; padding: 12px; background: #f9f9f9; border-top: 1px solid #eee;">
                <button class="btn-reabrir" onclick="clonagemRapida(${o.id})" 
                    style="flex:1; background:#1A3017; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:600;">REABRIR</button>
                <button class="btn-imprimir" onclick="gerarImpressaoRapida(${o.id})" 
                    style="flex:1; background:white; color:#1A3017; border:1px solid #1A3017; padding:8px; border-radius:4px; cursor:pointer; font-weight:600;">IMPRIMIR</button>
            </div>`;
        grid.appendChild(card);
    });
}
// FUNÇÃO DE FILTRO GLOBAL (Correção da funcionalidade)
window.filtrarCards = () => {
    const termo = document.getElementById('filterInput').value.toLowerCase().trim();
    const status = document.getElementById('statusFilter').value;

    // Se não houver termo nem status, mostra tudo original
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

window.clonagemRapida = async (id) => {
    const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
    const orcamento = await res.json();
    localStorage.setItem('clonar_orcamento', JSON.stringify(orcamento));
    window.location.href = 'index.html';
};

window.fazerLogout = () => { sessionStorage.clear(); window.location.href = 'login.html'; };

function exibirUsuarioLogado() {
    const infoTopo = document.getElementById('user-info-topo');
    if (infoTopo && usuarioLogado) {
        infoTopo.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px; width:100%;">
                <span><strong>Vendedor:</strong> ${usuarioLogado.nomefuncionario}</span>
                <span><strong>Filial:</strong> ${usuarioLogado.idfilial}</span>
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
