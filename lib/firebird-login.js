import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import {
    createCacheKey,
    getJsonCacheEntry,
    getStaleJsonCacheEntry,
    hasRedisConfig,
    setJsonCache,
} from './redis-cache.js';

const require = createRequire(import.meta.url);

export async function findUserByLogin(usuario, senha) {
    const normalizedUser = normalizeText(usuario);
    const senhaHash = hashPassword(senha);
    if (!normalizedUser || !senhaHash) return null;

    const keys = loginCacheKeys(normalizedUser, senhaHash);
    const fresh = await findFirstCacheHit(keys, getJsonCacheEntry);
    if (fresh.hit) return normalizeUser(fresh.value);

    if (useRedisOnly()) {
        const stale = await findFirstCacheHit(keys, getStaleJsonCacheEntry);
        if (stale.hit) return normalizeUser(stale.value);

        if (!hasRedisConfig()) {
            throw new LoginError('O cache de login Redis não está configurado.', 503);
        }
        if (fresh.error || stale.error) {
            throw new LoginError('O cache de login está temporariamente indisponível.', 503);
        }
        return null;
    }

    const rows = await queryDirectFirebird(normalizedUser, senhaHash);
    if (!rows.length) return null;

    const user = normalizeUser({
        idfuncionario: rows[0].ID_FUNCIONARIO,
        nomefuncionario: rows[0].NOME_FUNCIONARIO,
        categoria: rows[0].CATEGORIA,
        idfilial: rows[0].ID_FILIAL,
    });
    await setUserLoginCache(normalizedUser, senhaHash, user);
    return user;
}

export async function setUserLoginCache(usuario, senhaHash, user) {
    const normalizedUser = normalizeText(usuario);
    const normalizedHash = normalizeText(senhaHash).toLowerCase();
    if (!normalizedUser || !normalizedHash) return false;

    await Promise.all(
        loginCacheKeys(normalizedUser, normalizedHash)
            .map((key) => setJsonCache(key, normalizeUser(user))),
    );
    return true;
}

async function findFirstCacheHit(keys, getter) {
    let lastError = null;
    for (const key of keys) {
        const entry = await getter(key);
        if (entry.hit) return entry;
        if (entry.error) lastError = entry.error;
    }
    return { hit: false, value: null, error: lastError };
}

function loginCacheKeys(usuario, senhaHash) {
    const variants = new Set([normalizeText(usuario), normalizeText(usuario).toUpperCase()]);
    return [...variants].map((login) => createCacheKey('firebird-login', {
        usuario: login,
        senhaHash: normalizeText(senhaHash).toLowerCase(),
    }));
}

function useRedisOnly() {
    const configured = process.env.FIREBIRD_CONNECTION_MODE?.trim().toLowerCase();
    if (configured) return configured === 'redis-only';
    return process.env.VERCEL_ENV === 'production';
}

async function queryDirectFirebird(usuario, senhaHash) {
    const required = ['DB_HOST_FB', 'DB_PORT_FB', 'DB_PATH_FB', 'DB_USER_FB', 'DB_PASSWORD_FB'];
    if (required.some((name) => !process.env[name])) {
        throw new LoginError('A conexão direta com o Firebird não está configurada.', 500);
    }

    const Firebird = require('node-firebird');
    const database = await attach(Firebird);
    try {
        return await query(database, `
            SELECT
                IDFUNCIONARIO AS ID_FUNCIONARIO,
                NOMEFUNCIONARIO AS NOME_FUNCIONARIO,
                CATEGORIA,
                IDFILIAL AS ID_FILIAL
            FROM FUNCIONARIO
            WHERE LOGIN = ?
              AND SENHAWEB = ?
              AND STATUS = 'A'
              AND CATEGORIA IN ('GR','SU','VD','DI')
        `, [usuario, senhaHash]);
    } finally {
        database.detach();
    }
}

function attach(Firebird) {
    return new Promise((resolve, reject) => {
        Firebird.attach({
            host: process.env.DB_HOST_FB,
            port: Number(process.env.DB_PORT_FB),
            database: process.env.DB_PATH_FB,
            user: process.env.DB_USER_FB,
            password: process.env.DB_PASSWORD_FB,
            lowercase_keys: false,
            pageSize: 4096,
        }, (error, database) => (error ? reject(error) : resolve(database)));
    });
}

function query(database, sql, params) {
    return new Promise((resolve, reject) => {
        database.query(sql, params, (error, rows) => {
            if (error) return reject(error);
            return resolve(rows ?? []);
        });
    });
}

function hashPassword(senha) {
    const normalized = normalizeText(senha);
    if (!normalized) return '';
    return crypto.createHash('md5').update(normalized).digest('hex').toLowerCase();
}

function normalizeUser(user) {
    return {
        idfuncionario: normalizeValue(user?.idfuncionario).toUpperCase(),
        nomefuncionario: normalizeValue(user?.nomefuncionario),
        categoria: normalizeValue(user?.categoria).toUpperCase(),
        idfilial: normalizeValue(user?.idfilial).toUpperCase(),
    };
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

export class LoginError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}
