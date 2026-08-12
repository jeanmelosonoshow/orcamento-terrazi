export async function executarManutencaoControleContato(cliente, logger = console) {
    try {
        const resultado = await cliente.query(`
            SELECT executada, contatos_reabertos
              FROM fn_executar_manutencao_contatos()
        `);
        const linha = resultado.rows?.[0] || {};
        return {
            ok: true,
            executada: linha.executada === true,
            contatosReabertos: Number(linha.contatos_reabertos || 0)
        };
    } catch (error) {
        logger.warn?.('[controle-contato] manutencao diaria indisponivel', {
            code: error?.code || null,
            message: error?.message || String(error)
        });
        return { ok: false, executada: false, contatosReabertos: 0 };
    }
}
