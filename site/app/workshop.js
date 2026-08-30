/* Steam Workshop cards on /community/. The items are fetched when the page
   opens; the HTML is only the empty list. */

import { $, esc } from './dom.js';

const WORKSHOP = 'https://steamcommunity.com/app/221100/workshop/';
const STORE = 'https://store.steampowered.com/app/221100/DayZ/';
const COLLECTIONS = 'https://steamcommunity.com/workshop/browse/?appid=221100&section=collections';

const fmt = (n) => Number(n).toLocaleString('en-US');
const card = (it) => `<a class="card card-ext" href="${esc(it.url)}" target="_blank" rel="noopener">
  <i class="ic ic-ext" aria-hidden="true"></i>
  <h3>${esc(it.title)}</h3>
  <p>${esc(fmt(it.subscriptions))} subscribers</p>
</a>`;
const stat = (n, label, href) =>
  `<a class="stat" href="${esc(href)}" target="_blank" rel="noopener"><strong>${esc(fmt(n))}</strong><span>${esc(label)}</span></a>`;

export function initWorkshop() {
  const box = $('#workshop-list');
  if (!box) return;
  const stats = $('#workshop-stats');
  fetch('/api/workshop', { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then((data) => {
      if (!data.items?.length) throw new Error();
      if (stats) {
        stats.hidden = false;
        stats.innerHTML = [
          data.players ? stat(data.players, 'playing now', STORE) : '',
          data.total ? stat(data.total, 'workshop items', WORKSHOP) : '',
          data.collections ? stat(data.collections, 'collections', COLLECTIONS) : '',
        ].join('');
      }
      box.setAttribute('aria-busy', 'false');
      box.className = 'cards';
      box.innerHTML = data.items.map(card).join('');
    })
    .catch(() => {
      box.setAttribute('aria-busy', 'false');
      box.className = 'muted';
      box.textContent = 'Workshop items could not be loaded. Try reloading the page.';
    });
}
