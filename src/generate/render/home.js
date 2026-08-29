// The home page at /, and the release history it ends with.

import { esc, layout, EXT, SITE_TITLE } from '../html.js';
import { OFFICIAL_LINKS, DISCORD_LINKS, FORUM_THREADS, VERSION_TITLES, YADZ_DISCORD } from '../content.js';
import { linkCards } from './shared.js';

function fmtDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

const buildNo = (build) => Number(build.split('.')[2] || 0);
const versionNo = (version) => {
  const [major, minor] = version.split('.').map(Number);
  return major * 1000 + minor;
};

/** "1.29 Update 1" from the oldest of that version. `builds` is newest-first. */
function updateNames(builds) {
  const count = new Map();
  const seen = new Map();
  for (const v of builds) count.set(v.version, (count.get(v.version) || 0) + 1);
  const names = new Map();
  for (const v of builds) {
    const n = (seen.get(v.version) || 0) + 1;
    seen.set(v.version, n);
    names.set(v.build, `${v.version} Update ${count.get(v.version) - n + 1}`);
  }
  return names;
}

/**
 * Release history grouped by game version: every build we document, merged
 * with the official forum threads. Builds whose scripts never reached the
 * Script Diff repository still show up, with their thread only.
 */
function renderReleases(ctx) {
  const { site, root, versions } = ctx;
  const names = updateNames(versions);
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
          const name = names.get(r.build) || r.build;
          const patch = r.build.split('.')[2];
          let label;
          if (r.build === site.build) label = `<strong title="${esc(r.build)}">${esc(name)}</strong>`;
          else if (r.docs) label = `<a href="${r.docs}" title="${esc(r.build)}">${esc(name)}</a>`;
          else label = `<span class="rbuild" title="Scripts for this build are not in the Script Diff repository (${esc(r.build)})">${esc(name)}</span>`;
          const notes = r.url ? ` <a href="${r.url}" ${EXT}>release notes</a>` : '';
          return `<li>${label}<span class="rpatch">${esc(patch)}</span><span class="rdate">${esc(fmtDate(r.date))}</span>${notes}</li>`;
        })
        .join('\n');
      return /* html */ `<details${version === site.version ? ' open' : ''}>
<summary>DayZ ${esc(version)}${title} <span class="count">${rows.size} build${rows.size === 1 ? '' : 's'}</span></summary>
<ul>
${items}
</ul>
</details>`;
    })
    .join('\n');
}

export function renderHome(ctx) {
  const { site, base } = ctx;
  const s = site.stats;

  const stat = (n, label, href) =>
    `<a class="stat" href="${href}"><strong>${n.toLocaleString('en-US')}</strong><span>${label}</span></a>`;

  const explore = [
    ['PlayerBase', `${base}class/PlayerBase/`, 'The player entity'],
    ['ItemBase', `${base}class/ItemBase/`, 'Base of all items'],
    ['EntityAI', `${base}class/EntityAI/`, 'Base of interactive entities'],
    ['ActionBase', `${base}class/ActionBase/`, 'Player actions'],
    ['DayZInfected', `${base}class/DayZInfected/`, 'The infected'],
    ['CarScript', `${base}class/CarScript/`, 'Vehicles'],
  ];

  const releases = renderReleases(ctx);

  const communityLinks = /* html */ `${linkCards(DISCORD_LINKS, true)}
<p>The rest of what the community has built — editors, build tools, references, object and map data, and agent tooling — is on <a href="${base}community/">Community</a>.</p>`;

  const content = /* html */ `
<section class="hero">
  <h1>Welcome</h1>
  <p>${SITE_TITLE}. Browsable documentation for the DayZ Enforce Script sources — every class, method, enum and constant of DayZ, generated automatically from the official <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff" ${EXT}>DayZ&nbsp;Script&nbsp;Diff</a> repository.</p>
  <p>Made for anyone wandering the DayZ modding and scripting world, and meant to be quicker to browse than the raw sources. This is just the tip of the iceberg: there is no official detailed documentation on the subject, so community content is your best friend. Once you join one of the Discord servers below, check the pinned messages — most recurring questions are answered there.</p>
</section>
<div class="home-stack">
<section class="stats">
  ${stat(s.classes, 'classes', base + 'classes/')}
  ${stat(s.methods, 'methods', base + 'classes/fields/functions/')}
  ${stat(s.enums, 'enums', base + 'globals/enums/')}
  ${stat(s.typedefs, 'typedefs', base + 'globals/typedefs/')}
  ${stat(s.globals, 'constants', base + 'globals/constants/')}
  ${stat(s.files, 'script files', base + 'files/')}
</section>
<div class="cards">
  <a class="card" href="${base}classes/">
    <h3>Classes</h3>
    <p>All ${s.classes.toLocaleString('en-US')} classes, the inheritance tree, and every member.</p>
  </a>
  <a class="card" href="${base}files/">
    <h3>Files</h3>
    <p>All ${s.files.toLocaleString('en-US')} script files in the layout the game ships: 1_Core through 5_Mission.</p>
  </a>
  <a class="card" href="${base}topics/">
    <h3>Topics</h3>
    <p>The ${site.groups.size} topics the scripts group themselves into — math, physics, entities, UI and the constant tables.</p>
  </a>
</div>
${linkCards(explore)}
</div>
<h2 id="official-links">Official links</h2>
${linkCards(OFFICIAL_LINKS, true)}
<h2 id="community-links">Community links</h2>
${communityLinks}
<h2 id="changelog">PC Stable Changelog</h2>
<div class="releases">
${releases}
</div>
<h2 id="about">About</h2>
<p>DIFF is generated automatically from the official <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff/tree/main/scripts" ${EXT}>DayZ Script Diff</a> sources, so it covers what ships in the game's script files — engine internals are not part of it. It is actively maintained, so if you find a bug or have a suggestion, share it on <a href="${YADZ_DISCORD}" ${EXT}>YADZ's Discord</a>.</p>
<p class="muted">This is not an official documentation and it is not affiliated with <a href="https://dayz.com/" ${EXT}>DayZ</a> or <a href="https://www.bohemia.net/" ${EXT}>Bohemia Interactive</a>. The script sources shown here are © BOHEMIA INTERACTIVE a.s., all rights reserved, and are licensed under the <a href="https://www.bohemia.net/community/licenses/dayz-public-license-dpl" ${EXT}>DayZ Public License (DPL)</a>. They have been modified for presentation — parsed, reorganized and reformatted into these pages — from the originals in <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff/tree/main/scripts" ${EXT}>DayZ Script Diff</a>, and are offered as-is, without warranties of any kind. DAYZ®, ENFUSION® and BOHEMIA INTERACTIVE® are registered trademarks of BOHEMIA INTERACTIVE a.s. All other trademarks and copyrights are the property of their respective owners.</p>`;

  return layout({
    ...ctx,
    title: '',
    active: '',
    footer: false,
    description: `${SITE_TITLE} — DayZ ${site.version} classes, methods, enums and sources.`,
    content,
  });
}
