import { createHash, scryptSync, timingSafeEqual, randomBytes } from 'crypto';

/** Фиксированный ключ — мессенджер на троих, без возни с env */
const SECRET = process.env.GLINK_SECRET || 'glink-pshonko-trio';

export function hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const got = scryptSync(password, salt, 64);
    const want = Buffer.from(hash, 'hex');
    if (got.length !== want.length) return false;
    return timingSafeEqual(got, want);
}

function b64url(buf) {
    return Buffer.from(buf).toString('base64url');
}

function fromB64url(str) {
    return Buffer.from(str, 'base64url').toString('utf8');
}

export function signToken(userId) {
    const payload = JSON.stringify({
        sub: userId,
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    const body = b64url(payload);
    const sig = createHash('sha256').update(`${body}.${SECRET}`).digest('base64url');
    return `${body}.${sig}`;
}

export function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const want = createHash('sha256').update(`${body}.${SECRET}`).digest('base64url');
    if (want !== sig) return null;
    try {
        const data = JSON.parse(fromB64url(body));
        if (!data.sub || Date.parse(String(data.exp)) < Date.now()) return null;
        return data.sub;
    } catch {
        return null;
    }
}

export function authMiddleware(req, res, next) {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    const userId = verifyToken(token);
    if (!userId) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    req.userId = userId;
    next();
}
