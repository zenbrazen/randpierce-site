import { normalizeEmail, makeToken, clientIp, hashIp } from '../lib/common.js';

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
// Best-effort only: lives in one serverless instance's memory and resets on a cold start.
const hits = new Map();

function rateLimited(key, now = Date.now()) {
  const recent = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT;
}

async function notifyOwner({ email, createdAt }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: process.env.NOTIFY_EMAIL,
      subject: `New POP POP download: ${email}`,
      text: `Email: ${email}\nTime: ${createdAt}\n`
    })
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (!process.env.DOWNLOAD_SECRET) {
    console.error('DOWNLOAD_SECRET is not set; add it in Vercel and redeploy');
    return res.status(500).json({ error: 'server not configured' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid body' });

  if (typeof body.website === 'string' && body.website !== '') {
    return res.status(200).json({ downloadUrl: '#' });
  }

  const email = normalizeEmail(body.email);
  if (!email) return res.status(400).json({ error: 'invalid email' });

  if (rateLimited(hashIp(clientIp(req)))) return res.status(429).json({ error: 'too many requests' });

  const createdAt = new Date().toISOString();
  try {
    await notifyOwner({ email, createdAt });
  } catch (err) {
    console.error('owner notification failed:', err.message);
  }

  return res.status(200).json({ downloadUrl: `/api/script?t=${makeToken()}` });
}
