import { db } from '@vercel/postgres';
import { consultarCentroCustoFilial, criarPagarArquiteto } from './firebird-finance-gateway-client.js';

const LIMITE_LOTE = 8;

function dataFirebird() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function reservarFila() {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const resultado = await client.query(`
            WITH candidatos AS (
                SELECT id
                  FROM fila_sincronizacao_pagamento_arquiteto
                 WHERE status_fila IN ('PENDENTE', 'ERRO')
                   AND proxima_tentativa_em <= CURRENT_TIMESTAMP
                   AND tentativas < 10
                 ORDER BY id
                 FOR UPDATE SKIP LOCKED
                 LIMIT $1
            )
            UPDATE fila_sincronizacao_pagamento_arquiteto f
               SET status_fila = 'PROCESSANDO',
                   tentativas = tentativas + 1,
                   bloqueado_ate = CURRENT_TIMESTAMP + INTERVAL '3 minutes'
              FROM candidatos c
             WHERE f.id = c.id
            RETURNING f.*
        `, [LIMITE_LOTE]);
        await client.query('COMMIT');
        return resultado.rows;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function dadosPagamento(item) {
    const resultado = await db.query(`
        SELECT p.*
          FROM pagamento_orcamento_arquiteto p
         WHERE p.id = $1
           AND p.status_pagamento = 'AUTORIZADO'
           AND p.lote_pagamento_id IS NOT NULL
         LIMIT 1
    `, [item.pagamento_id]);
    return resultado.rows[0] || null;
}

async function concluir(item, pagamento, centroCusto, titulo) {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const atualizado = await client.query(`
            UPDATE pagamento_orcamento_arquiteto
               SET status_pagamento = 'PAGAMENTO_GERADO',
                   firebird_numero_pagar = $2,
                   firebird_ordem = $3,
                   firebird_idcentrocusto = $4,
                   firebird_status = '0',
                   data_geracao = CURRENT_TIMESTAMP,
                   data_ultima_atualizacao = CURRENT_TIMESTAMP
             WHERE id = $1
               AND status_pagamento = 'AUTORIZADO'
               AND firebird_numero_pagar IS NULL
            RETURNING id
        `, [pagamento.id, titulo.numeroDuplicata, titulo.ordem, centroCusto]);
        if (!atualizado.rows.length) {
            await client.query('ROLLBACK');
            return false;
        }
        await client.query(`
            UPDATE fila_sincronizacao_pagamento_arquiteto
               SET status_fila = 'CONCLUIDO',
                   bloqueado_ate = NULL,
                   erro_ultima_tentativa = NULL,
                   data_conclusao = CURRENT_TIMESTAMP
             WHERE id = $1 AND status_fila = 'PROCESSANDO'
        `, [item.id]);
        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function falhar(item, error) {
    const tentativas = Number(item.tentativas || 1);
    const espera = Math.min(21600, 60 * (2 ** Math.min(8, Math.max(0, tentativas - 1))));
    await db.query(`
        UPDATE fila_sincronizacao_pagamento_arquiteto
           SET status_fila = 'ERRO',
               bloqueado_ate = NULL,
               erro_ultima_tentativa = $2,
               proxima_tentativa_em = CURRENT_TIMESTAMP + make_interval(secs => $3)
         WHERE id = $1 AND status_fila = 'PROCESSANDO'
    `, [item.id, String(error?.message || 'Falha ao gerar PAGAR.').slice(0, 1000), espera]);
}

export async function sincronizarPagamentosArquiteto() {
    const itens = await reservarFila();
    const resultado = { reservados: itens.length, gerados: 0, erros: 0 };
    await Promise.all(itens.map(async item => {
        try {
            const pagamento = await dadosPagamento(item);
            if (!pagamento) {
                await falhar(item, new Error('Pagamento não está autorizado ou não possui lote.'));
                resultado.erros += 1;
                return;
            }
            const centroCusto = await consultarCentroCustoFilial(pagamento.idfilial_saida);
            const numeroDuplicata = `S${String(pagamento.idfilial_saida).trim().toUpperCase()}${pagamento.numero_saida}`;
            const titulo = await criarPagarArquiteto({
                idfilial: 'CD',
                numeroDuplicata,
                dataInsercao: dataFirebird(),
                fornecedorId: Number(pagamento.firebird_idfornecedor),
                valorComissao: Number(pagamento.valor_comissao),
                dataVencimento: String(pagamento.data_prevista_pagamento).slice(0, 10),
                numeroSaida: Number(pagamento.numero_saida),
                valorVenda: Number(pagamento.valor_venda),
                centroCustoId: Number(centroCusto),
                idfuncionario: Number(pagamento.idfuncionario_geracao),
                observacao: `RESERVA TÉCNICA (COMISSÃO) DA VENDA FILIAL: ${pagamento.idfilial_saida} NUMERO SAIDA: ${pagamento.numero_saida}. VALOR DA VENDA: ${pagamento.valor_venda}`
            });
            if (!Number.isSafeInteger(titulo.id) || titulo.id <= 0) throw new Error('Gateway não retornou a ordem do PAGAR.');
            if (await concluir(item, pagamento, Number(centroCusto), { numeroDuplicata, ordem: titulo.id })) resultado.gerados += 1;
        } catch (error) {
            resultado.erros += 1;
            await falhar(item, error);
        }
    }));
    return resultado;
}
