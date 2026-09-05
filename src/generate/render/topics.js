// Topics: the \defgroup groups the sources declare. The tree at /topics/, and
// one topic's page at /topics/<Name>/.

import { parseDoc } from '../../parser/docparse.js';
import {
  esc, layout, linkType, condBadges, methodSig, varSig, renderDoc, briefOf, slug,
} from '../html.js';
import {
  anchorFor, byName, callersBlock, fileLineHref, referencesBlock,
} from './shared.js';

/** Strip the \defgroup line and @{ / @} so the comment body is left. */
function topicDoc(raw) {
  return (raw || '')
    .replace(/[\\@](def|addto)group\s+\S+[^\n]*/g, '')
    .replace(/@[{}]/g, '')
    .replace(/\/\*\*?/g, '')
    .trim();
}

/** The \desc / first sentence, when it says more than the topic's own title. */
function topicBrief(mod) {
  const brief = briefOf(topicDoc(mod.desc));
  if (!brief) return '';
  const plain = brief.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!plain || plain.toLowerCase() === mod.label.toLowerCase() || /^[\\@]\w/.test(plain)) return '';
  return `<span class="catalog-desc">${brief}</span>`;
}

export function renderModulesIndex(ctx) {
  const { site, base } = ctx;
  const kid = (name) => {
    const mod = site.groups.get(name);
    const total = site.moduleTotal(name);
    const count = total ? ` <span class="count">${total.toLocaleString('en-US')}</span>` : '';
    return `<li><a href="${base}topics/${name}/">${esc(mod.label)}</a>${count}${topicBrief(mod)}</li>`;
  };
  const root = (name) => {
    const mod = site.groups.get(name);
    const total = site.moduleTotal(name);
    const link = `<a href="${base}topics/${name}/">${esc(mod.label)}</a>`;
    const count = total ? `<span class="count">${total.toLocaleString('en-US')}</span>` : '';
    const n = mod.children.length;
    let kids = '';
    if (n) {
      const list = `<ul class="catalog-kids">${mod.children.map(kid).join('')}</ul>`;
      kids = n > 8
        ? `<details class="catalog-more"><summary>${n} topics</summary>${list}</details>`
        : list;
    }
    return `<li><div class="catalog-head">${link}${count}${topicBrief(mod)}</div>${kids}</li>`;
  };
  const content = /* html */ `
<h1>Topics <span class="count">${site.groups.size}</span></h1>
<p>Engine-facing APIs and constant tables the scripts group themselves into — math, physics, entities, UI and the rest. Classes and constants that belong to a topic link back to it.</p>
<ul class="catalog">${site.moduleRoots.map(root).join('')}</ul>`;
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

  const dataSrc = (item) =>
    item.file ? ` data-src="${fileLineHref(site, base, item.file, item.line)}"` : '';

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
  const extraOf = (e) => {
    const d = parseDoc(e.item.doc);
    if (d && (d.desc || d.deprecated || d.params || d.returns || d.notes || d.warnings || d.code || d.see)) return true;
    if (!ctx.xref) return false;
    return Boolean(e.item.calls?.length || site.callers?.get(e.item.name)?.length);
  };
  for (const e of [...fnEntries, ...varEntries, ...valueEntries]) {
    e.id = anchorFor(used, e.item.name);
    e.extra = extraOf(e);
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

  /** Signature, brief, and src. more… only when a documentation block follows. */
  const declTable = (entries) =>
    entries.length
      ? /* html */ `<table class="list"><tbody>${entries
          .map((e) => {
            const more = e.extra ? `<a class="member-src" href="#${e.id}">more…</a>` : '';
            return `<tr${e.extra ? '' : ` id="${e.id}"`}${dataSrc(e.item)}><td><code>${sigOf(e)}</code>${e.ordinal || ''}${condBadges(e.item.cond, base)}</td><td>${
              e.item.doc ? briefOf(e.item.doc, site, base) : ''
            }</td><td>${more}</td></tr>`;
          })
          .join('\n')}</tbody></table>`
      : '';

  /** Full docs, refs, and callers — only for members the table cannot hold. */
  const defBlocks = (entries) => {
    const extra = entries.filter((e) => e.extra);
    return extra.length
      ? extra
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
            return /* html */ `<div class="member" id="${e.id}"${dataSrc(e.item)}>
<h3 class="member-name">${esc(e.item.name)}${e.ordinal || ''}${owner}</h3>
<div class="member-sig"><code>${sigOf(e)}</code>${condBadges(e.item.cond, base)}</div>
${doc}${referencesBlock(e.item, ctx, e.owner)}${callersBlock(e.item.name, ctx, e.owner)}</div>`;
          })
          .join('\n')
      : '';
  };

  const macroRows = mod.defines.length
    ? `<table class="list"><tbody>${[...mod.defines]
        .sort(byName)
        .map(
          (d) => `<tr id="${esc(d.name)}"${dataSrc(d)}><td><code>${esc(d.name)}</code>${condBadges(d.cond, base)}</td><td>${d.value ? `<code class="lit">${esc(d.value)}</code>` : ''}</td><td></td></tr>`
        )
        .join('\n')}</tbody></table>`
    : '';

  const typedefRows = mod.typedefs.length
    ? `<table class="list"><tbody>${[...mod.typedefs]
        .sort(byName)
        .map(
          (t) => `<tr${dataSrc(t)}><td><code>${esc(t.name)}</code></td><td><code>${linkType(t.type, site, base)}</code></td><td></td></tr>`
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

  // Tables first, then documentation only for members with more than a brief.
  const content = /* html */ `
<h1>${esc(mod.label)}</h1>
${parent}
${mod.desc ? `<div class="class-doc">${renderDoc(topicDoc(mod.desc), site, base)}</div>` : ''}
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
    content,
  });
}
