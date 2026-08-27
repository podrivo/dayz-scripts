// Helpers for archived builds: they are not written as pretty URLs. Unique
// bodies live under /_b/<sha> and /v/<build>/pages.json lists only the pages
// whose body differs from the latest build. Identical pages are omitted and
// the archive loader fetches the latest copy instead.

import { ARCHIVE_MARK, esc } from './html.js';

/** rel -> hash for every archive page that is not byte-identical to latest. */
export function pageExceptions(archiveHashes, latestHashes) {
  const out = {};
  for (const [rel, hash] of archiveHashes) {
    if (latestHashes.get(rel) !== hash) out[rel] = hash;
  }
  return out;
}

export function unpackPage(text) {
  const i = text.indexOf('\n');
  if (i === -1) throw new Error('packed page missing header');
  return { meta: JSON.parse(text.slice(0, i)), inner: text.slice(i + 1) };
}

/**
 * Fill the archive shell template produced by layout() with ARCHIVE_MARK
 * placeholders. Title is already "§T§ · DIFF" in the template.
 */
export function fillArchiveTemplate(tpl, meta, inner) {
  return tpl
    .replaceAll(`${ARCHIVE_MARK.title} · DIFF`, esc(meta.title))
    .replaceAll(ARCHIVE_MARK.desc, esc(meta.description))
    .replaceAll(ARCHIVE_MARK.vpath, esc(meta.vpath))
    .replaceAll(ARCHIVE_MARK.base, meta.base)
    .replaceAll(ARCHIVE_MARK.inner, inner);
}

/**
 * Split a /v/<build>/… pathname into the build and the version-relative path.
 * Directory URLs are normalised to a trailing slash, matching routes.js.
 */
export function locateArchive(pathname) {
  const m = /^\/v\/([^/]+)\/(.*)$/.exec(pathname);
  if (!m) return null;
  let rel = m[2];
  if (rel && !rel.endsWith('/') && !rel.includes('.')) rel += '/';
  return { build: m[1], rel };
}
