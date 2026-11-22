import http from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaults, validateConfig } from './config.js';
import { Companion } from './bot.js';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.DATA_DIR || './data');
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 16 || password.includes('replace-this')) {
  console.error('Set ADMIN_PASSWORD to a unique password of at least 16 characters. See .env.example.');
  process.exit(1);
}
await mkdir(dataDir, { recursive: true, mode: 0o700 });
let config = { ...defaults };
try { config = validateConfig(JSON.parse(await readFile(`${dataDir}/config.json`, 'utf8'))); }
catch (e) { if (e.code !== 'ENOENT') { console.error('Cannot load saved configuration:', e.message); process.exit(1); } }
const companion = new Companion(config, dataDir);
const sessions = new Map(), attempts = new Map();
const digest = x => createHash('sha256').update(String(x)).digest();
const passwordHash = digest(password);
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 16384) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  try { return JSON.parse(text || '{}'); } catch { throw new Error('Invalid JSON'); }
}
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, expiry] of sessions) if (expiry < now) sessions.delete(key);
  for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
}, 60000);
cleanup.unref();

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const path = new URL(req.url, 'http://local').pathname;
    if (req.method === 'GET' && path === '/healthz') return send(res, 200, { ok: true });
    const files = { '/': ['index.html', 'text/html'], '/ui.js': ['ui.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
    if (req.method === 'GET' && Object.hasOwn(files, path)) {
      const [file, type] = files[path];
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      return res.end(await readFile(`${root}/public/${file}`));
    }
    if (!path.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    if (req.method === 'POST' && !String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'JSON is required' });
    if (req.method === 'POST' && path === '/api/login') {
      const ip = req.socket.remoteAddress || 'unknown', now = Date.now();
      let entry = attempts.get(ip);
      if (!entry || entry.until < now) { entry = { count: 0, until: now + 15 * 60000 }; attempts.set(ip, entry); }
      if (++entry.count > 10) return send(res, 429, { error: 'Too many login attempts. Wait 15 minutes.' });
      const input = await body(req);
      if (!timingSafeEqual(passwordHash, digest(input.password))) return send(res, 401, { error: 'Incorrect password' });
      if (sessions.size >= 100) return send(res, 429, { error: 'Too many active sessions. Try again later.' });
      const token = randomBytes(32).toString('hex'); sessions.set(token, now + 12 * 60 * 60000); attempts.delete(ip);
      return send(res, 200, { token });
    }
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token || (sessions.get(token) || 0) < Date.now()) return send(res, 401, { error: 'Sign in to continue' });
    if (req.method === 'GET' && path === '/api/state') return send(res, 200, { ...companion.snapshot(), config: companion.config });
    if (req.method === 'POST' && path === '/api/logout') { sessions.delete(token); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && path === '/api/config') {
      if (companion.bot || companion.desired) return send(res, 409, { error: 'Stop the bot and wait until stopped before changing settings' });
      const next = validateConfig(await body(req));
      await writeFile(`${dataDir}/config.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
      await rename(`${dataDir}/config.tmp`, `${dataDir}/config.json`);
      companion.config = next;
      companion.log('info', 'Configuration saved');
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && path === '/api/start') { companion.start(); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && path === '/api/stop') { companion.stop(); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && path === '/api/command') {
      const input = await body(req);
      if (typeof input.command !== 'string' || !input.command.trim() || input.command.length > 240) throw new Error('Enter a command (1–240 characters)');
      companion.execute(input.command)
        .then(result => companion.log('success', result))
        .catch(e => companion.log('error', e.message));
      return send(res, 202, { ok: true, message: 'Submitted. See the activity log for the result.' });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (e) { if (!res.headersSent) send(res, e.status || 400, { error: e.message }); else res.end(); }
});
server.requestTimeout = 20000; server.headersTimeout = 15000;
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => {
  console.log(`Blockmate dashboard listening on port ${server.address().port}. Use HTTPS before exposing it publicly.`);
  if (companion.config.autostart) {
    try { companion.start(); } catch (e) { companion.log('error', e.message); }
  }
});
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return; shuttingDown = true;
  companion.stop(); server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
