import { createRequire } from 'node:module';
import { readFirebirdPassword } from './windows/firebird-password.js';
import { setUserLoginCache } from '../lib/firebird-login.js';

const require = createRequire(import.meta.url);
const Firebird = require('node-firebird');

const SQL_ACTIVE_LOGIN_USERS = `
    SELECT
        LOGIN,
        SENHAWEB,
        IDFUNCIONARIO AS ID_FUNCIONARIO,
        NOMEFUNCIONARIO AS NOME_FUNCIONARIO,
        CATEGORIA,
        IDFILIAL AS ID_FILIAL
    FROM FUNCIONARIO
    WHERE STATUS = 'A'
      AND LOGIN IS NOT NULL
      AND SENHAWEB IS NOT NULL
      AND CATEGORIA IN ('GR','SU','VD','DI')
`;

async function main() {
    validateEnvironment();
    console.log(`[sync-login] Início: ${new Date().toISOString()}`);

    const database = await attachFirebird(readFirebirdPassword());
    try {
        const rows = await query(database, SQL_ACTIVE_LOGIN_USERS);
        let count = 0;

        for (const row of rows) {
            const usuario = normalizeText(row.LOGIN);
            const senhaHash = normalizeText(row.SENHAWEB).toLowerCase();
            if (!usuario || !senhaHash || !normalizeValue(row.ID_FUNCIONARIO)) continue;

            await setUserLoginCache(usuario, senhaHash, {
                idfuncionario: row.ID_FUNCIONARIO,
                nomefuncionario: row.NOME_FUNCIONARIO,
                categoria: row.CATEGORIA,
                idfilial: row.ID_FILIAL,
            });
            count += 1;
        }

        console.log(`[sync-login] Funcionários ativos sincronizados: ${count}`);
        console.log(`[sync-login] Fim: ${new Date().toISOString()}`);
    } finally {
        database.detach();
    }
}

function validateEnvironment() {
    const required = [
        'DB_HOST_FB', 'DB_PORT_FB', 'DB_PATH_FB', 'DB_USER_FB',
        'DB_PASSWORD_FILE', 'KV_REST_API_URL', 'KV_REST_API_TOKEN',
    ];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length) throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(', ')}`);
}

function attachFirebird(password) {
    return new Promise((resolve, reject) => {
        Firebird.attach({
            host: process.env.DB_HOST_FB,
            port: Number(process.env.DB_PORT_FB),
            database: process.env.DB_PATH_FB,
            user: process.env.DB_USER_FB,
            password,
            lowercase_keys: false,
            pageSize: 4096,
        }, (error, database) => (error ? reject(error) : resolve(database)));
    });
}

function query(database, sql) {
    return new Promise((resolve, reject) => {
        database.query(sql, [], (error, rows) => {
            if (error) return reject(error);
            return resolve(rows ?? []);
        });
    });
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeValue(value) {
    if (Buffer.isBuffer(value)) return value.toString('utf8').trim();
    if (value?.type === 'Buffer' && Array.isArray(value.data)) {
        return Buffer.from(value.data).toString('utf8').trim();
    }
    return String(value ?? '').trim();
}

main().catch((error) => {
    console.error('[sync-login] Falha na sincronização Firebird -> Redis:', error);
    process.exitCode = 1;
});
