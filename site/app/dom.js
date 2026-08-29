/* What every feature in this folder needs to know about the page it is on,
   plus the three or four helpers all of them reach for. Nothing here touches
   the page: it only reads what the generator stamped onto <body>. */

export const $ = (s, el) => (el || document).querySelector(s);

/** Prefix from this page to its build's root, e.g. "../../". */
export const BASE = document.body.dataset.base || '';

/** The site root. Assets are absolute so a page works at any depth. */
export const ROOT = '/';

/** This page's path within its build, e.g. "classes/PlayerBase/". */
export const VPATH = document.body.dataset.vpath || '';

/* This site's own repository, where a community note is written. Here rather
   than stamped into every page: it is the same string on all of them and this
   file is fetched once. Mirrors REPO_URL in src/generate/content.js. */
export const REPO = 'https://github.com/podrivo/dayz-scripts';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]);

export const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });

/** A declaration's anchor on its page, spelled the way the generator spells
    it (anchorFor in src/generate/render/shared.js). */
export const anchorOf = (n) => n.replace(/[^\w]/g, '_');

/** Whether a keystroke was meant for the page rather than for a field. */
export const typing = () =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');

/**
 * The build this page belongs to, when it is an archived one: /v/<build>/…
 * is an older build and the site root is the newest. Pages carry no build
 * stamp of their own (see layout() in src/generate/html.js), so the URL is
 * the only thing that knows.
 */
export const pathBuild = location.pathname.match(/^\/v\/([^/]+)\//)?.[1];

/**
 * The class or enum this page documents, or null. The history badges and the
 * community notes both hang off it, and neither has any other way to ask.
 */
export const pageType = (() => {
  const m = /^classes\/([^/]+)\/$/.exec(VPATH) || /^enum\/([^/]+)\/$/.exec(VPATH);
  if (!m) return null;
  const name = m[1];
  if (VPATH.startsWith('classes/') && (name === 'index' || name === 'fields' || /^[a-z_]$/.test(name))) return null;
  return { kind: VPATH.startsWith('classes/') ? 'class' : 'enum', name };
})();
