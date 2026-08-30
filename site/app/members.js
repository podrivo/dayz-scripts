/* The two pages whose rows are composed in the browser.

   Both are lists of "which classes declare this name", which search.json
   already answers for the whole build — so the generator ships the shell and
   these fill it in. See renderClassMembers in src/generate/render/class.js
   for what that saves. */

import { $, BASE, anchorOf, esc } from './dom.js';
import { index, loadIndex } from './search-index.js';
import { rescanFilter } from './filter.js';

/** All members of a class: its own and everything it inherits. */
export function initAllMembers() {
  const allTable = $('#allMembers');
  if (!allTable) return;

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
        return /* html */ `<tr><td><a href="${BASE}classes/${from}/#${anchorOf(name)}"><code>${esc(name)}${r.method ? '()' : ''}</code></a></td><td><a href="${BASE}classes/${from}/">${esc(from)}</a></td><td>${badge}</td></tr>`;
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

/** The data-fields index: every member name of the build, by initial.
 *  A letter page paints the whole letter. The landing page opens on A. */
export function initFieldsIndex() {
  const fieldsList = $('#fieldsList');
  if (!fieldsList) return;

  const kind = fieldsList.dataset.kind;
  const letter = fieldsList.dataset.letter || '';
  const letterOf = (n) => (/^[a-z]/i.test(n) ? n[0].toLowerCase() : '_');
  const filter = $('#pageFilter');
  const fallback = $('.members-fallback');
  const hint = 'Type to find a member, or pick a letter.';

  const collect = (pred) => {
    const owners = new Map();
    const add = (ci, name) => {
      if (!pred(name)) return;
      const cls = index.classes[ci];
      const list = owners.get(name);
      if (list) {
        if (!list.includes(cls)) list.push(cls);
      } else owners.set(name, [cls]);
    };
    if (kind !== 'variables') for (const [ci, n] of index.methods || []) add(ci, n);
    if (kind !== 'functions') for (const [ci, n] of index.vars || []) add(ci, n);
    return owners;
  };

  const paint = (owners) => {
    const names = [...owners.keys()].sort((a, b) => a.localeCompare(b));
    fieldsList.innerHTML = names
      .map((name) => {
        const dd = owners.get(name).map((c) => `<a href="${BASE}classes/${c}/#${anchorOf(name)}">${esc(c)}</a>`).join(' ');
        return /* html */ `<dt><code>${esc(name)}</code></dt><dd>${dd}</dd>`;
      })
      .join('');
    if (fallback) {
      fallback.textContent = names.length ? `${names.length.toLocaleString()} names.` : hint;
    }
    rescanFilter();
    return names.length;
  };

  loadIndex().then(() => {
    if (letter) {
      const n = paint(collect((name) => letterOf(name) === letter));
      $('h1').insertAdjacentHTML('beforeend', ` <span class="count">${n.toLocaleString()}</span>`);
      if (filter) filter.placeholder = `Filter ${n.toLocaleString()} fields…`;
      return;
    }

    const MIN = 2;
    const run = () => {
      const q = (filter?.value || '').trim().toLowerCase();
      if (q.length < MIN) {
        fieldsList.innerHTML = '';
        if (fallback) fallback.textContent = hint;
        rescanFilter();
        return;
      }
      paint(collect((name) => name.toLowerCase().includes(q)));
    };
    filter?.addEventListener('input', run);
    run();
  }).catch(() => {
    if (fallback) fallback.textContent = 'The list could not be loaded.';
  });
}
