// The changelog at /changelog/.

import { layout } from '../html.js';

/**
 * An empty shell, filled in by site/compare.js.
 *
 * What changed between two builds a modder actually cares about, which is
 * usually the one they built against and the one their users are running.
 *
 * There are 49 builds, so 1,176 pairs, and generating a page per pair would
 * mean holding two 8 MB models in memory 1,176 times over. It also would not
 * survive the obvious next ask, three builds at once, which is 18,424 triples.
 * So the pair is chosen in the browser instead, which is also what makes the
 * URL shareable: /changelog/?from=…&to=… names a comparison, not a build.
 *
 * Nothing here names a build, for the same reason nothing else does: the
 * selects are filled from /assets/versions.json client-side, so these bytes
 * are identical in all 49 builds and keep their hard link. See layout() in
 * src/generate/html.js.
 */
export function renderCompare(ctx) {
  const card = (side, label) => /* html */ `<label class="cmp-pick" data-side="${side}">
  <span>${label}</span><select id="cmp${label}" aria-label="Compare ${side} build"></select>
</label>`;
  const content = /* html */ `
<form class="cmp-stage" id="cmpBar" hidden>
  ${card('from', 'From')}
  <div class="cmp-mid">
    <button type="button" class="btn cmp-swap" id="cmpSwap" title="Swap the two builds" aria-label="Swap the two builds"><i class="ic ic-swap"></i></button>
    <span class="cmp-span" id="cmpSpan"></span>
    <button type="button" class="btn cmp-reset" id="cmpReset" hidden>Reset</button>
  </div>
  ${card('to', 'To')}
</form>
<noscript><p>The changelog is built in the browser and needs JavaScript.</p></noscript>
<div class="cmp" id="compare" aria-live="polite" aria-busy="true"><p class="muted">Loading builds…</p></div>`;
  return layout({
    ...ctx,
    title: 'Changelog',
    active: 'changelog/',
    description: 'What changed in the DayZ Enforce Script API between two game builds.',
    breadcrumbs: [{ label: 'Changelog' }],
    content,
  });
}
