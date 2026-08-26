// The diff is computed once per build, against the build before it, and that is
// the only comparison the generator ever makes. Everything /compare/ offers is
// a run of those folded together in the browser, so the property this file
// exists to hold is that folding a run gives the same answer as diffing its
// endpoints directly. If it stops being true, the compare page starts quietly
// lying about builds that are not neighbours, and nothing else would notice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile } from '../src/parser/index.js';
import { buildSiteModel } from '../src/generate/model.js';
import { diffModels, ADDED, REMOVED, CHANGED, DIFF_KINDS } from '../src/generate/diff.js';
import { foldDiffs, invert } from '../site/compare.js';

function site(source) {
  const model = {
    label: '1.0.0', version: '1.0', build: '1.0.0', date: '2026-01-01', sha: 'x',
    stats: {}, files: [parseFile(source, 'scripts/3_game/foo.c').model],
  };
  const s = buildSiteModel(model);
  s.rawFiles = model.files;
  return s;
}

/** The kinds, as diffModels keys them. */
const KEYS = DIFF_KINDS.map(([k]) => k);

test('every kind is reported, and an unchanged build reports nothing', () => {
  const src = `
class Foo { int m_A; void Do(int n); }
enum EFoo { A, B }
typedef int TFoo;
const int SOME_CONST = 1;
void Helper(string s);
#define SOME_MACRO 2
`;
  const diff = diffModels(site(src), site(src));
  assert.deepEqual(Object.keys(diff).sort(), [...KEYS].sort(), 'a kind went missing');
  for (const k of KEYS) {
    assert.deepEqual(diff[k], { added: [], removed: [], changed: [] }, `${k} invented a change`);
  }
});

// The four flat kinds were the changelog's blind spot for a long time: a global
// function or a macro a build quietly dropped breaks a mod exactly as hard as a
// class does, and the diff said nothing at all about it.
test('globals, functions, typedefs and macros are compared, not just classes', () => {
  const before = site(`
typedef int TKeep;
typedef int TGone;
const int KEPT = 1;
const int RETYPED = 1;
void Gone();
void Retyped(int a);
#define KEPT_MACRO 1
#define GONE_MACRO 1
`);
  const after = site(`
typedef int TKeep;
typedef float TNew;
const int KEPT = 1;
const float RETYPED = 1;
void Added();
void Retyped(string a);
#define KEPT_MACRO 1
#define NEW_MACRO 1
`);
  const d = diffModels(after, before);

  assert.deepEqual(d.typedef.added, ['TNew']);
  assert.deepEqual(d.typedef.removed, ['TGone']);
  assert.deepEqual(d.const.changed.map((c) => c.name), ['RETYPED']);
  assert.deepEqual(d.func.added, ['Added']);
  assert.deepEqual(d.func.removed, ['Gone']);
  assert.deepEqual(d.func.changed.map((c) => c.name), ['Retyped']);
  assert.deepEqual(d.macro.added, ['NEW_MACRO']);
  assert.deepEqual(d.macro.removed, ['GONE_MACRO']);

  // A kind with nothing inside it still reports the one before-and-after row,
  // so that every kind has the same shape for the page to walk.
  const [row] = d.func.changed[0].rows;
  assert.equal(row[0], CHANGED);
  assert.equal(row[1], 'Retyped');
  assert.match(row[2], /int a/);
  assert.match(row[3], /string a/);
});

// This was wrong for a long time and nobody could tell, because the changelog
// it fed had no baseline to be wrong against. Methods were indexed by name
// alone, so a name with two overloads kept only whichever was declared last;
// every other overload was then compared against that one and reported as a
// signature change. Every overloaded method in the build was flagged on every
// build, forever — 64 of the 66 classes the last release "changed" were this.
test('a method with several overloads is unchanged while its overloads are', () => {
  const src = `
class Foo
{
  proto native bool Play();
  int Play(VideoCommand cmd);
}`;
  assert.deepEqual(diffModels(site(src), site(src)).class.changed, []);

  // Declaring them the other way round is not a change either.
  const swapped = `
class Foo
{
  int Play(VideoCommand cmd);
  proto native bool Play();
}`;
  assert.deepEqual(diffModels(site(swapped), site(src)).class.changed, [], 'declaration order is not API');

  // Losing one of them is.
  const one = 'class Foo { proto native bool Play(); }';
  const lost = diffModels(site(one), site(src)).class.changed;
  assert.equal(lost.length, 1, 'dropping an overload is a change');
  assert.equal(lost[0].rows[0][1], 'Play');
});

test('a row names its member, so a fold can match it across builds', () => {
  const before = site('class Foo { void Kept(); void Gone(); void Retyped(int a); }');
  const after = site('class Foo { void Kept(); void Added(); void Retyped(string a); }');
  const rows = diffModels(after, before).class.changed[0].rows;
  const by = new Map(rows.map((r) => [r[1], r]));

  assert.equal(by.get('Added')[0], ADDED);
  assert.equal(by.get('Gone')[0], REMOVED);
  assert.equal(by.get('Retyped')[0], CHANGED);
  assert.ok(!by.has('Kept'), 'an untouched member must not be reported');
  for (const r of rows) assert.equal(typeof r[1], 'string', 'every row carries a member name');
});

// ---------------------------------------------------------------------------
// The fold. Each case is a chain of builds; folding every adjacent diff along
// it has to equal diffing the first against the last.

/** Adjacent diffs along a chain of sources, oldest first. */
const chain = (sources) => {
  const sites = sources.map(site);
  return sites.slice(1).map((s, i) => diffModels(s, sites[i]));
};

/** Compare folding a chain against diffing its two ends. */
function assertFoldsToDirect(sources, what) {
  const sites = sources.map(site);
  const direct = diffModels(sites[sites.length - 1], sites[0]);
  const folded = foldDiffs(chain(sources));
  for (const k of KEYS) {
    assert.deepEqual(folded[k], direct[k], `${what}: folded ${k} does not match a direct diff`);
  }
}

test('folding two builds is the same as diffing them', () => {
  assertFoldsToDirect([
    'class Foo { void A(); }',
    'class Foo { void A(); void B(); }',
  ], 'one step');
});

test('a member added in one build and changed in the next folds to one addition', () => {
  assertFoldsToDirect([
    'class Foo { void A(); }',
    'class Foo { void A(); void B(int x); }',
    'class Foo { void A(); void B(string x); }',
  ], 'add then change');
});

test('a member changed twice folds to the first signature against the last', () => {
  const folded = foldDiffs(chain([
    'class Foo { void A(int x); }',
    'class Foo { void A(float x); }',
    'class Foo { void A(string x); }',
  ]));
  const [row] = folded.class.changed[0].rows;
  assert.equal(row[0], CHANGED);
  assert.match(row[2], /int x/, 'the before is the oldest build');
  assert.match(row[3], /string x/, 'the after is the newest build');
  assert.doesNotMatch(row[2] + row[3], /float/, 'the build in the middle is not part of the answer');
});

test('a member added and then removed again is reported by neither end', () => {
  assertFoldsToDirect([
    'class Foo { void A(); }',
    'class Foo { void A(); void Temp(); }',
    'class Foo { void A(); }',
  ], 'add then remove');
  const folded = foldDiffs(chain([
    'class Foo { void A(); }',
    'class Foo { void A(); void Temp(); }',
    'class Foo { void A(); }',
  ]));
  assert.deepEqual(folded.class.changed, [], 'a member that came and went is not a change');
});

test('a member removed and then put back is reported by neither end', () => {
  assertFoldsToDirect([
    'class Foo { void A(); void B(); }',
    'class Foo { void A(); }',
    'class Foo { void A(); void B(); }',
  ], 'remove then restore');
});

test('a class added mid-chain is an addition, not a change', () => {
  assertFoldsToDirect([
    'class Foo { void A(); }',
    'class Foo { void A(); }\nclass Bar { void B(); }',
    'class Foo { void A(); }\nclass Bar { void B(); void C(); }',
  ], 'class added then extended');
});

test('a class present at neither end is not reported at all', () => {
  const folded = foldDiffs(chain([
    'class Foo { void A(); }',
    'class Foo { void A(); }\nclass Temp { void T(); }',
    'class Foo { void A(); }',
  ]));
  assert.deepEqual(folded.class.added, []);
  assert.deepEqual(folded.class.removed, []);
  assert.deepEqual(folded.class.changed, []);
});

test('the fold spans every kind, over a chain that touches all six', () => {
  assertFoldsToDirect([
    `class Foo { int m_A; void Do(int n); }
enum EFoo { A }
typedef int TFoo;
const int C1 = 1;
void Fn(int a);
#define M1 1`,
    `class Foo { int m_A; float m_B; void Do(float n); }
enum EFoo { A, B }
typedef float TFoo;
const int C1 = 1;
const int C2 = 2;
void Fn(int a);
void Fn2();
#define M1 2`,
    `class Foo { float m_B; void Do(float n); }
class Extra { void E(); }
enum EFoo { A, B, C }
typedef float TFoo;
const int C2 = 2;
void Fn2();
#define M1 2
#define M2 1`,
  ], 'all kinds');
});

// Swapping the two pickers does not fetch anything or fold anything a second
// time; it turns the answer it already has inside out. That is only honest if
// the inversion lands on exactly the comparison the other direction would have
// produced, which is what this checks — against diffModels, which knows nothing
// about the browser and would have to be wrong in the same way to agree.
test('swapping the two builds gives the comparison the other way round', () => {
  const older = site(`
class Foo { void Kept(); void Gone(); void Retyped(int a); }
class Dropped { void D(); }
enum EFoo { A, B }
typedef int TGone;
const int C1 = 1;
void Fn(int a);
#define M1 1`);
  const newer = site(`
class Foo { void Kept(); void Added(); void Retyped(string a); }
class Fresh { void F(); }
enum EFoo { A, C }
typedef int TNew;
const float C1 = 1;
void Fn(string a);
#define M1 2`);

  const forwards = diffModels(newer, older);
  const backwards = diffModels(older, newer);
  for (const k of KEYS) {
    assert.deepEqual(invert(forwards)[k], backwards[k], `${k} does not invert to the reverse diff`);
  }

  // And it is its own undo, so swapping twice is where you started.
  for (const k of KEYS) assert.deepEqual(invert(invert(forwards))[k], forwards[k]);

  // Not vacuous: the fixtures have to exercise all three of the operations.
  assert.ok(forwards.class.added.length && forwards.class.removed.length && forwards.class.changed.length);
});

test('an empty run of diffs folds to no changes', () => {
  const folded = foldDiffs([]);
  for (const k of KEYS) {
    assert.deepEqual(folded[k], { added: [], removed: [], changed: [] }, `${k} invented a change`);
  }
});
