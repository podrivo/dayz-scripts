import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile } from '../src/parser/index.js';
import { buildSiteModel } from '../src/generate/model.js';
import { diffModels } from '../src/generate/diff.js';
import {
  seedHistory, applyDiff, serializeHistory, buildHistory,
  seedTimelines, applyTimeline, serializeTimelines, buildHistoryAssets,
} from '../src/generate/history.js';

function site(source, build) {
  const model = {
    label: build, version: build, build, date: '2026-01-01', sha: 'x',
    stats: {}, files: [parseFile(source, 'scripts/3_game/foo.c').model],
  };
  const s = buildSiteModel(model);
  s.rawFiles = model.files;
  return s;
}

test('a type in the oldest build is recorded there, not as a later addition', () => {
  const a = site('class Foo { void A(); } enum E { X }', '1.19.1');
  const hist = seedHistory(a);
  assert.equal(hist.class.get('Foo').added, '1.19.1');
  assert.equal(hist.enum.get('E').added, '1.19.1');
  assert.equal(hist.class.get('Foo').members.size, 0);
});

test('a class added later, and a member added then changed, keep those builds', () => {
  const a = site('class Foo { void A(); }', '1.19.1');
  const b = site('class Foo { void A(); } class Bar { void B(); }', '1.24.1');
  const c = site('class Foo { void A(); void Extra(); } class Bar { void B(); }', '1.24.2');
  const d = site('class Foo { void A(); void Extra(int n); } class Bar { void B(); }', '1.28.1');

  const hist = seedHistory(a);
  applyDiff(hist, diffModels(b, a), b.build);
  applyDiff(hist, diffModels(c, b), c.build);
  applyDiff(hist, diffModels(d, c), d.build);

  assert.equal(hist.class.get('Foo').added, '1.19.1');
  assert.equal(hist.class.get('Bar').added, '1.24.1');
  assert.equal(hist.class.get('Foo').members.get('Extra').added, '1.24.2');
  assert.equal(hist.class.get('Foo').members.get('Extra').changed, '1.28.1');
  assert.ok(!hist.class.get('Foo').members.has('A'));
});

test('serializeHistory packs newest-first indices and omits silent members', () => {
  const a = site('class Foo { void A(); }', '1.19.1');
  const b = site('class Foo { void A(); void Extra(); } class Bar {}', '1.24.1');
  const hist = seedHistory(a);
  applyDiff(hist, diffModels(b, a), b.build);

  const versions = [
    { build: '1.24.1' },
    { build: '1.19.1' },
  ];
  const packed = serializeHistory(hist, versions);
  assert.deepEqual(packed.builds, ['1.24.1', '1.19.1']);
  assert.equal(packed.class.Foo[0], 1, 'Foo is as old as the archive');
  assert.equal(packed.class.Foo[1].Extra, 0, 'Extra was added in the newest');
  assert.equal(packed.class.Bar, 0);
});

test('buildHistory walks a list the same way generate accumulates', () => {
  const versions = [
    { label: '1.24.1', build: '1.24.1' },
    { label: '1.19.1', build: '1.19.1' },
  ];
  const sites = {
    '1.19.1': site('class Foo { void A(); }', '1.19.1'),
    '1.24.1': site('class Foo { void A(); void Extra(); }', '1.24.1'),
  };
  const packed = buildHistory(versions, (label) => sites[label]);
  assert.equal(packed.class.Foo[1].Extra, 0);
});

test('serializeTimelines packs a later add and a member change, newest first', () => {
  const a = site('class Foo { void A(); }', '1.19.1');
  const b = site('class Foo { void A(); void Extra(); } class Bar {}', '1.24.1');
  const c = site('class Foo { void A(); void Extra(int n); } class Bar {}', '1.28.1');

  const hist = seedHistory(a);
  const timelines = seedTimelines();
  applyDiff(hist, diffModels(b, a), b.build);
  applyTimeline(timelines, diffModels(b, a), b.build);
  applyDiff(hist, diffModels(c, b), c.build);
  applyTimeline(timelines, diffModels(c, b), c.build);

  const versions = [
    { build: '1.28.1' },
    { build: '1.24.1' },
    { build: '1.19.1' },
  ];
  const packed = serializeTimelines(timelines, hist, versions);
  const counts = serializeHistory(hist, versions, timelines).changes;

  assert.deepEqual(packed.builds, ['1.28.1', '1.24.1', '1.19.1']);
  assert.deepEqual(counts.class.Bar, [1]);
  assert.deepEqual(counts.class.Foo, [0, 1]);
  assert.equal(packed.class.Bar[0][0], 1, 'Bar was added in 1.24.1');
  assert.equal(packed.class.Bar[0][1], 1);
  assert.deepEqual(packed.class.Bar[0][2], []);
  assert.equal(packed.class.Foo[0][0], 0, 'newest change first');
  assert.equal(packed.class.Foo[0][1], 0);
  assert.deepEqual(packed.class.Foo[0][2], [['~', 'Extra', 'void Extra()', 'void Extra(int n)']]);
  assert.equal(packed.class.Foo[1][0], 1);
  assert.deepEqual(packed.class.Foo[1][2], [['+', 'Extra', 'void Extra()']]);
});

test('serializeTimelines keeps events from before a remove-and-readd', () => {
  const a = site('class Foo { void A(); }', '1.19.1');
  const b = site('class Foo { void A(); } class Bar { void B(); }', '1.20.1');
  const c = site('class Foo { void A(); void Extra(); }', '1.24.1');
  const d = site('class Foo { void A(); void Extra(); } class Bar { void B(); }', '1.28.1');

  const hist = seedHistory(a);
  const timelines = seedTimelines();
  for (const [next, prev] of [[b, a], [c, b], [d, c]]) {
    const diff = diffModels(next, prev);
    applyDiff(hist, diff, next.build);
    applyTimeline(timelines, diff, next.build);
  }

  const versions = [
    { build: '1.28.1' },
    { build: '1.24.1' },
    { build: '1.20.1' },
    { build: '1.19.1' },
  ];
  const packed = serializeTimelines(timelines, hist, versions);
  assert.ok(hist.class.has('Bar'), 'badge record is the re-add');
  assert.equal(hist.class.get('Bar').added, '1.28.1');
  assert.deepEqual(
    packed.class.Bar.map((e) => [e[0], e[1]]),
    [[0, 1], [2, 1]],
    're-add (idx 0) and the earlier add (idx 2)',
  );
});

test('buildHistoryAssets walks history and timelines together', () => {
  const versions = [
    { label: '1.24.1', build: '1.24.1' },
    { label: '1.19.1', build: '1.19.1' },
  ];
  const sites = {
    '1.19.1': site('class Foo { void A(); }', '1.19.1'),
    '1.24.1': site('class Foo { void A(); void Extra(); }', '1.24.1'),
  };
  const { history, timelines } = buildHistoryAssets(versions, (label) => sites[label]);
  assert.equal(history.class.Foo[1].Extra, 0);
  assert.deepEqual(history.changes.class.Foo, [0]);
  assert.deepEqual(timelines.class.Foo, [[0, 0, [['+', 'Extra', 'void Extra()']]]]);
});
