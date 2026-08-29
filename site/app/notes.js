/* Community notes.

   Only 4,869 of 42,927 members carry a doc comment, and what is known about
   the rest sits in Discord rather than in the sources. site/notes.json is
   that knowledge, keyed by Type or Type.Member, and it is fetched for the
   same reason the history badges are: a page carries no build stamp and
   archived bodies are shared between builds, so anything maintained outside
   the sources would otherwise freeze into whichever build first rendered the
   page. Overload anchors (Foo-2) share the note of the name they dedupe.

   Every note also carries the way to change it, and every declaration
   without one the way to write it: the moment someone works out what a
   member does is the moment to say so, and it is not the moment to go
   looking for a JSON file. */

import { $, REPO, ROOT, pageType } from './dom.js';

/* Where a note gets written. GitHub can prefill a new issue but not an
   edit to a file that already exists, so this opens an issue holding the
   key and whatever the note says today, and names site/notes.json for
   anyone who would rather go straight to the pull request. */
function contribHref(key, current) {
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
}

function editEl(key, current) {
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
}

/* The type's own invitation, and the only one on the page that is not
   waiting behind a hover — but shown only where the sources say nothing
   about it either, since a class carrying a doc comment is not the one
   crying out for a note. */
function askEl(key) {
  const p = document.createElement('p');
  p.className = 'note-ask';
  const a = document.createElement('a');
  a.href = contribHref(key, null);
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'Suggest a community note';
  p.append(document.createTextNode('Undocumented in the sources. '), a);
  return p;
}

// Marked as community writing, because the docs it sits beside are
// Bohemia's. Built as nodes rather than markup so a contributor can
// write `Class.Method` without the note being able to inject anything.
function noteEl(text, key) {
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
}

export function initNotes() {
  const main = $('.main');
  if (!pageType || !main) return;

  const type = pageType.name;
  const keyFor = (el) => `${type}.${el.id.replace(/-\d+$/, '')}`;

  fetch(ROOT + 'assets/notes.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((notes) => {
      if (!notes) return;
      const noteFor = (key) => (typeof notes[key] === 'string' && notes[key] ? notes[key] : null);

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
     the same bargain the signature copy button strikes in copy.js, and for
     the same reason: nine hundred members are nine hundred buttons only one
     of which is ever in use. Wired up outside the fetch, so a notes.json
     that fails to load still leaves the way to write one. */
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
