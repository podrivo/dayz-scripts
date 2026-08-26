// Guards the invariant that makes dist/ small: a page's bytes must depend only
// on its content, never on which build produced it. If that breaks, the
// content-addressed hard linking in src/generate/index.js silently stops
// finding duplicates and dist/ grows back from ~340 MB to ~3.2 GB with no error.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../src/generate/html.js';
import { buildSiteModel } from '../src/generate/model.js';
import { renderClass, renderEnum } from '../src/generate/render.js';
import { classDeps } from '../src/generate/memo.js';

const BUILD_A = { label: '1.29.163709', version: '1.29', build: '1.29.163709', date: '2026-08-12', sha: 'aaa' };
const BUILD_B = { label: '1.19.155390', version: '1.19', build: '1.19.155390', date: '2022-11-15', sha: 'bbb' };

/** A minimal parsed model with one class and one enum, identical in both builds. */
function model(meta) {
  return {
    ...meta,
    stats: {},
    files: [
      {
        path: 'scripts/3_game/foo.c',
        classes: [
          {
            name: 'Foo', base: 'Bar', line: 10, mods: [], attrs: [], members: [],
            methods: [{ name: 'Do', ret: 'void', params: [{ type: 'int', name: 'n' }], line: 12, mods: [] }],
          },
        ],
        enums: [{ name: 'EFoo', line: 40, values: [{ name: 'A', value: '0' }] }],
        typedefs: [], globals: [], functions: [], groups: [],
      },
    ],
  };
}

const site = (meta) => {
  const m = model(meta);
  const s = buildSiteModel(m);
  s.rawFiles = m.files;
  return s;
};

// A page nested two levels deep sits at the same depth relative to its version
// root whether it is served from / or from /v/<build>/, so base matches too.
// xref matches what the latest build passes: caller lists are only shown there,
// and that is the case worth testing.
const ctx = (s) => ({ site: s, versions: [], base: '../../', root: '../../', versionPath: 'class/Foo/', xref: true });

test('layout carries no build identity', () => {
  const opts = { title: 'Foo', base: '../../', versionPath: 'class/Foo/', content: '<p>x</p>' };
  assert.equal(layout(opts), layout(opts));

  const html = layout(opts);
  for (const needle of ['1.29', '1.19', '163709', '155390', '2026-08-12']) {
    assert.ok(!html.includes(needle), `layout leaked ${needle}`);
  }
});

test('layout links assets absolutely so a page works at any depth', () => {
  const html = layout({ title: 'Foo', base: '../../', versionPath: 'class/Foo/', content: '' });
  assert.ok(html.includes('href="/assets/styles.css"'));
  assert.ok(html.includes('src="/assets/app.js"'));
  assert.ok(html.includes('href="/assets/favicon.svg"'));
  assert.ok(!html.includes('../../assets/'), 'assets must not be relative');
});

test('the sidebar is the tree Doxygen had, and marks the page once', () => {
  const html = layout({ title: 'x', base: '', active: 'globals/typedefs/', versionPath: '', content: '' });
  const labels = [
    'Welcome', 'Modules', 'Data Structures', 'Data Structure Index', 'Class Hierarchy',
    'Data Fields', 'Files', 'File List', 'Globals', 'Typedefs', 'Enumerator', 'Macros', 'Changelog',
  ];
  for (const l of labels) assert.ok(html.includes(`>${l}</a>`), `sidebar is missing ${l}`);
  assert.equal(html.match(/ active"/g).length, 1, 'exactly one entry is the current page');
  assert.equal(html.match(/<details class="nav-sec" open>/g).length, 2, 'Files and Globals are open');
});

test('a section that repeats itself as its first child marks the child', () => {
  const html = layout({ title: 'x', base: '', active: 'annotated/', versionPath: '', content: '' });
  assert.ok(html.includes('<a class="nav-sub active" href="annotated/"'));
  assert.ok(!html.includes('nav-item active'), 'the heading is not marked as well');
});

// The module topics differ from build to build, so they are fetched from
// nav.json rather than written into the page. Were they inlined, no page would
// be reusable across a build that added a topic, and every page reused across
// one would show the sidebar of whichever build first rendered it.
test('pages do not change when the module tree around them does', () => {
  const withTopic = (meta, topic) => {
    const m = model(meta);
    m.files[0].groups = [{ name: topic, title: `${topic} constants`, define: true }];
    const s = buildSiteModel(m);
    s.rawFiles = m.files;
    return s;
  };
  const a = withTopic(BUILD_A, 'Physics');
  const b = withTopic(BUILD_B, 'Rendering');
  assert.notDeepEqual(a.moduleRoots, b.moduleRoots, 'the builds really do differ');
  assert.equal(renderClass(ctx(a), a.classes.get('Foo')), renderClass(ctx(b), b.classes.get('Foo')));
});

test('class page is byte-identical across builds when its content is unchanged', () => {
  const a = renderClass(ctx(site(BUILD_A)), site(BUILD_A).classes.get('Foo'));
  const b = renderClass(ctx(site(BUILD_B)), site(BUILD_B).classes.get('Foo'));
  assert.equal(a, b);
});

test('enum page is byte-identical across builds when its content is unchanged', () => {
  const a = renderEnum(ctx(site(BUILD_A)), site(BUILD_A).enums.get('EFoo'));
  const b = renderEnum(ctx(site(BUILD_B)), site(BUILD_B).enums.get('EFoo'));
  assert.equal(a, b);
});

// A class page lists where each of its methods is called from, so an edit to
// some unrelated file can change it while the class itself is untouched. That
// makes it the one page whose memo key is not derivable from its own subject,
// and if classDeps ever stops covering it the reused page keeps the callers of
// whichever build rendered it first.
test('a class page depends on callers declared outside it', () => {
  const withCaller = (meta, callerName) => {
    const m = model(meta);
    m.files[0].classes.push({
      name: 'Caller', line: 60, mods: [], attrs: [], members: [],
      methods: [{ name: callerName, ret: 'void', params: [], line: 62, mods: [], calls: ['Do'] }],
    });
    const s = buildSiteModel(m);
    s.rawFiles = m.files;
    return s;
  };
  const a = withCaller(BUILD_A, 'Early');
  const b = withCaller(BUILD_A, 'Late');

  const foo = a.classes.get('Foo');
  assert.match(renderClass(ctx(a), foo), /Early/, 'the caller reaches the page');
  assert.notEqual(
    renderClass(ctx(a), foo),
    renderClass(ctx(b), b.classes.get('Foo')),
    'the page really does differ between the two'
  );
  assert.notEqual(
    classDeps(a, foo),
    classDeps(b, b.classes.get('Foo')),
    'so its memo key must differ too'
  );
});

// The other direction of the same graph. A name a method calls is printed as a
// link only while one class in the build declares it, so a second class picking
// up that name turns the link to plain text on every page that calls it —
// again without the calling class changing at all.
test('a class page depends on whether the names it calls are still unambiguous', () => {
  const withRival = (rivals) => {
    const m = model(BUILD_A);
    m.files[0].classes[0].methods[0].calls = ['Helper'];
    m.files[0].classes.push({
      name: 'Tools', line: 60, mods: [], attrs: [], members: [],
      methods: [{ name: 'Helper', ret: 'void', params: [], line: 62, mods: [] }],
    });
    for (const r of rivals) {
      m.files[0].classes.push({
        name: r, line: 80, mods: [], attrs: [], members: [],
        methods: [{ name: 'Helper', ret: 'void', params: [], line: 82, mods: [] }],
      });
    }
    const s = buildSiteModel(m);
    s.rawFiles = m.files;
    return s;
  };
  const alone = withRival([]);
  const shared = withRival(['Other']);

  const foo = alone.classes.get('Foo');
  assert.match(renderClass(ctx(alone), foo), /class\/Tools\/#Helper/, 'a lone declaration is linked');
  assert.doesNotMatch(
    renderClass(ctx(shared), shared.classes.get('Foo')),
    /class\/Tools\/#Helper/,
    'a name two classes declare is not'
  );
  assert.notEqual(
    classDeps(alone, foo),
    classDeps(shared, shared.classes.get('Foo')),
    'so its memo key must differ too'
  );
});

test('a class page without docs does not fall back to a versioned description', () => {
  const html = renderClass(ctx(site(BUILD_A)), site(BUILD_A).classes.get('Foo'));
  const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
  assert.ok(desc.length > 0);
  assert.ok(!/\d+\.\d+/.test(desc), `description leaked a version: ${desc}`);
});
