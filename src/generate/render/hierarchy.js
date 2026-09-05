// The inheritance tree at /classes/hierarchy/.

import { esc, layout } from '../html.js';
import { classTabs, pageBar } from './pagebar.js';

export function renderHierarchy(ctx) {
  const { site, base } = ctx;

  // Roots: classes whose base is unknown (engine/external) or absent.
  const roots = [];
  for (const [name, c] of site.classes) {
    if (!c.baseName || !site.classes.has(c.baseName)) roots.push(name);
  }
  roots.sort((a, b) => a.localeCompare(b));

  const kidsOf = (name) => site.children.get(name) || [];
  const kid = (name) => {
    const n = kidsOf(name).length;
    const count = n ? ` <span class="count">${n}</span>` : '';
    return `<li><a href="${base}classes/${name}/">${esc(name)}</a>${count}</li>`;
  };
  const root = (name) => {
    const kids = kidsOf(name);
    const n = kids.length;
    const link = `<a href="${base}classes/${name}/">${esc(name)}</a>`;
    const count = n ? `<span class="count">${n}</span>` : '';
    let childList = '';
    if (n) {
      const list = `<ul class="catalog-kids">${kids.map(kid).join('')}</ul>`;
      childList = n > 8
        ? `<details class="catalog-more"><summary>${n} classes</summary>${list}</details>`
        : list;
    }
    return `<li><div class="catalog-head">${link}${count}</div>${childList}</li>`;
  };

  const sections = new Map();
  for (const name of roots) {
    const first = name[0]?.toUpperCase();
    const letter = first && /[A-Z]/.test(first) ? first : '#';
    if (!sections.has(letter)) sections.set(letter, []);
    sections.get(letter).push(name);
  }

  const content = /* html */ `
<h1>Hierarchy <span class="count">${site.classes.size.toLocaleString('en-US')}</span></h1>
${[...sections]
    .map(([letter, names]) => `<h2 id="hierarchy-${letter === '#' ? 'other' : letter.toLowerCase()}">${letter} <span class="count">${names.length.toLocaleString('en-US')}</span></h2>
<ul class="catalog">${names.map(root).join('')}</ul>`)
    .join('\n')}`;
  return layout({
    ...ctx,
    title: 'Hierarchy',
    active: 'classes/hierarchy/',
    bar: pageBar({ tabs: classTabs(base, 'classes/hierarchy/') }),
    content,
  });
}
