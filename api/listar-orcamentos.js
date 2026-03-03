import { db } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  const client = await db.connect();

  try {
    // A mágica acontece no CASE WHEN abaixo
    const { rows } = await client.query(`
      SELECT 
        id,
        data_criacao,
        data_validade,
        cliente_nome,
        cliente_doc,
        vendedor_nome,
        vendedor_contato,
        obs_geral,
        valor_total,
        CASE 
          WHEN status = 'Pendente' AND data_validade < CURRENT_DATE THEN 'Expirado'
          ELSE status 
        END as status
      FROM orcamentos 
      ORDER BY id DESC
    `);

    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar orçamentos' });
  } finally {
    client.release();
  }
}
