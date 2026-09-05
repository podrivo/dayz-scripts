/* The secondary bar every long page wears, under the site nav.
 *
 * Doxygen scattered these: a tab strip here, an A–Z row there, and each page
 * decided for itself where they went. Everything that acts on the page you
 * are already on is gathered into one strip instead, in one place, in one
 * order — so a reader learns where the controls are once, and a new control
 * is added here rather than in six renderers.
 *
 * A page asks for the parts it needs and layout() puts the result at the top
 * of <main>, above the title; see pageInner() in src/generate/html.js. It is
 * sticky, so it is still there once the page it narrows has scrolled past.
 * A section with kinds (Classes, Files, Globals) asks for those kinds as
 * `tabs`. Letters are only for the members index.
 *
 * Behaviour is site/app/pagebar.js.
 */

import { esc } from '../html.js';

export const letterTitle = (l) => (l === '_' ? 'Other' : l.toUpperCase());

/** Sibling pages of the one you are on: the Globals kinds, the Members kinds. */
const tabStrip = (tabs) =>
  /* html */ `<nav class="pb-tabs" aria-label="Sections">${tabs
    .map(
      ([href, label, on]) =>
        `<a class="pb-tab${on ? ' active' : ''}" href="${href}"${on ? ' aria-current="page"' : ''}>${esc(label)}</a>`
    )
    .join('')}</nav>`;

/** Letter strip, only on the members index — that list cannot fit on one page. */
const letterRow = ({ base, dir, list, current }) => {
  const links = [...list]
    .map((l) => {
      const text = l === '_' ? '#' : l.toUpperCase();
      const on = l === current;
      return `<a class="pb-letter${on ? ' active' : ''}" href="${base}${dir}${l}/"${on ? ' aria-current="page"' : ''}>${text}</a>`;
    })
    .join('');
  return /* html */ `<nav class="pb-letters" aria-label="By letter">${links}</nav>`;
};

/** Sibling kinds of the Classes section. */
export function classTabs(base, active) {
  return [
    ['classes/', 'All'],
    ['classes/hierarchy/', 'Hierarchy'],
    ['classes/members/', 'Members'],
    ['classes/methods/', 'Methods'],
    ['classes/fields/', 'Fields'],
  ].map(([href, label]) => {
    const on =
      href === 'classes/'
        ? active === 'classes/' || active === 'classes/index/' || /^classes\/[a-z_]\//.test(active)
        : href === 'classes/members/'
          ? active === 'classes/members/' || /^classes\/members\/[a-z_]\//.test(active)
          : active === href || active.startsWith(href);
    return [`${base}${href}`, label, on];
  });
}

const chipRow = (chips) =>
  /* html */ `<div class="pb-chips">${chips
    .map(
      ([mod, label], i) =>
        `<button type="button" class="pf${i ? '' : ' active'}" data-mod="${esc(mod)}" aria-pressed="${!i}">${esc(label)}</button>`
    )
    .join('')}</div>`;

/**
 * Build a page's bar. Everything is optional; a page passes only the parts it
 * has, and a page with none of them gets no bar at all.
 *
 * - `tabs`    [href, label, active][] — the sibling pages of this one
 * - `chips`   [modifier, label][] — what the list can be narrowed to
 * - `letters` { base, dir, list, current } — the members-index letters
 *
 * Tabs and chips share a row. Letters are a second row: twenty-seven of them
 * never fit beside the tabs, and a strip is how they stay visible.
 */
export function pageBar({ tabs, chips, letters } = {}) {
  const row = [
    chips?.length ? chipRow(chips) : '',
    tabs?.length ? tabStrip(tabs) : '',
  ].join('');
  const az = letters ? letterRow(letters) : '';
  if (!row && !az) return '';
  return `<div class="pagebar">${row ? `<div class="pb-row">${row}</div>` : ''}${az}</div>`;
}
