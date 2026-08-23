/* DayZ Scripts docs client: theme, nav, version switch, search, highlighting */
(() => {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const BASE = document.body.dataset.base || '';
  const ROOT = document.body.dataset.root || '';
  const VPATH = document.body.dataset.vpath || '';

  /* ---------- theme ----------
     Two-state toggle over a three-state model (light / dark / system).
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
  $('#themeBtn')?.addEventListener('click', toggleTheme);
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      toggleTheme();
    }
  });

  /* ---------- mobile nav ---------- */
  $('#menuBtn')?.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('nav-open') &&
        !e.target.closest('#sidebar') && !e.target.closest('#menuBtn')) {
      document.body.classList.remove('nav-open');
    }
  });

  /* ---------- version switcher ---------- */
  $('#versionSel')?.addEventListener('change', (e) => {
    location.href = e.target.value + VPATH + location.hash;
  });

  /* ---------- search ---------- */
  const input = $('#search');
  const resultsEl = $('#searchResults');
  let index = null;
  let entries = null;
  let sel = -1;

  const KIND = {
    c: ['c', (n) => `class/${n}/`],
    e: ['e', (n) => `enum/${n}/`],
    t: ['t', (n) => `typedefs/#${n}`],
    k: ['k', (n) => `constants/#${n}`],
    f: ['f', (n) => `functions/#${n}`],
    F: ['F', (p) => `file/${p}/`],
  };

  async function loadIndex() {
    if (index) return;
    const res = await fetch(BASE + 'search.json');
    index = await res.json();
    entries = [];
    for (const n of index.classes) entries.push(['c', n, n]);
    for (const n of index.enums) entries.push(['e', n, n]);
    for (const n of index.typedefs) entries.push(['t', n, n]);
    for (const [ci, m] of index.methods) entries.push(['m', m, index.classes[ci]]);
    for (const n of index.consts) entries.push(['k', n, n]);
    for (const n of index.funcs) entries.push(['f', n, n]);
    for (const p of index.files) entries.push(['F', p.split('/').pop(), p]);
  }

  function urlFor(e) {
    if (e[0] === 'm') return `class/${e[2]}/#${e[1]}`;
    return KIND[e[0]][1](e[2]);
  }

  function ctxFor(e) {
    if (e[0] === 'm') return e[2];
    if (e[0] === 'F') return e[2].split('/').slice(0, -1).join('/');
    return '';
  }

  function score(name, q, qlc) {
    const nlc = name.toLowerCase();
    const i = nlc.indexOf(qlc);
    if (i === -1) return -1;
    let s = 100 - Math.min(i, 50) - Math.min(name.length - q.length, 30);
    if (i === 0) s += 60;
    if (name === q) s += 100;
    if (nlc === qlc) s += 80;
    if (i > 0 && /[^a-z0-9]/i.test(name[i - 1])) s += 25; // word boundary (_x)
    return s;
  }

  function runSearch(q) {
    if (!entries || q.length < 2) { hide(); return; }
    const qlc = q.toLowerCase();
    const scored = [];
    for (const e of entries) {
      const s = score(e[1], q, qlc);
      if (s >= 0) scored.push([s + (e[0] === 'c' ? 20 : e[0] === 'm' ? 5 : 0), e]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    render(scored.slice(0, 40).map((x) => x[1]), q);
  }

  function render(list, q) {
    sel = -1;
    if (!list.length) {
      resultsEl.innerHTML = `<div class="search-empty">No results for “${q.replace(/[<>&]/g, '')}”</div>`;
      resultsEl.hidden = false;
      return;
    }
    resultsEl.innerHTML = list
      .map((e) => {
        const ctx = ctxFor(e);
        return `<a href="${BASE}${urlFor(e)}"><span class="tag tag-${e[0] === 'm' ? 'm' : e[0]}">${e[0].toUpperCase()}</span><span>${e[1]}</span>${ctx ? `<span class="ctx">${ctx}</span>` : ''}</a>`;
      })
      .join('');
    resultsEl.hidden = false;
  }

  function hide() { resultsEl.hidden = true; sel = -1; }

  function move(delta) {
    const items = [...resultsEl.querySelectorAll('a')];
    if (!items.length) return;
    sel = (sel + delta + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('sel', i === sel));
    items[sel].scrollIntoView({ block: 'nearest' });
  }

  if (input) {
    let timer;
    input.addEventListener('focus', loadIndex, { once: true });
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => { await loadIndex(); runSearch(input.value.trim()); }, 80);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        const t = resultsEl.querySelector('a.sel') || resultsEl.querySelector('a');
        if (t) location.href = t.href;
      } else if (e.key === 'Escape') { hide(); input.blur(); }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.searchbox')) hide();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  /* ---------- Enforce Script highlighting ---------- */
  const KW = new Set(('class enum typedef extends modded sealed proto native owned external volatile override event ' +
    'private protected static const ref autoptr out inout notnull new delete this super return if else for foreach ' +
    'while switch case default break continue null true false void int float bool string vector typename func auto ' +
    'thread waitAll wait sleep delegate').split(' '));

  const TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*")|(^[ \t]*#[^\n]*)|(\b0x[0-9a-fA-F]+\b|\b\d+\.?\d*\b)|(\b[A-Za-z_]\w*\b)/gm;

  function highlight(text) {
    let out = '';
    let last = 0;
    const escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
    const esc = (s) => s.replace(/[&<>]/g, (c) => escMap[c]);
    // spans must never cross newlines (lines get wrapped individually later)
    const span = (cls, s) =>
      s.split('\n').map((part) => (part ? `<span class="${cls}">${esc(part)}</span>` : '')).join('\n');
    for (let m; (m = TOKEN_RE.exec(text)); ) {
      out += esc(text.slice(last, m.index));
      last = TOKEN_RE.lastIndex;
      if (m[1]) out += span('tok-com', m[1]);
      else if (m[2]) out += `<span class="tok-str">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="tok-pre">${esc(m[3])}</span>`;
      else if (m[4]) out += `<span class="tok-num">${esc(m[4])}</span>`;
      else if (m[5]) {
        if (KW.has(m[5])) out += `<span class="tok-kw">${esc(m[5])}</span>`;
        else if (/^[A-Z]/.test(m[5])) out += `<span class="tok-type">${esc(m[5])}</span>`;
        else out += esc(m[5]);
      }
    }
    return out + esc(text.slice(last));
  }

  // source view: highlight + line numbers + deep links
  const srcEl = $('#src code');
  if (srcEl) {
    const raw = srcEl.textContent;
    const lines = highlight(raw).split('\n');
    srcEl.innerHTML = lines
      .map((l, i) => `<span class="line" id="L${i + 1}">${l}\n</span>`)
      .join('');
    if (/^#L\d+$/.test(location.hash)) {
      $(location.hash)?.scrollIntoView({ block: 'center' });
    }
  }

  // inline @code blocks
  for (const pre of document.querySelectorAll('pre[data-hl] code')) {
    pre.innerHTML = highlight(pre.textContent);
  }

  /* ---------- hierarchy expand/collapse ---------- */
  $('#expandAll')?.addEventListener('click', () =>
    document.querySelectorAll('ul.tree details').forEach((d) => (d.open = true)));
  $('#collapseAll')?.addEventListener('click', () =>
    document.querySelectorAll('ul.tree details').forEach((d) => (d.open = false)));
})();
