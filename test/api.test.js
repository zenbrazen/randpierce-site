import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DOWNLOAD_SECRET = 'test-secret';
process.env.ADMIN_TOKEN = 'admin-secret';

const { normalizeEmail, makeToken, verifyToken } = await import('../lib/common.js');
const script = (await import('../api/script.js')).default;
const exportCsv = (await import('../api/export.js')).default;
const download = (await import('../api/download.js')).default;

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

test('normalizeEmail', () => {
  assert.equal(normalizeEmail('  Foo@Example.COM '), 'foo@example.com');
  assert.equal(normalizeEmail('nope'), null);
  assert.equal(normalizeEmail(42), null);
  assert.equal(normalizeEmail('a@b.co'.padStart(260, 'x')), null);
});

test('token verifies, expires, and rejects tampering', () => {
  const t = makeToken();
  assert.equal(verifyToken(t), true);
  assert.equal(verifyToken(t, Date.now() + 16 * 60 * 1000), false);
  const [p, s] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${s}`), false);
  assert.equal(verifyToken(`${p}.x`), false);
  assert.equal(verifyToken('garbage'), false);
  assert.equal(verifyToken(undefined), false);
});

test('script: 403 without a valid token', async () => {
  const res = mockRes();
  await script({ method: 'GET', query: { t: 'bad' } }, res);
  assert.equal(res.statusCode, 403);
});

test('export: 401 without admin token', async () => {
  const res = mockRes();
  await exportCsv({ headers: {} }, res);
  assert.equal(res.statusCode, 401);
  const res2 = mockRes();
  await exportCsv({ headers: { authorization: 'Bearer wrong' } }, res2);
  assert.equal(res2.statusCode, 401);
});

test('download: honeypot pretends success, bad email is 400, GET is 405', async () => {
  let res = mockRes();
  await download({ method: 'POST', body: { email: 'a@b.co', website: 'spam' }, headers: {} }, res);
  assert.deepEqual([res.statusCode, res.body], [200, { downloadUrl: '#' }]);
  res = mockRes();
  await download({ method: 'POST', body: { email: 'bad' }, headers: {} }, res);
  assert.equal(res.statusCode, 400);
  res = mockRes();
  await download({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
});
