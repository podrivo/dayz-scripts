/* The header's navigation: a row of links, and a drawer on a phone. */

import { $ } from './dom.js';

export function initNav() {
  const menuBtn = $('#menuBtn');
  const setNavOpen = (open) => {
    document.body.classList.toggle('nav-open', open);
    menuBtn?.setAttribute('aria-expanded', String(open));
  };
  menuBtn?.addEventListener('click', () => setNavOpen(!document.body.classList.contains('nav-open')));
  document.addEventListener('click', (e) => {
    if (e.target.closest('#nav') || e.target.closest('#menuBtn')) return;
    if (document.body.classList.contains('nav-open')) setNavOpen(false);
  });
}
