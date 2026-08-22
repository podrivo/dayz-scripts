import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
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
