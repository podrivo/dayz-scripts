// Development server: renders one page per request instead of the site.
//
// A full generate is 425k pages, and none of them have to exist to look at
// one. The renderers are pure functions of a build's site model, so this loads
// that model once (~0.4s) and asks src/generate/routes.js for whichever page
// the browser wants, which is a few milliseconds each. dist/ is never touched.
//
// Editing a renderer is picked up by restarting, not by invalidating anything:
// `npm run dev` runs this under `node --watch`, and rebuilding one model costs
// less than the browser's reconnect delay. Every page carries a snippet that
// watches this process's id over SSE and reloads when it changes, so a save
// lands in the browser on its own. See RELOAD below.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { CACHE_DIR, DATA_DIR, ROOT, extractSources, readJson } from './util.js';
import { buildSiteModel } from './generate/model.js';
import { diffModels } from './generate/diff.js';
import { buildHistory } from './generate/history.js';
import { resolve as resolvePage, TOPIC_ALIASES } from './generate/routes.js';
import { render404 } from './generate/render.js';

const PORT = process.env.PORT || 3000;
const SITE_DIR = path.join(ROOT, 'site');
const VERSIONS_FILE = path.join(DATA_DIR, 'versions.json');

const die = (msg, fix) => {
  console.error(`${msg}\nRun \`${fix}\` first.`);
  process.exit(1);
};

if (!fs.existsSync(VERSIONS_FILE)) die('No data/versions.json.', 'npm run fetch');
const { versions, upstreamHead } = readJson(VERSIONS_FILE);
const latest = versions[0];
const modelFile = (v) => path.join(DATA_DIR, `model-${v.label}.json`);
if (!fs.existsSync(modelFile(latest))) die(`No parsed model for ${latest.build}.`, 'npm run parse');

// ---- site models ----------------------------------------------------------
// One per build, built on first use. Only the latest is loaded up front; the
// rest arrive if someone actually browses to /v/<build>/.
const models = new Map();

function siteFor(label, { sources = true } = {}) {
  if (models.has(label)) {
    const cached = models.get(label);
    if (sources && cached) {
      const v = versions.find((x) => x.label === label);
      if (v) try { extractSources(v); } catch { /* no clone */ }
    }
    return cached;
  }
  const v = versions.find((x) => x.label === label);
  if (!v || !fs.existsSync(modelFile(v))) {
    models.set(label, null);
    return null;
  }
  const model = readJson(modelFile(v));
  const site = buildSiteModel(model);
  site.rawFiles = model.files; // per-file decls needed for file pages
  // File pages read the sources off disk; this is a no-op once extracted.
  // History walks every build and does not need the trees.
  if (sources) {
    try {
      extractSources(v);
    } catch {
      // No upstream clone to extract from. Everything but file pages still works.
    }
  }
  models.set(label, site);
  return site;
}

/**
 * The changelog's diff, as a thunk: it needs the previous build's model too,
 * and the point of this server is not to load 49 of them to show one page.
 */
const changesFor = (label) => () => {
  const older = versions[versions.findIndex((v) => v.label === label) + 1];
  const prevSite = older && siteFor(older.label);
  if (!prevSite) return {};
  return { diff: diffModels(siteFor(label), prevSite), prevLabel: prevSite.build };
};

// ---- live reload ----------------------------------------------------------
// The browser cannot see a restart, so it watches for the boot id changing.
// `retry` shortens EventSource's default 3s reconnect to something closer to
// what a restart actually costs.
const BOOT = crypto.randomUUID();
const RELOAD = `<script>
(function(){var boot,es=new EventSource('/__dev/events');
es.onmessage=function(e){if(boot===undefined)boot=e.data;else if(e.data!==boot)location.reload()}})();
</script>`;

function events(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.write(`retry: 250\ndata: ${BOOT}\n\n`);
  // Comment frames only, to keep the connection from going idle.
  const ping = setInterval(() => res.write(': ping\n\n'), 30000);
  res.on('close', () => clearInterval(ping));
}

// ---- static assets --------------------------------------------------------
// Served out of site/ rather than dist/assets/, so editing the stylesheet or
// the client script needs no copy step.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

// The build list the client stamps the chrome from, which the generator writes
// into dist/assets/. Mirrors src/generate/index.js.
const versionsAsset = JSON.stringify(
  versions.map((v) => ({ build: v.build, version: v.version, date: v.date, sha: v.sha }))
);

function historyAsset() {
  const cache = path.join(CACHE_DIR, `history-${upstreamHead || latest.sha}.json`);
  try {
    return fs.readFileSync(cache, 'utf8');
  } catch {
    const json = JSON.stringify(buildHistory(versions, (label) => siteFor(label, { sources: false })));
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cache, json);
    return json;
  }
}

function sendAsset(res, name) {
  if (name === 'versions.json') return send(res, 200, 'application/json', versionsAsset);
  if (name === 'history.json') return send(res, 200, 'application/json', historyAsset());
  // Subpaths are allowed, because /assets/app.js imports /assets/app/*.js, but
  // only ones that stay inside site/: `..` in a URL is a path traversal, and
  // the generator's copy of these files is a flat directory served by Netlify
  // rather than by anything that could be talked out of it.
  const file = path.resolve(SITE_DIR, name);
  const inside = file === SITE_DIR || file.startsWith(SITE_DIR + path.sep);
  if (!name || !inside || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, TYPES['.txt'], 'Not found');
  }
  send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

const withReload = (html) =>
  html.includes('</body>') ? html.replace('</body>', `${RELOAD}</body>`) : html + RELOAD;

/* Where the page you are looking at is written.
   Every page here is a JavaScript function returning a template literal, so
   "view source" in the browser would otherwise leave no trail back to the file
   to edit. This stamps one in, dev-only: a generated page must not carry a byte
   that depends on anything but its content (see layout() in html.js).
   Keyed by URL shape, which is the same map CONTRIBUTING.md carries. */
const RENDERERS = [
  [/^$/, 'render/home.js'],
  [/^topics\//, 'render/topics.js'],
  [/^class\//, 'render/class.js'],
  [/^classes\//, 'render/classes.js'],
  [/^enum\/|^globals\//, 'render/globals.js'],
  [/^files\//, 'render/files.js'],
  [/^hierarchy\//, 'render/hierarchy.js'],
  [/^changelog\//, 'render/changelog.js'],
  [/^community\//, 'render/community.js'],
];

/** Line two of view-source, and after the doctype: a comment ahead of it puts
 *  the browser into quirks mode, which is not a thing to do to a preview. */
function withSource(html, file) {
  const stamp = `<!-- dev · page body: src/generate/${file} · chrome: src/generate/html.js · client: site/app/ -->`;
  const doctype = '<!DOCTYPE html>\n';
  return html.startsWith(doctype) ? `${doctype}${stamp}\n${html.slice(doctype.length)}` : `${html}\n${stamp}`;
}

const rendererFor = (rel) => RENDERERS.find(([re]) => re.test(rel))?.[1] || 'render/';

// ---- request handling -----------------------------------------------------

/**
 * Split a URL path into the build it belongs to and the page within it. The
 * latest build is served from the root and every other from /v/<build>/, the
 * same shape dist/ has.
 */
function locate(pathname) {
  const p = pathname.replace(/^\//, '');
  const m = /^v\/([^/]+)\/(.*)$/.exec(p);
  if (!m) return { label: latest.label, rel: p };
  return { label: m[1], rel: m[2] };
}

function relocated(rel) {
  if (rel === 'annotated/') return 'classes/';
  if (rel === 'changes/' || rel === 'compare/') return 'changelog/';
  if (rel === 'globals/variables/') return 'globals/constants/';
  if (rel.startsWith('fields/')) return `classes/${rel}`;
  for (const a of TOPIC_ALIASES) {
    if (rel.startsWith(`${a}/`)) return `topics/${rel.slice(a.length + 1)}`;
  }
  if (rel.startsWith('file/')) return `files/${rel.slice('file/'.length)}`;
  return null;
}

function handle(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);

  if (pathname === '/__dev/events') return events(res);
  if (pathname.startsWith('/assets/')) return sendAsset(res, pathname.slice('/assets/'.length));
  // Matches the `/v/ / 302` rule the generator writes into dist/_redirects.
  if (pathname === '/v/') {
    res.writeHead(302, { location: '/' });
    return res.end();
  }
  // Clean URLs: every page is a directory, so /class/Foo means /class/Foo/.
  if (!pathname.endsWith('/') && !path.extname(pathname)) {
    res.writeHead(301, { location: `${pathname}/` });
    return res.end();
  }

  const { label, rel } = locate(pathname);
  const dest = relocated(rel);
  if (dest) {
    const prefix = label === latest.label ? '/' : `/v/${label}/`;
    const search = new URL(req.url, 'http://x').search;
    res.writeHead(301, { location: `${prefix}${dest}${search}` });
    return res.end();
  }
  const site = siteFor(label);
  if (!site) return notFound(res, rel);

  const isLatest = label === latest.label;
  const page = resolvePage(site, rel, { isLatest, versions, changes: changesFor(label) });
  if (!page) return notFound(res, rel);

  const body = page.render();
  if (page.asset) return send(res, 200, TYPES[path.extname(page.file)] || TYPES['.txt'], body);
  send(res, 200, TYPES['.html'], withSource(withReload(body), rendererFor(rel)));
}

function notFound(res, rel) {
  const site = siteFor(latest.label);
  const html = render404({ site, versions, base: '/', root: '/', versionPath: '' });
  res.writeHead(404, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' });
  res.end(withSource(withReload(html), 'render/notfound.js'));
  console.log(`  404 /${rel}`);
}

/** A renderer that throws should say so in the browser, not just in the log. */
function fail(res, err) {
  console.error(err);
  const esc = String(err?.stack || err).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  send(res, 500, TYPES['.html'], withReload(
    `<!DOCTYPE html><html><body style="font:14px ui-monospace,monospace;padding:2rem">
<h1>Render failed</h1><pre style="white-space:pre-wrap">${esc}</pre></body></html>`
  ));
}

// Warm the latest build now rather than on the first request, so the cost
// overlaps the browser's reconnect after a restart.
const t0 = Date.now();
siteFor(latest.label);

const server = http.createServer((req, res) => {
  try {
    handle(req, res);
  } catch (err) {
    fail(res, err);
  }
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  server.listen(err.port + 1);
});

server.listen(PORT, () =>
  console.log(`DayZ ${latest.build} ready in ${Date.now() - t0}ms — http://localhost:${server.address().port}`)
);
