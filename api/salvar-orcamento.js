import { db } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const client = await db.connect();
  const orcamento = req.body;

  try {
    if (!orcamento.cust_name || !orcamento.cust_phone || !orcamento.valid_until) {
      return res.status(400).json({ error: 'Nome do cliente, telefone do cliente e validade são obrigatórios.' });
    }

    await client.query('BEGIN');

    // 1. Insere o cabeçalho do orçamento
    const resultOrcamento = await client.query(`
      INSERT INTO orcamentos (
        data_validade, 
        cliente_nome, 
        cliente_doc, 
        telefone_cliente,
        vendedor_nome, 
        vendedor_contato, 
        obs_geral, 
        valor_total, 
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      orcamento.valid_until && orcamento.valid_until !== "" ? orcamento.valid_until : null,
      orcamento.cust_name || 'Consumidor', 
      orcamento.cust_doc || '',
      orcamento.cust_phone || '',
      orcamento.seller_name || '', 
      orcamento.seller_phone || '', 
      orcamento.general_obs || '',
      parseFloat(orcamento.total_value) || 0,
      'Pendente'
    ]);

    const orcamentoId = resultOrcamento.rows[0].id;

    // 2. Vínculo na tabela VENDEDOR_ORCAMENTO
    const v = orcamento.dados_vendedor; 
    if (v) {
      await client.query(`
        INSERT INTO VENDEDOR_ORCAMENTO (
          id_orcamento, 
          id_funcionario, 
          nome_funcionario, 
          categoria, 
          id_filial
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        orcamentoId,
        v.idfuncionario,
        v.nome_funcionario,
        v.categoria,
        v.idfilial
      ]);
    }

    // 3. Insere os itens vinculados
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
