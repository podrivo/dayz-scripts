/* The secondary bar every long page wears, under the site nav.
 *
 * Doxygen scattered these: a tab strip here, an A–Z row there, a filter field
 * somewhere below the intro paragraph, and each page decided for itself where
 * they went. Everything that acts on the page you are already on is gathered
 * into one strip instead, in one place, in one order — so a reader learns
 * where the controls are once, and a new control is added here rather than in
 * six renderers.
 *
 * A page asks for the parts it needs and layout() puts the result at the top
 * of <main>, above the title; see pageInner() in src/generate/html.js. It is
 * sticky, so it is still there once the page it narrows has scrolled past.
 * A section with kinds (Classes, Files, Globals) asks for those kinds as
 * `tabs`; Topics asks for the filter and the expand tools. Letters are
 * only for the members index.
 *
 * Behaviour is site/app/filter.js (what the field and the chips do) and
 * site/app/pagebar.js (the bar itself).
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

/** Letter picker, only on the members index — that list cannot fit on one page. */
const letterPick = ({ base, dir, list, current }) => {
  const label = !current ? 'Letter' : current === '_' ? '#' : current.toUpperCase();
  const links = [...list]
    .map((l) => {
      const text = l === '_' ? '#' : l.toUpperCase();
      const on = l === current;
      return `<a class="pb-letter${on ? ' active' : ''}" href="${base}${dir}${l}/"${on ? ' aria-current="page"' : ''}>${text}</a>`;
    })
    .join('');
  return /* html */ `<details class="pb-pick"><summary>${esc(label)}</summary><nav class="pb-pick-menu" aria-label="By letter">${links}</nav></details>`;
};

/** Sibling kinds of the Classes section, the same list the header menu holds. */
export function classTabs(base, active) {
  return [
    ['classes/', 'Classes'],
    ['hierarchy/', 'Hierarchy'],
    ['classes/fields/', 'Members'],
    ['classes/fields/functions/', 'Methods'],
    ['classes/fields/variables/', 'Fields'],
  ].map(([href, label]) => {
    const on =
      href === 'classes/'
        ? active === 'classes/' || active === 'classes/index/' || /^classes\/[a-z_]\//.test(active)
        : href === 'classes/fields/'
          ? active === 'classes/fields/' || /^classes\/fields\/[a-z_]\//.test(active)
          : active === href || active.startsWith(href);
    return [`${base}${href}`, label, on];
  });
}

/** Expand all / collapse all, on the pages that ship a tree. */
const treeTools = () =>
  /* html */ `<div class="pb-tools"><button type="button" id="expandAll" class="btn">Expand all</button><button type="button" id="collapseAll" class="btn">Collapse all</button></div>`;

/**
 * The type-to-filter field.
 *
 * An index of six thousand classes, a tree of two thousand files or a class
 * with nine hundred members is only navigable if you can narrow it, and every
 * one of those pages already holds everything it would need to: the filtering
 * is done in the browser over the rows, chips, tree nodes and member blocks
 * that are on the page, so it costs no bytes beyond this field and works
 * offline.
 *
 * An icon until you ask for it, wearing the header search trigger's box.
 * The field is already in the markup — site/app/filter.js looks it up by
 * id — and site/app/pagebar.js opens the box around it.
 */
const filterField = (placeholder) =>
  /* html */ `<div class="pb-filter">
<button type="button" class="pb-search-btn" aria-label="${esc(placeholder)}" aria-expanded="false" aria-controls="pageFilter" data-tip="Filter this page"><i class="ic ic-search" aria-hidden="true"></i></button>
<input type="search" id="pageFilter" class="pb-input" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" aria-label="${esc(placeholder)}" tabindex="-1">
<span class="pb-count" id="filterCount" aria-live="polite"></span>
</div>`;

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
 * - `tools`   true for expand all / collapse all
 * - `filter`  the placeholder of the type-to-filter field
 * - `chips`   [modifier, label][] — what the filter can be narrowed to
 * - `letters` { base, dir, list, current } — the members-index letter picker
 *
 * One row. The field leads — it is the thing you reach for — and the chips
 * sit next to it because they narrow it. Letters are a menu, not a strip:
 * twenty-seven of them never fit beside a field.
 */
export function pageBar({ tabs, tools, filter, chips, letters } = {}) {
  const row = [
    filter ? filterField(filter) : '',
    chips?.length ? chipRow(chips) : '',
    tabs?.length ? tabStrip(tabs) : '',
    letters ? letterPick(letters) : '',
    tools ? treeTools() : '',
  ].join('');
  return row ? `<div class="pagebar"><div class="pb-row">${row}</div></div>` : '';
}
