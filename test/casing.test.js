// The sources we parse are lowercased by the upstream repository; the site
// shows the game's own spelling instead. Two things have to stay true for that
// to be safe: a display path must never disagree with its URL about which file
// it is, and every path must resolve to something.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prettyPath } from '../src/generate/casing.js';

test('known paths get the spelling of the game tree', () => {
  assert.equal(prettyPath('1_core/debug/debugtext.c'), '1_Core/Debug/DebugText.c');
  assert.equal(prettyPath('1_core/proto/enstring.c'), '1_Core/proto/EnString.c');
  assert.equal(
    prettyPath('4_world/entities/manbase/playerbase.c'),
    '4_World/Entities/ManBase/PlayerBase.c'
  );
});

test('an unknown file is spelled after the type it declares', () => {
  assert.equal(prettyPath('3_game/gui/contextmenu.c', ['ContextMenu']), '3_Game/GUI/ContextMenu.c');
});

test('an unknown file matches a class whose name only ends with the filename', () => {
  assert.equal(
    prettyPath('4_world/entities/building/specific/hotspring.c', ['Land_HotSpring']),
    '4_World/Entities/Building/Specific/HotSpring.c'
  );
});

test('a stem is never matched against the middle of a longer name', () => {
  // "Base" must not turn into the tail of "PlayerBase": that is not a word the
  // filename stands for, it is just how the name ends.
  assert.equal(prettyPath('4_world/unknown/base.c', ['PlayerBase']), '4_World/Unknown/base.c');
});

test('an unknown directory is at least capitalised', () => {
  assert.equal(prettyPath('4_world/nosuchdir/nosuchfile.c'), '4_World/Nosuchdir/nosuchfile.c');
});

test('display spelling never disagrees with the URL', () => {
  // URLs keep the lowercase spelling, so the two must differ in case alone or
  // links, redirects and the search index would point at pages that not exist.
  for (const p of [
    '1_core/debug/debugtext.c',
    '3_game/gui/contextmenu.c',
    '4_world/entities/building/specific/hotspring.c',
    'staticdefinesdoc.c',
    'made/up/path.c',
  ]) {
    assert.equal(prettyPath(p, ['ContextMenu', 'Land_HotSpring']).toLowerCase(), p);
  }
});
