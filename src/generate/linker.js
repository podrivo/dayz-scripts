// Worker that does dist/'s filesystem work: writing the pages that hold a
// distinct body, and hard-linking every other URL to one of them.
//
// Split out because this dominates the build. ~394k of the ~417k output paths
// are duplicates of an already-written page, and on APFS a hard link costs
// more than writing the file it points at (~1.4ms vs ~360us single-threaded)
// even though it moves no data. The cost is syscall latency rather than CPU,
// so it scales across threads — measured ~660 links/s on one, ~3,300 on ten,
// ~3,800 on twenty — and it overlaps with rendering for free.
//
// Ordering is the parent's job and rests on two rules: a page's bytes and
// every link pointing at them are always sent to the same worker, and within a
// batch the writes are done before the links. Together those mean a link can
// never run before the file it targets exists.

import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';

const dirs = new Set(); // most pages are the only entry in their directory, but cheap to check

// Linking is by far the longest phase of a full build, so tick often enough
// that the parent can show it moving even on a short run, where a whole batch
// is only a few thousand links. The parent throttles the redraw, so the only
// cost here is the message itself.
const TICK = 500;

const clock = () => process.hrtime.bigint();
const since = (t) => Number(process.hrtime.bigint() - t) / 1e6;

function ensureDir(file) {
  const dir = path.dirname(file);
  if (dirs.has(dir)) return 0;
  const t = clock();
  fs.mkdirSync(dir, { recursive: true });
  dirs.add(dir);
  return since(t);
}

parentPort.on('message', ({ writes, links }) => {
  let mkdirMs = 0;
  let writeMs = 0;
  let linkMs = 0;
  let wrote = 0;

  // Flat [file, body, ...] so the structured clone stays a copy of the strings
  // and nothing else.
  for (let i = 0; i < writes.length; i += 2) {
    mkdirMs += ensureDir(writes[i]);
    const t = clock();
    fs.writeFileSync(writes[i], writes[i + 1]);
    writeMs += since(t);
    wrote++;
  }

  // Links arrive as one newline-joined [file, target, ...] string: paths
  // cannot contain a newline, and a single string is far cheaper to clone than
  // the tens of thousands of separate ones a build produces.
  let sinceTick = 0;
  if (links) {
    const jobs = links.split('\n');
    for (let i = 0; i < jobs.length; i += 2) {
      mkdirMs += ensureDir(jobs[i]);
      const t = clock();
      fs.linkSync(jobs[i + 1], jobs[i]);
      linkMs += since(t);
      if (++sinceTick === TICK) {
        parentPort.postMessage({ linked: sinceTick });
        sinceTick = 0;
      }
    }
  }

  // sinceTick carries the links made after the last tick, so the parent's
  // running total ends up exact rather than rounded down to a multiple of TICK.
  parentPort.postMessage({ linked: sinceTick, wrote, batchDone: true, mkdirMs, writeMs, linkMs });
});
