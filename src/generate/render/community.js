// The community page at /community/.

import { esc, layout, EXT } from '../html.js';
import {
  OFFICIAL_LINKS, OFFICIAL_MODDING_LINKS, DISCORD_LINKS, COMMUNITY_SECTIONS,
  YADZ_DISCORD, REPO_URL,
} from '../content.js';
import { linkCards } from './shared.js';

/**
 * Where to go for everything this site does not cover. The API is generated,
 * but almost nothing explains it: the answers live in Discord pins, community
 * wikis and other people's tools, so they get a page rather than a paragraph.
 * It closes with community notes, which are the way to add documentation here
 * rather than link to it elsewhere.
 *
 * The lists are hand-maintained in src/generate/content.js. Nothing here is
 * derived from a build, so these bytes are identical across all of them and
 * the page keeps its hard link; see layout() in src/generate/html.js. The
 * Workshop section is an empty shell, filled by site/app/workshop.js.
 */
export function renderCommunity(ctx) {
  const section = ({ id, title, links }) => /* html */ `<h2 id="${id}">${esc(title)}</h2>
${linkCards(links, true)}`;

  const content = /* html */ `
<h1>Community</h1>
<p>Most of the DayZ script API carries no documentation, and there is no official reference that fills the gap. These are the places that do: the official pages that exist, the servers where questions get answered, and the tools and references the community maintains.</p>
<p>Have something that belongs here? Suggest it on <a href="${YADZ_DISCORD}" ${EXT}>Discord</a> or open a pull request on <a href="${REPO_URL}" ${EXT}>GitHub</a>.</p>
<h2 id="official">Official</h2>
${linkCards(OFFICIAL_LINKS, true)}
<h2 id="official-modding">Official modding docs</h2>
${linkCards(OFFICIAL_MODDING_LINKS, true)}
<h2 id="discord">Discord servers</h2>
${linkCards(DISCORD_LINKS, true)}
<h2 id="workshop">Steam Workshop</h2>
<p>The most subscribed DayZ mods on Steam, fetched when you open this page. <a href="https://steamcommunity.com/app/221100/workshop/" ${EXT}>Browse all</a>.</p>
<div id="workshop-stats" class="stats" hidden></div>
<div id="workshop-list" aria-live="polite" aria-busy="true"><p class="muted">Loading workshop…</p></div>
${COMMUNITY_SECTIONS.map(section).join('\n')}
<h2 id="notes">Community notes</h2>
<p>Most of the script API has no doc comment. A community note fills one in: a short annotation on a class, enum or member — what an argument expects, whether a call is server-only, what a method does that its name does not say. Notes show up on that declaration's page, labelled as community writing rather than Bohemia's, and on every build at once.</p>
<p>They live in one file, <code>site/notes.json</code>, keyed by a type name or <code>Type.Member</code>:</p>
<pre class="code"><code>{
  "PlayerBase": "Server-side only outside of simulation callbacks.",
  "PlayerBase.SetQuantity": "Clamps to the config maximum instead of failing; read it back with \`GetQuantity()\`."
}</code></pre>
<p>Add an entry and open a pull request on <a href="${REPO_URL}" ${EXT}>GitHub</a>. <code>Type.Member</code> covers every overload of that name, enum values key off the value name, and text between backticks renders as code. The build rejects a key that is not <code>Type</code> or <code>Type.Member</code>, an empty note, or an unclosed backtick. Merged notes go live on the next deploy.</p>`;

  return layout({
    ...ctx,
    title: 'Community',
    active: 'community/',
    description: 'DayZ modding resources: official references, Discord servers, Steam Workshop, editors, build tools, object and map data, and agent tooling.',
    breadcrumbs: [{ label: 'Community' }],
    content,
  });
}
