// Zero-dependency static file server for local use. Camera access requires http://localhost (a secure context).
// Usage: node server.js [port]

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
// Only the web app itself is served; tooling files and anything hidden stay private.
const BLOCKED = new Set(['server.js', 'start.bat', 'package.json', 'vercel.json']);
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), fullscreen=(self), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy': "frame-ancestors 'none'",
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (urlPath.includes('\0')) return send(res, 400, 'Bad request');
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const segments = urlPath.split(/[\\/]+/).filter(Boolean);
  if (segments.some(s => s.startsWith('.')) || (segments.length === 1 && BLOCKED.has(segments[0]))) {
    return send(res, 404, 'Not found');
  }
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) return send(res, 404, 'Not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Shinobi AR is running at  http://localhost:${PORT}\n  (Ctrl+C to stop)\n`);
});
