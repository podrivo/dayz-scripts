import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = (() => {
  try {
    return path.resolve(new URL('..', import.meta.url).pathname);
  } catch {
    return process.cwd();
  }
})();
export const CACHE_DIR = path.join(ROOT, '.cache');
export const DATA_DIR = path.join(ROOT, 'data');
export const DIST_DIR = path.join(ROOT, 'dist');
export const UPSTREAM_DIR = path.join(CACHE_DIR, 'upstream');
export const UPSTREAM_URL = 'https://github.com/BohemiaInteractive/DayZ-Script-Diff.git';

export function git(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
    ...opts,
  });
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

/** Extract the scripts/ tree of a version commit into .cache/src/<label>. */
export function extractSources(v) {
  const dir = path.join(CACHE_DIR, 'src', v.label);
  const marker = path.join(dir, '.sha');
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === v.sha) return dir;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execSync(`git -C "${UPSTREAM_DIR}" archive ${v.sha} scripts | tar -x -C "${dir}"`, { stdio: 'inherit' });
  fs.writeFileSync(marker, v.sha);
  return dir;
}

/**
 * Blob sha of every script file in a version commit, keyed by the same path
 * the models use. A file page renders nothing but its source, so an unchanged
 * blob sha is proof the page is unchanged — and getting it from the index
 * costs one git call per build instead of reading 19 MB of sources.
 */
export function sourceBlobs(v) {
  const out = new Map();
  let listing;
  try {
    listing = git(['-C', UPSTREAM_DIR, 'ls-tree', '-r', '-z', v.sha, '--', 'scripts']);
  } catch {
    return out; // no clone to ask: callers fall back to rendering every page
  }
  // -z gives "<mode> <type> <sha>\t<path>" records separated by NULs, so paths
  // never come back quoted or escaped.
  for (const entry of listing.split('\0')) {
    const tab = entry.indexOf('\t');
    if (tab < 0) continue;
    out.set(entry.slice(tab + 1), entry.slice(0, tab).split(' ')[2]);
  }
  return out;
}

/** Recursively list files under dir matching the extension, as relative paths. */
export function walk(dir, ext, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, ext, base));
    else if (entry.name.toLowerCase().endsWith(ext)) out.push(path.relative(base, full));
  }
  return out.sort();
}
