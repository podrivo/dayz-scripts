// The site map has two readers pulling in opposite directions: the generator
// walks every page of a build, the dev server looks one up by URL. They share
// one generator so that neither can reach a page the other cannot, which is
// the property these tests are here to hold on to.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile } from '../src/parser/index.js';
import { buildSiteModel } from '../src/generate/model.js';
import { pages, resolve } from '../src/generate/routes.js';
import { doxygenRedirect } from '../src/doxygen.js';
import { handler as doxygenHandler } from '../netlify/functions/doxygen.js';

const SOURCE = `
/** \\defgroup Topic Some topic
 * @{ */
/** A class. */
class Foo extends Bar
{
  int m_Count;
  void Do(int n);
}
/** @} */

enum EFoo { A, B }
typedef int TFoo;
`;

function fixture() {
  const model = {
    label: '1.29.0', version: '1.29', build: '1.29.0', date: '2026-01-01', sha: 'x',
    // The home page counts these out loud, so they have to be real numbers.
    stats: { files: 1, classes: 1, methods: 1, members: 1, enums: 1, typedefs: 1, globals: 0, functions: 0, documented: 1 },
    files: [parseFile(SOURCE, 'scripts/3_game/foo.c').model],
  };
  const site = buildSiteModel(model);
  site.rawFiles = model.files;
  return site;
}

const site = fixture();
const opts = { isLatest: true, versions: [] };
const all = [...pages(site, opts)];

test('archived Doxygen pages redirect to clean URLs', async () => {
  assert.equal(doxygenRedirect('/d0/d05/class_remote_player_meta.html'), '/classes/RemotePlayerMeta/');
  assert.equal(doxygenRedirect('/d0/d10/group___r_p_c.html'), '/topics/RPC/');
  assert.equal(
    doxygenRedirect('/d1/d23/_plugin_remote_player_debug_client_8c.html'),
    '/files/scripts/4_World/Plugins/PluginBase/PluginDeveloper/PluginRemotePlayerDebugClient.c/'
  );
  assert.equal(doxygenRedirect('/annotated.html'), '/classes/');
  assert.equal(doxygenRedirect('/not-a-doxygen-page.html'), null);
  const response = await doxygenHandler({ queryStringParameters: { path: 'd0/d05/class_remote_player_meta.html' } });
  assert.equal(response.statusCode, 301);
  assert.equal(response.headers.location, '/classes/RemotePlayerMeta/');
});

test('every page the generator writes is reachable by URL', () => {
  assert.ok(all.length > 20, `only ${all.length} pages`);
  for (const p of all) {
    const found = resolve(site, p.rel, opts);
    assert.ok(found, `resolve missed ${JSON.stringify(p.rel)}`);
    assert.equal(found.rel, p.rel);
    assert.equal(found.file, p.file);
    assert.equal(found.kind, p.kind);
  }
});

test('no two pages claim the same URL', () => {
  const seen = new Set();
  for (const p of all) {
    assert.ok(!seen.has(p.rel), `two pages both render ${JSON.stringify(p.rel)}`);
    seen.add(p.rel);
  }
});

test('URLs resolve to the renderer they name', () => {
  for (const [rel, kind] of [
    ['', 'index'],
    ['topics/', 'index'],
    ['topics/Topic/', 'index'],
    ['classes/', 'index'],
    ['classes/index/', 'index'],
    ['classes/f/', 'index'],
    ['classes/Foo/', 'class'],
    ['enum/EFoo/', 'enum'],
    ['globals/functions/', 'index'],
    ['globals/constants/', 'index'],
    ['hierarchy/', 'index'],
    ['files/', 'index'],
    ['changelog/', 'index'],
    ['community/', 'index'],
    ['about/', 'index'],
    ['credits/', 'index'],
    ['files/3_Game/Foo.c/', 'file'],
    ['search.json', 'search'],
    ['xref-report.json', 'search'],
  ]) {
    const p = resolve(site, rel, opts);
    assert.ok(p, `no page at ${JSON.stringify(rel)}`);
    assert.equal(p.kind, kind, `${JSON.stringify(rel)} is a ${p.kind} page`);
  }
});

test('an unknown URL resolves to nothing', () => {
  for (const rel of ['classes/Nope/', 'enum/Nope/', 'nonsense/', 'classes/Foo', 'class/Foo/', 'annotated/', 'changes/', 'compare/', 'module/Topic/', 'globals/variables/']) {
    assert.equal(resolve(site, rel, opts), null, `${JSON.stringify(rel)} resolved`);
  }
});

test('guides are available only in development', () => {
  for (const rel of ['guides/', 'guides/script-layers/', 'guides/engine-and-script/']) {
    assert.equal(resolve(site, rel, opts), null, `${rel} shipped in production`);
    const page = resolve(site, rel, { ...opts, development: true });
    assert.equal(page.kind, 'index');
    assert.match(page.render(), /^<!DOCTYPE html>/);
  }
});

test('pages go under their directory, sidecars stand alone', () => {
  assert.equal(resolve(site, 'classes/Foo/', opts).file, 'classes/Foo/index.html');
  assert.equal(resolve(site, '', opts).file, 'index.html');
  assert.equal(resolve(site, 'search.json', opts).file, 'search.json');
});

// The page count and the sitemap are both built from what this flag excludes,
// so a sidecar that stopped declaring itself would be advertised as a page.
test('only the sidecars the site fetches are marked as assets', () => {
  const assets = all.filter((p) => p.asset).map((p) => p.rel);
  assert.deepEqual(assets, [
    'diff.json',
    'files/3_Game/Foo.c/links.json',
    'search.json',
    'nav.json',
    'files.json',
    'xref-report.json',
    'api.json',
    'llms.txt',
    'agent.md',
    'feed.xml',
  ]);
  for (const rel of assets) assert.match(rel, /\.(json|txt|xml|md)$/, `${rel} is not a sidecar`);
  assert.ok(all.every((p) => p.asset || !/\.(json|txt|xml|md)$/.test(p.rel)), 'a sidecar is being counted as a page');
});

test('the machine API and the feed are latest-only', () => {
  const older = [...pages(site, { isLatest: false, versions: [] })].map((p) => p.rel);
  assert.ok(!older.includes('xref-report.json'));
  assert.ok(!older.includes('api.json'));
  assert.ok(!older.includes('llms.txt'));
  assert.ok(!older.includes('agent.md'));
  assert.ok(!older.includes('feed.xml'));
});

// Hashing every class's dependencies costs ~155ms per build. A URL lookup walks
// past most of the site to find its page and must not pay that on the way.
test('dependency hashes are deferred until a page is actually written', () => {
  for (const rel of ['classes/Foo/', 'enum/EFoo/', 'files/3_Game/Foo.c/']) {
    const p = resolve(site, rel, opts);
    assert.equal(typeof p.deps, 'function', `${rel} computes its deps eagerly`);
  }
  assert.equal(typeof resolve(site, 'classes/Foo/', opts).deps(), 'string');
  assert.equal(resolve(site, 'topics/', opts).deps, undefined);
});

test('a resolved page renders without a memo behind it', () => {
  // The generator always passes the set that records type lookups; the dev
  // server passes nothing, and both have to work.
  for (const rel of ['', 'classes/Foo/', 'enum/EFoo/', 'changelog/', 'about/', 'credits/']) {
    const html = resolve(site, rel, opts).render();
    assert.match(html, /^<!DOCTYPE html>/, `${rel} did not render a document`);
  }
  assert.match(resolve(site, 'classes/Foo/', opts).render(new Set()), /^<!DOCTYPE html>/);
  assert.deepEqual(Object.keys(JSON.parse(resolve(site, 'nav.json', opts).render())), ['topics']);
  assert.deepEqual(
    Object.keys(JSON.parse(resolve(site, 'xref-report.json', opts).render())),
    ['build', 'summary', 'issues']
  );
});
