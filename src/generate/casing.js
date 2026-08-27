// Restores the original capitalisation of script paths for display.
//
// The DayZ-Script-Diff repository we parse lowercases every path, so what the
// sources call `1_core/debug/debugtext.c` is `1_Core/Debug/DebugText.c` in the
// game's own tree. pathnames.json is that tree's spelling, covering 2,812 of
// the 2,825 files in the current build.
//
// Anything the dictionary misses — files added after that snapshot — falls back
// to the name the file declares: `contextmenu.c` holds `class ContextMenu`, so
// it is displayed as `ContextMenu.c`. Whatever neither resolves stays as it is,
// which is why this only ever affects presentation. URLs keep the lowercase
// spelling so existing links, redirects and the search index stay valid.

import fs from 'node:fs';

const { dirs, files } = JSON.parse(
  fs.readFileSync(new URL('./pathnames.json', import.meta.url), 'utf8')
);

/** lowercase directory path -> that directory's spelling (last segment only) */
const DIR_CASE = new Map();
for (const d of dirs) DIR_CASE.set(d.toLowerCase(), d.slice(d.lastIndexOf('/') + 1));

/** lowercase file path -> that file's spelling (basename only) */
const FILE_CASE = new Map();
for (const f of files) FILE_CASE.set(f.toLowerCase(), f.slice(f.lastIndexOf('/') + 1));

/** Capitalise the first letter, for directories the dictionary never saw. */
function capitalise(raw) {
  const i = raw.search(/[a-z]/);
  return i === -1 ? raw : raw.slice(0, i) + raw[i].toUpperCase() + raw.slice(i + 1);
}

/**
 * How a file spells the type it declares. An exact match is the common case
 * (`contextmenu.c` -> `ContextMenu`); a suffix match covers the entity files
 * whose class carries a prefix the filename drops (`hotspring.c` holds
 * `Land_HotSpring`), and only where the suffix starts a word, so that a stem
 * never matches the middle of a longer name.
 */
function fromDeclarations(stem, names) {
  let suffix = null;
  for (const n of names) {
    const lower = n.toLowerCase();
    if (lower === stem) return n;
    if (!suffix && lower.endsWith(stem)) {
      const tail = n.slice(n.length - stem.length);
      if (/^[A-Z]/.test(tail) && /[^A-Za-z0-9]/.test(n[n.length - stem.length - 1])) suffix = tail;
    }
  }
  return suffix;
}

/**
 * Spelling of one path segment, given the lowercase path leading up to it.
 * `names` are the types declared in the file, used only when the dictionary
 * has nothing to say about it.
 */
function segment(lowerPath, raw, isFile, names) {
  const known = (isFile ? FILE_CASE : DIR_CASE).get(lowerPath);
  if (known) return known;
  if (!isFile) return capitalise(raw);
  if (!names) return raw;

  const dot = raw.lastIndexOf('.');
  const stem = dot === -1 ? raw : raw.slice(0, dot);
  const declared = fromDeclarations(stem, names);
  return declared ? declared + (dot === -1 ? '' : raw.slice(dot)) : raw;
}

/**
 * Display spelling of a path relative to scripts/, e.g.
 * `1_core/debug/debugtext.c` -> `1_Core/Debug/DebugText.c`.
 */
export function prettyPath(relPath, names) {
  const parts = relPath.split('/');
  const last = parts.length - 1;
  let lower = '';
  let out = '';
  for (let i = 0; i <= last; i++) {
    lower += (i ? '/' : '') + parts[i].toLowerCase();
    out += (i ? '/' : '') + segment(lower, parts[i], i === last, names);
  }
  return out;
}
