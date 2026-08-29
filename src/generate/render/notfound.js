// The 404 page. Netlify serves it for every path it holds no file for.

import { layout } from '../html.js';

export function render404(ctx) {
  const content = /* html */ `
<h1>Page not found</h1>
<p>This page doesn't exist in this version of the documentation. It may have been added in a newer DayZ version, or removed.</p>
<p><a href="${ctx.root}">Go to the latest documentation</a> or use the search box above.</p>`;
  // site/notfound.js reads the url and forwards a mis-cased one to the page it
  // names, which is why it belongs here and nowhere else.
  return layout({ ...ctx, title: 'Not found', noindex: true, script: 'notfound.js', content });
}
