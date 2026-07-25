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

function normalizarVendedor(row) {
    return {
        idfilial: String(row.IDFILIAL || '').trim(),
        categoria: String(row.CATEGORIA || '').trim(),
        idfuncionario: String(row.IDFUNCIONARIO || '').trim(),
        idvendedor: String(row.IDVENDEDOR || '').trim(),
        nomefuncionario: String(row.NOMEFUNCIONARIO || '').trim(),
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

    let sql = `
        SELECT
            F.IDFILIAL,
            F.CATEGORIA,
            F.IDFUNCIONARIO,
            F.IDVENDEDOR,
            F.NOMEFUNCIONARIO,
            CAST(NULL AS INTEGER) AS IDSUPERVISOR
        FROM FUNCIONARIO F
        JOIN VENDEDOR V ON V.IDVENDEDOR = F.IDVENDEDOR
        WHERE F.STATUS = 'A'
          AND V.STATUS = 'A'
          AND F.CATEGORIA = 'VD'
    `;
    const params = [];

    if (categoria === 'SU') {
        if (filiaisSelecionadas.length) {
            sql += ' AND F.IDFILIAL IN (' + filiaisSelecionadas.map(() => '?').join(',') + ')';
            params.push(...filiaisSelecionadas);
        } else {
            sql += ' AND F.IDFILIAL IN (SELECT IDFILIAL FROM FILIAL WHERE IDSUPERVISOR = ?)';
            params.push(idfuncionario);
        }
    } else if (categoria === 'GR') {
        sql += ' AND F.IDFILIAL = ?';
        params.push(idfilial);
    } else if (categoria !== 'DI') {
        sql += ' AND F.IDFUNCIONARIO = ?';
        params.push(idfuncionario);
    }

    sql += ' ORDER BY F.NOMEFUNCIONARIO';

    return new Promise((resolve) => {
        Firebird.attach(getFirebirdOptions(), function(err, db) {
            if (err) {
                res.status(500).json({ error: 'Falha ao conectar no Firebird.' });
                return resolve();
            }

            db.query(sql, params, function(queryErr, result) {
                db.detach();

                if (queryErr) {
                    res.status(500).json({ error: 'Erro ao consultar vendedores.' });
                    return resolve();
                }

                res.status(200).json({ vendedores: (result || []).map(normalizarVendedor) });
                resolve();
            });
        });
    });
}






