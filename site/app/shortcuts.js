/* The keyboard shortcuts list.

   The header's button names ⌘K and the palette's hint strip names the arrows
   and Enter, but `/`, M and Esc were written down nowhere except, for M, the
   title of the theme button. Built on the first ? rather than shipped in the
   markup, for the reason the table of contents is: it is chrome nobody has
   asked for yet, and the pages it would otherwise sit on number in the
   hundreds of thousands. The overlay wears the palette's own box and
   backdrop, so a second modal costs no second set of styles. */

import { $, typing } from './dom.js';
import { closeOthers, onOverlay } from './overlay.js';

const SHORTCUTS = [
  [[/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘ K' : 'Ctrl K', '/'], 'Search'],
  [['↑', '↓'], 'Move through the results'],
  [['↵'], 'Open the selected result'],
  [['M'], 'Switch between light and dark'],
  [['?'], 'This list'],
  [['Esc'], 'Close an overlay, or clear the page filter'],
];

let help = null;
let helpFrom = null;

function buildHelp() {
  const wrap = document.createElement('div');
  wrap.className = 'palette help';
  wrap.hidden = true;
  const box = document.createElement('div');
  box.className = 'palette-box help-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Keyboard shortcuts');
  box.tabIndex = -1;
  const title = document.createElement('p');
  title.className = 'help-title';
  title.textContent = 'Keyboard shortcuts';
  const list = document.createElement('dl');
  list.className = 'help-list';
  for (const [keys, what] of SHORTCUTS) {
    const dt = document.createElement('dt');
    keys.forEach((k, i) => {
      if (i) dt.append(document.createTextNode(' '));
      const kbd = document.createElement('kbd');
      kbd.textContent = k;
      dt.append(kbd);
    });
    const dd = document.createElement('dd');
    dd.textContent = what;
    list.append(dt, dd);
  }
  box.append(title, list);
  wrap.append(box);
  wrap.addEventListener('click', (e) => {
    if (!e.target.closest('.help-box')) closeHelp();
  });
  document.body.append(wrap);
  return wrap;
}

function openHelp() {
  help ||= buildHelp();
  if (!help.hidden) return;
  closeOthers(closeHelp);
  helpFrom = document.activeElement;
  help.hidden = false;
  document.body.classList.add('palette-open');
  $('.help-box', help).focus();
}

function closeHelp() {
  if (!help || help.hidden) return;
  help.hidden = true;
  document.body.classList.remove('palette-open');
  helpFrom?.focus?.();
}

export function initShortcuts() {
  onOverlay(closeHelp);

  // The palette's hint strip is the one place a shortcut is already spelled out
  // on the page, which makes it the place this one can be found.
  const paletteHints = $('#palette .palette-hints');
  if (paletteHints) {
    const kbd = document.createElement('kbd');
    kbd.textContent = '?';
    paletteHints.append(document.createTextNode(' · '), kbd, document.createTextNode(' for shortcuts'));
  }

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { closeHelp(); return; }
    if (e.key !== '?' || typing()) return;
    e.preventDefault();
    help && !help.hidden ? closeHelp() : openHelp();
  });
}
