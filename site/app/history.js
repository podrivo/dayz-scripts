/* What happened to this type: the badges, and the timeline.

   When a class or member first appeared, and when a signature last changed.
   The pages cannot carry a build stamp (see layout() in src/generate/html.js),
   so this is fetched from /assets/history.json — the same adjacent diffs
   /changelog/ folds, packed as indices into the newest-first build list.
   Events newer than the build being viewed stay off.

   history.json only says first and last, which is all a badge can wear. The
   whole story — every build that touched this type, member by member — is in
   the per-build diff.json sidecars, and the History disclosure below fetches
   the run of them on demand and lays it out as a timeline, the way
   site/compare.js fetches the same files to compare two builds. */

import { $, ROOT, esc, fmtDate, anchorOf, pageType } from './dom.js';
import { current, identity } from './builds.js';

const typeRec = (p) =>
  (p == null ? null : typeof p === 'number' ? { added: p, members: {} } : { added: p[0], members: p[1] || {} });

const memberEv = (p) =>
  (p == null ? null : typeof p === 'number' ? { added: p } : { added: p[0] < 0 ? undefined : p[0], changed: p[1] });

function historyBadge(kind, text, title, href) {
  const a = document.createElement('a');
  a.className = `badge badge-${kind}`;
  a.textContent = text;
  a.title = title;
  a.href = href;
  return a;
}

/** This build against the one before it, on /changelog/. */
const changelogHref = (builds, idx) => {
  const from = builds[idx + 1];
  return from
    ? `/changelog/?from=${encodeURIComponent(from.build)}&to=${encodeURIComponent(builds[idx].build)}`
    : '/changelog/';
};

export function initHistory() {
  const main = $('.main');
  if (!pageType || !main) return;

  Promise.all([
    fetch(ROOT + 'assets/history.json').then((r) => (r.ok ? r.json() : null)),
    identity(),
  ]).then(([hist, builds]) => {
    if (!hist?.builds || !current) return;
    const rec = typeRec(hist[pageType.kind]?.[pageType.name]);
    if (!rec) return;
    const here = hist.builds.indexOf(current.build);
    if (here < 0) return;
    const visible = (i) => i != null && i >= here;
    const pair = (idx) => {
      const b = builds[idx];
      return b ? { b, href: changelogHref(builds, idx) } : null;
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

    addTimeline(main, hist, builds, rec, here);
  }).catch(() => {});
}

/* ---------- the timeline ----------
   A History disclosure beside the badges, on every class and enum page.
   Opening it fetches the diffs and renders every build that touched this
   type, newest first. Fetched rather than shipped for the same reason the
   badges are, and on demand rather than on load because most visits never
   ask: the widest run — a class present since 1.19, viewed at the latest
   build — is the changelog's widest comparison, about 250 KB over the wire.

   Only diffs at or before the build being viewed are fetched at all, so an
   archived page tells the story as it stood then. */

/** What a row says happened, matching src/generate/diff.js. */
const OPS = { '+': ['added', '+'], '-': ['removed', '−'], '~': ['changed', '±'] };

function addTimeline(main, hist, builds, rec, here) {
  const anchor =
    $('.derived', main) || $('.all-members', main) || $('.alt-bases', main) ||
    $('.in-module', main) || $('.chain', main) || $('h1.class-title', main);
  if (!anchor) return;

  const details = document.createElement('details');
  details.className = 'type-history';
  const summary = document.createElement('summary');
  summary.textContent = 'History';
  const body = document.createElement('div');
  body.className = 'th-body';
  details.append(summary, body);
  anchor.after(details);

  const oldest = hist.builds.length - 1;
  // The run to fetch: from the build being viewed back to where the type
  // appeared. When the record cannot bound it — the type predates tracking,
  // or (after a remove-and-readd) the record names a build newer than this
  // page's — the whole span back to the oldest build does. Build diffs are
  // each build against its predecessor, so the oldest build has none.
  const stop = rec.added >= here && rec.added < oldest ? rec.added : oldest - 1;

  // A declaration still on this page gets a link; one that was removed, or an
  // old spelling, is text. Enum rows are anchored by value name, members by
  // the generator's anchor.
  const hrefFor = (name) => {
    const id = pageType.kind === 'enum' ? name : anchorOf(name);
    return document.getElementById(id) ? `#${id}` : null;
  };

  const rowHtml = (row, hidden) => {
    const [op, name] = row;
    const [cls, sign] = OPS[op];
    const linked = (text) => {
      const code = `<code>${esc(text)}</code>`;
      const href = hrefFor(name);
      return href ? `<a class="th-link" href="${href}">${code}</a>` : code;
    };
    const inner = op === '~'
      ? `<span class="th-decl"><code class="old">${esc(row[2])}</code>${linked(row[3])}</span>`
      : op === '+'
        ? linked(row[2])
        : `<code class="old">${esc(row[2])}</code>`;
    return `<div class="th-row th-${cls}"${hidden ? ' hidden' : ''}><span class="th-op" aria-hidden="true">${sign}</span>${inner}</div>`;
  };

  // How many of the rows still hidden to show at once: five, except that a
  // step is never allowed to leave a single row behind — six remaining show
  // as six, so "See more" always pays for the click.
  const step = (remaining) => (remaining <= 6 ? remaining : 5);

  const entryHtml = ({ idx, added, rows }) => {
    const b = builds[idx];
    const head = `<p class="th-head"><a href="${changelogHref(builds, idx)}" title="Everything this build changed, on the changelog">${esc(b.name || b.build)}</a>` +
      `<span class="cmp-build">${esc(b.build.split('.').pop())}</span>` +
      (b.date ? `<span class="th-date">${fmtDate(b.date)}</span>` : '') +
      '</p>';
    const born = added
      ? `<p class="th-new">${pageType.kind === 'class' ? 'Class' : 'Enum'} added in this build.</p>`
      : '';
    // Every row is rendered; the ones past the cap wait, hidden, for the
    // button below them, so seeing more never rebuilds anything.
    const shown = step(rows.length);
    const list = rows.map((row, i) => rowHtml(row, i >= shown)).join('');
    const more = rows.length > shown
      ? `<button type="button" class="th-more">See more (${rows.length - shown})</button>`
      : '';
    return `<div class="th-build">${head}${born}${list}${more}</div>`;
  };

  async function load() {
    const steps = await Promise.all(
      // Newest first, which is the order the timeline reads in.
      Array.from({ length: Math.max(0, stop - here + 1) }, (_, j) => here + j).map((idx) => {
        const b = hist.builds[idx];
        return fetch(idx === 0 ? ROOT + 'diff.json' : `/v/${b}/diff.json`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
          .then((diff) => ({ idx, diff }));
      })
    );
    if (steps.some((s) => s.diff === null)) throw new Error('missing diff');

    const entries = [];
    for (const { idx, diff } of steps) {
      const k = diff.kinds?.[pageType.kind];
      if (!k) continue;
      const added = k.added.includes(pageType.name);
      const rows = k.changed.find((e) => e.name === pageType.name)?.rows || [];
      if (added || rows.length) entries.push({ idx, added, rows });
    }

    // Nothing said "added", so the type was already in the oldest build the
    // run reached back to — for this page, the oldest there is.
    const floor = builds[oldest];
    const tail = entries.some((e) => e.added)
      ? ''
      : `<p class="th-tail">${entries.length ? 'Present' : 'Unchanged'} in every tracked build, from ${esc(floor?.name || '')} (${esc(floor?.build || '')}).</p>`;

    body.innerHTML = entries.map(entryHtml).join('') + tail;
    summary.innerHTML = `History <span class="count">${entries.length}</span>`;
  }

  // "See more" unhides the next handful in its own build and keeps or drops
  // itself by what is left. One delegated listener, since the buttons are
  // rebuilt with the body.
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('.th-more');
    if (!btn) return;
    const hidden = [...btn.closest('.th-build').querySelectorAll('.th-row[hidden]')];
    const n = step(hidden.length);
    for (const row of hidden.slice(0, n)) row.hidden = false;
    if (hidden.length > n) btn.textContent = `See more (${hidden.length - n})`;
    else btn.remove();
  });

  let state = 'idle';
  details.addEventListener('toggle', () => {
    if (!details.open || state !== 'idle') return;
    state = 'loading';
    body.innerHTML = '<p class="muted">Loading the history…</p>';
    load().then(
      () => { state = 'done'; },
      () => {
        // back to idle, so closing and reopening tries again
        state = 'idle';
        body.innerHTML = '<p class="muted">Part of the history could not be loaded. Close and reopen to try again.</p>';
      }
    );
  });
}
