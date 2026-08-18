import { db } from '@vercel/postgres';
import { expirarOrcamentos } from '../lib/budget-negotiation.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo nao permitido.' });
    const esperado = String(process.env.CRON_SECRET || '');
    const recebido = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!esperado || recebido !== esperado) return res.status(401).json({ error: 'Nao autorizado.' });
    try {
        const atualizados = await expirarOrcamentos(db);
        return res.status(200).json({ ok: true, orcamentosExpirados: atualizados });
    } catch (error) {
        console.error('[manutencao-orcamentos] falha', { code: error?.code || null, message: error?.message });
        return res.status(500).json({ error: 'Falha na manutencao dos orcamentos.' });
    }
}
