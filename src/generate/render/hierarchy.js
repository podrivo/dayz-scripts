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
    const link = `<a href="${base}class/${name}/">${esc(name)}</a>`;
    if (!kids.length) return `<li>${link}</li>`;
    const open = depth < 1 ? ' open' : '';
    return /* html */ `<li><details${open}><summary>${link} <span class="count">${kids.length}</span></summary>
<ul>${kids.map((k) => renderNode(k, depth + 1)).join('')}</ul></details></li>`;
  };

  const content = /* html */ `
<h1>Class Hierarchy</h1>
<p>Expand a node to see the classes derived from it. Top-level entries either have no base class or extend an engine class that is not defined in scripts.</p>
<ul class="tree">${roots.map((r) => renderNode(r, 0)).join('\n')}</ul>`;
  return layout({
    ...ctx,
    title: 'Class Hierarchy',
    active: 'hierarchy/',
    bar: pageBar({ tabs: classTabs(base, 'hierarchy/'), tools: true, filter: 'Filter classes…' }),
    breadcrumbs: [{ label: 'Classes', href: `${base}classes/` }, { label: 'Hierarchy' }],
    content,
  });
}
