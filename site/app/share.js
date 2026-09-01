/* Sharing a line, or a run of them.

   A mod is talked about one function at a time, and the unit of that
   conversation is a link: "look at this". Every line of a source page already
   carries an id and every cross-reference the generator writes already points
   at one, so the only thing missing was a way to make such a link without
   knowing that #L42 was a thing you could type.

   Clicking is that way: click a line to take it, shift-click a second to take
   everything between, click the one you hold to let go. The URL follows
   along, which makes the address bar itself the link; the strip at the foot
   of the window hands it over without the trip up there, along with the code
   as text and the same lines on GitHub. */

import { $, VPATH, pathBuild, typing, track } from './dom.js';
import { current, identity } from './builds.js';
import { copyText } from './copy.js';

/** A line hash as a range, or null: "#L42" and "#L42-L58". */
export function parseHash(hash) {
  const m = /^#L(\d+)(?:-L?(\d+))?$/.exec(hash || '');
  if (!m) return null;
  const from = +m[1];
  const to = m[2] ? +m[2] : from;
  // A hand-written link can name its ends either way round.
  return to < from ? { from: to, to: from } : { from, to };
}

export const formatHash = (r) => (r.from === r.to ? `#L${r.from}` : `#L${r.from}-L${r.to}`);

let preEl = null;
let srcEl = null;
let sel = null; // the selected range, as { from, to }
let anchor = null; // the line a shift-click measures from
let marked = null; // the range currently wearing .hl
let bar = null;

/**
 * Put .hl on the selected lines and take it off the rest. Called again after
 * every repaint, since painting replaces the lines this wrote on.
 */
export function showSelection() {
  if (!srcEl) return;
  const lines = srcEl.children;
  if (marked) {
    for (let i = marked.from; i <= marked.to; i++) lines[i - 1]?.classList.remove('hl');
  }
  marked = null;
  if (!sel) return;
  for (let i = sel.from; i <= sel.to; i++) lines[i - 1]?.classList.add('hl');
  marked = sel;
}

/** The selected lines as they were written, for pasting somewhere else. */
function selectedCode() {
  const lines = srcEl.children;
  let out = '';
  for (let i = sel.from; i <= sel.to; i++) out += lines[i - 1]?.textContent || '';
  return out.replace(/\n$/, '');
}

/**
 * This page at this range, spelled absolutely so it can be pasted anywhere,
 * and named by the build being read rather than by whichever build is newest
 * on the day the link is opened.
 *
 * The site root is a moving target: it is the latest build, and the line that
 * is 302 today is 297 after the next update, which makes a link to it a link
 * to the wrong code. So every link names its build, /v/<build>/…, including
 * the ones made at the root, where that URL redirects back to the root until
 * the build stops being the newest and quietly becomes the archived copy the
 * link was always promising.
 */
function shareUrl() {
  const build = current?.build || pathBuild;
  return `${location.origin}/${build ? `v/${build}/` : ''}${VPATH}${formatHash(sel)}`;
}

/** A button of the bar. The label is drawn by the stylesheet, as it is for
    every other copy button, so this only has to say it for a reader. */
function barBtn(cls, label, tag = 'button') {
  const b = document.createElement(tag);
  if (tag === 'button') b.type = 'button';
  b.className = `copy-btn ${cls}`;
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
}

function buildBar() {
  const el = document.createElement('div');
  el.className = 'share-bar';

  const what = document.createElement('span');
  what.className = 'share-what';

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'share-clear';
  clear.title = 'Clear the selection';
  clear.setAttribute('aria-label', 'Clear the selection');

  const link = barBtn('share-link', 'Copy link');
  link.addEventListener('click', () => copyText(shareUrl(), link, 'share_link'));

  const code = barBtn('share-code', 'Copy code');
  code.addEventListener('click', () => copyText(selectedCode(), code, 'share_code'));

  // The page's own GitHub link, already pinned to this build's commit by
  // builds.js, which spells a line range the same way this page does.
  const src = $('#ghSrc');
  const gh = src && barBtn('share-gh', 'See on GitHub', 'a');
  if (gh) {
    gh.target = '_blank';
    gh.rel = 'noopener';
    gh.addEventListener('click', () => track('view_github', { source: 'share' }));
  }

  el.append(what, clear, link, code, ...(gh ? [gh] : []));
  document.body.append(el);
  // Read the layout back before anything switches it on, so the first
  // appearance slides in from the resting state rather than starting there.
  void el.offsetWidth;
  clear.addEventListener('click', () => select(null));
  return { el, what, gh, src };
}

function showBar() {
  if (!sel && !bar) return;
  bar ||= buildBar();
  if (!sel) {
    bar.el.classList.remove('on');
    return;
  }
  bar.what.textContent =
    sel.from === sel.to ? `Line ${sel.from}` : `Lines ${sel.from}\u2013${sel.to}`;
  if (bar.gh) bar.gh.href = bar.src.href.replace(/#.*/, '') + formatHash(sel);
  bar.el.classList.add('on');
}

/** Take a range, and say so in the URL. Null clears. */
function select(range) {
  sel = range;
  if (!range) anchor = null;
  // replaceState rather than the hash: a fragment navigation cannot express a
  // range, and it would jump the page back to the top of the line every time.
  history.replaceState(null, '', sel ? formatHash(sel) : location.pathname + location.search);
  showSelection();
  showBar();
}

const span = (a, b) => ({ from: Math.min(a, b), to: Math.max(a, b) });

/** The line under the pointer, wherever it has got to, or null. */
function lineAt(e) {
  const n = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.line')?.id;
  return n ? +n.slice(1) : null;
}

/* ---------- taking lines with the pointer ----------
   Three gestures over one press: a click takes a line, a drag takes every
   line it crosses, and a shift-click reaches from the line already held to
   the one clicked. All three are the browser's own text-selection gestures,
   which is why the press below refuses the default: left to itself the
   browser would paint its own blue over the code at the same time, and a
   shift-click would extend that instead of the range. Selecting code by hand
   is what the double-click below leaves alone, and what "Copy code" is for.

   Mouse events rather than pointer ones, so that a finger dragging the page
   scrolls it: a tap that turns out not to be a scroll arrives here anyway,
   as the mousedown the browser sends afterwards. */
let drag = null;
let over = null;

function onDown(e) {
  if (e.button !== 0) return;
  // The fold arrow, the documentation icon, and any name in the code that
  // resolves to a page: all of them answer for themselves.
  if (e.target.closest('a, button')) return;
  // A second click is after a word, not a line. Left alone, it selects one.
  if (e.detail > 1) return;
  const el = e.target.closest('.line');
  const n = el && +el.id.slice(1);
  if (!n) return;

  e.preventDefault();
  window.getSelection?.()?.removeAllRanges?.();
  preEl.classList.add('picking');
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp, { once: true });
  over = n;

  // The anchor stays where the last plain press put it, so a range can be
  // stretched and restretched from one end without starting over.
  if (e.shiftKey && anchor) {
    drag = { moved: true };
    select(span(anchor, n));
    return;
  }
  // Pressing the one line already held is how you put it back down, which is
  // the only way out of a selection on a screen with no shift key. It waits
  // for the release, since the press might yet turn into a drag.
  const held = sel && sel.from === n && sel.to === n;
  drag = { moved: false, held };
  anchor = n;
  if (!held) select({ from: n, to: n });
}

function onMove(e) {
  const n = lineAt(e);
  if (!n || n === over) return;
  over = n;
  drag.moved = true;
  select(span(anchor, n));
}

function onUp() {
  document.removeEventListener('mousemove', onMove);
  preEl.classList.remove('picking');
  if (drag && !drag.moved && drag.held) select(null);
  drag = null;
}

/* The two listeners below watch the window rather than the page, so they are
   laid down once however many source pages are swapped through this document
   (site/app/swap.js). Everything else here is re-read per page. */
let wired = false;

export function initShare() {
  preEl = $('#src');
  srcEl = $('#src code');
  if (!srcEl) {
    // Swapped to a page with no listing: drop the strip and the selection
    // rather than leave them describing the file that has gone.
    sel = null;
    marked = null;
    anchor = null;
    showBar();
    return;
  }

  // Which build this is, ready long before anyone clicks a line. The one
  // promise is shared with the version picker, so asking costs nothing.
  identity();

  // A link arrived at from somewhere else lands highlighted and scrolled, with
  // the strip already up: whoever followed it is one step from passing it on,
  // widening it, or putting it down, and the strip is where all three live.
  sel = parseHash(location.hash);
  anchor = sel?.from ?? null;
  if (sel) track('landed_deep_link', { line_from: sel.from, line_to: sel.to });
  showSelection();
  showBar();

  preEl.addEventListener('mousedown', onDown);

  if (wired) return;
  wired = true;
  addEventListener('hashchange', () => {
    sel = parseHash(location.hash);
    anchor = sel?.from ?? null;
    showSelection();
    showBar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !sel || typing()) return;
    select(null);
  });
}
