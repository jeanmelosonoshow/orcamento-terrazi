import { db } from '@vercel/postgres';

export default async function handler(req, res) {
  const client = await db.connect();

  try {
    const info = await client.query(`
      SELECT
        current_database() AS database_name,
        current_schema() AS schema_name,
        current_user AS user_name,
        inet_server_addr()::text AS server_addr
    `);

    const maxOrcamento = await client.query('SELECT COALESCE(MAX(id), 0) AS max_id, COUNT(*)::int AS total FROM orcamentos');

    let sequencia = { sequence_name: 'orcamentos_id_seq', last_value: null, is_called: null };
    try {
      const seqResult = await client.query('SELECT last_value, is_called FROM orcamentos_id_seq');
      sequencia = {
        sequence_name: 'orcamentos_id_seq',
        last_value: seqResult.rows[0]?.last_value ?? null,
        is_called: seqResult.rows[0]?.is_called ?? null
      };
    } catch (seqError) {
      sequencia = {
        sequence_name: 'orcamentos_id_seq',
        error: seqError.message
      };
    }

    const ultimos = await client.query(`
      SELECT id, cliente_nome, data_criacao
      FROM orcamentos
      ORDER BY id DESC
      LIMIT 5
    `);

    res.status(200).json({
      ok: true,
      environment: process.env.VERCEL_ENV || 'unknown',
      branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
      database: info.rows[0],
      orcamentos: maxOrcamento.rows[0],
      sequence: sequencia,
      latest: ultimos.rows
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'Erro ao consultar diagnóstico do banco',
      details: error.message
    });
  } finally {
    client.release();
  }
}
