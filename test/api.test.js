import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from '../src/parser/index.js';
import { buildSiteModel } from '../src/generate/model.js';
import { buildApi, renderLlmsTxt } from '../src/generate/api.js';
import { SITE_URL } from '../src/generate/content.js';

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

function siteOf() {
  const model = {
    label: '1.29.0', version: '1.29', build: '1.29.0', date: '2026-01-01', sha: 'abc',
    stats: { files: 1, classes: 1, methods: 1, members: 1, enums: 1, typedefs: 1, globals: 0, functions: 0, documented: 1 },
    files: [parseFile(SOURCE, 'scripts/3_game/foo.c').model],
  };
  return buildSiteModel(model);
}

test('the dump names the build and carries the DPL', () => {
  const api = buildApi(siteOf());
  assert.equal(api.build, '1.29.0');
  assert.equal(api.version, '1.29');
  assert.equal(api.sha, 'abc');
  assert.equal(api.url, SITE_URL);
  assert.match(api.license.name, /DPL/);
  assert.match(api.license.url, /dayz-public-license/);
  assert.match(api.license.notice, /BOHEMIA INTERACTIVE/);
});

test('a class carries inheritance, members, signatures and a human URL', () => {
  const foo = buildApi(siteOf()).classes.find((c) => c.name === 'Foo');
  assert.equal(foo.base, 'Bar');
  assert.equal(foo.url, 'class/Foo/');
  assert.equal(foo.brief, 'A class.');
  assert.equal(foo.file, '3_Game/Foo.c');
  assert.equal(foo.methods[0].name, 'Do');
  assert.equal(foo.methods[0].params[0].name, 'n');
  assert.equal(foo.methods[0].params[0].type, 'int');
  assert.equal(foo.members[0].name, 'm_Count');
  assert.equal(foo.members[0].type, 'int');
});

test('enums, typedefs and topics are in the dump', () => {
  const api = buildApi(siteOf());
  assert.deepEqual(api.enums[0].values.map((v) => v.name), ['A', 'B']);
  assert.equal(api.typedefs[0].name, 'TFoo');
  assert.equal(api.topics[0].name, 'Topic');
});

test('llms.txt points at the dump and states the license', () => {
  const txt = renderLlmsTxt(siteOf());
  assert.match(txt, /^# DIFF/);
  assert.match(txt, new RegExp(`${SITE_URL}/api.json`));
  assert.match(txt, /DayZ Public License/);
  assert.match(txt, /1\.29\.0/);
});

// The overlay is hand-edited by contributors rather than generated, and
// llms.txt promises it at a fixed URL, so a malformed key or a missing file is
// a broken link in a machine-readable index. site/ ships verbatim to
// dist/assets/, which is what puts it at the URL below.
test('the community notes overlay llms.txt advertises exists and validates', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  assert.match(renderLlmsTxt(siteOf()), new RegExp(`${SITE_URL}/assets/notes.json`));

  const notes = JSON.parse(fs.readFileSync(path.join(root, 'site', 'notes.json'), 'utf8'));
  for (const [key, text] of Object.entries(notes)) {
    assert.match(key, /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)?$/, `not a Type or Type.Member key: ${key}`);
    assert.equal(typeof text, 'string', `${key} must map to a string`);
    assert.ok(text.trim(), `${key} must not be empty`);
    assert.equal(text.split('`').length % 2, 1, `${key} has an unclosed backtick`);
  }
});
