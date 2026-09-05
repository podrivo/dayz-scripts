// Everything declared outside a class: /globals/ and its six tabs, plus one
// enum's own page at /enum/<Name>/.

import {
  esc, layout, linkType, condBadges, methodSig, varSig, renderDoc, briefOf,
} from '../html.js';
import {
  anchorFor, byName, callersBlock, fileLineHref, fileButtons, referencesBlock,
} from './shared.js';
import { pageBar } from './pagebar.js';

// The tabs, split the way Doxygen splits them.
const GLOBAL_KINDS = [
  ['', 'All'],
  ['functions/', 'Functions'],
  ['constants/', 'Constants'],
  ['typedefs/', 'Typedefs'],
  ['enums/', 'Enums'],
  ['values/', 'Values'],
  ['macros/', 'Macros'],
];

const globalTabs = (base, kind) =>
  GLOBAL_KINDS.map(([k, l]) => [`${base}globals/${k}`, l, k === kind]);

export function renderEnum(ctx, en) {
  const { site, base } = ctx;
  const rows = en.values
    .map(
      (v) => `<tr id="${esc(v.name)}"><td><code>${esc(v.name)}</code>${condBadges(v.cond, base)}</td><td>${v.value !== undefined ? `<code class="lit">${esc(v.value)}</code>` : ''}</td><td>${v.doc ? renderDoc(v.doc, site, base) : ''}</td></tr>`
    )
    .join('\n');
  const content = /* html */ `
<h1 class="class-title"><span class="kw">enum</span> ${esc(en.name)}${en.base ? ` <span class="chain-sep">:</span> ${linkType(en.base, site, base)}` : ''}${condBadges(en.cond, base)}${fileButtons(site, base, en.locations)}</h1>
${en.doc ? `<div class="class-doc">${renderDoc(en.doc, site, base)}</div>` : ''}
<table class="list enum-table"><thead><tr><th>Name</th><th>Value</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  return layout({
    ...ctx,
    title: en.name,
    active: 'globals/enums/',
    bar: pageBar({ tabs: globalTabs(base, 'enums/') }),
    content,
  });
}

/** The contents of each Globals tab, so the "All" tab can reuse them. */
function globalSections(ctx, site, base) {
  const dataSrc = (item) =>
    item.file ? ` data-src="${fileLineHref(site, base, item.file, item.line)}"` : '';
  const used = new Set();

  const functions = [...site.functions].sort(byName).map((fn) => {
    const id = anchorFor(used, fn.name);
    const doc = fn.doc ? `<div class="member-doc">${renderDoc(fn.doc, site, base)}</div>` : '';
    return /* html */ `<div class="member" id="${id}"${dataSrc(fn)}>
<div class="member-sig"><code>${methodSig(fn, site, base)}</code>${condBadges(fn.cond, base)}</div>
${doc}${referencesBlock(fn, ctx)}${callersBlock(fn.name, ctx)}</div>`;
  });

  // Constants keep their module grouping: the sources organise them
  // into \defgroup blocks, and that is the only structure they have.
  const grouped = new Map();
  for (const g of site.globals) {
    const key = g.group || '';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(g);
  }
  const constants = [...grouped.entries()]
    .sort((a, b) => (site.groups.get(a[0])?.label || 'zzz').localeCompare(site.groups.get(b[0])?.label || 'zzz'))
    .map(([g, items]) => {
      const mod = site.groups.get(g);
      const heading = mod
        ? `<a href="${base}topics/${g}/">${esc(mod.label)}</a>`
        : 'Ungrouped';
      const rows = items
        .map(
          (v) => `<tr id="${esc(v.name)}"${dataSrc(v)}><td><code>${varSig(v, site, base)}</code>${condBadges(v.cond, base)}</td><td>${v.doc ? briefOf(v.doc, site, base) : ''}</td><td></td></tr>`
        )
        .join('\n');
      return /* html */ `<h3 id="${esc(g || 'ungrouped')}">${heading} <span class="count">${items.length}</span></h3>
<table class="list"><tbody>${rows}</tbody></table>`;
    })
    .join('\n');

  const typedefs = [...site.typedefs].sort(byName)
    .map(
      (t) => `<tr id="${esc(t.name)}"${dataSrc(t)}><td><code>${esc(t.name)}</code>${condBadges(t.cond, base)}</td><td><code>${linkType(t.type, site, base)}</code></td><td></td></tr>`
    )
    .join('\n');

  const enums = [...site.enums.values()].sort(byName)
    .map(
      (e) => `<tr><td><a href="${base}enum/${e.name}/">${esc(e.name)}</a>${condBadges(e.cond, base)}</td><td>${e.values.length} values</td><td>${e.doc ? briefOf(e.doc, site, base) : ''}</td></tr>`
    )
    .join('\n');

  const values = [...site.enums.values()]
    .flatMap((e) => e.values.map((v) => ({ ...v, owner: e.name })))
    .sort((a, b) => a.name.localeCompare(b.name) || a.owner.localeCompare(b.owner))
    .map(
      (v) => `<tr><td><a href="${base}enum/${v.owner}/#${esc(v.name)}"><code>${esc(v.name)}</code></a></td><td><a href="${base}enum/${v.owner}/">${esc(v.owner)}</a></td><td>${v.value !== undefined ? `<code class="lit">${esc(v.value)}</code>` : ''}</td></tr>`
    )
    .join('\n');

  const macros = [...site.defines].sort(byName)
    .map(
      (d) => `<tr id="${esc(d.name)}"${dataSrc(d)}><td><code>${esc(d.name)}</code>${condBadges(d.cond, base)}</td><td>${d.value ? `<code class="lit">${esc(d.value)}</code>` : ''}</td><td></td></tr>`
    )
    .join('\n');

  const table = (head, rows, cls = 'list') =>
    rows ? `<table class="${cls}">${head}<tbody>${rows}</tbody></table>` : '<p class="muted">None.</p>';

  return {
    functions: functions.length ? functions.join('\n') : '<p class="muted">None.</p>',
    constants: constants || '<p class="muted">None.</p>',
    typedefs: table('<thead><tr><th>Alias</th><th>Type</th><th></th></tr></thead>', typedefs),
    enums: table('', enums, 'list enum-index'),
    values: table('<thead><tr><th>Name</th><th>Enum</th><th>Value</th></tr></thead>', values),
    macros: table('<thead><tr><th>Name</th><th>Value</th><th></th></tr></thead>', macros),
  };
}

export function renderGlobals(ctx, kind) {
  const { site, base } = ctx;
  const label = GLOBAL_KINDS.find(([k]) => k === kind)[1];
  const tabs = globalTabs(base, kind);

  const counts = {
    functions: site.functions.length,
    constants: site.globals.length,
    typedefs: site.typedefs.length,
    enums: site.enums.size,
    values: [...site.enums.values()].reduce((n, e) => n + e.values.length, 0),
    macros: site.defines.length,
  };
  const key = kind === '' ? null : kind.replace('/', '');
  const total = Object.values(counts).reduce((n, c) => n + c, 0);

  // The "All" tab is an index of names rather than a copy of the six pages
  // below it: repeating them costs more bytes than the whole rest of the site.
  const names = {
    functions: [...site.functions].sort(byName).map((f) => [f.name, `globals/functions/#${f.name}`]),
    constants: [...site.globals].sort(byName).map((g) => [g.name, `globals/constants/#${g.name}`]),
    typedefs: [...site.typedefs].sort(byName).map((t) => [t.name, `globals/typedefs/#${t.name}`]),
    enums: [...site.enums.values()].sort(byName).map((e) => [e.name, `enum/${e.name}/`]),
    values: null, // 3.5k enumerators; the tab itself is the only sensible place
    macros: [...site.defines].sort(byName).map((d) => [d.name, `globals/macros/#${d.name}`]),
  };

  const body = key
    ? globalSections(ctx, site, base)[key]
    : GLOBAL_KINDS.slice(1)
        .map(([k, l]) => {
          const id = k.replace('/', '');
          const heading = `<h2 id="${id}"><a href="${base}globals/${k}">${l}</a> <span class="count">${counts[id].toLocaleString('en-US')}</span></h2>`;
          const list = names[id]
            ? `<div class="namegrid">${names[id].map(([n, href]) => `<a href="${base}${href}">${esc(n)}</a>`).join('')}</div>`
            : `<p class="muted"><a href="${base}globals/${k}">Browse all ${counts[id].toLocaleString('en-US')} values</a>.</p>`;
          return `${heading}\n${list}`;
        })
        .join('\n');

  const content = /* html */ `
<h1>${key ? label : 'Globals'} <span class="count">${(key ? counts[key] : total).toLocaleString('en-US')}</span></h1>
${body}`;

  return layout({
    ...ctx,
    title: key ? label : 'Globals',
    active: `globals/${kind}`,
    bar: pageBar({ tabs }),
    content,
  });
}
