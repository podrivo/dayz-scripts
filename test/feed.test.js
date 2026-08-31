// The feed is a promise to strangers' feed readers: entry ids must never
// change, dates must be the builds' own, and rendering twice must give the
// same bytes — a generation timestamp would make every verify run a diff.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderFeed } from '../src/generate/feed.js';
import { SITE_URL, FORUM_THREADS } from '../src/generate/content.js';

// Real builds, so the forum-thread lookup exercises the real table.
const versions = [
  { label: '1.29.163709', version: '1.29', build: '1.29.163709', date: '2026-08-12' },
  { label: '1.29.162510', version: '1.29', build: '1.29.162510', date: '2026-04-08' },
  { label: '1.28.161464', version: '1.28', build: '1.28.161464', date: '2025-12-04' },
];

const feed = renderFeed(versions);

test('an Atom feed with one entry per build, newest first', () => {
  assert.match(feed, /^<\?xml version="1.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/);
  const ids = [...feed.matchAll(/<id>([^<]+)<\/id>/g)].map((m) => m[1]);
  assert.deepEqual(ids, [
    `${SITE_URL}/feed.xml`,
    `${SITE_URL}/v/1.29.163709/`,
    `${SITE_URL}/v/1.29.162510/`,
    `${SITE_URL}/v/1.28.161464/`,
  ]);
});

test('the feed is stamped with the newest build date, not the render date', () => {
  assert.match(feed, /<updated>2026-08-12T00:00:00Z<\/updated>/);
  assert.equal(renderFeed(versions), feed);
});

test('an entry links its docs, its diff, and its release notes', () => {
  const entry = feed.slice(feed.indexOf('<entry>'), feed.indexOf('</entry>'));
  assert.match(entry, /<title>DayZ 1.29 Update 2 \(1.29.163709\)<\/title>/);
  assert.ok(entry.includes(esc(`${SITE_URL}/changelog/?from=1.29.162510&to=1.29.163709`)), 'no diff link');
  assert.ok(entry.includes(esc(FORUM_THREADS['1.29.163709'].url)), 'no release notes link');
});

test('the oldest build has nothing to diff against and says so gently', () => {
  const last = feed.slice(feed.lastIndexOf('<entry>'));
  assert.ok(last.includes(esc(`${SITE_URL}/changelog/`)), 'no changelog link');
  assert.ok(!last.includes('?from='), 'a diff against a build the feed does not know');
});

/** Entry content is type="html", so its markup arrives XML-escaped. */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
