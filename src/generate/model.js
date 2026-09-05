// Transforms a parsed per-version model (data/model-X.json) into a site
// model: classes merged across declarations, inheritance graph, the \defgroup
// module tree, the directory tree behind the file list, and a type index used
// to linkify type names in signatures.

import { prettyPath } from './casing.js';

/** Signature key used to deduplicate methods declared in multiple
 * preprocessor branches. */
function methodKey(m) {
  return `${m.name}(${(m.params || []).map((p) => p.type).join(',')})${m.ret || ''}`;
}

function condsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.join('&') === b.join('&');
}

/** An empty module, before anything is filed under it. */
function newGroup(name) {
  return {
    name,
    title: name,
    named: false, // whether a \defgroup has supplied the title below
    desc: undefined,
    parent: undefined,
    children: [],
    classes: [],
    enums: [],
    typedefs: [],
    globals: [],
    functions: [],
    defines: [],
    members: [], // members grouped apart from the class that declares them
  };
}

export function buildSiteModel(model) {
  const classes = new Map(); // name -> merged class
  const enums = new Map();
  const typedefs = [];
  const globals = [];
  const functions = [];
  const defines = [];
  const groups = new Map(); // defgroup name -> module
  const files = [];
  const paths = new Map(); // scripts/a/b.c -> display spelling "A/B.c"

  for (const f of model.files) {
    const seg = f.path.split('/')[1] || '';
    const rel = f.path.replace(/^scripts\//, '');
    // The dictionary in casing.js covers all but a handful of files; the rest
    // are spelled after the type they declare, so pass those along.
    const declared = [
      ...f.classes.map((c) => c.name),
      ...f.enums.map((e) => e.name),
      ...f.typedefs.map((t) => t.name),
    ];
    const display = prettyPath(rel, declared);
    paths.set(f.path, display);

    const slash = display.lastIndexOf('/');
    const fileEntry = {
      path: f.path,
      display,
      dir: slash === -1 ? '' : display.slice(0, slash),
      name: display.slice(slash + 1),
      // files sitting directly in scripts/ (e.g. staticdefinesdoc.c) get a
      // synthetic "root" module instead of their filename
      module: seg.includes('.') ? '_root' : seg,
      classes: [],
      enums: f.enums.map((e) => e.name),
      typedefs: f.typedefs.map((t) => t.name),
      counts: {
        classes: f.classes.length,
        enums: f.enums.length,
        typedefs: f.typedefs.length,
        globals: f.globals.length,
        functions: f.functions.length,
        defines: (f.defines || []).length,
      },
    };
    files.push(fileEntry);

    // A module can be opened with \addtogroup long before, or in another file
    // than, the \defgroup that names and describes it, so the defining
    // occurrence always wins and order does not matter. Where two \defgroup
    // blocks claim one name -- constants.c does, twice over for ItemWetness --
    // the first is the title, as it is under Doxygen.
    for (const g of f.groups || []) {
      let mod = groups.get(g.name);
      if (!mod) groups.set(g.name, (mod = newGroup(g.name)));
      if (!mod.named && (g.define || mod.title === mod.name)) {
        mod.title = g.title;
        mod.named = g.define;
      }
      if (g.desc && !mod.desc) mod.desc = g.desc;
      if (g.parent && !mod.parent) mod.parent = g.parent;
    }

    for (const c of f.classes) {
      if (!fileEntry.classes.includes(c.name)) fileEntry.classes.push(c.name);
      let mc = classes.get(c.name);
      if (!mc) {
        mc = {
          name: c.name,
          generics: c.generics,
          bases: [],
          modded: false,
          mods: [],
          attrs: [],
          cond: c.cond,
          doc: null,
          group: undefined,
          locations: [],
          methods: [],
          members: [],
          methodKeys: new Map(),
        };
        classes.set(c.name, mc);
      } else if (!condsEqual(mc.cond, c.cond)) {
        mc.cond = undefined;
      }
      mc.locations.push({ path: f.path, line: c.line, forward: !!c.forward });
      if (c.group && !mc.group) mc.group = c.group;
      if (c.generics && !mc.generics) mc.generics = c.generics;
      if (c.modded) mc.modded = true;
      for (const mod of c.mods || []) if (!mc.mods.includes(mod)) mc.mods.push(mod);
      for (const a of c.attrs || []) if (!mc.attrs.includes(a)) mc.attrs.push(a);
      if (c.doc && (!mc.doc || mc.doc.length < c.doc.length)) mc.doc = c.doc;
      if (c.base) {
        const existing = mc.bases.find((b) => b.base === c.base);
        if (existing) {
          if (!condsEqual(existing.cond, c.cond)) existing.cond = undefined;
        } else {
          mc.bases.push({ base: c.base, cond: c.cond });
        }
      }
      for (const m of c.methods) {
        const key = methodKey(m);
        const prev = mc.methodKeys.get(key);
        if (prev) {
          // duplicate from an #ifdef/#else branch or a re-declaration:
          // merge docs and drop the condition when branches disagree
          if (!prev.doc && m.doc) prev.doc = m.doc;
          if (!condsEqual(prev.cond, m.cond)) prev.cond = undefined;
        } else {
          const entry = { ...m, file: f.path };
          mc.methodKeys.set(key, entry);
          mc.methods.push(entry);
        }
      }
      for (const v of c.members) {
        const prev = mc.members.find((x) => x.name === v.name && x.type === v.type);
        if (prev) {
          if (!prev.doc && v.doc) prev.doc = v.doc;
          if (!condsEqual(prev.cond, v.cond)) prev.cond = undefined;
        } else {
          mc.members.push({ ...v, file: f.path });
        }
      }
    }

    for (const e of f.enums) {
      let me = enums.get(e.name);
      if (!me) {
        enums.set(e.name, { ...e, locations: [{ path: f.path, line: e.line }] });
      } else {
        me.locations.push({ path: f.path, line: e.line });
        for (const v of e.values) {
          if (!me.values.some((x) => x.name === v.name)) me.values.push(v);
        }
      }
    }
    for (const t of f.typedefs) typedefs.push({ ...t, file: f.path });
    for (const g of f.globals) globals.push({ ...g, file: f.path });
    for (const fn of f.functions) functions.push({ ...fn, file: f.path });
    for (const d of f.defines || []) defines.push({ ...d, file: f.path });
  }

  for (const mc of classes.values()) delete mc.methodKeys;

  // ---- module tree
  // Everything a \defgroup block enclosed is filed under it. Members are only
  // listed separately when their class is not itself in the same module, which
  // is how blocks that group part of a class (GameConstants holds a dozen) show
  // their constants without repeating every method of a fully grouped class.
  const fileGroup = (list, key) => {
    for (const item of list) {
      const mod = item.group && groups.get(item.group);
      if (mod) mod[key].push(item);
    }
  };
  fileGroup(typedefs, 'typedefs');
  fileGroup(globals, 'globals');
  fileGroup(functions, 'functions');
  fileGroup(defines, 'defines');

  for (const mc of classes.values()) {
    if (mc.group && groups.has(mc.group)) groups.get(mc.group).classes.push(mc.name);
    for (const m of mc.methods) {
      if (m.group && m.group !== mc.group && groups.has(m.group)) {
        groups.get(m.group).members.push({ owner: mc.name, item: m, method: true });
      }
    }
    for (const v of mc.members) {
      if (v.group && v.group !== mc.group && groups.has(v.group)) {
        groups.get(v.group).members.push({ owner: mc.name, item: v, method: false });
      }
    }
  }
  for (const en of enums.values()) {
    if (en.group && groups.has(en.group)) groups.get(en.group).enums.push(en.name);
  }

  const moduleRoots = [];
  for (const mod of groups.values()) {
    const parent = mod.parent && groups.get(mod.parent);
    if (parent) parent.children.push(mod.name);
    else moduleRoots.push(mod.name);
  }
  const titleCounts = new Map();
  for (const mod of groups.values()) titleCounts.set(mod.title, (titleCounts.get(mod.title) || 0) + 1);
  for (const mod of groups.values()) {
    const api = mod.title === 'API';
    mod.label = api
      ? `${mod.name} API`
      : titleCounts.get(mod.title) > 1 ? mod.name : mod.title;
    mod.slug = api ? `${mod.name}API` : mod.name;
  }
  const byLabel = (a, b) => groups.get(a).label.localeCompare(groups.get(b).label);
  moduleRoots.sort(byLabel);
  for (const mod of groups.values()) mod.children.sort(byLabel);

  /** How much a module holds, counting everything nested inside it. */
  const moduleTotal = (name, seen = new Set()) => {
    if (seen.has(name)) return 0;
    seen.add(name);
    const mod = groups.get(name);
    let n =
      mod.classes.length + mod.enums.length + mod.typedefs.length +
      mod.globals.length + mod.functions.length + mod.defines.length + mod.members.length;
    for (const kid of mod.children) n += moduleTotal(kid, seen);
    return n;
  };

  // ---- inheritance graph
  const children = new Map(); // base name -> [class names]
  for (const mc of classes.values()) {
    const primary = mc.bases[0];
    if (!primary) continue;
    const baseName = primary.base.match(/[A-Za-z_]\w*/)?.[0];
    if (!baseName) continue;
    mc.baseName = baseName;
    if (!children.has(baseName)) children.set(baseName, []);
    children.get(baseName).push(mc.name);
  }
  for (const list of children.values()) list.sort((a, b) => a.localeCompare(b));

  /** Walk ancestors, guarding against cycles. */
  function ancestorsOf(name) {
    const chain = [];
    const seen = new Set([name]);
    let cur = classes.get(name)?.baseName;
    while (cur && !seen.has(cur)) {
      chain.push(cur);
      seen.add(cur);
      cur = classes.get(cur)?.baseName;
    }
    return chain;
  }

  // ---- type index for linkification
  const typeIndex = new Map();
  for (const name of classes.keys()) typeIndex.set(name, 'class');
  for (const name of enums.keys()) if (!typeIndex.has(name)) typeIndex.set(name, 'enum');
  for (const t of typedefs) if (!typeIndex.has(t.name)) typeIndex.set(t.name, 'typedef');

  // ---- directory tree behind the file list
  const dirs = new Map(); // display dir path -> { path, name, dirs: [], files: [] }
  const dirNode = (dirPath) => {
    let node = dirs.get(dirPath);
    if (node) return node;
    const slash = dirPath.lastIndexOf('/');
    node = { path: dirPath, name: dirPath.slice(slash + 1), dirs: [], files: [] };
    dirs.set(dirPath, node);
    if (slash !== -1) dirNode(dirPath.slice(0, slash)).dirs.push(node);
    return node;
  };
  const rootFiles = [];
  for (const f of files) {
    if (f.dir) dirNode(f.dir).files.push(f);
    else rootFiles.push(f);
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  for (const node of dirs.values()) {
    node.dirs.sort(byName);
    node.files.sort(byName);
    node.count = node.files.length;
  }
  // Deepest first, so a directory's total already includes its subdirectories.
  for (const node of [...dirs.values()].sort((a, b) => b.path.length - a.path.length)) {
    for (const kid of node.dirs) node.count += kid.count;
  }
  const dirRoots = [...dirs.values()].filter((d) => !d.path.includes('/')).sort(byName);
  rootFiles.sort(byName);

  // ---- data fields: every class member and method, bucketed by initial.
  // A name is listed once with the classes that declare it, the way doxygen
  // indexes them — the same 42k members spread over 25k names, so repeating
  // each name per class would be most of the page.
  const fields = new Map();
  const addField = (name, owner, method) => {
    const l = /^[a-z]/i.test(name) ? name[0].toLowerCase() : '_';
    let bucket = fields.get(l);
    if (!bucket) fields.set(l, (bucket = new Map()));
    const owners = bucket.get(name);
    if (owners) owners.push({ owner, method });
    else bucket.set(name, [{ owner, method }]);
  };
  for (const mc of classes.values()) {
    for (const m of mc.methods) addField(m.name, mc.name, true);
    for (const v of mc.members) addField(v.name, mc.name, false);
  }
  for (const [l, bucket] of fields) {
    const sorted = [...bucket.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, owners] of sorted) owners.sort((a, b) => a.owner.localeCompare(b.owner));
    fields.set(l, sorted);
  }

  // ---- call resolution
  const targetKey = (target) => target.owner ? `${target.owner}.${target.name}` : target.name;
  const declarations = new Map();
  const declare = (name, target) => {
    let list = declarations.get(name);
    if (!list) declarations.set(name, (list = new Map()));
    list.set(targetKey(target), target);
  };
  for (const mc of classes.values()) {
    for (const m of mc.methods) declare(m.name, { owner: mc.name, name: m.name, method: true });
  }
  for (const fn of functions) declare(fn.name, { name: fn.name, method: true });

  const methodDeclInHierarchy = (start, name) => {
    const seen = new Set();
    let cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const cls = classes.get(cur);
      if (!cls) return null;
      const decl = cls.methods.find((m) => m.name === name);
      if (decl) return { owner: cur, decl };
      cur = baseClass(cls);
    }
    return null;
  };
  const methodInHierarchy = (start, name) => {
    const found = methodDeclInHierarchy(start, name);
    return found ? { owner: found.owner, name, method: true } : null;
  };
  const memberInHierarchy = (start, name) => {
    const seen = new Set();
    let cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const cls = classes.get(cur);
      if (!cls) return null;
      if (cls.members.some((m) => m.name === name)) return { owner: cur, name, method: false };
      cur = baseClass(cls);
    }
    return null;
  };
  // Same-named globals shadow by module load order (1_core … 5_mission), so
  // the last declaration wins: `Game GetGame()` in gamelib is superseded by
  // `DayZGame GetGame()` in 3_game.
  const functionDecls = new Map();
  for (const fn of functions) functionDecls.set(fn.name, fn);
  const typeAliases = new Map(typedefs.map((item) => [item.name, item.type]));
  const classInType = (type, seen = new Set()) => {
    for (const word of type?.match(/[A-Za-z_]\w*/g) || []) {
      if (classes.has(word)) return word;
      if (typeAliases.has(word) && !seen.has(word)) {
        seen.add(word);
        const resolved = classInType(typeAliases.get(word), seen);
        if (resolved) return resolved;
      }
    }
    return undefined;
  };
  // DayZ aliases bases for modding (`typedef InventoryItem InventoryItemSuper`),
  // so a hierarchy walk resolves the base through typedefs too.
  const baseClass = (cls) => (cls.baseName ? classInType(cls.baseName) : undefined);
  const baseOf = (name) => {
    const cls = classes.get(name);
    return cls ? baseClass(cls) : undefined;
  };
  const globalReceiverClasses = new Map();
  const globalReceiverAlts = new Map();
  for (const item of globals) {
    const cls = classInType(item.type);
    if (!cls) continue;
    if (!globalReceiverClasses.has(item.name) || !item.cond) {
      globalReceiverClasses.set(item.name, cls);
    }
    let alts = globalReceiverAlts.get(item.name);
    if (!alts) globalReceiverAlts.set(item.name, (alts = []));
    if (!alts.includes(cls)) alts.push(cls);
  }
  const memberClass = (start, name) => {
    const seen = new Set();
    let cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const cls = classes.get(cur);
      if (!cls) return null;
      const resolved = classInType(cls.members.find((m) => m.name === name)?.type);
      if (resolved) return resolved;
      cur = baseClass(cls);
    }
    return null;
  };
  /** Element/value type of an indexed access (`items[i]`, `map[k]`). `array`
   *  and `map` are themselves classes, so classInType alone would stop there. */
  const elementClass = (type, arrayParam) => {
    if (!type && arrayParam == null) return undefined;
    if (arrayParam != null && arrayParam !== false) return classInType(type);
    const trimmed = type?.trim();
    if (trimmed && typeAliases.has(trimmed)) return elementClass(typeAliases.get(trimmed));
    // map<K, V>[key] yields V (often an array/map, not V's element type).
    const mapMatch = trimmed?.match(/\bmap\s*<\s*[^,]+,\s*(?:ref\s+)?(.+)\s*>$/i);
    if (mapMatch) return classInType(mapMatch[1].trim());
    const arrayMatch = trimmed?.match(/\barray\s*<\s*(?:ref\s+)?([A-Za-z_]\w*)/i);
    if (arrayMatch) return classInType(arrayMatch[1]);
    const stripped = trimmed?.replace(/\s*\[\s*\d*\s*\]\s*$/, '');
    if (stripped && stripped !== trimmed) return classInType(stripped);
    return undefined;
  };
  /** Type of a bare name in a function: params, locals, members, globals. */
  const nameType = (owner, fn, name) => {
    const param = fn.params?.find((p) => p.name === name);
    if (param) return { type: param.type, array: param.array };
    if (fn.locals?.[name]) return { type: fn.locals[name] };
    const seen = new Set();
    let cur = owner;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const cls = classes.get(cur);
      if (!cls) break;
      const member = cls.members.find((m) => m.name === name);
      if (member) return { type: member.type, array: member.array };
      cur = baseClass(cls);
    }
    const global = globals.find((g) => g.name === name);
    if (global) return { type: global.type };
    return null;
  };
  /** Class of a receiver chain: each segment is a field (`a.b`), an array
   *  element (`a[]`), or a call (`GetGame()`), typed by locals, params,
   *  members, globals, class names (static access) and return types. */
  const receiverClass = (owner, fn, receiver) => {
    let resolved = null;
    const segments = receiver.split('.');
    for (let i = 0; i < segments.length; i++) {
      const isCall = segments[i].endsWith('()');
      const isElem = !isCall && segments[i].endsWith('[]');
      const name = isCall
        ? segments[i].slice(0, -2)
        : isElem
          ? segments[i].slice(0, -2)
          : segments[i];
      if (isCall) {
        const found =
          methodDeclInHierarchy(i === 0 ? owner : resolved, name) ||
          (resolved ? methodDeclInHierarchy('Class', name) : null);
        // `X.Cast(...)` is declared on Class as returning Class, but by
        // convention it returns the receiver's own type.
        if (name === 'Cast' && found?.owner === 'Class' && resolved) continue;
        const decl = found?.decl || (i === 0 ? functionDecls.get(name) : null);
        resolved = classInType(decl?.ret);
      } else if (isElem) {
        if (i === 0) {
          const info = nameType(owner, fn, name);
          resolved = info ? elementClass(info.type, info.array) : null;
        } else {
          const member = (() => {
            const seen = new Set();
            let cur = resolved;
            while (cur && !seen.has(cur)) {
              seen.add(cur);
              const cls = classes.get(cur);
              if (!cls) return null;
              const m = cls.members.find((x) => x.name === name);
              if (m) return m;
              cur = baseClass(cls);
            }
            return null;
          })();
          resolved = member ? elementClass(member.type, member.array) : null;
        }
      } else if (i === 0) {
        resolved =
          (name === 'this' ? owner : name === 'super' ? baseOf(owner) : null) ||
          classInType(fn.params?.find((p) => p.name === name)?.type) ||
          classInType(fn.locals?.[name]) ||
          memberClass(owner, name) ||
          globalReceiverClasses.get(name) ||
          (classes.has(name) ? name : null);
      } else {
        resolved = memberClass(resolved, name);
      }
      if (!resolved) return null;
    }
    return resolved;
  };
  const normalizeCall = (call) => typeof call === 'string' ? { name: call } : call;
  const resolveCall = (call, owner, fn) => {
    const c = normalizeCall(call);
    if (c.ctor) {
      // `new X(...)` names a class, possibly through a typedef alias
      // (`new TStringArray` is `array<string>`); the linked declaration is
      // its constructor when one is written out, or the class page otherwise.
      const cls = classInType(c.name);
      if (cls) {
        const target = methodInHierarchy(cls, cls) || { owner: cls, name: cls, method: true };
        return { ...c, target, confidence: 'typed' };
      }
      return { ...c, confidence: 'unresolved', candidates: [] };
    }
    const candidates = [...(declarations.get(c.name)?.values() || [])];
    let target = null;
    let confidence;

    if (c.receiver) {
      let receiver;
      const staticReceiver = classes.has(c.receiver);
      if (c.receiver === 'this') receiver = owner;
      else if (c.receiver === 'super') receiver = baseOf(owner);
      else if (staticReceiver) receiver = c.receiver;
      else receiver = receiverClass(owner, fn, c.receiver);
      target = receiver && methodInHierarchy(receiver, c.name);
      if (!target && receiver) target = methodInHierarchy('Class', c.name);
      // Globals may be declared under alternate #ifdef types (`Game g_Game` vs
      // `DayZGame g_Game`). When the preferred type lacks the method, a unique
      // hit on another declared type is still typed evidence — not a guess
      // among unrelated same-named methods.
      if (!target && receiver && !c.receiver.includes('.')) {
        const alts = globalReceiverAlts.get(c.receiver);
        if (alts?.length > 1) {
          const hits = [];
          for (const alt of alts) {
            const found = methodInHierarchy(alt, c.name) || methodInHierarchy('Class', c.name);
            if (found) hits.push(found);
          }
          const uniq = [...new Map(hits.map((hit) => [targetKey(hit), hit])).values()];
          if (uniq.length === 1) target = uniq[0];
        }
      }
      if (target) confidence = receiver && !['this', 'super'].includes(c.receiver) ? 'typed' : 'scope';
      else if (receiver) {
        return {
          ...c,
          confidence: 'unresolved',
          candidates: candidates.map(targetKey).sort(),
        };
      }
    } else if (owner) {
      target = methodInHierarchy(owner, c.name);
      if (!target) target = candidates.find((candidate) => !candidate.owner);
      // Every script class descends from Class even when the written chain
      // passes through an engine-only base, so its built-ins (ToString,
      // IsInherited, …) are in scope everywhere.
      if (!target) target = methodInHierarchy('Class', c.name);
      if (target) confidence = 'scope';
    } else if (candidates.some((candidate) => !candidate.owner)) {
      target = candidates.find((candidate) => !candidate.owner);
      confidence = 'scope';
    }

    if (!target && candidates.length === 1) {
      target = candidates[0];
      confidence = 'unique';
    }
    if (target) return { ...c, target, confidence };
    return {
      ...c,
      confidence: candidates.length ? 'ambiguous' : 'unresolved',
      candidates: candidates.map(targetKey).sort(),
    };
  };

  const callResolutions = new Map();
  const callerSets = new Map();
  const fieldReferences = new Map();
  const fieldCallerSets = new Map();
  const summary = { total: 0, typed: 0, scope: 0, unique: 0, ambiguous: 0, unresolved: 0 };
  const issueGroups = new Map();
  const resolveBody = (fn, owner) => {
    const resolutions = (fn.calls || []).map((call) => resolveCall(call, owner, fn));
    callResolutions.set(fn, resolutions);
    const caller = owner ? { owner, name: fn.name } : { name: fn.name };
    const callerKey = owner ? `${owner}.${fn.name}` : fn.name;
    for (const resolution of resolutions) {
      summary.total++;
      summary[resolution.confidence]++;
      if (resolution.target) {
        const key = targetKey(resolution.target);
        let set = callerSets.get(key);
        if (!set) callerSets.set(key, (set = new Map()));
        set.set(callerKey, caller);
        continue;
      }
      const expression = resolution.ctor
        ? `new ${resolution.name}`
        : resolution.receiver
          ? `${resolution.receiver}.${resolution.name}`
          : resolution.name;
      const key = `${expression}\0${resolution.candidates?.join(',') || ''}`;
      let issue = issueGroups.get(key);
      if (!issue) {
        issue = {
          expression,
          confidence: resolution.confidence,
          candidates: resolution.candidates || [],
          count: 0,
          callers: [],
        };
        issueGroups.set(key, issue);
      }
      issue.count++;
      if (issue.callers.length < 5 && !issue.callers.includes(callerKey)) issue.callers.push(callerKey);
    }
    const shadowed = new Set([
      ...(fn.params || []).map((p) => p.name),
      ...Object.keys(fn.locals || {}),
    ]);
    const refs = (fn.refs || [])
      .filter((ref) => ref.receiver || !shadowed.has(ref.name))
      .map((ref) => {
        const receiver = ref.receiver === 'super'
          ? baseOf(owner)
          : ref.receiver && ref.receiver !== 'this'
            ? receiverClass(owner, fn, ref.receiver)
            : owner;
        return memberInHierarchy(receiver, ref.name);
      })
      .filter(Boolean);
    const uniqueRefs = [...new Map(refs.map((ref) => [targetKey(ref), ref])).values()];
    fieldReferences.set(fn, uniqueRefs);
    for (const ref of uniqueRefs) {
      const key = targetKey(ref);
      let set = fieldCallerSets.get(key);
      if (!set) fieldCallerSets.set(key, (set = new Map()));
      set.set(callerKey, caller);
    }
  };
  for (const mc of classes.values()) for (const m of mc.methods) resolveBody(m, mc.name);
  for (const fn of functions) resolveBody(fn, null);

  const callers = new Map();
  for (const [key, set] of callerSets) {
    callers.set(
      key,
      [...set.values()].sort(
        (a, b) => (a.owner || '').localeCompare(b.owner || '') || a.name.localeCompare(b.name)
      )
    );
  }
  const fieldCallers = new Map();
  for (const [key, set] of fieldCallerSets) {
    fieldCallers.set(
      key,
      [...set.values()].sort(
        (a, b) => (a.owner || '').localeCompare(b.owner || '') || a.name.localeCompare(b.name)
      )
    );
  }
  const xrefReport = {
    summary,
    issues: [...issueGroups.values()].sort(
      (a, b) => b.count - a.count || a.expression.localeCompare(b.expression)
    ),
  };

  return {
    label: model.label,
    version: model.version,
    build: model.build,
    date: model.date,
    sha: model.sha,
    stats: model.stats,
    callers,
    callResolutions,
    fieldCallers,
    fieldReferences,
    xrefReport,
    classes,
    enums,
    typedefs,
    globals,
    functions,
    defines,
    groups,
    moduleRoots,
    moduleTotal,
    files,
    paths,
    dirRoots,
    rootFiles,
    fields,
    children,
    ancestorsOf,
    typeIndex,
  };
}
