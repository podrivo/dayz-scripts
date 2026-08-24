// Static site orchestrator: renders every build of the docs into dist/.
// Latest build lives at the site root; older builds under /v/<build>/.
// Builds are processed oldest -> newest so each diff only needs the
// previous build's site model in memory.
//
// Output is content-addressed. Pages carry no build identity (see
// src/generate/html.js and test/render.test.js), so a page is byte-identical in
// every build where its content did not change — 99% of them between
// consecutive builds. The first copy of a given body is written and every later
// URL with the same body becomes a hard link to it, which is what keeps dist/
// in the hundreds of MB rather than a few GB.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { CACHE_DIR, DATA_DIR, DIST_DIR, ROOT, extractSources, readJson } from '../util.js';
import { buildSiteModel } from './model.js';
import { diffModels } from './diff.js';
import { buildSearchIndex } from './search.js';
import {
  renderHome, renderClassesIndex, renderClassesLetter, renderClass,
  renderEnumsIndex, renderEnum, renderTypedefs, renderConstants,
  renderFunctions, renderFilesIndex, renderFile, renderHierarchy,
  renderChanges, render404,
} from './render.js';

const t0 = Date.now();
const clock = () => process.hrtime.bigint();
const since = (t) => Number(process.hrtime.bigint() - t) / 1e6;
const timers = { teardown: 0, model: 0, render: 0, write: 0, link: 0, sitemap: 0 };

const { versions } = readJson(path.join(DATA_DIR, 'versions.json'));
const limit = process.env.BUILD_VERSIONS ? Number(process.env.BUILD_VERSIONS) : versions.length;
const buildList = versions.slice(0, limit); // newest first

// ---- teardown -------------------------------------------------------------
// Renaming the old tree is O(1); unlinking its ~850k inodes is not. Move it
// aside and let the kernel reclaim it in the background while we render.
{
  const t = clock();
  if (fs.existsSync(DIST_DIR)) {
    // Sibling of dist/ so the rename stays on one filesystem, and outside
    // .cache/ so a half-deleted tree can never be picked up by the CI cache.
    const stale = path.join(ROOT, `.dist-stale-${Date.now()}`);
    fs.renameSync(DIST_DIR, stale);
    spawn('rm', ['-rf', stale], { detached: true, stdio: 'ignore' }).unref();
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });
  timers.teardown = since(t);
}

// ---- content-addressed writer --------------------------------------------
// The first page with a given body is written now; duplicates are queued and
// linked in parallel once every target exists (see linkAll below).
const canonical = new Map(); // content hash -> path of the file holding that body
const linkJobs = []; // flat [file, target, ...]
const sitemapUrls = [];
let pages = 0;
let bytesWritten = 0;

function writeFile(file, body) {
  const t = clock();
  const hash = crypto.createHash('sha1').update(body).digest('hex');
  const first = canonical.get(hash);
  if (first) {
    linkJobs.push(file, first);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
    canonical.set(hash, file);
    bytesWritten += Buffer.byteLength(body);
  }
  timers.write += since(t);
}

/** Create every queued hard link, spread over one worker per core. */
function linkAll() {
  if (!linkJobs.length) return Promise.resolve();
  // One per core. Oversubscribing does not help — measured flat from 10 to 24
  // threads, because the filesystem serialises the metadata updates, not the
  // CPU. LINK_THREADS overrides for tuning on other hardware.
  const threads = Number(process.env.LINK_THREADS) || Math.max(2, os.availableParallelism());
  const pairs = Math.ceil(linkJobs.length / 2 / threads);
  const work = [];
  for (let i = 0; i < linkJobs.length; i += pairs * 2) {
    work.push(linkJobs.slice(i, i + pairs * 2));
  }

  // This phase is ~75% of a full build's wall time and writes no output of its
  // own, so without progress it reads as a hang right after the last build.
  const total = linkJobs.length / 2;
  const tty = process.stdout.isTTY;
  let linked = 0;
  let lastReport = 0;
  const report = () => {
    // redraw once a second on a terminal; every 10% in a log file
    const step = tty ? 1000 : 0;
    const now = Date.now();
    if (linked < total && (tty ? now - lastReport < step : linked - lastReport < total / 10)) return;
    lastReport = tty ? now : linked;
    const line = `  linking ${linked.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} pages (${Math.round((linked / total) * 100)}%)`;
    process.stdout.write(tty ? `\r${line}` : `${line}\n`);
  };

  console.log(`Linking ${total.toLocaleString('en-US')} duplicate pages across ${work.length} threads...`);
  return Promise.all(
    work.map(
      (jobs) =>
        new Promise((resolve, reject) => {
          const w = new Worker(new URL('./linker.js', import.meta.url), { workerData: { jobs } });
          w.on('message', (m) => {
            linked += m.linked;
            report();
            if (m.done !== undefined) resolve(m.done);
          });
          w.on('error', reject);
        })
    )
  ).then((r) => {
    if (tty) process.stdout.write('\n');
    return r;
  });
}

// ---- static assets --------------------------------------------------------
const assetsDir = path.join(DIST_DIR, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'site'))) {
  if (f.startsWith('.')) continue; // .DS_Store and friends must not ship
  fs.copyFileSync(path.join(ROOT, 'site', f), path.join(assetsDir, f));
}
// build list for the client-side version picker (newest first). Also the only
// place the build/version/date of each build now lives, since pages no longer
// carry it; site/app.js reads this to stamp the chrome. The sha is what lets it
// point the "View on GitHub" link at this exact build's commit.
fs.writeFileSync(
  path.join(assetsDir, 'versions.json'),
  JSON.stringify(
    buildList.map((v) => ({
      build: v.build,
      version: v.version,
      date: v.date,
      sha: v.sha,
    }))
  )
);

// Old URLs used the minor version (/v/1.28/); send those to that version's
// newest build (or the site root when it is the latest build overall).
const minorRedirects = [];
{
  const seen = new Set();
  for (const v of buildList) {
    if (seen.has(v.version)) continue;
    seen.add(v.version);
    const target = v.label === buildList[0].label ? '/:splat' : `/v/${v.label}/:splat`;
    minorRedirects.push(`/v/${v.version}/* ${target} 301`);
  }
}

// domain redirects preserved from the previous Doxygen site
fs.writeFileSync(
  path.join(DIST_DIR, '_redirects'),
  [
    'https://dayz.yadz.app/* https://dayz-scripts.yadz.app/:splat 301!',
    'https://dayz-docs.yadz.app/* https://dayz-scripts.yadz.app/:splat 301!',
    '/v/ / 302',
    `/v/${buildList[0].label}/* /:splat 301`,
    ...minorRedirects,
    '',
  ].join('\n')
);
fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /v/\nSitemap: https://dayz-scripts.yadz.app/sitemap.xml\n');

// ---- rendering ------------------------------------------------------------

function renderVersion(site, diff, prevLabel, versionIndex) {
  const isLatest = versionIndex === 0;
  const versionDirRel = isLatest ? '' : `v/${site.label}/`;
  const versionDir = path.join(DIST_DIR, versionDirRel);

  const write = (relDir, html) => {
    writeFile(path.join(versionDir, relDir, 'index.html'), html);
    pages++;
    if (isLatest) sitemapUrls.push(`https://dayz-scripts.yadz.app/${relDir}`);
  };

  const ctx = (relDir) => {
    const depth = relDir === '' ? 0 : relDir.replace(/\/$/, '').split('/').length;
    const base = '../'.repeat(depth);
    const root = base + (isLatest ? '' : '../'.repeat(2));
    return { site, versions, base, root, versionPath: relDir };
  };

  // home
  write('', renderHome(ctx('')));

  // classes index by letter
  const letters = new Map();
  for (const name of [...site.classes.keys()].sort((a, b) => a.localeCompare(b))) {
    const l = /^[a-z]/i.test(name) ? name[0].toLowerCase() : '_';
    if (!letters.has(l)) letters.set(l, []);
    letters.get(l).push(name);
  }
  write('classes/', renderClassesIndex(ctx('classes/'), letters));
  for (const [l, names] of letters) {
    write(`classes/${l}/`, renderClassesLetter(ctx(`classes/${l}/`), l, names));
  }

  // class pages
  for (const cls of site.classes.values()) {
    write(`class/${cls.name}/`, renderClass(ctx(`class/${cls.name}/`), cls));
  }

  // enums
  write('enums/', renderEnumsIndex(ctx('enums/')));
  for (const en of site.enums.values()) {
    write(`enum/${en.name}/`, renderEnum(ctx(`enum/${en.name}/`), en));
  }

  // flat listings
  write('typedefs/', renderTypedefs(ctx('typedefs/')));
  write('constants/', renderConstants(ctx('constants/')));
  write('functions/', renderFunctions(ctx('functions/')));
  write('hierarchy/', renderHierarchy(ctx('hierarchy/')));
  write('files/', renderFilesIndex(ctx('files/')));
  write('changes/', renderChanges(ctx('changes/'), diff, prevLabel));

  // file pages with embedded source
  const srcDir = path.join(CACHE_DIR, 'src', site.label);
  const fileModels = new Map(site.rawFiles.map((f) => [f.path, f]));
  for (const f of site.files) {
    const source = fs.readFileSync(path.join(srcDir, f.path), 'utf8');
    const rel = `file/${f.path.replace(/^scripts\//, '')}/`;
    write(rel, renderFile(ctx(rel), f, fileModels.get(f.path), source));
  }

  // search index
  writeFile(path.join(versionDir, 'search.json'), JSON.stringify(buildSearchIndex(site)));
}

// Process oldest -> newest, keeping only the previous site model for diffs.
let prevSite = null;
const ordered = [...buildList].reverse();
for (const v of ordered) {
  extractSources(v);
  let t = clock();
  const model = readJson(path.join(DATA_DIR, `model-${v.label}.json`));
  const site = buildSiteModel(model);
  site.rawFiles = model.files; // per-file decls needed for file pages
  const diff = prevSite ? diffModels(site, prevSite) : null;
  timers.model += since(t);

  t = clock();
  const writeBefore = timers.write; // timers.write is cumulative across builds
  const versionIndex = buildList.findIndex((x) => x.label === v.label);
  renderVersion(site, diff, prevSite?.build, versionIndex);
  timers.render += since(t) - (timers.write - writeBefore);
  prevSite = site;

  const unique = canonical.size;
  console.log(
    `${v.label}: ${pages.toLocaleString('en-US')} pages so far, ` +
    `${unique.toLocaleString('en-US')} unique${versionIndex === 0 ? ' (latest, at site root)' : ''}`
  );
}

// site-level 404 (uses latest version chrome)
{
  const latestModel = readJson(path.join(DATA_DIR, `model-${buildList[0].label}.json`));
  const site = buildSiteModel(latestModel);
  const ctx = { site, versions, base: '/', root: '/', versionPath: '' };
  writeFile(path.join(DIST_DIR, '404.html'), render404(ctx));
}

// Every unique page is on disk now, so the duplicates can be linked in bulk.
{
  const t = clock();
  await linkAll();
  timers.link = since(t);
}

// sitemap for the latest version only, from the paths recorded while writing
{
  const t = clock();
  fs.writeFileSync(
    path.join(DIST_DIR, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      sitemapUrls.map((u) => `<url><loc>${u}</loc></url>`).join('\n') +
      '\n</urlset>\n'
  );
  timers.sitemap = since(t);
}

const s = (ms) => `${(ms / 1000).toFixed(1)}s`;
console.log(
  `\nDone: ${pages.toLocaleString('en-US')} pages, ` +
  `${canonical.size.toLocaleString('en-US')} unique files, ` +
  `${(linkJobs.length / 2).toLocaleString('en-US')} hard links, ` +
  `${(bytesWritten / 1e6).toFixed(0)} MB written in ${s(Date.now() - t0)} -> dist/`
);
console.log(
  `  teardown ${s(timers.teardown)} · models ${s(timers.model)} · render ${s(timers.render)} · ` +
  `write ${s(timers.write)} · link ${s(timers.link)} · sitemap ${s(timers.sitemap)}`
);
