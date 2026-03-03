import { db } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const client = await db.connect();
  const orcamento = req.body;

  try {
    // Inicia uma transação para garantir a integridade dos dados
    await client.query('BEGIN');

    // 1. Insere o cabeçalho
    // A data_criacao será preenchida automaticamente pelo banco (DEFAULT)
    const resultOrcamento = await client.query(`
      INSERT INTO orcamentos (
        data_validade, 
        cliente_nome, 
        cliente_doc, 
        vendedor_nome, 
        vendedor_contato, 
        obs_geral, 
        valor_total, 
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      orcamento.valid_until && orcamento.valid_until !== "" ? orcamento.valid_until : null, // Evita erro de string vazia em campo DATE
      orcamento.cust_name || 'Consumidor', 
      orcamento.cust_doc || '',
      orcamento.seller_name || '', 
      orcamento.seller_phone || '', 
      orcamento.general_obs || '',
      parseFloat(orcamento.total_value) || 0, // Garante que seja gravado como número
      'Pendente'
    ]);

    const orcamentoId = resultOrcamento.rows[0].id;

    // 2. Insere os itens vinculados ao ID do orçamento acima
    for (const item of orcamento.items) {
      await client.query(`
        INSERT INTO itens_orcamento (
          orcamento_id, 
          sku, 
          nome_produto, 
          variacao, 
          quantidade, 
          preco_unitario, 
          imagem_url, 
          descricao_tecnica
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        orcamentoId, 
        item.sku || 'N/A', 
        item.displayName || 'Produto sem nome', 
        item.variation || '',
        parseInt(item.quantity) || 1, 
        parseFloat(item.price) || 0, 
        item.image || '', 
        item.description || ''
      ]);
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, orcamentoId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Erro ao salvar no banco:", error);
    res.status(500).json({ error: 'Erro ao salvar orçamento', details: error.message });
  } finally {
    client.release();
  }
}
