import crypto from 'crypto';
import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import {
    calcularValorComissao,
    chaveVendaComissao,
    normalizarVendaComissao,
    statusOperacionalComissao
} from '../lib/architect-commissions.js';
import { agendarSincronizacaoFornecedor } from '../lib/architect-supplier-sync.js';

function erro(mensagem, statusCode = 400, code = 'COMMISSION_ERROR') {
    return Object.assign(new Error(mensagem), { statusCode, code });
}

function exigirGestor(session) {
    if (session?.architectCommissionManager !== true) {
        throw erro('Usuario sem permissao para controlar comissoes de arquitetos.', 403, 'COMMISSION_FORBIDDEN');
    }
}

function numeroPositivo(valor, nome) {
    const numero = Number.parseInt(valor, 10);
    if (!Number.isSafeInteger(numero) || numero <= 0) throw erro(`${nome} invalido.`);
    return numero;
}

function normalizarChaves(vendas = []) {
    const unicas = new Map();
    (Array.isArray(vendas) ? vendas : []).slice(0, 1000).forEach(item => {
        const filial = String(item?.idfilialSaida ?? item?.idfilial_saida ?? '').trim().toUpperCase().slice(0, 2);
        const numero = Number.parseInt(item?.numeroSaida ?? item?.numero_saida, 10);
        const chave = chaveVendaComissao(filial, numero);
        if (chave) unicas.set(chave, { filial, numero });
    });
    return Array.from(unicas.values());
}

function normalizarPagamento(linha) {
    return {
        id: Number(linha.id),
        chave: chaveVendaComissao(linha.idfilial_saida, linha.numero_saida),
        orcamentoId: Number(linha.orcamento_id),
        arquitetoId: Number(linha.arquiteto_id),
        nomeArquiteto: linha.nome_arquiteto,
        idfilialSaida: linha.idfilial_saida,
        numeroSaida: Number(linha.numero_saida),
        valorVenda: Number(linha.valor_venda),
        percentualComissao: Number(linha.percentual_comissao),
        valorComissao: Number(linha.valor_comissao),
        status: statusOperacionalComissao(linha),
        statusPersistido: linha.status_pagamento,
        dataAutorizacao: linha.data_autorizacao,
        dataNegacao: linha.data_negacao,
        motivoNegacao: linha.motivo_negacao || null,
        dataPrevistaPagamento: linha.data_prevista_pagamento,
        lotePagamentoId: linha.lote_pagamento_id ? Number(linha.lote_pagamento_id) : null,
        numeroLote: linha.numero_lote || null,
        statusLote: linha.status_lote || null,
        versao: Number(linha.versao || 1)
    };
}

const SELECT_PAGAMENTO = `
    SELECT p.*, l.numero_lote, l.status_lote
      FROM pagamento_orcamento_arquiteto p
      LEFT JOIN lote_pagamento_arquiteto l ON l.id = p.lote_pagamento_id
`;

async function consultarPagamentos(client, vendas) {
    const chaves = normalizarChaves(vendas);
    if (!chaves.length) return [];
    const valores = [];
    const pares = chaves.map(({ filial, numero }, indice) => {
        valores.push(filial, numero);
        return `($${indice * 2 + 1}, $${indice * 2 + 2})`;
    });
    const resultado = await client.query(`${SELECT_PAGAMENTO}
        WHERE (p.idfilial_saida, p.numero_saida) IN (${pares.join(', ')})
        ORDER BY p.id
    `, valores);
    return resultado.rows.map(normalizarPagamento);
}

async function autorizarVenda(client, venda, idfuncionario) {
    const normalizada = normalizarVendaComissao(venda);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [normalizada.chave]);
    const existente = await client.query(`
        SELECT * FROM pagamento_orcamento_arquiteto
         WHERE idfilial_saida = $1 AND numero_saida = $2
         FOR UPDATE
    `, [normalizada.idfilialSaida, normalizada.numeroSaida]);
    if (existente.rows.length) {
        const atual = existente.rows[0];
        if (atual.status_pagamento !== 'PENDENTE') return normalizarPagamento(atual);
        const atualizado = await client.query(`
            UPDATE pagamento_orcamento_arquiteto
               SET status_pagamento = 'AUTORIZADO',
                   idfuncionario_autorizacao = $2,
                   data_autorizacao = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *
        `, [atual.id, idfuncionario]);
        return normalizarPagamento(atualizado.rows[0]);
    }

    const vinculo = await client.query(`
        SELECT ao.arquiteto_id, ao.nome_arquiteto, ao.cpf_arquiteto, ao.registro_cau_arquiteto,
               ao.telefone_arquiteto, ao.email_arquiteto, a.percentual_comissao
          FROM arquiteto_orcamento ao
          JOIN arquiteto a ON a.id = ao.arquiteto_id AND a.ativo = TRUE
          JOIN orcamento_saida os
            ON os.orcamento_id = ao.orcamento_id
           AND os.idfilialsaida = $2
           AND os.numerosaida = $3
         WHERE ao.orcamento_id = $1
         LIMIT 1
         FOR UPDATE OF ao
    `, [normalizada.orcamentoId, normalizada.idfilialSaida, normalizada.numeroSaida]);
    const arquiteto = vinculo.rows[0];
    if (!arquiteto) throw erro('A venda nao esta vinculada ao orcamento e ao arquiteto informados.', 409, 'SALE_LINK_NOT_FOUND');
    if (arquiteto.percentual_comissao === null || arquiteto.percentual_comissao === undefined) {
        throw erro('Cadastre o percentual de comissao do arquiteto antes de autorizar.', 409, 'COMMISSION_RATE_MISSING');
    }
    const valorComissao = calcularValorComissao(normalizada.valorVenda, arquiteto.percentual_comissao);
    const inserido = await client.query(`
        INSERT INTO pagamento_orcamento_arquiteto (
            orcamento_id, arquiteto_id, nome_arquiteto, cpf_arquiteto, registro_cau_arquiteto,
            telefone_arquiteto, email_arquiteto, idfilial_saida, numero_saida, valor_venda,
            percentual_comissao, valor_comissao, status_pagamento, idfuncionario_criacao,
            idfuncionario_autorizacao, data_autorizacao
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, 'AUTORIZADO', $13, $13, CURRENT_TIMESTAMP
        )
        RETURNING *
    `, [
        normalizada.orcamentoId, arquiteto.arquiteto_id, arquiteto.nome_arquiteto,
        arquiteto.cpf_arquiteto, arquiteto.registro_cau_arquiteto, arquiteto.telefone_arquiteto,
        arquiteto.email_arquiteto, normalizada.idfilialSaida, normalizada.numeroSaida,
        normalizada.valorVenda, Number(arquiteto.percentual_comissao), valorComissao, idfuncionario
    ]);
    return normalizarPagamento(inserido.rows[0]);
}

async function reprocessarVenda(client, venda, idfuncionario) {
    const normalizada = normalizarVendaComissao(venda);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [normalizada.chave]);
    const existente = await client.query(`
        SELECT * FROM pagamento_orcamento_arquiteto
         WHERE idfilial_saida = $1 AND numero_saida = $2
         FOR UPDATE
    `, [normalizada.idfilialSaida, normalizada.numeroSaida]);
    const atual = existente.rows[0];
    if (!atual) throw erro('A comissao autorizada nao foi encontrada.', 404, 'COMMISSION_NOT_FOUND');
    if (atual.status_pagamento !== 'AUTORIZADO' || atual.lote_pagamento_id) {
        throw erro('Somente uma comissao autorizada e ainda sem bordero pode ser reprocessada.', 409, 'COMMISSION_REPROCESS_NOT_ALLOWED');
    }
    if (Number(atual.orcamento_id) !== normalizada.orcamentoId) {
        throw erro('A venda atual nao corresponde ao orcamento originalmente autorizado.', 409, 'COMMISSION_BUDGET_MISMATCH');
    }
    const fila = await client.query(`
        SELECT 1
          FROM fila_sincronizacao_pagamento_arquiteto
         WHERE pagamento_id = $1
         LIMIT 1
    `, [atual.id]);
    if (fila.rows.length) {
        throw erro('Esta comissao ja possui uma fila de geracao e nao pode ser reprocessada.', 409, 'COMMISSION_QUEUE_EXISTS');
    }

    const valorVendaAnterior = Number(atual.valor_venda);
    const valorComissaoAnterior = Number(atual.valor_comissao);
    const percentualComissao = Number(atual.percentual_comissao);
    const valorComissao = calcularValorComissao(normalizada.valorVenda, percentualComissao);
    const atualizado = await client.query(`
        UPDATE pagamento_orcamento_arquiteto
           SET valor_venda = $2,
               valor_comissao = $3,
               versao = versao + 1,
               data_ultima_atualizacao = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *
    `, [atual.id, normalizada.valorVenda, valorComissao]);
    await client.query(`
        INSERT INTO historico_pagamento_arquiteto (
            pagamento_id, status_anterior, status_novo, idfuncionario, observacao, dados_evento
        ) VALUES (
            $1, 'AUTORIZADO', 'AUTORIZADO', $2, 'COMISSAO_REPROCESSADA',
            jsonb_build_object(
                'valorVendaAnterior', $3::numeric,
                'valorVendaNovo', $4::numeric,
                'percentualComissao', $5::numeric,
                'valorComissaoAnterior', $6::numeric,
                'valorComissaoNovo', $7::numeric,
                'versao', $8::integer
            )
        )
    `, [
        atual.id, idfuncionario, valorVendaAnterior, normalizada.valorVenda,
        percentualComissao, valorComissaoAnterior, valorComissao, atualizado.rows[0].versao
    ]);
    return normalizarPagamento(atualizado.rows[0]);
}

async function negarVenda(client, venda, idfuncionario, motivoNegacao) {
    const normalizada = normalizarVendaComissao(venda);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [normalizada.chave]);
    const existente = await client.query(`
        SELECT * FROM pagamento_orcamento_arquiteto
         WHERE idfilial_saida = $1 AND numero_saida = $2
         FOR UPDATE
    `, [normalizada.idfilialSaida, normalizada.numeroSaida]);
    const motivo = String(motivoNegacao || '').trim().slice(0, 500) || null;
    if (existente.rows.length) {
        const atual = existente.rows[0];
        if (atual.status_pagamento !== 'PENDENTE') return normalizarPagamento(atual);
        const atualizado = await client.query(`
            UPDATE pagamento_orcamento_arquiteto
               SET status_pagamento = 'NEGADO',
                   idfuncionario_negacao = $2,
                   data_negacao = CURRENT_TIMESTAMP,
                   motivo_negacao = $3
             WHERE id = $1
             RETURNING *
        `, [atual.id, idfuncionario, motivo]);
        return normalizarPagamento(atualizado.rows[0]);
    }
    const vinculo = await client.query(`
        SELECT ao.arquiteto_id, ao.nome_arquiteto, ao.cpf_arquiteto, ao.registro_cau_arquiteto,
               ao.telefone_arquiteto, ao.email_arquiteto, a.percentual_comissao
          FROM arquiteto_orcamento ao
          JOIN arquiteto a ON a.id = ao.arquiteto_id AND a.ativo = TRUE
          JOIN orcamento_saida os
            ON os.orcamento_id = ao.orcamento_id
           AND os.idfilialsaida = $2
           AND os.numerosaida = $3
         WHERE ao.orcamento_id = $1
         LIMIT 1
         FOR UPDATE OF ao
    `, [normalizada.orcamentoId, normalizada.idfilialSaida, normalizada.numeroSaida]);
    const arquiteto = vinculo.rows[0];
    if (!arquiteto) throw erro('A venda nao esta vinculada ao orcamento e ao arquiteto informados.', 409, 'SALE_LINK_NOT_FOUND');
    if (arquiteto.percentual_comissao === null || arquiteto.percentual_comissao === undefined) {
        throw erro('Cadastre o percentual de comissao do arquiteto antes de negar.', 409, 'COMMISSION_RATE_MISSING');
    }
    const valorComissao = calcularValorComissao(normalizada.valorVenda, arquiteto.percentual_comissao);
    const inserido = await client.query(`
        INSERT INTO pagamento_orcamento_arquiteto (
            orcamento_id, arquiteto_id, nome_arquiteto, cpf_arquiteto, registro_cau_arquiteto,
            telefone_arquiteto, email_arquiteto, idfilial_saida, numero_saida, valor_venda,
            percentual_comissao, valor_comissao, status_pagamento, idfuncionario_criacao,
            idfuncionario_negacao, data_negacao, motivo_negacao
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, 'NEGADO', $13, $13, CURRENT_TIMESTAMP, $14
        )
        RETURNING *
    `, [
        normalizada.orcamentoId, arquiteto.arquiteto_id, arquiteto.nome_arquiteto,
        arquiteto.cpf_arquiteto, arquiteto.registro_cau_arquiteto, arquiteto.telefone_arquiteto,
        arquiteto.email_arquiteto, normalizada.idfilialSaida, normalizada.numeroSaida,
        normalizada.valorVenda, Number(arquiteto.percentual_comissao), valorComissao, idfuncionario, motivo
    ]);
    return normalizarPagamento(inserido.rows[0]);
}

async function carregarBordero(client, loteId) {
    const lote = await client.query(`
        SELECT * FROM lote_pagamento_arquiteto WHERE id = $1 LIMIT 1
    `, [loteId]);
    if (!lote.rows.length) throw erro('Bordero nao encontrado.', 404, 'BORDERO_NOT_FOUND');
    const itens = await client.query(`${SELECT_PAGAMENTO}
        WHERE p.lote_pagamento_id = $1
        ORDER BY p.nome_arquiteto, p.idfilial_saida, p.numero_saida
    `, [loteId]);
    return {
        id: Number(lote.rows[0].id),
        numero: lote.rows[0].numero_lote,
        dataPrevistaPagamento: lote.rows[0].data_prevista_pagamento,
        quantidadeItens: Number(lote.rows[0].quantidade_itens),
        valorTotal: Number(lote.rows[0].valor_total),
        status: lote.rows[0].status_lote,
        dataGeracao: lote.rows[0].data_geracao,
        itens: itens.rows.map(normalizarPagamento)
    };
}

async function prepararLote(client, ids, dataPrevistaPagamento, idfuncionario) {
    const pagamentosIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isSafeInteger))).slice(0, 500);
    if (!pagamentosIds.length) throw erro('Selecione ao menos um pagamento autorizado.');
    const data = String(dataPrevistaPagamento || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw erro('Informe uma data prevista valida.');

    const pagamentos = await client.query(`
        SELECT * FROM pagamento_orcamento_arquiteto
         WHERE id = ANY($1::bigint[])
         FOR UPDATE
    `, [pagamentosIds]);
    if (pagamentos.rows.length !== pagamentosIds.length) throw erro('Um ou mais pagamentos selecionados nao foram encontrados.', 409);
    if (pagamentos.rows.some(item => item.status_pagamento !== 'AUTORIZADO' || item.lote_pagamento_id)) {
        throw erro('Todos os itens devem estar autorizados e ainda sem bordero.', 409, 'INVALID_BATCH_ITEMS');
    }
    const dataBanco = await client.query('SELECT CURRENT_DATE::text AS hoje');
    if (data < dataBanco.rows[0].hoje) throw erro('A data prevista nao pode estar no passado.');

    const numeroTemporario = `ARQ-${data.replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const quantidade = pagamentos.rows.length;
    const valorTotal = pagamentos.rows.reduce((total, item) => total + Number(item.valor_comissao || 0), 0);
    const lote = await client.query(`
        INSERT INTO lote_pagamento_arquiteto (
            numero_lote, data_prevista_pagamento, quantidade_itens, valor_total,
            status_lote, idfuncionario_geracao
        ) VALUES ($1, $2, $3, $4, 'AGUARDANDO_SINCRONIZACAO', $5)
        RETURNING *
    `, [numeroTemporario, data, quantidade, valorTotal, idfuncionario]);
    const loteId = Number(lote.rows[0].id);
    await client.query(`
        UPDATE pagamento_orcamento_arquiteto
           SET lote_pagamento_id = $1,
               data_prevista_pagamento = $2,
               idfuncionario_geracao = $3,
               versao = versao + 1,
               data_ultima_atualizacao = CURRENT_TIMESTAMP
         WHERE id = ANY($4::bigint[])
    `, [loteId, data, idfuncionario, pagamentosIds]);
    await client.query(`
        INSERT INTO historico_pagamento_arquiteto (
            pagamento_id, status_anterior, status_novo, idfuncionario, observacao, dados_evento
        )
        SELECT id, 'AUTORIZADO', 'AUTORIZADO', $1, 'BORDERO_PREPARADO',
               jsonb_build_object('lotePagamentoId', $2::bigint, 'dataPrevistaPagamento', $3::date)
          FROM pagamento_orcamento_arquiteto
         WHERE id = ANY($4::bigint[])
    `, [idfuncionario, loteId, data, pagamentosIds]);
    const estruturaFornecedor = await client.query(
        "SELECT to_regclass('public.fila_sincronizacao_fornecedor_arquiteto') IS NOT NULL AS instalada"
    );
    if (estruturaFornecedor.rows[0]?.instalada) {
        for (const pagamento of pagamentos.rows) {
            await agendarSincronizacaoFornecedor(client, {
                id: pagamento.arquiteto_id,
                nome: pagamento.nome_arquiteto,
                telefone: pagamento.telefone_arquiteto,
                cpf: pagamento.cpf_arquiteto
            });
        }
        await client.query(`
            UPDATE pagamento_orcamento_arquiteto p
               SET firebird_idfornecedor = a.firebird_idfornecedor,
                   versao = p.versao + 1,
                   data_ultima_atualizacao = CURRENT_TIMESTAMP
              FROM arquiteto a
             WHERE p.id = ANY($1::bigint[])
               AND a.id = p.arquiteto_id
               AND a.cpf = p.cpf_arquiteto
               AND a.fornecedor_sync_status = 'SINCRONIZADO'
               AND a.firebird_idfornecedor IS NOT NULL
        `, [pagamentosIds]);
        await client.query(`
            INSERT INTO fila_sincronizacao_pagamento_arquiteto (
                pagamento_id, lote_pagamento_id, operacao, status_fila
            )
            SELECT id, $1::bigint, 'CRIAR_PAGAR', 'PENDENTE'
              FROM pagamento_orcamento_arquiteto
             WHERE id = ANY($2::bigint[])
               AND firebird_idfornecedor IS NOT NULL
            ON CONFLICT (pagamento_id, operacao) DO NOTHING
        `, [loteId, pagamentosIds]);
    }
    return carregarBordero(client, loteId);
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido.' });
    const session = requireRequestSession(req, res);
    if (!session) return;

    let client;
    try {
        exigirGestor(session);
        const acao = String(req.body?.acao || '').trim().toLowerCase();
        client = await db.connect();
        if (acao === 'consultar') {
            const pagamentos = await consultarPagamentos(client, req.body?.vendas);
            return res.status(200).json({ pagamentos });
        }

        await client.query('BEGIN');
        const idfuncionario = numeroPositivo(session.sub, 'Funcionario');
        let resposta;
        if (acao === 'autorizar') {
            const vendas = Array.isArray(req.body?.vendas) ? req.body.vendas : [req.body?.venda];
            if (!vendas.length || vendas.length > 100) throw erro('Informe entre 1 e 100 vendas para autorizar.');
            resposta = { pagamentos: [] };
            for (const venda of vendas) resposta.pagamentos.push(await autorizarVenda(client, venda, idfuncionario));
        } else if (acao === 'negar') {
            const vendas = Array.isArray(req.body?.vendas) ? req.body.vendas : [req.body?.venda];
            if (!vendas.length || vendas.length > 100) throw erro('Informe entre 1 e 100 vendas para negar.');
            resposta = { pagamentos: [] };
            for (const venda of vendas) resposta.pagamentos.push(await negarVenda(client, venda, idfuncionario, req.body?.motivo));
        } else if (acao === 'reprocessar') {
            resposta = { pagamento: await reprocessarVenda(client, req.body?.venda, idfuncionario) };
        } else if (acao === 'preparar-lote') {
            resposta = { bordero: await prepararLote(client, req.body?.pagamentoIds, req.body?.dataPrevistaPagamento, idfuncionario) };
        } else if (acao === 'bordero') {
            resposta = { bordero: await carregarBordero(client, numeroPositivo(req.body?.loteId, 'Bordero')) };
        } else {
            throw erro('Acao de comissao invalida.');
        }
        await client.query('COMMIT');
        return res.status(200).json(resposta);
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        const status = Number(error?.statusCode) || (error?.code === '42P01' ? 503 : 500);
        if (status >= 500) console.error('[comissoes-arquiteto] falha', { code: error?.code || null, message: error?.message });
        return res.status(status).json({
            error: error?.code === '42P01'
                ? 'Estrutura de comissoes ainda nao instalada no PostgreSQL.'
                : (status >= 500 ? 'Nao foi possivel processar a comissao.' : error.message),
            code: error?.code || 'COMMISSION_ERROR'
        });
    } finally {
        client?.release();
    }
}
