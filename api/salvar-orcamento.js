import { db } from '@vercel/postgres';
import { emailClienteValido, normalizarEmailCliente } from '../lib/customer-identifiers.js';
import { requireRequestSession } from '../lib/session-token.js';
import { definirContextoAuditoria } from '../lib/budget-negotiation.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const session = requireRequestSession(req, res);
  if (!session) return;

  const client = await db.connect();
  const orcamento = req.body;
  const apenasDigitos = (valor) => String(valor || '').replace(/\D/g, '');
  const CUSTOM_PRODUCT_SKU = 'PERS';
  const CUSTOM_PRODUCT_LEGACY_SKU = 'PERSONALIZADO';
  const CUSTOM_PRODUCT_IMAGE_URL = 'https://lh3.googleusercontent.com/pw/AP1GczNXEpE7d00qdZ8UbOSIrUFqUQRfZ2XoRMzOUDZ2_4vq52AC7m_73Z0RP64I-qfSKiPYthP4LBEA3L1eMDXSNASJ5I__WQyafHOS2hapKhAG4HkgUJ5LouyEI8Dz0ZUA2ZyGWonprLsUXbrroUGxdEzm=w911-h911-s-no-gm?authuser=0';
  const CUSTOM_PRODUCT_IMAGE_KEY = 'PERS_IMG';
  const CUSTOM_PRODUCT_LEGACY_IMAGE_KEY = 'CUSTOM_PRODUCT_IMAGE';
  const limitarTexto = (valor, limite) => String(valor || '').trim().slice(0, limite);
  const ehItemPersonalizado = (item) => {
    const sku = String(item?.sku || '').toUpperCase();
    const nome = String(item?.displayName || item?.nome_produto || '').trim().toUpperCase();
    return Boolean(item?.isCustomProduct) || [CUSTOM_PRODUCT_SKU, CUSTOM_PRODUCT_LEGACY_SKU].includes(sku) || nome === 'PRODUTO PERSONALIZADO';
  };
  const normalizarImagemItem = (item) => {
    const imagem = item?.imagem_url || item?.image || item?.image_url || '';
    if ([CUSTOM_PRODUCT_IMAGE_KEY, CUSTOM_PRODUCT_LEGACY_IMAGE_KEY].includes(imagem)) return CUSTOM_PRODUCT_IMAGE_URL;
    return imagem;
  };
  const normalizarItem = (item) => ({
    sku: ehItemPersonalizado(item) ? CUSTOM_PRODUCT_SKU : limitarTexto(item.sku || 'N/A', 50),
    nome_produto: limitarTexto(item.displayName || item.nome_produto || 'Produto sem nome', 255),
    variacao: limitarTexto(item.variation || item.variacao || '', 255),
    quantidade: parseInt(item.quantity || item.quantidade, 10) || 1,
    preco_unitario: parseFloat(item.price || item.preco_unitario) || 0,
    imagem_url: limitarTexto(normalizarImagemItem(item), 500),
    descricao_tecnica: String(item.description || item.descricao_tecnica || '')
  });

  try {
    if (!orcamento.cust_name || !orcamento.cust_phone || !orcamento.cust_email || !orcamento.valid_until) {
      return res.status(400).json({ error: 'Nome, telefone, e-mail do cliente e validade são obrigatórios.' });
    }
    if (!emailClienteValido(orcamento.cust_email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido para o cliente.' });
    }

    const itensNormalizados = (orcamento.items || []).map(normalizarItem);
    if (itensNormalizados.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos um item para salvar o orçamento.' });
    }

    await client.query('BEGIN');
    await definirContextoAuditoria(client, session, orcamento.orcamento_id ? 'EDICAO ORCAMENTO' : 'CRIACAO ORCAMENTO');

    const dadosCabecalho = [
      orcamento.valid_until && orcamento.valid_until !== "" ? orcamento.valid_until : null,
      limitarTexto(orcamento.cust_name || 'Consumidor', 255),
      limitarTexto(apenasDigitos(orcamento.cust_doc), 20),
      limitarTexto(apenasDigitos(orcamento.cust_phone), 15),
      limitarTexto(normalizarEmailCliente(orcamento.cust_email), 254),
      limitarTexto(orcamento.seller_name || '', 100),
      limitarTexto(apenasDigitos(orcamento.seller_phone), 20),
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
          email_cliente = $5,
          vendedor_nome = $6,
          vendedor_contato = $7,
          obs_geral = $8,
          valor_total = $9
        WHERE id = $10
      `, [...dadosCabecalho, orcamentoId]);

      await client.query('DELETE FROM vendedor_orcamento WHERE id_orcamento = $1', [orcamentoId]);
    } else {
      const resultOrcamento = await client.query(`
        INSERT INTO orcamentos (
          data_validade,
          cliente_nome,
          cliente_doc,
          telefone_cliente,
          email_cliente,
          vendedor_nome,
          vendedor_contato,
          obs_geral,
          valor_total,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [...dadosCabecalho, 'PENDENTE']);

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
        parseInt(session.sub, 10) || null,
        limitarTexto(v.nome_funcionario || '', 255),
        limitarTexto(session.categoria || '', 5),
        limitarTexto(session.idfilial || '', 2)
      ]);
    }

    // 3. Sincroniza os itens vinculados
    const idsMantidos = [];
    const itensSalvos = [];

    for (let itemIndex = 0; itemIndex < itensNormalizados.length; itemIndex += 1) {
      const item = orcamento.items[itemIndex] || {};
      const itemNormalizado = itensNormalizados[itemIndex];
      const dadosItem = [
        itemNormalizado.sku,
        itemNormalizado.nome_produto,
        itemNormalizado.variacao,
        itemNormalizado.quantidade,
        itemNormalizado.preco_unitario,
        itemNormalizado.imagem_url,
        itemNormalizado.descricao_tecnica
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

    const confirmacao = await client.query('SELECT id FROM orcamentos WHERE id = $1', [orcamentoId]);
    if (confirmacao.rows.length === 0) {
      return res.status(500).json({ error: 'Orçamento não confirmado no banco após salvamento.' });
    }

    res.status(200).json({ success: true, orcamentoId, items: itensSalvos });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Erro ao salvar no banco:", error);
    res.status(500).json({ error: 'Erro ao salvar orçamento', details: error.message });
  } finally {
    client.release();
  }
}
