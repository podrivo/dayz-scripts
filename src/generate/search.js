// Builds the compact per-version search index consumed by site/app.js.
//
// Format (arrays to keep the JSON small):
// {
//   classes:  ["PlayerBase", ...],
//   enums:    ["eAgents", ...],
//   typedefs: ["TStringArray", ...],
//   methods:  [[classIdx, "MethodName"], ...],
//   vars:     [[classIdx, "m_Health"], ...],
//   values:   [[enumIdx, "MASK_ANIM_NONE"], ...],
//   consts:   ["MATERIAL_WOOD", ...],
//   funcs:    ["ErrorEx", ...],
//   macros:   ["DIAG_DEVELOPER", ...],
//   topics:   [["GameConstants", "Game constants"], ...],
//   files:    ["4_World/Entities/....c", ...],
//   docs:     {"class/PlayerBase/#OnJumpStart": "Called when jumping.", ...},
// }
// URLs are reconstructed client-side: class/<name>/, enum/<name>/, ... File
// paths are stored the way they are displayed and lowercased back into a URL,
// since that is exactly how the two spellings relate (see casing.js).
//
// Everything a page anchors is indexed, because with 89% of members carrying
// no documentation, looking a name up is most of what this site is for. The
// omissions that used to be here were the ones a modder reaches for first:
// `m_Health` is a field, `MASK_ANIM_NONE` an enumerator, and neither could be
// found. Owners are stored as indices into the two name arrays rather than
// repeated per member, which is what keeps the extra ~19k entries cheap.

import { parseDoc } from '../parser/docparse.js';

const anchorOf = (name) => name.replace(/[^\w]/g, '_');

export function buildSearchIndex(site) {
  const classes = [...site.classes.keys()].sort((a, b) => a.localeCompare(b));
  const classIdx = new Map(classes.map((n, i) => [n, i]));
  const enums = [...site.enums.keys()].sort((a, b) => a.localeCompare(b));
  const enumIdx = new Map(enums.map((n, i) => [n, i]));
  const docs = {};
  const addDoc = (url, raw) => {
    const brief = parseDoc(raw)?.brief?.replace(/\s+/g, ' ').trim();
    if (brief && !docs[url]) docs[url] = brief;
  };

  const methods = [];
  const vars = [];
  for (const [name, c] of site.classes) {
    const ci = classIdx.get(name);
    addDoc(`class/${name}/`, c.doc);
    // One entry per name per owner: a page has one anchor for it either way,
    // and overloads would otherwise fill the results with identical rows.
    const seenM = new Set();
    for (const m of c.methods) {
      if (m.kind) continue; // skip ctors/dtors
      addDoc(`class/${name}/#${anchorOf(m.name)}`, m.doc);
      if (seenM.has(m.name)) continue;
      seenM.add(m.name);
      methods.push([ci, m.name]);
    }
    const seenV = new Set();
    for (const v of c.members) {
      if (seenV.has(v.name)) continue;
      seenV.add(v.name);
      vars.push([ci, v.name]);
      addDoc(`class/${name}/#${anchorOf(v.name)}`, v.doc);
    }
  }

  const values = [];
  for (const name of enums) {
    const ei = enumIdx.get(name);
    const seen = new Set();
    for (const v of site.enums.get(name).values) {
      if (seen.has(v.name)) continue;
      seen.add(v.name);
      values.push([ei, v.name]);
      addDoc(`enum/${name}/#${v.name}`, v.doc);
    }
    addDoc(`enum/${name}/`, site.enums.get(name).doc);
  }

  for (const t of site.typedefs) addDoc(`globals/typedefs/#${t.name}`, t.doc);
  for (const g of site.globals) addDoc(`globals/constants/#${g.name}`, g.doc);
  for (const f of site.functions) addDoc(`globals/functions/#${f.name}`, f.doc);
  for (const d of site.defines) addDoc(`globals/macros/#${d.name}`, d.doc);

  return {
    classes,
    enums,
    typedefs: site.typedefs.map((t) => t.name),
    methods,
    vars,
    values,
    consts: site.globals.map((g) => g.name),
    funcs: site.functions.map((f) => f.name),
    macros: site.defines.map((d) => d.name),
    // Labels are what the site shows a topic as; the name is what its URL uses.
    topics: [...site.groups.values()].map((g) => [g.name, g.label]),
    files: site.files.map((f) => f.display),
    docs,
  };
}
