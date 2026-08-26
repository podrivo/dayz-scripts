/* Build comparison, first iteration.
   ------------------------------------------------------------------------
   Loaded on demand by site/app.js when /compare/ is the page, so the ~416k
   pages that are not this one do not pay for it.

   /changes/ shows one build against the one before it, from a diff the
   generator already had in hand. This shows any two builds against each
   other, and does the choosing here rather than at build time: 49 builds are
   1,176 pairs, and the obvious next ask — three builds at once — is 18,424
   triples, so there is no version of this that is a page per comparison.

   THE COMPARISON DATA IS FAKE. Everything below the fence marked
   "placeholder data" invents changes out of the current build's real names,
   so the layout, the counts and the interactions can be judged at realistic
   scale before the diffs are wired up. The measurements that say wiring them
   up is cheap: an adjacent diff serialises to 25 KB (4 KB gzipped), the
   widest pair on record — 1.19.155390 to 1.29.163709 — to 448 KB (80 KB),
   and all 48 adjacent diffs together to about 250 KB gzipped, which is less
   than search.json already costs. So each build gains a diff.json sidecar
   and this file folds the range between the two picks together. Composing
   adjacent diffs is exact, and it knows which build each change landed in,
   which is what a third column would need. */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]);
const num = (n) => n.toLocaleString('en-US');

/* The kinds a comparison is grouped by, in the order the sidebar lists them.
   `flat` marks the ones with no members to change, where "changed" is one
   before-and-after line rather than a list; `pool` is where the placeholder
   generator finds real names of that kind in search.json. Only classes and
   enums are compared by src/generate/diff.js today, and the other four are
   here because leaving them out is the current changelog's blind spot: a
   removed global function is exactly the kind of break this page is for. */
const KINDS = [
  { key: 'class', label: 'Classes', pool: 'classes', url: (n) => `class/${n}/` },
  { key: 'enum', label: 'Enums', pool: 'enums', url: (n) => `enum/${n}/` },
  { key: 'func', label: 'Global functions', pool: 'funcs', url: () => 'globals/functions/', flat: true },
  { key: 'const', label: 'Constants', pool: 'consts', url: () => 'globals/variables/', flat: true },
  { key: 'typedef', label: 'Typedefs', pool: 'typedefs', url: () => 'globals/typedefs/', flat: true },
  { key: 'macro', label: 'Macros', pool: 'macros', url: () => 'globals/macros/', flat: true },
];

/* `label` heads the list of one kind, where the kind above it says what was
   added; `total` names the same thing counted across every kind at once, where
   nothing else is there to say so. */
const OPS = {
  added: { sign: '+', label: 'Added', total: 'Additions' },
  removed: { sign: '−', label: 'Removed', total: 'Removals' },
  changed: { sign: '±', label: 'Changed', total: 'Changes' },
};

/** What the totals are totals of, since they run the six kinds together. */
const SCOPE = `Across ${KINDS.map((k) => k.label.toLowerCase()).join(', ')}`;

/* ---------- placeholder data ------------------------------------------------
   Everything to the next fence goes when diff.json lands. It is seeded off
   the two build labels so a given pair always produces the same comparison —
   a shared URL has to show the reader what the sender saw, and a comparison
   that reshuffled on every keystroke would be impossible to judge. */

const hash32 = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** mulberry32: small, seedable, and good enough to look unpatterned. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` distinct names out of `pool`, in the order the site would list them. */
function sample(pool, n, rnd) {
  const want = Math.max(0, Math.min(Math.round(n), pool.length));
  const out = new Set();
  // Bounded rather than "until the set is full": with want near pool.length
  // the last few draws would collide for a long time.
  for (let i = 0; out.size < want && i < want * 12; i++) {
    out.add(pool[Math.floor(rnd() * pool.length)]);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

const TYPES = ['void', 'bool', 'int', 'float', 'string', 'vector', 'EntityAI', 'PlayerBase', 'ItemBase', 'notnull ItemBase'];
const PARAMS = ['', 'int index', 'float value', 'bool state', 'string name', 'PlayerBase player', 'EntityAI target, int slot', 'vector pos, float radius'];

/** A signature that reads like one of ours, for a name taken from the index. */
const fakeSig = (name, rnd) =>
  `${TYPES[Math.floor(rnd() * TYPES.length)]} ${name}(${PARAMS[Math.floor(rnd() * PARAMS.length)]})`;

/**
 * A comparison of two builds, invented but proportioned like a real one.
 *
 * Magnitude tracks how far apart the builds are, because that is the whole
 * reason this page exists: neighbours differ by a few dozen signatures, while
 * a jump across four game versions rewrites hundreds of classes, and the two
 * are different enough to read that the layout has to survive both.
 *
 * Always generated oldest to newest and inverted afterwards if the picks run
 * the other way, so that swapping the two really does turn one comparison
 * inside out instead of producing an unrelated second one.
 */
function placeholderCompare(from, to, order, index) {
  const reversed = order.indexOf(from) > order.indexOf(to);
  const [older, newer] = reversed ? [to, from] : [from, to];
  const rnd = seeded(hash32(`${older}|${newer}`));
  const d = Math.max(1, Math.abs(order.indexOf(from) - order.indexOf(to)));
  const scale = (base, exp) => base * d ** exp * (0.7 + rnd() * 0.6);

  const methodNames = (index.methods || []).map((m) => m[1]);
  const varNames = (index.vars || []).map((v) => v[1]);
  const valueNames = (index.values || []).map((v) => v[1]);

  const groups = [];
  for (const kind of KINDS) {
    const pool = index[kind.pool] || [];
    if (!pool.length) continue;

    // Neighbouring builds usually add nothing at all; distance is what turns
    // a comparison from a list of signature tweaks into a list of new types.
    const weight = kind.key === 'class' ? 1 : kind.key === 'enum' ? 0.2 : 0.08;
    const added = sample(pool, scale(7 * weight, 0.8), rnd);
    const removed = sample(pool, scale(2 * weight, 0.7), rnd);
    const changedNames = sample(pool, scale(kind.key === 'class' ? 50 : 40 * weight, 0.6), rnd);

    const changed = changedNames.map((name) => {
      if (kind.flat) {
        const sig = kind.key === 'func' ? fakeSig(name, rnd) : name;
        return { name, rows: [{ op: 'changed', from: sig, to: fakeSig(name, rnd) }] };
      }
      const members = kind.key === 'enum' ? valueNames : methodNames;
      const rows = [];
      for (let i = 0, n = 1 + Math.floor(rnd() * 5); i < n; i++) {
        const member = members[Math.floor(rnd() * members.length)];
        if (!member) continue;
        const r = rnd();
        if (kind.key === 'enum') {
          rows.push({ op: r < 0.75 ? 'added' : 'removed', text: member });
        } else if (r < 0.45) {
          rows.push({ op: 'changed', from: fakeSig(member, rnd), to: fakeSig(member, rnd) });
        } else if (r < 0.8) {
          rows.push({ op: 'added', text: rnd() < 0.7 ? fakeSig(member, rnd) : `int ${varNames[Math.floor(rnd() * varNames.length)]}` });
        } else {
          rows.push({ op: 'removed', text: fakeSig(member, rnd) });
        }
      }
      return { name, rows };
    });

    if (!added.length && !removed.length && !changed.length) continue;
    groups.push(reversed
      ? {
        ...kind,
        added: removed,
        removed: added,
        changed: changed.map((e) => ({
          name: e.name,
          rows: e.rows.map((r) => (r.op === 'changed'
            ? { op: 'changed', from: r.to, to: r.from }
            : { op: r.op === 'added' ? 'removed' : 'added', text: r.text })),
        })),
      }
      : { ...kind, added, removed, changed });
  }
  return groups;
}

/* ---------- end placeholder data ------------------------------------------ */

/**
 * Where a name of a given kind lives, in the build it belongs to. Added names
 * only exist in the newer build and removed ones only in the older, so each
 * link has to name its own build rather than the one this page happens to be
 * served from — otherwise half of them 404.
 */
function hrefFor(kind, name, build, latest) {
  return `/${build === latest ? '' : `v/${build}/`}${kind.url(name)}`;
}

function rowHtml(row) {
  const { sign } = OPS[row.op];
  const body = row.op === 'changed'
    ? `<code class="old">${esc(row.from)}</code><br><code>${esc(row.to)}</code>`
    : `<code>${esc(row.text)}</code>`;
  return `<tr class="${row.op}"><td>${sign}</td><td>${body}</td></tr>`;
}

/**
 * One name, as a filterable unit. `data-text` is what the filter matches and
 * `data-op` what the chips select, so narrowing never re-renders anything.
 */
function nameHtml(kind, name, op, build, latest) {
  const href = hrefFor(kind, name, build, latest);
  return `<a class="cmp-name" data-op="${op}" data-text="${esc(name.toLowerCase())}" href="${href}">${esc(name)}</a>`;
}

function changedHtml(kind, entry, build, latest) {
  const rows = entry.rows.map(rowHtml).join('');
  const text = esc(`${entry.name} ${entry.rows.map((r) => r.text || `${r.from} ${r.to}`).join(' ')}`.toLowerCase());
  const link = `<a href="${hrefFor(kind, entry.name, build, latest)}">${esc(entry.name)}</a>`;
  const table = `<table class="list difftable"><tbody>${rows}</tbody></table>`;
  // A single before-and-after line is not worth hiding behind a disclosure;
  // a class with nine changed methods is.
  return entry.rows.length > 1
    ? `<details class="diff-class cmp-unit" data-op="changed" data-text="${text}"><summary>${link} <span class="count">${entry.rows.length}</span></summary>${table}</details>`
    : `<div class="diff-flat cmp-unit" data-op="changed" data-text="${text}"><p class="diff-flat-name">${link}</p>${table}</div>`;
}

function groupsHtml(groups, from, to, latest) {
  return groups
    .map((g) => {
      const total = g.added.length + g.removed.length + g.changed.length;
      const parts = [];
      for (const [op, names, build] of [['added', g.added, to], ['removed', g.removed, from]]) {
        if (!names.length) continue;
        parts.push(
          `<h3 data-op="${op}">${OPS[op].label} <span class="count">${num(names.length)}</span></h3>
<div class="namegrid">${names.map((n) => nameHtml(g, n, op, build, latest)).join('')}</div>`
        );
      }
      if (g.changed.length) {
        parts.push(
          `<h3 data-op="changed">Changed <span class="count">${num(g.changed.length)}</span></h3>
<div class="cmp-list">${g.changed.map((e) => changedHtml(g, e, to, latest)).join('')}</div>`
        );
      }
      return `<div class="cmp-kind" data-kind="${g.key}">
<h2>${esc(g.label)} <span class="count">${num(total)}</span></h2>
${parts.join('\n')}
</div>`;
    })
    .join('\n');
}

export function initCompare({ builds, loadIndex, fmtDate }) {
  const box = document.getElementById('compare');
  const bar = document.getElementById('cmpBar');
  const fromSel = document.getElementById('cmpFrom');
  const toSel = document.getElementById('cmpTo');
  if (!box || !bar) return;

  const latest = builds[0].build;
  // Newest first is how the picker reads; oldest first is what "from" and
  // "to" mean, so the distance between two builds is measured on this.
  const order = builds.map((b) => b.build).reverse();
  const known = new Set(order);

  const fill = (sel, selected) => {
    let html = '';
    let version = '';
    for (const b of builds) {
      if (b.version !== version) {
        if (version) html += '</optgroup>';
        version = b.version;
        html += `<optgroup label="DayZ ${esc(version)}">`;
      }
      html += `<option value="${esc(b.build)}"${b.build === selected ? ' selected' : ''}>` +
        `${esc(b.build)} — ${esc(fmtDate(b.date))}</option>`;
    }
    sel.innerHTML = html + (version ? '</optgroup>' : '');
  };

  /** The pair in the URL, falling back to the two newest builds. */
  const read = () => {
    const q = new URLSearchParams(location.search);
    const pick = (key, dflt) => (known.has(q.get(key)) ? q.get(key) : dflt);
    return {
      from: pick('from', builds[1]?.build || latest),
      to: pick('to', latest),
    };
  };

  let { from, to } = read();
  let index; // search.json, which the placeholder generator mines for names

  function draw() {
    const same = from === to;
    const groups = same ? [] : placeholderCompare(from, to, order, index);
    const tally = (op) => groups.reduce((n, g) => n + g[op].length, 0);
    const totals = { added: tally('added'), removed: tally('removed'), changed: tally('changed') };
    const all = totals.added + totals.removed + totals.changed;

    box.setAttribute('aria-busy', 'false');
    if (!all) {
      box.innerHTML = `<p class="muted">${same
        ? 'The same build on both sides. Pick two different ones to compare.'
        : 'Nothing differs between these two builds.'}</p>`;
      return;
    }

    // The three totals double as the filter: each one names what it counts,
    // and clicking it shows exactly the things it counted, which is the only
    // way a number spanning six kinds can say which kind it came from.
    const ops = [['', 'Everything', all], ...Object.entries(OPS).map(([op, o]) => [op, o.total, totals[op]])];
    const missing = KINDS.filter((k) => !groups.some((g) => g.key === k.key)).map((k) => k.label.toLowerCase());

    box.innerHTML = `
<section class="stats cmp-ops" id="cmpOps" aria-label="Filter by what happened">${ops
      .map(([op, label, n], i) => `<button type="button" class="stat" data-op="${esc(op)}" aria-pressed="${!i}"` +
        `${op ? ` title="${esc(SCOPE)}"` : ''}><strong>${num(n)}</strong><span>${esc(label)}</span></button>`)
      .join('')}</section>
<div class="filterbar">
  <input type="search" id="cmpFilter" class="filter-input" placeholder="Filter these changes…" autocomplete="off" spellcheck="false" aria-label="Filter these changes">
  <span class="filter-count" id="cmpCount" aria-live="polite"></span>
</div>
${groupsHtml(groups, from, to, latest)}
${missing.length ? `<p class="muted cmp-none">No changes to ${missing.join(', ')}.</p>` : ''}`;
    bindFilter();
  }

  /* The page filter in site/app.js narrows what the generator put on a page;
     this narrows what the block above just built, and adds the one axis that
     filter has no way to express — which of the three things happened. Both
     are pure show/hide over units that carry their own searchable text. */
  function bindFilter() {
    const input = document.getElementById('cmpFilter');
    const count = document.getElementById('cmpCount');
    const ops = document.getElementById('cmpOps');
    const units = [...box.querySelectorAll('.cmp-name, .cmp-unit')];
    let op = '';

    const apply = () => {
      const q = input.value.trim().toLowerCase();
      let shown = 0;
      for (const el of units) {
        const on = (!q || el.dataset.text.includes(q)) && (!op || el.dataset.op === op);
        el.hidden = !on;
        if (on) shown++;
      }
      // A heading whose whole list filtered away, and a kind whose every
      // heading did, would otherwise be left standing as empty furniture. The
      // counts follow too: a heading reading 638 above a list of nine is
      // worse than no count at all.
      for (const kind of box.querySelectorAll('.cmp-kind')) {
        let live = 0;
        for (const h of kind.querySelectorAll('h3')) {
          const list = h.nextElementSibling;
          const here = [...list.children].filter((el) => !el.hidden).length;
          h.hidden = list.hidden = !here;
          h.querySelector('.count').textContent = num(here);
          live += here;
        }
        kind.hidden = !live;
        kind.querySelector('h2 .count').textContent = num(live);
      }
      count.textContent = q || op
        ? (shown ? `${num(shown)} of ${num(units.length)}` : 'no matches')
        : '';
    };

    let pending;
    input.addEventListener('input', () => {
      clearTimeout(pending);
      pending = setTimeout(apply, 60);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        e.stopPropagation();
        input.value = '';
        apply();
      }
    });
    ops.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-op]');
      if (!btn) return;
      for (const el of ops.children) el.setAttribute('aria-pressed', String(el === btn));
      op = btn.dataset.op;
      apply();
    });
    if (input.value) apply();
  }

  /** Put the pair in the URL, so a comparison can be linked to. */
  function store() {
    const q = new URLSearchParams(location.search);
    q.set('from', from);
    q.set('to', to);
    history.replaceState(null, '', `${location.pathname}?${q}`);
  }

  loadIndex().then((idx) => {
    index = idx;
    fill(fromSel, from);
    fill(toSel, to);
    bar.hidden = false;
    store();
    draw();

    fromSel.addEventListener('change', () => { from = fromSel.value; store(); draw(); });
    toSel.addEventListener('change', () => { to = toSel.value; store(); draw(); });
    document.getElementById('cmpSwap')?.addEventListener('click', () => {
      [from, to] = [to, from];
      fromSel.value = from;
      toSel.value = to;
      store();
      draw();
    });
    // Back and forward through shared or edited links.
    addEventListener('popstate', () => {
      ({ from, to } = read());
      fromSel.value = from;
      toSel.value = to;
      draw();
    });
  }).catch(() => {
    box.setAttribute('aria-busy', 'false');
    box.innerHTML = '<p class="muted">The build index could not be loaded, so there is nothing to compare. ' +
      'Each build\'s changes against the one before it are on its own changelog.</p>';
  });
}
