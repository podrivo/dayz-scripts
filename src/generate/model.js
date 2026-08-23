// Transforms a parsed per-version model (data/model-X.json) into a site
// model: classes merged across declarations, inheritance graph, and a type
// index used to linkify type names in signatures.

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

export function buildSiteModel(model) {
  const classes = new Map(); // name -> merged class
  const enums = new Map();
  const typedefs = [];
  const globals = [];
  const functions = [];
  const groups = new Map(); // defgroup name -> {name, title}
  const files = [];

  for (const f of model.files) {
    const seg = f.path.split('/')[1] || '';
    const fileEntry = {
      path: f.path,
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
      },
    };
    files.push(fileEntry);

    for (const g of f.groups || []) {
      if (!groups.has(g.name)) groups.set(g.name, { name: g.name, title: g.title });
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
          locations: [],
          methods: [],
          members: [],
          methodKeys: new Map(),
        };
        classes.set(c.name, mc);
      }
      mc.locations.push({ path: f.path, line: c.line, forward: !!c.forward });
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
  }

  for (const mc of classes.values()) delete mc.methodKeys;

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

  return {
    label: model.label,
    version: model.version,
    build: model.build,
    date: model.date,
    sha: model.sha,
    stats: model.stats,
    classes,
    enums,
    typedefs,
    globals,
    functions,
    groups,
    files,
    children,
    ancestorsOf,
    typeIndex,
  };
}
