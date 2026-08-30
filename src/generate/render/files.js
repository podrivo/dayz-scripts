// The script files: the tree at /files/, and one file's source at
// /files/<Dir>/<Name.c>/.

import { esc, layout, EXT, FILE_LAYERS } from '../html.js';
import { fileHref } from './shared.js';
import { pageBar } from './pagebar.js';

export function renderFilesIndex(ctx) {
  const { site, base } = ctx;

  const fileRow = (f) => {
    const what = [
      f.counts.classes && `${f.counts.classes} classes`,
      f.counts.enums && `${f.counts.enums} enums`,
      f.counts.functions && `${f.counts.functions} functions`,
      f.counts.globals && `${f.counts.globals} globals`,
    ]
      .filter(Boolean)
      .join(', ');
    return `<li class="tree-file"><a href="${fileHref(site, base, f.path)}"><code>${esc(f.name)}</code></a>${what ? ` <span class="muted">${what}</span>` : ''}</li>`;
  };

  const dirNode = (d, depth) => /* html */ `<li${depth < 1 ? ` data-layer="${esc(d.name)}"` : ''}><details${depth < 1 ? ' open' : ''}><summary><code>${esc(d.name)}</code> <span class="count">${d.count.toLocaleString('en-US')}</span></summary>
<ul>${d.dirs.map((k) => dirNode(k, depth + 1)).join('')}${d.files.map(fileRow).join('')}</ul></details></li>`;

  const content = /* html */ `
<h1>Files <span class="count">${site.files.length.toLocaleString('en-US')}</span></h1>
<ul class="tree">${site.dirRoots.map((d) => dirNode(d, 0)).join('')}${site.rootFiles.map(fileRow).join('')}</ul>`;
  return layout({
    ...ctx,
    title: 'Files',
    active: 'files/',
    bar: pageBar({
      tabs: [
        [`${base}files/`, 'All', true],
        ...FILE_LAYERS.map((n) => [`${base}files/#${n}`, n, false]),
      ],
    }),
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
  const { base } = ctx;
  // fileEntry.display is derived from these same bytes plus the static
  // dictionary, so the page still depends on nothing but the source blob.
  const short = fileEntry.display;

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
<h1 class="file-title"><code>${esc(short)}</code></h1>
<p class="file-actions"><a id="ghSrc" href="${github}" ${EXT}>View source file on GitHub</a></p>
${decls}
<div class="srcwrap"><pre class="src" id="src"><code>${esc(source)}</code></pre></div>`;

  return layout({
    ...ctx,
    title: short,
    active: 'files/',
    breadcrumbs: [{ label: 'Files', href: `${base}files/` }, { label: short }],
    content,
  });
}
