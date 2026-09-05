// Everything under /classes/: the annotated list, the name-only index, the
// per-letter pages, and the member indexes under /classes/.
//
// One class's own page is render/class.js.

import { esc, layout, condBadges, briefOf } from '../html.js';
import { classTabs, letterTitle, pageBar } from './pagebar.js';

/** Classes: every class with its brief, the way Doxygen annotates them. */
export function renderAnnotated(ctx, letters) {
  const { site, base } = ctx;
  const sections = [...letters.entries()]
    .map(([l, names]) => {
      const rows = names
        .map((n) => {
          const c = site.classes.get(n);
          const brief = c.doc ? briefOf(c.doc, site, base) : '';
          const badges = (c.modded ? '<span class="badge badge-mod">modded</span>' : '') + condBadges(c.cond, base);
          return `<tr><td><a href="${base}classes/${n}/">${esc(n)}</a>${badges}</td><td>${brief}</td></tr>`;
        })
        .join('\n');
      return /* html */ `<h2 id="${l}">${letterTitle(l)} <span class="count">${names.length}</span></h2>
<table class="list"><tbody>${rows}</tbody></table>`;
    })
    .join('\n');
  const content = /* html */ `
<h1>Classes <span class="count">${site.classes.size.toLocaleString('en-US')}</span></h1>
${sections}`;
  return layout({
    ...ctx,
    title: 'Classes',
    active: 'classes/',
    bar: pageBar({ tabs: classTabs(base, 'classes/') }),
    description: `All ${site.classes.size} DayZ Enforce Script classes, with descriptions.`,
    breadcrumbs: [{ label: 'Classes' }],
    content,
  });
}

/** Class Index: names only, which is what makes it quick to scan. */
export function renderClassesIndex(ctx, letters) {
  const { site, base } = ctx;
  const sections = [...letters.entries()]
    .map(
      ([l, names]) => /* html */ `<h2 id="${l}"><a href="${base}classes/${l}/">${letterTitle(l)}</a> <span class="count">${names.length}</span></h2>
<div class="namegrid">${names.map((n) => `<a href="${base}classes/${n}/">${esc(n)}</a>`).join('')}</div>`
    )
    .join('\n');
  const content = /* html */ `
<h1>Class Index <span class="count">${site.classes.size.toLocaleString('en-US')}</span></h1>
<p>All class names, alphabetically. Follow a letter for the same list with descriptions.</p>
${sections}`;
  return layout({
    ...ctx,
    title: 'Class Index',
    active: 'classes/index/',
    bar: pageBar({ tabs: classTabs(base, 'classes/index/') }),
    breadcrumbs: [{ label: 'Classes', href: `${base}classes/` }, { label: 'Index' }],
    content,
  });
}

export function renderClassesLetter(ctx, letter, names, letters) {
  const { site, base } = ctx;
  const rows = names
    .map((n) => {
      const c = site.classes.get(n);
      const brief = c.doc ? briefOf(c.doc, site, base) : '';
      const badges = (c.modded ? '<span class="badge badge-mod">modded</span>' : '') + condBadges(c.cond, base);
      return `<tr><td><a href="${base}classes/${n}/">${esc(n)}</a>${badges}</td><td>${brief}</td></tr>`;
    })
    .join('\n');
  const content = /* html */ `
<h1>Classes — ${letterTitle(letter)} <span class="count">${names.length}</span></h1>
<table class="list"><tbody>${rows}</tbody></table>`;
  return layout({
    ...ctx,
    title: `Classes ${letterTitle(letter)}`,
    active: 'classes/',
    bar: pageBar({ tabs: classTabs(base, `classes/${letter}/`) }),
    breadcrumbs: [
      { label: 'Classes', href: `${base}classes/` },
      { label: letterTitle(letter) },
    ],
    content,
  });
}

/** Members: every member and method of every class, by initial.
 *  Letter pages are a shell; the rows are composed in the browser from
 *  search.json by site/app/members.js, the same way /classes/<Name>/members/ is. */
export function renderFields(ctx, letter, letters, kind) {
  const { base } = ctx;
  const KINDS = {
    all: ['Members', 'classes/members/'],
    functions: ['Methods', 'classes/methods/'],
    variables: ['Fields', 'classes/fields/'],
  };
  const [title, dir] = KINDS[kind];

  const content = /* html */ `
<h1>${title}${letter ? ` — ${letterTitle(letter)}` : ''}</h1>
<dl class="fields" id="fieldsList" data-kind="${kind}"${letter ? ` data-letter="${esc(letter)}"` : ''}></dl>
<p class="members-fallback">${letter ? 'Assembling the list from the class index.' : 'Pick a letter.'}</p>`;
  return layout({
    ...ctx,
    title: letter ? `${title} ${letterTitle(letter)}` : title,
    active: dir,
    bar: pageBar({
      tabs: classTabs(base, dir),
      letters: { base, dir, list: letters, current: letter },
    }),
    content,
  });
}
