// The pieces more than one page renderer needs: how a name becomes an anchor,
// how a script path becomes a URL, and the two cross-reference blocks that
// hang off every documented declaration.
//
// Page bodies themselves live one file per page beside this one; see the
// "Where is the HTML?" section of CONTRIBUTING.md.

import { esc, EXT } from '../html.js';

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
 * itself: /files/1_Core/WorkbenchApi.c/ beside /class/PlayerBase/. The sources
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

/** Grid of [label, url, description] cards. `ext` marks them as leaving. */
export function linkCards(links, ext = false) {
  return /* html */ `<div class="cards">
${links
  .map(
    ([label, url, desc]) => `<a class="card${ext ? ' card-ext' : ''}" href="${url}"${ext ? ` ${EXT}` : ''}>
  ${ext ? '<i class="ic ic-ext" aria-hidden="true"></i>\n  ' : ''}<h3>${esc(label)}</h3>
  <p>${esc(desc)}</p>
</a>`
  )
  .join('\n')}
</div>`;
}

export const byName = (a, b) => a.name.localeCompare(b.name);
