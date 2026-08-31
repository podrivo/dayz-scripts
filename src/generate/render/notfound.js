// The 404 page. Netlify serves it for every path it holds no file for.

import { YADZ_DISCORD } from '../content.js';
import { EXT, layout } from '../html.js';

export function render404(ctx) {
  const content = /* html */ `
<h1>Page not found</h1>
<p>This page doesn't exist. If you believe this is an error, get in touch on <a href="${YADZ_DISCORD}" ${EXT}>Discord</a>.</p>
<p>Go to our <a href="${ctx.root}">homepage</a>, or search this version:</p>
<button class="search-trigger notfound-search" id="notfoundSearchBtn" type="button" aria-label="Search"><i class="ic ic-search"></i><span>Search for classes, methods, and more…</span><kbd>⌘K</kbd></button>`;
  // site/notfound.js reads the url and forwards a mis-cased one to the page it
  // names, which is why it belongs here and nowhere else.
  return layout({ ...ctx, title: 'Not found', noindex: true, script: 'notfound.js', content });
}
