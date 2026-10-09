import { getRedis, normalizeEmail, makeToken, clientIp, hashIp } from '../lib/common.js';

const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 600;

async function notifyOwner({ email, createdAt, total, unique }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: process.env.NOTIFY_EMAIL,
      subject: `New POP POP download: ${email} (#${total})`,
      text: `Email: ${email}\nTime: ${createdAt}\nTotal downloads: ${total}\nUnique emails: ${unique}\n`
    })
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid body' });

  if (typeof body.website === 'string' && body.website !== '') {
    return res.status(200).json({ downloadUrl: '#' });
  }

  const email = normalizeEmail(body.email);
  if (!email) return res.status(400).json({ error: 'invalid email' });

  const redis = getRedis();
  const ipHash = hashIp(clientIp(req));

  const rlKey = `rl:${ipHash}`;
  const hits = await redis.incr(rlKey);
  if (hits === 1) await redis.expire(rlKey, RATE_WINDOW_SECONDS);
  if (hits > RATE_LIMIT) return res.status(429).json({ error: 'too many requests' });

  const createdAt = new Date().toISOString();
  const total = await redis.incr('downloads:total');
  await redis.rpush('downloads', JSON.stringify({ email, createdAt, ipHash }));
  await redis.sadd('downloads:emails', email);
  const unique = await redis.scard('downloads:emails');

  try {
    await notifyOwner({ email, createdAt, total, unique });
  } catch (err) {
    console.error('owner notification failed:', err.message);
  }

  return res.status(200).json({ downloadUrl: `/api/script?t=${makeToken()}` });
}
