// The pieces more than one page renderer needs: how a name becomes an anchor,
// how a script path becomes a URL, and the two cross-reference blocks that
// hang off every documented declaration.
//
// Page bodies themselves live one file per page beside this one; see the
// "Where is the HTML?" section of CONTRIBUTING.md.

import { esc, EXT } from '../html.js';
import { FORUM_THREADS, VERSION_TITLES } from '../content.js';

export function anchorFor(used, name) {
  let a = name.replace(/[^\w]/g, '_');
  if (used.has(a)) {
    let i = 2;
    while (used.has(`${a}-${i}`)) i++;
    a = `${a}-${i}`;
  }
  used.add(a);
  return a;
}

/**
 * How a script path is spelled, for the reader and in its URL alike: the
 * game's own capitalisation, restored from the lowercase spelling the sources
 * we parse use (see src/generate/casing.js).
 */
export function shown(site, path) {
  return site.paths.get(path) || path.replace(/^scripts\//, '');
}

/**
 * A file's URL, spelled the way the game's own tree spells it, which is also
 * the way the page displays it and the way every other kind of page names
 * itself: /files/1_Core/WorkbenchApi.c/ beside /classes/PlayerBase/. The sources
 * we parse lowercase every path, so this goes through src/generate/casing.js
 * to get the capitalisation back; site/notfound.js forwards the lowercase
 * spelling, and any older one, to whatever the current build calls it.
 */
export function fileHref(site, base, path) {
  return `${base}files/${shown(site, path)}/`;
}

export function fileLineHref(site, base, path, line) {
  return `${fileHref(site, base, path)}#L${line}`;
}

/** Source link for a declaration, labelled with its path and line. */
export function locationLinks(site, base, locations) {
  return locations
    .map(
      (l) =>
        `<a href="${fileLineHref(site, base, l.path, l.line)}"><code>${esc(shown(site, l.path))}</code>:${l.line}</a>` +
        (l.forward ? ' <span class="muted">(declaration)</span>' : '')
    )
    .join('<br>');
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
export function writeList(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** A name inside a reference list. Doxygen prints the scope only when it is
 *  not the scope of the page you are on, closes every function with "()", and
 *  falls back to plain text when the name will not resolve. */
export function refName(owner, name, scope, base, linked) {
  const label = owner && owner !== scope ? `<span class="xref-owner">${esc(owner)}.</span>${esc(name)}()` : `${esc(name)}()`;
  if (!linked) return label;
  const anchor = name.replace(/[^\w]/g, '_');
  const href = owner ? `${base}classes/${owner}/#${anchor}` : `${base}globals/functions/#${anchor}`;
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
export function callersBlock(name, ctx, scope = null) {
  const { site, base } = ctx;
  if (!ctx.xref) return '';
  const list = site.callers?.get(name);
  if (!list?.length) return '';

  const link = (c) => refName(c.owner || null, c.name, scope, base, true);
  const extra = list.length - CALLERS_SHOWN;
  // "and" belongs before the last entry only when the last entry is shown;
  // a truncated head runs on into the "and N more" that follows it.
  const first = list.slice(0, CALLERS_SHOWN).map(link);
  const head = extra <= 0 ? writeList(first) : first.join(', ');
  const rest =
    extra <= 0
      ? '.'
      : list.length <= CALLERS_LISTED
        ? `, <details class="xref-more"><summary>and ${extra} more</summary>${writeList(list.slice(CALLERS_SHOWN).map(link))}.</details>`
        : `, <span class="xref-rest">and ${extra.toLocaleString()} more.</span>`;
  return /* html */ `<div class="xref"><span class="xref-label" title="Matched by name: the sources are not type-checked, so every method of this name is gathered">Referenced by</span> ${head}${rest}</div>`;
}

/**
 * What a body calls, which is Doxygen's "References". The parser records the
 * names a body names without resolving what they are called on, so a name is
 * linked only where one declaration in the build answers to it (83% of them);
 * the rest print as plain text, which is what definition.cpp does with a name
 * it cannot link either.
 */
export function referencesBlock(item, ctx, scope = null) {
  const { site, base } = ctx;
  if (!ctx.xref || !item.calls?.length) return '';
  const items = item.calls.map((n) => {
    const t = site.refTargets?.get(n);
    return refName(t?.owner || null, n, scope, base, Boolean(t));
  });
  return /* html */ `<div class="xref xref-out"><span class="xref-label">References</span> ${writeList(items)}.</div>`;
}

/**
 * Grid of [label, url, description, extras?] cards. `ext` marks them as
 * leaving. extras is optional [['GitHub', url], ...] so a project site and
 * its repo share one card instead of two.
 */
export function linkCards(links, ext = false) {
  return /* html */ `<div class="cards">
${links.map((link) => linkCard(link, ext)).join('\n')}
</div>`;
}

function linkCard([label, url, desc, extras], ext) {
  const attrs = ext ? ` ${EXT}` : '';
  const icon = ext ? '<i class="ic ic-ext" aria-hidden="true"></i>\n  ' : '';
  const body = `<h3>${esc(label)}</h3>
  <p>${esc(desc)}</p>`;
  if (!extras?.length) {
    return `<a class="card${ext ? ' card-ext' : ''}" href="${esc(url)}"${attrs}>
  ${icon}${body}
</a>`;
  }
  const also = extras
    .map(([name, href]) => `<a class="card-also" href="${esc(href)}"${attrs}>${esc(name)}</a>`)
    .join(' ');
  return `<div class="card${ext ? ' card-ext' : ''}">
  ${icon}<a class="card-main" href="${esc(url)}"${attrs}>
  ${body}
  </a>
  ${also}
</div>`;
}

export const byName = (a, b) => a.name.localeCompare(b.name);

export function fmtDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

const buildNo = (build) => Number(build.split('.')[2] || 0);
const versionNo = (version) => {
  const [major, minor] = version.split('.').map(Number);
  return major * 1000 + minor;
};

/** "1.29 Update 1" from the oldest of that version. `builds` is newest-first. */
export function updateNames(builds) {
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
 * Official PC stable releases, grouped by game version: every build we
 * document, merged with the forum threads. Builds whose scripts never reached
 * the Script Diff repository still show up, with their thread only.
 *
 * `highlight` marks the build this page was generated for. /changelog/ does
 * not: those bytes have to stay identical across builds (see layout() in
 * html.js), so no group is left open and docs links are rooted at `/`.
 */
export function renderReleases(ctx, { highlight = true, absolute = false } = {}) {
  const { site, root, versions } = ctx;
  const names = updateNames(versions);
  const groups = new Map();
  const rowsFor = (version) => {
    if (!groups.has(version)) groups.set(version, new Map());
    return groups.get(version);
  };

  versions.forEach((v, i) => {
    const href = absolute
      ? (i === 0 ? '/' : `/v/${v.label}/`)
      : (i === 0 ? root : `${root}v/${v.label}/`);
    rowsFor(v.version).set(v.build, { build: v.build, date: v.date, docs: href });
  });

  for (const [build, thread] of Object.entries(FORUM_THREADS)) {
    const version = build.split('.').slice(0, 2).join('.');
    const rows = rowsFor(version);
    const row = rows.get(build) || { build, date: thread.date };
    row.url = thread.url;
    rows.set(build, row);
  }

  const openAt = highlight ? site.version : null;

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
          if (highlight && r.build === site.build) label = `<strong title="${esc(r.build)}">${esc(name)}</strong>`;
          else if (r.docs) label = `<a href="${r.docs}" title="${esc(r.build)}">${esc(name)}</a>`;
          else label = `<span class="rbuild" title="Scripts for this build are not in the Script Diff repository (${esc(r.build)})">${esc(name)}</span>`;
          const notes = r.url ? ` <a href="${r.url}" ${EXT}>release notes</a>` : '';
          return `<li>${label}<span class="rpatch">${esc(patch)}</span><span class="rdate">${esc(fmtDate(r.date))}</span>${notes}</li>`;
        })
        .join('\n');
      return /* html */ `<details${version === openAt ? ' open' : ''}>
<summary>DayZ ${esc(version)}${title} <span class="count">${rows.size} build${rows.size === 1 ? '' : 's'}</span></summary>
<ul>
${items}
</ul>
</details>`;
    })
    .join('\n');
}
