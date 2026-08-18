import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import { expirarOrcamentos, normalizarStatus } from '../lib/budget-negotiation.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  const session = requireRequestSession(req, res);
  if (!session) return;

  const client = await db.connect();
  
  // Captura dados do usuário logado e filtros de busca
  const categoria = normalizarStatus(session.categoria);
  const idfuncionario = session.sub;
  const idfilial = session.idfilial;
  const { buscaVendedor, buscaFilial } = req.query;

  try {
    await expirarOrcamentos(client);
    let query = `
      SELECT 
        o.id,
        o.data_criacao,
        o.data_validade,
        o.cliente_nome,
        o.cliente_doc,
        o.telefone_cliente,
        o.email_cliente,
        o.vendedor_nome,
        o.vendedor_contato,
        o.obs_geral,
        o.valor_total,
        v.id_filial,
        o.status,
        n.status_negociacao,
        n.data_status AS data_status_negociacao,
        c.status_contato,
        c.tipo_contato,
        c.data_ultima_atualizacao AS data_ultimo_contato
      FROM orcamentos o
      LEFT JOIN vendedor_orcamento v ON o.id = v.id_orcamento
      LEFT JOIN status_negociacao n ON n.orcamento_id = o.id AND n.vigente
      LEFT JOIN controle_contato_orcamento c ON c.orcamento_id = o.id
      WHERE 1=1
    `;

    const params = [];

    // --- REGRAS DE HIERARQUIA ---
    if (categoria === 'VD') {
      params.push(idfuncionario);
      query += ` AND v.id_funcionario = $${params.length}`;
    } 
    else if (['GR', 'CX'].includes(categoria)) {
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
