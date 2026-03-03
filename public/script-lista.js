window.clonarOrcamento = async (id) => {
    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        const orcamento = await res.json();
        
        // Salvamos no localStorage para a index.html ler
        localStorage.setItem('clonar_orcamento', JSON.stringify(orcamento));
        
        // Redireciona para a página principal
        window.location.href = 'index.html';
    } catch (error) {
        alert("Erro ao recuperar dados para clonagem.");
    }
};

window.alterarStatus = async (id, novoStatus) => {
    if(!novoStatus) return;
    const res = await fetch('/api/status-orcamento', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: novoStatus })
    });
    
    if(res.ok) {
        alert("Status atualizado!");
        location.reload(); // Recarrega a lista
    }
};
