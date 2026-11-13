// Shared by the API functions. Files starting with "_" are not deployed as
// endpoints by Vercel.
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Signing key for session tokens. SESSION_SECRET is optional; without it the
// key is derived from the login credentials, so changing the PIN also
// invalidates every existing session.
function signingKey() {
  const secret = process.env.SESSION_SECRET
    || `${process.env.AUTH_NAME || ''}:${process.env.AUTH_PIN || ''}`;
  return crypto.createHash('sha256').update('fd-session:' + secret).digest();
}

function sign(expiresAt) {
  return crypto.createHmac('sha256', signingKey()).update(String(expiresAt)).digest('hex');
}

// Token format: "<expiresAt ms>.<hmac hex>"
function createToken(expiresAt) {
  return `${expiresAt}.${sign(expiresAt)}`;
}

function verifyToken(token) {
  if (!process.env.AUTH_NAME || !process.env.AUTH_PIN) return false;
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const expiresAt = Number(token.slice(0, dot));
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  return safeEqual(token.slice(dot + 1), sign(expiresAt));
}

module.exports = { safeEqual, createToken, verifyToken };
