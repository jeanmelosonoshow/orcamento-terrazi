import { db } from '@vercel/postgres';

export default async function handler(req, res) {
  const { id } = req.query;
  const client = await db.connect();

  try {
    const orcamento = await client.query('SELECT * FROM orcamentos WHERE id = $1', [id]);
    const itens = await client.query('SELECT * FROM itens_orcamento WHERE orcamento_id = $1', [id]);

    res.status(200).json({
      ...orcamento.rows[0],
      items: itens.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar detalhes' });
  } finally {
    client.release();
  }
}
