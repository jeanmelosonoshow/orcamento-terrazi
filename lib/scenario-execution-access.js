const MODOS_EXECUCAO_CENARIO = new Set(['painel', 'detalhe', 'drilldown', 'exportacao', 'edicao']);

export function normalizarModoExecucaoCenario(modoExecucao) {
    return String(modoExecucao || 'painel').trim().toLowerCase();
}

export function validarModoExecucaoCenario(modoExecucao) {
    const modo = normalizarModoExecucaoCenario(modoExecucao);
    return MODOS_EXECUCAO_CENARIO.has(modo) ? '' : 'Modo de execucao do cenario invalido.';
}

export function modoExecucaoExigeEditor(modoExecucao) {
    return normalizarModoExecucaoCenario(modoExecucao) === 'edicao';
}
