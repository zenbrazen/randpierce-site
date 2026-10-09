import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DOWNLOAD_SECRET = 'test-secret';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_EMAIL = 'owner@example.com';
process.env.MAIL_FROM = 'POP POP <onboarding@resend.dev>';

const { normalizeEmail, makeToken, verifyToken } = await import('../lib/common.js');
const script = (await import('../api/script.js')).default;
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

function post(email, ip = '1.1.1.1') {
  return { method: 'POST', body: { email, website: '' }, headers: { 'x-forwarded-for': ip } };
}

test('download: success emails the owner and returns a working link', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true }; };
  const res = mockRes();
  await download(post('  Reader@Example.com '), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.downloadUrl, /^\/api\/script\?t=/);
  assert.equal(verifyToken(res.body.downloadUrl.split('t=')[1]), true);
  assert.equal(calls.length, 1);
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.to, 'owner@example.com');
  assert.match(sent.subject, /reader@example\.com/);
});

test('download: still returns the link when the email service fails', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  const res = mockRes();
  await download(post('a@b.co', '2.2.2.2'), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.downloadUrl, /^\/api\/script\?t=/);
});

test('download: sixth request from one IP in the window gets 429', async () => {
  globalThis.fetch = async () => ({ ok: true });
  let last;
  for (let i = 0; i < 6; i++) { last = mockRes(); await download(post('a@b.co', '3.3.3.3'), last); }
  assert.equal(last.statusCode, 429);
  const other = mockRes();
  await download(post('a@b.co', '4.4.4.4'), other);
  assert.equal(other.statusCode, 200);
});

test('download: 500 with a clear error when DOWNLOAD_SECRET is missing', async () => {
  const saved = process.env.DOWNLOAD_SECRET;
  delete process.env.DOWNLOAD_SECRET;
  const res = mockRes();
  await download(post('a@b.co', '5.5.5.5'), res);
  process.env.DOWNLOAD_SECRET = saved;
  assert.equal(res.statusCode, 500);
});
