import { db } from '@vercel/postgres';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID é obrigatório' });

  const client = await db.connect();

  try {
    const orcamento = await client.query('SELECT * FROM orcamentos WHERE id = $1', [id]);
    
    if (orcamento.rows.length === 0) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }

    const itens = await client.query('SELECT * FROM itens_orcamento WHERE orcamento_id = $1', [id]);

    res.status(200).json({
      ...orcamento.rows[0],
      items: itens.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar detalhes', details: error.message });
  } finally {
    client.release();
  }
}
