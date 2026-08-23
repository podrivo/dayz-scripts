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
 * opts: { title, base, root, site, versions, current, active, breadcrumbs, content, description }
 *  - base: relative prefix from this page to the VERSION root (e.g. "../../")
 *  - root: relative prefix from this page to the SITE root
 *  - versionPath: path of this page relative to version root (for the switcher)
 */
export function layout(o) {
  const desc = o.description || `DayZ ${o.site.version} Enforce Script API documentation`;
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
<title>${esc(o.title)} · DayZ ${esc(o.site.version)} Scripts</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="${o.root}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${o.root}assets/styles.css">
<script>try{const t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body data-base="${o.base}" data-root="${o.root}" data-vpath="${esc(o.versionPath || '')}">
<header class="top">
  <button class="menu-btn" id="menuBtn" aria-label="Menu"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h14M3 10h14M3 15h14"/></svg></button>
  <a class="brand" href="${o.root}">DayZ<span>Scripts</span></a>
  <div class="searchbox">
    <input id="search" type="search" placeholder="Search classes, methods, enums…" autocomplete="off" spellcheck="false" aria-label="Search">
    <kbd>/</kbd>
    <div id="searchResults" class="search-results" hidden></div>
  </div>
  <div class="verpicker">
    <button class="ver-btn" id="verBtn" data-build="${esc(o.site.build)}" aria-haspopup="true" aria-expanded="false" title="Switch DayZ build">${esc(o.site.version)}<span class="ver-patch">${esc(o.site.build.slice(o.site.version.length))}</span><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3.5l3 3 3-3"/></svg></button>
    <nav class="ver-menu" id="verMenu" aria-label="DayZ builds" hidden></nav>
  </div>
  <button class="theme-btn" id="themeBtn" aria-label="Toggle theme" title="Toggle theme (M)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.3 11.3 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.3-11.3 1.4-1.4"/></svg></button>
</header>
<div class="shell">
  <aside class="side" id="sidebar"><nav>${nav}</nav>
    <div class="side-meta">DayZ ${esc(o.site.version)}<br>build ${esc(o.site.build)}<br>${esc(o.site.date)}</div>
  </aside>
  <main class="main">
    ${crumbs}
    ${o.content}
    <footer class="foot">
      <p>Generated from <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff" rel="noopener">DayZ Script Diff</a> · build ${esc(o.site.build)} (${esc(o.site.date)}) · Unofficial, not affiliated with Bohemia Interactive · <a href="https://www.bohemia.net/community/licenses/arma-and-dayz-public-license-share-alike-adpl-sa" rel="noopener">ADPL-SA</a></p>
    </footer>
  </main>
</div>
<script src="${o.root}assets/app.js" defer></script>
</body>
</html>`;
}
