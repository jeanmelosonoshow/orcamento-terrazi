import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import { normalizarBuscaCliente, normalizarDocumentoCliente, normalizarEmailCliente, normalizarTelefoneCliente } from '../lib/customer-identifiers.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
    if (!requireRequestSession(req, res)) return;

    const identificadores = normalizarBuscaCliente(req.body || {});
    if (!identificadores.cpf && !identificadores.telefone && !identificadores.email) {
        return res.status(200).json({ encontrado: false });
    }

    const ignorarId = Number.parseInt(req.body?.ignorar_orcamento_id, 10) || null;
    const client = await db.connect();
    try {
        const resultado = await client.query(`
            WITH candidatos AS (
                SELECT
                    O.ID, O.CLIENTE_NOME, O.CLIENTE_DOC, O.TELEFONE_CLIENTE, O.EMAIL_CLIENTE, O.DATA_CRIACAO,
                    (CASE WHEN $1 <> '' AND REGEXP_REPLACE(COALESCE(O.CLIENTE_DOC, ''), '[^0-9]', '', 'g') = $1 THEN 1 ELSE 0 END
                     + CASE WHEN $2 <> '' AND REGEXP_REPLACE(COALESCE(O.TELEFONE_CLIENTE, ''), '[^0-9]', '', 'g') = $2 THEN 1 ELSE 0 END
                     + CASE WHEN $3 <> '' AND LOWER(BTRIM(COALESCE(O.EMAIL_CLIENTE, ''))) = $3 THEN 1 ELSE 0 END) AS PONTUACAO
                FROM ORCAMENTOS O
                WHERE ($4::BIGINT IS NULL OR O.ID <> $4)
                  AND (
                      ($1 <> '' AND REGEXP_REPLACE(COALESCE(O.CLIENTE_DOC, ''), '[^0-9]', '', 'g') = $1)
                      OR ($2 <> '' AND REGEXP_REPLACE(COALESCE(O.TELEFONE_CLIENTE, ''), '[^0-9]', '', 'g') = $2)
                      OR ($3 <> '' AND LOWER(BTRIM(COALESCE(O.EMAIL_CLIENTE, ''))) = $3)
                  )
            )
            SELECT * FROM candidatos
            ORDER BY DATA_CRIACAO DESC NULLS LAST, ID DESC, PONTUACAO DESC
            LIMIT 1
        `, [identificadores.cpf, identificadores.telefone, identificadores.email, ignorarId]);

        if (!resultado.rows.length) return res.status(200).json({ encontrado: false });
        const row = resultado.rows[0];
        return res.status(200).json({
            encontrado: true,
            cliente: {
                nome: String(row.cliente_nome || '').trim(),
                cpf: normalizarDocumentoCliente(row.cliente_doc),
                telefone: normalizarTelefoneCliente(row.telefone_cliente),
                email: normalizarEmailCliente(row.email_cliente)
            }
        });
    } catch (error) {
        console.error('Erro ao localizar cliente:', error);
        return res.status(500).json({ error: 'Erro ao verificar o cadastro do cliente.' });
    } finally {
        client.release();
    }
}
