/* Copy buttons.

   Signatures are the thing people come here to take away, and selecting one
   out of a line that also holds badges, a src link and an anchor is fiddly.
   Code blocks get their own button; signatures share a single one that
   follows the pointer, because a class page has nine hundred of them and
   nine hundred buttons is a page's worth of DOM for an affordance only one
   is ever using. */

import { $, VPATH, track } from './dom.js';

/** Copy, and let the button say so for a moment. Shared with the share bar,
    which is another row of the same buttons doing the same thing. */
export function copyText(text, btn, kind) {
  if (kind) track('copy', { copy_type: kind });
  const label = btn.getAttribute('aria-label');
  navigator.clipboard?.writeText(text).then(() => {
    btn.classList.add('copied');
    btn.setAttribute('aria-label', 'Copied');
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.setAttribute('aria-label', label);
    }, 1200);
  }, () => {});
}

function copyButton() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'copy-btn';
  b.setAttribute('aria-label', 'Copy');
  b.title = 'Copy';
  return b;
}

/** One button per code block: source listings, doc examples, attribute lists. */
export function initCopyBlocks() {
  for (const pre of document.querySelectorAll('pre.code, pre.src, pre.attrs')) {
    // The button is positioned against its block, so each one needs a box of
    // its own; a source page already has the frame around its listing, and
    // two doc examples in one comment must not share the containing div.
    let box = pre.parentElement;
    if (!box.classList.contains('srcwrap')) {
      box = document.createElement('div');
      pre.replaceWith(box);
      box.append(pre);
    }
    box.classList.add('has-copy');
    const btn = copyButton();
    btn.classList.add('copy-block');
    btn.addEventListener('click', () => copyText(pre.textContent, btn, 'code'));
    box.prepend(btn);
  }
}

/* ---------- copy as an override ----------
   Every script mod starts the same way: a modded class, the signature of the
   thing being changed copied out by hand, and a super call so the vanilla
   behaviour still runs underneath. The page already holds that signature in
   a form precise enough to build the stub from — modifiers are keyword
   spans, parameter names are spans of their own — so it is assembled here
   rather than shipped with the page.

   Offered only where an override would compile. A proto or native method is
   implemented by the engine and has no script body to extend, a static or
   private one cannot be reached through a subclass, and a constructor is not
   a method. A stub that cannot build is worse than no stub, since the
   compiler reports it against the mod rather than against this page. */
const NO_OVERRIDE = new Set(['proto', 'native', 'static', 'private']);

/** The `modded class` stub for one signature, or null if it cannot be one. */
export function overrideStub(code, cls) {
  const fn = $('.fn', code);
  const name = fn?.textContent;
  // A variable's name is a .vn, so anything without a .fn is not a method;
  // a constructor or destructor is named after the class and cannot be one.
  if (!name || name === cls || name === `~${cls}`) return null;
  const text = code.textContent;
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close < open) return null;

  // The modifiers are the keyword spans ahead of the name. Keywords after it
  // are inside the parentheses, where they belong to a parameter and are
  // part of the signature being repeated.
  const mods = [...code.querySelectorAll('.kw')]
    .filter((k) => k.compareDocumentPosition(fn) & Node.DOCUMENT_POSITION_FOLLOWING)
    .map((k) => k.textContent);
  if (mods.some((m) => NO_OVERRIDE.has(m))) return null;

  // Whatever is left of the head once the modifiers and the name are gone is
  // the return type, which can hold spaces of its own: `ref map<int, int>`.
  let ret = text.slice(0, open).trim();
  for (const m of mods) ret = ret.replace(new RegExp(`^${m}\\s+`), '');
  ret = ret.slice(0, -name.length).trim();

  const params = text.slice(open + 1, close).trim();
  const call = `super.${name}(${[...code.querySelectorAll('.pn')].map((p) => p.textContent).join(', ')})`;
  /* Everything the exclusions above leave behind is `protected` or `event`,
     every other modifier in the sources being proto's company, and both are
     part of the declaration an override repeats: the vanilla spelling is
     `protected override event`, with the keyword between the two. */
  const keep = (m) => (mods.includes(m) ? [m] : []);
  const decl = [...keep('protected'), 'override', ...keep('event'), ret, `${name}(${params})`]
    .filter(Boolean).join(' ');
  const body = !ret || ret === 'void' ? `${call};` : `return ${call};`;
  return `modded class ${cls}\n{\n\t${decl}\n\t{\n\t\t${body}\n\t}\n}\n`;
}

/** The one signature button, and beside it the override stub on a class page. */
export function initCopySignatures() {
  const main = $('.main');
  if (!main) return;

  const sigCopy = copyButton();
  sigCopy.classList.add('copy-sig');
  // Only a class page can name what the stub would be modding.
  const cls = /^class\/([^/]+)\/$/.exec(VPATH)?.[1];
  const sigOverride = cls && copyButton();
  if (sigOverride) {
    sigOverride.classList.add('copy-override');
    sigOverride.title = `Copy a modded class ${cls} override of this method`;
    sigOverride.setAttribute('aria-label', 'Copy override');
  }
  let hoverFor = null;
  let targetFor = null;
  let stub = null;
  const targetCopy = copyButton();
  targetCopy.classList.add('copy-sig');

  const codeOf = (mem) => {
    const sig = mem && $('.member-sig', mem);
    const code = sig && $('code', sig);
    return code ? { sig, code } : null;
  };
  const targeted = () => {
    const id = location.hash.slice(1);
    if (!id) return null;
    const mem = document.getElementById(id);
    return mem?.classList.contains('member') ? mem : null;
  };
  const parkTarget = () => {
    const host = targeted();
    const found = codeOf(host);
    if (!found) {
      targetCopy.remove();
      targetFor = null;
      return;
    }
    targetFor = found.code;
    found.sig.append(targetCopy);
    if (hoverFor === targetFor) {
      sigCopy.remove();
      hoverFor = null;
    }
  };

  sigCopy.addEventListener('click', () => hoverFor && copyText(hoverFor.textContent.trim(), sigCopy, 'signature'));
  targetCopy.addEventListener('click', () => targetFor && copyText(targetFor.textContent.trim(), targetCopy, 'signature'));
  sigOverride?.addEventListener('click', () => stub && copyText(stub, sigOverride, 'override'));
  main.addEventListener('pointerover', (e) => {
    const mem = e.target.closest?.('.member');
    const found = codeOf(mem);
    if (!found || found.code === hoverFor || found.code === targetFor) return;
    hoverFor = found.code;
    found.sig.append(sigCopy);
    if (!sigOverride) return;
    stub = overrideStub(found.code, cls);
    if (stub) found.sig.append(sigOverride);
    else sigOverride.remove();
  });
  window.addEventListener('hashchange', parkTarget);
  parkTarget();
}
