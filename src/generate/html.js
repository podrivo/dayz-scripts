// HTML building blocks: page layout, type linkification, signature and doc
// rendering. Pure template-literal functions, no dependencies.

import { parseDoc } from '../parser/docparse.js';

export function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function typeUrl(name, kind) {
  if (kind === 'class') return `class/${name}/`;
  if (kind === 'enum') return `enum/${name}/`;
  if (kind === 'typedef') return `typedefs/#${name}`;
  return null;
}

/** Linkify known type names inside a type string like "ref map<Foo, int>". */
export function linkType(typeStr, site, base) {
  if (!typeStr) return '';
  return esc(typeStr).replace(/[A-Za-z_]\w*/g, (word) => {
    const kind = site.typeIndex.get(word);
    if (!kind) return word;
    return `<a href="${base}${typeUrl(word, kind)}">${word}</a>`;
  });
}

export function condBadges(cond) {
  if (!cond || !cond.length) return '';
  return cond
    .map((c) => `<span class="badge badge-cond" title="Only when ${esc(c.startsWith('!') ? c.slice(1) + ' is NOT defined' : c + ' is defined')}">${esc(c)}</span>`)
    .join('');
}

export function modBadges(mods, extra = []) {
  const all = [...(mods || []), ...extra];
  if (!all.length) return '';
  return all.map((m) => `<span class="badge badge-mod">${esc(m)}</span>`).join('');
}

/** Render a method signature with linked types. */
export function methodSig(m, site, base, { compact = false } = {}) {
  const mods = (m.mods || []).map((x) => `<span class="kw">${esc(x)}</span> `).join('');
  const ret = m.ret ? `${linkType(m.ret, site, base)} ` : '';
  const params = (m.params || [])
    .map((p) => {
      const pm = (p.mods || []).map((x) => `<span class="kw">${esc(x)}</span> `).join('');
      const def = p.def !== undefined ? ` = <span class="lit">${esc(p.def)}</span>` : '';
      const arr = p.array !== undefined ? `[${esc(p.array)}]` : '';
      const nm = p.name ? ` <span class="pn">${esc(p.name)}</span>` : '';
      return `${pm}${linkType(p.type, site, base)}${nm}${arr}${def}`;
    })
    .join(', ');
  const name = `<span class="fn">${esc(m.name)}</span>`;
  if (compact) return `${name}(${params})`;
  return `${mods}${ret}${name}(${params})`;
}

/** Render a variable/constant signature with linked types. */
export function varSig(v, site, base) {
  const mods = (v.mods || []).map((x) => `<span class="kw">${esc(x)}</span> `).join('');
  const arr = v.array !== undefined ? `[${esc(v.array)}]` : '';
  const init = v.init !== undefined ? ` = <span class="lit">${esc(v.init)}</span>` : '';
  const type = v.type ? `${linkType(v.type, site, base)} ` : '';
  return `${mods}${type}<span class="vn">${esc(v.name)}</span>${arr}${init}`;
}

/** Inline doc text formatting: \p word, backtick-less code refs, links. */
function inlineDoc(text, site, base) {
  let html = esc(text);
  html = html.replace(/[\\@]p\s+(\S+)/g, (_, w) => `<code>${w}</code>`);
  html = html.replace(/[\\@]b\s+(\S+)/g, (_, w) => `<strong>${w}</strong>`);
  html = html.replace(/[\\@]n\b/g, '<br>');
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" rel="noopener">$1</a>');
  // linkify known type names when they appear as standalone words
  if (site) {
    html = html.replace(/\b([A-Z]\w{2,})\b/g, (word) => {
      const kind = site.typeIndex.get(word);
      return kind ? `<a href="${base}${typeUrl(word, kind)}">${word}</a>` : word;
    });
  }
  return html;
}

function paragraphs(text, site, base) {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${inlineDoc(p.trim(), site, base).replaceAll('\n', ' ')}</p>`)
    .join('');
}

/** Render a raw doc comment into rich HTML. */
export function renderDoc(rawDoc, site, base) {
  const d = parseDoc(rawDoc);
  if (!d) return '';
  let html = '';
  if (d.deprecated) html += `<div class="doc-warning"><strong>Deprecated.</strong> ${inlineDoc(d.deprecated, site, base)}</div>`;
  if (d.brief) html += `<p class="doc-brief">${inlineDoc(d.brief, site, base)}</p>`;
  if (d.desc) html += paragraphs(d.desc, site, base);
  if (d.params?.length) {
    html += '<dl class="doc-params">';
    for (const p of d.params) {
      const dir = p.dir ? `<span class="badge badge-mod">${esc(p.dir)}</span> ` : '';
      html += `<dt>${dir}<code>${esc(p.name)}</code></dt><dd>${inlineDoc(p.text || '', site, base)}</dd>`;
    }
    html += '</dl>';
  }
  if (d.returns) html += `<p class="doc-returns"><strong>Returns:</strong> ${inlineDoc(d.returns, site, base)}</p>`;
  for (const n of d.notes || []) html += `<div class="doc-note">${inlineDoc(n, site, base)}</div>`;
  for (const w of d.warnings || []) html += `<div class="doc-warning">${inlineDoc(w, site, base)}</div>`;
  for (const c of d.code || []) html += `<pre class="code" data-hl><code>${esc(c)}</code></pre>`;
  if (d.see?.length) {
    html += `<p class="doc-see"><strong>See also:</strong> ${d.see.map((s) => inlineDoc(s, site, base)).join(', ')}</p>`;
  }
  return html;
}

/** Just the brief line (for tables/index rows). */
export function briefOf(rawDoc, site, base) {
  const d = parseDoc(rawDoc);
  if (!d?.brief) return '';
  return inlineDoc(d.brief, site, base);
}

const NAV = [
  ['', 'Overview'],
  ['classes/', 'Classes'],
  ['hierarchy/', 'Hierarchy'],
  ['enums/', 'Enums'],
  ['typedefs/', 'Typedefs'],
  ['constants/', 'Constants'],
  ['functions/', 'Functions'],
  ['files/', 'Files'],
  ['changes/', 'Changelog'],
];

/**
 * Full page layout.
 * opts: { title, base, active, breadcrumbs, content, description, versionPath }
 *  - base: relative prefix from this page to the VERSION root (e.g. "../../")
 *  - versionPath: path of this page relative to version root (for the switcher)
 *
 * Deliberately carries no build, version or date, and links to assets by
 * absolute path rather than a relative site root. That makes a page's bytes
 * depend only on its content, so identical pages across builds can be
 * hard-linked in dist/ instead of duplicated 49 times. The build stamp is
 * restored client-side in site/app.js from the URL. See test/render.test.js.
 */
export function layout(o) {
  const desc = o.description || 'DayZ Enforce Script API documentation';
  const nav = NAV.map(
    ([href, label]) =>
      `<a href="${o.base}${href}"${o.active === label ? ' class="active" aria-current="page"' : ''}>${label}</a>`
  ).join('');

  const crumbs = o.breadcrumbs?.length
    ? `<nav class="crumbs" aria-label="Breadcrumb">${o.breadcrumbs
        .map((c) => (c.href ? `<a href="${c.href}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`))
        .join('<span class="crumb-sep">/</span>')}</nav>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)} · DayZ Scripts</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/styles.css">
<script>try{const t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body data-base="${o.base}" data-vpath="${esc(o.versionPath || '')}">
<header class="top">
  <button class="menu-btn" id="menuBtn" aria-label="Menu"><i class="ic ic-menu"></i></button>
  <a class="brand" href="/">DayZ<span>Scripts</span></a>
  <div class="searchbox">
    <input id="search" type="search" placeholder="Search classes, methods, enums…" autocomplete="off" spellcheck="false" aria-label="Search">
    <kbd>/</kbd>
    <div id="searchResults" class="search-results" hidden></div>
  </div>
  <div class="verpicker">
    <button class="ver-btn" id="verBtn" aria-haspopup="true" aria-expanded="false" title="Switch DayZ build"><span class="ver-label"></span><i class="ic ic-chev"></i></button>
    <nav class="ver-menu" id="verMenu" aria-label="DayZ builds" hidden></nav>
  </div>
  <button class="theme-btn" id="themeBtn" aria-label="Toggle theme" title="Toggle theme (M)"><i class="ic ic-theme"></i></button>
</header>
<div class="shell">
  <aside class="side" id="sidebar"><nav>${nav}</nav>
    <div class="side-meta" id="sideMeta"></div>
  </aside>
  <main class="main">
    ${crumbs}
    ${o.content}
    <footer class="foot">
      <p>Generated from <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff" rel="noopener">DayZ Script Diff</a> · build <span id="footBuild"></span> · Unofficial, not affiliated with Bohemia Interactive · © 2022 Bohemia Interactive a.s., <a href="https://www.bohemia.net/community/licenses/dayz-public-license-dpl" rel="noopener">DayZ Public License</a></p>
    </footer>
  </main>
</div>
<script src="/assets/app.js" defer></script>
</body>
</html>`;
}
