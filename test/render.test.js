// Guards the invariant that makes dist/ small: a page's bytes must depend only
// on its content, never on which build produced it. If that breaks, archived
// builds stop sharing bodies with the latest copy and dist/ grows with no error.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, SITE_TITLE } from '../src/generate/html.js';
import { buildSiteModel } from '../src/generate/model.js';
import { renderClass, renderEnum, renderCompare, renderFields } from '../src/generate/render.js';
import { classDeps } from '../src/generate/memo.js';
import { SITE_URL } from '../src/generate/content.js';

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
  // A module, because /assets/app.js imports the features in site/app/ by
  // relative path; the generator has to copy that directory across too.
  assert.ok(html.includes('<script type="module" src="/assets/app.js"></script>'));
  assert.ok(html.includes('href="/assets/favicon.svg"'));
  assert.ok(!html.includes('../../assets/'), 'assets must not be relative');
});

test('the nav names the DayZ-facing sections, and marks the page once', () => {
  const html = layout({ title: 'x', base: '', active: 'globals/typedefs/', versionPath: '', content: '' });
  const labels = [
    'Topics', 'Classes', 'Index', 'Hierarchy',
    'Members', 'Methods', 'Fields', 'Globals', 'Files', 'Constants', 'Typedefs', 'Enums', 'Values', 'Macros', 'Changelog',
  ];
  for (const l of labels) assert.ok(html.includes(`>${l}</a>`), `nav is missing ${l}`);
  assert.ok(html.includes('href="classes/"'), 'Classes is /classes/');
  assert.ok(html.includes('href="classes/index/"'), 'Index is /classes/index/');
  assert.ok(html.includes('href="classes/fields/"'), 'Members is /classes/fields/');
  assert.ok(html.includes('href="classes/fields/functions/"'), 'Methods is /classes/fields/functions/');
  assert.ok(html.includes('href="classes/fields/variables/"'), 'Fields is /classes/fields/variables/');
  assert.ok(html.includes('>All topics</a>'), 'Topics menu starts with All topics');
  assert.ok(!html.includes('>Modules</a>'));
  assert.ok(!html.includes('>Data Structures</a>'));
  assert.ok(!html.includes('>Data Structure Index</a>'));
  assert.ok(!html.includes('>Class Hierarchy</a>'));
  assert.ok(!html.includes('>Data Fields</a>'));
  assert.ok(html.includes('href="changelog/"'), 'Changelog is /changelog/');
  assert.ok(!html.includes('href="annotated/"'));
  assert.ok(!html.includes('href="changes/"'));
  assert.ok(!html.includes('href="compare/"'));
  assert.ok(!html.includes('>Welcome</a>'), 'the brand is home; Welcome is not repeated');
  assert.ok(!html.includes('>File List</a>'), 'Files is a link, not a menu of File List plus Globals');
  assert.equal(html.match(/nav-(?:item|sub) active"/g).length, 1, 'exactly one entry is the current page');
  assert.ok(html.includes('<a class="nav-item on" href="globals/"'), 'Globals is the current section');
  assert.ok(html.includes('<details class="nav-sec nav-here">'), 'Globals is current but shut');
  assert.ok(!html.includes('nav-sec nav-here" open'), 'menus are not served open');
});

test('a section that repeats itself as its first child marks the child', () => {
  const html = layout({ title: 'x', base: '', active: 'classes/', versionPath: '', content: '' });
  assert.ok(html.includes('<a class="nav-sub active" href="classes/"'));
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

// The compare page is the one page whose whole subject is which builds exist,
// so it is also the most tempting place to write a build number into the HTML.
// It must not: the pickers are filled from /assets/versions.json client-side,
// which is what keeps one copy of these bytes serving all 49 builds.
test('the compare page names no build', () => {
  const cmp = (s) => renderCompare({ site: s, versions: [], base: '../', root: '../', versionPath: 'changelog/' });
  assert.equal(cmp(site(BUILD_A)), cmp(site(BUILD_B)));
  const html = cmp(site(BUILD_A));
  for (const needle of ['1.29', '1.19', '163709', '155390', '2026-08-12']) {
    assert.ok(!html.includes(needle), `compare page leaked ${needle}`);
  }
  assert.match(html, /id="compare"/, 'the container compare.js fills must be there');
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

// The canonical URL is the one absolute URL a page carries, so it is also the
// one place a build number could leak back into the bytes. It names the page
// at the site root instead, which is both the right answer for a crawler
// looking at an archived build and the only one that keeps a page reusable.
test('canonical and og:url name the page, never the build that rendered it', () => {
  const html = layout({ title: 'Foo', base: '../../', versionPath: 'class/Foo/', content: '' });
  const canon = html.match(/<link rel="canonical" href="([^"]*)">/)[1];
  assert.equal(canon, `${SITE_URL}/class/Foo/`);
  assert.ok(!canon.includes('/v/'), 'canonical must not name a build');
  assert.ok(html.includes(`<meta property="og:url" content="${canon}">`), 'og:url must agree with it');
  assert.equal(html.match(/<meta property="og:title" content="([^"]*)">/)[1], `Foo · Class · ${SITE_TITLE}`);
});

test('fields letter pages are a shell, not an inlined member list', () => {
  const s = site(BUILD_A);
  const letters = [...s.fields.keys()].sort();
  const html = renderFields(
    { site: s, versions: [], base: '../../../', root: '../../../', versionPath: 'classes/fields/d/', xref: true },
    'd',
    letters,
    'all'
  );
  assert.match(html, /id="fieldsList"/);
  assert.doesNotMatch(html, /<dd>/);
  assert.match(html, /data-letter="d"/);
});

test('the 404 page asks not to be indexed and claims no canonical', () => {
  const html = layout({ title: 'Not found', base: '/', versionPath: '', noindex: true, content: '' });
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.ok(!html.includes('rel="canonical"'), '404 must not claim to be a page');
});

test('a class page without docs does not fall back to a versioned description', () => {
  const html = renderClass(ctx(site(BUILD_A)), site(BUILD_A).classes.get('Foo'));
  const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
  assert.ok(desc.length > 0);
  assert.ok(!/\d+\.\d+/.test(desc), `description leaked a version: ${desc}`);
});
