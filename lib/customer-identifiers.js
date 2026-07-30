export function normalizarDocumentoCliente(valor) {
    return String(valor || '').replace(/\D/g, '').slice(0, 20);
}

export function normalizarTelefoneCliente(valor) {
    return String(valor || '').replace(/\D/g, '').slice(0, 15);
}

export function normalizarEmailCliente(valor) {
    return String(valor || '').trim().toLowerCase();
}

export function emailClienteValido(valor) {
    const email = normalizarEmailCliente(valor);
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function normalizarBuscaCliente(dados = {}) {
    const cpf = normalizarDocumentoCliente(dados.cpf);
    const telefone = normalizarTelefoneCliente(dados.telefone);
    const email = normalizarEmailCliente(dados.email);
    return {
        cpf: [11, 14].includes(cpf.length) ? cpf : '',
        telefone: [10, 11].includes(telefone.length) ? telefone : '',
        email: emailClienteValido(email) ? email : ''
    };
}
