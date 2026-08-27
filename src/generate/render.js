// Per-page renderers. Each returns a full HTML document string.

import {
  esc, layout, linkType, typeUrl, condBadges, modBadges,
  methodSig, varSig, renderDoc, briefOf, filterBar, slug, ACCESS_CHIPS, EXT,
} from './html.js';
import {
  OFFICIAL_LINKS, COMMUNITY_LINKS, FORUM_THREADS, VERSION_TITLES, YADZ_DISCORD,
} from './content.js';

function anchorFor(used, name) {
  let a = name.replace(/[^\w]/g, '_');
  if (used.has(a)) {
    let i = 2;
    while (used.has(`${a}-${i}`)) i++;
    a = `${a}-${i}`;
  }
  used.add(a);
  return a;
}

function fileHref(base, path) {
  return `${base}file/${path.replace(/^scripts\//, '')}/`;
}

/** How many callers to show, and the point past which the rest are only
 *  counted. Three fits the median name, which has two callers, so most lists
 *  are complete as shown and the signature above stays the loudest thing in
 *  the block. Listing every caller of `Cast` would cost 4,955 links on each of
 *  the pages naming a Cast and tell nobody anything. */
const CALLERS_SHOWN = 3;
const CALLERS_LISTED = 50;

/** Doxygen's own list joining: ", " between, ", and " before the last
 *  (trWriteList in translator_en.h). */
function writeList(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** A name inside a reference list. Doxygen prints the scope only when it is
 *  not the scope of the page you are on, closes every function with "()", and
 *  falls back to plain text when the name will not resolve. */
function refName(owner, name, scope, base, linked) {
  const label = owner && owner !== scope ? `<span class="xref-owner">${esc(owner)}.</span>${esc(name)}()` : `${esc(name)}()`;
  if (!linked) return label;
  const anchor = name.replace(/[^\w]/g, '_');
  const href = owner ? `${base}class/${owner}/#${anchor}` : `${base}globals/functions/#${anchor}`;
  return `<a href="${href}">${label}</a>`;
}

/**
 * Where a name is called from. Only 11% of members carry a doc comment, so for
 * most of this API the way to learn what something does is to read a place it
 * is already used, and this is the index of those places.
 *
 * The match is by name alone -- the parser does not resolve receivers -- so a
 * `Show` entry gathers every Show in the sources. Doxygen's heading is kept
 * because its own matching was no more exact, but the common names are folded
 * away by default: a 200-entry list is the noise its version drowned in.
 */
function callersBlock(name, ctx, scope = null) {
  const { site, base } = ctx;
  if (!ctx.xref) return '';
  const list = site.callers?.get(name);
  if (!list?.length) return '';

  const link = (c) => refName(c.owner || null, c.name, scope, base, true);
  const extra = list.length - CALLERS_SHOWN;
  // "and" belongs before the last entry only when the last entry is shown;
  // a truncated head runs on into the "and N more" that follows it.
  const shown = list.slice(0, CALLERS_SHOWN).map(link);
  const head = extra <= 0 ? writeList(shown) : shown.join(', ');
  const rest =
    extra <= 0
      ? '.'
      : list.length <= CALLERS_LISTED
        ? `, <details class="xref-more"><summary>and ${extra} more</summary>${writeList(list.slice(CALLERS_SHOWN).map(link))}.</details>`
        : `, <span class="xref-rest">and ${extra.toLocaleString()} more.</span>`;
  return `<div class="xref"><span class="xref-label" title="Matched by name: the sources are not type-checked, so every method of this name is gathered">Referenced by</span> ${head}${rest}</div>`;
}

/**
 * What a body calls, which is Doxygen's "References". The parser records the
 * names a body names without resolving what they are called on, so a name is
 * linked only where one declaration in the build answers to it (83% of them);
 * the rest print as plain text, which is what definition.cpp does with a name
 * it cannot link either.
 */
function referencesBlock(item, ctx, scope = null) {
  const { site, base } = ctx;
  if (!ctx.xref || !item.calls?.length) return '';
  const items = item.calls.map((n) => {
    const t = site.refTargets?.get(n);
    return refName(t?.owner || null, n, scope, base, Boolean(t));
  });
  return `<div class="xref xref-out"><span class="xref-label">References</span> ${writeList(items)}.</div>`;
}

function fileLineHref(base, path, line) {
  return `${fileHref(base, path)}#L${line}`;
}

/**
 * How a script path is spelled for the reader. URLs keep the lowercase
 * spelling the sources use; only what is shown gets the game's own
 * capitalisation back (see src/generate/casing.js).
 */
function shown(site, path) {
  return site.paths.get(path) || path.replace(/^scripts\//, '');
}

/** Source link for a declaration, labelled with its path and line. */
function locationLinks(site, base, locations) {
  return locations
    .map(
      (l) =>
        `<a href="${fileLineHref(base, l.path, l.line)}"><code>${esc(shown(site, l.path))}</code>:${l.line}</a>` +
        (l.forward ? ' <span class="muted">(declaration)</span>' : '')
    )
    .join('<br>');
}

// ---------------------------------------------------------------------------

function fmtDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC',
  });
}

const buildNo = (build) => Number(build.split('.')[2] || 0);
const versionNo = (version) => {
  const [major, minor] = version.split('.').map(Number);
  return major * 1000 + minor;
};

/** "1.29 Update 1" from the oldest of that version. `builds` is newest-first. */
function updateNames(builds) {
  const count = new Map();
  const seen = new Map();
  for (const v of builds) count.set(v.version, (count.get(v.version) || 0) + 1);
  const names = new Map();
  for (const v of builds) {
    const n = (seen.get(v.version) || 0) + 1;
    seen.set(v.version, n);
    names.set(v.build, `${v.version} Update ${count.get(v.version) - n + 1}`);
  }
  return names;
}

/**
 * Release history grouped by game version: every build we document, merged
 * with the official forum threads. Builds whose scripts never reached the
 * Script Diff repository still show up, with their thread only.
 */
function renderReleases(ctx) {
  const { site, root, versions } = ctx;
  const names = updateNames(versions);
  const groups = new Map(); // version -> Map(build -> row)
  const rowsFor = (version) => {
    if (!groups.has(version)) groups.set(version, new Map());
    return groups.get(version);
  };

  versions.forEach((v, i) => {
    rowsFor(v.version).set(v.build, {
      build: v.build,
      date: v.date,
      docs: i === 0 ? root : `${root}v/${v.label}/`,
    });
  });

  for (const [build, thread] of Object.entries(FORUM_THREADS)) {
    const version = build.split('.').slice(0, 2).join('.');
    const rows = rowsFor(version);
    const row = rows.get(build) || { build, date: thread.date };
    row.url = thread.url;
    rows.set(build, row);
  }

  return [...groups.entries()]
    .sort((a, b) => versionNo(b[0]) - versionNo(a[0]))
    .map(([version, rows]) => {
      const title = VERSION_TITLES[version] ? ` <span class="muted">${esc(VERSION_TITLES[version])}</span>` : '';
      const items = [...rows.values()]
        .sort((a, b) => buildNo(b.build) - buildNo(a.build))
        .map((r) => {
          const name = names.get(r.build) || r.build;
          const patch = r.build.split('.')[2];
          let label;
          if (r.build === site.build) label = `<strong title="${esc(r.build)}">${esc(name)}</strong>`;
          else if (r.docs) label = `<a href="${r.docs}" title="${esc(r.build)}">${esc(name)}</a>`;
          else label = `<span class="rbuild" title="Scripts for this build are not in the Script Diff repository (${esc(r.build)})">${esc(name)}</span>`;
          const notes = r.url ? ` <a href="${r.url}" ${EXT}>release notes</a>` : '';
          return `<li>${label}<span class="rpatch">${esc(patch)}</span><span class="rdate">${esc(fmtDate(r.date))}</span>${notes}</li>`;
        })
        .join('\n');
      return `<details${version === site.version ? ' open' : ''}>
<summary>DayZ ${esc(version)}${title} <span class="count">${rows.size} build${rows.size === 1 ? '' : 's'}</span></summary>
<ul>
${items}
</ul>
</details>`;
    })
    .join('\n');
}

export function renderHome(ctx) {
  const { site, base, root, versions } = ctx;
  const s = site.stats;

  const stat = (n, label, href) =>
    `<a class="stat" href="${href}"><strong>${n.toLocaleString('en-US')}</strong><span>${label}</span></a>`;

  const linkCards = (links, ext = false) => `<div class="cards">
${links
  .map(
    ([label, url, desc]) => `<a class="card${ext ? ' card-ext' : ''}" href="${url}"${ext ? ` ${EXT}` : ''}>
  ${ext ? '<i class="ic ic-ext" aria-hidden="true"></i>\n  ' : ''}<h3>${esc(label)}</h3>
  <p>${esc(desc)}</p>
</a>`
  )
  .join('\n')}
</div>`;

  const explore = [
    ['PlayerBase', `${base}class/PlayerBase/`, 'The player entity'],
    ['ItemBase', `${base}class/ItemBase/`, 'Base of all items'],
    ['EntityAI', `${base}class/EntityAI/`, 'Base of interactive entities'],
    ['ActionBase', `${base}class/ActionBase/`, 'Player actions'],
    ['DayZInfected', `${base}class/DayZInfected/`, 'The infected'],
    ['CarScript', `${base}class/CarScript/`, 'Vehicles'],
  ];

  const releases = renderReleases(ctx);

  const thread = FORUM_THREADS[site.build];
  const buildLine = thread
    ? `<a href="${thread.url}" ${EXT}>${esc(site.build)}</a>`
    : `<strong>${esc(site.build)}</strong>`;

  const content = `
<section class="hero">
  <h1>Welcome</h1>
  <p>Browsable documentation for the DayZ Enforce Script sources — every class, method, enum and constant of DayZ ${esc(site.version)}, game build ${buildLine} (${esc(site.date)}), generated automatically from the official <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff" ${EXT}>DayZ&nbsp;Script&nbsp;Diff</a> repository.</p>
  <p>Made for anyone wandering the DayZ modding and scripting world, and meant to be quicker to browse than the raw sources. This is just the tip of the iceberg: there is no official detailed documentation on the subject, so community content is your best friend. Once you join one of the Discord servers below, check the pinned messages — most recurring questions are answered there.</p>
</section>
<div class="home-stack">
<section class="stats">
  ${stat(s.classes, 'classes', base + 'classes/')}
  ${stat(s.methods, 'methods', base + 'classes/fields/functions/')}
  ${stat(s.enums, 'enums', base + 'globals/enums/')}
  ${stat(s.typedefs, 'typedefs', base + 'globals/typedefs/')}
  ${stat(s.globals, 'constants', base + 'globals/constants/')}
  ${stat(s.files, 'script files', base + 'files/')}
</section>
<div class="cards">
  <a class="card" href="${base}modules/">
    <h3>Modules</h3>
    <p>The ${site.groups.size} topics the scripts group themselves into — math, physics, entities, UI and the constant tables.</p>
  </a>
  <a class="card" href="${base}classes/">
    <h3>Data Structures</h3>
    <p>All ${s.classes.toLocaleString('en-US')} classes, with an alphabetical index, the inheritance tree and every data field.</p>
  </a>
  <a class="card" href="${base}files/">
    <h3>Files</h3>
    <p>All ${s.files.toLocaleString('en-US')} script files with their sources, plus everything declared outside a class.</p>
  </a>
</div>
${linkCards(explore)}
</div>
<h2 id="official-links">Official links</h2>
${linkCards(OFFICIAL_LINKS, true)}
<h2 id="community-links">Community links</h2>
${linkCards(COMMUNITY_LINKS, true)}
<h2 id="changelog">PC Stable Changelog</h2>
<div class="releases">
${releases}
</div>
<h2 id="about">About</h2>
<p>This site is generated automatically from the official <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff/tree/main/scripts" ${EXT}>DayZ Script Diff</a> sources, so it covers what ships in the game's script files — engine internals are not part of it. It is actively maintained, so if you find a bug or have a suggestion, share it on <a href="${YADZ_DISCORD}" ${EXT}>YADZ's Discord</a>.</p>
<p class="muted">This is not an official documentation and it is not affiliated with <a href="https://dayz.com/" ${EXT}>DayZ</a> or <a href="https://www.bohemia.net/" ${EXT}>Bohemia Interactive</a>. The script sources shown here are © BOHEMIA INTERACTIVE a.s., all rights reserved, and are licensed under the <a href="https://www.bohemia.net/community/licenses/dayz-public-license-dpl" ${EXT}>DayZ Public License (DPL)</a>. They have been modified for presentation — parsed, reorganized and reformatted into these pages — from the originals in <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff/tree/main/scripts" ${EXT}>DayZ Script Diff</a>, and are offered as-is, without warranties of any kind. DAYZ®, ENFUSION® and BOHEMIA INTERACTIVE® are registered trademarks of BOHEMIA INTERACTIVE a.s. All other trademarks and copyrights are the property of their respective owners.</p>`;

  return layout({
    ...ctx,
    title: 'Welcome',
    active: '',
    footer: false,
    description: `DayZ ${site.version} Enforce Script API documentation — classes, methods, enums and sources.`,
    content,
  });
}

// ---------------------------------------------------------------------------

/** Row of A-Z shortcuts shared by the class and data-field indexes. */
function letterBar(base, dir, letters, current) {
  return `<div class="letters">${[...letters]
    .map(
      (l) =>
        `<a class="letter${l === current ? ' active' : ''}" href="${base}${dir}${l}/">${l === '_' ? '#' : l.toUpperCase()}</a>`
    )
    .join('')}</div>`;
}

const letterTitle = (l) => (l === '_' ? 'Other' : l.toUpperCase());

/** Data Structures: every class with its brief, the way Doxygen annotates them. */
export function renderAnnotated(ctx, letters) {
  const { site, base } = ctx;
  const sections = [...letters.entries()]
    .map(([l, names]) => {
      const rows = names
        .map((n) => {
          const c = site.classes.get(n);
          const brief = c.doc ? briefOf(c.doc, site, base) : '';
          const badges = (c.modded ? '<span class="badge badge-mod">modded</span>' : '') + condBadges(c.cond);
          return `<tr><td><a href="${base}class/${n}/">${esc(n)}</a>${badges}</td><td>${brief}</td></tr>`;
        })
        .join('\n');
      return `<h2 id="${l}">${letterTitle(l)} <span class="count">${names.length}</span></h2>
<table class="list"><tbody>${rows}</tbody></table>`;
    })
    .join('\n');
  const content = `
<h1>Data Structures <span class="count">${site.classes.size.toLocaleString('en-US')}</span></h1>
${letterBar(base, 'classes/', letters.keys())}
${filterBar('Filter classes…')}
${sections}`;
  return layout({
    ...ctx,
    title: 'Data Structures',
    active: 'classes/',
    description: `All ${site.classes.size} DayZ Enforce Script classes, with descriptions.`,
    breadcrumbs: [{ label: 'Data Structures' }],
    content,
  });
}

/** Data Structure Index: names only, which is what makes it quick to scan. */
export function renderClassesIndex(ctx, letters) {
  const { site, base } = ctx;
  const sections = [...letters.entries()]
    .map(
      ([l, names]) => `<h2 id="${l}"><a href="${base}classes/${l}/">${letterTitle(l)}</a> <span class="count">${names.length}</span></h2>
<div class="namegrid">${names.map((n) => `<a href="${base}class/${n}/">${esc(n)}</a>`).join('')}</div>`
    )
    .join('\n');
  const content = `
<h1>Data Structure Index <span class="count">${site.classes.size.toLocaleString('en-US')}</span></h1>
<p>All class names, alphabetically. Follow a letter for the same list with descriptions.</p>
${letterBar(base, 'classes/', letters.keys())}
${filterBar('Filter classes…')}
${sections}`;
  return layout({
    ...ctx,
    title: 'Data Structure Index',
    active: 'classes/index/',
    breadcrumbs: [{ label: 'Data Structures', href: `${base}classes/` }, { label: 'Index' }],
    content,
  });
}

export function renderClassesLetter(ctx, letter, names, letters) {
  const { site, base } = ctx;
  const rows = names
    .map((n) => {
      const c = site.classes.get(n);
      const brief = c.doc ? briefOf(c.doc, site, base) : '';
      const badges = (c.modded ? '<span class="badge badge-mod">modded</span>' : '') + condBadges(c.cond);
      return `<tr><td><a href="${base}class/${n}/">${esc(n)}</a>${badges}</td><td>${brief}</td></tr>`;
    })
    .join('\n');
  const content = `
<h1>Data Structures — ${letterTitle(letter)} <span class="count">${names.length}</span></h1>
${letterBar(base, 'classes/', letters, letter)}
${filterBar('Filter classes…')}
<table class="list"><tbody>${rows}</tbody></table>`;
  return layout({
    ...ctx,
    title: `Data Structures ${letterTitle(letter)}`,
    active: 'classes/',
    breadcrumbs: [
      { label: 'Data Structures', href: `${base}classes/` },
      { label: letterTitle(letter) },
    ],
    content,
  });
}

// ---------------------------------------------------------------------------

/** Data Fields: every member and method of every class, by initial.
 *  Letter pages are a shell; the rows are composed in the browser from
 *  search.json, the same way /class/<Name>/members/ is. */
export function renderFields(ctx, letter, letters, kind) {
  const { base } = ctx;
  const KINDS = {
    all: ['Data Fields', 'classes/fields/', 'Every member and method declared by a class.'],
    functions: ['Data Fields — Functions', 'classes/fields/functions/', 'Every method declared by a class.'],
    variables: ['Data Fields — Variables', 'classes/fields/variables/', 'Every variable and constant declared by a class.'],
  };
  const [title, dir, blurb] = KINDS[kind];
  const tabs = Object.entries(KINDS)
    .map(([k, [, d]]) => `<a class="tab${k === kind ? ' active' : ''}" href="${base}${d}">${k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1)}</a>`)
    .join('');

  const body = letter
    ? `<dl class="fields" id="fieldsList" data-kind="${kind}" data-letter="${esc(letter)}"></dl>
<p class="members-fallback">Assembling the list from the class index.</p>`
    : `<p class="muted">Pick a letter above.</p>`;

  const content = `
<h1>${title}${letter ? ` — ${letterTitle(letter)}` : ''}</h1>
<p>${blurb} The same name is often declared by many classes, so each one links to every class that has it.</p>
<div class="tabs">${tabs}</div>
${letterBar(base, dir, letters, letter)}
${letter ? filterBar('Filter fields…') : ''}
${body}`;
  return layout({
    ...ctx,
    title: letter ? `${title} ${letterTitle(letter)}` : title,
    active: dir,
    breadcrumbs: [
      { label: 'Data Structures', href: `${base}classes/` },
      { label: 'Data Fields', href: `${base}classes/fields/` },
      ...(letter ? [{ label: letterTitle(letter) }] : []),
    ],
    content,
  });
}

// ---------------------------------------------------------------------------

export function renderClass(ctx, cls) {
  const { site, base } = ctx;
  const used = new Set();

  // inheritance chain — hidden when the class stands alone, the same way a
  // one-level breadcrumb is hidden once the title has said the name.
  const ancestors = site.ancestorsOf(cls.name);
  const chain = ancestors.length
    ? `<p class="chain">${[cls.name, ...ancestors]
        .map((n, i) => {
          if (i === 0) return `<strong>${esc(n)}</strong>`;
          return site.classes.has(n) ? `<a href="${base}class/${n}/">${esc(n)}</a>` : esc(n);
        })
        .join(' <span class="chain-sep">›</span> ')}</p>`
    : '';

  // Only worth its own page when there is something above to inherit from;
  // without a base the list would be this page over again. Whether the chain
  // holds a documented class is already part of what this page depends on
  // (see classDeps), so the link cannot go stale.
  const allMembers = ancestors.some((n) => site.classes.has(n))
    ? `<p class="all-members"><a href="${base}class/${cls.name}/members/">All members, including inherited</a></p>`
    : '';

  const kids = site.children.get(cls.name) || [];
  const derived = kids.length
    ? `<details class="derived"><summary>Derived by ${kids.length} class${kids.length > 1 ? 'es' : ''}</summary>
<div class="derived-list">${kids.map((k) => `<a href="${base}class/${k}/">${esc(k)}</a>`).join(' ')}</div></details>`
    : '';

  const basesNote =
    cls.bases.length > 1
      ? `<p class="alt-bases">Base class depends on build flags: ${cls.bases
          .map((b) => `${linkType(b.base, site, base)}${condBadges(b.cond)}`)
          .join(' · ')}</p>`
      : '';

  const constants = cls.members.filter((m) => m.mods?.includes('const'));
  const vars = cls.members.filter((m) => !m.mods?.includes('const'));
  const ctors = cls.methods.filter((m) => m.kind === 'ctor' || m.kind === 'dtor');
  const methods = cls.methods.filter((m) => !m.kind);

  const memberBlock = (v) => {
    const id = anchorFor(used, v.name);
    const doc = v.doc ? `<div class="member-doc">${renderDoc(v.doc, site, base)}</div>` : '';
    return `<div class="member" id="${id}">
<div class="member-sig"><code>${varSig(v, site, base)}</code>${condBadges(v.cond)}<a class="anchor" href="#${id}" aria-label="Link to ${esc(v.name)}">#</a></div>
${doc}</div>`;
  };

  const methodBlock = (m) => {
    const id = anchorFor(used, m.name);
    const doc = m.doc ? `<div class="member-doc">${renderDoc(m.doc, site, base)}</div>` : '';
    const src = m.file
      ? `<a class="member-src" href="${fileLineHref(base, m.file, m.line)}" title="View source">src</a>`
      : '';
    return `<div class="member" id="${id}">
<div class="member-sig"><code>${methodSig(m, site, base)}</code>${condBadges(m.cond)}${src}<a class="anchor" href="#${id}" aria-label="Link to ${esc(m.name)}">#</a></div>
${doc}${referencesBlock(m, ctx, cls.name)}${callersBlock(m.name, ctx, cls.name)}</div>`;
  };

  const section = (title, items, block) =>
    items.length ? `<h2 id="${slug(title)}">${title} <span class="count">${items.length}</span></h2>\n${items.map(block).join('\n')}` : '';

  // A short class reads as a list; a long one has to be searched, and
  // PlayerBase alone declares 876 members.
  const total = cls.members.length + cls.methods.length;
  const filter = total >= 12
    ? filterBar(`Filter ${total.toLocaleString('en-US')} members…`, ACCESS_CHIPS)
    : '';

  const locations = locationLinks(
    site,
    base,
    cls.locations.filter((l) => !l.forward).concat(cls.locations.filter((l) => l.forward))
  );

  const module = cls.group && site.groups.has(cls.group)
    ? `<p class="in-module">Part of <a href="${base}modules/${cls.group}/">${esc(site.groups.get(cls.group).label)}</a></p>`
    : '';

  const badges =
    (cls.modded ? '<span class="badge badge-mod">modded</span>' : '') +
    modBadges(cls.mods) +
    condBadges(cls.cond);

  const attrs = cls.attrs.length
    ? `<pre class="attrs"><code>${cls.attrs.map(esc).join('\n')}</code></pre>`
    : '';

  const content = `
<h1 class="class-title"><span class="kw">class</span> ${esc(cls.name)}${cls.generics ? `<span class="generics">${esc(cls.generics)}</span>` : ''}${badges}</h1>
${chain}
${module}
${basesNote}
${allMembers}
${derived}
${attrs}
${cls.doc ? `<div class="class-doc">${renderDoc(cls.doc, site, base)}</div>` : ''}
${filter}
${section('Constants', constants, memberBlock)}
${section('Members', vars, memberBlock)}
${section('Constructors', ctors, methodBlock)}
${section('Methods', methods, methodBlock)}
<h2 id="defined-in">Defined in</h2>
<p class="locations">${locations}</p>`;

  const brief = cls.doc ? briefOf(cls.doc, null, base).replace(/<[^>]+>/g, '') : '';
  return layout({
    ...ctx,
    title: cls.name,
    active: 'classes/',
    description: brief || `${cls.name} class — DayZ Enforce Script API`,
    content,
  });
}

// ---------------------------------------------------------------------------

/**
 * Every member reachable on a class, its own and its ancestors'.
 *
 * The question this answers — "what can I actually call on this thing" — has
 * no answer anywhere else, on this site or on either of the Doxygen ones.
 * ItemBase is ItemBase › InventoryItem › EntityAI › Entity › ObjectTyped ›
 * Object › IEntity › Managed, and its own page shows one eighth of it.
 *
 * One row per name rather than per declaration, because that is what a call
 * site resolves to: the nearest class in the chain that declares the name
 * wins, and the ones it shadows are named beside it. Overloads collapse into
 * the row of the name they share, counted rather than repeated.
 */
export function renderClassMembers(ctx, cls) {
  const { site, base } = ctx;
  const chain = [cls.name, ...site.ancestorsOf(cls.name)].filter((n) => site.classes.has(n));

  // The rows are built in the browser, and the only thing shipped is the
  // chain to build them from.
  //
  // Written into the page instead, they cost 564 MB across one build: a
  // member appears once per class that inherits it, so the total is every
  // member times its descendants, and DayZ's hierarchies are both deep and
  // wide. The same rows composed from search.json — which already lists every
  // class's methods and fields with their owner, and which the page fetches
  // for the command palette regardless — cost nothing at all.
  //
  // What that trades away is the table for a reader without JavaScript. The
  // chain below is the honest fallback: every class in it is a link, and each
  // of those pages is static and lists its own members in full.
  const chainHtml = chain.length > 1
    ? `<p class="chain">${chain
        .map((n, i) => (i === 0 ? `<strong>${esc(n)}</strong>` : `<a href="${base}class/${n}/">${esc(n)}</a>`))
        .join(' <span class="chain-sep">›</span> ')}</p>`
    : '';

  const content = `
<h1>All members of ${esc(cls.name)}</h1>
${chainHtml}
<p>Everything callable on a <code>${esc(cls.name)}</code>, its own and everything it inherits from the ${(chain.length - 1).toLocaleString('en-US')} ${chain.length === 2 ? 'class' : 'classes'} above. Each name links to the class that declares it; where a name is declared more than once in the chain, the nearest one is the one that answers.</p>
<p><a href="${base}class/${cls.name}/">Back to ${esc(cls.name)}</a></p>
${filterBar('Filter members…')}
<table class="list all-members-table" id="allMembers" data-chain="${esc(chain.join(','))}">
<thead><tr><th>Member</th><th>Declared by</th><th></th></tr></thead>
<tbody></tbody></table>
<p class="members-fallback">Assembling the list from the class index. If it does not appear, each class in the chain above lists its own members in full.</p>`;

  return layout({
    ...ctx,
    title: `${cls.name} — all members`,
    active: 'classes/',
    description: `Every member of ${cls.name}, its own and those inherited from ${chain.slice(1).join(', ')}.`,
    content,
  });
}

// ---------------------------------------------------------------------------

export function renderEnum(ctx, en) {
  const { site, base } = ctx;
  const rows = en.values
    .map(
      (v) => `<tr id="${esc(v.name)}"><td><code>${esc(v.name)}</code>${condBadges(v.cond)}</td><td>${v.value !== undefined ? `<code class="lit">${esc(v.value)}</code>` : ''}</td><td>${v.doc ? renderDoc(v.doc, site, base) : ''}</td></tr>`
    )
    .join('\n');
  const content = `
<h1 class="class-title"><span class="kw">enum</span> ${esc(en.name)}${en.base ? ` <span class="chain-sep">:</span> ${linkType(en.base, site, base)}` : ''}${condBadges(en.cond)}</h1>
${en.doc ? `<div class="class-doc">${renderDoc(en.doc, site, base)}</div>` : ''}
<table class="list enum-table"><thead><tr><th>Name</th><th>Value</th><th></th></tr></thead><tbody>${rows}</tbody></table>
<h2>Defined in</h2>
<p class="locations">${locationLinks(site, base, en.locations)}</p>`;
  return layout({
    ...ctx,
    title: en.name,
    active: 'globals/enums/',
    breadcrumbs: [{ label: 'Enums', href: `${base}globals/enums/` }, { label: en.name }],
    content,
  });
}

// ---------------------------------------------------------------------------

// Everything declared outside a class, split the way Doxygen splits it.
const GLOBAL_KINDS = [
  ['', 'All'],
  ['functions/', 'Functions'],
  ['constants/', 'Constants'],
  ['typedefs/', 'Typedefs'],
  ['enums/', 'Enums'],
  ['values/', 'Values'],
  ['macros/', 'Macros'],
];

const byName = (a, b) => a.name.localeCompare(b.name);

/** The contents of each Globals tab, so the "All" tab can reuse them. */
function globalSections(ctx, site, base) {
  const src = (item) => `<a class="member-src" href="${fileLineHref(base, item.file, item.line)}">src</a>`;
  const used = new Set();

  const functions = [...site.functions].sort(byName).map((fn) => {
    const id = anchorFor(used, fn.name);
    const doc = fn.doc ? `<div class="member-doc">${renderDoc(fn.doc, site, base)}</div>` : '';
    return `<div class="member" id="${id}">
<div class="member-sig"><code>${methodSig(fn, site, base)}</code>${condBadges(fn.cond)}${src(fn)}<a class="anchor" href="#${id}">#</a></div>
${doc}${referencesBlock(fn, ctx)}${callersBlock(fn.name, ctx)}</div>`;
  });

  // Constants keep their module grouping: the sources organise them
  // into \defgroup blocks, and that is the only structure they have.
  const grouped = new Map();
  for (const g of site.globals) {
    const key = g.group || '';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(g);
  }
  const constants = [...grouped.entries()]
    .sort((a, b) => (site.groups.get(a[0])?.label || 'zzz').localeCompare(site.groups.get(b[0])?.label || 'zzz'))
    .map(([g, items]) => {
      const mod = site.groups.get(g);
      const heading = mod
        ? `<a href="${base}modules/${g}/">${esc(mod.label)}</a>`
        : 'Ungrouped';
      const rows = items
        .map(
          (v) => `<tr id="${esc(v.name)}"><td><code>${varSig(v, site, base)}</code>${condBadges(v.cond)}</td><td>${v.doc ? briefOf(v.doc, site, base) : ''}</td><td>${src(v)}</td></tr>`
        )
        .join('\n');
      return `<h3 id="${esc(g || 'ungrouped')}">${heading} <span class="count">${items.length}</span></h3>
<table class="list"><tbody>${rows}</tbody></table>`;
    })
    .join('\n');

  const typedefs = [...site.typedefs].sort(byName)
    .map(
      (t) => `<tr id="${esc(t.name)}"><td><code>${esc(t.name)}</code>${condBadges(t.cond)}</td><td><code>${linkType(t.type, site, base)}</code></td><td>${src(t)}</td></tr>`
    )
    .join('\n');

  const enums = [...site.enums.values()].sort(byName)
    .map(
      (e) => `<tr><td><a href="${base}enum/${e.name}/">${esc(e.name)}</a>${condBadges(e.cond)}</td><td>${e.values.length} values</td><td>${e.doc ? briefOf(e.doc, site, base) : ''}</td></tr>`
    )
    .join('\n');

  const values = [...site.enums.values()]
    .flatMap((e) => e.values.map((v) => ({ ...v, owner: e.name })))
    .sort((a, b) => a.name.localeCompare(b.name) || a.owner.localeCompare(b.owner))
    .map(
      (v) => `<tr><td><a href="${base}enum/${v.owner}/#${esc(v.name)}"><code>${esc(v.name)}</code></a></td><td><a href="${base}enum/${v.owner}/">${esc(v.owner)}</a></td><td>${v.value !== undefined ? `<code class="lit">${esc(v.value)}</code>` : ''}</td></tr>`
    )
    .join('\n');

  const macros = [...site.defines].sort(byName)
    .map(
      (d) => `<tr id="${esc(d.name)}"><td><code>${esc(d.name)}</code>${condBadges(d.cond)}</td><td>${d.value ? `<code class="lit">${esc(d.value)}</code>` : ''}</td><td>${src(d)}</td></tr>`
    )
    .join('\n');

  const table = (head, rows) =>
    rows ? `<table class="list">${head}<tbody>${rows}</tbody></table>` : '<p class="muted">None.</p>';

  return {
    functions: functions.length ? functions.join('\n') : '<p class="muted">None.</p>',
    constants: constants || '<p class="muted">None.</p>',
    typedefs: table('<thead><tr><th>Alias</th><th>Type</th><th></th></tr></thead>', typedefs),
    enums: table('', enums),
    values: table('<thead><tr><th>Name</th><th>Enum</th><th>Value</th></tr></thead>', values),
    macros: table('<thead><tr><th>Name</th><th>Value</th><th></th></tr></thead>', macros),
  };
}

export function renderGlobals(ctx, kind) {
  const { site, base } = ctx;
  const label = GLOBAL_KINDS.find(([k]) => k === kind)[1];
  const tabs = GLOBAL_KINDS.map(
    ([k, l]) => `<a class="tab${k === kind ? ' active' : ''}" href="${base}globals/${k}">${l}</a>`
  ).join('');

  const counts = {
    functions: site.functions.length,
    constants: site.globals.length,
    typedefs: site.typedefs.length,
    enums: site.enums.size,
    values: [...site.enums.values()].reduce((n, e) => n + e.values.length, 0),
    macros: site.defines.length,
  };
  const key = kind === '' ? null : kind.replace('/', '');

  // The "All" tab is an index of names rather than a copy of the six pages
  // below it: repeating them costs more bytes than the whole rest of the site.
  const names = {
    functions: [...site.functions].sort(byName).map((f) => [f.name, `globals/functions/#${f.name}`]),
    constants: [...site.globals].sort(byName).map((g) => [g.name, `globals/constants/#${g.name}`]),
    typedefs: [...site.typedefs].sort(byName).map((t) => [t.name, `globals/typedefs/#${t.name}`]),
    enums: [...site.enums.values()].sort(byName).map((e) => [e.name, `enum/${e.name}/`]),
    values: null, // 3.5k enumerators; the tab itself is the only sensible place
    macros: [...site.defines].sort(byName).map((d) => [d.name, `globals/macros/#${d.name}`]),
  };

  const body = key
    ? globalSections(ctx, site, base)[key]
    : GLOBAL_KINDS.slice(1)
        .map(([k, l]) => {
          const id = k.replace('/', '');
          const heading = `<h2 id="${id}"><a href="${base}globals/${k}">${l}</a> <span class="count">${counts[id].toLocaleString('en-US')}</span></h2>`;
          const list = names[id]
            ? `<div class="namegrid">${names[id].map(([n, href]) => `<a href="${base}${href}">${esc(n)}</a>`).join('')}</div>`
            : `<p class="muted"><a href="${base}globals/${k}">Browse all ${counts[id].toLocaleString('en-US')} values</a>.</p>`;
          return `${heading}\n${list}`;
        })
        .join('\n');

  const content = `
<h1>Globals${key ? ` — ${label}` : ''}${key ? ` <span class="count">${counts[key].toLocaleString('en-US')}</span>` : ''}</h1>
<div class="tabs">${tabs}</div>
${filterBar(`Filter ${key ? label.toLowerCase() : 'globals'}…`)}
${body}`;

  return layout({
    ...ctx,
    title: key ? `Globals — ${label}` : 'Globals',
    active: `globals/${kind}`,
    breadcrumbs: [
      { label: 'Files', href: `${base}files/` },
      { label: 'Globals', href: key ? `${base}globals/` : undefined },
      ...(key ? [{ label }] : []),
    ],
    content,
  });
}

// ---------------------------------------------------------------------------

export function renderFilesIndex(ctx) {
  const { site, base } = ctx;

  const fileRow = (f) => {
    const what = [
      f.counts.classes && `${f.counts.classes} classes`,
      f.counts.enums && `${f.counts.enums} enums`,
      f.counts.functions && `${f.counts.functions} functions`,
      f.counts.globals && `${f.counts.globals} globals`,
    ]
      .filter(Boolean)
      .join(', ');
    return `<li class="tree-file"><a href="${fileHref(base, f.path)}"><code>${esc(f.name)}</code></a>${what ? ` <span class="muted">${what}</span>` : ''}</li>`;
  };

  const dirNode = (d, depth) => `<li><details${depth < 1 ? ' open' : ''}><summary><code>${esc(d.name)}</code> <span class="count">${d.count.toLocaleString('en-US')}</span></summary>
<ul>${d.dirs.map((k) => dirNode(k, depth + 1)).join('')}${d.files.map(fileRow).join('')}</ul></details></li>`;

  const content = `
<h1>File List <span class="count">${site.files.length.toLocaleString('en-US')}</span></h1>
<p>Every script file, in the directory layout the game ships them in. Expand a directory to see its files.</p>
<div class="hierarchy-tools"><button id="expandAll" class="btn">Expand all</button> <button id="collapseAll" class="btn">Collapse all</button></div>
${filterBar('Filter files and directories…')}
<ul class="tree">${site.dirRoots.map((d) => dirNode(d, 0)).join('')}${site.rootFiles.map(fileRow).join('')}</ul>`;
  return layout({ ...ctx, title: 'File List', active: 'files/', breadcrumbs: [{ label: 'Files' }], content });
}

// ---------------------------------------------------------------------------

/** Modules: the \defgroup topics the sources declare, as a tree. */
export function renderModulesIndex(ctx) {
  const { site, base } = ctx;
  const node = (name, depth) => {
    const mod = site.groups.get(name);
    const total = site.moduleTotal(name);
    const link = `<a href="${base}modules/${name}/">${esc(mod.label)}</a>`;
    const count = total ? ` <span class="count">${total.toLocaleString('en-US')}</span>` : '';
    if (!mod.children.length) return `<li>${link}${count}</li>`;
    return `<li><details${depth < 1 ? ' open' : ''}><summary>${link}${count}</summary>
<ul>${mod.children.map((k) => node(k, depth + 1)).join('')}</ul></details></li>`;
  };
  const content = `
<h1>Modules <span class="count">${site.groups.size}</span></h1>
<p>Topics the scripts group themselves into with Doxygen <code>\\defgroup</code> blocks — mostly the engine-facing API and the constant tables. Classes and constants that belong to a topic link back to it.</p>
<div class="hierarchy-tools"><button id="expandAll" class="btn">Expand all</button> <button id="collapseAll" class="btn">Collapse all</button></div>
${filterBar('Filter topics…')}
<ul class="tree">${site.moduleRoots.map((n) => node(n, 0)).join('')}</ul>`;
  return layout({
    ...ctx,
    title: 'Modules',
    active: 'modules/',
    description: 'DayZ Enforce Script API grouped into modules: math, physics, entities, UI, constants and more.',
    breadcrumbs: [{ label: 'Modules' }],
    content,
  });
}

/**
 * The top-level topic a module sits under. The sidebar lists only those, so
 * this is what a nested topic's page highlights.
 */
function rootTopic(site, name) {
  let n = name;
  for (let p = site.groups.get(n)?.parent; p; p = site.groups.get(n)?.parent) n = p;
  return n;
}

export function renderModule(ctx, mod) {
  const { site, base } = ctx;

  const section = (title, body) => (body ? `<h2 id="${slug(title)}">${title}</h2>\n${body}` : '');
  const nameList = (names, kind) =>
    names.length
      ? `<div class="derived-list">${[...names]
          .sort((a, b) => a.localeCompare(b))
          .map((n) => `<a href="${base}${kind}/${n}/">${esc(n)}</a>`)
          .join(' ')}</div>`
      : '';

  const children = mod.children.length
    ? `<ul class="modkids">${mod.children
        .map((k) => {
          const kid = site.groups.get(k);
          const total = site.moduleTotal(k);
          return `<li><a href="${base}modules/${k}/">${esc(kid.label)}</a>${total ? ` <span class="count">${total}</span>` : ''}</li>`;
        })
        .join('')}</ul>`
    : '';

  const src = (item) => `<a class="member-src" href="${fileLineHref(base, item.file, item.line)}">src</a>`;
  const varRows = (items) =>
    items.length
      ? `<table class="list"><tbody>${[...items]
          .sort(byName)
          .map(
            (v) => `<tr id="${esc(v.name)}"><td><code>${varSig(v, site, base)}</code>${condBadges(v.cond)}</td><td>${v.doc ? briefOf(v.doc, site, base) : ''}</td><td>${src(v)}</td></tr>`
          )
          .join('\n')}</tbody></table>`
      : '';

  // Everything the topic declares, flattened the way Doxygen flattened it: a
  // group page there buckets members by shape rather than by owner, so a class
  // method sits under Functions beside a free one and an enum value sits under
  // Variables. Two sources feed it -- members the sources wrapped in their own
  // \defgroup away from the class holding them, which is how the big constants
  // classes are carved up, and the members of the classes the topic contains.
  const fnEntries = mod.functions.map((item) => ({ item, owner: null, method: true }));
  const varEntries = mod.globals.map((item) => ({ item, owner: null, method: false }));
  for (const m of mod.members) (m.method ? fnEntries : varEntries).push(m);
  for (const name of mod.classes) {
    const cls = site.classes.get(name);
    if (!cls) continue;
    for (const m of cls.methods) fnEntries.push({ item: m, owner: name, method: true });
    for (const v of cls.members) varEntries.push({ item: v, owner: name, method: false });
  }
  const byItemName = (a, b) => a.item.name.localeCompare(b.item.name) || (a.owner || '').localeCompare(b.owner || '');
  fnEntries.sort(byItemName);
  varEntries.sort(byItemName);

  const valueEntries = mod.enums
    .map((n) => [n, site.enums.get(n)])
    .flatMap(([n, en]) => (en?.values || []).map((v) => ({ item: v, owner: n, method: false })))
    .sort(byItemName);

  // Doxygen numbered same-named members [1/n] because its anchors were unique
  // but its headings were not; the same is needed here for GetName, which four
  // of the widget classes declare.
  const used = new Set();
  const seenCount = new Map();
  for (const e of [...fnEntries, ...varEntries, ...valueEntries]) {
    seenCount.set(e.item.name, (seenCount.get(e.item.name) || 0) + 1);
  }
  const numbering = new Map();
  for (const e of [...fnEntries, ...varEntries, ...valueEntries]) {
    e.id = anchorFor(used, e.item.name);
    const total = seenCount.get(e.item.name);
    if (total > 1) {
      const n = (numbering.get(e.item.name) || 0) + 1;
      numbering.set(e.item.name, n);
      e.ordinal = ` <span class="ordinal">[${n}/${total}]</span>`;
    }
  }

  const sigOf = (e) =>
    e.method ? methodSig(e.item, site, base) : e.item.value !== undefined || !e.item.type
      ? esc(e.item.name)
      : varSig(e.item, site, base);

  /** Doxygen's summary tables: signature, brief, and a link to the detail below. */
  const declTable = (entries) =>
    entries.length
      ? `<table class="list"><tbody>${entries
          .map(
            (e) => `<tr><td><code>${sigOf(e)}</code>${condBadges(e.item.cond)}</td><td>${
              e.item.doc ? briefOf(e.item.doc, site, base) : ''
            }</td><td><a class="member-src" href="#${e.id}">more…</a></td></tr>`
          )
          .join('\n')}</tbody></table>`
      : '';

  /** Doxygen's documentation sections: the full block, repeated on this page. */
  const defBlocks = (entries) =>
    entries.length
      ? entries
          .map((e) => {
            const owner = e.owner
              ? `<span class="owner-of">${
                  site.classes.has(e.owner)
                    ? `<a href="${base}class/${e.owner}/">${esc(e.owner)}</a>`
                    : site.enums.has(e.owner)
                      ? `<a href="${base}enum/${e.owner}/">${esc(e.owner)}</a>`
                      : esc(e.owner)
                }</span>`
              : '';
            const doc = e.item.doc ? `<div class="member-doc">${renderDoc(e.item.doc, site, base)}</div>` : '';
            const source = e.item.file ? src(e.item) : '';
            return `<div class="member" id="${e.id}">
<h3 class="member-name">${esc(e.item.name)}${e.ordinal || ''}${owner}</h3>
<div class="member-sig"><code>${sigOf(e)}</code>${condBadges(e.item.cond)}${source}<a class="anchor" href="#${e.id}">#</a></div>
${doc}${referencesBlock(e.item, ctx, e.owner)}${callersBlock(e.item.name, ctx, e.owner)}</div>`;
          })
          .join('\n')
      : '';

  const macroRows = mod.defines.length
    ? `<table class="list"><tbody>${[...mod.defines]
        .sort(byName)
        .map(
          (d) => `<tr id="${esc(d.name)}"><td><code>${esc(d.name)}</code>${condBadges(d.cond)}</td><td>${d.value ? `<code class="lit">${esc(d.value)}</code>` : ''}</td><td>${src(d)}</td></tr>`
        )
        .join('\n')}</tbody></table>`
    : '';

  const typedefRows = mod.typedefs.length
    ? `<table class="list"><tbody>${[...mod.typedefs]
        .sort(byName)
        .map(
          (t) => `<tr><td><code>${esc(t.name)}</code></td><td><code>${linkType(t.type, site, base)}</code></td><td>${src(t)}</td></tr>`
        )
        .join('\n')}</tbody></table>`
    : '';

  const parent = mod.parent && site.groups.has(mod.parent)
    ? `<p class="in-module">Part of <a href="${base}modules/${mod.parent}/">${esc(site.groups.get(mod.parent).label)}</a></p>`
    : '';

  const empty =
    !children && !mod.classes.length && !mod.enums.length && !mod.typedefs.length &&
    !varEntries.length && !fnEntries.length && !mod.defines.length
      ? '<p class="muted">Nothing in this build is filed under this module. The sources declare it, but everything it once held is commented out or has moved.</p>'
      : '';

  // The order is Doxygen's own, from group/memberdecl/* then group/memberdef/*
  // in src/layout.cpp: every declaration is summarised in a table first, then
  // documented in full below. That is why their group pages ran to 300 KB.
  const content = `
<h1>${esc(mod.label)}</h1>
${parent}
${mod.desc ? `<div class="class-doc">${renderDoc(mod.desc.replace(/[\\@](def|addto)group\s+\S+[^\n]*/, '').replace(/@[{}]/g, ''), site, base)}</div>` : ''}
${empty}
${fnEntries.length + varEntries.length + valueEntries.length >= 12 ? filterBar('Filter this topic…') : ''}
${section('Modules', children)}
${section('Data Structures', nameList(mod.classes, 'class'))}
${section('Macros', macroRows)}
${section('Typedefs', typedefRows)}
${section('Enums', nameList(mod.enums, 'enum'))}
${section('Values', declTable(valueEntries))}
${section('Functions', declTable(fnEntries))}
${section('Variables', declTable(varEntries))}
${section('Value Documentation', defBlocks(valueEntries))}
${section('Function Documentation', defBlocks(fnEntries))}
${section('Variable Documentation', defBlocks(varEntries))}`;

  return layout({
    ...ctx,
    title: mod.label,
    active: `modules/${rootTopic(site, mod.name)}/`,
    description: `${mod.label} — DayZ Enforce Script API module`,
    breadcrumbs: [{ label: 'Modules', href: `${base}modules/` }, { label: mod.label }],
    content,
  });
}

export function renderFile(ctx, fileEntry, fileModel, source) {
  const { base } = ctx;
  // fileEntry.display is derived from these same bytes plus the static
  // dictionary, so the page still depends on nothing but the source blob.
  const short = fileEntry.display;

  const declList = [];
  for (const c of fileModel.classes) {
    if (!declList.some((d) => d.name === c.name)) {
      declList.push({ kind: 'class', name: c.name, href: `${base}class/${c.name}/`, line: c.line });
    }
  }
  for (const e of fileModel.enums) declList.push({ kind: 'enum', name: e.name, href: `${base}enum/${e.name}/`, line: e.line });
  for (const t of fileModel.typedefs) declList.push({ kind: 'typedef', name: t.name, href: `${base}globals/typedefs/#${t.name}`, line: t.line });
  for (const fn of fileModel.functions) declList.push({ kind: 'func', name: fn.name + '()', href: `${base}globals/functions/#${fn.name}`, line: fn.line });

  const decls = declList.length
    ? `<div class="file-decls">${declList
        .map((d) => `<a href="${d.href}"><span class="kw">${d.kind}</span> ${esc(d.name)}</a>`)
        .join('')}</div>`
    : '';

  // Pinned to the exact build's commit by site/app.js; `main` is the fallback
  // for when it can't be, since the href must not name a build (see layout()).
  const github = `https://github.com/BohemiaInteractive/DayZ-Script-Diff/blob/main/${fileEntry.path}`;

  const content = `
<h1 class="file-title"><code>${esc(short)}</code></h1>
<p class="file-actions"><a id="ghSrc" href="${github}" ${EXT}>View source file on GitHub</a></p>
${decls}
<div class="srcwrap"><pre class="src" id="src"><code>${esc(source)}</code></pre></div>`;

  return layout({
    ...ctx,
    title: short,
    active: 'files/',
    breadcrumbs: [{ label: 'File List', href: `${base}files/` }, { label: short }],
    content,
  });
}

// ---------------------------------------------------------------------------

export function renderHierarchy(ctx) {
  const { site, base } = ctx;

  // Roots: classes whose base is unknown (engine/external) or absent.
  const roots = [];
  for (const [name, c] of site.classes) {
    if (!c.baseName || !site.classes.has(c.baseName)) roots.push(name);
  }
  roots.sort((a, b) => a.localeCompare(b));

  const renderNode = (name, depth) => {
    const kids = site.children.get(name) || [];
    const link = `<a href="${base}class/${name}/">${esc(name)}</a>`;
    if (!kids.length) return `<li>${link}</li>`;
    const open = depth < 1 ? ' open' : '';
    return `<li><details${open}><summary>${link} <span class="count">${kids.length}</span></summary>
<ul>${kids.map((k) => renderNode(k, depth + 1)).join('')}</ul></details></li>`;
  };

  const content = `
<h1>Class Hierarchy</h1>
<p>Expand a node to see the classes derived from it. Top-level entries either have no base class or extend an engine class that is not defined in scripts.</p>
<div class="hierarchy-tools"><button id="expandAll" class="btn">Expand all</button> <button id="collapseAll" class="btn">Collapse all</button></div>
${filterBar('Filter classes…')}
<ul class="tree">${roots.map((r) => renderNode(r, 0)).join('\n')}</ul>`;
  return layout({
    ...ctx,
    title: 'Class Hierarchy',
    active: 'hierarchy/',
    breadcrumbs: [{ label: 'Data Structures', href: `${base}classes/` }, { label: 'Class Hierarchy' }],
    content,
  });
}

// ---------------------------------------------------------------------------

/**
 * The changelog: an empty shell, filled in by site/compare.js.
 *
 * What changed between two builds a modder actually cares about, which is
 * usually the one they built against and the one their users are running.
 *
 * There are 49 builds, so 1,176 pairs, and generating a page per pair would
 * mean holding two 8 MB models in memory 1,176 times over. It also would not
 * survive the obvious next ask, three builds at once, which is 18,424 triples.
 * So the pair is chosen in the browser instead, which is also what makes the
 * URL shareable: /changelog/?from=…&to=… names a comparison, not a build.
 *
 * Nothing here names a build, for the same reason nothing else does: the
 * selects are filled from /assets/versions.json client-side, so these bytes
 * are identical in all 49 builds and keep their hard link. See layout() in
 * src/generate/html.js.
 */
export function renderCompare(ctx) {
  const { base } = ctx;
  const card = (side, label) => `<label class="cmp-pick" data-side="${side}">
  <span>${label}</span><select id="cmp${label}" aria-label="Compare ${side} build"></select>
</label>`;
  const content = `
<form class="cmp-stage" id="cmpBar" hidden>
  ${card('from', 'From')}
  <div class="cmp-mid">
    <button type="button" class="btn cmp-swap" id="cmpSwap" title="Swap the two builds" aria-label="Swap the two builds"><i class="ic ic-swap"></i></button>
    <span class="cmp-span" id="cmpSpan"></span>
    <button type="button" class="btn cmp-reset" id="cmpReset" hidden>Reset</button>
  </div>
  ${card('to', 'To')}
</form>
<noscript><p>The changelog is built in the browser and needs JavaScript.</p></noscript>
<div class="cmp" id="compare" aria-live="polite" aria-busy="true"><p class="muted">Loading builds…</p></div>`;
  return layout({
    ...ctx,
    title: 'Changelog',
    active: 'changelog/',
    description: 'What changed in the DayZ Enforce Script API between two game builds.',
    breadcrumbs: [{ label: 'Changelog' }],
    content,
  });
}

export function render404(ctx) {
  const content = `
<h1>Page not found</h1>
<p>This page doesn't exist in this version of the documentation. It may have been added in a newer DayZ version, or removed.</p>
<p><a href="${ctx.root}">Go to the latest documentation</a> or use the search box above.</p>`;
  return layout({ ...ctx, title: 'Not found', noindex: true, content });
}
