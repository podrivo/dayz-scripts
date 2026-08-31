// Tiny static preview server for dist/ with clean-URL resolution. This is what
// `npm run preview` serves, for checking what a real build produced —
// hard links, redirects, the sitemap. Developing against the pages themselves
// is src/dev.js, which needs no dist/ at all.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { DATA_DIR, DIST_DIR, ROOT } from './util.js';
import { sendWorkshop } from './workshop.js';

const PORT = process.env.PORT || 3000;

/**
 * Offer to run a missing prerequisite. A single choice is a [Y/n] confirm,
 * several are numbered with the first as the default. Unattended runs never
 * prompt: they print the default command and exit.
 */
async function offer(reason, choices) {
  const commands = choices.map(([, command]) => command);
  if (!process.stdin.isTTY) {
    console.error(`${reason} Run \`${commands[0]}\` first.`);
    process.exit(1);
  }
  const question =
    choices.length === 1
      ? `${reason} Run \`${commands[0]}\` now? [Y/n] `
      : `${reason} What should I run?\n` +
        choices.map(([label, command], i) => `  ${i + 1}) ${label} — \`${command}\`\n`).join('') +
        `Choose 1-${choices.length}, or n to cancel [1] `;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+C/Ctrl+D reject the question; a stdin that ends never settles it at all.
  const answer = (await Promise.race([
    rl.question(question),
    new Promise((resolve) => rl.once('close', () => resolve('n'))),
  ]).catch(() => 'n'))
    .trim()
    .toLowerCase();
  rl.close();

  let command;
  if (choices.length === 1) {
    if (!['', 'y', 'yes'].includes(answer)) process.exit(1);
    command = commands[0];
  } else {
    const pick = answer === '' ? 1 : Number(answer);
    if (!Number.isInteger(pick) || pick < 1 || pick > choices.length) process.exit(1);
    command = commands[pick - 1];
  }

  const [bin, ...args] = command.split(' ');
  const { status } = spawnSync(bin, args, { cwd: ROOT, stdio: 'inherit' });
  if (status !== 0) process.exit(status ?? 1);
  console.log(); // keep the command's output off whatever prompt comes next
}

// generate/index.js writes sitemap.xml only after every page and hard link is
// in place, and moves any previous tree aside before it starts, so the file is
// there if and only if the build that produced this dist/ ran to completion.
if (!fs.existsSync(path.join(DIST_DIR, 'sitemap.xml'))) {
  const reason = fs.existsSync(DIST_DIR)
    ? 'The dist folder is incomplete — the last generate did not finish.'
    : 'No dist folder to serve.';
  // Without data/ the models have to be fetched and parsed first, so neither
  // generate would get anywhere.
  const choices = fs.existsSync(path.join(DATA_DIR, 'versions.json'))
    ? [
        ['newest build only, seconds', 'pnpm generate:latest'],
        ['every build, minutes', 'pnpm generate'],
      ]
    : [['fetch, parse and render everything', 'pnpm build']];
  await offer(reason, choices);
}

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
  '.tpl': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/api/workshop') return sendWorkshop(res);
  let file = path.join(DIST_DIR, p);
  if (p.endsWith('/')) file = path.join(file, 'index.html');
  else if (!path.extname(file) && fs.existsSync(path.join(file, 'index.html'))) {
    res.writeHead(301, { location: p + '/' });
    return res.end();
  }
  if (!fs.existsSync(file)) {
    const shadowed = path.join(DIST_DIR, '_s', p.slice(1), p.endsWith('/') ? 'index.html' : '');
    if (fs.existsSync(shadowed)) file = shadowed;
    else if (/^\/v\/[^/]+\//.test(p) && p.endsWith('/')) file = path.join(DIST_DIR, 'archive.html');
    else {
      file = path.join(DIST_DIR, '404.html');
      res.statusCode = 404;
    }
  }
  res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
  // files can vanish mid-request while dist/ is being regenerated
  fs.createReadStream(file)
    .on('error', () => {
      res.statusCode = 404;
      res.end('Not found');
    })
    .pipe(res);
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  server.listen(err.port + 1);
});

server.listen(PORT, () => console.log(`Serving dist folder at http://localhost:${server.address().port}`));
