import { requireRequestSession } from '../lib/session-token.js';
import { executarConsultaFirebirdGateway, statusHttpErroConsulta } from '../lib/bi-gateway-client.js';
const FIREBIRD_TIMEOUT_MS = 12000;

function normalizarFilial(row) {
    return {
        idfilial: String(row.IDFILIAL || '').trim(),
        nomefilial: String(row.NOMEFILIAL || '').trim()
    };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

    const session = requireRequestSession(req, res);
    if (!session) return;
    const categoria = String(session.categoria || '').trim().toUpperCase();
    const idfuncionario = Number(session.sub || 0);
    const idfilial = String(session.idfilial || '').trim();

    let sql = `
        SELECT IDFILIAL, NOMEFILIAL
        FROM FILIAL
        WHERE IDSUPERVISOR IS NOT NULL
    `;
    const params = [];

    if (categoria === 'SU') {
        sql += ' AND IDSUPERVISOR = ?';
        params.push(idfuncionario);
    } else if (categoria !== 'DI') {
        sql += ' AND IDFILIAL = ?';
        params.push(idfilial);
    }

    sql += ' ORDER BY NOMEFILIAL';

    try {
        const result = await executarConsultaFirebirdGateway(sql, params, {
            operacao: 'listar-filiais',
            timeoutMs: FIREBIRD_TIMEOUT_MS,
            cacheTtlMs: 300000,
            cacheStaleMs: 1800000
        });
        return res.status(200).json({ filiais: result.map(normalizarFilial) });
    } catch (error) {
        const status = statusHttpErroConsulta(error);
        if (status >= 503) res.setHeader('Retry-After', '1');
        return res.status(status).json({
            error: status >= 503
                ? 'Banco temporariamente indisponível. Tente novamente.'
                : 'Erro ao consultar filiais.'
        });
    }
}
