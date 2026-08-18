import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import { definirContextoAuditoria, normalizarStatus, verificarAcessoOrcamento } from '../lib/budget-negotiation.js';

const STATUS_PERMITIDOS = new Set(['GEROU VENDA']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Método não permitido' });
  const session = requireRequestSession(req, res);
  if (!session) return;

  const id = Number.parseInt(req.body?.id, 10) || null;
  const status = normalizarStatus(req.body?.status);
  if (!id || !status) return res.status(400).json({ error: 'ID e Status são obrigatórios' });
  if (!STATUS_PERMITIDOS.has(status)) return res.status(400).json({ error: 'Status inválido.' });

  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await definirContextoAuditoria(client, session, 'HISTORICO ORCAMENTO');
    if (!await verificarAcessoOrcamento(client, id, session)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Você não possui acesso a este orçamento.' });
    }
    const check = await client.query('SELECT status FROM orcamentos WHERE id = $1', [id]);
    
    if (!check.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }
    
    // Trava de segurança: só permite mudar se o status atual for Pendente
    if (check.rows[0].status !== 'PENDENTE') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Este orçamento já foi finalizado e não pode ter o status alterado.' });
    }

    await client.query(
      'UPDATE orcamentos SET status = $1 WHERE id = $2',
      [status, id]
    );
    await client.query('COMMIT');

    res.status(200).json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar status', details: error.message });
  } finally {
    client.release();
  }
}
