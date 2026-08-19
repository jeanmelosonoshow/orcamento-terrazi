import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import { listarMotivosRecusa, obterMotivoRecusa } from '../lib/budget-rejection-reasons.js';
import {
    STATUS_NEGOCIACAO,
    definirContextoAuditoria,
    expirarOrcamentos,
    normalizarContatoOrcamento,
    normalizarNegociacao,
    normalizarSaidaOrcamento,
    normalizarSaidasOrcamento,
    normalizarStatus,
    numeroSessao,
    textoLimitado,
    verificarAcessoOrcamento
} from '../lib/budget-negotiation.js';

const STATUS_EDITAVEIS = new Set(['ENVIADO AO CLIENTE', 'EM NEGOCIACAO', 'GEROU VENDA', 'RECUSADO']);

function idOrcamentoRequisicao(req) {
    return Number.parseInt(req.method === 'GET' ? req.query?.id : req.body?.orcamentoId, 10) || null;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Metodo nao permitido.' });
    const session = requireRequestSession(req, res);
    if (!session) return;

    const orcamentoId = idOrcamentoRequisicao(req);
    if (!orcamentoId) return res.status(400).json({ error: 'Orcamento nao informado.' });
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await definirContextoAuditoria(client, session, req.method === 'GET' ? 'CONSULTA' : 'GESTAO FUNIL');
        await expirarOrcamentos(client);
        if (!await verificarAcessoOrcamento(client, orcamentoId, session)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Voce nao possui acesso a este orcamento.' });
        }

        if (req.method === 'POST') {
            const status = normalizarStatus(req.body?.status);
            const observacao = textoLimitado(req.body?.observacao, 10000);
            if (!STATUS_NEGOCIACAO.has(status) || !STATUS_EDITAVEIS.has(status)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Status de negociacao invalido.' });
            }
            const motivoRecusa = status === 'RECUSADO' ? obterMotivoRecusa(req.body?.motivoRecusa) : null;
            if (status === 'RECUSADO' && !motivoRecusa) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Selecione um motivo de recusa valido.' });
            }
            const saidas = status === 'GEROU VENDA' ? normalizarSaidasOrcamento(req.body?.saidas) : [];
            if (status === 'GEROU VENDA' && !saidas) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Informe ao menos uma saida valida, sem pedidos duplicados.' });
            }

            const atual = await client.query(`
                SELECT n.status_negociacao,
                       o.data_validade,
                       o.data_validade < CURRENT_DATE AS validade_expirada
                  FROM orcamentos o
                  LEFT JOIN status_negociacao n ON n.orcamento_id = o.id AND n.vigente
                 WHERE o.id = $1
                 FOR UPDATE OF o
            `, [orcamentoId]);
            const statusAtual = atual.rows[0]?.status_negociacao;
            if (['GEROU VENDA', 'RECUSADO'].includes(statusAtual)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Esta negociacao ja foi encerrada e nao pode ser alterada.' });
            }
            if (status === statusAtual) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'O orcamento ja esta neste status de negociacao.' });
            }
            if (['ENVIADO AO CLIENTE', 'EM NEGOCIACAO'].includes(status)
                && atual.rows[0]?.validade_expirada === true) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Atualize a validade do orcamento antes de reabrir a negociacao.' });
            }

            const negociacaoCriada = await client.query(`
                INSERT INTO status_negociacao (
                    orcamento_id, status_negociacao, motivo_recusa, motivo_recusa_descricao,
                    observacao, idfuncionario, idvendedor, origem
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'GESTAO FUNIL')
                RETURNING id
            `, [
                orcamentoId, status, motivoRecusa?.id || null, motivoRecusa?.label || null,
                observacao || null, numeroSessao(session.sub), numeroSessao(session.idvendedor)
            ]);
            if (status === 'GEROU VENDA') {
                await client.query(`
                    INSERT INTO orcamento_saida (
                        orcamento_id, status_negociacao_id, idfilialsaida, numerosaida,
                        idfuncionario, idvendedor
                    )
                    SELECT $1, $2, item.idfilialsaida, item.numerosaida, $5, $6
                      FROM UNNEST($3::text[], $4::integer[]) AS item(idfilialsaida, numerosaida)
                `, [
                    orcamentoId,
                    negociacaoCriada.rows[0].id,
                    saidas.map(item => item.idfilialsaida),
                    saidas.map(item => item.numerosaida),
                    numeroSessao(session.sub),
                    numeroSessao(session.idvendedor)
                ]);
            }
        }

        const [orcamento, historico, contato, saidas] = await Promise.all([
            client.query(`
                SELECT o.id, o.cliente_nome, o.cliente_doc, o.telefone_cliente, o.email_cliente,
                       o.valor_total, o.status, o.data_criacao, o.data_validade,
                       n.status_negociacao, n.data_status
                  FROM orcamentos o
                  LEFT JOIN status_negociacao n ON n.orcamento_id = o.id AND n.vigente
                 WHERE o.id = $1
            `, [orcamentoId]),
            client.query(`
                SELECT * FROM status_negociacao
                 WHERE orcamento_id = $1
                 ORDER BY data_status DESC, id DESC
            `, [orcamentoId]),
            client.query('SELECT * FROM controle_contato_orcamento WHERE orcamento_id = $1', [orcamentoId]),
            client.query(`
                SELECT * FROM orcamento_saida
                 WHERE orcamento_id = $1
                 ORDER BY data_vinculo, id
            `, [orcamentoId])
        ]);
        await client.query('COMMIT');
        return res.status(200).json({
            orcamento: orcamento.rows[0] || null,
            negociacao: normalizarNegociacao(historico.rows.find(item => item.vigente)),
            historico: historico.rows.map(normalizarNegociacao),
            contato: normalizarContatoOrcamento(contato.rows[0]),
            saidas: saidas.rows.map(normalizarSaidaOrcamento),
            motivosRecusa: listarMotivosRecusa()
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[negociacao-orcamento] falha', { code: error?.code || null, message: error?.message });
        return res.status(500).json({ error: 'Nao foi possivel processar a negociacao do orcamento.' });
    } finally {
        client.release();
    }
}
