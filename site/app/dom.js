/* What every feature in this folder needs to know about the page it is on,
   plus the three or four helpers all of them reach for. Nothing here touches
   the page: it only reads what the generator stamped onto <body>. */

export const $ = (s, el) => (el || document).querySelector(s);

/** A GA4 / PostHog event, when the snippet has loaded. Safe with no analytics and in tests. */
export const track = (name, params) => {
  try { globalThis.gtag?.('event', name, params); } catch { /* blocked or absent */ }
  try { globalThis.posthog?.capture?.(name, params); } catch { /* blocked or absent */ }
};

/* Which page is showing.
 *
 * These three are reassigned rather than fixed, because site/app/swap.js
 * replaces one page's body with another's without a reload and everything
 * below has to describe the page in front of the reader, not the one the
 * server sent. A module import is a live binding, so anything that reads
 * these inside a function body follows the swap on its own; a module that
 * copied one into a constant of its own at load time would not, and none do.
 */

/** Prefix from this page to its build's root, e.g. "../../". */
export let BASE = '';

/** The site root. Assets are absolute so a page works at any depth. */
export const ROOT = '/';

/** This page's path within its build, e.g. "classes/PlayerBase/". */
export let VPATH = '';

/* This site's own repository, where a community note is written. Here rather
   than stamped into every page: it is the same string on all of them and this
   file is fetched once. Mirrors REPO_URL in src/generate/content.js. */
export const REPO = 'https://github.com/yadzapp/diff';

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
export let pageType = null;

function typeOf(vpath) {
  const m = /^classes\/([^/]+)\/$/.exec(vpath) || /^enum\/([^/]+)\/$/.exec(vpath);
  if (!m) return null;
  const name = m[1];
  if (vpath.startsWith('classes/') && (name === 'index' || name === 'fields' || /^[a-z_]$/.test(name))) return null;
  return { kind: vpath.startsWith('classes/') ? 'class' : 'enum', name };
}

/** Point the three above at a page. Called once for the page the server sent,
    and again by site/app/swap.js for each one swapped in after it. */
export function setPage(base, vpath) {
  BASE = base || '';
  VPATH = vpath || '';
  pageType = typeOf(VPATH);
}

setPage(document.body.dataset.base, document.body.dataset.vpath);
