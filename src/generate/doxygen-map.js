import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DATA_DIR, ROOT, git, readJson, writeJson } from '../util.js';
import { buildSiteModel } from './model.js';

const branch = process.argv[2] || 'doxygen-archive';
const versions = readJson(path.join(DATA_DIR, 'versions.json')).versions;
const site = buildSiteModel(readJson(path.join(DATA_DIR, `model-${versions[0].label}.json`)));
const files = git(['ls-tree', '-r', '--name-only', '-z', branch])
  .split('\0')
  .filter((file) => file.endsWith('.html'));
const batch = execFileSync('git', ['cat-file', '--batch'], {
  cwd: ROOT,
  input: files.map((file) => `${branch}:${file}\n`).join(''),
  maxBuffer: 1024 * 1024 * 512,
});

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&#160;', ' ');
}

function decodeDoxygen(value) {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== '_') {
      out += value[i];
    } else if (value[i + 1] === '_') {
      out += '_';
      i++;
    } else if (value[i + 1]) {
      out += value[++i].toUpperCase();
    }
  }
  return out;
}

function indexTarget(file) {
  if (file === 'index.html' || file === 'pages.html') return '/';
  if (file === 'modules.html' || file === 'topics.html') return '/topics/';
  if (file === 'annotated.html') return '/classes/';
  if (file === 'classes.html') return '/classes/index/';
  if (file === 'hierarchy.html') return '/classes/hierarchy/';
  if (file === 'files.html' || file === 'dirs.html' || file.startsWith('dir_')) return '/files/';
  if (file === 'functions.html') return '/classes/members/';
  if (file.startsWith('functions_func')) return '/classes/methods/';
  if (file.startsWith('functions_vars')) return '/classes/fields/';
  if (file.startsWith('functions_')) return '/classes/members/';
  if (file === 'globals.html') return '/globals/';
  if (file.startsWith('globals_func')) return '/globals/functions/';
  if (file.startsWith('globals_vars')) return '/globals/constants/';
  if (file.startsWith('globals_type')) return '/globals/typedefs/';
  if (file.startsWith('globals_enum')) return '/globals/enums/';
  if (file.startsWith('globals_eval')) return '/globals/values/';
  if (file.startsWith('globals_defs')) return '/globals/macros/';
  return null;
}

const redirects = {};
let offset = 0;
for (const file of files) {
  const lineEnd = batch.indexOf(10, offset);
  const size = Number(batch.subarray(offset, lineEnd).toString().split(' ').at(-1));
  const start = lineEnd + 1;
  const html = batch.subarray(start, start + size).toString();
  offset = start + size + 1;

  let target = indexTarget(file);
  const title = decodeHtml(/<title>DayZ Scripts: ([\s\S]*?)<\/title>/.exec(html)?.[1] || '');
  const name = path.basename(file, '.html');
  if (name.startsWith('class_')) {
    const cls = title.replace(/ (?:Class|Struct) Reference$/, '');
    const plain = cls.replace(/\s*<.*>$/, '');
    target = cls !== title && site.classes.has(cls)
      ? `/classes/${cls}/`
      : site.classes.has(plain) ? `/classes/${plain}/` : '/classes/';
  } else if (name.startsWith('group__')) {
    target = `/topics/${decodeDoxygen(name.slice('group__'.length))}/`;
  } else if (/_8c(?:_source)?$/.test(name)) {
    const source = /^P:\/(.+?) (?:File Reference|Source File)$/.exec(title)?.[1];
    if (source) target = `/files/${source}/`;
  }
  if (target) redirects[`/${file}`] = encodeURI(target);
}

writeJson(path.join(ROOT, 'site', 'doxygen-redirects.json'), redirects);
console.log(`Wrote ${Object.keys(redirects).length} Doxygen redirects`);
