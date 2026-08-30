// The inheritance tree at /hierarchy/.

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

  const renderNode = (name, depth) => {
    const kids = site.children.get(name) || [];
    const link = `<a href="${base}classes/${name}/">${esc(name)}</a>`;
    if (!kids.length) return `<li>${link}</li>`;
    const open = depth < 1 ? ' open' : '';
    return /* html */ `<li><details${open}><summary>${link} <span class="count">${kids.length}</span></summary>
<ul>${kids.map((k) => renderNode(k, depth + 1)).join('')}</ul></details></li>`;
  };

  const content = /* html */ `
<h1>Hierarchy</h1>
<ul class="tree">${roots.map((r) => renderNode(r, 0)).join('\n')}</ul>`;
  return layout({
    ...ctx,
    title: 'Hierarchy',
    active: 'hierarchy/',
    bar: pageBar({ tabs: classTabs(base, 'hierarchy/') }),
    content,
  });
}
