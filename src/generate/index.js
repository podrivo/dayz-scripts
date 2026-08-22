// Static site orchestrator: renders every version of the docs into dist/.
// Latest version lives at the site root; older versions under /v/<label>/.
// Versions are processed oldest -> newest so each diff only needs the
// previous version's site model in memory.

import fs from 'node:fs';
import path from 'node:path';
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
const { versions } = readJson(path.join(DATA_DIR, 'versions.json'));
const limit = process.env.BUILD_VERSIONS ? Number(process.env.BUILD_VERSIONS) : versions.length;
const buildList = versions.slice(0, limit); // newest first

fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

// ---- static assets --------------------------------------------------------
const assetsDir = path.join(DIST_DIR, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'site'))) {
  fs.copyFileSync(path.join(ROOT, 'site', f), path.join(assetsDir, f));
}

// domain redirects preserved from the previous Doxygen site
fs.writeFileSync(
  path.join(DIST_DIR, '_redirects'),
  [
    'https://dayz.yadz.app/* https://dayz-scripts.yadz.app/:splat 301!',
    'https://dayz-docs.yadz.app/* https://dayz-scripts.yadz.app/:splat 301!',
    '/v/ / 302',
    `/v/${buildList[0].label}/* /:splat 301`,
    '',
  ].join('\n')
);
fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /v/\nSitemap: https://dayz-scripts.yadz.app/sitemap.xml\n');

// ---- rendering ------------------------------------------------------------

let pages = 0;

function renderVersion(site, diff, prevLabel, versionIndex) {
  const isLatest = versionIndex === 0;
  const versionDirRel = isLatest ? '' : `v/${site.version}/`;
  const versionDir = path.join(DIST_DIR, versionDirRel);

  const write = (relDir, html) => {
    const dir = path.join(versionDir, relDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    pages++;
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
  const srcDir = path.join(CACHE_DIR, 'src', site.version);
  const fileModels = new Map(site.rawFiles.map((f) => [f.path, f]));
  for (const f of site.files) {
    const source = fs.readFileSync(path.join(srcDir, f.path), 'utf8');
    const rel = `file/${f.path.replace(/^scripts\//, '')}/`;
    write(rel, renderFile(ctx(rel), f, fileModels.get(f.path), source));
  }

  // search index
  fs.writeFileSync(path.join(versionDir, 'search.json'), JSON.stringify(buildSearchIndex(site)));

  console.log(`${site.version}: rendered${isLatest ? ' (latest, at site root)' : ''}`);
}

// Process oldest -> newest, keeping only the previous site model for diffs.
let prevSite = null;
const ordered = [...buildList].reverse();
for (const v of ordered) {
  extractSources(v);
  const model = readJson(path.join(DATA_DIR, `model-${v.label}.json`));
  const site = buildSiteModel(model);
  site.rawFiles = model.files; // per-file decls needed for file pages
  const diff = prevSite ? diffModels(site, prevSite) : null;
  const versionIndex = buildList.findIndex((x) => x.label === v.label);
  renderVersion(site, diff, prevSite?.version, versionIndex);
  prevSite = site;
}

// site-level 404 (uses latest version chrome)
{
  const latestModel = readJson(path.join(DATA_DIR, `model-${buildList[0].label}.json`));
  const site = buildSiteModel(latestModel);
  const ctx = { site, versions, base: '/', root: '/', versionPath: '' };
  fs.writeFileSync(path.join(DIST_DIR, '404.html'), render404(ctx));
}

// sitemap for the latest version only
{
  const urls = [];
  const walkDist = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'v' && rel === '') continue; // skip old versions
      if (e.isDirectory()) walkDist(path.join(dir, e.name), `${rel}${e.name}/`);
      else if (e.name === 'index.html') urls.push(`https://dayz-scripts.yadz.app/${rel}`);
    }
  };
  walkDist(DIST_DIR, '');
  fs.writeFileSync(
    path.join(DIST_DIR, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `<url><loc>${u}</loc></url>`).join('\n') +
      '\n</urlset>\n'
  );
}

console.log(`Done: ${pages.toLocaleString('en-US')} pages in ${((Date.now() - t0) / 1000).toFixed(1)}s -> dist/`);
