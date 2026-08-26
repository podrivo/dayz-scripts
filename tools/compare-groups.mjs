// Compares what this site files under each topic against what the Doxygen site
// it replaces listed, so "matches the old documentation" is a number rather
// than an impression. The old pages live on the doxygen-archive branch.
//
//   node tools/compare-groups.mjs [title substring]

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readJson, DATA_DIR } from '../src/util.js';
import { buildSiteModel } from '../src/generate/model.js';

const git = (...args) => execFileSync('git', args, { maxBuffer: 1 << 28 }).toString();

const files = git('ls-tree', '-r', 'doxygen-archive', '--name-only')
  .split('\n')
  .filter((f) => /group___[a-z_0-9]+\.html$/.test(f));

/** Every declared name Doxygen listed on a group page, by section. */
function readArchive(file) {
  const html = git('show', `doxygen-archive:${file}`);
  const title = html.match(/<div class="title">([^<]*)/)?.[1].trim();
  const names = new Set();
  // Doxygen's declaration tables: the name is the link in the right-hand cell.
  for (const row of html.match(/<td class="mem(Item|TemplItem)Right"[\s\S]*?<\/td>/g) || []) {
    const name = row.match(/<a [^>]*>([^<]+)<\/a>/)?.[1];
    if (name) names.add(bare(name));
  }
  return { title, names };
}

/** Doxygen prints a template's parameters in the name; the declaration is the
 *  part before them, and entity-escaped angle brackets are still brackets. */
function bare(name) {
  return name
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/<.*$/, '')
    .trim();
}

const site = buildSiteModel(readJson(path.join(DATA_DIR, 'model-1.29.163709.json')));

/** Every declared name this site puts on a module page. */
function ours(mod) {
  const names = new Set();
  // Doxygen listed a topic's sub-topics in the same tables as its members.
  for (const k of mod.children) names.add(site.groups.get(k).title);
  for (const c of mod.classes) {
    names.add(c);
    const cls = site.classes.get(c);
    for (const m of cls?.methods || []) names.add(m.name);
    for (const v of cls?.members || []) names.add(v.name);
  }
  for (const e of mod.enums) {
    names.add(e);
    for (const v of site.enums.get(e)?.values || []) names.add(v.name);
  }
  for (const t of mod.typedefs) names.add(t.name);
  for (const g of mod.globals) names.add(g.name);
  for (const f of mod.functions) names.add(f.name);
  for (const d of mod.defines) names.add(d.name);
  for (const m of mod.members) names.add(m.item.name);
  return names;
}

// Match on the group's name, not its title: several topics share a title
// ("API", "World"). Doxygen's file name is the name with each capital turned
// into an underscore and a lowercase letter, which is reversible enough here.
const byFile = new Map();
for (const m of site.groups.values()) {
  byFile.set(`group__${m.name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}.html`, m);
}

const filter = process.argv[2];
let theirs = 0;
let found = 0;
const rows = [];

for (const f of files) {
  const { title, names } = readArchive(f);
  if (!title || (filter && !title.toLowerCase().includes(filter.toLowerCase()))) continue;
  const mod = byFile.get(path.basename(f));
  const have = mod ? ours(mod) : new Set();
  const missing = [...names].filter((n) => !have.has(n));
  theirs += names.size;
  found += names.size - missing.length;
  rows.push({ title, want: names.size, missing: missing.length, mod: !!mod, sample: missing.slice(0, 6) });
}

rows.sort((a, b) => b.missing - a.missing);
for (const r of rows.slice(0, filter ? rows.length : 20)) {
  const pct = r.want ? Math.round(((r.want - r.missing) / r.want) * 100) : 100;
  console.log(
    `${String(pct).padStart(3)}%  ${String(r.want - r.missing).padStart(4)}/${String(r.want).padEnd(4)} ${r.mod ? ' ' : '?'} ${r.title}` +
      (r.sample.length ? `\n            missing: ${r.sample.join(', ')}` : '')
  );
}
console.log(`\n${rows.length} topics · ${found}/${theirs} of the names Doxygen listed (${Math.round((found / theirs) * 100)}%)`);
