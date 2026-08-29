/* One tooltip.

   Icon-only controls opt in with data-tip. Native title is the OS's box a
   second later; this is the same words, on the site's type, centred on the
   control and sitting above it — or below, when the header or the top of
   the window has no room — and only as far sideways as the viewport edge
   when the control is in a corner. One node, because a page can grow many
   of these and only one is ever showing. */

const GAP = 6;
const PAD = 8;
const DELAY = 350;

function chromeTop() {
  const css = getComputedStyle(document.documentElement);
  return (parseFloat(css.getPropertyValue('--h-top')) || 0)
    + (parseFloat(css.getPropertyValue('--h-bar')) || 0);
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
    const r = host.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    if (!tw || !th) return;

    const cx = r.left + r.width / 2;
    const left = Math.max(PAD, Math.min(cx - tw / 2, document.documentElement.clientWidth - tw - PAD));
    const need = th + GAP;
    const above = r.top - chromeTop();
    const below = window.innerHeight - r.bottom;
    const topSide = above >= need || above >= below;
    tip.style.left = `${left}px`;
    tip.style.top = `${topSide ? r.top - need : r.bottom + GAP}px`;
  }

  function reveal() {
    if (!host) return;
    tip.textContent = host.dataset.tip || '';
    place();
    tip.classList.add('on');
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
