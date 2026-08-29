/* Light / dark, and the wordmark that unfolds. */

import { $, typing } from './dom.js';

/* Two-state toggle over a three-state model (light / dark / system).
   Toggling to the value the OS already resolves to clears the override so
   the page follows the system again; anything else stores an override.
   The override is only evaluated on user interaction, never proactively.
   See https://lea.verou.me/blog/2026/dark-mode-toggles/ */
function toggleTheme() {
  const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const cur = document.documentElement.dataset.theme || system;
  const next = cur === 'dark' ? 'light' : 'dark';
  if (next === system) {
    delete document.documentElement.dataset.theme;
    try { localStorage.removeItem('theme'); } catch {}
  } else {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
  }
}

export function initTheme() {
  $('#themeBtn')?.addEventListener('click', toggleTheme);
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing()) {
      toggleTheme();
    }
  });
}

/** The brand in the header: DIFF spells itself out while the pointer is on it. */
export function initBrand() {
  const brand = $('.brand');
  if (!brand) return;
  let holdUntil = 0;
  const hold = () => {
    brand.classList.add('on');
    document.documentElement.dataset.brand = 'on';
    try { sessionStorage.setItem('brand-on', '1'); } catch {}
  };
  const release = () => {
    brand.classList.remove('on');
    delete document.documentElement.dataset.brand;
    try { sessionStorage.removeItem('brand-on'); } catch {}
  };
  if (document.documentElement.dataset.brand === 'on') {
    brand.classList.add('on');
    requestAnimationFrame(() => document.documentElement.classList.remove('brand-snap'));
  }
  brand.addEventListener('pointerenter', hold);
  brand.addEventListener('pointerleave', () => {
    if (performance.now() < holdUntil) return;
    release();
  });
  brand.addEventListener('click', (e) => {
    hold();
    holdUntil = performance.now() + 500;
    if ((location.pathname.replace(/\/+$/, '') || '/') === '/') e.preventDefault();
  });
}
