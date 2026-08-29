// The about page at /about/.

import { layout, EXT, SITE_TITLE } from '../html.js';
import { REPO_URL, COLLABORATION_LINKS } from '../content.js';
import { linkCards } from './shared.js';

/**
 * What this site is, who builds it, and what it is made of. The lists are
 * hand-maintained in src/generate/content.js. Nothing here is derived from a
 * build, so these bytes are identical across all of them and the page keeps
 * its hard link; see layout() in src/generate/html.js.
 */
export function renderAbout(ctx) {
  const content = /* html */ `
<h1>About</h1>
<p>DIFF, DayZ Internal File Finder by <a href="https://yadz.app/" ${EXT}>YADZ</a>. Browsable documentation for the <a href="https://community.bistudio.com/wiki/DayZ:Enforce_Script_Syntax" ${EXT}>DayZ Enforce Script</a> sources — every class, method, enum and constant of <a href="https://dayz.com/" ${EXT}>DayZ</a>, generated automatically from the official <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff" ${EXT}>DayZ&nbsp;Script&nbsp;Diff</a> repository. It covers what ships in the game's script files; engine internals are not part of it.</p>
<p>Made for anyone wandering the DayZ modding and scripting world, and meant to be quicker to browse than the raw sources. There is no official detailed documentation on the subject, so community content is your best friend.</p>
<h2 id="colophon">Colophon</h2>
<p>DIFF is a custom static site generator: Node 20+, ES modules, and nothing to install. There is no bundler and no runtime dependency. A custom parser reads Enforce Script; the generator turns that into these pages; the browser runs plain modules out of <code>site/</code>.</p>
<p>Type is <a href="https://rsms.me/inter/" ${EXT}>Inter</a>, loaded from <a href="https://fonts.google.com/specimen/Inter" ${EXT}>Google Fonts</a> as a variable face with optical size, with the system UI stack behind it. Code, signatures and shortcuts use the platform monospace stack — ui-monospace, SF Mono, Cascadia Code, Menlo, Consolas.</p>
<p>The source lives on <a href="${REPO_URL}" ${EXT}>GitHub</a>. The site is hosted on <a href="https://www.netlify.com/" ${EXT}>Netlify</a>. The generator is <a href="${REPO_URL}/blob/main/LICENSE" ${EXT}>MIT</a>; the script sources it documents are © <a href="https://www.bohemia.net/" ${EXT}>Bohemia Interactive</a> and licensed under the <a href="https://www.bohemia.net/community/licenses/dayz-public-license-dpl" ${EXT}>DayZ Public License</a>.</p>
<h2 id="collaborations">Collaborations</h2>
<p>Bug reports, suggestions, and community notes are welcome.</p>
${linkCards(COLLABORATION_LINKS, true)}
<p class="muted endnote">This is not an official documentation and it is not affiliated with <a href="https://dayz.com/" ${EXT}>DayZ</a> or <a href="https://www.bohemia.net/" ${EXT}>Bohemia Interactive</a>. The script sources shown here are © BOHEMIA INTERACTIVE a.s., all rights reserved, and are licensed under the <a href="https://www.bohemia.net/community/licenses/dayz-public-license-dpl" ${EXT}>DayZ Public License (DPL)</a>. They have been modified for presentation — parsed, reorganized and reformatted into these pages — from the originals in <a href="https://github.com/BohemiaInteractive/DayZ-Script-Diff/tree/main/scripts" ${EXT}>DayZ Script Diff</a>, and are offered as-is, without warranties of any kind. DAYZ®, ENFUSION® and BOHEMIA INTERACTIVE® are registered trademarks of BOHEMIA INTERACTIVE a.s. All other trademarks and copyrights are the property of their respective owners.</p>`;

  return layout({
    ...ctx,
    title: 'About',
    active: 'about/',
    footer: false,
    description: `About ${SITE_TITLE}: the stack, and how to collaborate.`,
    breadcrumbs: [{ label: 'About' }],
    content,
  });
}
