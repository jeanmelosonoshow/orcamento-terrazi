import { db } from '@vercel/postgres';
import { consultarCentroCustoFilial, criarPagarArquiteto, regenerarPagarArquiteto, consultarStatusPagar } from './firebird-finance-gateway-client.js';

const LIMITE_LOTE = 8;

function dataFirebird() {
    const partes = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).formatToParts(new Date()).reduce((resultado, parte) => {
        if (parte.type !== 'literal') resultado[parte.type] = parte.value;
        return resultado;
    }, {});
    return `${partes.year}-${partes.month}-${partes.day} ${partes.hour}:${partes.minute}:${partes.second}`;
}

function dataISO(valor) {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
    const texto = String(valor || '').trim();
    const iso = texto.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const convertido = new Date(texto);
    if (Number.isNaN(convertido.getTime())) throw new Error('Data prevista do pagamento invalida.');
    return convertido.toISOString().slice(0, 10);
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
               AND (firebird_numero_pagar IS NULL OR firebird_status = '4')
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
        await client.query(`
            INSERT INTO fila_sincronizacao_pagamento_arquiteto
                (pagamento_id, lote_pagamento_id, operacao, status_fila)
            VALUES ($1, $2, 'CONSULTAR_BAIXA', 'PENDENTE')
            ON CONFLICT (pagamento_id, operacao) DO UPDATE
                SET status_fila = 'PENDENTE', proxima_tentativa_em = CURRENT_TIMESTAMP,
                    bloqueado_ate = NULL, erro_ultima_tentativa = NULL, data_conclusao = NULL
        `, [pagamento.id, pagamento.lote_pagamento_id]);
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

async function atualizarBaixa(item, status) {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        if (status === '1') {
            await client.query(`
                UPDATE pagamento_orcamento_arquiteto
                   SET status_pagamento = 'PAGAMENTO_EFETUADO',
                       data_pagamento_efetuado = CURRENT_TIMESTAMP,
                       firebird_status = '1',
                       data_ultima_atualizacao = CURRENT_TIMESTAMP
                 WHERE id = $1 AND status_pagamento = 'PAGAMENTO_GERADO'
            `, [item.pagamento_id]);
        } else if (status === '4') {
            await client.query(`
                UPDATE pagamento_orcamento_arquiteto
                   SET status_pagamento = 'AUTORIZADO',
                       firebird_numero_pagar = firebird_numero_pagar,
                       firebird_ordem = NULL,
                       firebird_idcentrocusto = NULL,
                       firebird_status = '4',
                       data_geracao = NULL,
                       data_ultima_atualizacao = CURRENT_TIMESTAMP
                 WHERE id = $1 AND status_pagamento = 'PAGAMENTO_GERADO'
            `, [item.pagamento_id]);
            await client.query(`
                INSERT INTO fila_sincronizacao_pagamento_arquiteto
                    (pagamento_id, lote_pagamento_id, operacao, status_fila)
                SELECT id, lote_pagamento_id, 'CRIAR_PAGAR', 'PENDENTE'
                  FROM pagamento_orcamento_arquiteto
                 WHERE id = $1
                ON CONFLICT (pagamento_id, operacao) DO UPDATE
                    SET status_fila = 'PENDENTE', proxima_tentativa_em = CURRENT_TIMESTAMP,
                        bloqueado_ate = NULL, erro_ultima_tentativa = NULL, data_conclusao = NULL
            `, [item.pagamento_id]);
        }
        await client.query(`
            UPDATE fila_sincronizacao_pagamento_arquiteto
               SET status_fila = 'CONCLUIDO', bloqueado_ate = NULL,
                   erro_ultima_tentativa = NULL, data_conclusao = CURRENT_TIMESTAMP
             WHERE id = $1 AND status_fila = 'PROCESSANDO'
        `, [item.id]);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function processarBaixas() {
    const resultado = await db.query(`
        WITH candidatos AS (
            SELECT f.id
              FROM fila_sincronizacao_pagamento_arquiteto f
              JOIN pagamento_orcamento_arquiteto p ON p.id = f.pagamento_id
             WHERE f.operacao = 'CONSULTAR_BAIXA'
               AND f.status_fila IN ('PENDENTE', 'ERRO')
               AND f.proxima_tentativa_em <= CURRENT_TIMESTAMP
               AND p.status_pagamento = 'PAGAMENTO_GERADO'
             ORDER BY f.id
             FOR UPDATE SKIP LOCKED
             LIMIT $1
        )
        UPDATE fila_sincronizacao_pagamento_arquiteto f
           SET status_fila = 'PROCESSANDO',
               tentativas = tentativas + 1,
               bloqueado_ate = CURRENT_TIMESTAMP + INTERVAL '3 minutes'
          FROM candidatos c
         WHERE f.id = c.id
        RETURNING f.*, (SELECT p.firebird_numero_pagar FROM pagamento_orcamento_arquiteto p WHERE p.id = f.pagamento_id) AS firebird_numero_pagar
    `, [LIMITE_LOTE]);
    let concluidas = 0;
    for (const item of resultado.rows) {
        try {
            const status = await consultarStatusPagar(item.firebird_numero_pagar);
            if (status === '1' || status === '4') {
                await atualizarBaixa(item, status);
                concluidas += 1;
            }
        } catch (error) {
            await falhar(item, error);
        }
    }
    return concluidas;
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
            const dadosTitulo = {
                numeroDuplicata,
                dataInsercao: dataFirebird(),
                fornecedorId: Number(pagamento.firebird_idfornecedor),
                valorComissao: Number(pagamento.valor_comissao),
                dataVencimento: dataISO(pagamento.data_prevista_pagamento),
                numeroSaida: Number(pagamento.numero_saida),
                centroCustoId: Number(centroCusto),
                idfuncionario: Number(pagamento.idfuncionario_geracao),
                observacao: `RESERVA TÉCNICA (COMISSÃO) DA VENDA FILIAL: ${pagamento.idfilial_saida} NUMERO SAIDA: ${pagamento.numero_saida}. VALOR DA VENDA: ${pagamento.valor_venda}`
            };
            const titulo = pagamento.firebird_status === '4'
                ? await regenerarPagarArquiteto(dadosTitulo)
                : await criarPagarArquiteto(dadosTitulo);
            if (!Number.isSafeInteger(titulo.id) || titulo.id <= 0) throw new Error('Gateway não retornou a ordem do PAGAR.');
            if (await concluir(item, pagamento, Number(centroCusto), { numeroDuplicata, ordem: titulo.id })) resultado.gerados += 1;
        } catch (error) {
            resultado.erros += 1;
            await falhar(item, error);
        }
    }));
    resultado.baixas = await processarBaixas();
    return resultado;
}
