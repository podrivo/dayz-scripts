/* Source minimap.

   A rail beside a source file holding the whole of it at once: one bar per
   line, positioned and sized by where the line sits and how long it is, so
   the column reads as the shape of the code. Dragging scrolls, clicking
   jumps to the line under the pointer.

   Source pages only. Every other long page here is a list of named things,
   and a list of nine hundred methods is nine hundred identical marks that
   say nothing; those are served by the table of contents, which names
   what the rail could only gesture at. Code is the one
   thing on this site with a texture worth mapping.

   Built here rather than in the markup because it is measured, throwaway
   chrome, and because the generated HTML has to stay byte-identical across
   builds. It carries aria-hidden: every bar targets a line the page already
   exposes to a screen reader, so announcing all of them twice would only
   add noise. */

import { $ } from './dom.js';

export function initMinimap() {
  const srcEl = $('#src code');
  const main = $('.main');
  if (!srcEl || !main) return;

  const wide = matchMedia('(min-width: 901px)');
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  let mm, track, view, items, bars = [], scale = 1;

  /** Every line with its document geometry, measured once per layout. Lines
      are uniform, so two reads give every offset and spare us thousands more.
      Offsets come from the viewport rather than offsetTop, which is measured
      from the positioned ancestor and would need correcting anyway. */
  function collect() {
    const lines = [...srcEl.children];
    if (lines.length < 2) return [];
    const y0 = scrollY;
    const first = lines[0].getBoundingClientRect();
    const lh = lines[1].getBoundingClientRect().top - first.top;
    return lines.map((el, i) => {
      const text = el.textContent;
      return {
        el,
        top: first.top + y0 + i * lh,
        h: lh,
        indent: text.length - text.trimStart().length,
        len: text.trim().length,
      };
    });
  }

  /** Project the lines onto the rail, one bar per pixel row. */
  function place() {
    const th = track.clientHeight;
    const tw = track.clientWidth;
    if (!th || !tw) return; // rail is hidden (narrow viewport)
    scale = th / document.documentElement.scrollHeight;

    // A long file puts a dozen lines on the same row. Keep the longest and
    // the shallowest, so the row still describes them.
    const rows = new Map();
    for (const it of items) {
      const y = Math.round(it.top * scale);
      const w = Math.max(2, Math.min(1, it.len / 80) * tw);
      const x = Math.min(0.4, it.indent / 60) * tw;
      const h = Math.max(1, Math.round(it.h * scale));
      const r = rows.get(y);
      if (!r) { rows.set(y, { y, x, w, h, it }); continue; }
      r.x = Math.min(r.x, x);
      r.h = Math.max(r.h, h);
      // the fullest of them owns the row, so a click lands on real text
      if (w > r.w) { r.w = w; r.it = it; }
    }

    bars = [...rows.values()];
    track.innerHTML = bars
      .map((b) => `<i class="mm-bar" style="top:${b.y}px;` +
        `left:${b.x.toFixed(1)}px;width:${b.w.toFixed(1)}px;height:${b.h}px"></i>`)
      .join('') + '<div class="mm-view"></div>';
    view = $('.mm-view', track);
  }

  function sync() {
    if (!view) return;
    view.style.top = `${(scrollY * scale).toFixed(1)}px`;
    view.style.height = `${Math.max(8, innerHeight * scale).toFixed(1)}px`;
  }

  /** The bar under (or within a few pixels of) a point on the rail. */
  function nearest(y) {
    let best = null;
    let bd = 9;
    for (const b of bars) {
      const d = y < b.y ? b.y - y : Math.max(0, y - b.y - b.h);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function buildMinimap() {
    if (mm) return;
    items = collect();
    // Not worth a rail if the page barely scrolls or has nothing to point at.
    if (items.length < 8 || document.documentElement.scrollHeight < innerHeight * 1.8) return;

    mm = document.createElement('aside');
    mm.className = 'minimap';
    mm.setAttribute('aria-hidden', 'true');
    mm.innerHTML = '<div class="mm-track"></div>';
    main.after(mm);
    track = $('.mm-track', mm);
    place();
    sync();

    const at = (e) => e.clientY - track.getBoundingClientRect().top;
    // Centre the viewport on the point pressed, the way a minimap does.
    const centre = (y, smooth) => scrollTo({
      top: Math.max(0, y / scale - innerHeight / 2),
      behavior: smooth && !still.matches ? 'smooth' : 'auto',
    });

    let down = false;
    let dragging = false;
    let startY = 0;

    track.addEventListener('pointerdown', (e) => {
      e.preventDefault(); // don't start a text selection in the page behind
      track.setPointerCapture(e.pointerId);
      down = true;
      dragging = false;
      startY = e.clientY;
      track.classList.add('grabbing');
    });
    track.addEventListener('pointermove', (e) => {
      if (!down) return;
      if (!dragging && Math.abs(e.clientY - startY) > 3) dragging = true;
      if (dragging) centre(at(e), false);
    });
    // A press that never moved is aimed at something: bars are one or two
    // pixels tall, so honour the nearest one instead of the raw position.
    track.addEventListener('pointerup', (e) => {
      down = false;
      track.classList.remove('grabbing');
      if (dragging) return;
      const b = nearest(at(e));
      if (b) b.it.el.scrollIntoView({ block: 'start', behavior: still.matches ? 'auto' : 'smooth' });
      else centre(at(e), true);
    });
    // without this a cancelled gesture leaves the rail scrolling on hover
    track.addEventListener('pointercancel', () => {
      down = false;
      track.classList.remove('grabbing');
    });

    addEventListener('scroll', sync, { passive: true });

    // The page can grow after load — a <details> opens, the window resizes, a
    // font settles — and every offset moves with it, so measure again.
    let pending;
    new ResizeObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(() => { items = collect(); place(); sync(); }, 120);
    }).observe(document.body);
  }

  const boot = () => { if (wide.matches) buildMinimap(); };
  wide.addEventListener('change', boot);
  boot();
}
