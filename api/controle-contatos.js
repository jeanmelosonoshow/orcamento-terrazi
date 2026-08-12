import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import { executarManutencaoControleContato } from '../lib/contact-maintenance.js';

const LIMITE_DOCUMENTOS = 5000;

function normalizarDocumento(valor) {
    return String(valor ?? '').trim().slice(0, 40);
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido.' });
    const session = requireRequestSession(req, res);
    if (!session) return;

    const documentos = Array.from(new Set((Array.isArray(req.body?.documentos) ? req.body.documentos : [])
        .map(normalizarDocumento).filter(Boolean))).slice(0, LIMITE_DOCUMENTOS);
    await executarManutencaoControleContato(db);
    if (!documentos.length) return res.status(200).json({ contatos: [] });
    try {
        const resultado = await db.query(`
            SELECT doctocliente, nome_cliente, status_contato, tipo_contato, observacao,
                   data_primeiro_contato, data_ultimo_contato, data_finalizacao,
                   idfuncionario, idvendedor, qtde_contato, data_ultima_atualizacao
              FROM controle_contato
             WHERE doctocliente = ANY($1::text[])
        `, [documentos]);
        return res.status(200).json({ contatos: resultado.rows });
    } catch (error) {
        console.error('[controle-contatos] falha', { code: error?.code || null, message: error?.message });
        return res.status(500).json({ error: 'Nao foi possivel carregar os contatos.' });
    }
}
