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
 *
 * Behaviour is site/app/filter.js (what the field and the chips do) and
 * site/app/pagebar.js (the bar itself).
 */

import { esc } from '../html.js';

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

export const letterTitle = (l) => (l === '_' ? 'Other' : l.toUpperCase());

/** Sibling pages of the one you are on: the Globals kinds, the Members kinds. */
const tabStrip = (tabs) =>
  /* html */ `<nav class="pb-tabs" aria-label="Sections">${tabs
    .map(
      ([href, label, on]) =>
        `<a class="pb-tab${on ? ' active' : ''}" href="${href}"${on ? ' aria-current="page"' : ''}>${esc(label)}</a>`
    )
    .join('')}</nav>`;

/** A–Z shortcuts, on the indexes that are split a letter to a page. */
const letterStrip = ({ base, dir, list, current }) =>
  /* html */ `<nav class="pb-letters" aria-label="By letter">${[...list]
    .map(
      (l) =>
        `<a class="pb-letter${l === current ? ' active' : ''}" href="${base}${dir}${l}/"${l === current ? ' aria-current="page"' : ''}>${l === '_' ? '#' : l.toUpperCase()}</a>`
    )
    .join('')}</nav>`;

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
<button type="button" class="pb-search-btn" aria-label="${esc(placeholder)}" aria-expanded="false" aria-controls="pageFilter"><i class="ic ic-search" aria-hidden="true"></i></button>
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
 * - `letters` { base, dir, list, current } — the A–Z row
 *
 * The letters are a row of their own: twenty-seven of them never fit beside a
 * field. Everything else shares the first row. The field leads — it is the
 * thing you reach for — and the chips sit next to it because they narrow it.
 */
export function pageBar({ tabs, tools, filter, chips, letters } = {}) {
  const row = [
    filter ? filterField(filter) : '',
    chips?.length ? chipRow(chips) : '',
    tabs?.length ? tabStrip(tabs) : '',
    tools ? treeTools() : '',
  ].join('');
  const rows = `${row ? `<div class="pb-row">${row}</div>` : ''}${letters ? letterStrip(letters) : ''}`;
  return rows ? `<div class="pagebar">${rows}</div>` : '';
}
