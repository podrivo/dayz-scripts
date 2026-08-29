/* The hand-off to site/compare.js.

   The one page whose behaviour is fetched rather than shipped. /changelog/ is
   a single URL out of some 660,000, and its build pickers, its filter and the
   diff it composes have no business in the script every class page loads. */

import { $, fmtDate } from './dom.js';
import { current, identity } from './builds.js';

export function initChangelog() {
  const compareBox = $('#compare');
  if (!compareBox) return;
  Promise.all([import('/assets/compare.js'), identity()])
    .then(([{ initCompare }, builds]) => initCompare({ builds, fmtDate, current }))
    .catch(() => {
      compareBox.setAttribute('aria-busy', 'false');
      compareBox.className = 'cmp muted';
      compareBox.textContent = 'The changelog could not be loaded. Try reloading the page.';
    });
}
