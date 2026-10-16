function erroValidacao(mensagem, statusCode = 400, code = 'INVALID_COMMISSION_SALE') {
    return Object.assign(new Error(mensagem), { statusCode, code });
}

export function normalizarTextoComissao(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');
}

export function chaveVendaComissao(idfilialSaida, numeroSaida) {
    const filial = String(idfilialSaida ?? '').trim().toUpperCase().slice(0, 2);
    const numero = Number.parseInt(numeroSaida, 10);
    return filial && Number.isSafeInteger(numero) && numero > 0 ? `${filial}:${numero}` : '';
}

export function normalizarVendaComissao(dados = {}) {
    const idfilialSaida = String(dados.idfilialSaida ?? dados.idfilial_saida ?? '').trim().toUpperCase().slice(0, 2);
    const numeroSaida = Number.parseInt(dados.numeroSaida ?? dados.numero_saida, 10);
    const orcamentoId = Number.parseInt(dados.orcamentoId ?? dados.orcamento_id, 10);
    const valorBruto = dados.valorVenda ?? dados.valor_venda ?? '';
    const valorVenda = typeof valorBruto === 'number'
        ? valorBruto
        : Number(String(valorBruto).trim().replace(/\s|R\$/gi, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
    const situacaoEntrega = normalizarTextoComissao(dados.situacaoEntrega ?? dados.situacao_entrega);

    if (!idfilialSaida || !Number.isSafeInteger(numeroSaida) || numeroSaida <= 0) {
        throw erroValidacao('Filial ou numero da venda nao informado.');
    }
    if (!Number.isSafeInteger(orcamentoId) || orcamentoId <= 0) {
        throw erroValidacao('Orcamento da venda nao informado.');
    }
    if (!Number.isFinite(valorVenda) || valorVenda < 0) {
        throw erroValidacao('Valor da venda invalido.');
    }
    if (situacaoEntrega !== 'ENTREGA REALIZADA') {
        throw erroValidacao('A comissao somente pode ser autorizada depois da entrega realizada.', 409, 'SALE_NOT_DELIVERED');
    }
    return {
        idfilialSaida,
        numeroSaida,
        orcamentoId,
        valorVenda: Math.round((valorVenda + Number.EPSILON) * 100) / 100,
        situacaoEntrega,
        chave: chaveVendaComissao(idfilialSaida, numeroSaida)
    };
}

export function calcularValorComissao(valorVenda, percentualComissao) {
    const valor = Number(valorVenda);
    const percentual = Number(percentualComissao);
    if (!Number.isFinite(valor) || valor < 0 || !Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
        throw erroValidacao('Base ou percentual de comissao invalido.');
    }
    return Math.round(((valor * percentual) / 100 + Number.EPSILON) * 100) / 100;
}

export function statusOperacionalComissao(pagamento) {
    if (!pagamento) return 'PENDENTE';
    if (pagamento.status_pagamento === 'AUTORIZADO' && pagamento.lote_pagamento_id) return 'AGUARDANDO_GERACAO';
    return String(pagamento.status_pagamento || 'PENDENTE');
}
