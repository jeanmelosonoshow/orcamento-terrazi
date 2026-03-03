import { db } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Método não permitido' });

  const { id, status } = req.body;
  const client = await db.connect();

  try {
    // Verifica o status atual antes de permitir a mudança
    const check = await client.query('SELECT status FROM orcamentos WHERE id = $1', [id]);
    
    if (!check.rows.length) return res.status(404).json({ error: 'Orçamento não encontrado' });
    
    if (check.rows[0].status !== 'Pendente') {
      return res.status(403).json({ error: 'Este status já está finalizado e não pode ser alterado.' });
    }

    // Executa a atualização
    await client.query(
      'UPDATE orcamentos SET status = $1 WHERE id = $2',
      [status, id]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  } finally {
    client.release();
  }
}
