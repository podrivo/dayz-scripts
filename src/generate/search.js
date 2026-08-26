// Builds the compact per-version search index consumed by site/app.js.
//
// Format (arrays to keep the JSON small):
// {
//   classes:  ["PlayerBase", ...],
//   enums:    ["eAgents", ...],
//   typedefs: ["TStringArray", ...],
//   methods:  [[classIdx, "MethodName"], ...],
//   consts:   ["MATERIAL_WOOD", ...],
//   funcs:    ["ErrorEx", ...],
//   files:    ["4_World/Entities/....c", ...],
// }
// URLs are reconstructed client-side: class/<name>/, enum/<name>/, ... File
// paths are stored the way they are displayed and lowercased back into a URL,
// since that is exactly how the two spellings relate (see casing.js).

export function buildSearchIndex(site) {
  const classes = [...site.classes.keys()].sort((a, b) => a.localeCompare(b));
  const classIdx = new Map(classes.map((n, i) => [n, i]));

  const methods = [];
  for (const [name, c] of site.classes) {
    const ci = classIdx.get(name);
    const seen = new Set();
    for (const m of c.methods) {
      if (m.kind || seen.has(m.name)) continue; // skip ctors/dtors and dupes
      seen.add(m.name);
      methods.push([ci, m.name]);
    }
  }

  return {
    classes,
    enums: [...site.enums.keys()].sort((a, b) => a.localeCompare(b)),
    typedefs: site.typedefs.map((t) => t.name),
    methods,
    consts: site.globals.map((g) => g.name),
    funcs: site.functions.map((f) => f.name),
    files: site.files.map((f) => f.display),
  };
}
