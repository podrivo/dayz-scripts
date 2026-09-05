/* Copy buttons, and the other member-row chips that follow the pointer.

   Signatures are the thing people come here to take away, and selecting one
   out of a line that also holds badges is fiddly. #, src, Copy and Override
   share one node each that moves onto the hovered (or :target) row — a class
   page has nine hundred members, and nine hundred of each chip is a page's
   worth of DOM for affordances only one row is ever using. The source URL
   lives on data-src so the HTML does not pay for the <a> up front. */

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

function copyButton(tip = 'Copy code') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'copy-btn';
  b.dataset.tip = tip;
  b.setAttribute('aria-label', b.dataset.tip);
  return b;
}

function anchorLink() {
  const a = document.createElement('a');
  a.className = 'anchor';
  a.textContent = '#';
  return a;
}

function srcLink() {
  const a = document.createElement('a');
  a.className = 'member-src';
  a.textContent = 'Source';
  a.addEventListener('click', () => track('view_source', { source: 'member' }));
  return a;
}

function setSource(link, href) {
  link.href = href;
  const match = href.match(/files\/(.+?)\/#L(\d+)$/);
  const label = match ? `${decodeURIComponent(match[1])}:${match[2]}` : 'View source';
  link.dataset.tip = label;
  link.setAttribute('aria-label', label);
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

/** Mount # / src / Copy onto a member signature. */
function mountMember(sig, mem, chips) {
  const { anchor, src, copy } = chips;
  if (mem.id) {
    anchor.href = `#${mem.id}`;
    anchor.setAttribute('aria-label', `Link to ${mem.id.replace(/-\d+$/, '')}`);
    sig.append(anchor);
  } else {
    anchor.remove();
  }
  if (mem.dataset.src) {
    setSource(src, mem.dataset.src);
    sig.append(src);
  } else {
    src.remove();
  }
  sig.append(copy);
}

/** The shared chips for signatures, and the override stub on a class page. */
export function initCopySignatures() {
  const main = $('.main');
  if (!main) return;

  const hover = {
    anchor: anchorLink(),
    src: srcLink(),
    copy: copyButton('Copy declaration'),
  };
  hover.copy.classList.add('copy-sig');
  const target = {
    anchor: anchorLink(),
    src: srcLink(),
    copy: copyButton('Copy declaration'),
  };
  target.copy.classList.add('copy-sig');

  // Only a class page can name what the stub would be modding.
  const cls = /^class\/([^/]+)\/$/.exec(VPATH)?.[1];
  const sigOverride = cls && copyButton();
  if (sigOverride) {
    sigOverride.classList.add('copy-override');
    sigOverride.dataset.tip = `Copy a modded class ${cls} override of this method`;
    sigOverride.setAttribute('aria-label', sigOverride.dataset.tip);
  }

  let hoverFor = null;
  let targetFor = null; // .member code node, or a tr[data-src]
  let srcRowFor = null;
  let stub = null;
  // One more src chip for table.list rows (constants, macros, topic summaries).
  const rowSrc = srcLink();

  const codeOf = (mem) => {
    const sig = mem && $('.member-sig', mem);
    const code = sig && $('code', sig);
    return code ? { sig, code, mem } : null;
  };
  const targeted = () => {
    const id = location.hash.slice(1);
    if (!id) return null;
    const el = document.getElementById(id);
    if (el?.classList.contains('member')) return el;
    if (el?.matches?.('tr[data-src]')) return el;
    return null;
  };
  const clearTarget = () => {
    target.anchor.remove();
    target.src.remove();
    target.copy.remove();
    targetFor = null;
  };
  const parkTarget = () => {
    const host = targeted();
    if (!host) {
      clearTarget();
      return;
    }
    if (host.matches('tr')) {
      target.anchor.remove();
      target.copy.remove();
      setSource(target.src, host.dataset.src);
      (host.cells[host.cells.length - 1] || host).append(target.src);
      targetFor = host;
      if (srcRowFor === host) {
        rowSrc.remove();
        srcRowFor = null;
      }
      return;
    }
    const found = codeOf(host);
    if (!found) {
      clearTarget();
      return;
    }
    targetFor = found.code;
    mountMember(found.sig, found.mem, target);
    if (hoverFor === targetFor) {
      hover.anchor.remove();
      hover.src.remove();
      hover.copy.remove();
      hoverFor = null;
    }
  };

  hover.copy.addEventListener('click', () => hoverFor && copyText(hoverFor.textContent.trim(), hover.copy, 'signature'));
  target.copy.addEventListener('click', () => {
    if (targetFor?.nodeType === 1 && !targetFor.matches?.('tr')) {
      copyText(targetFor.textContent.trim(), target.copy, 'signature');
    }
  });
  sigOverride?.addEventListener('click', () => stub && copyText(stub, sigOverride, 'override'));

  main.addEventListener('pointerover', (e) => {
    const row = e.target.closest?.('table.list tr[data-src]');
    if (row && row !== srcRowFor && row !== targetFor) {
      srcRowFor = row;
      setSource(rowSrc, row.dataset.src);
      (row.cells[row.cells.length - 1] || row).append(rowSrc);
    }

    const mem = e.target.closest?.('.member');
    const found = codeOf(mem);
    if (!found || found.code === hoverFor || found.code === targetFor) return;
    hoverFor = found.code;
    mountMember(found.sig, found.mem, hover);
    if (!sigOverride) return;
    stub = overrideStub(found.code, cls);
    if (stub) found.sig.append(sigOverride);
    else sigOverride.remove();
  });
  window.addEventListener('hashchange', parkTarget);
  parkTarget();
}
