import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import {
    normalizarContatoOrcamento,
    numeroSessao,
    textoLimitado
} from '../lib/budget-negotiation.js';
import {
    normalizarCategoriaAcessoOrcamento,
    resolverFiliaisPermitidasOrcamento
} from '../lib/budget-access-scope.js';

const LIMITE_ORCAMENTOS = 5000;

function normalizarOrcamentoId(valor) {
    const numero = Number.parseInt(valor, 10);
    return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido.' });
    const session = requireRequestSession(req, res);
    if (!session) return;

    const orcamentos = Array.from(new Set((Array.isArray(req.body?.orcamentos) ? req.body.orcamentos : [])
        .map(normalizarOrcamentoId).filter(Boolean))).slice(0, LIMITE_ORCAMENTOS);
    if (!orcamentos.length) return res.status(200).json({ contatos: [] });

    try {
        const categoria = normalizarCategoriaAcessoOrcamento(session.categoria);
        const filiaisPermitidas = await resolverFiliaisPermitidasOrcamento(session);
        const resultado = await db.query(`
            SELECT c.orcamento_id, c.status_contato, c.tipo_contato, c.observacao,
                   c.data_primeiro_contato, c.data_ultimo_contato, c.data_finalizacao,
                   c.idfuncionario, c.idvendedor, c.qtde_contato, c.data_ultima_atualizacao
              FROM controle_contato_orcamento c
              JOIN orcamentos o ON o.id = c.orcamento_id
             WHERE c.orcamento_id = ANY($1::integer[])
               AND (
                   $2::text = 'DI'
                   OR ($2::text = 'SU' AND EXISTS (
                       SELECT 1
                         FROM vendedor_orcamento v
                        WHERE v.id_orcamento = o.id
                          AND v.id_filial = ANY($5::text[])
                   ))
                   OR ($2::text = 'VD' AND EXISTS (
                       SELECT 1
                         FROM vendedor_orcamento v
                        WHERE v.id_orcamento = o.id
                          AND v.id_funcionario = $3
                   ))
                   OR ($2::text IN ('GR', 'CX') AND EXISTS (
                       SELECT 1
                         FROM vendedor_orcamento v
                        WHERE v.id_orcamento = o.id
                          AND v.id_filial = $4
                   ))
               )
        `, [
            orcamentos,
            categoria,
            numeroSessao(session.sub),
            textoLimitado(session.idfilial, 2),
            filiaisPermitidas
        ]);
        return res.status(200).json({
            contatos: resultado.rows.map(normalizarContatoOrcamento).filter(Boolean)
        });
    } catch (error) {
        console.error('[controle-contatos-orcamento] falha', { code: error?.code || null, message: error?.message });
        return res.status(500).json({ error: 'Nao foi possivel carregar os contatos dos orcamentos.' });
    }
}
