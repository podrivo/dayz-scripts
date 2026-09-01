/* The files tree, beside the file.

   /files/ is the whole tree as a page. This is that same tree as a column
   next to one file's source, so reading a folder means clicking down it
   rather than going back to the index and finding your place again. It comes
   up as the reader left it (site/app/tree.js), with the folders down to the
   open file expanded on top of that: 2,825 files is not a list anyone
   scrolls, and the file being read is the one row that has to be in it.

   Built here rather than in the markup for the reason the minimap is. A file
   page's bytes have to stay identical across every build that did not touch
   that file, which is what lets ~660,000 pages be hard links to a few
   thousand; a tree inlined into them would be rewritten by every build and
   undo that on every page at once. The paths come from files.json instead
   (see src/generate/routes.js), which is the tree and nothing else — a fifth
   of a percent of the search index the source view fetches for its links, so
   the column fills in rather than arriving.

   The empty column goes in before the tree does, so the source is laid out
   once, in its final place, rather than being shunted right when the paths
   land.

   The arrows walk it as soon as the tree is there, starting from the open
   file, with nothing to focus or click first; Home and End are left to the
   source. Wide viewports only, on the same terms as the table of contents:
   below that the column belongs to the text. */

import { $, VPATH, esc, pathBuild } from './dom.js';
import { wireTree, ARROWS, openPath, dropIndexTree } from './tree.js';

/* The rows are spelled absolutely, unlike every link the generator writes.
   A relative href is measured from the page holding it, and this column
   outlives the page beside it: site/app/swap.js swaps `1_Core/param.c` for
   `4_World/Entities/Creatures/Animal.c` under a tree that is not rebuilt, and
   `../../` stopped meaning the same thing two folders ago. Naming the build
   keeps an archived tree inside its own build. */
const AT = pathBuild ? `/v/${pathBuild}/` : '/';

/** Display path of the file a page shows, null for every other page. The
    files index is `files/` and so does not match: there the tree is the page. */
const fileOf = (vpath) => /^files\/(.+)\/$/.exec(vpath)?.[1] || null;

/* Which file the column is pointing at. Not fixed at load: site/app/swap.js
   replaces the listing beside this without touching the tree, and then says
   which file it put there. */
let CUR = fileOf(VPATH);

const byName = (a, b) => a.localeCompare(b);

/** The flat path list as folders: { dirs: Map<name, node>, files: [name] }. */
function foldersOf(paths) {
  const root = { dirs: new Map(), files: [] };
  for (const p of paths) {
    const parts = p.split('/');
    const name = parts.pop();
    let node = root;
    for (const part of parts) {
      let kid = node.dirs.get(part);
      if (!kid) node.dirs.set(part, (kid = { dirs: new Map(), files: [] }));
      node = kid;
    }
    node.files.push(name);
  }
  return root;
}

/** One folder's rows: subfolders first, then its own files, the way /files/
    orders them. Markup matches renderFilesIndex in src/generate/render/files.js
    so both trees wear the same `ul.tree` styles and answer the same arrows. */
function rows(node, path) {
  const under = (name) => (path ? `${path}/${name}` : name);

  const dirs = [...node.dirs.keys()].sort(byName).map((name) => {
    const sub = under(name);
    const open = !!CUR && (CUR === sub || CUR.startsWith(`${sub}/`));
    return `<li><details${open ? ' open' : ''}><summary><code>${esc(name)}</code></summary>` +
      `<ul>${rows(node.dirs.get(name), sub)}</ul></details></li>`;
  });

  const files = node.files.sort(byName).map((name) => {
    const p = under(name);
    const cur = p === CUR;
    // Paths are listed as they are displayed, which is also how their URL
    // spells them; see fileHref in src/generate/render/shared.js.
    return `<li class="tree-file${cur ? ' tree-cur' : ''}">` +
      `<a href="${esc(AT)}files/${esc(p)}/"${cur ? ' aria-current="page"' : ''}>` +
      `<code>${esc(name)}</code></a></li>`;
  });

  return dirs.join('') + files.join('');
}

/* The tree, once it is up, so that a page swapped in beside it can be pointed
   at without any of it being built again. */
let live = null;

/** The row for a display path, with the folders above it opened. */
function locate(tree, path) {
  const parts = path.split('/');
  const name = parts.pop();
  const dir = parts.join('/');
  const summary = dir ? openPath(tree, dir) : null;
  if (dir && !summary) return null;
  const ul = summary ? summary.parentElement.querySelector(':scope > ul') : tree;
  for (const li of ul?.children || []) {
    const a = li.querySelector(':scope > a');
    if (a?.querySelector('code')?.textContent === name) return a;
  }
  return null;
}

/**
 * Point the column at a file: the row wears the highlight, the folders above
 * it open, and the arrows and Tab carry on from there. Called by
 * site/app/swap.js after it has put a listing on screen, which is the one
 * case where the tree stays and the page beside it does not.
 *
 * Before openColumn rather than after, so that a column being built for the
 * first time — the first file opened from /files/ — is built around this file
 * instead of being built blind and corrected.
 */
export function showFile(vpath) {
  CUR = fileOf(vpath);
  if (!live) return;
  const { tree, handle } = live;
  for (const el of tree.querySelectorAll('[aria-current]')) el.removeAttribute('aria-current');
  if (!CUR) return;
  const a = locate(tree, CUR);
  if (!a) return;
  a.setAttribute('aria-current', 'page');
  handle.select(a);
}

/**
 * Give a tree to a column: the arrows, the press target, and the scroll.
 *
 * `cur` is where the arrows start and the one row Tab stops on — the open
 * file where there is one, so Down means the file after this one from the
 * moment the page is up, with nothing to click first. Home and End stay with
 * the source; see ARROWS.
 */
function wire(column, tree, cur) {
  const handle = wireTree(tree, { claim: ARROWS, start: cur, box: column });
  live = { column, tree, handle };

  // A press anywhere in the column, the empty space beside the rows included,
  // says the arrows are meant for the tree from here. Clicking a folder does
  // not always move focus there on its own, and clicking past the rows never
  // had anything to move it to.
  column.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a')) return; // a link is about to be followed
    const row = e.target.closest('summary')
      || $('summary.tree-cur, .tree-cur > a', tree)
      || $('summary', tree);
    row?.focus({ preventScroll: true });
  });

  // Park it mid-column — the folders above it can be hundreds of rows deep.
  // Assigned rather than scrolled into view, which would take the page along.
  if (cur) column.scrollTop = cur.offsetTop - column.clientHeight / 2;
  return handle;
}

function fill(column, tree, list) {
  tree.innerHTML = rows(foldersOf(list), '');
  wire(column, tree, $('.tree-cur > a', tree));
}

function newColumn() {
  const column = document.createElement('aside');
  column.className = 'filetree';
  column.setAttribute('aria-label', 'Files');
  // A label, not a link. /files/ is one breadcrumb away, and a link here is
  // one more thing between Tab and the tree.
  column.innerHTML = '<p class="filetree-title">All files</p><ul class="tree"></ul>';
  return column;
}

/** Wide enough for a column beside the source; below this the page is the text. */
const ROOM = matchMedia('(min-width: 1180px)');

let paths = null;
const load = () => (paths ||= fetch(`${AT}files.json`)
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null));

/**
 * Put the column up, or do nothing if it is up already or there is no room.
 * Returns once the tree is in it.
 *
 * The empty column goes in first, and synchronously: at load that lands
 * before the first paint, so the source is laid out once, in the place it
 * stays, rather than being shunted right when the paths arrive.
 */
export function openColumn() {
  const main = $('.main');
  if (live || !main || !ROOM.matches) return Promise.resolve();

  const column = newColumn();
  main.before(column);

  return load().then((list) => {
    // Archived builds from before this sidecar existed have no tree to draw,
    // and the page is whole without the column; drop it rather than leave a
    // rule of empty space beside the source.
    if (!list?.length) {
      column.remove();
      return;
    }
    fill(column, $('ul.tree', column), list);
  });
}

/**
 * /files/ hands its tree over to the column.
 *
 * The index ships the whole tree in its markup and has to: that is the page a
 * reader without scripts gets, and it is where all 2,825 file pages are
 * linked from. So the column takes that very node instead of fetching
 * files.json and drawing a second copy of the same thing beside it. Nothing
 * is built, nothing is fetched, and the folders the page opened stay open.
 *
 * What is left in main is the landing: the heading, the count, and a line
 * saying where the tree went. Opening a file replaces it (site/app/swap.js).
 */
function adoptIndexTree() {
  const main = $('.main');
  const tree = main && $('ul.tree', main);
  // Narrow, or already taken: below the column's width the index stays the
  // full-width page it has always been.
  if (!tree || live || !ROOM.matches) return;

  const column = newColumn();
  main.before(column);
  $('ul.tree', column).replaceWith(tree);

  /* The index writes its links relative to itself, and the column outlives
     the page it came from: two files later, `../files/x` is measured from
     somewhere four folders down and points at nothing. Absolute is what a
     built column uses and what these have to become. */
  for (const a of tree.querySelectorAll('.tree-file > a')) a.setAttribute('href', a.pathname);

  // It may already answer the arrows as the page's own tree; it is the
  // column's now, on the column's terms.
  dropIndexTree();
  const handle = wire(column, tree, $('summary', tree));

  main.insertAdjacentHTML(
    'beforeend',
    '<p class="files-lede">Every script file in this build, in the column beside this. ' +
      'Pick one to read its source.</p>'
  );

  /* A breadcrumb names a folder — files/#4_World/Classes — and so did the
     tabs that used to stand above this page. Opening what it names is all
     that is left of the hash here: it is not written back as the reader
     moves, because the next thing opened is a file, and on a file the hash
     counts lines (site/app/share.js). */
  const path = decodeURIComponent(location.hash.slice(1));
  const summary = path && openPath(tree, path);
  if (summary) handle.select(summary);
}

export function initFileTree() {
  if (VPATH === 'files/') {
    ROOM.addEventListener('change', adoptIndexTree);
    adoptIndexTree();
    return;
  }
  if (!CUR) return;
  ROOM.addEventListener('change', openColumn);
  openColumn();
}
