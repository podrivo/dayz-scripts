// Topics: the \defgroup groups the sources declare. The tree at /topics/, and
// one topic's page at /topics/<Name>/.

import {
  esc, layout, linkType, condBadges, methodSig, varSig, renderDoc, briefOf, slug,
} from '../html.js';
import {
  anchorFor, byName, callersBlock, fileLineHref, referencesBlock,
} from './shared.js';

export function renderModulesIndex(ctx) {
  const { site, base } = ctx;
  const node = (name, depth) => {
    const mod = site.groups.get(name);
    const total = site.moduleTotal(name);
    const link = `<a href="${base}topics/${name}/">${esc(mod.label)}</a>`;
    const count = total ? ` <span class="count">${total.toLocaleString('en-US')}</span>` : '';
    if (!mod.children.length) return `<li>${link}${count}</li>`;
    return /* html */ `<li><details${depth < 1 ? ' open' : ''}><summary>${link}${count}</summary>
<ul>${mod.children.map((k) => node(k, depth + 1)).join('')}</ul></details></li>`;
  };
  const content = /* html */ `
<h1>Topics <span class="count">${site.groups.size}</span></h1>
<p>Engine-facing APIs and constant tables the scripts group themselves into — math, physics, entities, UI and the rest. Classes and constants that belong to a topic link back to it.</p>
<ul class="tree">${site.moduleRoots.map((n) => node(n, 0)).join('')}</ul>`;
  return layout({
    ...ctx,
    title: 'Topics',
    active: 'topics/',
    description: 'DayZ Enforce Script API grouped into topics: math, physics, entities, UI, constants and more.',
    breadcrumbs: [{ label: 'Topics' }],
    content,
  });
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
          return `<li><a href="${base}topics/${k}/">${esc(kid.label)}</a>${total ? ` <span class="count">${total}</span>` : ''}</li>`;
        })
        .join('')}</ul>`
    : '';

  const src = (item) => `<a class="member-src" href="${fileLineHref(site, base, item.file, item.line)}">src</a>`;

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
      ? /* html */ `<table class="list"><tbody>${entries
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
                    ? `<a href="${base}classes/${e.owner}/">${esc(e.owner)}</a>`
                    : site.enums.has(e.owner)
                      ? `<a href="${base}enum/${e.owner}/">${esc(e.owner)}</a>`
                      : esc(e.owner)
                }</span>`
              : '';
            const doc = e.item.doc ? `<div class="member-doc">${renderDoc(e.item.doc, site, base)}</div>` : '';
            const source = e.item.file ? src(e.item) : '';
            return /* html */ `<div class="member" id="${e.id}">
<h3 class="member-name">${esc(e.item.name)}${e.ordinal || ''}${owner}</h3>
<div class="member-sig"><code>${sigOf(e)}</code>${condBadges(e.item.cond)}<a class="anchor" href="#${e.id}">#</a>${source}</div>
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
    ? `<p class="in-module">Part of <a href="${base}topics/${mod.parent}/">${esc(site.groups.get(mod.parent).label)}</a></p>`
    : '';

  const empty =
    !children && !mod.classes.length && !mod.enums.length && !mod.typedefs.length &&
    !varEntries.length && !fnEntries.length && !mod.defines.length
      ? '<p class="muted">Nothing in this build is filed under this topic. The sources declare it, but everything it once held is commented out or has moved.</p>'
      : '';

  // The order is Doxygen's own, from group/memberdecl/* then group/memberdef/*
  // in src/layout.cpp: every declaration is summarised in a table first, then
  // documented in full below. That is why their group pages ran to 300 KB.
  const content = /* html */ `
<h1>${esc(mod.label)}</h1>
${parent}
${mod.desc ? `<div class="class-doc">${renderDoc(mod.desc.replace(/[\\@](def|addto)group\s+\S+[^\n]*/, '').replace(/@[{}]/g, ''), site, base)}</div>` : ''}
${empty}
${section('Topics', children)}
${section('Classes', nameList(mod.classes, 'class'))}
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
    active: 'topics/',
    description: `${mod.label} — DayZ Enforce Script API topic`,
    breadcrumbs: [{ label: 'Topics', href: `${base}topics/` }, { label: mod.label }],
    content,
  });
}
