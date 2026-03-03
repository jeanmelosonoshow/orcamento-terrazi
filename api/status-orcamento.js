import { db } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Método não permitido' });

  const { id, status } = req.body;
  if (!id || !status) return res.status(400).json({ error: 'ID e Status são obrigatórios' });

  const client = await db.connect();

  try {
    const check = await client.query('SELECT status FROM orcamentos WHERE id = $1', [id]);
    
    if (!check.rows.length) return res.status(404).json({ error: 'Orçamento não encontrado' });
    
    // Trava de segurança: só permite mudar se o status atual for Pendente
    if (check.rows[0].status !== 'Pendente') {
      return res.status(403).json({ error: 'Este orçamento já foi finalizado e não pode ter o status alterado.' });
    }

    await client.query(
      'UPDATE orcamentos SET status = $1 WHERE id = $2',
      [status, id]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar status', details: error.message });
  } finally {
    client.release();
  }
}
