import { db } from '@vercel/postgres';
import crypto from 'node:crypto';
import { garantirFornecedorArquiteto } from '../lib/firebird-finance-gateway-client.js';

const LIMITE_LOTE = 8;

export const config = { maxDuration: 60 };

function autorizado(req) {
    const esperado = String(process.env.CRON_SECRET || '');
    const recebido = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!esperado || esperado.length !== recebido.length) return false;
    return crypto.timingSafeEqual(Buffer.from(esperado, 'utf8'), Buffer.from(recebido, 'utf8'));
}

async function reservarFila() {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const resultado = await client.query(`
            WITH candidatos AS (
                SELECT id
                  FROM fila_sincronizacao_fornecedor_arquiteto
                 WHERE (
                        status_fila IN ('PENDENTE', 'ERRO')
                        OR (status_fila = 'PROCESSANDO' AND bloqueado_ate < CURRENT_TIMESTAMP)
                       )
                   AND proxima_tentativa_em <= CURRENT_TIMESTAMP
                   AND tentativas < 10
                 ORDER BY id
                 FOR UPDATE SKIP LOCKED
                 LIMIT $1
            )
            UPDATE fila_sincronizacao_fornecedor_arquiteto f
               SET status_fila = 'PROCESSANDO',
                   tentativas = tentativas + 1,
                   bloqueado_ate = CURRENT_TIMESTAMP + INTERVAL '3 minutes',
                   data_ultima_atualizacao = CURRENT_TIMESTAMP
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

async function concluir(item, fornecedor) {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const filaAtualizada = await client.query(`
            UPDATE fila_sincronizacao_fornecedor_arquiteto
               SET status_fila = 'CONCLUIDO',
                   firebird_idfornecedor = $2,
                   fornecedor_criado = $3,
                   bloqueado_ate = NULL,
                   erro_ultima_tentativa = NULL,
                   data_conclusao = CURRENT_TIMESTAMP,
                   data_ultima_atualizacao = CURRENT_TIMESTAMP
             WHERE id = $1
               AND cpf_fornecedor = $4
               AND status_fila = 'PROCESSANDO'
            RETURNING id
        `, [item.id, fornecedor.idFornecedor, fornecedor.criado, item.cpf_fornecedor]);
        if (!filaAtualizada.rows.length) {
            await client.query('COMMIT');
            return false;
        }
        await client.query(`
            UPDATE arquiteto
               SET firebird_idfornecedor = $2,
                   fornecedor_sync_status = 'SINCRONIZADO',
                   fornecedor_sync_erro = NULL,
                   fornecedor_sync_atualizado_em = CURRENT_TIMESTAMP
             WHERE id = $1 AND cpf = $3
        `, [item.arquiteto_id, fornecedor.idFornecedor, item.cpf_fornecedor]);
        await client.query(`
            UPDATE pagamento_orcamento_arquiteto
               SET firebird_idfornecedor = $2,
                   versao = versao + 1,
                   data_ultima_atualizacao = CURRENT_TIMESTAMP
             WHERE arquiteto_id = $1
               AND cpf_arquiteto = $3
               AND status_pagamento = 'AUTORIZADO'
               AND firebird_idfornecedor IS NULL
        `, [item.arquiteto_id, fornecedor.idFornecedor, item.cpf_fornecedor]);
        await client.query(`
            INSERT INTO fila_sincronizacao_pagamento_arquiteto (
                pagamento_id, lote_pagamento_id, operacao, status_fila
            )
            SELECT p.id, p.lote_pagamento_id, 'CRIAR_PAGAR', 'PENDENTE'
              FROM pagamento_orcamento_arquiteto p
             WHERE p.arquiteto_id = $1
               AND p.cpf_arquiteto = $2
               AND p.status_pagamento = 'AUTORIZADO'
               AND p.lote_pagamento_id IS NOT NULL
               AND p.firebird_idfornecedor IS NOT NULL
            ON CONFLICT (pagamento_id, operacao) DO NOTHING
        `, [item.arquiteto_id, item.cpf_fornecedor]);
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
    const esperaSegundos = Math.min(21600, 60 * (2 ** Math.min(8, Math.max(0, tentativas - 1))));
    const mensagem = String(error?.message || 'Falha desconhecida').slice(0, 1000);
    await db.query(`
        UPDATE fila_sincronizacao_fornecedor_arquiteto
           SET status_fila = 'ERRO',
               bloqueado_ate = NULL,
               erro_ultima_tentativa = $2,
               proxima_tentativa_em = CURRENT_TIMESTAMP + make_interval(secs => $3),
               data_ultima_atualizacao = CURRENT_TIMESTAMP
         WHERE id = $1
           AND cpf_fornecedor = $4
           AND status_fila = 'PROCESSANDO'
    `, [item.id, mensagem, esperaSegundos, item.cpf_fornecedor]);
    await db.query(`
        UPDATE arquiteto
           SET fornecedor_sync_status = 'ERRO',
               fornecedor_sync_erro = $2,
               fornecedor_sync_atualizado_em = CURRENT_TIMESTAMP
         WHERE id = $1
           AND cpf = $3
    `, [item.arquiteto_id, mensagem, item.cpf_fornecedor]);
}

export default async function handler(req, res) {
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Metodo nao permitido.' });
    if (!autorizado(req)) return res.status(401).json({ error: 'Nao autorizado.' });
    try {
        const itens = await reservarFila();
        const resultado = { reservados: itens.length, sincronizados: 0, existentes: 0, criados: 0, erros: 0 };
        await Promise.all(itens.map(async item => {
            try {
                const fornecedor = await garantirFornecedorArquiteto({
                    nome: item.nome_fornecedor,
                    telefone: item.telefone_fornecedor || '',
                    cpf: item.cpf_fornecedor
                });
                const aplicado = await concluir(item, fornecedor);
                if (aplicado) {
                    resultado.sincronizados += 1;
                    if (fornecedor.criado) resultado.criados += 1;
                    else resultado.existentes += 1;
                }
            } catch (error) {
                resultado.erros += 1;
                await falhar(item, error);
                console.error('[sync-fornecedor-arquiteto] falha', {
                    filaId: Number(item.id),
                    code: error?.code || null,
                    message: error?.message
                });
            }
        }));
        return res.status(200).json({ ok: true, ...resultado });
    } catch (error) {
        const estruturaAusente = error?.code === '42P01' || error?.code === '42703';
        console.error('[sync-fornecedor-arquiteto] falha geral', { code: error?.code || null, message: error?.message });
        return res.status(estruturaAusente ? 503 : 500).json({
            error: estruturaAusente
                ? 'Estrutura de sincronizacao de fornecedores ainda nao instalada.'
                : 'Nao foi possivel sincronizar os fornecedores.'
        });
    }
}
