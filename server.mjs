// MEGA-CV dev server: static files + a same-origin fetch proxy for the Web Page video module.
// Usage: node server.mjs [port]      (no dependencies, Node 18+)
// The proxy exists because browsers cannot read other sites' HTML/images directly (CORS).
// It only listens on localhost and only answers requests made by this app's own pages.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.argv[2] || +process.env.PORT || 8931;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };

async function proxy(req, res, target) {
  if (!/^https?:\/\//i.test(target || '')) { res.writeHead(400, { 'x-mega-proxy': '1' }).end('Bad url'); return; }
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') { res.writeHead(403).end('Forbidden'); return; }
  const headers = { 'user-agent': 'Mozilla/5.0 (compatible; mega-cv)', accept: '*/*' };
  if (req.headers.range) headers.range = req.headers.range;
  try {
    const r = await fetch(target, { headers, redirect: 'follow', signal: AbortSignal.timeout(25000) });
    const out = { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'x-mega-proxy': '1', 'x-final-url': r.url, 'cache-control': 'no-store' };
    for (const h of ['content-range', 'accept-ranges']) if (r.headers.get(h)) out[h] = r.headers.get(h);
    if (!r.headers.get('content-encoding') && r.headers.get('content-length')) out['content-length'] = r.headers.get('content-length');
    res.writeHead(r.status, out);
    if (r.body) Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res); else res.end();
  } catch (e) {
    res.writeHead(502, { 'x-mega-proxy': '1', 'content-type': 'text/plain' }).end('Fetch failed: ' + e.message);
  }
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/proxy') return proxy(req, res, u.searchParams.get('url'));
  const file = path.join(ROOT, path.normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, ''), u.pathname.endsWith('/') ? 'index.html' : '');
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}.git`)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }).end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(PORT, '127.0.0.1', () => console.log(`MEGA-CV running at http://localhost:${PORT}`));
