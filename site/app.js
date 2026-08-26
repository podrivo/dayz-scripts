/* DayZ Scripts docs client: theme, nav, version switch, search, highlighting */
(() => {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const BASE = document.body.dataset.base || '';
  const ROOT = '/';
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

  /* ---------- sidebar topics ----------
     The list of module topics belongs to a build, and the pages do not, so the
     sidebar leaves a hole for it and fills it from this build's nav.json the
     first time the section is opened. Without JavaScript the section heading
     is still a link to the full list. */
  let navPromise;
  for (const box of document.querySelectorAll('.nav-kids[data-nav]')) {
    const details = box.closest('details');
    const fill = () => {
      navPromise ||= fetch(BASE + 'nav.json').then((r) => r.json());
      navPromise.then(({ topics }) => {
        if (box.firstChild) return;
        const active = box.dataset.active;
        box.append(...topics.map(([name, title]) => {
          const a = document.createElement('a');
          a.className = 'nav-sub';
          a.href = `${BASE}module/${name}/`;
          a.textContent = title;
          if (active === `module/${name}/`) {
            a.classList.add('active');
            a.setAttribute('aria-current', 'page');
          }
          return a;
        }));
      }).catch(() => {});
    };
    if (details.open) fill();
    details.addEventListener('toggle', () => details.open && fill(), { once: false });
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
  let buildsPromise;
  const loadBuilds = () => (buildsPromise ||= fetch(ROOT + 'assets/versions.json').then((r) => r.json()));

  let current = null;
  const identity = loadBuilds().then((builds) => {
    current = (pathBuild && builds.find((b) => b.build === pathBuild)) || builds[0];
    const label = $('.ver-label');
    if (label) {
      const patch = document.createElement('span');
      patch.className = 'ver-patch';
      patch.textContent = current.build.slice(current.version.length);
      label.textContent = current.version;
      label.append(patch);
    }
    const gh = $('#ghSrc');
    if (gh && current.sha) gh.href = gh.href.replace('/blob/main/', `/blob/${current.sha}/`);
    const foot = $('#footBuild');
    if (foot) foot.textContent = `${current.build} (${current.date})`;
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
        html += `<a href="${href}"${cur ? ' class="cur" aria-current="page"' : ''}>` +
          `<span class="ver-row">${b.build}` +
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
  let index = null;
  let entries = null;
  let sel = -1;

  const KIND = {
    c: ['c', (n) => `class/${n}/`],
    e: ['e', (n) => `enum/${n}/`],
    t: ['t', (n) => `globals/typedefs/#${n}`],
    k: ['k', (n) => `globals/variables/#${n}`],
    f: ['f', (n) => `globals/functions/#${n}`],
    // Paths are indexed as displayed; the URL is that spelling lowercased.
    F: ['F', (p) => `file/${p.toLowerCase()}/`],
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

  /* ---------- Enforce Script highlighting ---------- */
  const KW = new Set(('class enum typedef extends modded sealed proto native owned external volatile override event ' +
    'private protected static const ref autoptr out inout notnull new delete this super return if else for foreach ' +
    'while switch case default break continue null true false void int float bool string vector typename func auto ' +
    'thread waitAll wait sleep delegate').split(' '));

  const TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*")|(^[ \t]*#[^\n]*)|(\b0x[0-9a-fA-F]+\b|\b\d+\.?\d*\b)|(\b[A-Za-z_]\w*\b)/gm;

  function highlight(text, resolve) {
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
        else {
          const body = /^[A-Z]/.test(m[5]) ? `<span class="tok-type">${esc(m[5])}</span>` : esc(m[5]);
          const href = resolve && resolve(m[5]);
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
   * by scope; nothing here parses the language, so a name is linked only when
   * one declaration in the build answers to it and the ambiguous ones are left
   * as plain text.
   */
  function sourceResolver() {
    const map = new Map();
    const claim = (n, url) => {
      const seen = map.get(n);
      if (seen === undefined) map.set(n, url);
      else if (seen !== url) map.set(n, null);
    };
    for (const n of index.classes) claim(n, `class/${n}/`);
    for (const n of index.enums) claim(n, `enum/${n}/`);
    for (const n of index.typedefs) claim(n, `globals/typedefs/#${n}`);
    for (const n of index.funcs) claim(n, `globals/functions/#${n}`);
    for (const n of index.consts) claim(n, `globals/variables/#${n}`);
    for (const [ci, m] of index.methods) claim(m, `class/${index.classes[ci]}/#${m}`);
    return (n) => {
      const url = map.get(n);
      return url ? BASE + url : null;
    };
  }

  // source view: highlight + line numbers + deep links
  const srcEl = $('#src code');
  if (srcEl) {
    const raw = srcEl.textContent;
    const paint = (resolve) => {
      srcEl.innerHTML = highlight(raw, resolve)
        .split('\n')
        .map((l, i) => `<span class="line" id="L${i + 1}">${l}\n</span>`)
        .join('');
    };
    // Painted twice: once now, so the code is readable without waiting on a
    // network round trip, and again once the index that resolves the links has
    // arrived. Keeping the links out of the HTML is also what lets a file page
    // stay byte-identical across builds and keep its hard link.
    paint(null);
    if (/^#L\d+$/.test(location.hash)) $(location.hash)?.scrollIntoView({ block: 'center' });
    loadIndex().then(() => paint(sourceResolver()));
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

  /* ---------- minimap ----------
     A rail beside long pages holding the whole document at once: every
     landmark — heading, member, table row, or line of code on a source page —
     becomes one bar, positioned and sized by where it actually sits in the
     page. Dragging scrolls, clicking jumps to the bar under the pointer, and
     hovering names it.

     Bars alone are only half of it. Source code has shape, so its texture
     reads, but a list of nine hundred methods is nine hundred identical marks
     and says nothing at all. So the rail also carries a few labels you can
     actually read — see signposts() — which is what makes it navigable rather
     than merely proportional.

     Built here rather than in the markup because it is measured, throwaway
     chrome, and because the generated HTML has to stay byte-identical across
     builds. It carries aria-hidden: every bar targets an anchor the page
     already exposes to a screen reader, so announcing all of them twice would
     only add noise. */
  const main = $('.main');
  const wide = matchMedia('(min-width: 901px)');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const LANDMARKS = 'h1, h2, h3, .member, .diff-class, ul.tree > li, table.list tbody tr';
  const LABEL_MIN = 17; // px between labels before they would collide
  const LABEL_MAX = 96; // px of unlabelled rail before one gets sampled in

  let mm, track, view, tip, items, bars = [], marks = [], scale = 1;

  /** The shortest text that identifies a landmark, for the hover tip: the
      summary of a collapsed block, else the signature or name it leads with,
      else everything it says. Naming the inner element matters because the
      badges and briefs that follow one are siblings inside the same cell, and
      textContent would run them all together. */
  function labelOf(el) {
    const s = el.classList.contains('line')
      ? `${el.id.slice(1)}  ${el.textContent}`
      : $('summary', el)?.textContent || $('code, a', el)?.textContent || el.textContent;
    return s.replace(/\s+/g, ' ').trim().slice(0, 90);
  }

  /** Landmarks with their document geometry, measured once per layout.
      Offsets come from the viewport rather than offsetTop, which for a table
      row is measured from its own <table> and would stack every row of every
      table at the top of the rail. */
  function collect() {
    const y0 = scrollY;
    // On a source page the code is the page, so map it line by line. Lines are
    // uniform, so two reads give every offset and spare us thousands more.
    const lines = srcEl && srcEl.children.length > 1 ? [...srcEl.children] : null;
    if (lines) {
      const first = lines[0].getBoundingClientRect();
      const lh = lines[1].getBoundingClientRect().top - first.top;
      return lines.map((el, i) => {
        const text = el.textContent;
        return {
          el, top: first.top + y0 + i * lh, h: lh, head: false, label: labelOf(el),
          name: `L${i + 1}`,
          indent: text.length - text.trimStart().length, len: text.trim().length,
        };
      });
    }
    const out = [];
    for (const el of main.querySelectorAll(LANDMARKS)) {
      // A closed <details> still reports a box for its contents, and the wrong
      // one — the rows of a collapsed changelog group all measure up near the
      // summary — so go by the state of the disclosure rather than the box.
      if (el.parentElement?.closest('details:not([open])')) continue;
      const r = el.getBoundingClientRect();
      if (!r.height) continue;
      const head = el.tagName.length === 2 && el.tagName[0] === 'H';
      const label = labelOf(el);
      // The bare name, apart from the signature around it, is what a label has
      // room for and what an alphabetical page is ordered by. Paths keep only
      // their last segment: a column this narrow spent on a directory prefix
      // every neighbour shares says nothing at all.
      const found = ($('.fn, .vn', el) || $('code, a', el))?.textContent.trim() || label;
      const name = found.split('/').pop() || found;
      out.push({
        el, top: r.top + y0, h: r.height, head, label, name,
        indent: head ? 0 : 3, len: label.length,
      });
    }
    return out;
  }

  /** The item nearest a point on the rail. Landmarks come out of collect() in
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

  /** Whether a list is in name order, in which case initials make signposts
      the way the letter strip on the classes index does. A handful out of
      order is fine — overloads and casing put them there. */
  function alphabetical(list) {
    let wrong = 0;
    let prev = '';
    for (const it of list) {
      const cur = it.name.toLowerCase();
      if (cur < prev) wrong++;
      prev = cur;
    }
    return wrong < list.length * 0.05;
  }

  /**
   * The few labels that make the rail readable, in rail coordinates.
   *
   * Sections where the page has them, initials where it is one alphabetical
   * list, and past that a sampled name wherever a stretch of rail would
   * otherwise carry nothing to aim at — which is what rescues the pages that
   * are one flat run of hundreds of members under a single heading.
   */
  function signposts(th) {
    // not the h1: the page title is already on screen above the rail
    const heads = items.filter((it) => it.head && it.el.tagName !== 'H1');
    const list = items.filter((it) => !it.head);
    const found = [];
    if (heads.length >= 3) {
      // without the count badge, which the width here cannot spare
      for (const it of heads) {
        found.push({ y: Math.round(it.top * scale), text: it.label.replace(/\s+\d+$/, '') });
      }
    } else if (list.length > 40 && alphabetical(list)) {
      let prev = '';
      for (const it of list) {
        const initial = it.name.slice(0, 1).toUpperCase();
        if (initial && initial !== prev) {
          prev = initial;
          found.push({ y: Math.round(it.top * scale), text: initial });
        }
      }
      // A page under a single initial has learnt nothing from it — a letter of
      // the class index, or the line numbers of a source file. Sample instead.
      if (found.length < 4) found.length = 0;
    }

    // Where labels would collide the one owning more of the rail wins. On a
    // class page that keeps Methods and its hundreds of entries over the
    // two-line Constructors section sitting a few pixels above it.
    const kept = [];
    for (let i = 0; i < found.length; i++) {
      const m = { ...found[i], span: (found[i + 1]?.y ?? th) - found[i].y };
      const prev = kept[kept.length - 1];
      if (prev && m.y - prev.y < LABEL_MIN) {
        if (m.span > prev.span) kept[kept.length - 1] = m;
      } else {
        kept.push(m);
      }
    }

    const out = [];
    let last = -LABEL_MIN; // so a list starting at the top keeps its first label
    for (const m of [...kept, { y: th }]) {
      for (let y = last + LABEL_MAX; y < m.y - LABEL_MIN; y += LABEL_MAX) {
        // A sample is only worth a label if something is really there to name.
        // On a short page the nearest item can be half the rail away, and the
        // label would point at the wrong thing — or repeat the one above it.
        const it = itemAt(list, y);
        const iy = it && Math.round(it.top * scale);
        if (it && Math.abs(iy - y) < LABEL_MIN) out.push({ y: iy, text: it.name });
      }
      if (m.text) out.push(m);
      last = m.y;
    }
    return out;
  }

  /** Project the landmarks onto the rail, one bar per pixel row. */
  function place() {
    const th = track.clientHeight;
    const tw = track.clientWidth;
    if (!th || !tw) return; // rail is hidden (narrow viewport)
    scale = th / document.documentElement.scrollHeight;

    // Several landmarks can land on the same row — a long file puts a dozen
    // lines there. Keep the longest and the shallowest, so the row still
    // describes them. Headings are the exception: they read as full-width
    // rules across the rail, which is the only thing that makes the sections
    // of a nine-hundred-method class findable, so one owns its row outright.
    const rows = new Map();
    for (const it of items) {
      const y = Math.round(it.top * scale);
      const w = it.head ? tw : Math.max(2, Math.min(1, it.len / 80) * tw);
      const x = it.head ? 0 : Math.min(0.4, it.indent / 60) * tw;
      const h = Math.max(it.head ? 3 : 1, Math.round(it.h * scale));
      const r = rows.get(y);
      if (!r || (it.head && !r.head)) { rows.set(y, { y, x, w, h, head: it.head, it }); continue; }
      if (r.head) continue;
      r.x = Math.min(r.x, x);
      r.h = Math.max(r.h, h);
      // the fullest of them names the row, so the tip never reads out a blank
      if (w > r.w) { r.w = w; r.it = it; }
    }

    bars = [...rows.values()];
    marks = signposts(th);
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    track.innerHTML = bars
      .map((b) => `<i class="mm-bar${b.head ? ' mm-head' : ''}" style="top:${b.y}px;` +
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

  if (main) {
    const boot = () => { if (wide.matches) buildMinimap(); };
    wide.addEventListener('change', boot);
    boot();
  }
})();
