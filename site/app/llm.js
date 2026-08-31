/* Copy the page for an LLM.

   The docs already meet agents at /llms.txt and /api.json, but the more
   common flow is a person pasting into a chat window: "why does my override
   never fire" alongside the class it overrides. Selecting a nine-hundred-
   member page by hand drags in the chrome and drops the community notes, so
   this button hands over the whole page as Markdown in one press.

   Assembled from the DOM at click time rather than shipped with the page,
   for the reason everything else here is (the bytes must stay identical
   across builds) and for one more: by click time the client has stamped in
   what the HTML deliberately leaves out — community notes, "added in"
   badges — and reading the page gets all of it for free. */

import { $, fmtDate, pageType } from './dom.js';
import { copyText } from './copy.js';
import { identity, current } from './builds.js';

const clean = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * An element's text with the page chrome taken out: anchors, copy buttons,
 * the ways to write a note, and the "Community note" tag (the Markdown says
 * it instead). Block elements get a newline so paragraphs stay paragraphs.
 */
function textOf(el) {
  const c = el.cloneNode(true);
  for (const junk of c.querySelectorAll('.anchor, .copy-btn, .hist-btn, .member-src, .note-tag, .note-edit, .note-add')) junk.remove();
  for (const block of c.querySelectorAll('p, div, li, pre, br')) block.append('\n');
  return c.textContent;
}

/** Doc text as indented continuation lines under a member's bullet. */
const docLines = (el, indent = '  ') =>
  textOf(el).split('\n').map(clean).filter(Boolean).map((l) => indent + l);

/** The badges riding an element — build flags, modded, "Added in 1.28". */
const badgesOf = (el) =>
  [...el.querySelectorAll('.badge')].map((b) => clean(b.textContent)).filter(Boolean)
    .map((b) => `[${b}]`).join(' ');

/** One member: its signature, whatever badges it wears, its doc, its note.
    The "Referenced by" and "References" lists stay behind: they are leads to
    follow on the page, not knowledge about the member. */
function memberMd(mem) {
  const sig = $('.member-sig code', mem);
  if (!sig) return '';
  const badges = badgesOf($('.member-sig', mem));
  const lines = [`- \`${clean(sig.textContent)}\`${badges ? ` ${badges}` : ''}`];
  const doc = $('.member-doc', mem);
  if (doc) lines.push(...docLines(doc));
  const note = $('.note-community', mem);
  if (note) lines.push(`  Community note: ${clean(textOf(note))}`);
  return lines.join('\n');
}

/** One enum value row: name, value, badges, doc, note. */
function rowMd(row) {
  const name = clean(row.cells[0]?.querySelector('code')?.textContent || row.id);
  if (!name) return '';
  const badges = badgesOf(row.cells[0] || row);
  const value = clean(row.cells[1]?.textContent || '');
  const doc = row.cells[2];
  const note = doc && $('.note-community', doc);
  const rest = doc && (() => {
    const c = doc.cloneNode(true);
    for (const n of c.querySelectorAll('.note-community, .note-add')) n.remove();
    return clean(c.textContent);
  })();
  return `- \`${name}\`${value ? ` = ${value}` : ''}${badges ? ` ${badges}` : ''}${rest ? ` — ${rest}` : ''}` +
    (note ? `\n  Community note: ${clean(textOf(note))}` : '');
}

/**
 * The whole page, walked child by child so the Markdown reads in the order
 * the page does. Anything unrecognised is chrome and stays out.
 */
function pageMarkdown(main) {
  const out = [];
  let members = [];
  const flush = () => {
    if (members.length) out.push(members.join('\n'));
    members = [];
  };

  for (const el of main.children) {
    if (el.matches('h1.class-title')) {
      const c = el.cloneNode(true);
      const badges = badgesOf(c);
      for (const b of c.querySelectorAll('.badge')) b.remove();
      out.push(`# ${clean(c.textContent)}${badges ? ` ${badges}` : ''}`);
    } else if (el.matches('.chain')) {
      out.push(`Inheritance: ${clean(el.textContent)}`);
    } else if (el.matches('.in-module, .alt-bases')) {
      out.push(clean(el.textContent));
    } else if (el.matches('.all-members')) {
      out.push(`All members, including inherited: ${location.origin}${location.pathname}members/`);
    } else if (el.matches('pre.attrs') || $('pre.attrs', el)) {
      const pre = el.matches('pre.attrs') ? el : $('pre.attrs', el);
      out.push('```\n' + pre.textContent.trim() + '\n```');
    } else if (el.matches('.class-doc')) {
      out.push(docLines(el, '').join('\n'));
    } else if (el.matches('.note-community')) {
      out.push(`Community note: ${clean(textOf(el))}`);
    } else if (el.matches('h2')) {
      flush();
      const c = el.cloneNode(true);
      const count = clean($('.count', c)?.textContent || '');
      $('.count', c)?.remove();
      out.push(`## ${clean(c.textContent)}${count ? ` (${count})` : ''}`);
    } else if (el.matches('.member')) {
      const md = memberMd(el);
      if (md) members.push(md);
    } else if (el.matches('.enum-table')) {
      const rows = [...el.querySelectorAll('tbody tr')].map(rowMd).filter(Boolean);
      out.push(`## Values (${rows.length})`, rows.join('\n'));
    } else if (el.matches('.locations')) {
      out.push([...el.querySelectorAll('a')].map((a) => `- ${clean(a.textContent)}`).join('\n'));
    }
  }
  flush();

  // What this is and where it came from, said once under the title so the
  // paste stands on its own in a conversation that never saw the site.
  const meta = [
    `Source: ${location.origin}${location.pathname}`,
    current ? `Build: DayZ ${current.name} (${current.build}), released ${fmtDate(current.date)}` : '',
    `DayZ Enforce Script API reference, generated from Bohemia Interactive's official script sources. ` +
      `"Community note" lines are unofficial annotations by modders. Full index: ${location.origin}/llms.txt`,
  ].filter(Boolean).join('\n');
  out.splice(1, 0, meta);

  return out.join('\n\n') + '\n';
}

/** The button, beside the title of every class and enum page. */
export function initLlmCopy() {
  if (!pageType) return;
  const main = $('.main');
  const title = main && $('h1.class-title', main);
  if (!title) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy-btn copy-llm';
  btn.setAttribute('aria-label', 'Copy page for LLM');
  btn.dataset.tip = 'Copy this page as Markdown';
  btn.addEventListener('click', async () => {
    // Resolved long before anyone clicks; awaited so the Markdown can name
    // the build, and given up on rather than blocking the copy if it fails.
    await identity().catch(() => {});
    copyText(pageMarkdown(main), btn, 'llm');
  });

  const actions = $('.title-actions', title);
  (actions || title).append(btn);
}
