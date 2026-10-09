import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { verifyToken } from '../lib/common.js';

const PDF_PATH = path.join(process.cwd(), 'private', 'POP-POP.pdf');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const t = Array.isArray(req.query.t) ? req.query.t[0] : req.query.t;
  if (!verifyToken(t)) return res.status(403).json({ error: 'link expired or invalid' });

  const { size } = await stat(PDF_PATH);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', size);
  res.setHeader('Content-Disposition', 'attachment; filename="POP POP - Rand Pierce.pdf"');
  res.setHeader('Cache-Control', 'private, no-store');
  createReadStream(PDF_PATH).pipe(res);
}
