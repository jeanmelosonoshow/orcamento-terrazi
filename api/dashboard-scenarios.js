import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import {
    garantirSchemaCenariosDashboard,
    limparConfiguracaoWidgets,
    normalizarAlturaCanvas,
    normalizarContextoDashboard,
    normalizarLinhaCenario,
    obterEditoresCenariosDashboard,
    podeEditarCenariosDashboard,
} from '../lib/dashboard-scenarios.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!['GET', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Metodo nao permitido.' });

    const session = requireRequestSession(req, res);
    if (!session) return;

    try {
        await garantirSchemaCenariosDashboard();
        if (req.method === 'GET') {
            const resultado = await db.query(`
                SELECT contexto, configuracao, altura_canvas, versao, atualizado_por, atualizado_em
                  FROM crm_dashboard_cenario
                 ORDER BY contexto
            `);
            return res.status(200).json({ cenarios: resultado.rows.map(normalizarLinhaCenario) });
        }

        if (!podeEditarCenariosDashboard(session, obterEditoresCenariosDashboard())) {
            return res.status(403).json({ error: 'Seu usuario nao pode alterar os cenarios compartilhados.' });
        }

        const contexto = normalizarContextoDashboard(req.body?.contexto);
        if (!contexto) return res.status(400).json({ error: 'Contexto de dashboard invalido.' });
        const widgets = limparConfiguracaoWidgets(req.body?.widgets);
        const alturaCanvas = normalizarAlturaCanvas(req.body?.alturaCanvas);
        const versaoEsperada = Math.max(0, Number.parseInt(req.body?.versao, 10) || 0);
        const atualizadoPor = String(session.sub || '').slice(0, 50);
        const client = await db.connect();

        try {
            await client.query('BEGIN');
            const atual = await client.query(`
                SELECT contexto, configuracao, altura_canvas, versao, atualizado_por, atualizado_em
                  FROM crm_dashboard_cenario
                 WHERE contexto = $1
                 FOR UPDATE
            `, [contexto]);

            if (atual.rows.length) {
                const versaoAtual = Number(atual.rows[0].versao);
                if (versaoEsperada !== versaoAtual) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({
                        error: 'Este cenario foi alterado por outro usuario.',
                        cenario: normalizarLinhaCenario(atual.rows[0]),
                    });
                }

                const atualizado = await client.query(`
                    UPDATE crm_dashboard_cenario
                       SET configuracao = $2::jsonb,
                           altura_canvas = $3,
                           versao = versao + 1,
                           atualizado_por = $4,
                           atualizado_em = NOW()
                     WHERE contexto = $1
                 RETURNING contexto, configuracao, altura_canvas, versao, atualizado_por, atualizado_em
                `, [contexto, JSON.stringify(widgets), alturaCanvas, atualizadoPor]);
                await registrarHistorico(client, atualizado.rows[0]);
                await client.query('COMMIT');
                return res.status(200).json({ cenario: normalizarLinhaCenario(atualizado.rows[0]) });
            }

            if (versaoEsperada !== 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'O cenario ainda nao existe no servidor.', cenario: null });
            }

            const inserido = await client.query(`
                INSERT INTO crm_dashboard_cenario (
                    contexto, configuracao, altura_canvas, versao, atualizado_por
                ) VALUES ($1, $2::jsonb, $3, 1, $4)
                RETURNING contexto, configuracao, altura_canvas, versao, atualizado_por, atualizado_em
            `, [contexto, JSON.stringify(widgets), alturaCanvas, atualizadoPor]);
            await registrarHistorico(client, inserido.rows[0]);
            await client.query('COMMIT');
            return res.status(201).json({ cenario: normalizarLinhaCenario(inserido.rows[0]) });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        if (error?.code === '23505') {
            return res.status(409).json({ error: 'O cenario foi criado por outro usuario. Recarregue o painel.' });
        }
        const status = Number(error?.statusCode) || 500;
        if (status >= 500) console.error('[dashboard-scenarios] falha', { code: error?.code, message: error?.message });
        return res.status(status).json({
            error: status >= 500 ? 'Nao foi possivel acessar os cenarios compartilhados.' : error.message,
        });
    }
}

async function registrarHistorico(client, row) {
    await client.query(`
        INSERT INTO crm_dashboard_cenario_historico (
            contexto, configuracao, altura_canvas, versao, atualizado_por, atualizado_em
        ) VALUES ($1, $2::jsonb, $3, $4, $5, $6)
    `, [
        row.contexto,
        JSON.stringify(row.configuracao),
        row.altura_canvas,
        row.versao,
        row.atualizado_por,
        row.atualizado_em,
    ]);
}
