import { db } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const client = await db.connect();
  const orcamento = req.body;
  const apenasDigitos = (valor) => String(valor || '').replace(/\D/g, '');

  try {
    if (!orcamento.cust_name || !orcamento.cust_phone || !orcamento.valid_until) {
      return res.status(400).json({ error: 'Nome do cliente, telefone do cliente e validade são obrigatórios.' });
    }

    await client.query('BEGIN');

    const dadosCabecalho = [
      orcamento.valid_until && orcamento.valid_until !== "" ? orcamento.valid_until : null,
      orcamento.cust_name || 'Consumidor',
      apenasDigitos(orcamento.cust_doc),
      apenasDigitos(orcamento.cust_phone),
      orcamento.seller_name || '',
      apenasDigitos(orcamento.seller_phone),
      orcamento.general_obs || '',
      parseFloat(orcamento.total_value) || 0
    ];

    let orcamentoId = parseInt(orcamento.orcamento_id, 10) || null;

    if (orcamentoId) {
      await client.query(`
        UPDATE orcamentos SET
          data_validade = $1,
          cliente_nome = $2,
          cliente_doc = $3,
          telefone_cliente = $4,
          vendedor_nome = $5,
          vendedor_contato = $6,
          obs_geral = $7,
          valor_total = $8
        WHERE id = $9
      `, [...dadosCabecalho, orcamentoId]);

      await client.query('DELETE FROM vendedor_orcamento WHERE id_orcamento = $1', [orcamentoId]);
    } else {
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
      `, [...dadosCabecalho, 'Pendente']);

      orcamentoId = resultOrcamento.rows[0].id;
    }

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

    // 3. Sincroniza os itens vinculados
    const idsMantidos = [];
    const itensSalvos = [];

    for (const item of orcamento.items || []) {
      const dadosItem = [
        item.sku || 'N/A',
        item.displayName || item.nome_produto || 'Produto sem nome',
        item.variation || item.variacao || '',
        parseInt(item.quantity || item.quantidade) || 1,
        parseFloat(item.price || item.preco_unitario) || 0,
        item.imagem_url || item.image || item.image_url || '',
        item.description || item.descricao_tecnica || ''
      ];

      const itemOrcamentoId = parseInt(item.item_orcamento_id, 10) || null;

      if (orcamentoId && itemOrcamentoId) {
        const atualizado = await client.query(`
          UPDATE itens_orcamento SET
            sku = $1,
            nome_produto = $2,
            variacao = $3,
            quantidade = $4,
            preco_unitario = $5,
            imagem_url = $6,
            descricao_tecnica = $7
          WHERE id = $8 AND orcamento_id = $9
          RETURNING id
        `, [...dadosItem, itemOrcamentoId, orcamentoId]);

        if (atualizado.rows.length > 0) {
          idsMantidos.push(atualizado.rows[0].id);
          itensSalvos.push({ tempId: item.tempId || null, item_orcamento_id: atualizado.rows[0].id });
          continue;
        }
      }

      const inserido = await client.query(`
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
        RETURNING id
      `, [orcamentoId, ...dadosItem]);

      idsMantidos.push(inserido.rows[0].id);
      itensSalvos.push({ tempId: item.tempId || null, item_orcamento_id: inserido.rows[0].id });
    }

    if (parseInt(orcamento.orcamento_id, 10)) {
      if (idsMantidos.length > 0) {
        await client.query('DELETE FROM itens_orcamento WHERE orcamento_id = $1 AND NOT (id = ANY($2::int[]))', [orcamentoId, idsMantidos]);
      } else {
        await client.query('DELETE FROM itens_orcamento WHERE orcamento_id = $1', [orcamentoId]);
      }
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, orcamentoId, items: itensSalvos });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Erro ao salvar no banco:", error);
    res.status(500).json({ error: 'Erro ao salvar orçamento', details: error.message });
  } finally {
    client.release();
  }
}
