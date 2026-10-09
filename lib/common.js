import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

function sign(payload) {
  return createHmac('sha256', process.env.DOWNLOAD_SECRET).update(payload).digest('base64url');
}

export function makeToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: now + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyToken(token, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!safeEqual(sig, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && exp > now;
  } catch {
    return false;
  }
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return (first ? first.split(',')[0] : req.headers['x-real-ip'] || req.socket?.remoteAddress || '').trim();
}

export function hashIp(ip) {
  return createHmac('sha256', process.env.DOWNLOAD_SECRET).update(`ip:${ip}`).digest('hex');
}
