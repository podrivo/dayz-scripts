// Static site orchestrator: renders every build of the docs into dist/.
// Latest build lives at the site root; older builds under /v/<build>/.
// Builds are processed oldest -> newest so each diff only needs the
// previous build's site model in memory.
//
// Output is content-addressed. Pages carry no build identity (see
// src/generate/html.js and test/render.test.js), so a page is byte-identical in
// every build where its content did not change — 99% of them between
// consecutive builds. The latest build is written as real HTML at pretty URLs.
// Archived builds store only the pages that differ, as packed inners under
// /_b/<sha>, and /v/<build>/pages.json lists those exceptions. Identical
// archive URLs rewrite to /archive.html, which fetches the latest copy.
//
// Pages whose inputs are unchanged since the previous build are not rendered
// or hashed again (see src/generate/memo.js). Every write and link happens on
// a worker pool while this thread renders the next build.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { CACHE_DIR, DATA_DIR, DIST_DIR, ROOT, extractSources, readJson, sourceBlobs } from '../util.js';
import { buildSiteModel } from './model.js';
import { diffModels } from './diff.js';
import { SITE_URL } from './content.js';
import { PageMemo } from './memo.js';
import { pages as sitePages, TOPIC_ALIASES } from './routes.js';
import { render404 } from './render.js';
import { layout, lastPacked, ARCHIVE_MARK } from './html.js';
import { pageExceptions } from './archive.js';
import { seedHistory, applyDiff, serializeHistory } from './history.js';

const t0 = Date.now();
const clock = () => process.hrtime.bigint();
const since = (t) => Number(process.hrtime.bigint() - t) / 1e6;
// `queue` and `flush` are what the writing costs this thread now that the pool
// does it; `drain` is the wait for the pool once there is nothing left to render.
const timers = { teardown: 0, parse: 0, model: 0, diff: 0, deps: 0, render: 0, hash: 0, queue: 0, flush: 0, drain: 0, sitemap: 0 };
// render time split by page kind, to show where the ~417k renders actually go
const renderTimers = { class: 0, file: 0, enum: 0, index: 0, search: 0 };
const linkTimers = { mkdir: 0, write: 0, link: 0 };

// Renders every memoized page anyway and asserts it still hashes to what the
// memo promised. Slower than a plain build by design; see src/generate/memo.js.
const VERIFY = !!process.env.GENERATE_VERIFY;
const memo = new PageMemo();
const memoStats = { rendered: 0, reused: 0, mismatched: 0 };

const { versions } = readJson(path.join(DATA_DIR, 'versions.json'));
const limit = process.env.BUILD_VERSIONS ? Number(process.env.BUILD_VERSIONS) : versions.length;
const buildList = versions.slice(0, limit); // newest first

// ---- teardown -------------------------------------------------------------
// Renaming the old tree is O(1); unlinking its ~850k inodes is not, so the
// rename happens now and the delete is deferred to the very end of the build.
// Deleting concurrently looks free but is not: unlinking and hard-linking are
// both pure metadata work on the same volume, and the old tree's ~850k unlinks
// contend with the ~394k links this build has to make.
{
  const t = clock();
  if (fs.existsSync(DIST_DIR)) {
    // Sibling of dist/ so the rename stays on one filesystem, and outside
    // .cache/ so a half-deleted tree can never be picked up by the CI cache.
    fs.renameSync(DIST_DIR, path.join(ROOT, `.dist-stale-${Date.now()}`));
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(path.join(DIST_DIR, '_b'), { recursive: true });
  timers.teardown = since(t);
}

/**
 * Reclaim every renamed tree in the background, once this build is done with
 * the disk. Sweeps the whole set rather than just ours, so a tree left behind
 * by an interrupted run is collected by the next one instead of leaking.
 */
function dropStaleTrees() {
  const stale = fs.readdirSync(ROOT).filter((f) => f.startsWith('.dist-stale-'));
  if (!stale.length) return;
  spawn('rm', ['-rf', ...stale.map((f) => path.join(ROOT, f))], { detached: true, stdio: 'ignore' }).unref();
}

// ---- content-addressed writer --------------------------------------------
// The first page with a given body is written; every later URL with the same
// body becomes a hard link to it. Both are handed to the worker pool below
// rather than done here, so the main thread only ever renders.
const canonical = new Map(); // content hash -> path of the file holding that body
const sizes = new Map(); // content hash -> byteLength
const bHashes = new Set(); // hashes written to _b/, some later unlinked
const sitemapUrls = [];
let pages = 0;
let bytesWritten = 0;
let bytesTotal = 0;

// ---- worker pool ----------------------------------------------------------
// All of dist/'s filesystem work happens here, off the main thread, while the
// main thread renders the next build. That matters twice over: linking is
// syscall-latency bound so it scales across threads and overlaps with
// rendering for free, and leaving the ~23k canonical writes on the main thread
// made them four times slower by putting them in contention with the pool.
//
// Threads are heavily oversubscribed because the cost is syscall latency
// rather than CPU, so far more of them can be in flight than there are cores.
// Full builds on a 10-core APFS machine: 233s on 6 threads, 189s on 10, 181s
// on 20, 160s on 32, 164s on 44 — a broad optimum around three per core. The
// cap keeps a many-core machine from paying for threads that only add memory.
// LINK_THREADS overrides for tuning elsewhere.
const LINK_THREADS =
  Number(process.env.LINK_THREADS) || Math.min(48, Math.max(8, os.availableParallelism() * 3));
// Cap on how much rendered HTML may sit in the queues before it is handed off,
// so the first build (~8k distinct pages, ~130 MB) does not pile up unsent.
const FLUSH_AT = 4096;

const tty = process.stdout.isTTY;
const queues = Array.from({ length: LINK_THREADS }, () => ({ writes: [], links: [] }));
let pendingOps = 0; // writes + links sitting in the queues, unsent
let workers = null;
let batches = 0; // batches the pool has not finished yet
let queued = 0; // links handed to the pool
let linked = 0; // links the pool has finished
let drained = null; // resolve of the promise waiting on the pool to go idle
let showProgress = false;
let lastReport = 0;

/**
 * Which worker owns a body. Everything about one body — the write and every
 * link pointing at it — must go to the same worker, because a worker's
 * message queue is the only thing ordering the write before its links.
 */
const ownerOf = (hash) => parseInt(hash.slice(0, 6), 16) % LINK_THREADS;

/** Write a page, or queue a link to the file that already holds these bytes. */
function writeFile(file, body) {
  let t = clock();
  const hash = crypto.createHash('sha1').update(body).digest('hex');
  timers.hash += since(t);
  const size = Buffer.byteLength(body);

  t = clock();
  const q = queues[ownerOf(hash)];
  const first = canonical.get(hash);
  if (first === file) {
    timers.queue += since(t);
    return hash;
  }
  if (first) {
    q.links.push(file, first);
    bytesTotal += size;
  } else {
    q.writes.push(file, body);
    canonical.set(hash, file);
    sizes.set(hash, size);
    bytesWritten += size;
    bytesTotal += size;
  }
  timers.queue += since(t);
  if (++pendingOps >= FLUSH_AT) flushJobs();
  return hash;
}

function storeB(body) {
  const hash = crypto.createHash('sha1').update(body).digest('hex');
  writeFile(path.join(DIST_DIR, '_b', hash), body);
  bHashes.add(hash);
  return hash;
}

function report() {
  if (!showProgress) return;
  const now = Date.now();
  // redraw once a second on a terminal; every 10% in a log file
  if (linked < queued && (tty ? now - lastReport < 1000 : linked - lastReport < queued / 10)) return;
  lastReport = tty ? now : linked;
  const line = `  linking ${linked.toLocaleString('en-US')} of ${queued.toLocaleString('en-US')} pages (${Math.round((linked / queued) * 100)}%)`;
  process.stdout.write(tty ? `\r${line}` : `${line}\n`);
}

function pool() {
  if (workers) return workers;
  workers = queues.map(() => {
    const w = new Worker(new URL('./linker.js', import.meta.url));
    w.on('message', (m) => {
      linked += m.linked;
      report();
      if (m.batchDone) {
        linkTimers.mkdir += m.mkdirMs;
        linkTimers.write += m.writeMs;
        linkTimers.link += m.linkMs;
        if (--batches === 0 && drained) drained();
      }
    });
    w.on('error', (err) => {
      console.error(err);
      process.exit(1);
    });
    return w;
  });
  return workers;
}

/** Hand every queued write and link to the worker that owns it. */
function flushJobs() {
  if (!pendingOps) return;
  const t = clock();
  const ws = pool();
  for (let i = 0; i < ws.length; i++) {
    const q = queues[i];
    if (!q.writes.length && !q.links.length) continue;
    queued += q.links.length / 2;
    batches++;
    ws[i].postMessage({ writes: q.writes, links: q.links.join('\n') });
    q.writes = [];
    q.links = [];
  }
  pendingOps = 0;
  timers.flush += since(t);
}

/** Wait for every queued write and link to exist on disk, then stop the pool. */
function drainJobs() {
  flushJobs();
  const stop = () => {
    if (tty && showProgress) process.stdout.write('\n');
    if (!workers) return;
    for (const w of workers) w.terminate();
    workers = null;
  };
  // All work may already have finished while the next build rendered. Still
  // terminate: open workers keep the process alive after Done is printed, and
  // that is what makes Netlify hit the build-command time limit.
  if (!batches) {
    stop();
    return Promise.resolve();
  }
  showProgress = true;
  return new Promise((resolve) => {
    drained = resolve;
  }).then(stop);
}

// ---- static assets --------------------------------------------------------
const assetsDir = path.join(DIST_DIR, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

// Recursive, because site/app/ is a directory of ES modules that /assets/app.js
// imports by relative path: they have to land at /assets/app/*.js for those
// imports to resolve the same way the dev server serves them.
function copyAssets(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue; // .DS_Store and friends must not ship
    if (e.isDirectory()) {
      copyAssets(path.join(from, e.name), path.join(to, e.name));
      continue;
    }
    // The archive shell is a page, not an asset: Netlify rewrites /v/<build>/…
    // to it, so it has to sit at the site root.
    const dest = e.name === 'archive.html' ? DIST_DIR : to;
    fs.copyFileSync(path.join(from, e.name), path.join(dest, e.name));
  }
}
copyAssets(path.join(ROOT, 'site'), assetsDir);

// build list for the client-side version picker (newest first). Also the only
// place the build/version/date of each build now lives, since pages no longer
// carry it; site/app/builds.js reads this to stamp the chrome. The sha is what
// lets it point the "View on GitHub" link at this exact build's commit.
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

// Pages that moved when the site was reorganised around doxygen's own
// sections. Written for both the site root and /v/<build>/, since every build
// carries the same URL shape.
const movedPages = [
  ['typedefs', 'globals/typedefs'],
  ['constants', 'globals/constants'],
  ['functions', 'globals/functions'],
  ['enums', 'globals/enums'],
  ['annotated', 'classes'],
  ['changes', 'changelog'],
  ['compare', 'changelog'],
];
const moveRedirects = [
  ...movedPages.flatMap(([from, to]) => [
    `/${from}/ /${to}/ 301`,
    `/v/:build/${from}/ /v/:build/${to}/ 301`,
  ]),
  '/globals/variables/ /globals/constants/ 301',
  '/v/:build/globals/variables/ /v/:build/globals/constants/ 301',
];
const fieldRedirects = [
  '/fields/* /classes/fields/:splat 301',
  '/fields/ /classes/fields/ 301',
  '/v/:build/fields/* /v/:build/classes/fields/:splat 301',
  '/v/:build/fields/ /v/:build/classes/fields/ 301',
];
// The \defgroup pages were /module/ and then /modules/ before the site settled
// on the name the nav, the breadcrumbs and every generated index already used.
// Both numbers of both spellings resolve, so a guessed url lands either way.
const topicRedirects = TOPIC_ALIASES.flatMap((from) => [
  `/${from}/* /topics/:splat 301`,
  `/v/:build/${from}/* /v/:build/topics/:splat 301`,
]);
const fileRedirects = [
  '/file/* /files/:splat 301',
  '/v/:build/file/* /v/:build/files/:splat 301',
];

// every domain this site has been served from, pointing at the current one
fs.writeFileSync(
  path.join(DIST_DIR, '_redirects'),
  [
    `https://dayz.yadz.app/* ${SITE_URL}/:splat 301!`,
    `https://dayz-docs.yadz.app/* ${SITE_URL}/:splat 301!`,
    `https://dayz-scripts.yadz.app/* ${SITE_URL}/:splat 301!`,
    '/v/ / 302',
    ...moveRedirects,
    ...fieldRedirects,
    ...topicRedirects,
    ...fileRedirects,
    `/v/${buildList[0].label}/* /:splat 301`,
    ...minorRedirects,
    '/v/:build/* /archive.html 200',
    '',
  ].join('\n')
);
fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /v/\nDisallow: /_b/\nSitemap: ${SITE_URL}/sitemap.xml\n`);

// ---- rendering ------------------------------------------------------------

/**
 * Render a page the memo said to skip and check it really is unchanged. The
 * memo only tracks the inputs the renderers read today, so this is the guard
 * that turns "a renderer grew a dependency" from a silently stale page into a
 * failed build.
 */
function verifyReuse(key, hit, render) {
  const html = render(new Set());
  const hash = crypto.createHash('sha1').update(html).digest('hex');
  if (hash === hit.hash) return;
  memoStats.mismatched++;
  console.error(`\nmemo mismatch: ${key} reused ${hit.hash} but renders ${hash}`);
}

const latestHashes = new Map(); // rel -> packed/asset hash of the latest build
const archives = []; // { label, hashes }

/**
 * Write every page of one build. The site map itself lives in
 * src/generate/routes.js, because the dev server has to walk the same one from
 * the other end; this is only what becomes of each page once it is named.
 */
function renderVersion(site, diff, prevLabel, versionIndex, blobs) {
  const isLatest = versionIndex === 0;
  const versionDir = path.join(DIST_DIR, isLatest ? '' : `v/${site.label}/`);
  const hashes = new Map();

  /**
   * Emit one page. A descriptor carrying `deps` opts into cross-build reuse:
   * when nothing it reads has changed since the previous build, its bytes are
   * known to be identical and the packed body is already under _b/. `render`
   * receives the set that collects the type names it looked up, which are part
   * of what "reads" means (see src/generate/memo.js).
   *
   * Page keys are the version-relative directory, which is deliberate: the
   * latest build writes to the site root and the rest under /v/<build>/, but
   * class, enum and file pages render the same bytes either way.
   */
  const write = (p) => {
    if (!p.asset) {
      pages++;
      if (isLatest) sitemapUrls.push(`${SITE_URL}/${p.rel}`);
    }

    let deps;
    if (p.deps) {
      const t = clock();
      deps = p.deps();
      timers.deps += since(t);
    }

    const hit = deps === undefined ? undefined : memo.lookup(p.rel, deps);
    if (hit && !isLatest && (p.asset || hit.packedHash)) {
      memoStats.reused++;
      memo.keep(p.rel, hit);
      if (VERIFY) verifyReuse(p.rel, hit, p.render);
      hashes.set(p.rel, p.asset ? hit.hash : hit.packedHash);
      return;
    }

    const t = clock();
    const seen = deps === undefined ? null : new Set();
    const html = p.render(seen);
    renderTimers[p.kind] += since(t);
    memoStats.rendered++;

    if (p.keep || isLatest) writeFile(path.join(versionDir, p.file), html);

    if (p.asset) {
      const stored = p.keep || isLatest
        ? crypto.createHash('sha1').update(html).digest('hex')
        : storeB(html);
      if (!p.keep) hashes.set(p.rel, stored);
      if (deps !== undefined) memo.record(p.rel, deps, stored, seen);
      return;
    }

    const packedHash = !isLatest
      ? storeB(lastPacked)
      : crypto.createHash('sha1').update(lastPacked).digest('hex');
    hashes.set(p.rel, packedHash);
    if (deps !== undefined) {
      const fullHash = crypto.createHash('sha1').update(html).digest('hex');
      memo.record(p.rel, deps, fullHash, seen, { packedHash });
    }
  };

  const srcDir = path.join(CACHE_DIR, 'src', site.label);
  for (const p of sitePages(site, { isLatest, versions, srcDir, blobs, changes: () => ({ diff, prevLabel }) })) {
    write(p);
  }

  if (isLatest) {
    for (const [rel, hash] of hashes) latestHashes.set(rel, hash);
  } else {
    archives.push({ label: site.label, hashes });
  }
}

// Process oldest -> newest, keeping only the previous site model for diffs.
//
// Parsing stays on this thread on purpose. A worker cannot hand back the site
// model (Maps and an ancestorsOf closure), so the most it could return is a
// v8-serialized copy of the raw JSON — and v8.deserialize costs more than
// JSON.parse does (45ms vs 39ms on a 7 MB model), with the read itself only
// 2ms. There is nothing here to move off the critical path.
let prevSite = null;
let history = null;
const ordered = [...buildList].reverse();
for (const v of ordered) {
  extractSources(v);
  let t = clock();
  const model = readJson(path.join(DATA_DIR, `model-${v.label}.json`));
  timers.parse += since(t);
  t = clock();
  const site = buildSiteModel(model);
  site.rawFiles = model.files; // per-file decls needed for file pages
  timers.model += since(t);
  t = clock();
  const diff = prevSite ? diffModels(site, prevSite) : null;
  timers.diff += since(t);
  if (!history) history = seedHistory(site);
  else applyDiff(history, diff, site.build);

  memo.startBuild(site.typeIndex, prevSite?.typeIndex);
  const versionIndex = buildList.findIndex((x) => x.label === v.label);
  renderVersion(site, diff, prevSite?.build, versionIndex, sourceBlobs(v));
  memo.endBuild();
  prevSite = site;

  // Hand this build's remaining filesystem work to the pool now: it runs while
  // the next build renders, which is most of what keeps the two from adding up.
  flushJobs();

  const unique = canonical.size;
  console.log(
    `${v.label}: ${pages.toLocaleString('en-US')} pages so far, ` +
    `${unique.toLocaleString('en-US')} unique${versionIndex === 0 ? ' (latest, at site root)' : ''}`
  );
}

const usedB = new Set();
for (const a of archives) {
  const ex = pageExceptions(a.hashes, latestHashes);
  for (const h of Object.values(ex)) usedB.add(h);
  writeFile(path.join(DIST_DIR, `v/${a.label}/pages.json`), JSON.stringify(ex));
}
fs.writeFileSync(
  path.join(DIST_DIR, 'archive.tpl'),
  layout({
    title: ARCHIVE_MARK.title,
    description: ARCHIVE_MARK.desc,
    base: ARCHIVE_MARK.base,
    versionPath: ARCHIVE_MARK.vpath,
    bar: ARCHIVE_MARK.bar,
    content: ARCHIVE_MARK.inner,
    footer: false,
  })
);

// site-level 404 (uses latest version chrome). The loop runs oldest -> newest,
// so prevSite is already the latest build's model.
{
  const ctx = { site: prevSite, versions, base: '/', root: '/', versionPath: '' };
  writeFile(path.join(DIST_DIR, '404.html'), render404(ctx));
}

// Most of the writing and linking happened while the builds rendered; wait for
// whatever the pool has left.
{
  const t = clock();
  flushJobs();
  await new Promise(setImmediate);
  if (queued) {
    console.log(
      `Linking ${queued.toLocaleString('en-US')} duplicate pages across ${LINK_THREADS} threads ` +
      `(${linked.toLocaleString('en-US')} already done alongside rendering)...`
    );
  }
  await drainJobs();
  timers.drain = since(t);
}

let droppedB = 0;
for (const hash of bHashes) {
  if (usedB.has(hash)) continue;
  try { fs.unlinkSync(path.join(DIST_DIR, '_b', hash)); } catch {}
  const size = sizes.get(hash) || 0;
  bytesWritten -= size;
  bytesTotal -= size;
  droppedB++;
}

// Nothing else touches the filesystem in bulk from here, so the previous
// build's tree can finally go.
dropStaleTrees();

if (history) {
  fs.writeFileSync(path.join(assetsDir, 'history.json'), JSON.stringify(serializeHistory(history, buildList)));
}

// sitemap for the latest version only, from the paths recorded while writing
{
  const t = clock();
  fs.writeFileSync(
    path.join(DIST_DIR, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      [...sitemapUrls, `${SITE_URL}/api.json`, `${SITE_URL}/llms.txt`]
        .map((u) => `<url><loc>${u}</loc></url>`)
        .join('\n') +
      '\n</urlset>\n'
  );
  timers.sitemap = since(t);
}

const s = (ms) => `${(ms / 1000).toFixed(1)}s`;
const n = (x) => x.toLocaleString('en-US');
const fmt = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`);
timers.render = Object.values(renderTimers).reduce((a, b) => a + b, 0);

console.log(
  `\nDone: ${n(pages)} pages, ${n(canonical.size - droppedB)} unique files, ${n(queued)} hard links, ` +
  `${fmt(bytesWritten)} unique / ${fmt(bytesTotal)} total in ${s(Date.now() - t0)} -> dist/`
);
console.log(
  `  teardown ${s(timers.teardown)} · parse ${s(timers.parse)} · model ${s(timers.model)} · ` +
  `diff ${s(timers.diff)} · deps ${s(timers.deps)} · render ${s(timers.render)} · hash ${s(timers.hash)} · ` +
  `queue ${s(timers.queue)} · flush ${s(timers.flush)} · drain ${s(timers.drain)} · sitemap ${s(timers.sitemap)}`
);
console.log(
  `  render: class ${s(renderTimers.class)} · file ${s(renderTimers.file)} · ` +
  `enum ${s(renderTimers.enum)} · index ${s(renderTimers.index)} · search ${s(renderTimers.search)}`
);
console.log(
  `  pool: mkdir ${s(linkTimers.mkdir)} · write ${s(linkTimers.write)} · link ${s(linkTimers.link)} ` +
  `(summed across ${LINK_THREADS} threads)`
);
console.log(
  `  memo: ${n(memoStats.rendered)} pages rendered, ${n(memoStats.reused)} reused ` +
  `(${Math.round((memoStats.reused / (memoStats.rendered + memoStats.reused)) * 100)}%)`
);

if (VERIFY) {
  console.log(`  verify: ${memoStats.mismatched ? `${n(memoStats.mismatched)} MISMATCHED` : 'every reused page re-rendered identically'}`);
  if (memoStats.mismatched) process.exit(1);
}
