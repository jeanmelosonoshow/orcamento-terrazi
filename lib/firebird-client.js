import { createRequire } from 'module';
import {
    charsetsParaConsultaFirebird,
    criarErroCharsetFirebird,
    erroConversaoCharsetFirebird,
    normalizarCharsetFirebird
} from './firebird-charset.js';

const require = createRequire(import.meta.url);
const Firebird = require('node-firebird');
const POOL_STATE_KEY = Symbol.for('terrazi.firebird.pool');
const CHARSET_PRINCIPAL = normalizarCharsetFirebird(process.env.DB_CHARSET_FB, 'UTF8');
const CHARSET_ALTERNATIVO = normalizarCharsetFirebird(process.env.DB_CHARSET_FB_FALLBACK, 'NONE');

function numeroAmbiente(nome, fallback, minimo = 1, maximo = Number.MAX_SAFE_INTEGER) {
    const valor = Number(process.env[nome]);
    if (!Number.isFinite(valor)) return fallback;
    return Math.min(maximo, Math.max(minimo, Math.trunc(valor)));
}

const POOL_SIZE = numeroAmbiente('FB_POOL_SIZE', 3, 1, 10);
const CONNECT_RETRIES = numeroAmbiente('FB_CONNECT_RETRIES', 2, 0, 5);
const CONNECT_TIMEOUT_MS = numeroAmbiente('FB_CONNECT_TIMEOUT_MS', 10000, 1000, 30000);
const ACQUIRE_TIMEOUT_MS = numeroAmbiente('FB_ACQUIRE_TIMEOUT_MS', 12000, 1000, 60000);
const QUERY_TIMEOUT_MS = numeroAmbiente('FB_QUERY_TIMEOUT_MS', 15000, 1000, 120000);

export function getFirebirdOptions(encoding = CHARSET_PRINCIPAL) {
    return {
        host: process.env.DB_HOST_FB,
        port: Number(process.env.DB_PORT_FB || 3050),
        database: process.env.DB_PATH_FB,
        user: process.env.DB_USER_FB,
        password: process.env.DB_PASSWORD_FB,
        lowercase_keys: false,
        pageSize: 4096,
        encoding: normalizarCharsetFirebird(encoding, CHARSET_PRINCIPAL),
        retryConnectionInterval: 1000,
        connectTimeout: CONNECT_TIMEOUT_MS,
        enableKeepAlive: true,
        keepAliveInitialDelay: 30000,
        idleTimeoutMillis: numeroAmbiente('FB_POOL_IDLE_MS', 30000, 5000, 300000),
        maxLifetimeMillis: numeroAmbiente('FB_POOL_LIFETIME_MS', 900000, 60000, 3600000),
        maxUses: numeroAmbiente('FB_POOL_MAX_USES', 1000, 10, 10000)
    };
}

function resumirErro(error) {
    return {
        message: String(error?.message || error || 'Erro desconhecido'),
        code: error?.code || null,
        gdscode: error?.gdscode || null
    };
}

function erroNaoTransitorio(error) {
    const mensagem = String(error?.message || '').toLowerCase();
    const codigo = Number(error?.gdscode);
    const codigosConfiguracao = new Set([
        335544472,
        335545064,
        335545065,
        335545066,
        335545067,
        335545069,
        335545070
    ]);
    return codigosConfiguracao.has(codigo)
        || /wire encryption|wirecrypt|unsupported plugin|no matching plugins|database file.*not found|invalid database|missing.*plugin/.test(mensagem);
}

function aguardar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function obterPool(encoding = CHARSET_PRINCIPAL) {
    const charset = normalizarCharsetFirebird(encoding, CHARSET_PRINCIPAL);
    const chave = charset === CHARSET_PRINCIPAL
        ? POOL_STATE_KEY
        : Symbol.for(`terrazi.firebird.pool.charset.${charset}`);
    if (!globalThis[chave]) {
        const pool = Firebird.pool(POOL_SIZE, getFirebirdOptions(charset));
        if (typeof pool.on === 'function') {
            pool.on('error', error => {
                console.error('[firebird] erro em conexao ociosa', resumirErro(error));
            });
        }
        globalThis[chave] = pool;
    }
    return globalThis[chave];
}

function adquirirConexao(pool) {
    const inicio = Date.now();
    return new Promise((resolve, reject) => {
        let concluido = false;
        const timeout = setTimeout(() => {
            if (concluido) return;
            concluido = true;
            const error = new Error('Tempo limite aguardando uma conexao livre do Firebird.');
            error.code = 'FB_ACQUIRE_TIMEOUT';
            error.waitedMs = Date.now() - inicio;
            reject(error);
        }, ACQUIRE_TIMEOUT_MS);

        pool.get((error, db) => {
            if (concluido) {
                try { if (db) db.detach(); } catch (detachError) {}
                return;
            }
            concluido = true;
            clearTimeout(timeout);
            if (error) return reject(error);
            db.__terraziAcquireWaitMs = Date.now() - inicio;
            resolve(db);
        });
    });
}

async function adquirirComRetentativa(pool, operacao) {
    let ultimoErro;
    for (let tentativa = 0; tentativa <= CONNECT_RETRIES; tentativa += 1) {
        try {
            return await adquirirConexao(pool);
        } catch (error) {
            ultimoErro = error;
            console.error('[firebird] falha ao obter conexao', {
                operacao,
                tentativa: tentativa + 1,
                ...resumirErro(error)
            });
            if (tentativa >= CONNECT_RETRIES || erroNaoTransitorio(error) || error?.code === 'FB_ACQUIRE_TIMEOUT') break;
            await aguardar(300 * (2 ** tentativa) + Math.floor(Math.random() * 180));
        }
    }
    ultimoErro.isFirebirdConnectionError = true;
    throw ultimoErro;
}

function consultar(db, sql, params, timeoutMs) {
    return new Promise((resolve, reject) => {
        let concluido = false;
        const timeout = setTimeout(() => {
            if (concluido) return;
            concluido = true;
            const error = new Error('Tempo limite ao executar consulta no Firebird.');
            error.code = 'FB_QUERY_TIMEOUT';
            reject(error);
        }, timeoutMs);

        db.query(sql, params, (error, result) => {
            clearTimeout(timeout);
            if (concluido) return;
            concluido = true;
            if (error) return reject(error);
            resolve(Array.isArray(result) ? result : []);
        });
    });
}

function erroExigeDescarteConexao(error) {
    const mensagem = String(error?.message || '').toLowerCase();
    return error?.code === 'FB_QUERY_TIMEOUT'
        || /connection.*(?:closed|lost|reset)|socket|broken pipe|read econnreset|write epipe/.test(mensagem);
}

function liberarConexao(db, descartar = false) {
    if (!db) return;
    if (descartar && db.connection) db.connection._pooled = false;
    db.detach();
}

async function executarConsultaNoCharset(sql, params, opcoes, charset) {
    const pool = obterPool(charset);
    const operacao = String(opcoes.operacao || 'consulta');
    const timeoutMs = Number(opcoes.timeoutMs) || QUERY_TIMEOUT_MS;
    const db = await adquirirComRetentativa(pool, operacao);

    let descartarConexao = false;
    try {
        const linhas = await consultar(db, sql, params, timeoutMs);
        return Number.isFinite(opcoes.limite) ? linhas.slice(0, opcoes.limite) : linhas;
    } catch (error) {
        descartarConexao = erroExigeDescarteConexao(error);
        throw error;
    } finally {
        try { liberarConexao(db, descartarConexao); } catch (detachError) {
            console.error('[firebird] falha ao liberar conexao', {
                operacao,
                descartada: descartarConexao,
                ...resumirErro(detachError)
            });
        }
    }
}

export async function executarConsultaFirebird(sql, params = [], opcoes = {}) {
    const operacao = String(opcoes.operacao || 'consulta');
    const charsets = charsetsParaConsultaFirebird(
        CHARSET_PRINCIPAL,
        CHARSET_ALTERNATIVO,
        opcoes.permitirFallbackCharset === true
    );
    let ultimoErro;

    for (let indice = 0; indice < charsets.length; indice += 1) {
        const charset = charsets[indice];
        try {
            return await executarConsultaNoCharset(sql, params, opcoes, charset);
        } catch (error) {
            ultimoErro = error;
            console.error('[firebird] falha na consulta', {
                operacao,
                charset,
                ...resumirErro(error)
            });
            const possuiAlternativo = indice < charsets.length - 1;
            if (!possuiAlternativo || !erroConversaoCharsetFirebird(error)) break;
            console.warn('[firebird] repetindo consulta com charset alternativo', {
                operacao,
                charsetPrincipal: charset,
                charsetAlternativo: charsets[indice + 1]
            });
        }
    }

    if (erroConversaoCharsetFirebird(ultimoErro)) {
        throw criarErroCharsetFirebird(ultimoErro, charsets);
    }
    throw ultimoErro;
}

export function statusHttpErroFirebird(error) {
    if (error?.code === 'FB_ACQUIRE_TIMEOUT') return 503;
    if (error?.code === 'FB_CONNECT_TIMEOUT' || error?.code === 'FB_QUERY_TIMEOUT') return 504;
    if (error?.isFirebirdConnectionError) return 503;
    return 500;
}
