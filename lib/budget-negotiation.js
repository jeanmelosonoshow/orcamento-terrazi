export const STATUS_NEGOCIACAO = new Set([
    'ORCAMENTO CRIADO',
    'ENVIADO AO CLIENTE',
    'EM NEGOCIACAO',
    'EXPIRADO',
    'GEROU VENDA',
    'RECUSADO'
]);

export const STATUS_CONTATO_ORCAMENTO = new Set(['PENDENTE', 'AGUARDANDO RETORNO', 'FINALIZADO']);
export const TIPOS_CONTATO_ORCAMENTO = new Set(['WHATSAPP', 'LIGACAO', 'EMAIL', 'SMS', 'TELEGRAM']);

export function normalizarStatus(valor) {
    return String(valor || '').trim().toUpperCase();
}

export function numeroSessao(valor) {
    const numero = Number(valor);
    return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

export function textoLimitado(valor, limite) {
    return String(valor ?? '').trim().slice(0, limite);
}

export async function definirContextoAuditoria(cliente, session, origem) {
    await cliente.query(`
        SELECT
            set_config('app.idfuncionario', $1, TRUE),
            set_config('app.idvendedor', $2, TRUE),
            set_config('app.origem', $3, TRUE)
    `, [
        String(numeroSessao(session?.sub) || ''),
        String(numeroSessao(session?.idvendedor) || ''),
        textoLimitado(origem || 'APLICACAO', 30).toUpperCase()
    ]);
}

export async function expirarOrcamentos(cliente) {
    const resultado = await cliente.query('SELECT fn_expirar_orcamentos() AS atualizados');
    return Number(resultado.rows?.[0]?.atualizados || 0);
}

export async function verificarAcessoOrcamento(cliente, orcamentoId, session) {
    const categoria = normalizarStatus(session?.categoria);
    const idfuncionario = numeroSessao(session?.sub);
    const idfilial = textoLimitado(session?.idfilial, 2);
    const resultado = await cliente.query(`
        SELECT o.id
          FROM orcamentos o
         WHERE o.id = $1
           AND (
               $2::TEXT IN ('DI', 'SU')
               OR ($2::TEXT = 'VD' AND EXISTS (
                   SELECT 1 FROM vendedor_orcamento v
                    WHERE v.id_orcamento = o.id AND v.id_funcionario = $3
               ))
               OR ($2::TEXT IN ('GR', 'CX') AND EXISTS (
                   SELECT 1 FROM vendedor_orcamento v
                    WHERE v.id_orcamento = o.id AND v.id_filial = $4
               ))
           )
         LIMIT 1
    `, [orcamentoId, categoria, idfuncionario, idfilial]);
    return resultado.rows.length > 0;
}

export function normalizarNegociacao(linha) {
    if (!linha) return null;
    return {
        id: linha.id,
        orcamentoId: linha.orcamento_id,
        status: linha.status_negociacao,
        valorAnterior: linha.valor_anterior,
        valorAtual: linha.valor_atual,
        motivoRecusa: linha.motivo_recusa,
        motivoRecusaDescricao: linha.motivo_recusa_descricao,
        observacao: linha.observacao || '',
        idfuncionario: linha.idfuncionario,
        idvendedor: linha.idvendedor,
        origem: linha.origem,
        dataStatus: linha.data_status,
        vigente: linha.vigente === true
    };
}

export function normalizarContatoOrcamento(linha) {
    if (!linha) return null;
    return {
        orcamentoId: linha.orcamento_id,
        statusContato: linha.status_contato,
        tipoContato: linha.tipo_contato,
        observacao: linha.observacao || '',
        dataPrimeiroContato: linha.data_primeiro_contato,
        dataUltimoContato: linha.data_ultimo_contato,
        dataFinalizacao: linha.data_finalizacao,
        idfuncionario: linha.idfuncionario,
        idvendedor: linha.idvendedor,
        qtdeContato: linha.qtde_contato,
        dataUltimaAtualizacao: linha.data_ultima_atualizacao,
        finalizado: linha.status_contato === 'FINALIZADO'
    };
}
