// The home page at /, and the release history it ends with.

import { layout, EXT, SITE_TITLE } from '../html.js';
import { OFFICIAL_LINKS, DISCORD_LINKS } from '../content.js';
import { linkCards, renderReleases } from './shared.js';

export function renderHome(ctx) {
  const { site, base } = ctx;
  const s = site.stats;

  const stat = (n, label, href) =>
    `<a class="stat" href="${href}"><strong>${n.toLocaleString('en-US')}</strong><span>${label}</span></a>`;

  const explore = [
    ['PlayerBase', `${base}classes/PlayerBase/`, 'The player entity'],
    ['ItemBase', `${base}classes/ItemBase/`, 'Base of all items'],
    ['EntityAI', `${base}classes/EntityAI/`, 'Base of interactive entities'],
    ['ActionBase', `${base}classes/ActionBase/`, 'Player actions'],
    ['DayZInfected', `${base}classes/DayZInfected/`, 'The infected'],
    ['CarScript', `${base}classes/CarScript/`, 'Vehicles'],
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
<p>DIFF is generated automatically from the official <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff/tree/main/scripts" ${EXT}>DayZ Script Diff</a> sources, so it covers what ships in the game's script files — engine internals are not part of it. The stack it is built with, and how to collaborate, are on <a href="${base}about/">About</a>.</p>
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
