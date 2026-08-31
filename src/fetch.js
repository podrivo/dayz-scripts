// Clones/updates the official DayZ-Script-Diff repository and maps its
// commit history to DayZ builds. Each commit message looks like:
//   "Build 1.29.163709, Scripts Rev. 125372"
// Every build is documented (1.29.163709, 1.29.163451, ...); when several
// commits share a build number we keep the newest one.

import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, DATA_DIR, UPSTREAM_DIR, UPSTREAM_URL, git, writeJson } from './util.js';

const BUILD_RE = /^Build (\d+)\.(\d+)\.(\d+), Scripts Rev\. (\d+)$/;

function updateUpstream() {
  if (fs.existsSync(path.join(UPSTREAM_DIR, '.git'))) {
    console.log('Updating upstream clone...');
    git(['-C', UPSTREAM_DIR, 'fetch', '--quiet', 'origin', 'main']);
  } else {
    console.log(`Cloning ${UPSTREAM_URL} ...`);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    git(['clone', '--quiet', '--no-checkout', UPSTREAM_URL, UPSTREAM_DIR]);
  }
}

function detectVersions() {
  const log = git(['-C', UPSTREAM_DIR, 'log', 'origin/main', '--format=%H%x09%cI%x09%s']);
  const byBuild = new Map(); // "1.29.163709" -> newest matching commit (log is newest-first)
  const skipped = [];
  for (const line of log.trim().split('\n')) {
    const [sha, date, subject] = line.split('\t');
    const m = subject.match(BUILD_RE);
    if (!m) {
      skipped.push(subject);
      continue;
    }
    const build = `${m[1]}.${m[2]}.${m[3]}`;
    if (!byBuild.has(build)) {
      byBuild.set(build, {
        label: build,
        version: `${m[1]}.${m[2]}`,
        build,
        rev: Number(m[4]),
        sha,
        date: date.slice(0, 10),
      });
    }
  }
  if (skipped.length) console.log(`Skipped ${skipped.length} non-build commits.`);
  // Newest first by build number (not by date; history contains reverts and
  // out-of-order hotfixes, e.g. a 1.25 hotfix released after the first 1.26).
  return [...byBuild.values()].sort((a, b) => {
    const A = a.build.split('.').map(Number);
    const B = b.build.split('.').map(Number);
    return B[0] - A[0] || B[1] - A[1] || B[2] - A[2];
  });
}

updateUpstream();
const versions = detectVersions();
const head = git(['-C', UPSTREAM_DIR, 'rev-parse', 'origin/main']).trim();
const dest = path.join(DATA_DIR, 'versions.json');
const prev = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : null;
if (prev?.upstreamHead === head && JSON.stringify(prev.versions) === JSON.stringify(versions)) {
  console.log(`versions.json unchanged (${versions.length} versions).`);
} else {
  writeJson(dest, {
    fetchedAt: new Date().toISOString(),
    upstreamHead: head,
    versions,
  });
}

console.log(`Found ${versions.length} versions:`);
for (const v of versions) console.log(`  ${v.label}  build ${v.build}  rev ${v.rev}  ${v.date}  ${v.sha.slice(0, 10)}`);
