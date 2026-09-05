import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile } from '../src/parser/index.js';
import { parseDoc } from '../src/parser/docparse.js';

function parse(src) {
  const { model, diagnostics } = parseFile(src, 'test.c');
  return { model, diagnostics };
}

function parseClean(src) {
  const { model, diagnostics } = parse(src);
  assert.deepEqual(diagnostics, [], 'expected no diagnostics');
  return model;
}

// ---------------------------------------------------------------------------
// Classes

test('simple class', () => {
  const m = parseClean('class Foo {}');
  assert.equal(m.classes[0].name, 'Foo');
});

test('inheritance via extends and colon', () => {
  const m = parseClean(`
    class A extends Base {}
    class B : OtherBase {}
  `);
  assert.equal(m.classes[0].base, 'Base');
  assert.equal(m.classes[1].base, 'OtherBase');
});

test('generic template class', () => {
  const m = parseClean('class Param2<Class T1, Class T2> extends Param { T1 param1; T2 param2; }');
  const c = m.classes[0];
  assert.equal(c.name, 'Param2');
  assert.equal(c.generics, '<Class T1, Class T2>');
  assert.equal(c.base, 'Param');
  assert.equal(c.members.length, 2);
});

test('modded and sealed classes', () => {
  const m = parseClean(`
    modded class PlayerBase { void Extra() {} }
    sealed class Contact { private void Contact() {} }
  `);
  assert.equal(m.classes[0].modded, true);
  assert.deepEqual(m.classes[1].mods, ['sealed']);
  assert.equal(m.classes[1].methods[0].kind, 'ctor');
});

test('forward declaration and dual #ifdef class headers', () => {
  const m = parseClean(`
    class Widget;
    #ifdef FEATURE_X
    class Man extends Person
    #else
    class Man extends EntityAI
    #endif
    {
      void Hello();
    }
  `);
  assert.equal(m.classes[0].forward, true);
  const alts = m.classes.filter((c) => c.name === 'Man');
  assert.equal(alts.length, 2);
  assert.equal(alts[0].base, 'Person');
  assert.deepEqual(alts[0].cond, ['FEATURE_X']);
  assert.equal(alts[1].base, 'EntityAI');
  assert.deepEqual(alts[1].cond, ['!FEATURE_X']);
  assert.equal(alts[1].methods[0].name, 'Hello');
});

// ---------------------------------------------------------------------------
// Methods

test('full modifier stack and proto declarations', () => {
  const m = parseClean(`
    class Class {
      proto native owned external string ClassName();
      proto external static typename StaticType();
      private proto static bool SafeCastType(Class type, out Class to, Class from);
      proto volatile int Call(Class inst, string function, void parm);
    }
  `);
  const [a, b, c, d] = m.classes[0].methods;
  assert.deepEqual(a.mods, ['proto', 'native', 'owned', 'external']);
  assert.equal(a.ret, 'string');
  assert.equal(a.proto, true);
  assert.deepEqual(b.mods, ['proto', 'external', 'static']);
  assert.deepEqual(c.params[1].mods, ['out']);
  assert.equal(d.params[2].type, 'void');
  assert.equal(d.params[2].name, 'parm');
});

test('constructor and destructor', () => {
  const m = parseClean(`
    class ScriptModule {
      void ScriptModule() {}
      private void ~ScriptModule();
    }
  `);
  const [ctor, dtor] = m.classes[0].methods;
  assert.equal(ctor.kind, 'ctor');
  assert.equal(dtor.kind, 'dtor');
  assert.equal(dtor.name, '~ScriptModule');
});

test('default parameter values and generics in params', () => {
  const m = parseClean(`
    class A {
      void Fn(int x = 5, string s = "a,b", float f = 1.5 * MATH_PI, map<string, ref array<int>> data = null);
    }
  `);
  const p = m.classes[0].methods[0].params;
  assert.equal(p[0].def, '5');
  assert.equal(p[1].def, '"a,b"');
  assert.equal(p[2].def, '1.5 * MATH_PI');
  assert.equal(p[3].type, 'map<string, ref array<int>>');
  assert.equal(p[3].def, 'null');
});

test('multi-dimensional array parameters', () => {
  const m = parseClean('class A { proto native void SetUV(float uv[4][2]); }');
  const p = m.classes[0].methods[0].params[0];
  assert.equal(p.name, 'uv');
  assert.equal(p.array, '4][2');
});

test('prototype without trailing semicolon (engine-tolerated)', () => {
  const m = parseClean(`
    proto native int SetSoundVolume(HSOUND sound, float volume)
    proto native int SetSoundFrequency(HSOUND sound, int freq)
  `);
  assert.equal(m.functions.length, 2);
  assert.equal(m.functions[0].proto, true);
});

test('override event methods', () => {
  const m = parseClean('class A { protected override event void Write(PawnStateWriter ctx) {} }');
  assert.deepEqual(m.classes[0].methods[0].mods, ['protected', 'override', 'event']);
});

test('calls retain their direct receiver', () => {
  const m = parseClean(`
    class A {
      void Call(Service service) {
        service.Start();
        this.Stop();
        Utility.Ping();
        action_data.m_Target.GetObject();
        Local();
      }
    }
  `);
  assert.deepEqual(m.classes[0].methods[0].calls, [
    { name: 'GetObject', receiver: 'action_data.m_Target' },
    { name: 'Local' },
    { name: 'Ping', receiver: 'Utility' },
    { name: 'Start', receiver: 'service' },
    { name: 'Stop', receiver: 'this' },
  ]);
});

test('call chains, constructors, and local declarations are captured', () => {
  const m = parseClean(`
    class A {
      void Call(Object obj) {
        PlayerBase player = PlayerBase.Cast(obj);
        player.GetIdentity();
        GetGame().GetMission();
        ref array<string> names = new array<string>;
        InventoryLocation loc = new InventoryLocation();
        foreach (Widget w : m_Widgets) {
          w.Show(false);
        }
      }
    }
  `);
  const fn = m.classes[0].methods[0];
  assert.deepEqual(fn.calls, [
    { name: 'Cast', receiver: 'PlayerBase' },
    { name: 'GetGame' },
    { name: 'GetIdentity', receiver: 'player' },
    { name: 'GetMission', receiver: 'GetGame()' },
    { name: 'InventoryLocation', ctor: true },
    { name: 'Show', receiver: 'w' },
  ]);
  assert.deepEqual(fn.locals, {
    player: 'PlayerBase',
    names: 'ref array < string >',
    loc: 'InventoryLocation',
    w: 'Widget',
  });
});

test('subscript, template, grouping, and string-literal receivers are retained', () => {
  const m = parseClean(`
    class A {
      void Call(ItemBase ingredients[], array<string> parts) {
        ingredients[0].IsEmpty();
        parts[1].Length();
        JsonFileLoader<CfgGameplayJson>.LoadFile(path, data, err);
        (HandsContainer.Cast(parent)).DraggingOverGrid(w, 0, 0, null);
        "SeedBase_".Length();
      }
    }
  `);
  assert.deepEqual(m.classes[0].methods[0].calls, [
    { name: 'Cast', receiver: 'HandsContainer' },
    { name: 'DraggingOverGrid', receiver: 'HandsContainer.Cast()' },
    { name: 'IsEmpty', receiver: 'ingredients[]' },
    { name: 'Length', receiver: 'parts[]' },
    { name: 'Length', receiver: 'string' },
    { name: 'LoadFile', receiver: 'JsonFileLoader' },
  ]);
});

// ---------------------------------------------------------------------------
// Members

test('member modifier/prefix order flexibility', () => {
  const m = parseClean(`
    class A {
      ref protected ActionManagerBase m_ActionManager;
      protected ref map<EEffectAreaType, int> m_Overlap = new map<EEffectAreaType, int>();
      static ref array<Man> m_Players = new array<Man>;
      const int MAX = 63;
      private int m_A, m_B, m_C;
      int m_Arr[4];
    }
  `);
  const mem = m.classes[0].members;
  assert.equal(mem[0].type, 'ref ActionManagerBase');
  assert.deepEqual(mem[0].mods, ['protected']);
  assert.equal(mem[1].type, 'ref map<EEffectAreaType, int>');
  assert.equal(mem[1].init, 'new map<EEffectAreaType, int>()');
  assert.equal(mem[2].init, 'new array<Man>');
  assert.equal(mem[3].init, '63');
  assert.equal(mem.filter((x) => x.type === 'int' && x.mods?.includes('private')).length, 3);
  assert.equal(mem.at(-1).array, '4');
});

test('member without semicolon before closing brace', () => {
  const m = parseClean('class BoneMask { int Mask[8] }');
  assert.equal(m.classes[0].members[0].array, '8');
});

// ---------------------------------------------------------------------------
// Enums

test('enum with values, hex, expressions and trailing comments', () => {
  const m = parseClean(`
    enum eAgents
    {
      CHOLERA = 1,
      BRAIN = 8, //! the bad one
      COMBO = (A | B),
      HEX = 0xFF00,
      LAST
    }
  `);
  const e = m.enums[0];
  assert.equal(e.values[0].value, '1');
  assert.equal(e.values[1].doc, 'the bad one');
  assert.equal(e.values[2].value, '(A | B)');
  assert.equal(e.values[3].value, '0xFF00');
  assert.equal(e.values[4].value, undefined);
});

test('enum with base and semicolon separators (legacy)', () => {
  const m = parseClean(`
    enum EWaterLevels extends ELevels { HIGH }
    enum ImpactTypes { UNKNOWN; STOP; RICOCHET; }
  `);
  assert.equal(m.enums[0].base, 'ELevels');
  assert.equal(m.enums[1].values.length, 3);
});

// ---------------------------------------------------------------------------
// Typedefs, globals, functions

test('typedefs including arrays and generics', () => {
  const m = parseClean(`
    typedef int[] TypeID;
    typedef array<ref Managed> TManagedRefArray;
    typedef map<InventoryItem, vector> TItemsMap
    class Next {}
  `);
  assert.equal(m.typedefs[0].type, 'int[]');
  assert.equal(m.typedefs[1].type, 'array<ref Managed>');
  assert.equal(m.typedefs[2].name, 'TItemsMap'); // missing ';' tolerated
  assert.equal(m.classes[0].name, 'Next');
});

test('global constants with defgroup and trailing comments', () => {
  const m = parseClean(`
    /**
     * \\defgroup Materials Materials
     * @{
     */
    const int MATERIAL_METAL = 1; //full steel
    const int MATERIAL_GLASS = 3;
    /** @}*/
    const string AFTER = "no group";
  `);
  const g = m.globals;
  assert.equal(g[0].group, 'Materials');
  assert.equal(g[0].doc, 'full steel');
  assert.equal(g[1].group, 'Materials');
  assert.equal(g[2].group, undefined);
});

// ---------------------------------------------------------------------------
// Preprocessor

test('preprocessor conditions attach to declarations', () => {
  const m = parseClean(`
    class A {
      #ifdef DIAG_DEVELOPER
      int m_DebugVar;
      #ifndef SERVER
      void ClientOnly();
      #endif
      #else
      int m_ReleaseVar;
      #endif
      int m_Always;
    }
  `);
  const c = m.classes[0];
  assert.deepEqual(c.members.find((x) => x.name === 'm_DebugVar').cond, ['DIAG_DEVELOPER']);
  assert.deepEqual(c.methods[0].cond, ['DIAG_DEVELOPER', '!SERVER']);
  assert.deepEqual(c.members.find((x) => x.name === 'm_ReleaseVar').cond, ['!DIAG_DEVELOPER']);
  assert.equal(c.members.find((x) => x.name === 'm_Always').cond, undefined);
});

test('bare identifier lists in doc-only DOXYGEN blocks', () => {
  const m = parseClean(`
    #ifdef DOXYGEN
    //! Single-line text
    TextWidgetTypeID,
    //! Multi-line text
    MultilineTextWidgetTypeID,
    #else
    typedef TypeID WidgetType;
    #endif
  `);
  assert.equal(m.globals.length, 2);
  assert.equal(m.globals[0].name, 'TextWidgetTypeID');
  assert.equal(m.globals[0].type, undefined);
  assert.equal(m.typedefs[0].name, 'WidgetType');
});

// ---------------------------------------------------------------------------
// Attributes

test('gamelib [Attribute] decorations', () => {
  const m = parseClean(`
    [EditorAttribute("box", "GameLib/Scripted", "RT", "-0.25 -0.25 -0.25", "0.25 0.25 0.25", "255 0 0 255")]
    class RenderTarget : GenericEntity
    {
      [Attribute("0", "combobox", "Autoinit", "", { ParamEnum("No", "0"), ParamEnum("Yes", "1") } )]
      int AutoInit;
    }
  `);
  const c = m.classes[0];
  assert.match(c.attrs[0], /^\[EditorAttribute/);
  assert.match(c.members[0].attrs[0], /^\[Attribute\("0", "combobox"/);
});

// ---------------------------------------------------------------------------
// Doc comments

test('doc comments bind to declarations', () => {
  const m = parseClean(`
    //! Super root of all classes in Enforce script
    class Class
    {
      /**
      \\brief Returns true when instance is of the type
      \\param type Class type
      \\returns \\p bool true when inherited
      */
      proto native external bool IsInherited(typename type);
    }
  `);
  const c = m.classes[0];
  assert.equal(c.doc, 'Super root of all classes in Enforce script');
  assert.match(c.methods[0].doc, /Returns true when instance/);
});

test('parseDoc structures doxygen tags', () => {
  const d = parseDoc([
    '\\brief Try to safely down-cast base class.',
    '\\param from source instance',
    '\\param[out] to target',
    '\\returns down-casted pointer or null',
    '\\note be careful',
    '@code',
    'Man player = Man.Cast(obj);',
    '@endcode',
  ].join('\n'));
  assert.equal(d.brief, 'Try to safely down-cast base class.');
  assert.equal(d.params.length, 2);
  assert.equal(d.params[1].dir, 'out');
  assert.match(d.returns, /down-casted/);
  assert.deepEqual(d.notes, ['be careful']);
  assert.match(d.code[0], /Man\.Cast/);
});

test('plain description becomes brief', () => {
  const d = parseDoc('Module containing compiled scripts.');
  assert.equal(d.brief, 'Module containing compiled scripts.');
});

test('a markdown table stays in the description', () => {
  const d = parseDoc('| A | B |\n| --- | --- |\n| 1 | 2 |');
  assert.equal(d.brief, undefined);
  assert.match(d.desc, /\| A \| B \|/);
});

// ---------------------------------------------------------------------------
// Pathological cases: parser must never throw and always recover

test('garbage input never throws and recovers', () => {
  const cases = [
    'class {{{{',
    'class A extends {',
    '%%% ??? ;;; class B {} $$$',
    'enum { , , }',
    'class C { void Broken( }',
    'class D { int x = ; }',
    '#endif\n#else\nclass E {}',
    'class F { /** unterminated doc',
    'class G { string s = "unterminated',
  ];
  for (const src of cases) {
    const { model } = parse(src); // must not throw
    assert.ok(model);
  }
  // recovery: class B and E still found
  assert.equal(parse('%%% ;;; class B {} $$$').model.classes[0]?.name, 'B');
  assert.equal(parse('#endif\n#else\nclass E {}').model.classes[0]?.name, 'E');
});

test('comparison operators not mistaken for template args', () => {
  const m = parseClean('const int X = A < B; const int Y = 2 > 1;');
  assert.equal(m.globals[0].init, 'A < B');
  assert.equal(m.globals[1].init, '2 > 1');
});
