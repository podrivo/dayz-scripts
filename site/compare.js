/* Comparing two builds.
   ------------------------------------------------------------------------
   Loaded on demand by site/app.js when /changelog/ is the page, so the several
   hundred thousand pages that are not this one do not pay for it.

   49 builds are 1,176 pairs, and the obvious next ask — three builds at once —
   is 18,424 triples, so there is no version of this that is a page per
   comparison. The pair is chosen here rather than at build time.

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
  { key: 'class', label: 'Classes', url: (n) => `classes/${n}/` },
  { key: 'enum', label: 'Enums', url: (n) => `enum/${n}/` },
  { key: 'func', label: 'Global functions', url: (n) => `globals/functions/#${n}` },
  { key: 'const', label: 'Constants', url: (n) => `globals/constants/#${n}` },
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
function foldRow(members, row, build) {
  const [op, name] = row;
  let m = members.get(name);
  if (!m) members.set(name, (m = { was: op === ADDED ? undefined : row[2] }));
  m.now = op === REMOVED ? undefined : op === ADDED ? row[2] : row[3];
  if (build && !m.builds?.includes(build)) (m.builds ||= []).push(build);
}

/** The net rows: what differs between the two endpoints, and nothing else. */
function netRows(members) {
  const rows = [];
  for (const [name, m] of members) {
    let row;
    if (m.was === undefined && m.now !== undefined) row = [ADDED, name, m.now];
    else if (m.was !== undefined && m.now === undefined) row = [REMOVED, name, m.was];
    else if (m.was !== m.now) row = [CHANGED, name, m.was, m.now];
    if (row) {
      if (m.builds) row.builds = m.builds;
      rows.push(row);
    }
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
      const build = step?.kinds ? step.build : undefined;
      const k = (step?.kinds || step)?.[key];
      if (!k) continue;
      for (const name of k.added) {
        const e = at(name, false);
        e.now = true;
        if (build) e.build = build;
      }
      for (const name of k.removed) {
        const e = at(name, true);
        e.now = false;
        if (build) e.build = build;
      }
      for (const entry of k.changed) {
        const e = at(entry.name, true);
        e.now = true;
        for (const row of entry.rows) foldRow(e.members, row, build);
      }
    }

    const added = [];
    const removed = [];
    const changed = [];
    const landed = { added: {}, removed: {} };
    for (const [name, e] of state) {
      if (!e.was && e.now) {
        added.push(name);
        if (e.build) landed.added[name] = e.build;
      } else if (e.was && !e.now) {
        removed.push(name);
        if (e.build) landed.removed[name] = e.build;
      }
      else if (e.was && e.now) {
        const rows = netRows(e.members);
        if (rows.length) changed.push({ name, rows });
      }
      // Absent at both ends: it appeared and was gone again inside the range.
    }
    out[key] = canonical({
      added,
      removed,
      changed,
      ...(Object.keys(landed.added).length || Object.keys(landed.removed).length ? { landed } : {}),
    });
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

const gap = '<span class="cmp-gap" aria-hidden="true">—</span>';

function buildsHtml(builds) {
  if (!builds?.length) return '';
  return `<span class="cmp-builds" title="Change landed in ${esc(builds.join(', '))}">` +
    builds.map((build) => `<span class="cmp-build">${esc(build)}</span>`).join('') +
    '</span>';
}

function pairHtml(row, showBuilds) {
  const left = row[0] === ADDED ? gap : `<code class="old">${esc(row[2])}</code>`;
  const right = row[0] === REMOVED ? gap : `<code>${esc(row[0] === CHANGED ? row[3] : row[2])}</code>`;
  const op = row[0] === ADDED ? 'added' : row[0] === REMOVED ? 'removed' : 'changed';
  return `<div class="cmp-pair ${op}"><div class="cmp-col">${left}</div><div class="cmp-col">${right}</div>` +
    `${showBuilds ? buildsHtml(row.builds) : ''}</div>`;
}

/**
 * One name, as a filterable unit. `data-op` is what the totals select, so
 * narrowing never re-renders anything.
 */
function nameHtml(kind, name, op, prefix, build) {
  return `<a class="cmp-name" data-op="${op}" href="${prefix}${kind.url(name)}"><span>${esc(name)}</span>${buildsHtml(build ? [build] : null)}</a>`;
}

function changedHtml(kind, entry, prefix) {
  const builds = [...new Set(entry.rows.flatMap((row) => row.builds || []))].sort(cmp);
  const pairs = entry.rows.map((row) => pairHtml(row, entry.rows.length > 1)).join('');
  const link = `<a href="${prefix}${kind.url(entry.name)}">${esc(entry.name)}</a>`;
  const heading = `${link} ${buildsHtml(builds)}`;
  const count = entry.rows.length > 1 ? ` <span class="count">${entry.rows.length}</span>` : '';
  return `<details class="cmp-unit cmp-change" data-op="changed"><summary>${heading}${count}</summary>${pairs}</details>`;
}

function colHtml(op, list, kind, prefix, landed) {
  const names = list.length
    ? `<div class="namegrid">${list.map((n) => nameHtml(kind, n, op, prefix, landed?.[n])).join('')}</div>`
    : '<p class="cmp-empty">None</p>';
  return `<div class="cmp-col" data-op="${op}">
<h3 data-op="${op}">${OPS[op].label} <span class="count">${num(list.length)}</span></h3>
${names}
</div>`;
}

/**
 * `from` and `to` rather than older and newer: the diff is always expressed in
 * the direction the two pickers were left in, so when they are the other way
 * round it is `from` that holds the newer build.
 *
 * Added names sit under To, removed ones under From — the two columns are the
 * two cards above them, the way a comparison table puts each value under the
 * product it belongs to.
 */
function groupsHtml(diff, fromPrefix, toPrefix) {
  return KINDS
    .map((kind) => {
      const k = diff[kind.key];
      const total = k.added.length + k.removed.length + k.changed.length;
      if (!total) return '';

      const parts = [];
      if (k.added.length || k.removed.length) {
        parts.push(`<div class="cmp-split">
${colHtml('removed', k.removed, kind, fromPrefix, k.landed?.removed)}
${colHtml('added', k.added, kind, toPrefix, k.landed?.added)}
</div>`);
      }
      if (k.changed.length) {
        parts.push(`<h3 data-op="changed">Changed <span class="count">${num(k.changed.length)}</span></h3>
<div class="cmp-pair-head" aria-hidden="true"><span>From</span><span>To</span></div>
<div class="cmp-list">${k.changed.map((e) => changedHtml(kind, e, toPrefix)).join('')}</div>`);
      }
      return `<section class="cmp-kind" data-kind="${kind.key}">
<h2>${esc(kind.label)} <span class="count">${num(total)}</span></h2>
${parts.join('\n')}
</section>`;
    })
    .filter(Boolean)
    .join('\n');
}

/* ---------- page ---------------------------------------------------------- */

export function initCompare({ builds, fmtDate, current }) {
  const box = document.getElementById('compare');
  const bar = document.getElementById('cmpBar');
  const fromSel = document.getElementById('cmpFrom');
  const toSel = document.getElementById('cmpTo');
  const resetBtn = document.getElementById('cmpReset');
  if (!box || !bar) return;

  const latest = builds[0].build;
  // Newest first is how the picker reads; oldest first is what "from" and "to"
  // mean, and what a run of adjacent diffs has to be folded in.
  const order = builds.map((b) => b.build).reverse();
  const known = new Set(order);
  const byBuild = new Map(builds.map((b) => [b.build, b]));
  const here = current && known.has(current.build) ? current.build : latest;
  const STORE = 'cmp-pair';

  /** This build against the one before it — the old per-build changelog pair. */
  const defaults = () => {
    const i = order.indexOf(here);
    return { from: i > 0 ? order[i - 1] : here, to: here };
  };

  const loadSaved = () => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (s && known.has(s.from) && known.has(s.to)) return s;
    } catch { /* private mode */ }
    return null;
  };

  const atDefault = () => {
    const d = defaults();
    return from === d.from && to === d.to;
  };
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
        `${esc(b.name || b.build)} (${esc(b.build.split('.').pop())}) — ${esc(fmtDate(b.date))}</option>`;
    }
    sel.innerHTML = html + (version ? '</optgroup>' : '');
    face(sel);
  };

  const face = (sel) => {
    const el = sel.parentElement;
    const b = byBuild.get(sel.value);
    if (el?.classList.contains('cmp-sel')) el.dataset.face = b?.name || sel.value;
  };

  /** URL, then the last pair the reader picked, then this version's changelog. */
  const read = () => {
    const q = new URLSearchParams(location.search);
    const fromQ = q.get('from');
    const toQ = q.get('to');
    if (known.has(fromQ) && known.has(toQ)) return { from: fromQ, to: toQ };
    return loadSaved() || defaults();
  };

  let { from, to } = read();
  let drawing = 0; // guards against a slow fetch landing after a newer pick

  function stampPair() {
    const span = document.getElementById('cmpSpan');
    if (span) {
      span.textContent = from === to ? 'Same build' : '';
      span.hidden = from !== to;
    }
    if (resetBtn) {
      const idle = atDefault();
      const ic = resetBtn.querySelector('.ic');
      resetBtn.disabled = idle;
      ic?.classList.toggle('ic-swap', idle);
      ic?.classList.toggle('ic-reset', !idle);
      if (idle) {
        resetBtn.removeAttribute('title');
        resetBtn.removeAttribute('aria-label');
        resetBtn.setAttribute('aria-hidden', 'true');
      } else {
        resetBtn.title = 'Reset';
        resetBtn.setAttribute('aria-label', 'Reset');
        resetBtn.removeAttribute('aria-hidden');
      }
    }
  }

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

    let diff = foldDiffs(steps.map((s, i) => ({ build: runs[i], kinds: s.kinds })));
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
    const a = byBuild.get(from);
    const b = byBuild.get(to);
    const days = a?.date && b?.date
      ? Math.abs(Math.round((Date.parse(`${b.date}T00:00:00Z`) - Date.parse(`${a.date}T00:00:00Z`)) / 864e5))
      : 0;
    const gap = Math.abs(order.indexOf(from) - order.indexOf(to));
    const range = a?.date && b?.date ? `${fmtDate(a.date)} – ${fmtDate(b.date)}` : '';
    const fact = (n, w) => `<span><strong>${num(n)}</strong> ${n === 1 ? w : `${w}s`}</span>`;
    const time = `<section class="cmp-time" aria-label="Time between builds"${range ? ` title="${esc(range)}"` : ''}>` +
      fact(days, 'day') +
      fact(Math.round(days / 7), 'week') +
      fact(Math.round(days / 30.4375), 'month') +
      fact(gap, 'build') +
      `</section>`;

    box.innerHTML = `
<section class="stats cmp-ops" id="cmpOps" aria-label="Filter by what happened">${ops
      .map(([op, label, n], i) => `<button type="button" class="stat" data-op="${esc(op)}" aria-pressed="${!i}"` +
        `${op ? ` title="${esc(SCOPE)}"` : ''}><strong>${num(n)}</strong><span>${esc(label)}</span></button>`)
      .join('')}</section>
${time}
${groupsHtml(diff, prefixFor(from, latest), prefixFor(to, latest))}`;
    bindFilter();
  }

  /* The totals above narrow what the block just built to one of the three
     things that happened. Pure show/hide — nothing is re-rendered. */
  function bindFilter() {
    const ops = document.getElementById('cmpOps');
    const units = [...box.querySelectorAll('.cmp-name, .cmp-unit')];
    let op = '';

    const apply = () => {
      for (const el of units) {
        el.hidden = !!(op && el.dataset.op !== op);
      }
      // A heading whose whole list filtered away, and a kind whose every
      // heading did, would otherwise be left standing as empty furniture. The
      // counts follow too: a heading reading 638 above a list of nine is worse
      // than no count at all.
      for (const kind of box.querySelectorAll('.cmp-kind')) {
        let live = 0;
        for (const col of kind.querySelectorAll('.cmp-split > .cmp-col')) {
          const colOp = col.dataset.op;
          if (op && colOp && colOp !== op) {
            col.hidden = true;
            continue;
          }
          const names = [...col.querySelectorAll('.cmp-name')];
          const here = names.filter((el) => !el.hidden).length;
          const count = col.querySelector('.count');
          if (count) count.textContent = num(here);
          col.hidden = names.length ? !here : !!op;
          live += here;
        }
        const split = kind.querySelector('.cmp-split');
        if (split) split.hidden = [...split.children].every((c) => c.hidden);

        const changedHead = kind.querySelector(':scope > h3[data-op="changed"]');
        const pairHead = changedHead?.nextElementSibling;
        const changedList = pairHead?.classList.contains('cmp-pair-head')
          ? pairHead.nextElementSibling
          : pairHead;
        if (changedHead && changedList) {
          const here = [...changedList.querySelectorAll('.cmp-unit')].filter((el) => !el.hidden).length;
          const hide = !here || (op && op !== 'changed');
          changedHead.hidden = changedList.hidden = hide;
          if (pairHead?.classList.contains('cmp-pair-head')) pairHead.hidden = hide;
          const count = changedHead.querySelector('.count');
          if (count) count.textContent = num(here);
          if (!hide) live += here;
        }
        kind.hidden = !live;
        kind.querySelector('h2 .count').textContent = num(live);
      }
    };

    ops.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-op]');
      if (!btn) return;
      for (const el of ops.children) el.setAttribute('aria-pressed', String(el === btn));
      op = btn.dataset.op;
      apply();
      try { globalThis.gtag?.('event', 'compare_filter', { filter_op: op || 'all' }); } catch { /* blocked or absent */ }
      try { globalThis.posthog?.capture?.('compare_filter', { filter_op: op || 'all' }); } catch { /* blocked or absent */ }
    });
  }

  /** Put the pair in the URL and remember it. The default pair stays unstated. */
  function store() {
    const q = new URLSearchParams(location.search);
    if (atDefault()) {
      q.delete('from');
      q.delete('to');
      try { localStorage.removeItem(STORE); } catch { /* private mode */ }
    } else {
      q.set('from', from);
      q.set('to', to);
      try { localStorage.setItem(STORE, JSON.stringify({ from, to })); } catch { /* private mode */ }
    }
    const qs = q.toString();
    history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  }

  fill(fromSel, from);
  fill(toSel, to);
  bar.hidden = false;
  stampPair();
  store();
  draw();

  /**
   * Move one side of the pair to a build, and the other side out of its way if
   * that is where it already was. Choosing the build facing you would otherwise
   * leave the page comparing something to itself, which is not a comparison and
   * not what the choice meant; stepping the other side back to where this one
   * was keeps the pair two builds without having to grey half of each list out.
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
    face(fromSel);
    face(toSel);
    stampPair();
    store();
    draw();
    try { globalThis.gtag?.('event', 'compare_builds', { from_build: from, to_build: to }); } catch { /* blocked or absent */ }
    try { globalThis.posthog?.capture?.('compare_builds', { from_build: from, to_build: to }); } catch { /* blocked or absent */ }
  }

  fromSel.addEventListener('change', () => choose(fromSel.value, true));
  toSel.addEventListener('change', () => choose(toSel.value, false));
  resetBtn?.addEventListener('click', () => {
    ({ from, to } = defaults());
    fromSel.value = from;
    toSel.value = to;
    face(fromSel);
    face(toSel);
    stampPair();
    store();
    draw();
  });
  // Back and forward through shared or edited links.
  addEventListener('popstate', () => {
    ({ from, to } = read());
    fromSel.value = from;
    toSel.value = to;
    face(fromSel);
    face(toSel);
    stampPair();
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
      changed: k.changed.map((e) => {
        const rows = e.rows.map((r) => {
          const row = r[0] === CHANGED
            ? [CHANGED, r[1], r[3], r[2]]
            : [r[0] === ADDED ? REMOVED : ADDED, r[1], r[2]];
          if (r.builds) row.builds = r.builds;
          return row;
        });
        return { name: e.name, rows };
      }),
      ...(k.landed ? { landed: { added: k.landed.removed, removed: k.landed.added } } : {}),
    });
  }
  return out;
}
