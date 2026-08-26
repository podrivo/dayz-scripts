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
          doc: null,
          group: undefined,
          locations: [],
          methods: [],
          members: [],
          methodKeys: new Map(),
        };
        classes.set(c.name, mc);
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
  const byTitle = (a, b) => groups.get(a).title.localeCompare(groups.get(b).title);
  moduleRoots.sort(byTitle);
  for (const mod of groups.values()) mod.children.sort(byTitle);

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

  // ---- callers
  // Which functions name each function. The parser records the names a body
  // calls without resolving what they are called on, so this is keyed by bare
  // name: everything called "Show" shares one entry. That is imprecise for the
  // common names and exact for the long tail, which is where it earns its
  // keep -- 89% of members carry no documentation at all, and a real call site
  // is the next best thing.
  const callers = new Map();
  const noteCall = (callee, caller) => {
    let list = callers.get(callee);
    if (!list) callers.set(callee, (list = []));
    list.push(caller);
  };
  for (const mc of classes.values()) {
    for (const m of mc.methods) {
      for (const callee of m.calls || []) noteCall(callee, { owner: mc.name, name: m.name });
    }
  }
  for (const fn of functions) {
    for (const callee of fn.calls || []) noteCall(callee, { name: fn.name });
  }
  for (const list of callers.values()) {
    list.sort((a, b) => (a.owner || '').localeCompare(b.owner || '') || a.name.localeCompare(b.name));
  }

  // ---- reference targets
  // The forward direction of the same index: the names a body calls, which
  // Doxygen printed under "References". It resolved them by scope; nothing
  // here type-checks the language, so a name earns a link only when one
  // declaration in the whole build can answer to it. 83% of the 25k member
  // names are that unambiguous. The rest print as plain text, which is what
  // Doxygen did too when a name would not resolve (definition.cpp docifies
  // the name rather than dropping it).
  const refTargets = new Map();
  const claim = (name, target) => {
    if (refTargets.has(name)) refTargets.set(name, null); // now ambiguous
    else refTargets.set(name, target);
  };
  for (const mc of classes.values()) {
    for (const m of mc.methods) claim(m.name, { owner: mc.name, method: true });
    for (const v of mc.members) claim(v.name, { owner: mc.name, method: false });
  }
  for (const fn of functions) claim(fn.name, { method: true });
  for (const [name, t] of refTargets) if (!t) refTargets.delete(name);

  return {
    label: model.label,
    version: model.version,
    build: model.build,
    date: model.date,
    sha: model.sha,
    stats: model.stats,
    callers,
    refTargets,
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
