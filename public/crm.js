const usuarioLogadoRaw = sessionStorage.getItem('usuarioLogado');
if (!usuarioLogadoRaw) {
    window.location.href = 'login.html';
}

const usuarioLogado = JSON.parse(usuarioLogadoRaw || '{}');
const nome = usuarioLogado.nomefuncionario || usuarioLogado.nome || 'Usuário';
const filial = usuarioLogado.idfilial ? `Filial: ${usuarioLogado.idfilial}` : 'Casa Terrazi';
const categoria = usuarioLogado.categoria || 'Vendedor';

document.getElementById('crmUserName').textContent = nome;
document.getElementById('crmUserMeta').textContent = `${filial} · ${categoria}`;
document.getElementById('crmUserRole').textContent = categoria;

window.fazerLogout = () => {
    sessionStorage.clear();
    window.location.href = 'login.html';
};