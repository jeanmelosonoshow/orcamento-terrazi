import { db } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  const client = await db.connect();
  
  // Captura dados do usuário logado e filtros de busca
  const { categoria, idfuncionario, idfilial, buscaVendedor, buscaFilial } = req.query;

  try {
    let query = `
      SELECT 
        o.id,
        o.data_criacao,
        o.data_validade,
        o.cliente_nome,
        o.cliente_doc,
        o.vendedor_nome,
        o.vendedor_contato,
        o.obs_geral,
        o.valor_total,
        v.id_filial,
        CASE 
          WHEN o.status = 'Pendente' AND o.data_validade < CURRENT_DATE THEN 'Expirado'
          ELSE o.status 
        END as status
      FROM orcamentos o
      LEFT JOIN vendedor_orcamento v ON o.id = v.id_orcamento
      WHERE 1=1
    `;

    const params = [];

    // --- REGRAS DE HIERARQUIA ---
    if (categoria === 'VD') {
      params.push(idfuncionario);
      query += ` AND v.id_funcionario = $${params.length}`;
    } 
    else if (categoria === 'GR') {
      params.push(idfilial);
      query += ` AND v.id_filial = $${params.length}`;
    }

    // --- FILTROS DE PESQUISA (Se preenchidos na tela) ---
    if (buscaVendedor) {
      params.push(`%${buscaVendedor}%`);
      query += ` AND o.vendedor_nome ILIKE $${params.length}`;
    }
    if (buscaFilial) {
      params.push(buscaFilial);
      query += ` AND v.id_filial = $${params.length}`;
    }

    query += ` ORDER BY o.id DESC`;

    const { rows } = await client.query(query, params);
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar orçamentos' });
  } finally {
    client.release();
  }
}
