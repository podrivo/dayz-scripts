/* The credits page crawls like a film roll.

   The chrome fades, the names rise from the bottom of the screen, and the
   page is a page again the moment you scroll or the roll runs out. */

import { $, typing, VPATH } from './dom.js';

const SPEED = 88;
const EASE_MS = 1600;
const KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
const VIDEO = '_JgmJahM1R0';
const START = 15;

export function initCredits() {
  if (VPATH !== 'credits/') return;
  const main = $('.main');
  if (!main) return;
  const title = $('h1', main);
  if (title) fitTitle(title);

  let yt = null;
  let playing = false;
  mountTrack();
  $('.credits-track-frame')?.addEventListener('click', () => pauseTrack(yt));
  loadPlayer((p) => { yt = p; });

  if (location.hash || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.body.classList.add('credits-done');
    return;
  }

  const go = mountGo();
  go.addEventListener('click', (e) => {
    e.stopPropagation();
    begin();
  });

  const reveal = () => {
    document.body.classList.add('credits-done');
    removeEventListener('click', reveal);
    removeEventListener('scroll', dismissGo);
  };

  const dismissGo = () => {
    if (!scrollY) return;
    go.remove();
    reveal();
  };

  addEventListener('click', reveal);
  addEventListener('scroll', dismissGo, { passive: true });

  let tail;
  let restoreScroll;
  let raf = 0;
  let last = 0;
  let begun = 0;

  const tick = (now) => {
    if (!playing) return;
    if (!last) last = now;
    if (!begun) begun = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = Math.min(1, (now - begun) / EASE_MS);
    const speed = SPEED * (t * t * (3 - 2 * t));
    const max = document.documentElement.scrollHeight - innerHeight;
    const next = scrollY + speed * dt;
    if (next >= max - 1) {
      scrollTo(0, max);
      finish();
      return;
    }
    scrollTo(0, next);
    raf = requestAnimationFrame(tick);
  };

  const dropSpacers = () => {
    tail.remove();
  };

  const endCinema = () => {
    document.body.classList.remove('credits-cinema', 'credits-ui');
    document.body.classList.add('credits-done');
    document.documentElement.classList.remove('top-hidden');
    history.scrollRestoration = restoreScroll || 'auto';
    detach();
  };

  const finish = () => {
    if (!playing) return;
    playing = false;
    pauseTrack(yt);
    cancelAnimationFrame(raf);
    document.documentElement.classList.remove('top-hidden');
    document.body.classList.add('credits-ui');
    setTimeout(() => {
      dropSpacers();
      endCinema();
    }, 900);
  };

  const takeControl = () => {
    if (!playing) return;
    playing = false;
    pauseTrack(yt);
    cancelAnimationFrame(raf);
    document.body.classList.add('credits-ui');
    dropSpacers();
    document.documentElement.classList.remove('top-hidden');
    setTimeout(endCinema, 400);
  };

  const onKey = (e) => {
    if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (KEYS.has(e.key)) takeControl();
  };

  const detach = () => {
    removeEventListener('click', takeControl);
    removeEventListener('wheel', takeControl);
    removeEventListener('touchmove', takeControl);
    removeEventListener('keydown', onKey);
  };

  function begin() {
    if (playing) return;
    removeEventListener('click', reveal);
    removeEventListener('scroll', dismissGo);
    document.body.classList.remove('credits-done');
    go.remove();
    tail = spacer('credits-tail');
    main.append(tail);
    restoreScroll = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    scrollTo(0, 0);
    document.body.classList.add('credits-cinema');
    playing = true;
    playTrack(yt);
    addEventListener('click', takeControl);
    addEventListener('wheel', takeControl, { passive: true });
    addEventListener('touchmove', takeControl, { passive: true });
    addEventListener('keydown', onKey);
    raf = requestAnimationFrame(tick);
  }
}

function fitTitle(el) {
  const fit = () => {
    el.style.fontSize = '100px';
    const range = document.createRange();
    range.selectNodeContents(el);
    const tw = range.getBoundingClientRect().width;
    if (!tw) return;
    el.style.fontSize = `${102 * (el.clientWidth / tw)}px`;
  };
  const run = () => fit();
  if (document.fonts?.ready) document.fonts.ready.then(run);
  else run();
  new ResizeObserver(run).observe(el);
}

function mountGo() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'credits-go';
  btn.setAttribute('aria-label', 'Start credits');
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '\u2193';
  btn.append(arrow);
  document.body.append(btn);
  return btn;
}

function mountTrack() {
  const box = document.createElement('aside');
  box.className = 'credits-track';
  box.innerHTML = `<div class="credits-track-frame"><div id="credits-yt"></div></div>`;
  document.body.append(box);
}

function loadPlayer(ready) {
  const start = () => {
    const Player = globalThis.YT?.Player;
    if (!Player) return;
    new Player('credits-yt', {
      videoId: VIDEO,
      width: 640,
      height: 360,
      playerVars: {
        origin: location.origin,
        autoplay: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        controls: 0,
        fs: 0,
        disablekb: 1,
        iv_load_policy: 3,
        cc_load_policy: 0,
        showinfo: 0,
        start: START,
      },
      events: {
        onReady: (e) => {
          ready(e.target);
        },
      },
    });
  };
  if (globalThis.YT?.Player) {
    start();
    return;
  }
  const prev = globalThis.onYouTubeIframeAPIReady;
  globalThis.onYouTubeIframeAPIReady = () => {
    prev?.();
    start();
  };
  if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.append(s);
  }
}

function playTrack(p) {
  try {
    if ((p?.getCurrentTime?.() ?? 0) < START) p?.seekTo?.(START, true);
    p?.playVideo?.();
  } catch { /* autoplay may wait for a gesture */ }
}

function pauseTrack(p) {
  try { p?.pauseVideo?.(); } catch { /* player not ready */ }
}

function spacer(name) {
  const el = document.createElement('div');
  el.className = name;
  el.setAttribute('aria-hidden', 'true');
  return el;
}
