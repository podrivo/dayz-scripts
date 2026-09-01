// The script files: the tree at /files/, and one file's source at
// /files/<Dir>/<Name.c>/.

import { esc, layout, EXT } from '../html.js';
import { fileHref } from './shared.js';

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

  const fileRow = (f) => {
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

  // Every folder shut. Which ones a reader wants open is theirs to say, and
  // site/app/tree.js remembers the answer; opening the six roots for them was
  // a guess that put four hundred rows between the top of the tree and the
  // second one.
  const dirNode = (d) => /* html */ `<li><details><summary><code>${esc(d.name)}</code> <span class="count">${d.count.toLocaleString('en-US')}</span></summary>
<ul>${d.dirs.map(dirNode).join('')}${d.files.map(fileRow).join('')}</ul></details></li>`;

  const content = /* html */ `
<h1>Files <span class="count">${site.files.length.toLocaleString('en-US')}</span></h1>
<ul class="tree">${site.dirRoots.map(dirNode).join('')}${site.rootFiles.map(fileRow).join('')}</ul>`;
  return layout({
    ...ctx,
    title: 'Files',
    active: 'files/',
    breadcrumbs: [{ label: 'Files' }],
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
    breadcrumbs.push({ label: seg, href: `${base}files/#${parts.slice(0, i + 1).join('/')}` });
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
