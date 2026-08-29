/* Added / changed badges.

   When a class or member first appeared, and when a signature last changed.
   The pages cannot carry a build stamp (see layout() in src/generate/html.js),
   so this is fetched from /assets/history.json — the same adjacent diffs
   /changelog/ folds, packed as indices into the newest-first build list.
   Events newer than the build being viewed stay off. */

import { $, ROOT, pageType } from './dom.js';
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
