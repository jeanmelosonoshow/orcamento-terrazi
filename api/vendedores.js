import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Firebird = require('node-firebird');
const FIREBIRD_TIMEOUT_MS = 12000;

function getFirebirdOptions() {
    return {
        host: process.env.DB_HOST_FB,
        port: process.env.DB_PORT_FB,
        database: process.env.DB_PATH_FB,
        user: process.env.DB_USER_FB,
        password: process.env.DB_PASSWORD_FB,
        lowercase_keys: false,
        pageSize: 4096
    };
}

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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo nao permitido' });

    const categoriasTraduzidas = {
        VENDEDOR: 'VD',
        GERENTE: 'GR',
        SUPERVISOR: 'SU',
        DIRETOR: 'DI',
        CAIXA: 'CX'
    };
    const categoriaRaw = String(req.query.categoria || '').trim().toUpperCase();
    const categoria = categoriasTraduzidas[categoriaRaw] || categoriaRaw;
    const idfuncionario = Number(req.query.idfuncionario || 0);
    const idfilial = String(req.query.idfilial || '').trim();
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

    return new Promise((resolve) => {
        let finalizado = false;
        let conexao = null;
        const finalizar = (status, payload) => {
            if (finalizado) return;
            finalizado = true;
            clearTimeout(timeout);
            try { if (conexao) conexao.detach(); } catch (error) {}
            res.status(status).json(payload);
            resolve();
        };
        const timeout = setTimeout(() => {
            finalizar(504, { error: 'Tempo limite ao consultar vendedores.' });
        }, FIREBIRD_TIMEOUT_MS);

        Firebird.attach(getFirebirdOptions(), function(err, db) {
            if (finalizado) {
                try { if (db) db.detach(); } catch (error) {}
                return;
            }
            if (err) return finalizar(500, { error: 'Falha ao conectar no Firebird.' });
            conexao = db;

            db.query(sql, params, function(queryErr, result) {
                if (queryErr) return finalizar(500, { error: 'Erro ao consultar vendedores.', details: queryErr.message });
                finalizar(200, { vendedores: (result || []).map(normalizarVendedor) });
            });
        });
    });
}



