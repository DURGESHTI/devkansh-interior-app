const crypto = require('crypto');

const COOKIE = 'dv_session';
const SESSION_TTL = 8 * 60 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not configured.');
  return s;
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function createSession(username) {
  const payload = b64url(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }));
  return `${payload}.${sign(payload)}`;
}

function verifySession(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return !!data && data.exp > Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  return Object.fromEntries(raw.split(';').map(x => x.trim()).filter(Boolean).map(x => {
    const i = x.indexOf('=');
    return i < 0 ? [x, ''] : [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
  }));
}

function isAdmin(req) {
  return verifySession(parseCookies(req)[COOKIE]);
}

function setSession(res, username) {
  const token = createSession(username);
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function unauthorized(res) {
  res.status(401).json({ error: 'Admin authentication required.' });
}

function getCredentials() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are not configured.');
  return { username, password };
}

module.exports = { isAdmin, setSession, clearSession, unauthorized, getCredentials };
