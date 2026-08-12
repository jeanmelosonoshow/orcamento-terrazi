import { executarConsultaFirebirdGateway } from './bi-gateway-client.js';

const SQL_MEDIA_RECOMPRA = `
    SELECT ROUND(AVG(R.MEDIA_RECOMPRA_CLIENTE)) AS RECOMPRA
      FROM RECOMPRA_CLIENTE R
`;

function obterCampo(linha, nome) {
    if (!linha || typeof linha !== 'object') return undefined;
    const chave = Object.keys(linha).find(item => item.toUpperCase() === nome.toUpperCase());
    return chave ? linha[chave] : undefined;
}

function normalizarMediaRecompra(linhas) {
    const valor = Number(obterCampo(linhas?.[0], 'RECOMPRA'));
    if (!Number.isFinite(valor) || valor <= 0 || valor > 3650) {
        const error = new Error('Media de recompra retornada pelo Firebird e invalida.');
        error.code = 'INVALID_REPURCHASE_AVERAGE';
        throw error;
    }
    return Math.round(valor);
}

async function registrarFalha(cliente, error) {
    try {
        await cliente.query('SELECT fn_registrar_falha_manutencao_contatos($1)', [
            `${error?.code || 'CONTACT_MAINTENANCE_ERROR'}: ${error?.message || String(error)}`
        ]);
    } catch (registroError) {
        // A falha original e mais relevante e sera registrada pelo chamador.
    }
}

export async function executarManutencaoControleContato(cliente, {
    executarFirebird = executarConsultaFirebirdGateway,
    logger = console
} = {}) {
    let reservada = false;
    try {
        const reserva = await cliente.query('SELECT fn_reservar_manutencao_contatos() AS reservada');
        reservada = reserva.rows?.[0]?.reservada === true;
        if (!reservada) {
            return { ok: true, executada: false, contatosReabertos: 0, mediaRecompraDias: null };
        }

        const linhas = await executarFirebird(SQL_MEDIA_RECOMPRA, [], {
            operacao: 'sincronizar-media-recompra',
            timeoutMs: 15000,
            limite: 1,
            permitirFallbackCharset: true,
            cacheTtlMs: 300000,
            cacheStaleMs: 3600000
        });
        const mediaRecompraDias = normalizarMediaRecompra(linhas);
        const resultado = await cliente.query(`
            SELECT executada, contatos_reabertos
              FROM fn_executar_manutencao_contatos($1)
        `, [mediaRecompraDias]);
        const linha = resultado.rows?.[0] || {};
        return {
            ok: true,
            executada: linha.executada === true,
            contatosReabertos: Number(linha.contatos_reabertos || 0),
            mediaRecompraDias
        };
    } catch (error) {
        if (reservada) await registrarFalha(cliente, error);
        logger.warn?.('[controle-contato] manutencao diaria indisponivel', {
            code: error?.code || null,
            message: error?.message || String(error)
        });
        return { ok: false, executada: false, contatosReabertos: 0, mediaRecompraDias: null };
    }
}
