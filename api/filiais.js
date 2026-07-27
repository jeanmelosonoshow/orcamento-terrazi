import { createRequire } from 'module';
import { requireRequestSession } from '../lib/session-token.js';
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
            finalizar(504, { error: 'Tempo limite ao consultar filiais.' });
        }, FIREBIRD_TIMEOUT_MS);

        Firebird.attach(getFirebirdOptions(), function(err, db) {
            if (finalizado) {
                try { if (db) db.detach(); } catch (error) {}
                return;
            }
            if (err) return finalizar(500, { error: 'Falha ao conectar no Firebird.' });
            conexao = db;

            db.query(sql, params, function(queryErr, result) {
                if (queryErr) return finalizar(500, { error: 'Erro ao consultar filiais.', details: queryErr.message });
                finalizar(200, { filiais: (result || []).map(normalizarFilial) });
            });
        });
    });
}

