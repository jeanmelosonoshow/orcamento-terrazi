import crypto from 'node:crypto';

const DEFAULT_CACHE_TTL_SECONDS = 60 * 60;
const DEFAULT_STALE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_REDIS_TIMEOUT_MS = 1500;

export function hasRedisConfig() {
    return Boolean(getRedisConfig());
}

export function createCacheKey(scope, payload) {
    const hash = crypto
        .createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');
    return `${cachePrefix()}:${scope}:${hash}`;
}

export async function getJsonCacheEntry(key) {
    const config = getRedisConfig();
    if (!config) return { hit: false, value: null, error: 'missing-config' };

    try {
        const response = await redisCommand(config, ['GET', key]);
        if (response.result == null) return { hit: false, value: null, error: null };
        return { hit: true, value: JSON.parse(response.result), error: null };
    } catch (error) {
        console.error('Falha ao ler cache Redis:', error);
        return { hit: false, value: null, error };
    }
}

export function getStaleJsonCacheEntry(key) {
    return getJsonCacheEntry(`${key}:stale`);
}

export async function setJsonCache(key, value) {
    const config = getRedisConfig();
    if (!config) return false;

    const serialized = JSON.stringify(value);
    await redisCommand(config, [
        'SET', key, serialized, 'EX', String(cacheTtlSeconds()),
    ]);

    if (staleCacheTtlSeconds() > cacheTtlSeconds()) {
        await redisCommand(config, [
            'SET', `${key}:stale`, serialized, 'EX', String(staleCacheTtlSeconds()),
        ]);
    }
    return true;
}

function getRedisConfig() {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    return { url: url.replace(/\/$/, ''), token };
}

async function redisCommand(config, command) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), redisTimeoutMs());
    let response;

    try {
        response = await fetch(config.url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(command),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw new Error(`Redis respondeu com status ${response.status}`);
    }
    return response.json();
}

function cachePrefix() {
    return process.env.REDIS_CACHE_PREFIX?.trim() || 'orcamento-terrazi';
}

function cacheTtlSeconds() {
    return positiveInteger(process.env.FIREBIRD_CACHE_TTL_SECONDS, DEFAULT_CACHE_TTL_SECONDS);
}

function staleCacheTtlSeconds() {
    return positiveInteger(
        process.env.FIREBIRD_STALE_CACHE_TTL_SECONDS,
        DEFAULT_STALE_CACHE_TTL_SECONDS,
    );
}

function redisTimeoutMs() {
    return positiveInteger(process.env.REDIS_CACHE_TIMEOUT_MS, DEFAULT_REDIS_TIMEOUT_MS);
}

function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}
