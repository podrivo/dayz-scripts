// The Modules section is built from the \defgroup blocks the sources wrap
// their declarations in. Nesting comes from blocks opened inside other blocks,
// and membership from whatever a block encloses — including part of a class,
// which is how the big constant tables are organised.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile } from '../src/parser/index.js';
import { buildSiteModel } from '../src/generate/model.js';

const parse = (src) => parseFile(src, 'scripts/3_game/test.c').model;

const siteOf = (src) =>
  buildSiteModel({
    label: '1.0.0', version: '1.0', build: '1.0.0', date: '2026-01-01', sha: 'x',
    stats: {}, files: [parse(src)],
  });

test('a group opened inside another is nested in it', () => {
  const site = siteOf(`
/** \\defgroup Outer Outer things
 * @{ */
/** \\defgroup Inner Inner things
 * @{ */
class Deep {}
/** @} */
class Shallow {}
/** @} */
`);
  assert.deepEqual(site.moduleRoots, ['Outer']);
  assert.deepEqual(site.groups.get('Outer').children, ['Inner']);
  assert.equal(site.groups.get('Inner').parent, 'Outer');
  assert.deepEqual(site.groups.get('Inner').classes, ['Deep']);
  assert.deepEqual(site.groups.get('Outer').classes, ['Shallow']);
});

test('a module counts what its children hold', () => {
  const site = siteOf(`
/** \\defgroup Outer Outer things
 * @{ */
/** \\defgroup Inner Inner things
 * @{ */
class A {}
class B {}
/** @} */
class C {}
/** @} */
`);
  assert.equal(site.moduleTotal('Inner'), 2);
  assert.equal(site.moduleTotal('Outer'), 3);
});

test('addtogroup reopens a module without renaming it', () => {
  const site = siteOf(`
/** \\defgroup Math Math library
 * @{ */
class Vec {}
/** @} */
/** \\addtogroup Math
 * @{ */
class Matrix {}
/** @} */
`);
  assert.equal(site.groups.size, 1);
  assert.equal(site.groups.get('Math').title, 'Math library');
  assert.equal(site.groups.get('Math').label, 'Math library');
  assert.deepEqual(site.groups.get('Math').classes.sort(), ['Matrix', 'Vec']);
});

// How a topic ends, which decides most of what is filed under it. Both rules
// are Doxygen's, and the sources lean on both.
test('a member group closes itself rather than the topic around it', () => {
  const site = siteOf(`
/** \\defgroup Widgets Widget UI system
 * @{ */
/** \\name WidgetType
 *  The constants below are available to script */
///@{
const int WT_TEXT = 0;
///@}
class Widget {}
`);
  assert.deepEqual(site.groups.get('Widgets').classes, ['Widget']);
});

test('a plain //@} does not end a topic', () => {
  const site = siteOf(`
/** \\defgroup Sound API
 * @{ */
void SetSoundControllerOverride(string name);
//@}
class AbstractSoundScene {}
`);
  assert.deepEqual(site.groups.get('Sound').classes, ['AbstractSoundScene']);
  assert.equal(site.groups.get('Sound').title, 'API');
  assert.equal(site.groups.get('Sound').label, 'Sound API');
  assert.equal(site.groups.get('Sound').slug, 'SoundAPI');
});

test('generic API titles use descriptive public names', () => {
  const site = siteOf(`
/** \\defgroup SoundController API */
/** \\defgroup Gamepad API */
`);
  assert.equal(site.groups.get('SoundController').label, 'SoundController API');
  assert.equal(site.groups.get('SoundController').slug, 'SoundControllerAPI');
  assert.equal(site.groups.get('Gamepad').label, 'Gamepad API');
  assert.equal(site.groups.get('Gamepad').slug, 'GamepadAPI');
});

test('a documented @} does end a topic', () => {
  const site = siteOf(`
/** \\defgroup Sound API
 * @{ */
void SetSoundControllerOverride(string name);
/** @} */
class AbstractSoundScene {}
`);
  assert.deepEqual(site.groups.get('Sound').classes, []);
});

test('the first of two defgroup blocks naming one module gives the title', () => {
  // constants.c declares ItemWetness twice under different titles; Doxygen
  // reported the clash and kept the first, so the archived site shows that one.
  const site = siteOf(`
/** \\defgroup Wet Item Wetness States
 * @{ */
class Damp {}
/** @} */
/** \\defgroup Wet Item Wetness Weight Modifiers
 * @{ */
class Soaked {}
/** @} */
`);
  assert.equal(site.groups.get('Wet').title, 'Item Wetness States');
  assert.deepEqual(site.groups.get('Wet').classes.sort(), ['Damp', 'Soaked']);
});

test('enums, typedefs, globals, functions and macros are filed too', () => {
  const site = siteOf(`
/** \\defgroup Bits Bit things
 * @{ */
enum EBits { ONE };
typedef int TBit;
const int BIT_MAX = 8;
void SetBit(int n);
#define BIT_DEBUG 1
/** @} */
`);
  const mod = site.groups.get('Bits');
  assert.deepEqual(mod.enums, ['EBits']);
  assert.deepEqual(mod.typedefs.map((t) => t.name), ['TBit']);
  assert.deepEqual(mod.globals.map((g) => g.name), ['BIT_MAX']);
  assert.deepEqual(mod.functions.map((f) => f.name), ['SetBit']);
  assert.deepEqual(mod.defines.map((d) => d.name), ['BIT_DEBUG']);
});

test('a block covering part of a class files those members on their own', () => {
  const site = siteOf(`
class GameConstants
{
  const int UNGROUPED = 1;
  /** \\defgroup Vehicle Vehicle constants
   * @{ */
  const float FLIP_ANGLE = 45;
  /** @} */
}
`);
  const mod = site.groups.get('Vehicle');
  assert.equal(mod.classes.length, 0, 'the class itself is not in the module');
  assert.deepEqual(mod.members.map((m) => m.item.name), ['FLIP_ANGLE']);
  assert.equal(mod.members[0].owner, 'GameConstants');
});

test('a class inside a block does not repeat every member of it', () => {
  const site = siteOf(`
/** \\defgroup Enforce Enforce essentials
 * @{ */
class Math
{
  static float Sin(float x);
  static float Cos(float x);
}
/** @} */
`);
  const mod = site.groups.get('Enforce');
  assert.deepEqual(mod.classes, ['Math']);
  assert.equal(mod.members.length, 0);
});

test('a title two modules share is shown as each id', () => {
  const site = siteOf(`
/** \\defgroup World World
 * @{ */
/** \\defgroup WorldCommon World
 * @{ */
class Camera {}
/** @} */
/** @} */
`);
  assert.equal(site.groups.get('World').label, 'World');
  assert.equal(site.groups.get('WorldCommon').label, 'WorldCommon');
});
