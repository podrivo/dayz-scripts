// HTML building blocks: page layout, type linkification, signature and doc
// rendering. Pure template-literal functions, no dependencies.

import { parseDoc } from '../parser/docparse.js';
import { SITE_URL, ANALYTICS_ID } from './content.js';

// Analytics, carried over from the Doxygen site so its numbers continue rather
// than restart. Loaded async and last, after the script the page actually
// needs, so it cannot delay anything: nothing here waits on it and it touches
// nothing on the page.
const ANALYTICS = ANALYTICS_ID
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ANALYTICS_ID}');</script>`
  : '';

// One pass instead of four, and none at all for the majority of strings that
// contain nothing to escape. Worth the noise because file pages run whole
// source files through this.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const NEEDS_ESCAPE = /[&<>"]/;

export function esc(s) {
  const str = String(s);
  return NEEDS_ESCAPE.test(str) ? str.replace(/[&<>"]/g, (c) => ESCAPES[c]) : str;
}

/** Attributes every link that leaves the site carries. */
export const EXT = 'target="_blank" rel="noopener"';

/** A heading's anchor, so a section of a long page can be linked to. */
export function slug(title) {
  return title.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * The type-to-filter field the long pages carry.
 *
 * An index of six thousand classes, a tree of two thousand files or a class
 * with nine hundred members is only navigable if you can narrow it, and every
 * one of those pages already holds everything it would need to: the filtering
 * is done in the browser over the rows, chips, tree nodes and member blocks
 * that are on the page, so it costs no bytes beyond this field and works
 * offline. See the page filter in site/app.js.
 */
export function filterBar(placeholder, chips = []) {
  const row = chips.length
    ? `<div class="filter-chips">${chips
        .map(([mod, label], i) =>
          `<button type="button" class="pf${i ? '' : ' active'}" data-mod="${esc(mod)}" aria-pressed="${!i}">${esc(label)}</button>`)
        .join('')}</div>`
    : '';
  return `<div class="filterbar">
<input type="search" id="pageFilter" class="filter-input" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" aria-label="${esc(placeholder)}">
<span class="filter-count" id="filterCount" aria-live="polite"></span>
</div>${row}`;
}

/**
 * The access chips a class page carries.
 *
 * Doxygen split a class into public / protected / private / static sections;
 * ours lists members in one run and puts the modifiers in the signature,
 * which reads better but leaves no way to ask for just the ones you can call
 * from outside. These filter over what the signature already says. "Public"
 * is the absence of the other two rather than a keyword, because that is what
 * it is in the language.
 */
export const ACCESS_CHIPS = [
  ['', 'All'],
  // First because it is the one that pays: 89% of members carry no comment,
  // so this is the difference between a page you read and a page you scroll.
  ['@documented', 'Documented'],
  ['!private,protected', 'Public'],
  ['protected', 'Protected'],
  ['private', 'Private'],
  ['static', 'Static'],
  ['proto', 'Engine'],
];

export function typeUrl(name, kind) {
  if (kind === 'class') return `class/${name}/`;
  if (kind === 'enum') return `enum/${name}/`;
  if (kind === 'typedef') return `globals/typedefs/#${name}`;
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
  html = html.replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" ${EXT}>$1</a>`);
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

// Doxygen's navigation tree, entry for entry, with Changelog standing where
// it listed Examples, and Globals lifted next to Files so the two are not
// one menu. Labels are the DayZ names (Topics, Classes, Members) rather
// than Doxygen's C-mode ones (Modules, Data Structures, Data Fields).
// Community is the one entry with no Doxygen counterpart: the generated API
// is most of this site, and the rest of the answers are off it.
// Sections are links to their own overview as well as headings, and repeat
// that overview as their first child the way Doxygen did, so the page a
// section lands on is also visible as a place you are.
// The topic list is the one part that changes from build to build, so it is
// not written into the page: a reused page would carry the nav of the build
// it was first rendered for. Topics are fetched from that build's nav.json
// on first expand instead, which is how Doxygen served its tree too.
const NAV = [
  ['modules/', 'Topics', 'topics'],
  ['classes/', 'Classes', [
    ['classes/', 'Classes'],
    ['classes/index/', 'Index'],
    ['hierarchy/', 'Hierarchy'],
    ['classes/fields/', 'Members', [
      ['classes/fields/', 'All'],
      ['classes/fields/functions/', 'Methods'],
      ['classes/fields/variables/', 'Fields'],
    ]],
  ]],
  ['globals/', 'Globals', [
    ['globals/', 'All'],
    ['globals/functions/', 'Functions'],
    ['globals/constants/', 'Constants'],
    ['globals/typedefs/', 'Typedefs'],
    ['globals/enums/', 'Enums'],
    ['globals/values/', 'Values'],
    ['globals/macros/', 'Macros'],
  ]],
  ['files/', 'Files'],
  ['changelog/', 'Changelog'],
  ['community/', 'Community'],
];

/** Whether `active` names this branch or anything under it. */
function navHolds(nodes, active) {
  return nodes.some(([href, , kids]) => href === active || (Array.isArray(kids) && navHolds(kids, active)));
}

function navLink(href, label, cls, here, base) {
  return `<a class="${cls}${here ? ' active' : ''}" href="${base}${href}"${here ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
}

/** Flattened children of a dropdown: groups become a heading plus their
 *  links, so Members is visible without a second click. */
function navPanel(nodes, active, base) {
  return nodes
    .map(([href, label, kids]) => {
      const list = Array.isArray(kids) ? kids : null;
      const here = href === active && !list?.some(([h]) => h === active);
      if (!list) return navLink(href, label, 'nav-sub', here, base);
      return `<div class="nav-group">${navLink(href, label, 'nav-label', here, base)}${navPanel(list, active, base)}</div>`;
    })
    .join('');
}

/**
 * The bar itself. `active` is the version-relative directory of the page's
 * place in it; where a section and its first child share that directory, the
 * child is the one marked, so a page is highlighted once.
 */
function navLevel(nodes, active, base) {
  return nodes
    .map(([href, label, kids]) => {
      const list = Array.isArray(kids) ? kids : null;
      const here = href === active && !list?.some(([h]) => h === active);
      // Every /modules/<topic>/ page belongs under Topics, including the
      // nested topics the nav does not list, so the section is current for
      // all of them and the client marks the entry if it is one of the roots.
      const under = kids === 'topics' && !!active?.startsWith('modules/') && active !== 'modules/';
      const holds = here || under || !!(list && navHolds(list, active));
      // A section that holds the page is marked `on` so the bar still says
      // where you are when the exact entry is a child.
      const on = holds && !here;
      const a = `<a class="nav-item${here ? ' active' : ''}${on ? ' on' : ''}" href="${base}${href}"${here ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
      if (!kids) return a;

      // Sections stay shut: they are hover menus, and serving them open
      // would pin a panel under the bar on every page they hold.
      const fill = list ? '' : ` data-nav="${kids}"${under ? ` data-active="${esc(active)}"` : ''}`;
      const intro = list ? '' : navLink(href, 'All topics', 'nav-sub', false, base);
      const body = list ? navPanel(list, active, base) : '';
      return `<details class="nav-sec${holds ? ' nav-here' : ''}"><summary>${a}</summary><div class="nav-kids"${fill}>${intro}${body}</div></details>`;
    })
    .join('');
}

// The search palette's category tabs, over the kind letters site/app.js gives
// each entry. Doxygen offered the same choice from the magnifier beside its
// search field, and it is what makes a common word usable: "Get" matches
// thousands of methods, and the only way to see the four classes called that
// is to ask for classes.
const SEARCH_FILTERS = [
  ['', 'All'],
  ['c', 'Classes'],
  ['m', 'Methods'],
  ['v', 'Fields'],
  ['eV', 'Enums'],
  ['fkt', 'Globals'],
  ['d', 'Macros'],
  ['F', 'Files'],
  ['g', 'Topics'],
]
  .map(([kinds, label], i) =>
    `<button type="button" class="pf${i ? '' : ' active'}" data-kinds="${kinds}" aria-pressed="${!i}">${label}</button>`)
  .join('');

const FOOTER = `<footer class="foot">
<p>Generated from <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff" ${EXT}>DayZ Script Diff</a> · Not affiliated with <a href="https://www.bohemia.net/" ${EXT}>Bohemia Interactive</a> · <a href="https://www.bohemia.net/community/licenses/dayz-public-license-dpl" ${EXT}>DayZ Public License</a></p>
</footer>`;

/**
 * Tokens layout() interpolates when building the archive shell. They cannot
 * appear in a real page, and they pass through esc() unchanged.
 */
export const ARCHIVE_MARK = { title: '§T§', desc: '§D§', base: '§B§', vpath: '§P§', inner: '§C§' };

export const SITE_TITLE = 'DIFF, DayZ Internal File Finder by YADZ';

/** Last packed inner produced by layout(), for the generator's _b store. */
export let lastPacked = '';

/** Kind a leaf URL sits under, so /class/Foo/ titles as "Foo · Class · …". */
function titleKind(vpath) {
  if (vpath.startsWith('class/')) return 'Class';
  if (vpath.startsWith('enum/')) return 'Enum';
  if (vpath.startsWith('file/')) return 'File';
  if (vpath.startsWith('modules/') && vpath !== 'modules/') return 'Topic';
  return '';
}

export function pageMeta(o) {
  const parts = [];
  if (o.title) parts.push(o.title);
  const kind = titleKind(o.versionPath || '');
  if (kind) parts.push(kind);
  parts.push(SITE_TITLE);
  return {
    title: parts.join(' · '),
    description: o.description || SITE_TITLE,
    base: o.base,
    vpath: o.versionPath || '',
    active: o.active ?? '',
  };
}

/**
 * The contents of `<main>`: breadcrumbs, body, footer. Archived builds store
 * this instead of a full document so the layout chrome is not paid per body.
 */
export function pageInner(o) {
  const trail = o.breadcrumbs?.length > 1 ? o.breadcrumbs.slice(0, -1) : [];
  const crumbs = trail.length
    ? `<nav class="crumbs" aria-label="Breadcrumb">${trail
        .map((c) => (c.href ? `<a href="${c.href}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`))
        .join('<span class="crumb-sep">/</span>')}</nav>`
    : '';
  const close = '</h1>';
  const titleAt = o.content.indexOf(close);
  const body = crumbs && titleAt !== -1
    ? `${o.content.slice(0, titleAt + close.length)}\n${crumbs}${o.content.slice(titleAt + close.length)}`
    : `${crumbs}${o.content}`;
  return o.footer === false ? body : `${body}${FOOTER}`;
}

/**
 * Full page layout.
 * opts: { title, base, active, breadcrumbs, content, description, versionPath, footer }
 *  - base: relative prefix from this page to the VERSION root (e.g. "../../")
 *  - active: the nav entry this page sits under, as a version-relative dir
 *  - versionPath: path of this page relative to version root (for the switcher)
 *
 * Deliberately carries no build, version or date, and links to assets by
 * absolute path rather than a relative site root. That makes a page's bytes
 * depend only on its content, so identical pages across builds can be
 * stored once. The build stamp is restored client-side in site/app.js from
 * the URL. See test/render.test.js.
 */
export function layout(o) {
  const meta = pageMeta(o);
  const inner = pageInner(o);
  lastPacked = `${JSON.stringify(meta)}\n${inner}`;
  const desc = meta.description;
  const nav = navLevel(NAV, o.active ?? null, o.base);
  const url = `${SITE_URL}/${o.versionPath || ''}`;
  const social = o.noindex
    ? '<meta name="robots" content="noindex">'
    : `<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DIFF">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(desc)}">
${social}
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
<script>try{const t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}try{if(sessionStorage.getItem('brand-on')){document.documentElement.dataset.brand='on';document.documentElement.classList.add('brand-snap')}}catch(e){}</script>
</head>
<body data-base="${o.base}" data-vpath="${esc(o.versionPath || '')}">
<header class="top">
<button class="menu-btn" id="menuBtn" aria-label="Menu" aria-controls="nav" aria-expanded="false"><i class="ic ic-menu"></i></button>
<a class="brand" href="/" aria-label="DIFF"><span class="brand-in" aria-hidden="true"><span class="brand-w"><span class="brand-l">D</span><span class="brand-rest">ayZ</span></span><span class="brand-w"><span class="brand-l">I</span><span class="brand-rest">nternal</span></span><span class="brand-w"><span class="brand-l">F</span><span class="brand-rest">ile</span></span><span class="brand-w"><span class="brand-l">F</span><span class="brand-rest">inder</span></span></span></a>
<nav class="nav" id="nav" aria-label="Site">${nav}</nav>
<button class="search-trigger" id="searchBtn" aria-label="Search"><i class="ic ic-search"></i><span>Search…</span><kbd id="searchKbd">⌘K</kbd></button>
<div class="verpicker">
<button class="ver-btn" id="verBtn" aria-haspopup="true" aria-expanded="false" title="Switch DayZ build"><span class="ver-label"></span><i class="ic ic-chev"></i></button>
<nav class="ver-menu" id="verMenu" aria-label="DayZ builds" hidden></nav>
</div>
<button class="theme-btn" id="themeBtn" aria-label="Toggle theme" title="Toggle theme (M)"><i class="ic ic-theme"></i></button>
</header>
<div class="shell">
<main class="main">${inner}</main>
</div>
<div class="palette" id="palette" hidden>
<div class="palette-box" role="dialog" aria-modal="true" aria-label="Search">
<div class="palette-field">
<i class="ic ic-search"></i>
<input id="search" type="search" placeholder="Search classes, methods, enums…" autocomplete="off" spellcheck="false" aria-label="Search">
<kbd>Esc</kbd>
</div>
<div id="searchFilters" class="palette-filters">${SEARCH_FILTERS}</div>
<div id="searchResults" class="search-results" hidden></div>
<div class="palette-hints"><kbd>↑</kbd><kbd>↓</kbd> to navigate · <kbd>↵</kbd> to open · type <code>Class.member</code> to scope</div>
</div>
</div>
<script src="/assets/app.js" defer></script>
${ANALYTICS}
</body>
</html>`;
}
