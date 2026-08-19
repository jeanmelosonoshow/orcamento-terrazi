import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import { expirarOrcamentos, verificarAcessoOrcamento } from '../lib/budget-negotiation.js';
import { obterVinculoArquitetoOrcamento } from '../lib/architects.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  const session = requireRequestSession(req, res);
  if (!session) return;
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID é obrigatório' });

  const client = await db.connect();

  try {
    await expirarOrcamentos(client);
    if (!await verificarAcessoOrcamento(client, id, session)) {
      return res.status(403).json({ error: 'Você não possui acesso a este orçamento.' });
    }
    const orcamento = await client.query('SELECT * FROM orcamentos WHERE id = $1', [id]);
    
    if (orcamento.rows.length === 0) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }

    const itens = await client.query('SELECT * FROM itens_orcamento WHERE orcamento_id = $1', [id]);
    const arquiteto = await obterVinculoArquitetoOrcamento(client, id);

    res.status(200).json({
      ...orcamento.rows[0],
      items: itens.rows,
      arquiteto
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar detalhes', details: error.message });
  } finally {
    client.release();
  }
}
