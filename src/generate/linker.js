// Worker that creates a slice of dist/'s hard links.
//
// Split out because linking dominates the build: ~394k of the ~417k output
// paths are duplicates of an already-written page, and a hard link costs
// noticeably more than writing the file on APFS (~290us vs ~90us) even though
// it moves no data. The work is pure syscall latency, so it scales well across
// threads. Targets are all written before any worker starts, so a link can
// never race its source.

import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

// Flat [file, target, file, target, ...] to keep the structured clone cheap.
const { jobs } = workerData;
const dirs = new Set(); // most pages are the only entry in their directory, but cheap to check

for (let i = 0; i < jobs.length; i += 2) {
  const file = jobs[i];
  const dir = path.dirname(file);
  if (!dirs.has(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    dirs.add(dir);
  }
  fs.linkSync(jobs[i + 1], file);
}

parentPort.postMessage(jobs.length / 2);
