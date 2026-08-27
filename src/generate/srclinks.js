// The per-file sidecar that makes a source page's identifiers into links.
//
// Doxygen linked every name in its source listings to the declaration it
// resolved to, and with 89% of members carrying no documentation that is most
// of what makes those pages worth reading. It could do it because it resolved
// by scope. site/app.js on its own cannot: it sees a name and a build-wide
// index, so it can only link the names that exactly one declaration in the
// whole build answers to — which leaves out `Init`, `Update`, `GetGame` and
// every other name worth clicking.
//
// What is missing is the scope, and the generator has it. So rather than
// shipping a target for every identifier occurrence — a six-thousand-line file
// has some twenty thousand of them, and the map would dwarf the source — this
// ships the two things the client cannot work out for itself:
//
//   scopes   the line range each class body covers, with its inheritance
//            chain, so a bare `GetPosition()` inside PlayerBase can be looked
//            up against PlayerBase and then its ancestors
//   decls    the line each declaration in this file sits on and where its
//            documentation is, which is what turns the line numbers of a
//            declaration into a link back to the page describing it
//
// The member names themselves are already in search.json, which a source page
// fetches anyway. Both lists are a few hundred bytes per file, and neither
// goes into the HTML, so file pages stay byte-identical across builds and keep
// the hard link that src/generate/linker.js gives them.

const anchor = (name) => name.replace(/[^\w]/g, '_');

/**
 * opts.chainOf(name) -> the class and its ancestors, nearest first, limited to
 * classes this build documents. Passed in rather than read off the site model
 * so the caller can memoize it across the files that share a base.
 */
export function buildFileLinks(fileModel, chainOf) {
  const scopes = [];
  const decls = [];

  for (const c of fileModel.classes) {
    // A forward declaration has no body, so nothing is written inside it.
    if (!c.forward && c.endLine) scopes.push([c.line, c.endLine, chainOf(c.name)]);
    const url = `class/${c.name}/`;
    decls.push([c.line, url]);
    // Overloads share the plain anchor: the class page numbers the second and
    // later ones, but landing on the first is what the reader wanted anyway.
    for (const m of c.methods) decls.push([m.line, `${url}#${anchor(m.name)}`]);
    for (const v of c.members) decls.push([v.line, `${url}#${anchor(v.name)}`]);
  }

  for (const e of fileModel.enums) {
    decls.push([e.line, `enum/${e.name}/`]);
    for (const v of e.values) decls.push([v.line, `enum/${e.name}/#${v.name}`]);
  }
  for (const t of fileModel.typedefs) decls.push([t.line, `globals/typedefs/#${anchor(t.name)}`]);
  for (const fn of fileModel.functions) decls.push([fn.line, `globals/functions/#${anchor(fn.name)}`]);
  for (const g of fileModel.globals) decls.push([g.line, `globals/constants/#${anchor(g.name)}`]);
  for (const d of fileModel.defines || []) decls.push([d.line, `globals/macros/#${anchor(d.name)}`]);

  // One link per line, the outermost declaration winning, so a class and the
  // first member sharing a line do not fight over the gutter.
  const byLine = new Map();
  for (const [line, url] of decls) if (line && !byLine.has(line)) byLine.set(line, url);

  return {
    scopes,
    decls: [...byLine.entries()].sort((a, b) => a[0] - b[0]),
  };
}

/** chainOf, memoized per site model. */
export function chainBuilder(site) {
  const cache = new Map();
  return (name) => {
    let chain = cache.get(name);
    if (!chain) {
      chain = [name, ...site.ancestorsOf(name)].filter((n) => site.classes.has(n));
      cache.set(name, chain);
    }
    return chain;
  };
}
