import { db } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const client = await db.connect();
  const orcamento = req.body;

  try {
    // Inicia uma transação (garante que ou grava tudo ou não grava nada)
    await client.query('BEGIN');

    // 1. Insere o cabeçalho
    const resultOrcamento = await client.query(`
      INSERT INTO orcamentos (
        data_validade, cliente_nome, cliente_doc, vendedor_nome, 
        vendedor_contato, obs_geral, valor_total, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      orcamento.valid_until || null, orcamento.cust_name, orcamento.cust_doc,
      orcamento.seller_name, orcamento.seller_phone, orcamento.general_obs,
      orcamento.total_value, 'Pendente'
    ]);

    const orcamentoId = resultOrcamento.rows[0].id;

    // 2. Insere os itens vinculados ao ID do orçamento acima
    for (const item of orcamento.items) {
      await client.query(`
        INSERT INTO itens_orcamento (
          orcamento_id, sku, nome_produto, variacao, 
          quantidade, preco_unitario, imagem_url, descricao_tecnica
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        orcamentoId, item.sku, item.displayName, item.variation,
        item.quantity, item.price, item.image, item.description
      ]);
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, orcamentoId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar orçamento' });
  } finally {
    client.release();
  }
}
