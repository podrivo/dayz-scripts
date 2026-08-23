// Guards the invariant that makes dist/ small: a page's bytes must depend only
// on its content, never on which build produced it. If that breaks, the
// content-addressed hard linking in src/generate/index.js silently stops
// finding duplicates and dist/ grows back from ~340 MB to ~3.2 GB with no error.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../src/generate/html.js';
import { buildSiteModel } from '../src/generate/model.js';
import { renderClass, renderEnum } from '../src/generate/render.js';

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
const ctx = (s) => ({ site: s, versions: [], base: '../../', root: '../../', versionPath: 'class/Foo/' });

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

test('a class page without docs does not fall back to a versioned description', () => {
  const html = renderClass(ctx(site(BUILD_A)), site(BUILD_A).classes.get('Foo'));
  const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
  assert.ok(desc.length > 0);
  assert.ok(!/\d+\.\d+/.test(desc), `description leaked a version: ${desc}`);
});
