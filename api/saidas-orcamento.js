import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import {
    definirContextoAuditoria,
    normalizarSaidaOrcamento,
    normalizarSaidasOrcamento,
    numeroSessao,
    verificarAcessoOrcamento
} from '../lib/budget-negotiation.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido.' });
    const session = requireRequestSession(req, res);
    if (!session) return;

    const orcamentoId = Number.parseInt(req.body?.orcamentoId, 10) || null;
    const saidas = normalizarSaidasOrcamento(req.body?.saidas);
    if (!orcamentoId) return res.status(400).json({ error: 'Orcamento nao informado.' });
    if (!saidas) return res.status(400).json({ error: 'Informe ao menos uma saida valida, sem pedidos duplicados.' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await definirContextoAuditoria(client, session, 'PEDIDO DA VENDA');
        if (!await verificarAcessoOrcamento(client, orcamentoId, session)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Voce nao possui acesso a este orcamento.' });
        }
        const negociacao = await client.query(`
            SELECT id
              FROM status_negociacao
             WHERE orcamento_id = $1
               AND status_negociacao = 'GEROU VENDA'
               AND vigente
             FOR UPDATE
        `, [orcamentoId]);
        if (!negociacao.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Registre primeiro a etapa Gerou venda.' });
        }
        await client.query(`
            INSERT INTO orcamento_saida (
                orcamento_id, status_negociacao_id, idfilialsaida, numerosaida,
                idfuncionario, idvendedor
            )
            SELECT $1, $2, item.idfilialsaida, item.numerosaida, $5, $6
              FROM UNNEST($3::text[], $4::integer[]) AS item(idfilialsaida, numerosaida)
        `, [
            orcamentoId,
            negociacao.rows[0].id,
            saidas.map(item => item.idfilialsaida),
            saidas.map(item => item.numerosaida),
            numeroSessao(session.sub),
            numeroSessao(session.idvendedor)
        ]);
        const resultado = await client.query(`
            SELECT * FROM orcamento_saida
             WHERE orcamento_id = $1
             ORDER BY data_vinculo, id
        `, [orcamentoId]);
        await client.query('COMMIT');
        return res.status(200).json({ saidas: resultado.rows.map(normalizarSaidaOrcamento) });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error?.code === '23505') {
            return res.status(409).json({ error: 'Esta saida ja esta vinculada ao orcamento.' });
        }
        console.error('[saidas-orcamento] falha', { code: error?.code || null, message: error?.message });
        return res.status(500).json({ error: 'Nao foi possivel vincular a saida ao orcamento.' });
    } finally {
        client.release();
    }
}
