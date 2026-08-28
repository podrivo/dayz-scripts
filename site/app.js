/* DayZ Scripts docs client: theme, nav, version switch, search, highlighting */
(() => {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const BASE = document.body.dataset.base || '';
  const ROOT = '/';
  const VPATH = document.body.dataset.vpath || '';
  /* This site's own repository, where a community note is written. Here rather
     than stamped into every page: it is the same string on all of them and this
     file is fetched once. Mirrors REPO_URL in src/generate/content.js. */
  const REPO = 'https://github.com/podrivo/dayz-scripts';

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

  const brand = $('.brand');
  if (brand) {
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

  /* ---------- site nav ---------- */
  const menuBtn = $('#menuBtn');
  const nav = $('#nav');
  const setNavOpen = (open) => {
    document.body.classList.toggle('nav-open', open);
    menuBtn?.setAttribute('aria-expanded', String(open));
    if (open && nav) for (const d of nav.querySelectorAll('.nav-here')) d.open = true;
  };
  menuBtn?.addEventListener('click', () => setNavOpen(!document.body.classList.contains('nav-open')));
  document.addEventListener('click', (e) => {
    if (e.target.closest('#nav') || e.target.closest('#menuBtn')) return;
    if (document.body.classList.contains('nav-open')) setNavOpen(false);
    for (const d of nav?.querySelectorAll(':scope > .nav-sec') || []) d.open = false;
  });
  nav?.addEventListener('toggle', (e) => {
    const sec = e.target;
    if (sec.parentElement !== nav || !sec.open) return;
    for (const d of nav.querySelectorAll(':scope > .nav-sec')) if (d !== sec) d.open = false;
  });
  const desktopNav = () => window.matchMedia('(min-width: 901px)').matches;
  nav?.querySelectorAll(':scope > .nav-sec').forEach((sec) => {
    sec.addEventListener('mouseenter', () => { if (desktopNav()) sec.open = true; });
    sec.addEventListener('mouseleave', () => { if (desktopNav()) sec.open = false; });
    sec.querySelector(':scope > summary')?.addEventListener('click', (e) => {
      if (!desktopNav() || e.target.closest('a')) return;
      e.preventDefault();
    });
  });

  /* ---------- nav topics ----------
     The list of module topics belongs to a build, and the pages do not, so the
     nav leaves a hole for it and fills it from this build's nav.json the first
     time the section is opened. Without JavaScript the section heading is
     still a link to the full list. */
  let navPromise;
  for (const box of document.querySelectorAll('.nav-kids[data-nav]')) {
    const details = box.closest('details');
    const fill = () => {
      navPromise ||= fetch(BASE + 'nav.json').then((r) => r.json());
      navPromise.then(({ topics }) => {
        if (box.dataset.filled) return;
        box.dataset.filled = '1';
        const active = box.dataset.active;
        box.append(...topics.map(([name, title]) => {
          const a = document.createElement('a');
          a.className = 'nav-sub';
          a.href = `${BASE}modules/${name}/`;
          a.textContent = title;
          if (active === `modules/${name}/`) {
            a.classList.add('active');
            a.setAttribute('aria-current', 'page');
          }
          return a;
        }));
      }).catch(() => {});
    };
    if (details.open) fill();
    details.addEventListener('toggle', () => details.open && fill(), { once: false });
    details.addEventListener('mouseenter', fill, { once: true });
  }

  const fmtDate = (iso) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });

  /* ---------- build identity ----------
     Pages are byte-identical across builds so dist/ can hard-link them, which
     means the build number, date and version are deliberately absent from the
     HTML. Recover them from the URL — /v/<build>/… for an archived build, the
     newest build at the site root — and stamp them into the chrome. */
  const pathBuild = location.pathname.match(/^\/v\/([^/]+)\//)?.[1];
  let pagesMapPromise;
  const loadPagesMap = () => {
    if (!pathBuild) return Promise.resolve({});
    return (pagesMapPromise ||= fetch(`/v/${pathBuild}/pages.json`).then((r) => r.json()).catch(() => ({})));
  };
  let buildsPromise;
  const loadBuilds = () => (buildsPromise ||= fetch(ROOT + 'assets/versions.json').then((r) => r.json()));

  const patchOf = (build) => build.split('.').pop();

  /** "1.29 Update 1" from the oldest of that version, then Update 2, … */
  function nameBuilds(builds) {
    const count = Object.create(null);
    const seen = Object.create(null);
    for (const b of builds) count[b.version] = (count[b.version] || 0) + 1;
    for (const b of builds) {
      const n = (seen[b.version] = (seen[b.version] || 0) + 1);
      b.name = `${b.version} Update ${count[b.version] - n + 1}`;
    }
    return builds;
  }

  let current = null;
  const identity = loadBuilds().then((builds) => {
    if (Array.isArray(builds)) nameBuilds(builds);
    current = (pathBuild && builds.find((b) => b.build === pathBuild)) || builds[0];
    const label = $('.ver-label');
    if (label) label.textContent = current.name;
    const gh = $('#ghSrc');
    if (gh && current.sha) gh.href = gh.href.replace('/blob/main/', `/blob/${current.sha}/`);
    return builds;
  });

  /* ---------- version switcher ----------
     A button opening a popover of all builds grouped by game version. */
  const verBtn = $('#verBtn');
  const verMenu = $('#verMenu');
  if (verBtn) {
    let loaded = false;
    async function fillMenu() {
      if (loaded) return;
      loaded = true;
      const builds = await identity;
      let html = '';
      let version = '';
      builds.forEach((b, i) => {
        if (b.version !== version) {
          version = b.version;
          html += `<div class="ver-group">DayZ ${version}</div>`;
        }
        const cur = b.build === current?.build;
        const href = ROOT + (i === 0 ? '' : `v/${b.build}/`) + VPATH;
        html += `<a href="${href}"${cur ? ' class="cur" aria-current="page"' : ''} title="${b.build}">` +
          `<span class="ver-row"><span class="ver-name">${b.name}</span>` +
          `<span class="ver-build">${patchOf(b.build)}</span>` +
          (i === 0 ? '<span class="ver-latest">latest</span>' : '') +
          `<span class="ver-date">${fmtDate(b.date)}</span></span>` +
          '</a>';
      });
      verMenu.innerHTML = html;
    }

    function closeVerMenu() {
      verMenu.hidden = true;
      verBtn.setAttribute('aria-expanded', 'false');
    }

    verBtn.addEventListener('click', async () => {
      if (!verMenu.hidden) return closeVerMenu();
      await fillMenu();
      verMenu.hidden = false;
      verBtn.setAttribute('aria-expanded', 'true');
      const cur = verMenu.querySelector('.cur');
      if (cur) verMenu.scrollTop = cur.offsetTop - verMenu.clientHeight / 2;
    });
    verMenu.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (a && location.hash) a.href += location.hash; // keep deep links across builds
    });
    verBtn.parentElement.addEventListener('keydown', (e) => {
      if (verMenu.hidden) return;
      if (e.key === 'Escape') {
        closeVerMenu();
        verBtn.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const links = [...verMenu.querySelectorAll('a')];
        const i = links.indexOf(document.activeElement);
        const next = i === -1 ? 0 : (i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links[next]?.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (!verMenu.hidden && !e.target.closest('.verpicker')) closeVerMenu();
    });
  }

  /* ---------- search ---------- */
  const palette = $('#palette');
  const trigger = $('#searchBtn');
  const input = $('#search');
  const resultsEl = $('#searchResults');
  const filtersEl = $('#searchFilters');
  let index = null;
  let entries = null;
  let sel = -1;
  let kinds = null; // the filter's set of kinds, or null for everything

  const RESULTS_MAX = 60;
  const anchorOf = (n) => n.replace(/[^\w]/g, '_');

  /* An entry is [kind, name, owner]. `owner` is whatever the URL needs beside
     the name — the declaring class, the enum, the module, the file path — and
     is the name itself for the kinds that stand alone. */
  const KIND = {
    c: ['class', (n, o) => `class/${o}/`],
    m: ['method', (n, o) => `class/${o}/#${anchorOf(n)}`],
    v: ['field', (n, o) => `class/${o}/#${anchorOf(n)}`],
    e: ['enum', (n, o) => `enum/${o}/`],
    V: ['value', (n, o) => `enum/${o}/#${n}`],
    t: ['typedef', (n, o) => `globals/typedefs/#${o}`],
    k: ['const', (n, o) => `globals/constants/#${o}`],
    f: ['func', (n, o) => `globals/functions/#${o}`],
    d: ['macro', (n, o) => `globals/macros/#${o}`],
    g: ['topic', (n, o) => `modules/${o}/`],
    // Paths are indexed as displayed; the URL is that spelling lowercased.
    F: ['file', (n, o) => `files/${o.toLowerCase()}/`],
  };

  /* Which kinds carry a real owner, and so can be narrowed by one. */
  const SCOPED = new Set(['m', 'v', 'V']);

  /* Ranking nudges by kind: a class outranks its own methods when both match,
     and a topic outranks the constants filed under it. */
  const KIND_BONUS = { c: 20, e: 12, g: 10, m: 5, v: 3 };

  async function loadIndex() {
    if (index) return;
    const res = await fetch(BASE + 'search.json');
    index = await res.json();
    entries = [];
    // Older builds predate some of these lists, so every one is optional.
    const list = (k) => index[k] || [];
    for (const n of list('classes')) entries.push(['c', n, n]);
    for (const n of list('enums')) entries.push(['e', n, n]);
    for (const n of list('typedefs')) entries.push(['t', n, n]);
    for (const [ci, m] of list('methods')) entries.push(['m', m, index.classes[ci]]);
    for (const [ci, v] of list('vars')) entries.push(['v', v, index.classes[ci]]);
    for (const [ei, v] of list('values')) entries.push(['V', v, index.enums[ei]]);
    for (const n of list('consts')) entries.push(['k', n, n]);
    for (const n of list('funcs')) entries.push(['f', n, n]);
    for (const n of list('macros')) entries.push(['d', n, n]);
    for (const [name, title] of list('topics')) entries.push(['g', title, name]);
    for (const p of list('files')) entries.push(['F', p.split('/').pop(), p]);
  }

  function urlFor(e) {
    return KIND[e[0]][1](e[1], e[2]);
  }

  function ctxFor(e) {
    if (SCOPED.has(e[0])) return e[2];
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
    const m = q.match(/^([A-Za-z_]\w*)(::|\.)(\w*)$/);
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

  function runSearch(q) {
    if (!entries || q.length < 2) { hide(); return; }
    const qlc = q.toLowerCase();
    const scored = scopedMatches(q) || [];
    const seen = new Set(scored.map((x) => x[1]));
    for (const e of entries) {
      if (seen.has(e)) continue;
      const s = score(e[1], q, qlc);
      if (s >= 0) scored.push([s + (KIND_BONUS[e[0]] || 0), e]);
    }
    const list = kinds ? scored.filter((x) => kinds.has(x[1][0])) : scored;
    list.sort((a, b) => b[0] - a[0]);
    render(list.slice(0, RESULTS_MAX).map((x) => x[1]), q);
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
        return `<a href="${BASE}${urlFor(e)}"><span class="tag tag-${e[0]}">${KIND[e[0]][0]}</span><span>${e[1]}</span>${ctx ? `<span class="ctx">${ctx}</span>` : ''}</a>`;
      })
      .join('');
    resultsEl.hidden = false;
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

  function hide() { resultsEl.hidden = true; sel = -1; }

  function move(delta) {
    const items = [...resultsEl.querySelectorAll('a')];
    if (!items.length) return;
    sel = (sel + delta + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('sel', i === sel));
    items[sel].scrollIntoView({ block: 'nearest' });
  }

  /* The search lives in a command palette: a modal overlay opened with ⌘K /
     Ctrl+K or `/`, rather than an always-visible field in the header. */
  function openPalette() {
    if (!palette || !palette.hidden) return;
    palette.hidden = false;
    document.body.classList.add('palette-open');
    input.focus();
    input.select();
    loadIndex().then(() => runSearch(input.value.trim()));
  }

  function closePalette() {
    if (!palette || palette.hidden) return;
    palette.hidden = true;
    document.body.classList.remove('palette-open');
    hide();
    trigger?.focus();
  }

  if (input && palette) {
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
        if (t) location.href = t.href;
      } else if (e.key === 'Escape') { closePalette(); }
    });
    palette.addEventListener('click', (e) => {
      if (!e.target.closest('.palette-box')) closePalette();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        palette.hidden ? openPalette() : closePalette();
      } else if (e.key === '/' && palette.hidden &&
                 !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        openPalette();
      }
    });
  }

  /* ---------- changelog ----------
     The one page whose behaviour is fetched rather than shipped. /changelog/ is
     a single URL out of some 660,000, and its build pickers, its filter and the
     diff it composes have no business in the script every class page loads. */
  const compareBox = $('#compare');
  if (compareBox) {
    Promise.all([import('/assets/compare.js'), identity])
      .then(([{ initCompare }, builds]) => initCompare({ builds, fmtDate, current }))
      .catch(() => {
        compareBox.setAttribute('aria-busy', 'false');
        compareBox.className = 'cmp muted';
        compareBox.textContent = 'The changelog could not be loaded. Try reloading the page.';
      });
  }

  /* ---------- Enforce Script highlighting ---------- */
  const KW = new Set(('class enum typedef extends modded sealed proto native owned external volatile override event ' +
    'private protected static const ref autoptr out inout notnull new delete this super return if else for foreach ' +
    'while switch case default break continue null true false void int float bool string vector typename func auto ' +
    'thread waitAll wait sleep delegate').split(' '));

  const TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*")|(^[ \t]*#[^\n]*)|(\b0x[0-9a-fA-F]+\b|\b\d+\.?\d*\b)|(\b[A-Za-z_]\w*\b)/gm;

  function newlines(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
    return n;
  }

  function highlight(text, resolve) {
    let out = '';
    let last = 0;
    // Which line each identifier is on, so the resolver can tell which class
    // body it sits inside. Comments and strings are the only tokens that can
    // span lines, so counting is a matter of the gaps plus those two.
    let line = 1;
    const escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
    const esc = (s) => s.replace(/[&<>]/g, (c) => escMap[c]);
    // spans must never cross newlines (lines get wrapped individually later)
    const span = (cls, s) =>
      s.split('\n').map((part) => (part ? `<span class="${cls}">${esc(part)}</span>` : '')).join('\n');
    for (let m; (m = TOKEN_RE.exec(text)); ) {
      const gap = text.slice(last, m.index);
      out += esc(gap);
      line += newlines(gap);
      last = TOKEN_RE.lastIndex;
      if (m[1]) { out += span('tok-com', m[1]); line += newlines(m[1]); }
      else if (m[2]) { out += `<span class="tok-str">${esc(m[2])}</span>`; line += newlines(m[2]); }
      else if (m[3]) out += `<span class="tok-pre">${esc(m[3])}</span>`;
      else if (m[4]) out += `<span class="tok-num">${esc(m[4])}</span>`;
      else if (m[5]) {
        if (KW.has(m[5])) out += `<span class="tok-kw">${esc(m[5])}</span>`;
        else {
          const body = /^[A-Z]/.test(m[5]) ? `<span class="tok-type">${esc(m[5])}</span>` : esc(m[5]);
          const href = resolve && resolve(m[5], line);
          out += href ? `<a class="tok-link" href="${href}">${body}</a>` : body;
        }
      }
    }
    return out + esc(text.slice(last));
  }

  /**
   * Where a name written in source goes. Doxygen linked every name in its
   * source pages to the declaration it resolved to, which is most of what made
   * them worth reading when 89% of members carry no documentation. It resolved
   * by scope, and so does this: the file's links.json says which class body
   * each line falls inside and what that class inherits from, and search.json
   * says which classes declare a name, so a bare call inside a method is
   * looked up against its own class and then up the chain.
   *
   * A name that no enclosing class answers to falls back to the build-wide
   * index, where it is linked only if exactly one declaration claims it.
   * Anything still ambiguous is left as plain text, which is what Doxygen did
   * with a name it could not resolve either.
   */
  function sourceResolver(links) {
    const map = new Map();
    const claim = (n, url) => {
      const seen = map.get(n);
      if (seen === undefined) map.set(n, url);
      else if (seen !== url) map.set(n, null);
    };
    const list = (k) => index[k] || [];
    for (const n of list('classes')) claim(n, `class/${n}/`);
    for (const n of list('enums')) claim(n, `enum/${n}/`);
    for (const n of list('typedefs')) claim(n, `globals/typedefs/#${anchorOf(n)}`);
    for (const n of list('funcs')) claim(n, `globals/functions/#${anchorOf(n)}`);
    for (const n of list('consts')) claim(n, `globals/constants/#${anchorOf(n)}`);
    for (const n of list('macros')) claim(n, `globals/macros/#${anchorOf(n)}`);
    for (const [ei, v] of list('values')) claim(v, `enum/${index.enums[ei]}/#${v}`);
    for (const [ci, m] of list('methods')) claim(m, `class/${index.classes[ci]}/#${anchorOf(m)}`);
    for (const [ci, v] of list('vars')) claim(v, `class/${index.classes[ci]}/#${anchorOf(v)}`);

    // Which classes declare each member name, which is the question a scoped
    // lookup asks of every class in the chain.
    const owners = new Map();
    const own = (ci, n) => {
      const a = owners.get(n);
      if (a) { if (!a.includes(ci)) a.push(ci); }
      else owners.set(n, [ci]);
    };
    for (const [ci, m] of list('methods')) own(ci, m);
    for (const [ci, v] of list('vars')) own(ci, v);

    const byName = new Map(index.classes.map((n, i) => [n, i]));
    const scopes = (links?.scopes || []).map(([from, to, chain]) => [
      from, to, chain.map((n) => byName.get(n)).filter((i) => i !== undefined),
    ]);

    /** The innermost class body a line sits in, as its inheritance chain. */
    const chainAt = (line) => {
      let best = null;
      for (const s of scopes) if (line >= s[0] && line <= s[1] && (!best || s[0] > best[0])) best = s;
      return best?.[2];
    };

    return (name, line) => {
      const chain = line && chainAt(line);
      const os = chain && owners.get(name);
      if (os) {
        for (const ci of chain) {
          if (os.includes(ci)) return `${BASE}class/${index.classes[ci]}/#${anchorOf(name)}`;
        }
      }
      const url = map.get(name);
      return url ? BASE + url : null;
    };
  }

  // source view: highlight + line numbers + deep links
  const srcEl = $('#src code');
  if (srcEl) {
    const raw = srcEl.textContent;
    const paint = (resolve, decls) => {
      const declAt = decls && new Map(decls);
      srcEl.innerHTML = highlight(raw, resolve)
        .split('\n')
        .map((l, i) => {
          // A line that declares something gets its number turned into a link
          // to the page describing it — the reverse of the "src" link every
          // member carries, and the pair is what makes the two views one.
          const url = declAt?.get(i + 1);
          const to = url ? `<a class="ldoc" href="${BASE}${url}" title="Go to documentation" aria-label="Documentation for this declaration"></a>` : '';
          return `<span class="line${url ? ' decl' : ''}" id="L${i + 1}">${to}${l}\n</span>`;
        })
        .join('');
    };
    // Painted twice: once now, so the code is readable without waiting on a
    // network round trip, and again once the index and the file's link map
    // have arrived. Keeping the links out of the HTML is also what lets a file
    // page stay byte-identical across builds and keep its hard link.
    paint(null);
    if (/^#L\d+$/.test(location.hash)) $(location.hash)?.scrollIntoView({ block: 'center' });
    // links.json sits beside the page, so it is named relative to it and
    // needs no knowledge of which build this is.
    Promise.all([
      loadIndex(),
      (pathBuild
        ? loadPagesMap().then((map) => {
            const rel = `${VPATH}links.json`;
            return fetch(map[rel] ? `/_b/${map[rel]}` : `/${rel}`);
          })
        : fetch('links.json')
      ).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([, links]) => {
      paint(sourceResolver(links), links?.decls);
      addFolds(raw);
    });
  }

  /* ---------- code folding ----------
     Every brace pair worth collapsing, found by scanning the source with the
     same tokenizer that highlights it, so a brace inside a string or a comment
     is not one. A class body opening on line 49 and closing on 9788 is the
     reason this exists: without it the only way past a method is to scroll it.

     The braces are counted here rather than read off the DOM because the DOM
     has no structure to read — the page is a flat run of line spans, which is
     what lets a six-thousand-line file paint at all. */
  const FOLD_MIN = 2; // lines hidden before a fold is worth offering

  function foldRanges(text) {
    const stack = [];
    const out = [];
    let line = 1;
    let last = 0;
    for (let m; (m = TOKEN_RE.exec(text)); ) {
      const gap = text.slice(last, m.index);
      last = TOKEN_RE.lastIndex;
      // braces only ever live in the gaps between tokens: the tokenizer
      // matches comments, strings, preprocessor lines, numbers and names.
      for (let i = 0; i < gap.length; i++) {
        const c = gap.charCodeAt(i);
        if (c === 10) line++;
        else if (c === 123) stack.push(line); // {
        else if (c === 125 && stack.length) { // }
          const from = stack.pop();
          if (line - from > FOLD_MIN) out.push([from, line]);
        }
      }
      line += newlines(m[0]);
    }
    return out;
  }

  function addFolds(text) {
    const lines = srcEl.children;
    const byStart = new Map();
    for (const [from, to] of foldRanges(text)) {
      // the widest range starting on a line is the one that line folds
      const seen = byStart.get(from);
      if (!seen || to > seen) byStart.set(from, to);
    }
    if (!byStart.size) return;

    // Which folds are shut, and nothing else. Nesting then needs no
    // bookkeeping: a line is hidden if any shut fold covers it, so opening one
    // cannot reveal what another is still holding closed.
    const shut = new Map();
    const apply = () => {
      const hide = new Uint8Array(lines.length);
      for (const [from, to] of shut) {
        for (let i = from; i < to && i < hide.length; i++) hide[i] = 1;
      }
      for (let i = 0; i < lines.length; i++) lines[i].hidden = hide[i] === 1;
    };

    for (const [from, to] of byStart) {
      const el = lines[from - 1];
      if (!el) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fold';
      btn.setAttribute('aria-expanded', 'true');
      btn.title = `Fold lines ${from}–${to}`;
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        el.classList.toggle('folded', open);
        if (open) shut.set(from, to);
        else shut.delete(from);
        apply();
      });
      el.prepend(btn);
    }
  }

  // inline @code blocks
  for (const pre of document.querySelectorAll('pre[data-hl] code')) {
    pre.innerHTML = highlight(pre.textContent);
  }

  // The article element, which everything from here down hangs off: the copy
  // buttons, the page filter, the all-members table and the table of contents.
  const main = $('.main');

  /* ---------- added / changed ----------
     When a class or member first appeared, and when a signature last changed.
     The pages cannot carry a build stamp (see layout()), so this is fetched
     from /assets/history.json — the same adjacent diffs /changelog/ folds,
     packed as indices into the newest-first build list. Events newer than the
     build being viewed stay off. */
  const historyOwner = /^class\/([^/]+)\/$/.exec(VPATH) || /^enum\/([^/]+)\/$/.exec(VPATH);
  if (historyOwner && main) {
    const historyKind = VPATH.startsWith('class/') ? 'class' : 'enum';
    const typeRec = (p) => (p == null ? null : typeof p === 'number' ? { added: p, members: {} } : { added: p[0], members: p[1] || {} });
    const memberEv = (p) => (p == null ? null : typeof p === 'number' ? { added: p } : { added: p[0] < 0 ? undefined : p[0], changed: p[1] });
    const historyBadge = (kind, text, title, href) => {
      const a = document.createElement('a');
      a.className = `badge badge-${kind}`;
      a.textContent = text;
      a.title = title;
      a.href = href;
      return a;
    };
    Promise.all([
      fetch(ROOT + 'assets/history.json').then((r) => (r.ok ? r.json() : null)),
      identity,
    ]).then(([hist, builds]) => {
      if (!hist?.builds || !current) return;
      const rec = typeRec(hist[historyKind]?.[historyOwner[1]]);
      if (!rec) return;
      const here = hist.builds.indexOf(current.build);
      if (here < 0) return;
      const visible = (i) => i != null && i >= here;
      const pair = (idx) => {
        const b = builds[idx];
        if (!b) return null;
        const from = builds[idx + 1];
        const href = from
          ? `/changelog/?from=${encodeURIComponent(from.build)}&to=${encodeURIComponent(b.build)}`
          : '/changelog/';
        return { b, href };
      };
      const addedBadge = (idx) => {
        const p = pair(idx);
        if (!p) return null;
        const oldest = idx === hist.builds.length - 1;
        return historyBadge(
          oldest ? 'since' : 'added',
          oldest ? `Since ${p.b.version}` : `Added in ${p.b.version}`,
          oldest
            ? `Present in every tracked build from ${p.b.name} (${p.b.build})`
            : `First appeared in ${p.b.name} (${p.b.build})`,
          p.href,
        );
      };
      const changedBadge = (idx) => {
        const p = pair(idx);
        if (!p) return null;
        return historyBadge(
          'changed',
          `Changed in ${p.b.version}`,
          `Signature last changed in ${p.b.name} (${p.b.build})`,
          p.href,
        );
      };

      const title = $('h1.class-title', main);
      if (title && visible(rec.added)) {
        const b = addedBadge(rec.added);
        if (b) title.append(b);
      }
      for (const mem of main.querySelectorAll('.member[id]')) {
        const ev = memberEv(rec.members[mem.id]);
        if (!ev) continue;
        const sig = $('.member-sig', mem);
        if (!sig) continue;
        if (visible(ev.added)) { const b = addedBadge(ev.added); if (b) sig.append(b); }
        if (visible(ev.changed)) { const b = changedBadge(ev.changed); if (b) sig.append(b); }
      }
      for (const row of main.querySelectorAll('.enum-table tr[id]')) {
        const ev = memberEv(rec.members[row.id]);
        if (!ev) continue;
        const cell = row.cells[0] || row;
        if (visible(ev.added)) { const b = addedBadge(ev.added); if (b) cell.append(b); }
        if (visible(ev.changed)) { const b = changedBadge(ev.changed); if (b) cell.append(b); }
      }
    }).catch(() => {});
  }

  /* ---------- community notes ----------
     Only 4,869 of 42,927 members carry a doc comment, and what is known about
     the rest sits in Discord rather than in the sources. site/notes.json is
     that knowledge, keyed by Type or Type.Member, and it is fetched for the
     same reason the history above is: a page carries no build stamp and
     archived bodies are shared between builds, so anything maintained outside
     the sources would otherwise freeze into whichever build first rendered the
     page. Overload anchors (Foo-2) share the note of the name they dedupe.

     Every note also carries the way to change it, and every declaration
     without one the way to write it: the moment someone works out what a
     member does is the moment to say so, and it is not the moment to go
     looking for a JSON file. */
  if (historyOwner && main) {
    const type = historyOwner[1];
    const keyFor = (el) => `${type}.${el.id.replace(/-\d+$/, '')}`;

    /* Where a note gets written. GitHub can prefill a new issue but not an
       edit to a file that already exists, so this opens an issue holding the
       key and whatever the note says today, and names site/notes.json for
       anyone who would rather go straight to the pull request. */
    const contribHref = (key, current) => {
      const member = key.split('.')[1];
      const body = [
        `**Declaration:** \`${key}\``,
        `**Page:** ${location.origin}${location.pathname}${member ? `#${member}` : ''}`,
        '',
        ...(current
          ? ['### Current note', `> ${current}`, '', '### Suggested change', '']
          : ['### Note', '_What does this do that its signature does not say? Which side does it run on, what does it expect, what trips people up?_', '']),
        '---',
        `Rather open the pull request yourself? ${current ? 'Edit' : 'Add'} \`"${key}"\` in [site/notes.json](${REPO}/edit/main/site/notes.json).`,
      ].join('\n');
      return `${REPO}/issues/new?title=${encodeURIComponent(`Community note: ${key}`)}` +
        `&body=${encodeURIComponent(body)}`;
    };

    const editEl = (key, current) => {
      const a = document.createElement('a');
      a.className = 'note-edit';
      a.href = contribHref(key, current);
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = 'Suggest an edit to this note';
      a.setAttribute('aria-label', a.title);
      const ic = document.createElement('i');
      ic.className = 'ic ic-pencil';
      ic.setAttribute('aria-hidden', 'true');
      a.append(ic);
      return a;
    };

    /* The type's own invitation, and the only one on the page that is not
       waiting behind a hover — but shown only where the sources say nothing
       about it either, since a class carrying a doc comment is not the one
       crying out for a note. */
    const askEl = (key) => {
      const p = document.createElement('p');
      p.className = 'note-ask';
      const a = document.createElement('a');
      a.href = contribHref(key, null);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Suggest a community note';
      p.append(document.createTextNode('Undocumented in the sources. '), a);
      return p;
    };

    fetch(ROOT + 'assets/notes.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((notes) => {
        if (!notes) return;
        const noteFor = (key) => (typeof notes[key] === 'string' && notes[key] ? notes[key] : null);
        // Marked as community writing, because the docs it sits beside are
        // Bohemia's. Built as nodes rather than markup so a contributor can
        // write `Class.Method` without the note being able to inject anything.
        const noteEl = (text, key) => {
          const el = document.createElement('div');
          el.className = 'doc-note note-community';
          const tag = document.createElement('span');
          tag.className = 'note-tag';
          tag.textContent = 'Community note';
          el.append(tag);
          text.split('`').forEach((part, i) => {
            if (!part) return;
            if (i % 2) {
              const code = document.createElement('code');
              code.textContent = part;
              el.append(code);
            } else {
              el.append(document.createTextNode(part));
            }
          });
          el.append(editEl(key, text));
          return el;
        };

        const ownText = noteFor(type);
        const own = ownText ? noteEl(ownText, type) : $('.class-doc', main) ? null : askEl(type);
        if (own) {
          const doc = $('.class-doc', main);
          const filter = $('.filterbar', main);
          const h2 = main.querySelector('h2');
          if (doc) doc.after(own);
          else if (filter) filter.before(own);
          else if (h2) h2.before(own);
          else main.append(own);
        }
        for (const mem of main.querySelectorAll('.member[id]')) {
          const key = keyFor(mem);
          const text = noteFor(key);
          if (!text) continue;
          const after = $('.member-doc', mem) || $('.member-sig', mem);
          if (after) after.after(noteEl(text, key));
        }
        for (const row of main.querySelectorAll('.enum-table tr[id]')) {
          const key = `${type}.${row.id}`;
          const text = noteFor(key);
          if (text) (row.cells[2] || row).append(noteEl(text, key));
        }
      })
      .catch(() => {});

    /* One shared chip, moved to whichever declaration the pointer is over —
       the same bargain the signature copy button strikes below, and for the
       same reason: nine hundred members are nine hundred buttons only one of
       which is ever in use. Wired up outside the fetch, so a notes.json that
       fails to load still leaves the way to write one. */
    const suggest = document.createElement('a');
    suggest.className = 'note-add';
    suggest.target = '_blank';
    suggest.rel = 'noopener';
    suggest.textContent = 'Suggest a note';
    suggest.title = 'Suggest a community note for this declaration';
    let suggestFor = null;
    main.addEventListener('pointerover', (e) => {
      const host = e.target.closest?.('.member[id], .enum-table tr[id]');
      if (!host || host === suggestFor) return;
      // whatever already carries a note is changed through that note's pencil
      if ($('.note-community', host)) {
        suggest.remove();
        suggestFor = null;
        return;
      }
      suggestFor = host;
      const row = host.matches('tr');
      suggest.href = contribHref(row ? `${type}.${host.id}` : keyFor(host), null);
      (row ? host.cells[2] || host : $('.member-sig', host) || host).append(suggest);
    });
  }

  /* ---------- copy ----------
     Signatures are the thing people come here to take away, and selecting one
     out of a line that also holds badges, a src link and an anchor is fiddly.
     Code blocks get their own button; signatures share a single one that
     follows the pointer, because a class page has nine hundred of them and
     nine hundred buttons is a page's worth of DOM for an affordance only one
     is ever using. */
  function copyText(text, btn) {
    navigator.clipboard?.writeText(text).then(() => {
      btn.classList.add('copied');
      btn.setAttribute('aria-label', 'Copied');
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.setAttribute('aria-label', 'Copy');
      }, 1200);
    }, () => {});
  }

  function copyButton() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'copy-btn';
    b.setAttribute('aria-label', 'Copy');
    b.title = 'Copy';
    return b;
  }

  for (const pre of document.querySelectorAll('pre.code, pre.src, pre.attrs')) {
    // The button is positioned against its block, so each one needs a box of
    // its own; a source page already has the frame around its listing, and
    // two doc examples in one comment must not share the containing div.
    let box = pre.parentElement;
    if (!box.classList.contains('srcwrap')) {
      box = document.createElement('div');
      pre.replaceWith(box);
      box.append(pre);
    }
    box.classList.add('has-copy');
    const btn = copyButton();
    btn.classList.add('copy-block');
    btn.addEventListener('click', () => copyText(pre.textContent, btn));
    box.prepend(btn);
  }

  if (main) {
    const sigCopy = copyButton();
    sigCopy.classList.add('copy-sig');
    let sigFor = null;
    sigCopy.addEventListener('click', () => sigFor && copyText(sigFor.textContent.trim(), sigCopy));
    main.addEventListener('pointerover', (e) => {
      const sig = e.target.closest?.('.member-sig');
      const code = sig && $('code', sig);
      if (!code || code === sigFor) return;
      sigFor = code;
      sig.append(sigCopy);
    });
  }

  /* ---------- hierarchy expand/collapse ---------- */
  $('#expandAll')?.addEventListener('click', () =>
    document.querySelectorAll('ul.tree details').forEach((d) => (d.open = true)));
  $('#collapseAll')?.addEventListener('click', () =>
    document.querySelectorAll('ul.tree details').forEach((d) => (d.open = false)));

  // Assigned by buildToc() below, and called by the filter when a whole
  // section disappears. Declared here because either can run first.
  let refreshToc = () => {};
  // Assigned by the page filter, and called by the all-members table once its
  // rows exist — they are the one thing on any page that the filter cannot
  // have seen when it first looked.
  let rescanFilter = () => {};

  /* ---------- page filter ----------
     What the search palette does for the whole build, this does for the page
     you are already on. Every long page here is one of four shapes — a table,
     a grid of names, a tree, or a run of member blocks — so one pass over
     those four covers the class index, the hierarchy, the file list, the
     globals tabs and a nine-hundred-member class alike. Nothing is fetched
     and nothing is added to the HTML but the field itself. */
  const filterInput = $('#pageFilter');
  const filterCount = $('#filterCount');
  if (filterInput && main) {
    const UNIT = 'table.list > tbody > tr, .namegrid > a, dl.fields > dt, .member';

    /** What a unit is matched on. A member block is matched on its name and
        signature alone: its documentation and its list of callers are there to
        be read once you have found it, not to be searched. */
    const unitText = (el) =>
      el.classList.contains('member')
        ? `${$('.member-name', el)?.textContent || ''} ${$('.member-sig', el)?.textContent || ''}`
        : el.textContent;

    /** What the access chips ask about. The modifiers are already on the page
        as keyword spans inside the signature, and whether a member is
        documented is the presence of its doc block, so nothing has to be
        shipped to support any of this. */
    const modsOf = (el) => {
      const set = new Set([...el.querySelectorAll('.member-sig .kw')].map((k) => k.textContent));
      if ($('.member-doc', el)) set.add('@documented');
      return set;
    };

    let units = [];
    const scan = () => {
      units = [...main.querySelectorAll(UNIT)].map((el) => ({
        el,
        // a data field's <dt> and the <dd> listing its classes hide together
        also: el.tagName === 'DT' ? el.nextElementSibling : null,
        text: unitText(el).toLowerCase(),
        mods: el.classList.contains('member') ? modsOf(el) : null,
      }));
    };
    scan();
    const trees = [...main.querySelectorAll('ul.tree')];

    // What each disclosure was showing before the filter took over, so
    // clearing it puts the tree back rather than to some canned state. Taken
    // when filtering starts, not at load, so an Expand all first survives it.
    let saved = null;

    /** A node's own label, which on a branch is its summary rather than
        everything nested under it. */
    const ownText = (li) => (li.querySelector(':scope > details > summary') || li).textContent.toLowerCase();
    const branch = (li) => li.querySelector(':scope > details');
    const kidsOf = (li) => (branch(li) || li).querySelector(':scope > ul');

    function showSubtree(ul) {
      for (const li of ul.children) {
        li.hidden = false;
        const det = branch(li);
        if (det) det.open = saved.get(det) ?? det.open;
        const kids = kidsOf(li);
        if (kids) showSubtree(kids);
      }
    }

    /** Hide what does not match, open what holds a match, and count the hits.
        A node whose own name matches keeps its whole subtree, since narrowing
        to a directory is one of the things this is for. */
    function filterTree(ul, q) {
      let n = 0;
      for (const li of ul.children) {
        const det = branch(li);
        const kids = kidsOf(li);
        const self = ownText(li).includes(q);
        let deep = 0;
        if (self) {
          if (kids) showSubtree(kids);
        } else if (kids) {
          deep = filterTree(kids, q);
        }
        li.hidden = !self && !deep;
        if (det) det.open = deep > 0;
        n += (self ? 1 : 0) + deep;
      }
      return n;
    }

    /** Whether anything under a heading is still showing. Elements that hold
        no filterable unit at all — a paragraph, a tab strip — always count. */
    function holdsVisible(el) {
      if (el.matches(UNIT)) return !el.hidden;
      const inner = el.querySelectorAll(UNIT);
      if (inner.length) return [...inner].some((u) => !u.hidden);
      const lis = el.querySelectorAll('li');
      if (lis.length) return [...lis].some((li) => !li.hidden);
      return true;
    }

    /** Drop the headings whose whole section filtered away, so the page does
        not end up as a column of empty section titles. */
    function syncHeadings(active) {
      let head = null;
      let seen = false;
      for (const el of main.children) {
        if (el.tagName === 'H2' || el.tagName === 'H3') {
          if (head) head.hidden = active && !seen;
          head = el;
          seen = false;
        } else if (head && !seen && holdsVisible(el)) {
          seen = true;
        }
      }
      if (head) head.hidden = active && !seen;
    }

    // How many things there were to narrow, for the count beside the field.
    let treeTotal = 0;
    const total = () => units.length || (treeTotal ||= trees.reduce((n, t) => n + t.querySelectorAll('li').length, 0));

    // The access chip in force, as a predicate over a member's modifiers.
    // A leading "!" reads as "none of these", which is how public is spelled.
    let access = null;
    const chipTest = (spec) => {
      const negated = spec.startsWith('!');
      const want = spec.replace(/^!/, '').split(',');
      return (mods) => (negated ? !want.some((w) => mods.has(w)) : want.some((w) => mods.has(w)));
    };

    function apply() {
      const q = filterInput.value.trim().toLowerCase();
      const narrowed = !!q || !!access;
      if (narrowed && !saved) {
        saved = new Map();
        for (const t of trees) for (const d of t.querySelectorAll('details')) saved.set(d, d.open);
      }
      let n = 0;
      for (const u of units) {
        const on = (!q || u.text.includes(q)) && (!access || !u.mods || access(u.mods));
        u.el.hidden = !on;
        if (u.also) u.also.hidden = !on;
        if (on) n++;
      }
      for (const t of trees) {
        if (q) n += filterTree(t, q);
        else if (saved) showSubtree(t);
      }
      if (!q) saved = null;
      syncHeadings(narrowed);
      if (filterCount) {
        filterCount.textContent = narrowed
          ? (n ? `${n.toLocaleString()} of ${total().toLocaleString()}` : 'no matches')
          : '';
      }
      refreshToc();
    }

    $('.filter-chips')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mod]');
      if (!btn) return;
      for (const el of btn.parentElement.children) {
        const on = el === btn;
        el.classList.toggle('active', on);
        el.setAttribute('aria-pressed', String(on));
      }
      access = btn.dataset.mod ? chipTest(btn.dataset.mod) : null;
      apply();
    });

    let pending;
    filterInput.addEventListener('input', () => {
      clearTimeout(pending);
      pending = setTimeout(apply, 60);
    });
    filterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && filterInput.value) {
        e.stopPropagation();
        filterInput.value = '';
        apply();
      }
    });
    // Browsers restore a search field's value across a back navigation, and
    // the page it is restored onto is unfiltered.
    if (filterInput.value) apply();

    // For the one page whose rows arrive after this ran.
    rescanFilter = () => { scan(); apply(); };
  }

  /* ---------- all members of a class ----------
     The one page built here rather than by the generator. Everything it needs
     is in search.json — which classes declare which methods and fields — and
     the page itself supplies the inheritance chain, so the rows cost nothing
     to ship. See renderClassMembers in src/generate/render.js for why. */
  const allTable = $('#allMembers');
  if (allTable) {
    const chain = allTable.dataset.chain.split(',');
    const own = chain[0];

    loadIndex().then(() => {
      const wanted = new Map(chain.map((n, i) => [n, i]));
      // name -> the position in the chain of each class declaring it
      const found = new Map();
      const note = (ci, name, method) => {
        const at = wanted.get(index.classes[ci]);
        if (at === undefined) return;
        const seen = found.get(name);
        if (seen) seen.at.push(at);
        else found.set(name, { at: [at], method });
      };
      for (const [ci, n] of index.methods || []) note(ci, n, true);
      for (const [ci, n] of index.vars || []) note(ci, n, false);

      const rows = [...found.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const html = rows
        .map(([name, r]) => {
          // Nearest declaration wins, which is the one a call resolves to.
          const from = chain[Math.min(...r.at)];
          const shadows = r.at.length > 1;
          const badge = from !== own
            ? '<span class="badge badge-inherited">inherited</span>'
            : shadows
              ? '<span class="badge badge-override" title="Also declared further up the chain">override</span>'
              : '';
          return `<tr><td><a href="${BASE}class/${from}/#${anchorOf(name)}"><code>${esc(name)}${r.method ? '()' : ''}</code></a></td><td><a href="${BASE}class/${from}/">${esc(from)}</a></td><td>${badge}</td></tr>`;
        })
        .join('');

      $('tbody', allTable).innerHTML = html;
      const inherited = rows.filter(([, r]) => chain[Math.min(...r.at)] !== own).length;
      $('.members-fallback').textContent =
        `${rows.length.toLocaleString()} members, ${inherited.toLocaleString()} of them inherited.`;
      $('h1').insertAdjacentHTML('beforeend', ` <span class="count">${rows.length.toLocaleString()}</span>`);
      const filter = $('#pageFilter');
      if (filter) filter.placeholder = `Filter ${rows.length.toLocaleString()} members…`;
      rescanFilter();
    }).catch(() => {
      // .catch rather than a second argument to .then, so that a failure while
      // building the rows is caught too and not just a failure to fetch them.
      // Either way the page must stop claiming it is still working on it.
      if (!$('tbody', allTable).children.length) {
        $('.members-fallback').textContent =
          'The member list could not be loaded. Each class in the chain above lists its own members in full.';
      }
    });
  }

  /* ---------- data fields index ----------
     Letter pages ship empty; the name → classes map is in search.json. */
  const fieldsList = $('#fieldsList');
  if (fieldsList) {
    const kind = fieldsList.dataset.kind;
    const letter = fieldsList.dataset.letter;
    const letterOf = (n) => (/^[a-z]/i.test(n) ? n[0].toLowerCase() : '_');
    loadIndex().then(() => {
      const owners = new Map();
      const add = (ci, name) => {
        if (letterOf(name) !== letter) return;
        const cls = index.classes[ci];
        const list = owners.get(name);
        if (list) {
          if (!list.includes(cls)) list.push(cls);
        } else owners.set(name, [cls]);
      };
      if (kind !== 'variables') for (const [ci, n] of index.methods || []) add(ci, n);
      if (kind !== 'functions') for (const [ci, n] of index.vars || []) add(ci, n);
      const names = [...owners.keys()].sort((a, b) => a.localeCompare(b));
      const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      fieldsList.innerHTML = names
        .map((name) => {
          const dd = owners.get(name).map((c) => `<a href="${BASE}class/${c}/#${anchorOf(name)}">${escHtml(c)}</a>`).join(' ');
          return `<dt><code>${escHtml(name)}</code></dt><dd>${dd}</dd>`;
        })
        .join('');
      const fallback = $('.members-fallback');
      if (fallback) fallback.textContent = `${names.length.toLocaleString()} names.`;
      $('h1').insertAdjacentHTML('beforeend', ` <span class="count">${names.length.toLocaleString()}</span>`);
      const filter = $('#pageFilter');
      if (filter) filter.placeholder = `Filter ${names.length.toLocaleString()} fields…`;
      rescanFilter();
    }).catch(() => {
      const fallback = $('.members-fallback');
      if (fallback) fallback.textContent = 'The list could not be loaded.';
    });
  }

  /* ---------- table of contents ----------
     Doxygen's page-nav panel: the sections of this page, beside it, with the
     one you are in marked. Built from the headings the page already has, so
     it costs the generated HTML nothing and cannot fall out of step with it.
     Wide viewports only — there is no room for a third column below that, and
     the headings are a short scroll away on a phone. */
  const roomForToc = matchMedia('(min-width: 1180px)');

  function buildToc() {
    if (!main || $('.toc')) return;
    const heads = [...main.children].filter((el) => el.tagName === 'H2' || el.tagName === 'H3');
    if (heads.length < 3) return;

    const toc = document.createElement('aside');
    toc.className = 'toc';
    toc.setAttribute('aria-label', 'On this page');
    const nav = document.createElement('nav');

    // The page title is the way back to the top: above the first section there
    // is otherwise nothing to mark, and "Index" / "Start" would collide with
    // real pages. Strip the chrome the h1 carries for the page itself.
    const title = $('h1', main);
    let titleLink = null;
    if (title) {
      if (!title.id) title.id = 'top';
      titleLink = document.createElement('a');
      titleLink.href = `#${title.id}`;
      titleLink.className = 'toc-1';
      const label = title.cloneNode(true);
      label.querySelectorAll('.count, .kw, .badge, .generics').forEach((el) => el.remove());
      titleLink.textContent = label.textContent.trim();
      nav.append(titleLink);
    }

    const links = heads.map((h) => {
      // Most headings are anchored already; the rest are given one here rather
      // than in the generator, where it would be an id nothing links to.
      if (!h.id) h.id = (h.textContent.trim().toLowerCase().match(/[\w]+/g) || ['section']).join('-');
      const a = document.createElement('a');
      a.href = `#${h.id}`;
      a.className = h.tagName === 'H3' ? 'toc-3' : 'toc-2';
      // not the count badge: the number is on the heading itself already
      const label = h.cloneNode(true);
      label.querySelector('.count')?.remove();
      a.textContent = label.textContent.trim();
      nav.append(a);
      return a;
    });
    toc.append(Object.assign(document.createElement('p'), { className: 'toc-title', textContent: 'On this page' }), nav);
    main.after(toc);

    const margins = heads.map((h) => parseFloat(getComputedStyle(h).marginTop) || 0);

    /** Last heading whose section has reached the sticky header. Count the
        heading's top margin: that gap is this section, not the previous one,
        and a TOC click parks the heading on scroll-padding-top, which sat
        below the old heading-box threshold. Above every section, the title. */
    const spy = () => {
      let cur = titleLink;
      const line = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--h-top')) || 56;
      for (let i = 0; i < heads.length; i++) {
        if (heads[i].hidden) continue;
        if (heads[i].getBoundingClientRect().top - margins[i] > line) break;
        cur = links[i];
      }
      if (titleLink) titleLink.classList.toggle('cur', titleLink === cur);
      for (const a of links) a.classList.toggle('cur', a === cur);
    };
    addEventListener('scroll', spy, { passive: true });

    refreshToc = () => {
      let any = false;
      heads.forEach((h, i) => {
        links[i].hidden = h.hidden;
        if (!h.hidden) any = true;
      });
      toc.hidden = !any;
      spy();
    };
    refreshToc();
  }

  if (main) {
    roomForToc.addEventListener('change', () => roomForToc.matches && buildToc());
    if (roomForToc.matches) buildToc();
  }

  /* ---------- source minimap ----------
     A rail beside a source file holding the whole of it at once: one bar per
     line, positioned and sized by where the line sits and how long it is, so
     the column reads as the shape of the code. Dragging scrolls, clicking
     jumps to the line under the pointer, and hovering reads it out.

     Source pages only. Every other long page here is a list of named things,
     and a list of nine hundred methods is nine hundred identical marks that
     say nothing; those are served by the table of contents above and the
     filter field, which name what the rail could only gesture at. Code is the
     one thing on this site with a texture worth mapping.

     Built here rather than in the markup because it is measured, throwaway
     chrome, and because the generated HTML has to stay byte-identical across
     builds. It carries aria-hidden: every bar targets a line the page already
     exposes to a screen reader, so announcing all of them twice would only
     add noise. */
  const wide = matchMedia('(min-width: 901px)');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const LABEL_MIN = 17; // px between a label and the line it names
  const LABEL_MAX = 96; // px of unlabelled rail before one gets sampled in

  let mm, track, view, tip, items, bars = [], marks = [], scale = 1;

  /** Every line with its document geometry, measured once per layout. Lines
      are uniform, so two reads give every offset and spare us thousands more.
      Offsets come from the viewport rather than offsetTop, which is measured
      from the positioned ancestor and would need correcting anyway. */
  function collect() {
    const lines = [...srcEl.children];
    if (lines.length < 2) return [];
    const y0 = scrollY;
    const first = lines[0].getBoundingClientRect();
    const lh = lines[1].getBoundingClientRect().top - first.top;
    return lines.map((el, i) => {
      const text = el.textContent;
      return {
        el,
        top: first.top + y0 + i * lh,
        h: lh,
        name: `L${i + 1}`,
        label: `${i + 1}  ${text}`.replace(/\s+/g, ' ').trim().slice(0, 90),
        indent: text.length - text.trimStart().length,
        len: text.trim().length,
      };
    });
  }

  /** The line nearest a point on the rail. They come out of collect() in
      document order, so their rail positions are already sorted. */
  function itemAt(list, y) {
    let lo = 0;
    let hi = list.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].top * scale < y) lo = mid + 1;
      else hi = mid;
    }
    return list[lo];
  }

  /**
   * The few line numbers that make the rail aimable, in rail coordinates.
   * Sampled at a fixed spacing, and only where a line really sits close to
   * the sample point — on a short file the nearest one can be half the rail
   * away, and the label would point at the wrong thing.
   */
  function signposts(th) {
    const out = [];
    for (let y = LABEL_MAX; y < th - LABEL_MIN; y += LABEL_MAX) {
      const it = itemAt(items, y);
      const iy = it && Math.round(it.top * scale);
      if (it && Math.abs(iy - y) < LABEL_MIN) out.push({ y: iy, text: it.name });
    }
    return out;
  }

  /** Project the lines onto the rail, one bar per pixel row. */
  function place() {
    const th = track.clientHeight;
    const tw = track.clientWidth;
    if (!th || !tw) return; // rail is hidden (narrow viewport)
    scale = th / document.documentElement.scrollHeight;

    // A long file puts a dozen lines on the same row. Keep the longest and
    // the shallowest, so the row still describes them.
    const rows = new Map();
    for (const it of items) {
      const y = Math.round(it.top * scale);
      const w = Math.max(2, Math.min(1, it.len / 80) * tw);
      const x = Math.min(0.4, it.indent / 60) * tw;
      const h = Math.max(1, Math.round(it.h * scale));
      const r = rows.get(y);
      if (!r) { rows.set(y, { y, x, w, h, it }); continue; }
      r.x = Math.min(r.x, x);
      r.h = Math.max(r.h, h);
      // the fullest of them names the row, so the tip never reads out a blank
      if (w > r.w) { r.w = w; r.it = it; }
    }

    bars = [...rows.values()];
    marks = signposts(th);
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    track.innerHTML = bars
      .map((b) => `<i class="mm-bar" style="top:${b.y}px;` +
        `left:${b.x.toFixed(1)}px;width:${b.w.toFixed(1)}px;height:${b.h}px"></i>`)
      .join('') + marks
      .map((m) => `<div class="mm-mark" style="top:${m.y}px"><span>${esc(m.text)}</span></div>`)
      .join('') + '<div class="mm-view"></div>';
    view = $('.mm-view', track);
  }

  function sync() {
    if (!view) return;
    view.style.top = `${(scrollY * scale).toFixed(1)}px`;
    view.style.height = `${Math.max(8, innerHeight * scale).toFixed(1)}px`;
  }

  /** The bar under (or within a few pixels of) a point on the rail. */
  function nearest(y) {
    let best = null;
    let bd = 9;
    for (const b of bars) {
      const d = y < b.y ? b.y - y : Math.max(0, y - b.y - b.h);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function buildMinimap() {
    if (mm) return;
    items = collect();
    // Not worth a rail if the page barely scrolls or has nothing to point at.
    if (items.length < 8 || document.documentElement.scrollHeight < innerHeight * 1.8) return;

    mm = document.createElement('aside');
    mm.className = 'minimap';
    mm.setAttribute('aria-hidden', 'true');
    mm.innerHTML = '<div class="mm-track"></div><div class="mm-tip" hidden></div>';
    main.after(mm);
    track = $('.mm-track', mm);
    tip = $('.mm-tip', mm);
    place();
    sync();

    const at = (e) => e.clientY - track.getBoundingClientRect().top;
    // Centre the viewport on the point pressed, the way a minimap does.
    const centre = (y, smooth) => scrollTo({
      top: Math.max(0, y / scale - innerHeight / 2),
      behavior: smooth && !still.matches ? 'smooth' : 'auto',
    });

    let down = false;
    let dragging = false;
    let startY = 0;

    track.addEventListener('pointerdown', (e) => {
      e.preventDefault(); // don't start a text selection in the page behind
      track.setPointerCapture(e.pointerId);
      down = true;
      dragging = false;
      startY = e.clientY;
      tip.hidden = true;
    });
    track.addEventListener('pointermove', (e) => {
      const y = at(e);
      if (!down) {
        const b = nearest(y);
        if (b) {
          tip.textContent = b.it.label;
          tip.style.top = `${b.y + track.offsetTop}px`;
        }
        tip.hidden = !b;
        return;
      }
      if (!dragging && Math.abs(e.clientY - startY) > 3) dragging = true;
      if (dragging) centre(y, false);
    });
    // A press that never moved is aimed at something: bars are one or two
    // pixels tall, so honour the nearest one instead of the raw position.
    track.addEventListener('pointerup', (e) => {
      down = false;
      if (dragging) return;
      const b = nearest(at(e));
      if (b) b.it.el.scrollIntoView({ block: 'start', behavior: still.matches ? 'auto' : 'smooth' });
      else centre(at(e), true);
    });
    // without this a cancelled gesture leaves the rail scrolling on hover
    track.addEventListener('pointercancel', () => { down = false; });
    track.addEventListener('pointerleave', () => { tip.hidden = true; });

    addEventListener('scroll', sync, { passive: true });

    // The page can grow after load — a <details> opens, the window resizes, a
    // font settles — and every offset moves with it, so measure again.
    let pending;
    new ResizeObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(() => { items = collect(); place(); sync(); }, 120);
    }).observe(document.body);
  }

  if (srcEl && main) {
    const boot = () => { if (wide.matches) buildMinimap(); };
    wide.addEventListener('change', boot);
    boot();
  }
})();
