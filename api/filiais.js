import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Firebird = require('node-firebird');

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

function normalizarFilial(row) {
    return {
        idfilial: String(row.IDFILIAL || '').trim(),
        nomefilial: String(row.NOMEFILIAL || '').trim()
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

    const categoria = String(req.query.categoria || '').trim().toUpperCase();
    const idfuncionario = Number(req.query.idfuncionario || 0);
    const idfilial = String(req.query.idfilial || '').trim();

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

    return new Promise((resolve) => {
        Firebird.attach(getFirebirdOptions(), function(err, db) {
            if (err) {
                res.status(500).json({ error: 'Falha ao conectar no Firebird.' });
                return resolve();
            }

            db.query(sql, params, function(queryErr, result) {
                db.detach();

                if (queryErr) {
                    res.status(500).json({ error: 'Erro ao consultar filiais.' });
                    return resolve();
                }

                res.status(200).json({ filiais: (result || []).map(normalizarFilial) });
                resolve();
            });
        });
    });
}
