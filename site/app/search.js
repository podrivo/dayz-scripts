/* The search palette: a modal overlay opened with ⌘K / Ctrl+K or `/`, rather
   than an always-visible field in the header. Ranks this build's whole index
   (see search-index.js) against what has been typed. */

import { $, BASE, esc, typing, track } from './dom.js';
import { KIND, SCOPED, ctxFor, entries, loadIndex, urlFor } from './search-index.js';
import { homeList, togglePin } from './recent.js';
import { closeOthers, onOverlay } from './overlay.js';

const RESULTS_MAX = 60;

/* Ranking nudges by kind: a class outranks its own methods when both match,
   and a topic outranks the constants filed under it. */
const KIND_BONUS = { c: 20, e: 12, g: 10, m: 5, v: 3 };

/* A name's initials — its first character, every capital, and whatever
   follows an underscore — so `eehb` can reach EEHitBy and `gg` GetGame the
   way the fingers that type these names all day expect. Cached because the
   same 60k names are asked again on every keystroke. */
const initialsCache = new Map();
function initialsOf(name) {
  let s = initialsCache.get(name);
  if (s === undefined) {
    s = name[0];
    for (let i = 1; i < name.length; i++) {
      const c = name.charCodeAt(i);
      if (c >= 65 && c <= 90) s += name[i];
      else if (name.charCodeAt(i - 1) === 95) s += name[i];
    }
    s = s.toLowerCase();
    initialsCache.set(name, s);
  }
  return s;
}

function score(name, q, qlc) {
  const nlc = name.toLowerCase();
  const i = nlc.indexOf(qlc);
  if (i === -1) {
    // No substring hit: try the initials. Capped below any substring match,
    // so `gg` still puts a name containing "gg" ahead of every G…G… one.
    if (qlc.length < 2 || !/^[a-z0-9]+$/.test(qlc)) return -1;
    const ini = initialsOf(name);
    if (!ini.startsWith(qlc)) return -1;
    return 35 + (ini.length === qlc.length ? 40 : 0) - Math.min(ini.length - qlc.length, 20);
  }
  let s = 100 - Math.min(i, 50) - Math.min(name.length - q.length, 30);
  if (i === 0) s += 60;
  if (name === q) s += 100;
  if (nlc === qlc) s += 80;
  if (i > 0 && /[^a-z0-9]/i.test(name[i - 1])) s += 25; // word boundary (_x)
  return s;
}

function textScore(text, q) {
  if (!text) return -1;
  const clean = (s) => s.toLowerCase().replace(/[^a-z0-9_]+/g, ' ').trim();
  const haystack = clean(text);
  const needle = clean(q);
  if (!needle) return -1;
  const at = haystack.indexOf(needle);
  if (at !== -1) return 45 - Math.min(at / 20, 20);
  const words = needle.split(/\s+/);
  return words.length > 1 && words.every((word) => haystack.includes(word)) ? 15 : -1;
}

const SCOPED_QUERY = /^([A-Za-z_]\w*)(::|\.)(\w*)$/;

/**
 * `Class.Member` and `Class::Member`, which is how anyone who has read the
 * sources already thinks of a member. The owner narrows the field and the
 * rest is scored as usual.
 *
 * Its results are merged with the plain search rather than replacing it,
 * because a dot is also just a character: `playerbase.c` is a file, not a
 * scope. Requiring two characters after a dot keeps that one out of here,
 * and where both do match, the plain hit for a whole filename outscores any
 * member matching a fragment.
 */
function scopedMatches(q) {
  const m = q.match(SCOPED_QUERY);
  if (!m) return null;
  const [, ownerQ, sep, nameQ] = m;
  if (sep === '.' && nameQ.length < 2) return null;
  const olc = ownerQ.toLowerCase();
  const nlc = nameQ.toLowerCase();
  const out = [];
  for (const e of entries) {
    if (!SCOPED.has(e[0])) continue;
    const own = e[2].toLowerCase();
    if (!own.includes(olc)) continue;
    const s = nameQ ? score(e[1], nameQ, nlc) : 0;
    if (s < 0) continue;
    out.push([s + (own === olc ? 60 : 20), e]);
  }
  return out;
}

export function initSearch() {
  const palette = $('#palette');
  const trigger = $('#searchBtn');
  const input = $('#search');
  const resultsEl = $('#searchResults');
  const filtersEl = $('#searchFilters');
  if (!resultsEl) return;

  let sel = -1;
  let kinds = null; // the filter's set of kinds, or null for everything
  let homeRows = []; // what showHome last rendered, for the pin buttons to index

  const hide = () => { resultsEl.hidden = true; sel = -1; };

  function showHome() {
    sel = -1;
    const home = homeList();
    if (!home) { hide(); return; }
    homeRows = home.rows;
    resultsEl.innerHTML = home.html;
    resultsEl.hidden = false;
  }

  function render(list, q) {
    sel = -1;
    if (!list.length) {
      resultsEl.innerHTML = `<div class="search-empty">No results for “${q.replace(/[<>&]/g, '')}”</div>`;
      resultsEl.hidden = false;
      track('search', { search_term: q.slice(0, 100), search_results: 0 });
      return;
    }
    // What to underline in a name: the query, or on a scoped query the member
    // part of it. An initials match has no one substring to point at.
    const scoped = q.match(SCOPED_QUERY);
    const needles = [q.toLowerCase(), scoped?.[3]?.toLowerCase()].filter((n) => n);
    const mark = (name) => {
      const nlc = name.toLowerCase();
      for (const n of needles) {
        const i = nlc.indexOf(n);
        if (i >= 0) {
          return `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + n.length))}</mark>${esc(name.slice(i + n.length))}`;
        }
      }
      return esc(name);
    };
    resultsEl.innerHTML = list
      .map((e) => {
        const ctx = ctxFor(e);
        const desc = e[3]?.replace(/`/g, '').replace(/\s+/g, ' ').trim();
        return /* html */ `<a href="${BASE}${urlFor(e)}"><span class="tag tag-${e[0]}">${KIND[e[0]][0]}</span><span class="search-main"><span>${mark(e[1])}</span>${desc ? `<span class="search-desc">${esc(desc)}</span>` : ''}</span>${ctx ? `<span class="ctx">${esc(ctx)}</span>` : ''}</a>`;
      })
      .join('');
    resultsEl.hidden = false;
  }

  function runSearch(q) {
    if (q.length < 2) { showHome(); return; }
    if (!entries) { hide(); return; }
    const qlc = q.toLowerCase();
    const scored = scopedMatches(q) || [];
    const seen = new Set(scored.map((x) => x[1]));
    for (const e of entries) {
      if (seen.has(e)) continue;
      const nameScore = score(e[1], q, qlc);
      const docScore = textScore(e[3], q);
      const s = Math.max(nameScore, docScore);
      if (s >= 0) scored.push([s + (KIND_BONUS[e[0]] || 0), e]);
    }
    const list = kinds ? scored.filter((x) => kinds.has(x[1][0])) : scored;
    list.sort((a, b) => b[0] - a[0]);
    render(list.slice(0, RESULTS_MAX).map((x) => x[1]), q);
  }

  /* The filter narrows an already-scored list rather than the index, so
     switching between tabs costs nothing and the ranking stays the same one
     the unfiltered results were in. */
  filtersEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-kinds]');
    if (!btn) return;
    for (const el of filtersEl.children) {
      const on = el === btn;
      el.classList.toggle('active', on);
      el.setAttribute('aria-pressed', String(on));
    }
    kinds = btn.dataset.kinds ? new Set(btn.dataset.kinds) : null;
    input.focus();
    runSearch(input.value.trim());
  });

  function follow(a) {
    const q = input.value.trim();
    const kind = a.querySelector('.tag')?.className.match(/tag-(\S+)/)?.[1];
    const name = KIND[kind]?.[0];
    if (q.length >= 2) track('search', { search_term: q.slice(0, 100), result_kind: name });
    else track('select_content', { content_type: name || 'recent' });
  }

  resultsEl.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && !e.target.closest('.pin')) follow(a);
    const btn = e.target.closest('.pin');
    if (!btn) return;
    e.preventDefault();
    // showHome() below replaces these rows, and a detached target no longer
    // answers to .closest('.palette-box') — without this the backdrop handler
    // would read the click as outside the box and close the palette.
    e.stopPropagation();
    const entry = homeRows[+btn.dataset.i];
    if (!entry) return;
    togglePin(entry);
    showHome();
  });

  function move(delta) {
    const items = [...resultsEl.querySelectorAll('a')];
    if (!items.length) return;
    sel = (sel + delta + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('sel', i === sel));
    items[sel].scrollIntoView({ block: 'nearest' });
  }

  function openPalette() {
    if (!palette || !palette.hidden) return;
    closeOthers(closePalette); // one overlay at a time: both hold the body's scroll
    palette.hidden = false;
    document.body.classList.add('palette-open');
    input.focus();
    input.select();
    // The home state comes from localStorage, so it does not wait on the
    // index fetch the way a query has to.
    runSearch(input.value.trim());
    loadIndex().then(() => runSearch(input.value.trim()));
  }

  function closePalette() {
    if (!palette || palette.hidden) return;
    palette.hidden = true;
    document.body.classList.remove('palette-open');
    hide();
    trigger?.focus();
  }
  onOverlay(closePalette);

  if (!input || !palette) return;

  if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
    const kbd = $('#searchKbd');
    if (kbd) kbd.textContent = 'Ctrl K';
  }

  let timer;
  trigger?.addEventListener('click', openPalette);
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { await loadIndex(); runSearch(input.value.trim()); }, 80);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      const t = resultsEl.querySelector('a.sel') || resultsEl.querySelector('a');
      if (t) { follow(t); location.href = t.href; }
    } else if (e.key === 'Escape') { closePalette(); }
  });
  palette.addEventListener('click', (e) => {
    if (!e.target.closest('.palette-box')) closePalette();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      palette.hidden ? openPalette() : closePalette();
    } else if (e.key === '/' && palette.hidden && !typing()) {
      e.preventDefault();
      openPalette();
    }
  });
}
