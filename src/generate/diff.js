// The semantic API diff between two site models (new vs old), in the one shape
// two readers share:
//
//   - the diff.json sidecar every build ships (see src/generate/routes.js)
//   - site/compare.js, which folds a run of those sidecars together to compare
//     two builds that are not neighbours
//
// That last reader is why a row carries its member's name beside the rendered
// declaration rather than only inside it. Folding "added here" against
// "changed in the build after" means matching the two by name, and picking a
// name back out of a rendered signature is not work to do thirty thousand
// times in a browser.
//
// It is also why rows are tuples. They are almost all of the bytes, and
// comparing the oldest build to the newest fetches 48 of these files; the keys
// around them stay spelled out because there are only a dozen of those.

/** What a row says happened to one member. */
export const ADDED = '+';
export const REMOVED = '-';
export const CHANGED = '~';

/**
 * The kinds a diff is keyed by, in the order the site lists them, with what a
 * name of that kind is called and where its page is. site/compare.js carries
 * the same table, because it renders the same data in a place that cannot
 * import from here.
 */
export const DIFF_KINDS = [
  ['class', 'Classes', (n) => `class/${n}/`],
  ['enum', 'Enums', (n) => `enum/${n}/`],
  ['func', 'Global functions', (n) => `globals/functions/#${n}`],
  ['const', 'Constants', (n) => `globals/variables/#${n}`],
  ['typedef', 'Typedefs', (n) => `globals/typedefs/#${n}`],
  ['macro', 'Macros', (n) => `globals/macros/#${n}`],
];

// Rows read as they did on the old changelog: everything gained, then
// everything lost, then everything that merely moved.
const OP_ORDER = { [ADDED]: 0, [REMOVED]: 1, [CHANGED]: 2 };

const cmp = (a, b) => a.localeCompare(b);

function sigText(m) {
  const mods = m.mods?.length ? m.mods.join(' ') + ' ' : '';
  const params = (m.params || [])
    .map((p) => {
      const pm = p.mods?.length ? p.mods.join(' ') + ' ' : '';
      const arr = p.array !== undefined ? `[${p.array}]` : '';
      const def = p.def !== undefined ? ` = ${p.def}` : '';
      return `${pm}${p.type}${p.name ? ' ' + p.name : ''}${arr}${def}`;
    })
    .join(', ');
  return `${mods}${m.ret ? m.ret + ' ' : ''}${m.name}(${params})`;
}

function varText(v) {
  const mods = v.mods?.length ? v.mods.join(' ') + ' ' : '';
  const arr = v.array !== undefined ? `[${v.array}]` : '';
  return `${mods}${v.type ? v.type + ' ' : ''}${v.name}${arr}`;
}

const typedefText = (t) => `typedef ${t.type}${t.array !== undefined ? `[${t.array}]` : ''} ${t.name}`;
const macroText = (d) => (d.value ? `#define ${d.name} ${d.value}` : `#define ${d.name}`);
// Only an explicit initialiser is compared. Auto-numbered enumerators have no
// value in the model at all, which is what keeps inserting one from reading as
// a change to every enumerator after it.
const valueText = (v) => (v.value !== undefined ? `${v.name} = ${v.value}` : v.name);

/**
 * name -> its declaration, collapsing the overloads and #ifdef branches that
 * declare one name more than once. Both are joined into a single entry so that
 * gaining or losing one overload still reads as a change to the name, and
 * sorted so that a reordering in the sources does not.
 */
function byName(list, text) {
  const out = new Map();
  for (const item of list) {
    const seen = out.get(item.name);
    if (seen) seen.push(text(item));
    else out.set(item.name, [text(item)]);
  }
  for (const [name, texts] of out) {
    out.set(name, texts.length > 1 ? [...new Set(texts)].sort().join(' | ') : texts[0]);
  }
  return out;
}

/** Append the rows describing how one set of members became another. */
function memberRows(rows, next, prev) {
  for (const [name, text] of next) {
    const before = prev.get(name);
    if (before === undefined) rows.push([ADDED, name, text]);
    else if (before !== text) rows.push([CHANGED, name, before, text]);
  }
  for (const [name, text] of prev) {
    if (!next.has(name)) rows.push([REMOVED, name, text]);
  }
}

/**
 * One kind whose members are the things being compared: every name that gained,
 * lost or altered a member becomes a `changed` entry holding one row each.
 *
 * `sets` is handed the new and old owner and returns the pairs of name ->
 * declaration maps to compare — two for a class, whose methods and fields are
 * indexed apart, one for an enum.
 */
function diffOwners(next, prev, sets) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const name of next.keys()) if (!prev.has(name)) added.push(name);
  for (const name of prev.keys()) if (!next.has(name)) removed.push(name);
  for (const [name, owner] of next) {
    const before = prev.get(name);
    if (!before) continue;
    const rows = [];
    for (const [a, b] of sets(owner, before)) memberRows(rows, a, b);
    if (rows.length) changed.push({ name, rows });
  }
  return { added, removed, changed };
}

/**
 * One kind with nothing inside it to change, where a change is the declaration
 * itself being rewritten. Its `changed` entries carry the single before-and-
 * after row, so that every kind has the same shape whether or not it has
 * members.
 */
function diffFlat(next, prev) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const [name, text] of next) {
    const before = prev.get(name);
    if (before === undefined) added.push(name);
    else if (before !== text) changed.push({ name, rows: [[CHANGED, name, before, text]] });
  }
  for (const name of prev.keys()) if (!next.has(name)) removed.push(name);
  return { added, removed, changed };
}

/**
 * Every kind of change between two builds, keyed the way the site's URLs are
 * so that a reader can turn a name into a link without a second table.
 *
 * Classes and enums were the whole of this once. The other four are here
 * because they were the changelog's blind spot: a global function or a macro
 * that a build quietly dropped breaks a mod exactly as hard as a class does,
 * and nothing said so.
 */
export function diffModels(newSite, oldSite) {
  const flat = (pick, text) => diffFlat(byName(pick(newSite), text), byName(pick(oldSite), text));

  const kinds = {
    class: diffOwners(newSite.classes, oldSite.classes, (nc, oc) => [
      [byName(nc.methods, sigText), byName(oc.methods, sigText)],
      [byName(nc.members, varText), byName(oc.members, varText)],
    ]),
    enum: diffOwners(newSite.enums, oldSite.enums, (ne, oe) => [
      [byName(ne.values, valueText), byName(oe.values, valueText)],
    ]),
    func: flat((s) => s.functions, sigText),
    const: flat((s) => s.globals, varText),
    typedef: flat((s) => s.typedefs, typedefText),
    macro: flat((s) => s.defines, macroText),
  };

  for (const kind of Object.values(kinds)) {
    kind.added.sort(cmp);
    kind.removed.sort(cmp);
    kind.changed.sort((a, b) => cmp(a.name, b.name));
    for (const entry of kind.changed) {
      entry.rows.sort((a, b) => OP_ORDER[a[0]] - OP_ORDER[b[0]] || cmp(a[1], b[1]));
    }
  }
  return kinds;
}
