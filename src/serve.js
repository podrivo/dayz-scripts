// Tiny static preview server for dist/ with clean-URL resolution.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { DIST_DIR } from './util.js';

const PORT = process.env.PORT || 8817;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(DIST_DIR, p);
    if (p.endsWith('/')) file = path.join(file, 'index.html');
    else if (!path.extname(file) && fs.existsSync(path.join(file, 'index.html'))) {
      res.writeHead(301, { location: p + '/' });
      return res.end();
    }
    if (!fs.existsSync(file)) {
      file = path.join(DIST_DIR, '404.html');
      res.statusCode = 404;
    }
    res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`Serving dist/ at http://localhost:${PORT}`));
