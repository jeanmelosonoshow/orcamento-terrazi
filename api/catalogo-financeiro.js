import crypto from 'node:crypto';
import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import { assinarManifesto, validarDefinicaoOperacao } from '../lib/finance-catalog.js';

function segredoValido(req) {
    const esperado = String(process.env.FINANCE_CATALOG_SYNC_SECRET || '');
    const recebido = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!esperado || esperado.length !== recebido.length) return false;
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido));
}

function exigirGestor(session) {
    if (session?.architectCommissionManager !== true) {
        throw Object.assign(new Error('Usuario sem permissao para administrar o catalogo financeiro.'), { statusCode: 403 });
    }
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET') {
        if (!segredoValido(req)) return res.status(401).json({ error: 'Nao autorizado.' });
        const resultado = await db.query(`
            SELECT versao, manifesto, hash_sha256, assinatura_base64, data_publicacao
              FROM versao_catalogo_financeiro
             ORDER BY versao DESC
             LIMIT 1
        `);
        if (!resultado.rows.length) return res.status(404).json({ error: 'Catalogo financeiro ainda nao publicado.' });
        const linha = resultado.rows[0];
        return res.status(200).json({
            version: Number(linha.versao),
            manifest: linha.manifesto,
            hash: linha.hash_sha256,
            signature: linha.assinatura_base64,
            publishedAt: linha.data_publicacao
        });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido.' });
    const session = requireRequestSession(req, res);
    if (!session) return;
    let client;
    try {
        exigirGestor(session);
        const acao = String(req.body?.acao || '').trim().toLowerCase();
        const idfuncionario = Number(session.sub);
        client = await db.connect();
        await client.query('BEGIN');
        if (acao === 'salvar') {
            const operacao = String(req.body?.operacao || '').trim().toUpperCase();
            if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(operacao)) throw Object.assign(new Error('Nome da operacao invalido.'), { statusCode: 400 });
            validarDefinicaoOperacao(req.body?.definicao);
            await client.query(`
                INSERT INTO catalogo_operacao_financeira (
                    operacao, definicao, ativo, idfuncionario_criacao, idfuncionario_ultima_atualizacao
                ) VALUES ($1, $2::jsonb, $3, $4, $4)
                ON CONFLICT (operacao) DO UPDATE SET
                    definicao = EXCLUDED.definicao,
                    ativo = EXCLUDED.ativo,
                    versao = catalogo_operacao_financeira.versao + 1,
                    idfuncionario_ultima_atualizacao = EXCLUDED.idfuncionario_ultima_atualizacao,
                    data_ultima_atualizacao = CURRENT_TIMESTAMP
            `, [operacao, JSON.stringify(req.body.definicao), req.body?.ativo !== false, idfuncionario]);
            await client.query('COMMIT');
            return res.status(200).json({ ok: true, operacao });
        }
        if (acao !== 'publicar') throw Object.assign(new Error('Acao invalida.'), { statusCode: 400 });
        const chavePrivada = String(process.env.FINANCE_CATALOG_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
        if (!chavePrivada) throw Object.assign(new Error('Chave privada de publicacao nao configurada.'), { statusCode: 503 });
        await client.query("SELECT pg_advisory_xact_lock(hashtext('finance-catalog-publish'))");
        const operacoes = await client.query(`
            SELECT operacao, definicao, versao
              FROM catalogo_operacao_financeira
             WHERE ativo = TRUE
             ORDER BY operacao
        `);
        if (!operacoes.rows.length) throw Object.assign(new Error('Nao existem operacoes financeiras ativas.'), { statusCode: 409 });
        const proxima = await client.query('SELECT COALESCE(MAX(versao), 0) + 1 AS versao FROM versao_catalogo_financeiro');
        const versao = Number(proxima.rows[0].versao);
        const manifesto = { schemaVersion: 1, catalogVersion: versao, operations: {} };
        for (const linha of operacoes.rows) {
            validarDefinicaoOperacao(linha.definicao);
            manifesto.operations[linha.operacao] = { ...linha.definicao, definitionVersion: Number(linha.versao) };
        }
        const assinado = assinarManifesto(manifesto, chavePrivada);
        await client.query(`
            INSERT INTO versao_catalogo_financeiro (
                versao, manifesto, hash_sha256, assinatura_base64, idfuncionario_publicacao
            ) VALUES ($1, $2::jsonb, $3, $4, $5)
        `, [versao, JSON.stringify(manifesto), assinado.hash, assinado.assinatura, idfuncionario]);
        await client.query('COMMIT');
        return res.status(200).json({ ok: true, version: versao, hash: assinado.hash });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        const status = Number(error?.statusCode) || (['42P01', '42703'].includes(error?.code) ? 503 : 500);
        if (status >= 500) console.error('[catalogo-financeiro] falha', { code: error?.code || null, message: error?.message });
        return res.status(status).json({ error: status >= 500 ? 'Nao foi possivel processar o catalogo financeiro.' : error.message });
    } finally {
        client?.release();
    }
}
