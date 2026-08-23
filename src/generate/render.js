// Per-page renderers. Each returns a full HTML document string.

import {
  esc, layout, linkType, typeUrl, condBadges, modBadges,
  methodSig, varSig, renderDoc, briefOf,
} from './html.js';
import { OFFICIAL_LINKS, COMMUNITY_LINKS, FORUM_THREADS, VERSION_TITLES, YADZ_DISCORD } from './content.js';

const MODULE_LABELS = {
  '1_core': 'Core',
  '2_gamelib': 'GameLib',
  '3_game': 'Game',
  '4_world': 'World',
  '5_mission': 'Mission',
  editor: 'Editor',
  _root: 'Root scripts',
};

export function moduleLabel(m) {
  return MODULE_LABELS[m] || m;
}

function anchorFor(used, name) {
  let a = name.replace(/[^\w]/g, '_');
  if (used.has(a)) {
    let i = 2;
    while (used.has(`${a}-${i}`)) i++;
    a = `${a}-${i}`;
  }
  used.add(a);
  return a;
}

function fileHref(base, path) {
  return `${base}file/${path.replace(/^scripts\//, '')}/`;
}

function fileLineHref(base, path, line) {
  return `${fileHref(base, path)}#L${line}`;
}

// ---------------------------------------------------------------------------

function fmtDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC',
  });
}

const buildNo = (build) => Number(build.split('.')[2] || 0);
const versionNo = (version) => {
  const [major, minor] = version.split('.').map(Number);
  return major * 1000 + minor;
};

/**
 * Release history grouped by game version: every build we document, merged
 * with the official forum threads. Builds whose scripts never reached the
 * Script Diff repository still show up, with their thread only.
 */
function renderReleases(ctx) {
  const { site, root, versions } = ctx;
  const groups = new Map(); // version -> Map(build -> row)
  const rowsFor = (version) => {
    if (!groups.has(version)) groups.set(version, new Map());
    return groups.get(version);
  };

  versions.forEach((v, i) => {
    rowsFor(v.version).set(v.build, {
      build: v.build,
      date: v.date,
      docs: i === 0 ? root : `${root}v/${v.label}/`,
    });
  });

  for (const [build, thread] of Object.entries(FORUM_THREADS)) {
    const version = build.split('.').slice(0, 2).join('.');
    const rows = rowsFor(version);
    const row = rows.get(build) || { build, date: thread.date };
    row.url = thread.url;
    rows.set(build, row);
  }

  return [...groups.entries()]
    .sort((a, b) => versionNo(b[0]) - versionNo(a[0]))
    .map(([version, rows]) => {
      const title = VERSION_TITLES[version] ? ` <span class="muted">${esc(VERSION_TITLES[version])}</span>` : '';
      const items = [...rows.values()]
        .sort((a, b) => buildNo(b.build) - buildNo(a.build))
        .map((r) => {
          let label;
          if (r.build === site.build) label = `<strong>v${esc(r.build)}</strong>`;
          else if (r.docs) label = `<a href="${r.docs}">v${esc(r.build)}</a>`;
          else label = `<span class="rbuild" title="Scripts for this build are not in the Script Diff repository">v${esc(r.build)}</span>`;
          const notes = r.url ? ` <a href="${r.url}" rel="noopener">release notes</a>` : '';
          return `<li>${label}<span class="rdate">${esc(fmtDate(r.date))}</span>${notes}</li>`;
        })
        .join('\n');
      return `<details${version === site.version ? ' open' : ''}>
<summary>DayZ ${esc(version)}${title} <span class="count">${rows.size} build${rows.size === 1 ? '' : 's'}</span></summary>
<ul>
${items}
</ul>
</details>`;
    })
    .join('\n');
}

export function renderHome(ctx) {
  const { site, base, root, versions } = ctx;
  const s = site.stats;
  const modules = new Map();
  for (const f of site.files) {
    const m = f.module;
    if (!modules.has(m)) modules.set(m, { files: 0, classes: 0 });
    const mm = modules.get(m);
    mm.files++;
    mm.classes += f.counts.classes;
  }

  const stat = (n, label, href) =>
    `<a class="stat" href="${href}"><strong>${n.toLocaleString('en-US')}</strong><span>${label}</span></a>`;

  const linkCards = (links) => `<div class="cards">
${links
  .map(
    ([label, url, desc]) => `<a class="card" href="${url}" rel="noopener">
  <h3>${esc(label)}</h3>
  <p>${esc(desc)}</p>
</a>`
  )
  .join('\n')}
</div>`;

  const releases = renderReleases(ctx);

  const thread = FORUM_THREADS[site.build];
  const buildLine = thread
    ? `<a href="${thread.url}" rel="noopener">${esc(site.build)}</a>`
    : `<strong>${esc(site.build)}</strong>`;

  const content = `
<section class="hero">
  <h1>DayZ ${esc(site.version)} Script API</h1>
  <p>Browsable documentation for the DayZ Enforce Script sources — every class, method, enum and constant of game build ${buildLine} (${esc(site.date)}), generated automatically from the official <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff" rel="noopener">DayZ&nbsp;Script&nbsp;Diff</a> repository.</p>
  <p>Made for anyone wandering the DayZ modding and scripting world, and meant to be quicker to browse than the raw sources. This is just the tip of the iceberg: there is no official detailed documentation on the subject, so community content is your best friend. Once you join one of the Discord servers below, check the pinned messages — most recurring questions are answered there.</p>
</section>
<section class="stats">
  ${stat(s.classes, 'classes', base + 'classes/')}
  ${stat(s.methods, 'methods', base + 'classes/')}
  ${stat(s.enums, 'enums', base + 'enums/')}
  ${stat(s.typedefs, 'typedefs', base + 'typedefs/')}
  ${stat(s.globals, 'constants', base + 'constants/')}
  ${stat(s.files, 'script files', base + 'files/')}
</section>
<h2>Modules</h2>
<div class="cards">
${[...modules.entries()]
  .map(
    ([m, mm]) => `<a class="card" href="${base}files/#${esc(m)}">
  <h3>${esc(moduleLabel(m))} <code>${esc(m)}</code></h3>
  <p>${mm.files.toLocaleString('en-US')} files · ${mm.classes.toLocaleString('en-US')} classes</p>
</a>`
  )
  .join('\n')}
</div>
<h2>Start exploring</h2>
<ul class="quicklinks">
  <li><a href="${base}class/PlayerBase/">PlayerBase</a> — the player entity</li>
  <li><a href="${base}class/ItemBase/">ItemBase</a> — base of all items</li>
  <li><a href="${base}class/EntityAI/">EntityAI</a> — base of interactive entities</li>
  <li><a href="${base}hierarchy/">Full class hierarchy</a></li>
  <li><a href="${base}changes/">What changed in build ${esc(site.build)}</a></li>
</ul>
<h2 id="official-links">Official links</h2>
${linkCards(OFFICIAL_LINKS)}
<h2 id="community-links">Community links</h2>
${linkCards(COMMUNITY_LINKS)}
<h2 id="changelog">PC stable changelog</h2>
<p>Every PC stable update thread on the DayZ Forums. For what changed in the scripts themselves, see the <a href="${base}changes/">${esc(site.version)} changelog</a>.</p>
<div class="releases">
${releases}
</div>
<h2 id="about">About</h2>
<p>This site is generated automatically from the official <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff/tree/main/scripts" rel="noopener">DayZ Script Diff</a> sources, so it covers what ships in the game's script files — engine internals are not part of it. It is actively maintained, so if you find a bug or have a suggestion, share it on <a href="${YADZ_DISCORD}" rel="noopener">YADZ's Discord</a>.</p>
<p class="muted">This is not an official documentation and it is not affiliated with <a href="https://dayz.com/" rel="noopener">DayZ</a> or <a href="https://www.bohemia.net/" rel="noopener">Bohemia Interactive</a>. The script sources shown here are © 2022 BOHEMIA INTERACTIVE a.s., all rights reserved, and are licensed under the <a href="https://www.bohemia.net/community/licenses/dayz-public-license-dpl" rel="noopener">DayZ Public License (DPL)</a>. They have been modified for presentation — parsed, reorganized and reformatted into these pages — from the originals in <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff/tree/main/scripts" rel="noopener">DayZ Script Diff</a>, and are offered as-is, without warranties of any kind. DAYZ®, ENFUSION® and BOHEMIA INTERACTIVE® are registered trademarks of BOHEMIA INTERACTIVE a.s. All other trademarks and copyrights are the property of their respective owners.</p>`;

  return layout({ ...ctx, title: `DayZ ${site.version} Script API`, active: 'Overview', content });
}

// ---------------------------------------------------------------------------

export function renderClassesIndex(ctx, letters) {
  const { site, base } = ctx;
  const letterLinks = [...letters.keys()]
    .map((l) => `<a class="letter" href="${base}classes/${l}/">${l.toUpperCase()}</a>`)
    .join('');
  const content = `
<h1>Classes <span class="count">${site.classes.size.toLocaleString('en-US')}</span></h1>
<p>All Enforce Script classes in DayZ ${esc(site.version)}, grouped alphabetically. Use the search box for instant lookup.</p>
<div class="letters">${letterLinks}</div>
${[...letters.entries()]
  .map(
    ([l, names]) => `<h2 id="${l}"><a href="${base}classes/${l}/">${l.toUpperCase()}</a> <span class="count">${names.length}</span></h2>`
  )
  .join('\n')}`;
  return layout({
    ...ctx,
    title: 'Classes',
    active: 'Classes',
    breadcrumbs: [{ label: 'Classes' }],
    content,
  });
}

export function renderClassesLetter(ctx, letter, names) {
  const { site, base } = ctx;
  const rows = names
    .map((n) => {
      const c = site.classes.get(n);
      const brief = c.doc ? briefOf(c.doc, site, base) : '';
      const badges = (c.modded ? '<span class="badge badge-mod">modded</span>' : '') + condBadges(c.cond);
      return `<tr><td><a href="${base}class/${n}/">${esc(n)}</a>${badges}</td><td>${brief}</td></tr>`;
    })
    .join('\n');
  const content = `
<h1>Classes — ${letter.toUpperCase()} <span class="count">${names.length}</span></h1>
<table class="list"><tbody>${rows}</tbody></table>`;
  return layout({
    ...ctx,
    title: `Classes ${letter.toUpperCase()}`,
    active: 'Classes',
    breadcrumbs: [{ label: 'Classes', href: `${base}classes/` }, { label: letter.toUpperCase() }],
    content,
  });
}

// ---------------------------------------------------------------------------

export function renderClass(ctx, cls) {
  const { site, base } = ctx;
  const used = new Set();

  // inheritance chain
  const ancestors = site.ancestorsOf(cls.name);
  const chain = [cls.name, ...ancestors]
    .map((n, i) => {
      if (i === 0) return `<strong>${esc(n)}</strong>`;
      return site.classes.has(n) ? `<a href="${base}class/${n}/">${esc(n)}</a>` : esc(n);
    })
    .join(' <span class="chain-sep">›</span> ');

  const kids = site.children.get(cls.name) || [];
  const derived = kids.length
    ? `<details class="derived"><summary>Derived by ${kids.length} class${kids.length > 1 ? 'es' : ''}</summary>
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
    return `<div class="member" id="${id}">
<div class="member-sig"><code>${varSig(v, site, base)}</code>${condBadges(v.cond)}<a class="anchor" href="#${id}" aria-label="Link to ${esc(v.name)}">#</a></div>
${doc}</div>`;
  };

  const methodBlock = (m) => {
    const id = anchorFor(used, m.name);
    const doc = m.doc ? `<div class="member-doc">${renderDoc(m.doc, site, base)}</div>` : '';
    const src = m.file
      ? `<a class="member-src" href="${fileLineHref(base, m.file, m.line)}" title="View source">src</a>`
      : '';
    return `<div class="member" id="${id}">
<div class="member-sig"><code>${methodSig(m, site, base)}</code>${condBadges(m.cond)}${src}<a class="anchor" href="#${id}" aria-label="Link to ${esc(m.name)}">#</a></div>
${doc}</div>`;
  };

  const section = (title, items, block) =>
    items.length ? `<h2 id="${title.toLowerCase().replace(/\s/g, '-')}">${title} <span class="count">${items.length}</span></h2>\n${items.map(block).join('\n')}` : '';

  const locations = cls.locations
    .filter((l) => !l.forward)
    .concat(cls.locations.filter((l) => l.forward))
    .map(
      (l) =>
        `<a href="${fileLineHref(base, l.path, l.line)}"><code>${esc(l.path.replace(/^scripts\//, ''))}</code>:${l.line}</a>${l.forward ? ' <span class="muted">(declaration)</span>' : ''}`
    )
    .join('<br>');

  const badges =
    (cls.modded ? '<span class="badge badge-mod">modded</span>' : '') +
    modBadges(cls.mods) +
    condBadges(cls.cond);

  const attrs = cls.attrs.length
    ? `<pre class="attrs"><code>${cls.attrs.map(esc).join('\n')}</code></pre>`
    : '';

  const content = `
<h1 class="class-title"><span class="kw">class</span> ${esc(cls.name)}${cls.generics ? `<span class="generics">${esc(cls.generics)}</span>` : ''}${badges}</h1>
<p class="chain">${chain}</p>
${basesNote}
${derived}
${attrs}
${cls.doc ? `<div class="class-doc">${renderDoc(cls.doc, site, base)}</div>` : ''}
${section('Constants', constants, memberBlock)}
${section('Members', vars, memberBlock)}
${section('Constructors', ctors, methodBlock)}
${section('Methods', methods, methodBlock)}
<h2>Defined in</h2>
<p class="locations">${locations}</p>`;

  const brief = cls.doc ? briefOf(cls.doc, null, base).replace(/<[^>]+>/g, '') : '';
  return layout({
    ...ctx,
    title: cls.name,
    active: 'Classes',
    description: brief || `${cls.name} class — DayZ ${site.version} Enforce Script API`,
    breadcrumbs: [{ label: 'Classes', href: `${base}classes/` }, { label: cls.name }],
    content,
  });
}

// ---------------------------------------------------------------------------

export function renderEnumsIndex(ctx) {
  const { site, base } = ctx;
  const names = [...site.enums.keys()].sort((a, b) => a.localeCompare(b));
  const rows = names
    .map((n) => {
      const e = site.enums.get(n);
      return `<tr><td><a href="${base}enum/${n}/">${esc(n)}</a>${condBadges(e.cond)}</td><td>${e.values.length} values</td><td>${e.doc ? briefOf(e.doc, site, base) : ''}</td></tr>`;
    })
    .join('\n');
  const content = `
<h1>Enums <span class="count">${names.length}</span></h1>
<table class="list"><tbody>${rows}</tbody></table>`;
  return layout({ ...ctx, title: 'Enums', active: 'Enums', breadcrumbs: [{ label: 'Enums' }], content });
}

export function renderEnum(ctx, en) {
  const { site, base } = ctx;
  const rows = en.values
    .map(
      (v) => `<tr id="${esc(v.name)}"><td><code>${esc(v.name)}</code>${condBadges(v.cond)}</td><td>${v.value !== undefined ? `<code class="lit">${esc(v.value)}</code>` : ''}</td><td>${v.doc ? renderDoc(v.doc, site, base) : ''}</td></tr>`
    )
    .join('\n');
  const locations = en.locations
    .map((l) => `<a href="${fileLineHref(base, l.path, l.line)}"><code>${esc(l.path.replace(/^scripts\//, ''))}</code>:${l.line}</a>`)
    .join('<br>');
  const content = `
<h1 class="class-title"><span class="kw">enum</span> ${esc(en.name)}${en.base ? ` <span class="chain-sep">:</span> ${linkType(en.base, site, base)}` : ''}${condBadges(en.cond)}</h1>
${en.doc ? `<div class="class-doc">${renderDoc(en.doc, site, base)}</div>` : ''}
<table class="list enum-table"><thead><tr><th>Name</th><th>Value</th><th></th></tr></thead><tbody>${rows}</tbody></table>
<h2>Defined in</h2>
<p class="locations">${locations}</p>`;
  return layout({
    ...ctx,
    title: en.name,
    active: 'Enums',
    breadcrumbs: [{ label: 'Enums', href: `${base}enums/` }, { label: en.name }],
    content,
  });
}

// ---------------------------------------------------------------------------

export function renderTypedefs(ctx) {
  const { site, base } = ctx;
  const items = [...site.typedefs].sort((a, b) => a.name.localeCompare(b.name));
  const rows = items
    .map(
      (t) => `<tr id="${esc(t.name)}"><td><code>${esc(t.name)}</code>${condBadges(t.cond)}</td><td><code>${linkType(t.type, site, base)}</code></td><td><a href="${fileLineHref(base, t.file, t.line)}">src</a></td></tr>`
    )
    .join('\n');
  const content = `
<h1>Typedefs <span class="count">${items.length}</span></h1>
<p>Type aliases defined across the scripts.</p>
<table class="list"><thead><tr><th>Alias</th><th>Type</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  return layout({ ...ctx, title: 'Typedefs', active: 'Typedefs', breadcrumbs: [{ label: 'Typedefs' }], content });
}

export function renderConstants(ctx) {
  const { site, base } = ctx;
  const grouped = new Map();
  for (const g of site.globals) {
    const key = g.group || 'Ungrouped';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(g);
  }
  const sections = [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([g, items]) => {
      const title = site.groups.get(g)?.title || g;
      const rows = items
        .map(
          (v) => `<tr id="${esc(v.name)}"><td><code>${varSig(v, site, base)}</code>${condBadges(v.cond)}</td><td>${v.doc ? briefOf(v.doc, site, base) : ''}</td><td><a href="${fileLineHref(base, v.file, v.line)}">src</a></td></tr>`
        )
        .join('\n');
      return `<h2 id="${esc(g)}">${esc(title)} <span class="count">${items.length}</span></h2>
<table class="list"><tbody>${rows}</tbody></table>`;
    })
    .join('\n');
  const content = `<h1>Constants &amp; globals <span class="count">${site.globals.length}</span></h1>\n${sections}`;
  return layout({ ...ctx, title: 'Constants', active: 'Constants', breadcrumbs: [{ label: 'Constants' }], content });
}

export function renderFunctions(ctx) {
  const { site, base } = ctx;
  const items = [...site.functions].sort((a, b) => a.name.localeCompare(b.name));
  const used = new Set();
  const blocks = items
    .map((fn) => {
      const id = anchorFor(used, fn.name);
      const doc = fn.doc ? `<div class="member-doc">${renderDoc(fn.doc, site, base)}</div>` : '';
      return `<div class="member" id="${id}">
<div class="member-sig"><code>${methodSig(fn, site, base)}</code>${condBadges(fn.cond)}<a class="member-src" href="${fileLineHref(base, fn.file, fn.line)}">src</a><a class="anchor" href="#${id}">#</a></div>
${doc}</div>`;
    })
    .join('\n');
  const content = `<h1>Global functions <span class="count">${items.length}</span></h1>\n${blocks}`;
  return layout({ ...ctx, title: 'Functions', active: 'Functions', breadcrumbs: [{ label: 'Functions' }], content });
}

// ---------------------------------------------------------------------------

export function renderFilesIndex(ctx) {
  const { site, base } = ctx;
  const byModule = new Map();
  for (const f of site.files) {
    if (!byModule.has(f.module)) byModule.set(f.module, []);
    byModule.get(f.module).push(f);
  }
  const sections = [...byModule.entries()]
    .map(([m, files]) => {
      const rows = files
        .map((f) => {
          const short = f.path.replace(/^scripts\/[^/]+\//, '');
          const what = [
            f.counts.classes && `${f.counts.classes} classes`,
            f.counts.enums && `${f.counts.enums} enums`,
            f.counts.functions && `${f.counts.functions} functions`,
            f.counts.globals && `${f.counts.globals} globals`,
          ]
            .filter(Boolean)
            .join(', ');
          return `<tr><td><a href="${fileHref(base, f.path)}"><code>${esc(short)}</code></a></td><td>${what}</td></tr>`;
        })
        .join('\n');
      return `<h2 id="${esc(m)}">${esc(moduleLabel(m))} <code>${esc(m)}</code> <span class="count">${files.length}</span></h2>
<table class="list"><tbody>${rows}</tbody></table>`;
    })
    .join('\n');
  const content = `<h1>Script files <span class="count">${site.files.length}</span></h1>\n${sections}`;
  return layout({ ...ctx, title: 'Files', active: 'Files', breadcrumbs: [{ label: 'Files' }], content });
}

export function renderFile(ctx, fileEntry, fileModel, source) {
  const { site, base } = ctx;
  const short = fileEntry.path.replace(/^scripts\//, '');

  const declList = [];
  for (const c of fileModel.classes) {
    if (!declList.some((d) => d.name === c.name)) {
      declList.push({ kind: 'class', name: c.name, href: `${base}class/${c.name}/`, line: c.line });
    }
  }
  for (const e of fileModel.enums) declList.push({ kind: 'enum', name: e.name, href: `${base}enum/${e.name}/`, line: e.line });
  for (const t of fileModel.typedefs) declList.push({ kind: 'typedef', name: t.name, href: `${base}typedefs/#${t.name}`, line: t.line });
  for (const fn of fileModel.functions) declList.push({ kind: 'func', name: fn.name + '()', href: `${base}functions/#${fn.name}`, line: fn.line });

  const decls = declList.length
    ? `<div class="file-decls">${declList
        .map((d) => `<a href="${d.href}"><span class="kw">${d.kind}</span> ${esc(d.name)}</a>`)
        .join('')}</div>`
    : '';

  const content = `
<h1 class="file-title"><code>${esc(short)}</code></h1>
${decls}
<div class="srcwrap"><pre class="src" id="src"><code>${esc(source)}</code></pre></div>`;

  return layout({
    ...ctx,
    title: short,
    active: 'Files',
    breadcrumbs: [{ label: 'Files', href: `${base}files/` }, { label: short }],
    content,
  });
}

// ---------------------------------------------------------------------------

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
    return `<li><details${open}><summary>${link} <span class="count">${kids.length}</span></summary>
<ul>${kids.map((k) => renderNode(k, depth + 1)).join('')}</ul></details></li>`;
  };

  const content = `
<h1>Class hierarchy</h1>
<p>Expand a node to see the classes derived from it. Top-level entries either have no base class or extend an engine class that is not defined in scripts.</p>
<div class="hierarchy-tools"><button id="expandAll" class="btn">Expand all</button> <button id="collapseAll" class="btn">Collapse all</button></div>
<ul class="tree">${roots.map((r) => renderNode(r, 0)).join('\n')}</ul>`;
  return layout({ ...ctx, title: 'Hierarchy', active: 'Hierarchy', breadcrumbs: [{ label: 'Hierarchy' }], content });
}

// ---------------------------------------------------------------------------

export function renderChanges(ctx, diff, prevLabel) {
  const { site, base } = ctx;
  if (!diff) {
    const content = `<h1>Changelog — DayZ ${esc(site.build)}</h1>
<p>This is the oldest build tracked, so there is no previous build to compare against.</p>`;
    return layout({ ...ctx, title: 'Changelog', active: 'Changelog', breadcrumbs: [{ label: 'Changelog' }], content });
  }

  const nameList = (names, kind) =>
    names.length
      ? `<div class="derived-list">${names
          .map((n) => {
            const known = kind === 'class' ? site.classes.has(n) : kind === 'enum' ? site.enums.has(n) : false;
            return known ? `<a href="${base}${kind}/${n}/">${esc(n)}</a>` : `<span>${esc(n)}</span>`;
          })
          .join(' ')}</div>`
      : '<p class="muted">None.</p>';

  const clsChanged = diff.classesChanged
    .map((c) => {
      const rows = [];
      for (const s of c.methodsAdded) rows.push(`<tr class="added"><td>+</td><td><code>${esc(s)}</code></td></tr>`);
      for (const s of c.methodsRemoved) rows.push(`<tr class="removed"><td>−</td><td><code>${esc(s)}</code></td></tr>`);
      for (const ch of c.methodsChanged)
        rows.push(`<tr class="changed"><td>±</td><td><code class="old">${esc(ch.from)}</code><br><code>${esc(ch.to)}</code></td></tr>`);
      for (const s of c.membersAdded) rows.push(`<tr class="added"><td>+</td><td><code>${esc(s)}</code></td></tr>`);
      for (const s of c.membersRemoved) rows.push(`<tr class="removed"><td>−</td><td><code>${esc(s)}</code></td></tr>`);
      const link = site.classes.has(c.name) ? `<a href="${base}class/${c.name}/">${esc(c.name)}</a>` : esc(c.name);
      return `<details class="diff-class"><summary>${link} <span class="count">${rows.length}</span></summary>
<table class="list difftable"><tbody>${rows.join('')}</tbody></table></details>`;
    })
    .join('\n');

  const enumChanged = diff.enumsChanged
    .map((e) => {
      const rows = [
        ...e.valuesAdded.map((v) => `<tr class="added"><td>+</td><td><code>${esc(v)}</code></td></tr>`),
        ...e.valuesRemoved.map((v) => `<tr class="removed"><td>−</td><td><code>${esc(v)}</code></td></tr>`),
      ];
      const link = site.enums.has(e.name) ? `<a href="${base}enum/${e.name}/">${esc(e.name)}</a>` : esc(e.name);
      return `<details class="diff-class"><summary>${link} <span class="count">${rows.length}</span></summary>
<table class="list difftable"><tbody>${rows.join('')}</tbody></table></details>`;
    })
    .join('\n');

  const content = `
<h1>Changelog — DayZ ${esc(site.build)} <span class="muted">vs ${esc(prevLabel)}</span></h1>
<section class="stats">
  <span class="stat"><strong>${diff.classesAdded.length}</strong><span>classes added</span></span>
  <span class="stat"><strong>${diff.classesRemoved.length}</strong><span>classes removed</span></span>
  <span class="stat"><strong>${diff.classesChanged.length}</strong><span>classes changed</span></span>
  <span class="stat"><strong>${diff.enumsAdded.length + diff.enumsRemoved.length + diff.enumsChanged.length}</strong><span>enum changes</span></span>
</section>
<h2>New classes <span class="count">${diff.classesAdded.length}</span></h2>
${nameList(diff.classesAdded, 'class')}
<h2>Removed classes <span class="count">${diff.classesRemoved.length}</span></h2>
${nameList(diff.classesRemoved, 'none')}
<h2>Changed classes <span class="count">${diff.classesChanged.length}</span></h2>
${clsChanged || '<p class="muted">None.</p>'}
<h2>New enums <span class="count">${diff.enumsAdded.length}</span></h2>
${nameList(diff.enumsAdded, 'enum')}
<h2>Removed enums <span class="count">${diff.enumsRemoved.length}</span></h2>
${nameList(diff.enumsRemoved, 'none')}
<h2>Changed enums <span class="count">${diff.enumsChanged.length}</span></h2>
${enumChanged || '<p class="muted">None.</p>'}
<h2>All builds</h2>
<p>${ctx.versions
    .map((v, i) => {
      const href = i === 0 ? `${ctx.root}changes/` : `${ctx.root}v/${v.label}/changes/`;
      return v.label === site.label ? `<strong>${esc(v.build)}</strong>` : `<a href="${href}">${esc(v.build)}</a>`;
    })
    .join(' · ')}</p>`;

  return layout({ ...ctx, title: `Changelog ${site.build}`, active: 'Changelog', breadcrumbs: [{ label: 'Changelog' }], content });
}

export function render404(ctx) {
  const content = `
<h1>Page not found</h1>
<p>This page doesn't exist in this version of the documentation. It may have been added in a newer DayZ version, or removed.</p>
<p><a href="${ctx.root}">Go to the latest documentation</a> or use the search box above.</p>`;
  return layout({ ...ctx, title: 'Not found', content });
}
