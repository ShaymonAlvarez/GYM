// Minimal zero-dependency static file server for Render Web Service deployment.
// Serves the Vite `dist/` build with SPA fallback to index.html so that any
// route (and auth redirects landing on `/`) always resolves to the app shell.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, headers);
  res.end(body);
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    let filePath = normalize(join(DIST, pathname));

    // Block path traversal outside dist
    if (!filePath.startsWith(DIST)) {
      return send(res, 403, 'Forbidden');
    }

    let info = null;
    try {
      info = await stat(filePath);
    } catch {
      info = null;
    }

    if (info && info.isDirectory()) {
      filePath = join(filePath, 'index.html');
      try {
        info = await stat(filePath);
      } catch {
        info = null;
      }
    }

    // SPA fallback: any unmatched route serves the app shell.
    // The browser keeps the hash (#access_token=...) client-side, so auth works.
    if (!info) {
      filePath = join(DIST, 'index.html');
    }

    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    const isHashedAsset = filePath.includes(`${join(DIST, 'assets')}`);
    send(res, 200, data, {
      'Content-Type': type,
      // Long cache for fingerprinted assets, no-cache for the HTML shell + SW.
      'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
  } catch {
    send(res, 500, 'Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`Static server listening on port ${PORT}`);
});
