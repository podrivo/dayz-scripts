/* Light / dark. */

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
