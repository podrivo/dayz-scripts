// The script files: the tree at /files/, directory listings, and one file's
// source at /files/<Dir>/<Name.c>/.

import { esc, layout, EXT } from '../html.js';
import { fileHref } from './shared.js';

const fileRow = (site, base, f) => {
  const n = (count, one, many) => count && `${count} ${count === 1 ? one : many}`;
  const what = [
    n(f.counts.classes, 'class', 'classes'),
    n(f.counts.enums, 'enum', 'enums'),
    n(f.counts.functions, 'function', 'functions'),
    n(f.counts.globals, 'global', 'globals'),
  ]
    .filter(Boolean)
    .join(', ');
  return `<li class="tree-file"><a href="${fileHref(site, base, f.path)}"><code>${esc(f.name)}</code></a>${what ? ` <span class="muted">${what}</span>` : ''}</li>`;
};

/* No page bar anywhere under /files/. The layer tabs that used to sit here —
   All, 1_Core, 4_World — named the top folders of the tree, and the tree is
   now a column standing beside every page of this section rather than a page
   of its own you went back to (site/app/filetree.js). Naming the same six
   folders twice, once as a row that filters and once as rows that open, was
   two of everything; the column won because it is the one that is always
   there. Without a bar the column and the minimap reach the header on their
   own: --h-bar falls back to 0px. */

export function renderFilesIndex(ctx) {
  const { site, base } = ctx;

  // Every folder shut. Which ones a reader wants open is theirs to say, and
  // site/app/tree.js remembers the answer; opening the six roots for them was
  // a guess that put four hundred rows between the top of the tree and the
  // second one.
  const dirNode = (d) => /* html */ `<li><details><summary><code>${esc(d.name)}</code> <span class="count">${d.count.toLocaleString('en-US')}</span></summary>
<ul>${d.dirs.map(dirNode).join('')}${d.files.map((f) => fileRow(site, base, f)).join('')}</ul></details></li>`;

  /* The tree ships in the column it is read in.

     It is the same column a source page carries (site/app/filetree.js), and
     for a while this page shipped the tree inside <main> and let the browser
     move it across once the scripts were up. That is a page arriving in one
     shape and settling into another a moment later — a full-width tree that
     jumps into a 248px rail — and no amount of doing it sooner makes it not
     happen. Written where it belongs, there is nothing to move.

     Only this page can do that. A source page's bytes have to be identical in
     every build that did not touch the file, and a tree inlined into them
     would be rewritten by every build; there the column is still built in the
     browser from files.json. Here the tree is the content, and it changes with
     the build anyway. */
  const tree = /* html */ `<ul class="tree">${site.dirRoots.map(dirNode).join('')}${site.rootFiles.map((f) => fileRow(site, base, f)).join('')}</ul>`;
  const aside = /* html */ `<aside class="filetree" aria-label="Files"><p class="filetree-title">All files</p>${tree}</aside>`;

  // Below the column's width this is the whole page again, and the lede goes
  // with the column it is describing; see styles.css.
  const content = /* html */ `
<h1>Files <span class="count">${site.files.length.toLocaleString('en-US')}</span></h1>
<p class="files-lede">Every script file in this build, in the column beside this. Pick one to read its source.</p>`;
  return layout({
    ...ctx,
    title: 'Files',
    active: 'files/',
    breadcrumbs: [{ label: 'Files' }],
    aside,
    content,
  });
}

export function renderDirectory(ctx, dir) {
  const { site, base } = ctx;
  const parts = dir.path.split('/');
  const breadcrumbs = [{ label: 'Files', href: `${base}files/` }];
  for (let i = 0; i < parts.length - 1; i++) {
    breadcrumbs.push({
      label: parts[i],
      href: `${base}files/${parts.slice(0, i + 1).join('/')}/`,
    });
  }
  breadcrumbs.push({ label: dir.name });

  const directories = dir.dirs.length
    ? `<h2>Directories <span class="count">${dir.dirs.length}</span></h2>
<ul class="catalog directory-list">${dir.dirs.map((child) => `<li><div class="catalog-head"><a href="${base}files/${child.path}/"><code>${esc(child.name)}/</code></a><span class="count">${child.count.toLocaleString('en-US')} files</span></div></li>`).join('')}</ul>`
    : '';
  const files = dir.files.length
    ? `<h2>Files <span class="count">${dir.files.length}</span></h2>
<ul class="tree directory-files">${dir.files.map((f) => fileRow(site, base, f)).join('')}</ul>`
    : '';
  const content = /* html */ `
<h1>${esc(dir.name)} <span class="count">${dir.count.toLocaleString('en-US')} files</span></h1>
${directories}
${files}`;
  return layout({
    ...ctx,
    title: dir.name,
    active: 'files/',
    description: `Files and directories under ${dir.path} in the DayZ script tree.`,
    breadcrumbs,
    content,
  });
}

/**
 * One file's source, shipped as plain text. It is highlighted, line-numbered,
 * linked and folded in the browser by site/app/source.js, which is what keeps
 * these bytes identical across every build that did not touch the file.
 */
export function renderFile(ctx, fileEntry, fileModel, source) {
  const { site, base } = ctx;
  // fileEntry.display is derived from these same bytes plus the static
  // dictionary, so the page still depends on nothing but the source blob.
  const short = fileEntry.display;
  const name = fileEntry.name;
  const parts = short.split('/');
  const breadcrumbs = [{ label: 'Files', href: `${base}files/` }];
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i];
    breadcrumbs.push({ label: seg, href: `${base}files/${parts.slice(0, i + 1).join('/')}/` });
  }
  breadcrumbs.push({ label: name });

  const declList = [];
  for (const c of fileModel.classes) {
    if (!declList.some((d) => d.name === c.name)) {
      declList.push({ kind: 'class', name: c.name, href: `${base}classes/${c.name}/`, line: c.line });
    }
  }
  for (const e of fileModel.enums) declList.push({ kind: 'enum', name: e.name, href: `${base}enum/${e.name}/`, line: e.line });
  for (const t of fileModel.typedefs) declList.push({ kind: 'typedef', name: t.name, href: `${base}globals/typedefs/#${t.name}`, line: t.line });
  for (const fn of fileModel.functions) declList.push({ kind: 'func', name: fn.name + '()', href: `${base}globals/functions/#${fn.name}`, line: fn.line });

  const decls = declList.length
    ? `<div class="file-decls">${declList
        .map((d) => `<a href="${d.href}"><span class="kw">${d.kind}</span> ${esc(d.name)}</a>`)
        .join('')}</div>`
    : '';

  // Pinned to the exact build's commit by site/app/builds.js; `main` is the
  // fallback for when it can't be, since the href must not name a build
  // (see layout()).
  const github = `https://github.com/BohemiaInteractive/DayZ-Script-Diff/blob/main/${fileEntry.path}`;

  const content = /* html */ `
<h1 class="file-title">${esc(name)} <a id="ghSrc" class="copy-btn share-gh" href="${github}" ${EXT} data-tip="View source file in Github" aria-label="View source file in Github"></a></h1>
${decls}
<div class="srcwrap"><pre class="src" id="src"><code>${esc(source)}</code></pre></div>`;

  return layout({
    ...ctx,
    title: name,
    active: 'files/',
    breadcrumbs,
    content,
  });
}
