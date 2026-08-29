/* Enforce Script syntax highlighting.

   One regular expression over the source, which is also what the code folder
   in source.js scans with: a brace inside a string or a comment is not a
   brace, and both features have to agree about that. */

const KW = new Set(('class enum typedef extends modded sealed proto native owned external volatile override event ' +
  'private protected static const ref autoptr out inout notnull new delete this super return if else for foreach ' +
  'while switch case default break continue null true false void int float bool string vector typename func auto ' +
  'thread waitAll wait sleep delegate').split(' '));

export const TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*")|(^[ \t]*#[^\n]*)|(\b0x[0-9a-fA-F]+\b|\b\d+\.?\d*\b)|(\b[A-Za-z_]\w*\b)/gm;

export function newlines(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * Source to HTML. `resolve` is optional: given one, every identifier it can
 * place becomes a link to the page documenting it, and `resolve.str` does the
 * same for a quoted string naming a type or a script file. See sourceResolver
 * in source.js.
 */
export function highlight(text, resolve) {
  let out = '';
  let last = 0;
  // Which line each identifier is on, so the resolver can tell which class
  // body it sits inside. Comments and strings are the only tokens that can
  // span lines, so counting is a matter of the gaps plus those two.
  let line = 1;
  // Quotes are left alone: they are the source's own, and this runs over
  // whole files where the extra pass would show.
  const escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  const esc = (s) => s.replace(/[&<>]/g, (c) => escMap[c]);
  // spans must never cross newlines (lines get wrapped individually later)
  const span = (cls, s) =>
    s.split('\n').map((part) => (part ? `<span class="${cls}">${esc(part)}</span>` : '')).join('\n');
  for (let m; (m = TOKEN_RE.exec(text)); ) {
    const gap = text.slice(last, m.index);
    out += esc(gap);
    line += newlines(gap);
    last = TOKEN_RE.lastIndex;
    if (m[1]) { out += span('tok-com', m[1]); line += newlines(m[1]); }
    else if (m[2]) {
      const body = `<span class="tok-str">${esc(m[2])}</span>`;
      const href = resolve && resolve.str && resolve.str(m[2]);
      out += href ? `<a class="tok-link" href="${href}">${body}</a>` : body;
      line += newlines(m[2]);
    }
    else if (m[3]) out += `<span class="tok-pre">${esc(m[3])}</span>`;
    else if (m[4]) out += `<span class="tok-num">${esc(m[4])}</span>`;
    else if (m[5]) {
      if (KW.has(m[5])) out += `<span class="tok-kw">${esc(m[5])}</span>`;
      else {
        const body = /^[A-Z]/.test(m[5]) ? `<span class="tok-type">${esc(m[5])}</span>` : esc(m[5]);
        const href = resolve && resolve(m[5], line);
        out += href ? `<a class="tok-link" href="${href}">${body}</a>` : body;
      }
    }
  }
  return out + esc(text.slice(last));
}

/** The `\code` examples inside doc comments, which are Enforce too. */
export function initInlineCode() {
  for (const pre of document.querySelectorAll('pre[data-hl] code')) {
    pre.innerHTML = highlight(pre.textContent);
  }
}
