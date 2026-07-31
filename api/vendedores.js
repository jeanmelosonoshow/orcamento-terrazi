import { requireRequestSession } from '../lib/session-token.js';
import { executarConsultaFirebirdGateway, statusHttpErroConsulta } from '../lib/bi-gateway-client.js';
const FIREBIRD_TIMEOUT_MS = 12000;

function normalizarVendedor(row) {
    const nomeVendedor = row.NOMEVENDEDOR || row.NOMEFUNCIONARIO || '';
    return {
        idfilial: String(row.IDFILIAL || '').trim(),
        categoria: String(row.CATEGORIA || '').trim(),
        idfuncionario: String(row.IDFUNCIONARIO || '').trim(),
        idvendedor: String(row.IDVENDEDOR || '').trim(),
        nomefuncionario: String(nomeVendedor).trim(),
        idsupervisor: String(row.IDSUPERVISOR || '').trim()
    };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo nao permitido' });

    const categoriasTraduzidas = {
        VENDEDOR: 'VD',
        GERENTE: 'GR',
        SUPERVISOR: 'SU',
        DIRETOR: 'DI',
        CAIXA: 'CX'
    };
    const session = requireRequestSession(req, res);
    if (!session) return;
    const categoriaRaw = String(session.categoria || '').trim().toUpperCase();
    const categoria = categoriasTraduzidas[categoriaRaw] || categoriaRaw;
    const idfuncionario = Number(session.sub || 0);
    const idfilial = String(session.idfilial || '').trim();
    const filiaisSelecionadas = String(req.query.filiais || '')
        .split(',')
        .map(filial => filial.trim())
        .filter(Boolean);

    let sql = '';
    const params = [];
    const categoriasGestao = ['DI', 'SU', 'GR'];

    if (categoriasGestao.includes(categoria)) {
        sql = `
            SELECT
                V.IDFILIAL,
                CAST(NULL AS VARCHAR(5)) AS CATEGORIA,
                CAST(NULL AS INTEGER) AS IDFUNCIONARIO,
                V.IDVENDEDOR,
                V.NOMEVENDEDOR,
                FIL.IDSUPERVISOR
            FROM VENDEDOR V
            JOIN FILIAL FIL ON FIL.IDFILIAL = V.IDFILIAL
            WHERE V.STATUS = 'A'
        `;

        if (categoria === 'SU') {
            sql += ' AND FIL.IDSUPERVISOR = ?';
            params.push(idfuncionario);
        } else if (categoria === 'GR') {
            sql += ' AND V.IDFILIAL = ?';
            params.push(idfilial);
        }

        if (categoria === 'SU' && filiaisSelecionadas.length) {
            sql += ' AND V.IDFILIAL IN (' + filiaisSelecionadas.map(() => '?').join(',') + ')';
            params.push(...filiaisSelecionadas);
        }

        sql += ' ORDER BY V.NOMEVENDEDOR';
    } else {
        sql = `
            SELECT
                F.IDFILIAL,
                F.CATEGORIA,
                F.IDFUNCIONARIO,
                F.IDVENDEDOR,
                F.NOMEFUNCIONARIO,
                CAST(NULL AS INTEGER) AS IDSUPERVISOR
            FROM FUNCIONARIO F
            WHERE F.STATUS = 'A'
              AND F.CATEGORIA = 'VD'
              AND F.IDFUNCIONARIO = ?
        `;
        params.push(idfuncionario);
        sql += ' ORDER BY F.NOMEFUNCIONARIO';
    }

    try {
        const result = await executarConsultaFirebirdGateway(sql, params, {
            operacao: 'listar-vendedores',
            timeoutMs: FIREBIRD_TIMEOUT_MS,
            cacheTtlMs: 300000,
            cacheStaleMs: 1800000
        });
        return res.status(200).json({ vendedores: result.map(normalizarVendedor) });
    } catch (error) {
        const status = statusHttpErroConsulta(error);
        if (status >= 503) res.setHeader('Retry-After', '1');
        return res.status(status).json({
            error: status >= 503
                ? 'Banco temporariamente indisponível. Tente novamente.'
                : 'Erro ao consultar vendedores.'
        });
    }
}
