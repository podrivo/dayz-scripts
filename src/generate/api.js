// Machine-readable dump of one build, for agents rather than the browser.
//
// search.json is a name index: enough to jump to a page, not enough to answer
// "what does SetQuantity take." This file is the signatures, inheritance,
// locations and doc briefs of every declaration. Latest-only — older builds
// keep the HTML archive — and fetched as /api.json, never written into a page.
// See renderLlmsTxt for the index that points here.

import { parseDoc } from '../parser/docparse.js';
import { SITE_URL } from './content.js';
import { SITE_TITLE } from './html.js';

const DPL = 'https://www.bohemia.net/community/licenses/dayz-public-license-dpl';

const byName = (a, b) => a.name.localeCompare(b.name);

function briefOf(raw) {
  return parseDoc(raw)?.brief || undefined;
}

function shown(site, filePath) {
  if (!filePath) return undefined;
  return site.paths.get(filePath) || filePath.replace(/^scripts\//, '');
}

function loc(site, item) {
  const path = item.file || item.locations?.find((l) => !l.forward)?.path || item.locations?.[0]?.path;
  const line = item.line ?? item.locations?.find((l) => !l.forward)?.line ?? item.locations?.[0]?.line;
  const file = shown(site, path);
  return { file, line };
}

function param(p) {
  const o = {};
  if (p.mods?.length) o.mods = p.mods;
  if (p.type) o.type = p.type;
  if (p.name) o.name = p.name;
  if (p.array !== undefined) o.array = p.array;
  if (p.def !== undefined) o.def = p.def;
  return o;
}

function method(site, m) {
  const { file, line } = loc(site, m);
  const o = { name: m.name };
  if (m.kind) o.kind = m.kind;
  if (m.ret) o.ret = m.ret;
  if (m.params?.length) o.params = m.params.map(param);
  if (m.mods?.length) o.mods = m.mods;
  if (m.proto) o.proto = true;
  if (m.cond?.length) o.cond = m.cond;
  const brief = briefOf(m.doc);
  if (brief) o.brief = brief;
  if (file) o.file = file;
  if (line) o.line = line;
  return o;
}

function field(site, v) {
  const { file, line } = loc(site, v);
  const o = { name: v.name };
  if (v.type) o.type = v.type;
  if (v.mods?.length) o.mods = v.mods;
  if (v.array !== undefined) o.array = v.array;
  if (v.init !== undefined) o.init = v.init;
  if (v.cond?.length) o.cond = v.cond;
  const brief = briefOf(v.doc);
  if (brief) o.brief = brief;
  if (file) o.file = file;
  if (line) o.line = line;
  return o;
}

export function buildApi(site) {
  const classes = [...site.classes.values()].sort(byName).map((c) => {
    const { file, line } = loc(site, c);
    const o = { name: c.name, url: `class/${c.name}/` };
    if (c.generics) o.generics = c.generics;
    if (c.baseName) o.base = c.baseName;
    if (c.bases.length > 1) o.bases = c.bases.map((b) => (b.cond?.length ? { name: b.base, cond: b.cond } : b.base));
    if (c.modded) o.modded = true;
    if (c.mods?.length) o.mods = c.mods;
    if (c.group) o.topic = c.group;
    const brief = briefOf(c.doc);
    if (brief) o.brief = brief;
    if (file) o.file = file;
    if (line) o.line = line;
    if (c.methods.length) o.methods = c.methods.map((m) => method(site, m));
    if (c.members.length) o.members = c.members.map((v) => field(site, v));
    return o;
  });

  const enums = [...site.enums.values()].sort(byName).map((e) => {
    const { file, line } = loc(site, e);
    const o = { name: e.name, url: `enum/${e.name}/` };
    if (e.base) o.base = e.base;
    const brief = briefOf(e.doc);
    if (brief) o.brief = brief;
    if (file) o.file = file;
    if (line) o.line = line;
    o.values = e.values.map((v) => {
      const ev = { name: v.name };
      if (v.value !== undefined) ev.value = v.value;
      const vb = briefOf(v.doc);
      if (vb) ev.brief = vb;
      return ev;
    });
    return o;
  });

  const functions = [...site.functions].sort(byName).map((fn) => {
    const o = method(site, fn);
    o.url = `globals/functions/#${fn.name}`;
    return o;
  });

  const constants = [...site.globals].sort(byName).map((g) => {
    const o = field(site, g);
    o.url = `globals/constants/#${g.name}`;
    if (g.group) o.topic = g.group;
    return o;
  });

  const typedefs = [...site.typedefs].sort(byName).map((t) => {
    const { file, line } = loc(site, t);
    const o = { name: t.name, type: t.type, url: `globals/typedefs/#${t.name}` };
    if (t.array !== undefined) o.array = t.array;
    if (file) o.file = file;
    if (line) o.line = line;
    return o;
  });

  const macros = [...site.defines].sort(byName).map((d) => {
    const { file, line } = loc(site, d);
    const o = { name: d.name, url: `globals/macros/#${d.name}` };
    if (d.value) o.value = d.value;
    if (file) o.file = file;
    if (line) o.line = line;
    return o;
  });

  const topics = [...site.groups.values()]
    .map((g) => {
      const o = { name: g.name, title: g.label, url: `modules/${g.name}/` };
      if (g.parent) o.parent = g.parent;
      return o;
    })
    .sort(byName);

  return {
    title: SITE_TITLE,
    url: SITE_URL,
    build: site.build,
    version: site.version,
    date: site.date,
    sha: site.sha,
    license: {
      name: 'DayZ Public License (DPL)',
      url: DPL,
      notice:
        'Script sources © BOHEMIA INTERACTIVE a.s. Parsed and reformatted for documentation. Not official documentation and not affiliated with DayZ or Bohemia Interactive.',
    },
    stats: site.stats,
    classes,
    enums,
    functions,
    constants,
    typedefs,
    macros,
    topics,
  };
}

/** The llmstxt.org index: what to fetch, and the license that covers it. */
export function renderLlmsTxt(site) {
  return `# ${SITE_TITLE}

> Browsable documentation for the DayZ Enforce Script API, generated from the official DayZ Script Diff sources. Latest PC stable build: ${site.build}.

The HTML site is for humans. Language models should prefer the machine-readable files below over scraping class pages.

The script sources are © BOHEMIA INTERACTIVE a.s., all rights reserved, and are licensed under the [DayZ Public License (DPL)](${DPL}). They have been modified here only for presentation. This is not official documentation and is not affiliated with DayZ or Bohemia Interactive.

## Machine-readable

- [Latest build API](${SITE_URL}/api.json): every class, method, field, enum, global, typedef and macro of ${site.build}, with signatures, inheritance, file locations and doc briefs
- [Search index](${SITE_URL}/search.json): compact name index the site search uses
- [Community notes](${SITE_URL}/assets/notes.json): community-written notes on undocumented declarations, keyed by \`Type\` or \`Type.Member\`. Not from Bohemia, and not covered by the license above
- [Build list](${SITE_URL}/assets/versions.json): every documented PC build

## Human documentation

- [Home](${SITE_URL}/): overview, official and community links, and the PC stable changelog
- [Classes](${SITE_URL}/classes/): annotated class list
- [Topics](${SITE_URL}/modules/): the \\defgroup groups the sources wrap themselves into
- [Changelog](${SITE_URL}/changelog/): API diff between any two builds
- [Community](${SITE_URL}/community/): official references, Discord servers, editors, build tools and data explorers for DayZ modding
`;
}
