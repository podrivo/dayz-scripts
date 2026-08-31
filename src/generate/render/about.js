// The about page at /about/.

import { layout, EXT, SITE_TITLE } from '../html.js';
import { REPO_URL, COLLABORATION_LINKS, YADZ_DISCORD } from '../content.js';
import { linkCards } from './shared.js';

/** Machine-readable files agents should fetch instead of scraping HTML. */
const AGENT_LINKS = [
  ['llms.txt', '/llms.txt', 'Where agents start: what to fetch, and the license that covers it'],
  ['agent.md', '/agent.md', 'How to look a type up without scraping class pages'],
  ['api.json', '/api.json', 'Latest build: every class, method, field, enum, global, typedef and macro'],
  ['search.json', '/search.json', 'Compact name index the site search uses'],
  ['notes.json', '/assets/notes.json', 'Community notes, keyed by Type or Type.Member'],
  ['versions.json', '/assets/versions.json', 'Every documented PC build'],
  ['feed.xml', '/feed.xml', 'Atom feed of new PC stable builds'],
];

/**
 * What this site is, who builds it, how agents should read it, and what it is
 * made of. The lists are hand-maintained in src/generate/content.js. Nothing
 * here is derived from a build, so these bytes are identical across all of
 * them and the page keeps its hard link; see layout() in src/generate/html.js.
 */
export function renderAbout(ctx) {
  const content = /* html */ `
<h1>About</h1>
<p>DIFF, DayZ Internal File Finder by <a href="https://yadz.app/" ${EXT}>YADZ</a>. Browsable documentation for the <a href="https://community.bistudio.com/wiki/DayZ:Enforce_Script_Syntax" ${EXT}>DayZ Enforce Script</a> sources — every class, method, enum and constant of <a href="https://dayz.com/" ${EXT}>DayZ</a>, generated automatically from the official <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff" ${EXT}>DayZ&nbsp;Script&nbsp;Diff</a> repository. It covers what ships in the game's script files; engine internals are not part of it.</p>
<p>Made for anyone wandering the DayZ modding and scripting world, and meant to be quicker to browse than the raw sources. There is no official detailed documentation on the subject, so community content is your best friend.</p>
<h2 id="agents">Agents</h2>
<p>The HTML pages are for people. Agents should start at <a href="/llms.txt"><code>llms.txt</code></a> and fetch the JSON rather than scraping class pages. How to look a type up is in <a href="/agent.md"><code>agent.md</code></a>. <code>api.json</code> is latest-only; older builds keep the HTML archive at <code>/v/&lt;build&gt;/</code>. The script sources it describes are under the DPL; community notes are not.</p>
<p>For pasting into a chat by hand, every class and enum page has a Copy for LLM button under its title: the page as Markdown — signatures, inheritance, docs and community notes — with its build and source named.</p>
${linkCards(AGENT_LINKS)}
<h2 id="colophon">Colophon</h2>
<p>DIFF is a custom static site generator: Node 20+, ES modules, and nothing to install. There is no bundler and no runtime dependency. A custom parser reads Enforce Script; the generator turns that into these pages; the browser runs plain modules out of <code>site/</code>.</p>
<p>Type is <a href="https://rsms.me/inter/" ${EXT}>Inter</a>, loaded from <a href="https://fonts.google.com/specimen/Inter" ${EXT}>Google Fonts</a> as a variable face with optical size, with the system UI stack behind it. Code, signatures and shortcuts use the platform monospace stack — ui-monospace, SF Mono, Cascadia Code, Menlo, Consolas.</p>
<p>The source lives on <a href="${REPO_URL}" ${EXT}>GitHub</a>. The site is hosted on <a href="https://www.netlify.com/" ${EXT}>Netlify</a>. It is written and edited in <a href="https://cursor.com/" ${EXT}>Cursor</a> with multiple LLMs. The generator is <a href="${REPO_URL}/blob/main/LICENSE" ${EXT}>MIT</a>; the script sources it documents are © <a href="https://www.bohemia.net/" ${EXT}>Bohemia Interactive</a> and licensed under the <a href="https://www.bohemia.net/community/licenses/dayz-public-license-dpl" ${EXT}>DayZ Public License</a>.</p>
<h2 id="collaborations">Collaborations</h2>
<p>Bug reports, suggestions, and community notes are welcome. Open an issue or a pull request on <a href="${REPO_URL}" ${EXT}>GitHub</a>, or just leave a message on <a href="${YADZ_DISCORD}" ${EXT}>Discord</a>.</p>
${linkCards(COLLABORATION_LINKS, true)}`;

  return layout({
    ...ctx,
    title: 'About',
    active: 'about/',
    description: `About ${SITE_TITLE}: agents, the stack, and how to collaborate.`,
    breadcrumbs: [{ label: 'About' }],
    content,
  });
}
