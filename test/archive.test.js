import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, lastPacked, ARCHIVE_MARK, pageInner, pageMeta } from '../src/generate/html.js';
import { pageExceptions, unpackPage, fillArchiveTemplate, locateArchive } from '../src/generate/archive.js';

test('unchanged rels are absent from the exception map', () => {
  const latest = new Map([['class/Foo/', 'aaa'], ['class/Bar/', 'bbb']]);
  const archive = new Map([['class/Foo/', 'aaa'], ['class/Bar/', 'ccc'], ['class/Old/', 'ddd']]);
  assert.deepEqual(pageExceptions(archive, latest), {
    'class/Bar/': 'ccc',
    'class/Old/': 'ddd',
  });
});

test('locateArchive splits /v/<build>/… and adds a trailing slash', () => {
  assert.deepEqual(locateArchive('/v/1.24.1/class/Foo/'), { build: '1.24.1', rel: 'class/Foo/' });
  assert.deepEqual(locateArchive('/v/1.24.1/class/Foo'), { build: '1.24.1', rel: 'class/Foo/' });
  assert.deepEqual(locateArchive('/v/1.24.1/search.json'), { build: '1.24.1', rel: 'search.json' });
  assert.equal(locateArchive('/class/Foo/'), null);
});

test('packed inners round-trip through the archive template', () => {
  const html = layout({
    title: 'Foo',
    base: '../../',
    versionPath: 'class/Foo/',
    description: 'A class',
    active: 'classes/',
    content: '<h1>Foo</h1><p>hello</p>',
  });
  const { meta, inner } = unpackPage(lastPacked);
  assert.equal(meta.title, 'Foo · DayZ Scripts');
  assert.equal(meta.base, '../../');
  assert.equal(meta.vpath, 'class/Foo/');
  assert.match(inner, /<h1>Foo<\/h1>/);
  assert.doesNotMatch(inner, /<!DOCTYPE html>/);

  const tpl = layout({
    title: ARCHIVE_MARK.title,
    description: ARCHIVE_MARK.desc,
    base: ARCHIVE_MARK.base,
    versionPath: ARCHIVE_MARK.vpath,
    content: ARCHIVE_MARK.inner,
    footer: false,
  });
  const filled = fillArchiveTemplate(tpl, meta, inner);
  assert.match(filled, /<title>Foo · DayZ Scripts<\/title>/);
  assert.match(filled, /data-base="\.\.\/\.\.\/"/);
  assert.match(filled, /<h1>Foo<\/h1>/);
  assert.match(filled, /<footer class="foot">/);
  for (const needle of ['1.29', '163709', ARCHIVE_MARK.title]) {
    assert.ok(!filled.includes(needle), `filled layout leaked ${needle}`);
  }
  assert.ok(html.includes('<h1>Foo</h1>'));
});

test('pageInner is the main of a layout, without the document chrome', () => {
  const o = { title: 'x', base: '', content: '<h1>x</h1>', versionPath: '' };
  const inner = pageInner(o);
  assert.ok(!inner.includes('<html'));
  assert.ok(inner.includes('<h1>x</h1>'));
  assert.equal(pageMeta(o).title, 'x · DayZ Scripts');
});
