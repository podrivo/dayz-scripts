/* What happened to this type: the badges, and the timeline.

   When a class or member first appeared, and when a signature last changed.
   The pages cannot carry a build stamp (see layout() in src/generate/html.js),
   so this is fetched from /assets/history.json — the same adjacent diffs
   /changelog/ folds, packed as indices into the newest-first build list.
   Events newer than the build being viewed stay off.

   history.json only says first and last, which is all a badge can wear. The
   whole story — every build that touched this type, member by member — is in
   /assets/timelines.json, packed the same way, and the History button beside
   the title fetches that on demand and lays it out in a panel. */

import { $, ROOT, esc, fmtDate, anchorOf, pageType, track } from './dom.js';
import { closeOthers, onOverlay } from './overlay.js';
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

function titleActions(title) {
  let el = $('.title-actions', title);
  if (!el) {
    el = document.createElement('span');
    el.className = 'title-actions';
    el.hidden = true;
    title.append(el);
  }
  return el;
}

export function initHistory() {
  const main = $('.main');
  if (!pageType || !main) return;

  const title = $('h1.class-title', main);
  const actions = title && titleActions(title);

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

    if (actions && visible(rec.added)) {
      const b = addedBadge(rec.added);
      const llm = b && $('.copy-llm', actions);
      if (b) (llm ? actions.insertBefore(b, llm) : actions.append(b));
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
  }).catch(() => {}).finally(() => {
    if (actions) actions.hidden = false;
  });
}

/* ---------- the timeline ----------
   A 24px History button beside the title, on every class and enum page.
   Opening it fetches timelines.json and slides a panel in from the right.
   Fetched rather than shipped for the same reason the badges are, and on
   demand rather than on load because most visits never ask.

   Only events at or before the build being viewed are shown, so an
   archived page tells the story as it stood then. */

/** What a row says happened, matching src/generate/diff.js. */
const OPS = { '+': ['added', '+'], '-': ['removed', '−'], '~': ['changed', '±'] };

function addTimeline(main, hist, builds, rec, here) {
  const title = $('h1.class-title', main);
  if (!title) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hist-btn';
  btn.textContent = 'Changes';
  btn.setAttribute('aria-label', 'Changes');
  btn.setAttribute('aria-expanded', 'false');
  btn.dataset.tip = 'What changed in this type';
  const actions = titleActions(title);
  const llm = $('.copy-llm', actions);
  if (llm) actions.insertBefore(btn, llm);
  else actions.append(btn);

  const wrap = document.createElement('div');
  wrap.className = 'hist-panel';
  wrap.setAttribute('aria-hidden', 'true');
  const box = document.createElement('div');
  box.className = 'hist-panel-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Changes');
  box.tabIndex = -1;
  const bar = document.createElement('div');
  bar.className = 'hist-bar';
  const heading = document.createElement('p');
  heading.className = 'hist-title';
  heading.textContent = 'Changes';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'hist-close';
  closeBtn.setAttribute('aria-label', 'Close');
  const closeIc = document.createElement('i');
  closeIc.className = 'ic ic-x';
  closeIc.setAttribute('aria-hidden', 'true');
  closeBtn.append(closeIc);
  bar.append(heading, closeBtn);
  const body = document.createElement('div');
  body.className = 'th-body';
  box.append(bar, body);
  wrap.append(box);
  document.body.append(wrap);

  const oldest = hist.builds.length - 1;
  // The run to show: from the build being viewed back to where the type
  // appeared. When the record cannot bound it — the type predates tracking,
  // or (after a remove-and-readd) the record names a build newer than this
  // page's — the whole span back to the oldest build does. The oldest
  // build has no diff, so nothing is packed for it.
  const stop = rec.added >= here && rec.added < oldest ? rec.added : oldest - 1;
  const n = (hist.changes?.[pageType.kind]?.[pageType.name] || [])
    .filter((i) => i >= here && i <= stop).length;
  const stamp = (el) => {
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(n);
    el.replaceChildren('Changes ', count);
  };
  stamp(btn);
  stamp(heading);
  btn.setAttribute('aria-label', `Changes, ${n} builds`);

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

  // First glance is five. A click with a long tail opens ten, and a step
  // never leaves a single row behind — six remaining show as six, eleven
  // as eleven — so the button always pays for the click.
  const step = (remaining, first) => {
    const n = first ? 5 : 10;
    return remaining <= n + 1 ? remaining : n;
  };
  const moreLabel = (hidden) => {
    const n = step(hidden);
    return n < hidden ? `See ${n} more` : `See all (${hidden})`;
  };

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
    const shown = step(rows.length, true);
    const list = rows.map((row, i) => rowHtml(row, i >= shown)).join('');
    const more = rows.length > shown
      ? `<button type="button" class="th-more">${moreLabel(rows.length - shown)}</button>`
      : '';
    return `<div class="th-build">${head}${born}${list}${more}</div>`;
  };

  async function load() {
    const data = await fetch(ROOT + 'assets/timelines.json')
      .then((r) => (r.ok ? r.json() : null));
    if (!data) throw new Error('missing timelines');

    const entries = [];
    for (const [idx, added, rows] of data[pageType.kind]?.[pageType.name] || []) {
      if (idx < here || idx > stop) continue;
      entries.push({ idx, added, rows });
    }

    // Nothing said "added", so the type was already in the oldest build the
    // run reached back to — for this page, the oldest there is.
    const floor = builds[oldest];
    const tail = entries.some((e) => e.added)
      ? ''
      : `<p class="th-tail">${entries.length ? 'Present' : 'Unchanged'} in every tracked build, from ${esc(floor?.name || '')} (${esc(floor?.build || '')}).</p>`;

    body.innerHTML = entries.map(entryHtml).join('') + tail;
  }

  // "See more" unhides the next handful in its own build and keeps or drops
  // itself by what is left. One delegated listener, since the buttons are
  // rebuilt with the body.
  body.addEventListener('click', (e) => {
    const more = e.target.closest('.th-more');
    if (more) {
      e.stopPropagation();
      const hidden = [...more.closest('.th-build').querySelectorAll('.th-row[hidden]')];
      const n = step(hidden.length);
      for (const row of hidden.slice(0, n)) row.hidden = false;
      if (hidden.length > n) more.textContent = moreLabel(hidden.length - n);
      else more.remove();
      return;
    }
    if (e.target.closest('.th-link')) close();
  });

  let state = 'idle';
  let from = null;

  function open() {
    if (wrap.classList.contains('on')) return;
    closeOthers(close);
    from = document.activeElement;
    wrap.classList.add('on');
    wrap.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('hist-open');
    track('open_history');
    box.focus();
    if (state !== 'idle') return;
    state = 'loading';
    body.innerHTML = '<p class="muted">Loading the history…</p>';
    load().then(
      () => { state = 'done'; },
      () => {
        state = 'idle';
        body.innerHTML = '<p class="muted">Part of the history could not be loaded. Close and reopen to try again.</p>';
      }
    );
  }

  function close() {
    if (!wrap.classList.contains('on')) return;
    wrap.classList.remove('on');
    wrap.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('hist-open');
    from?.focus?.();
  }

  onOverlay(close);
  btn.addEventListener('click', () => (wrap.classList.contains('on') ? close() : open()));
  closeBtn.addEventListener('click', close);
  wrap.addEventListener('click', (e) => {
    if (!e.target.closest('.hist-panel-box')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
