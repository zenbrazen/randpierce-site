import { getRedis, safeEqual } from '../lib/common.js';

// Stops spreadsheet apps from running a cell that starts with = + - @ as a formula.
function csvCell(value) {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  const expected = `Bearer ${process.env.ADMIN_TOKEN}`;
  if (!process.env.ADMIN_TOKEN || !safeEqual(auth, expected)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const redis = getRedis();
  const [rows, total, unique] = await Promise.all([
    redis.lrange('downloads', 0, -1),
    redis.get('downloads:total'),
    redis.scard('downloads:emails')
  ]);

  const lines = [
    `# total downloads,${total || 0}`,
    `# unique emails,${unique || 0}`,
    'email,createdAt,ipHash'
  ];
  for (const row of rows) {
    const r = typeof row === 'string' ? JSON.parse(row) : row;
    lines.push([r.email, r.createdAt, r.ipHash].map(csvCell).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="pop-pop-downloads.csv"');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(lines.join('\n') + '\n');
}
