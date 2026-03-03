window.clonarOrcamento = async (id) => {
    try {
        const res = await fetch(`/api/detalhe-orcamento?id=${id}`);
        if (!res.ok) throw new Error("Falha ao buscar dados");
        
        const orcamento = await res.json();
        
        // Salvamos no localStorage para a index.html ler
        localStorage.setItem('clonar_orcamento', JSON.stringify(orcamento));
        
        // Redireciona para a página principal para iniciar a edição
        window.location.href = 'index.html';
    } catch (error) {
        console.error(error);
        alert("Erro ao recuperar dados para clonagem. Verifique a conexão.");
    }
};

window.alterarStatus = async (id, novoStatus) => {
    if (!novoStatus) return;

    // Confirmação para evitar fechamento acidental (já que a trava impede retorno)
    const confirmar = confirm(`Deseja realmente alterar o status para "${novoStatus.toUpperCase()}"? Esta ação não poderá ser desfeita.`);
    
    if (!confirmar) {
        location.reload(); // Recarrega para voltar o select ao valor original visualmente
        return;
    }

    try {
        const res = await fetch('/api/status-orcamento', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: novoStatus })
        });
        
        const data = await res.json();

        if (res.ok) {
            alert("Status atualizado com sucesso!");
            location.reload(); 
        } else {
            alert(`Erro: ${data.error}`);
            location.reload();
        }
    } catch (error) {
        alert("Erro de rede ao atualizar status.");
        location.reload();
    }
};
