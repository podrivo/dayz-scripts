// One class: /class/<Name>/, and the flat list of everything it inherits at
// /class/<Name>/members/.

import {
  esc, layout, linkType, condBadges, modBadges, methodSig, varSig,
  renderDoc, briefOf, filterBar, slug, ACCESS_CHIPS,
} from '../html.js';
import {
  anchorFor, callersBlock, fileLineHref, locationLinks, referencesBlock,
} from './shared.js';

export function renderClass(ctx, cls) {
  const { site, base } = ctx;
  const used = new Set();

  // inheritance chain — hidden when the class stands alone, the same way a
  // one-level breadcrumb is hidden once the title has said the name.
  const ancestors = site.ancestorsOf(cls.name);
  const chain = ancestors.length
    ? `<p class="chain">${[cls.name, ...ancestors]
        .map((n, i) => {
          if (i === 0) return `<strong>${esc(n)}</strong>`;
          return site.classes.has(n) ? `<a href="${base}class/${n}/">${esc(n)}</a>` : esc(n);
        })
        .join(' <span class="chain-sep">›</span> ')}</p>`
    : '';

  // Only worth its own page when there is something above to inherit from;
  // without a base the list would be this page over again. Whether the chain
  // holds a documented class is already part of what this page depends on
  // (see classDeps), so the link cannot go stale.
  const allMembers = ancestors.some((n) => site.classes.has(n))
    ? `<p class="all-members"><a href="${base}class/${cls.name}/members/">All members, including inherited</a></p>`
    : '';

  const kids = site.children.get(cls.name) || [];
  const derived = kids.length
    ? /* html */ `<details class="derived"><summary>Derived by ${kids.length} class${kids.length > 1 ? 'es' : ''}</summary>
<div class="derived-list">${kids.map((k) => `<a href="${base}class/${k}/">${esc(k)}</a>`).join(' ')}</div></details>`
    : '';

  const basesNote =
    cls.bases.length > 1
      ? `<p class="alt-bases">Base class depends on build flags: ${cls.bases
          .map((b) => `${linkType(b.base, site, base)}${condBadges(b.cond)}`)
          .join(' · ')}</p>`
      : '';

  const constants = cls.members.filter((m) => m.mods?.includes('const'));
  const vars = cls.members.filter((m) => !m.mods?.includes('const'));
  const ctors = cls.methods.filter((m) => m.kind === 'ctor' || m.kind === 'dtor');
  const methods = cls.methods.filter((m) => !m.kind);

  const memberBlock = (v) => {
    const id = anchorFor(used, v.name);
    const doc = v.doc ? `<div class="member-doc">${renderDoc(v.doc, site, base)}</div>` : '';
    return /* html */ `<div class="member" id="${id}">
<div class="member-sig"><code>${varSig(v, site, base)}</code>${condBadges(v.cond)}<a class="anchor" href="#${id}" aria-label="Link to ${esc(v.name)}">#</a></div>
${doc}</div>`;
  };

  const methodBlock = (m) => {
    const id = anchorFor(used, m.name);
    const doc = m.doc ? `<div class="member-doc">${renderDoc(m.doc, site, base)}</div>` : '';
    const src = m.file
      ? `<a class="member-src" href="${fileLineHref(site, base, m.file, m.line)}" title="View source">src</a>`
      : '';
    return /* html */ `<div class="member" id="${id}">
<div class="member-sig"><code>${methodSig(m, site, base)}</code>${condBadges(m.cond)}${src}<a class="anchor" href="#${id}" aria-label="Link to ${esc(m.name)}">#</a></div>
${doc}${referencesBlock(m, ctx, cls.name)}${callersBlock(m.name, ctx, cls.name)}</div>`;
  };

  const section = (title, items, block) =>
    items.length ? `<h2 id="${slug(title)}">${title} <span class="count">${items.length}</span></h2>\n${items.map(block).join('\n')}` : '';

  // A short class reads as a list; a long one has to be searched, and
  // PlayerBase alone declares 876 members.
  const total = cls.members.length + cls.methods.length;
  const filter = total >= 12
    ? filterBar(`Filter ${total.toLocaleString('en-US')} members…`, ACCESS_CHIPS)
    : '';

  const locations = locationLinks(
    site,
    base,
    cls.locations.filter((l) => !l.forward).concat(cls.locations.filter((l) => l.forward))
  );

  const module = cls.group && site.groups.has(cls.group)
    ? `<p class="in-module">Part of <a href="${base}topics/${cls.group}/">${esc(site.groups.get(cls.group).label)}</a></p>`
    : '';

  const badges =
    (cls.modded ? '<span class="badge badge-mod">modded</span>' : '') +
    modBadges(cls.mods) +
    condBadges(cls.cond);

  const attrs = cls.attrs.length
    ? `<pre class="attrs"><code>${cls.attrs.map(esc).join('\n')}</code></pre>`
    : '';

  const content = /* html */ `
<h1 class="class-title"><span class="kw">class</span> ${esc(cls.name)}${cls.generics ? `<span class="generics">${esc(cls.generics)}</span>` : ''}${badges}</h1>
${chain}
${module}
${basesNote}
${allMembers}
${derived}
${attrs}
${cls.doc ? `<div class="class-doc">${renderDoc(cls.doc, site, base)}</div>` : ''}
${filter}
${section('Constants', constants, memberBlock)}
${section('Members', vars, memberBlock)}
${section('Constructors', ctors, methodBlock)}
${section('Methods', methods, methodBlock)}
<h2 id="defined-in">Defined in</h2>
<p class="locations">${locations}</p>`;

  const brief = cls.doc ? briefOf(cls.doc, null, base).replace(/<[^>]+>/g, '') : '';
  return layout({
    ...ctx,
    title: cls.name,
    active: 'classes/',
    description: brief || `${cls.name} class — DayZ Enforce Script API`,
    content,
  });
}

/**
 * Every member reachable on a class, its own and its ancestors'.
 *
 * The question this answers — "what can I actually call on this thing" — has
 * no answer anywhere else, on this site or on either of the Doxygen ones.
 * ItemBase is ItemBase › InventoryItem › EntityAI › Entity › ObjectTyped ›
 * Object › IEntity › Managed, and its own page shows one eighth of it.
 *
 * One row per name rather than per declaration, because that is what a call
 * site resolves to: the nearest class in the chain that declares the name
 * wins, and the ones it shadows are named beside it. Overloads collapse into
 * the row of the name they share, counted rather than repeated.
 */
export function renderClassMembers(ctx, cls) {
  const { site, base } = ctx;
  const chain = [cls.name, ...site.ancestorsOf(cls.name)].filter((n) => site.classes.has(n));

  // The rows are built in the browser by site/app/members.js, and the only
  // thing shipped is the chain to build them from.
  //
  // Written into the page instead, they cost 564 MB across one build: a
  // member appears once per class that inherits it, so the total is every
  // member times its descendants, and DayZ's hierarchies are both deep and
  // wide. The same rows composed from search.json — which already lists every
  // class's methods and fields with their owner, and which the page fetches
  // for the command palette regardless — cost nothing at all.
  //
  // What that trades away is the table for a reader without JavaScript. The
  // chain below is the honest fallback: every class in it is a link, and each
  // of those pages is static and lists its own members in full.
  const chainHtml = chain.length > 1
    ? `<p class="chain">${chain
        .map((n, i) => (i === 0 ? `<strong>${esc(n)}</strong>` : `<a href="${base}class/${n}/">${esc(n)}</a>`))
        .join(' <span class="chain-sep">›</span> ')}</p>`
    : '';

  const content = /* html */ `
<h1>All members of ${esc(cls.name)}</h1>
${chainHtml}
<p>Everything callable on a <code>${esc(cls.name)}</code>, its own and everything it inherits from the ${(chain.length - 1).toLocaleString('en-US')} ${chain.length === 2 ? 'class' : 'classes'} above. Each name links to the class that declares it; where a name is declared more than once in the chain, the nearest one is the one that answers.</p>
<p><a href="${base}class/${cls.name}/">Back to ${esc(cls.name)}</a></p>
${filterBar('Filter members…')}
<table class="list all-members-table" id="allMembers" data-chain="${esc(chain.join(','))}">
<thead><tr><th>Member</th><th>Declared by</th><th></th></tr></thead>
<tbody></tbody></table>
<p class="members-fallback">Assembling the list from the class index. If it does not appear, each class in the chain above lists its own members in full.</p>`;

  return layout({
    ...ctx,
    title: `${cls.name} — all members`,
    active: 'classes/',
    description: `Every member of ${cls.name}, its own and those inherited from ${chain.slice(1).join(', ')}.`,
    content,
  });
}
