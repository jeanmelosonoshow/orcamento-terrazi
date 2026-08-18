import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import {
    STATUS_CONTATO_ORCAMENTO,
    TIPOS_CONTATO_ORCAMENTO,
    normalizarContatoOrcamento,
    normalizarStatus,
    numeroSessao,
    textoLimitado,
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
    const statusContato = normalizarStatus(req.body?.statusContato);
    const tipoContato = normalizarStatus(req.body?.tipoContato);
    const observacao = textoLimitado(req.body?.observacao, 10000);
    if (!orcamentoId) return res.status(400).json({ error: 'Orcamento nao informado.' });
    if (!STATUS_CONTATO_ORCAMENTO.has(statusContato)) return res.status(400).json({ error: 'Status de contato invalido.' });
    if (!TIPOS_CONTATO_ORCAMENTO.has(tipoContato)) return res.status(400).json({ error: 'Tipo de contato invalido.' });

    const client = await db.connect();
    try {
        if (!await verificarAcessoOrcamento(client, orcamentoId, session)) {
            return res.status(403).json({ error: 'Voce nao possui acesso a este orcamento.' });
        }
        const resultado = await client.query(`
            INSERT INTO controle_contato_orcamento (
                orcamento_id, status_contato, tipo_contato, observacao,
                idfuncionario, idvendedor, qtde_contato
            ) VALUES ($1, $2, $3, $4, $5, $6, 1)
            ON CONFLICT (orcamento_id) DO UPDATE SET
                status_contato = EXCLUDED.status_contato,
                tipo_contato = EXCLUDED.tipo_contato,
                observacao = EXCLUDED.observacao,
                idfuncionario = EXCLUDED.idfuncionario,
                idvendedor = EXCLUDED.idvendedor,
                qtde_contato = controle_contato_orcamento.qtde_contato + 1
            RETURNING *
        `, [
            orcamentoId, statusContato, tipoContato, observacao || null,
            numeroSessao(session.sub), numeroSessao(session.idvendedor)
        ]);
        return res.status(200).json({ contato: normalizarContatoOrcamento(resultado.rows[0]) });
    } catch (error) {
        if (String(error?.message || '').includes('finalizado nao pode ser alterado')) {
            return res.status(409).json({ error: 'Este contato foi finalizado e nao pode mais ser alterado.' });
        }
        console.error('[controle-contato-orcamento] falha', { code: error?.code || null, message: error?.message });
        return res.status(500).json({ error: 'Nao foi possivel salvar o contato do orcamento.' });
    } finally {
        client.release();
    }
}
