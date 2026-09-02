// Cross-build page memoization.
//
// A full build emits ~417k pages but only ~23k distinct bodies: a class page
// is re-rendered byte for byte in every build where nothing it reads changed.
// This records what each page read while it was rendered so the next build can
// recognise it as unchanged and go straight to the hard link, skipping the
// render, the SHA-1 and, for file pages, the source read.
//
// Soundness rests on one rule: reuse a page only when every input its renderer
// touched is unchanged. Per the renderers in src/generate/render/ that means
//   - class pages: the merged class object, the ancestor chain and whether
//     each ancestor is a documented class, the derived-class list, the caller
//     list of every method name it shows, where each name those methods call
//     resolves to, and every name looked up in site.typeIndex (which decides
//     what becomes a link)
//   - enum pages: the merged enum object and the same typeIndex lookups
//   - file pages: the source bytes only — renderFile reads nothing off site,
//     and the parsed decls are a pure function of those bytes
// A renderer that grows a dependency not listed here would start serving stale
// pages, which is what GENERATE_VERIFY=1 in src/generate/index.js exists to
// catch.

import crypto from 'node:crypto';

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

/**
 * typeIndex lookups are the awkward dependency: a page queries every
 * capitalized word in its docs and every identifier in its signatures, hit or
 * miss, because a name that becomes a known type turns into a link. Storing
 * those words per page as strings would cost hundreds of megabytes, so they
 * are interned to integers and kept as one Int32Array per page.
 */
class Interner {
  #ids = new Map();

  intern(word) {
    let id = this.#ids.get(word);
    if (id === undefined) {
      id = this.#ids.size;
      this.#ids.set(word, id);
    }
    return id;
  }

  idOf(word) {
    return this.#ids.get(word);
  }

  get size() {
    return this.#ids.size;
  }
}

export class PageMemo {
  #words = new Interner();
  #prev = new Map(); // page key -> { deps, hash, words }
  #next = new Map();
  #stale = new Uint8Array(0); // word id -> changed kind since the previous build

  /**
   * Mark the type names whose meaning changed since the previous build. Only
   * names some page actually queried can matter, so unknown ones are skipped:
   * no stored word list can contain them.
   */
  startBuild(typeIndex, prevTypeIndex) {
    this.#stale = new Uint8Array(this.#words.size);
    if (!prevTypeIndex) return;
    const mark = (name) => {
      const id = this.#words.idOf(name);
      if (id !== undefined && id < this.#stale.length) this.#stale[id] = 1;
    };
    for (const [name, kind] of typeIndex) if (prevTypeIndex.get(name) !== kind) mark(name);
    for (const name of prevTypeIndex.keys()) if (!typeIndex.has(name)) mark(name);
  }

  /** The previous build's entry for this page, or undefined if it must be re-rendered. */
  lookup(key, deps) {
    const entry = this.#prev.get(key);
    if (!entry || entry.deps !== deps) return undefined;
    const ids = entry.words;
    for (let i = 0; i < ids.length; i++) if (this.#stale[ids[i]]) return undefined;
    return entry;
  }

  /** Carry a reused entry into this build so the next one can reuse it again. */
  keep(key, entry) {
    this.#next.set(key, entry);
  }

  record(key, deps, hash, seenWords, extra = {}) {
    const ids = new Int32Array(seenWords ? seenWords.size : 0);
    if (seenWords) {
      let i = 0;
      for (const word of seenWords) ids[i++] = this.#words.intern(word);
    }
    this.#next.set(key, { deps, hash, words: ids, ...extra });
  }

  endBuild() {
    this.#prev = this.#next;
    this.#next = new Map();
  }
}

/**
 * A view of the site model that records every typeIndex lookup a renderer
 * makes. Only the lookups need intercepting; everything else a class or enum
 * page reads is covered by its deps hash.
 */
export function recordingSite(site, seenWords) {
  const real = site.typeIndex;
  return {
    ...site,
    typeIndex: {
      get(word) {
        seenWords.add(word);
        return real.get(word);
      },
    },
  };
}

/**
 * How the "Defined in" paths are spelled. They are a pure function of the file
 * plus a fixed dictionary (see src/generate/casing.js), but the file's own
 * contents decide it when the dictionary is silent, so they are part of what a
 * page reads rather than something the class object already covers.
 */
function shownPaths(site, locations) {
  return locations.map((l) => site.paths.get(l.path)).join(',');
}

/**
 * The cross-reference dependencies a page has that are not about its own
 * subject. Both directions of the call graph are global: a class page shows
 * where each of its methods is called from, and whether each name its methods
 * call resolves to one declaration, so a change anywhere in the sources can
 * change the page while the class itself is untouched. Computed on demand and
 * cached per build, so the cost is one pass over the names class pages
 * actually show rather than over every edge in the call graph.
 */
const xrefDigests = new WeakMap();

function digestFor(site, key, compute) {
  let perSite = xrefDigests.get(site);
  if (!perSite) xrefDigests.set(site, (perSite = new Map()));
  let digest = perSite.get(key);
  if (digest === undefined) perSite.set(key, (digest = compute()));
  return digest;
}

function callerDigest(site, owner, name) {
  const key = owner ? `${owner}.${name}` : name;
  return digestFor(site, `<${key}`, () => {
    const list = site.callers?.get(key);
    return list ? sha1(list.map((c) => (c.owner ? `${c.owner}.${c.name}` : c.name)).join(',')) : '';
  });
}

function targetDigest(resolution) {
  const kind = resolution.ctor ? 'new:' : '';
  if (resolution.target) {
    return `${kind}${resolution.confidence}:${resolution.target.owner || ''}.${resolution.target.name}`;
  }
  return `${kind}${resolution.confidence}:${(resolution.candidates || []).join(',')}`;
}

export function classDeps(site, cls, xref = true) {
  const chain = site
    .ancestorsOf(cls.name)
    .map((n) => (site.classes.has(n) ? `+${n}` : `-${n}`))
    .join(',');
  const kids = (site.children.get(cls.name) || []).join(',');
  const module = cls.group ? site.groups.get(cls.group)?.label : '';
  const xrefs = xref
    ? cls.methods
        .map(
          (m) =>
            `${callerDigest(site, cls.name, m.name)}|${(site.callResolutions.get(m) || []).map(targetDigest).join(',')}`
        )
        .join(';')
    : 'none';
  return sha1(`${chain}\n${kids}\n${module}\n${shownPaths(site, cls.locations)}\n${xrefs}\n${JSON.stringify(cls)}`);
}

export function enumDeps(site, en) {
  return sha1(`${shownPaths(site, en.locations)}\n${JSON.stringify(en)}`);
}

/**
 * The all-members page is its inheritance chain and nothing else — the rows
 * are composed in the browser from search.json — so the chain is the whole of
 * what it depends on. Adding a member to a base class does not touch it,
 * which is what keeps six thousand of these pages reusable between builds.
 */
export function membersDeps(site, cls) {
  return sha1([cls.name, ...site.ancestorsOf(cls.name)].filter((n) => site.classes.has(n)).join(','));
}
