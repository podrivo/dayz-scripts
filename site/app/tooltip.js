/* One tooltip.

   Icon-only controls opt in with data-tip. Native title is the OS's box a
   second later; this is the same words, on the site's type. Placement is
   the same bargain Base UI's Positioner strikes: prefer above, flip below
   if the header or the window edge is in the way, then try left and right,
   and slide along the other axis so a control in a corner does not push
   the box off the screen. One node, because a page can grow many of these
   and only one is ever showing. */

const GAP = 6;
const PAD = 8;
const DELAY = 350;

function chromeTop() {
  const css = getComputedStyle(document.documentElement);
  return (parseFloat(css.getPropertyValue('--h-top')) || 0)
    + (parseFloat(css.getPropertyValue('--h-bar')) || 0);
}

function view() {
  const vv = window.visualViewport;
  return {
    x: vv?.offsetLeft ?? 0,
    y: vv?.offsetTop ?? 0,
    w: vv?.width ?? window.innerWidth,
    h: vv?.height ?? window.innerHeight,
  };
}

/** Prefer top, then bottom, then the sides. Slide only on the other axis,
    the way Base UI flips `side` and shifts `align`. */
function fit(host, tw, th) {
  const r = host.getBoundingClientRect();
  const v = view();
  const minX = v.x + PAD;
  const maxX = v.x + v.w - PAD;
  const minY = v.y + chromeTop() + PAD;
  const maxY = v.y + v.h - PAD;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const clamp = (n, lo, hi) => (hi < lo ? lo : Math.min(Math.max(n, lo), hi));
  const midX = clamp(cx - tw / 2, minX, maxX - tw);
  const midY = clamp(cy - th / 2, minY, maxY - th);

  const tries = [
    { left: midX, top: r.top - th - GAP },
    { left: midX, top: r.bottom + GAP },
    { left: r.left - tw - GAP, top: midY },
    { left: r.right + GAP, top: midY },
  ];
  let best = tries[0];
  let bestOverflow = Infinity;
  for (const t of tries) {
    const overflow =
      Math.max(0, minX - t.left) + Math.max(0, t.left + tw - maxX)
      + Math.max(0, minY - t.top) + Math.max(0, t.top + th - maxY);
    if (overflow < bestOverflow) {
      best = t;
      bestOverflow = overflow;
      if (!overflow) break;
    }
  }
  return best;
}

export function initTooltip() {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  document.body.append(tip);

  let host = null;
  let timer = 0;

  function place() {
    if (!host) return;
    const tw = tip.scrollWidth;
    const th = tip.scrollHeight;
    if (!tw || !th) return;
    const { left, top } = fit(host, tw, th);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function reveal() {
    if (!host) return;
    tip.textContent = host.dataset.tip || '';
    place();
    tip.classList.add('on');
    place();
  }

  function arm(el) {
    if (el === host) return;
    clearTimeout(timer);
    host = el;
    timer = setTimeout(reveal, DELAY);
  }

  function disarm() {
    if (!host && !timer) return;
    clearTimeout(timer);
    timer = 0;
    host = null;
    tip.classList.remove('on');
  }

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el) arm(el);
    else disarm();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el) arm(el);
  });
  document.addEventListener('focusout', (e) => {
    if (!e.relatedTarget?.closest?.('[data-tip]')) disarm();
  });
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
}
