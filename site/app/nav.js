/* The header's navigation: a row of links, a drawer on a phone, and
   hiding once you have scrolled past it. */

import { $, track } from './dom.js';

export function initNav() {
  const menuBtn = $('#menuBtn');
  const setNavOpen = (open) => {
    document.body.classList.toggle('nav-open', open);
    menuBtn?.setAttribute('aria-expanded', String(open));
    if (open) document.documentElement.classList.remove('top-hidden');
  };
  menuBtn?.addEventListener('click', () => setNavOpen(!document.body.classList.contains('nav-open')));
  document.addEventListener('click', (e) => {
    if (e.target.closest('#nav') || e.target.closest('#menuBtn')) return;
    if (document.body.classList.contains('nav-open')) setNavOpen(false);
  });
  $('#nav')?.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) track('nav_click', { link_text: a.textContent.trim().slice(0, 40), link_url: a.href.slice(0, 200) });
  });
  $('.foot-nav')?.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) track('footer_click', { link_text: a.textContent.trim().slice(0, 40), link_url: a.href.slice(0, 200) });
  });
  for (const brand of document.querySelectorAll('a.brand')) {
    brand.addEventListener('click', () => {
      track('brand_click', { link_location: brand.closest('.foot') ? 'footer' : 'header' });
    });
  }
  hideOnScroll();
}

/** Headroom: hide on the way down, show on the way up. The page bar slides
    with the header; TOC and minimap read --h-top / --h-bar and follow. */
function hideOnScroll() {
  const header = $('.top');
  if (!header) return;

  const bar = $('.pagebar');
  const toTop = document.createElement('button');
  toTop.type = 'button';
  toTop.className = 'to-top';
  toTop.setAttribute('aria-label', 'Back to top');
  toTop.dataset.tip = 'Back to top';
  const ic = document.createElement('i');
  ic.className = 'ic ic-chev';
  ic.setAttribute('aria-hidden', 'true');
  toTop.append(ic);
  toTop.addEventListener('click', () => {
    toTop.blur();
    const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo({ top: 0, behavior: instant ? 'auto' : 'smooth' });
  });
  document.body.append(toTop);

  const slack = 16;
  let lastY = scrollY;
  let ticking = false;
  let navigatingToc = false;

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.toc a')) return;
    navigatingToc = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      navigatingToc = false;
      lastY = scrollY;
    }));
  });

  const pinned = () =>
    document.body.classList.contains('nav-open') ||
    header.contains(document.activeElement) ||
    bar?.contains(document.activeElement) ||
    bar?.classList.contains('open') ||
    $('#verMenu')?.hidden === false;

  const onScroll = () => {
    const y = scrollY;
    const dy = y - lastY;
    lastY = y;
    const showBtn = y >= header.offsetHeight;
    toTop.classList.toggle('on', showBtn);
    if (!showBtn && document.activeElement === toTop) toTop.blur();
    if (navigatingToc || $('.mm-track.grabbing')) return;
    if (y < header.offsetHeight || pinned() || dy < -slack) {
      document.documentElement.classList.remove('top-hidden');
    } else if (dy > slack) {
      document.documentElement.classList.add('top-hidden');
    }
  };

  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      onScroll();
    });
  }, { passive: true });
  onScroll();
}
