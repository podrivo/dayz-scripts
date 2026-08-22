// Clones/updates the official DayZ-Script-Diff repository and maps its
// commit history to DayZ versions. Each commit message looks like:
//   "Build 1.29.163709, Scripts Rev. 125372"
// Multiple commits share a minor version (hotfix updates); we document the
// newest commit of each minor version (1.29, 1.28, ...).

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
  const byLabel = new Map(); // "1.29" -> newest matching commit (log is newest-first)
  const skipped = [];
  for (const line of log.trim().split('\n')) {
    const [sha, date, subject] = line.split('\t');
    const m = subject.match(BUILD_RE);
    if (!m) {
      skipped.push(subject);
      continue;
    }
    const label = `${m[1]}.${m[2]}`;
    if (!byLabel.has(label)) {
      byLabel.set(label, {
        label,
        build: `${m[1]}.${m[2]}.${m[3]}`,
        rev: Number(m[4]),
        sha,
        date: date.slice(0, 10),
      });
    }
  }
  if (skipped.length) console.log(`Skipped ${skipped.length} non-build commits.`);
  // Newest first by version number (not by date; history contains reverts).
  return [...byLabel.values()].sort((a, b) => {
    const [amaj, amin] = a.label.split('.').map(Number);
    const [bmaj, bmin] = b.label.split('.').map(Number);
    return bmaj - amaj || bmin - amin;
  });
}

updateUpstream();
const versions = detectVersions();
const head = git(['-C', UPSTREAM_DIR, 'rev-parse', 'origin/main']).trim();

writeJson(path.join(DATA_DIR, 'versions.json'), {
  fetchedAt: new Date().toISOString(),
  upstreamHead: head,
  versions,
});

console.log(`Found ${versions.length} versions:`);
for (const v of versions) console.log(`  ${v.label}  build ${v.build}  rev ${v.rev}  ${v.date}  ${v.sha.slice(0, 10)}`);
