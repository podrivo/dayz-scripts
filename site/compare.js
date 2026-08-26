/* Comparing two builds.
   ------------------------------------------------------------------------
   Loaded on demand by site/app.js when /compare/ is the page, so the several
   hundred thousand pages that are not this one do not pay for it.

   /changes/ shows one build against the one before it, from a diff the
   generator already had in hand. This shows any two builds against each
   other, and does the choosing here rather than at build time: 49 builds are
   1,176 pairs, and the obvious next ask — three builds at once — is 18,424
   triples, so there is no version of this that is a page per comparison.

   Nothing new is computed to make that work. Every build already ships the
   diff against its predecessor as diff.json (see src/generate/routes.js), and
   a run of those folded together is exactly the diff between its endpoints —
   see foldDiffs below for why that is an identity and not an approximation.
   The sizes are what make it worth doing in a browser: a typical adjacent
   diff is 25 KB, 4 KB over the wire, and the widest span on record — 1.19 to
   1.29, 48 of them — is about 250 KB gzipped in total, less than the search
   index this same page already loads. */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]);
const num = (n) => n.toLocaleString('en-US');

/* What a row says happened to one member, matching src/generate/diff.js. */
const ADDED = '+';
const REMOVED = '-';
const CHANGED = '~';

/* The kinds a diff is keyed by, in the order the site lists them. The same
   table as DIFF_KINDS in src/generate/diff.js, which this file cannot import
   from; the keys are the ones diff.json uses, so a mismatch would show up as
   an empty section rather than as wrong data. */
const KINDS = [
  { key: 'class', label: 'Classes', url: (n) => `class/${n}/` },
  { key: 'enum', label: 'Enums', url: (n) => `enum/${n}/` },
  { key: 'func', label: 'Global functions', url: (n) => `globals/functions/#${n}` },
  { key: 'const', label: 'Constants', url: (n) => `globals/variables/#${n}` },
  { key: 'typedef', label: 'Typedefs', url: (n) => `globals/typedefs/#${n}` },
  { key: 'macro', label: 'Macros', url: (n) => `globals/macros/#${n}` },
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

/* ---------- folding ------------------------------------------------------- */

/**
 * What one member was at the start of a run of diffs, and what it is at the
 * end. A row says both — "added" means it was absent and is now this, "changed"
 * carries the before and the after — so the first row to mention a member
 * fixes where it started and every row moves where it ends up.
 */
function foldRow(members, row) {
  const [op, name] = row;
  let m = members.get(name);
  if (!m) members.set(name, (m = { was: op === ADDED ? undefined : row[2] }));
  m.now = op === REMOVED ? undefined : op === ADDED ? row[2] : row[3];
}

/** The net rows: what differs between the two endpoints, and nothing else. */
function netRows(members) {
  const rows = [];
  for (const [name, m] of members) {
    if (m.was === undefined && m.now !== undefined) rows.push([ADDED, name, m.now]);
    else if (m.was !== undefined && m.now === undefined) rows.push([REMOVED, name, m.was]);
    else if (m.was !== m.now) rows.push([CHANGED, name, m.was, m.now]);
    // Present and identical at both ends: it moved and moved back, and a
    // comparison of the endpoints has nothing to say about it.
  }
  return rows;
}

/**
 * A run of adjacent diffs, oldest first, as the single diff between the build
 * before the first and the build of the last.
 *
 * This is exact rather than an estimate, because an adjacent diff mentions a
 * name only when something about it changed: anything absent from all of them
 * is identical at both ends by construction, and anything present carries
 * enough to say what it was before and what it became. Folding also knows
 * which build each change landed in, which a diff of the two endpoints could
 * not — the thing a third column would be built on.
 *
 * One inexactness, worth naming: a class dropped and reintroduced inside the
 * range is reported as unchanged if its members happen to line up, because the
 * builds that removed and re-added it listed no members at all. Both endpoints
 * do have it, so calling it unchanged is defensible; it is not something the
 * data can do better.
 */
export function foldDiffs(steps) {
  const out = {};
  for (const { key } of KINDS) {
    const state = new Map(); // name -> { was, now, members }
    const at = (name, present) => {
      let e = state.get(name);
      if (!e) state.set(name, (e = { was: present, now: present, members: new Map() }));
      return e;
    };

    for (const step of steps) {
      const k = step?.[key];
      if (!k) continue;
      for (const name of k.added) at(name, false).now = true;
      for (const name of k.removed) at(name, true).now = false;
      for (const entry of k.changed) {
        const e = at(entry.name, true);
        e.now = true;
        for (const row of entry.rows) foldRow(e.members, row);
      }
    }

    const added = [];
    const removed = [];
    const changed = [];
    for (const [name, e] of state) {
      if (!e.was && e.now) added.push(name);
      else if (e.was && !e.now) removed.push(name);
      else if (e.was && e.now) {
        const rows = netRows(e.members);
        if (rows.length) changed.push({ name, rows });
      }
      // Absent at both ends: it appeared and was gone again inside the range.
    }
    out[key] = canonical({ added, removed, changed });
  }
  return out;
}

const cmp = (a, b) => a.localeCompare(b);
const OP_ORDER = { [ADDED]: 0, [REMOVED]: 1, [CHANGED]: 2 };

/**
 * One kind in the order the generator would have written it: everything gained,
 * then everything lost, then everything that merely moved, alphabetical within
 * each. Both the fold and the inversion below produce their answers in whatever
 * order they happened to visit things, and neither is the order to read them
 * in — nor, when the two ways of reaching the same comparison are compared, the
 * same order as each other.
 */
function canonical(kind) {
  kind.added.sort(cmp);
  kind.removed.sort(cmp);
  kind.changed.sort((a, b) => cmp(a.name, b.name));
  for (const e of kind.changed) {
    e.rows.sort((a, b) => OP_ORDER[a[0]] - OP_ORDER[b[0]] || cmp(a[1], b[1]));
  }
  return kind;
}

/* ---------- rendering ----------------------------------------------------- */

/**
 * Where a name of a given kind lives, in the build it belongs to. Added names
 * only exist in the newer build and removed ones only in the older, so each
 * link has to name its own build rather than the one this page happens to be
 * served from — otherwise half of them 404.
 */
const prefixFor = (build, latest) => `/${build === latest ? '' : `v/${build}/`}`;

function rowHtml(row) {
  const op = row[0] === ADDED ? 'added' : row[0] === REMOVED ? 'removed' : 'changed';
  const body = row[0] === CHANGED
    ? `<code class="old">${esc(row[2])}</code><br><code>${esc(row[3])}</code>`
    : `<code>${esc(row[2])}</code>`;
  return `<tr class="${op}"><td>${OPS[op].sign}</td><td>${body}</td></tr>`;
}

/**
 * One name, as a filterable unit. `data-text` is what the filter matches and
 * `data-op` what the totals select, so narrowing never re-renders anything.
 */
function nameHtml(kind, name, op, prefix) {
  return `<a class="cmp-name" data-op="${op}" data-text="${esc(name.toLowerCase())}"` +
    ` href="${prefix}${kind.url(name)}">${esc(name)}</a>`;
}

function changedHtml(kind, entry, prefix) {
  const rows = entry.rows.map(rowHtml).join('');
  const text = esc(`${entry.name} ${entry.rows.map((r) => r.slice(1).join(' ')).join(' ')}`.toLowerCase());
  const link = `<a href="${prefix}${kind.url(entry.name)}">${esc(entry.name)}</a>`;
  const table = `<table class="list difftable"><tbody>${rows}</tbody></table>`;
  // One before-and-after line is not worth hiding behind a disclosure; a class
  // with nine changed methods is.
  return entry.rows.length > 1
    ? `<details class="diff-class cmp-unit" data-op="changed" data-text="${text}"><summary>${link} <span class="count">${entry.rows.length}</span></summary>${table}</details>`
    : `<div class="diff-flat cmp-unit" data-op="changed" data-text="${text}"><p class="diff-flat-name">${link}</p>${table}</div>`;
}

/**
 * `from` and `to` rather than older and newer: the diff is always expressed in
 * the direction the two pickers were left in, so when they are the other way
 * round it is `from` that holds the newer build.
 */
function groupsHtml(diff, fromPrefix, toPrefix) {
  return KINDS
    .map((kind) => {
      const k = diff[kind.key];
      const total = k.added.length + k.removed.length + k.changed.length;
      if (!total) return '';

      const parts = [];
      for (const [op, list, prefix] of [['added', k.added, toPrefix], ['removed', k.removed, fromPrefix]]) {
        if (!list.length) continue;
        parts.push(`<h3 data-op="${op}">${OPS[op].label} <span class="count">${num(list.length)}</span></h3>
<div class="namegrid">${list.map((n) => nameHtml(kind, n, op, prefix)).join('')}</div>`);
      }
      if (k.changed.length) {
        parts.push(`<h3 data-op="changed">Changed <span class="count">${num(k.changed.length)}</span></h3>
<div class="cmp-list">${k.changed.map((e) => changedHtml(kind, e, toPrefix)).join('')}</div>`);
      }
      return `<div class="cmp-kind" data-kind="${kind.key}">
<h2>${esc(kind.label)} <span class="count">${num(total)}</span></h2>
${parts.join('\n')}
</div>`;
    })
    .filter(Boolean)
    .join('\n');
}

/* ---------- page ---------------------------------------------------------- */

export function initCompare({ builds, fmtDate }) {
  const box = document.getElementById('compare');
  const bar = document.getElementById('cmpBar');
  const fromSel = document.getElementById('cmpFrom');
  const toSel = document.getElementById('cmpTo');
  if (!box || !bar) return;

  const latest = builds[0].build;
  // Newest first is how the picker reads; oldest first is what "from" and "to"
  // mean, and what a run of adjacent diffs has to be folded in.
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
    return { from: pick('from', builds[1]?.build || latest), to: pick('to', latest) };
  };

  let { from, to } = read();
  let drawing = 0; // guards against a slow fetch landing after a newer pick

  // A build's diff.json, once. Switching one end of a comparison re-fetches
  // only the builds the range gained.
  const cache = new Map();
  const diffOf = (build) => {
    if (!cache.has(build)) {
      cache.set(build, fetch(`${prefixFor(build, latest)}diff.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null));
    }
    return cache.get(build);
  };

  /**
   * The builds whose diffs make up a comparison. Build X's diff.json is X
   * against the build before it, so the run that spans A to B is every build
   * after A up to and including B — B's own diff included, A's excluded.
   */
  const span = (older, newer) => order.slice(order.indexOf(older) + 1, order.indexOf(newer) + 1);

  async function draw() {
    const mine = ++drawing;
    const same = from === to;
    // Always fold oldest to newest and invert afterwards if the picks run the
    // other way, so that swapping the two turns one comparison inside out.
    const reversed = order.indexOf(from) > order.indexOf(to);
    const [older, newer] = reversed ? [to, from] : [from, to];
    const runs = same ? [] : span(older, newer);

    if (runs.length > 2) {
      box.innerHTML = `<p class="muted">Comparing ${num(runs.length)} builds of changes…</p>`;
    }
    const steps = await Promise.all(runs.map(diffOf));
    if (mine !== drawing) return; // a newer pick is already on its way

    box.setAttribute('aria-busy', 'false');
    if (steps.some((s) => s === null)) {
      box.innerHTML = '<p class="muted">Part of this comparison could not be loaded. Try a narrower range, or reload.</p>';
      return;
    }

    let diff = foldDiffs(steps.map((s) => s.kinds));
    if (reversed) diff = invert(diff);

    const tally = (op) => KINDS.reduce((n, k) => n + diff[k.key][op].length, 0);
    const totals = { added: tally('added'), removed: tally('removed'), changed: tally('changed') };
    const all = totals.added + totals.removed + totals.changed;

    if (!all) {
      box.innerHTML = `<p class="muted">${same
        ? 'The same build on both sides. Pick two different ones to compare.'
        : 'Nothing in the scripting API differs between these two builds.'}</p>`;
      return;
    }

    // The three totals double as the filter: each one names what it counts, and
    // clicking it shows exactly the things it counted, which is the only way a
    // number spanning six kinds can say which kind it came from.
    const ops = [['', 'Everything', all], ...Object.entries(OPS).map(([op, o]) => [op, o.total, totals[op]])];
    const missing = KINDS
      .filter((k) => !diff[k.key].added.length && !diff[k.key].removed.length && !diff[k.key].changed.length)
      .map((k) => k.label.toLowerCase());

    box.innerHTML = `
<section class="stats cmp-ops" id="cmpOps" aria-label="Filter by what happened">${ops
      .map(([op, label, n], i) => `<button type="button" class="stat" data-op="${esc(op)}" aria-pressed="${!i}"` +
        `${op ? ` title="${esc(SCOPE)}"` : ''}><strong>${num(n)}</strong><span>${esc(label)}</span></button>`)
      .join('')}</section>
<div class="filterbar">
  <input type="search" id="cmpFilter" class="filter-input" placeholder="Filter these changes…" autocomplete="off" spellcheck="false" aria-label="Filter these changes">
  <span class="filter-count" id="cmpCount" aria-live="polite"></span>
</div>
${groupsHtml(diff, prefixFor(from, latest), prefixFor(to, latest))}
${missing.length ? `<p class="muted cmp-none">No changes to ${missing.join(', ')}.</p>` : ''}`;
    bindFilter();
  }

  /* The page filter in site/app.js narrows what the generator put on a page;
     this narrows what the block above just built, and adds the one axis that
     filter has no way to express — which of the three things happened. Both are
     pure show/hide over units that carry their own searchable text. */
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
      // counts follow too: a heading reading 638 above a list of nine is worse
      // than no count at all.
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
  }

  /** Put the pair in the URL, so a comparison can be linked to. */
  function store() {
    const q = new URLSearchParams(location.search);
    q.set('from', from);
    q.set('to', to);
    history.replaceState(null, '', `${location.pathname}?${q}`);
  }

  fill(fromSel, from);
  fill(toSel, to);
  bar.hidden = false;
  store();
  draw();

  /**
   * Move one side of the pair to a build, and the other side out of its way if
   * that is where it already was. Choosing the build facing you would otherwise
   * leave the page comparing something to itself, which is not a comparison and
   * not what the choice meant; stepping the other side back to where this one
   * was keeps the pair two builds without having to grey half of each list out.
   *
   * It also is the swap. Asking for the build already opposite you is the one
   * case where both sides move, and the two ends trading places is what that
   * means, so the button below is this and nothing else.
   */
  function choose(build, isFrom) {
    if (isFrom) {
      if (build === to) to = from;
      from = build;
    } else {
      if (build === from) from = to;
      to = build;
    }
    fromSel.value = from;
    toSel.value = to;
    store();
    draw();
  }

  fromSel.addEventListener('change', () => choose(fromSel.value, true));
  toSel.addEventListener('change', () => choose(toSel.value, false));
  document.getElementById('cmpSwap')?.addEventListener('click', () => choose(to, true));
  // Back and forward through shared or edited links.
  addEventListener('popstate', () => {
    ({ from, to } = read());
    fromSel.value = from;
    toSel.value = to;
    draw();
  });
}

/**
 * The same comparison read the other way round. What the newer build added, a
 * reader walking backwards has lost, so swapping the two picks turns the answer
 * inside out rather than asking a second, unrelated question — which is also
 * why swapping costs nothing and fetches nothing.
 */
export function invert(diff) {
  const out = {};
  for (const { key } of KINDS) {
    const k = diff[key];
    out[key] = canonical({
      added: [...k.removed],
      removed: [...k.added],
      changed: k.changed.map((e) => ({
        name: e.name,
        rows: e.rows.map((r) => (r[0] === CHANGED
          ? [CHANGED, r[1], r[3], r[2]]
          : [r[0] === ADDED ? REMOVED : ADDED, r[1], r[2]])),
      })),
    });
  }
  return out;
}
