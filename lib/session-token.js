import crypto from 'crypto';

const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function getSecret() {
    return String(process.env.CRM_SESSION_SECRET || process.env.DB_PASSWORD_FB || '');
}

function encode(value) {
    return Buffer.from(value).toString('base64url');
}

function sign(payload) {
    return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createSessionToken(user = {}) {
    if (!getSecret()) throw new Error('CRM_SESSION_SECRET nao configurado.');

    const now = Math.floor(Date.now() / 1000);
    const payload = encode(JSON.stringify({
        sub: String(user.idfuncionario || ''),
        categoria: String(user.categoria || '').trim().toUpperCase(),
        idfilial: String(user.idfilial || '').trim(),
        idvendedor: String(user.idvendedor || '').trim(),
        iat: now,
        exp: now + SESSION_DURATION_SECONDS
    }));

    return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
    if (!token || !getSecret()) return null;
    const [payload, signature] = String(token).split('.');
    if (!payload || !signature) return null;

    const expected = sign(payload);
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (receivedBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) return null;

    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!data.sub || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
        return data;
    } catch (error) {
        return null;
    }
}

export function getRequestSession(req) {
    const authorization = String(req.headers?.authorization || '');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return verifySessionToken(match?.[1]);
}

export function requireRequestSession(req, res) {
    const session = getRequestSession(req);
    if (session) return session;
    res.status(401).json({ error: 'Sessao invalida ou expirada.' });
    return null;
}
