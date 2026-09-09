const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const SESSION_MS = 1000 * 60 * 60 * 24 * 180; // 180 days

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const expectedName = (process.env.AUTH_NAME || '').trim().toLowerCase();
  const expectedPin = (process.env.AUTH_PIN || '').trim();

  if (!expectedName || !expectedPin) {
    res.status(500).json({ error: 'Server auth is not configured yet. Set AUTH_NAME and AUTH_PIN in Vercel.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { name, pin } = body || {};
  const gotName = (name || '').trim().toLowerCase();
  const gotPin = (pin || '').trim();

  if (!gotName || !gotPin || !safeEqual(gotName, expectedName) || !safeEqual(gotPin, expectedPin)) {
    res.status(401).json({ error: 'Incorrect name or PIN.' });
    return;
  }

  res.status(200).json({ ok: true, name, expiresAt: Date.now() + SESSION_MS });
};
