// The site map of one build: every page it produces, in the order it produces
// them.
//
// Two things read it from opposite directions. src/generate/index.js walks the
// whole build to write it out; src/dev.js looks one page up by URL to render it
// on demand. Both go through this generator so the dev server cannot become a
// second, drifting copy of the site map — a page reachable in one is reachable
// in the other by construction.

import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR } from '../util.js';
import { buildSearchIndex } from './search.js';
import { buildFileLinks, chainBuilder } from './srclinks.js';
import { recordingSite, classDeps, enumDeps, membersDeps } from './memo.js';
import {
  renderHome, renderAnnotated, renderClassesIndex, renderClassesLetter, renderClass,
  renderClassMembers, renderFields, renderEnum, renderGlobals, renderModulesIndex,
  renderModule, renderFilesIndex, renderFile, renderHierarchy, renderChanges,
  renderCompare,
} from './render.js';

/**
 * Every page of one build, as descriptors:
 *
 *   rel     version-relative URL directory, '' for the home page. Also the
 *           memo's page key, which is why it must not name the build: the
 *           latest build renders at the site root and the rest under
 *           /v/<build>/, but the bytes are the same either way.
 *   file    what to write, relative to the version root
 *   kind    which render timer this page's cost belongs to
 *   render  (seen) => body. `seen`, when given, collects the type names the
 *           renderer looked up; see src/generate/memo.js
 *   deps    thunk for the memo's dependency hash, absent on pages with no
 *           tracked inputs. A thunk because hashing every class's dependencies
 *           costs ~155ms per build and a single URL lookup must not pay it.
 *   asset   set on the sidecars the site fetches rather than navigates to, so
 *           they stay out of the page count and the sitemap
 *
 * Being a generator is load-bearing for the lookup side: nothing past the yield
 * a caller stops at is computed, so resolving an early URL never builds the
 * indexes that come after it.
 *
 * opts:
 *   isLatest  whether this build is served from the site root
 *   versions  the build list, for the "all builds" footer on the changelog
 *   srcDir    where this build's sources were extracted
 *   blobs     path -> blob sha, the whole dependency of a file page
 *   changes   () => ({ diff, prevLabel }), called only if /changes/ renders,
 *             since building the diff means holding a second site model
 */
export function* pages(site, opts) {
  const { isLatest, versions, blobs = new Map(), changes = () => ({}) } = opts;
  const srcDir = opts.srcDir ?? path.join(CACHE_DIR, 'src', site.label);

  const ctx = (rel) => {
    const depth = rel === '' ? 0 : rel.replace(/\/$/, '').split('/').length;
    const base = '../'.repeat(depth);
    const root = base + (isLatest ? '' : '../'.repeat(2));
    return { site, versions, base, root, versionPath: rel, xref: isLatest };
  };

  const page = (rel, kind, render, deps) => ({ rel, file: `${rel}index.html`, kind, render, deps });

  // A page that linkifies type names has to be rendered through the recording
  // view, but only when someone is collecting; the dev server renders with no
  // memo behind it and passes nothing.
  const seeing = (rel, seen) => ({ ...ctx(rel), site: seen ? recordingSite(site, seen) : site });

  // home
  yield page('', 'index', () => renderHome(ctx('')));

  // modules (\defgroup topics)
  yield page('modules/', 'index', () => renderModulesIndex(ctx('modules/')));
  for (const mod of site.groups.values()) {
    const rel = `module/${mod.name}/`;
    yield page(rel, 'index', () => renderModule(ctx(rel), mod));
  }

  // data structures, indexed by initial
  const letters = new Map();
  for (const name of [...site.classes.keys()].sort((a, b) => a.localeCompare(b))) {
    const l = /^[a-z]/i.test(name) ? name[0].toLowerCase() : '_';
    if (!letters.has(l)) letters.set(l, []);
    letters.get(l).push(name);
  }
  yield page('annotated/', 'index', () => renderAnnotated(ctx('annotated/'), letters));
  yield page('classes/', 'index', () => renderClassesIndex(ctx('classes/'), letters));
  for (const [l, names] of letters) {
    const rel = `classes/${l}/`;
    yield page(rel, 'index', () => renderClassesLetter(ctx(rel), l, names, letters.keys()));
  }

  // class pages, and for anything with a base the flat list of everything it
  // inherits as well
  for (const cls of site.classes.values()) {
    const rel = `class/${cls.name}/`;
    yield page(rel, 'class', (seen) => renderClass(seeing(rel, seen), cls), () => classDeps(site, cls, isLatest));
    if (site.ancestorsOf(cls.name).some((n) => site.classes.has(n))) {
      const mrel = `${rel}members/`;
      yield page(mrel, 'class', (seen) => renderClassMembers(seeing(mrel, seen), cls), () => membersDeps(site, cls));
    }
  }

  // data fields: every class member, by initial and by kind
  const fieldLetters = [...site.fields.keys()].sort();
  for (const [kind, dir, keep] of [
    ['all', 'fields/', null],
    ['functions', 'fields/functions/', (o) => o.method],
    ['variables', 'fields/variables/', (o) => !o.method],
  ]) {
    yield page(dir, 'index', () => renderFields(ctx(dir), null, [], fieldLetters, kind));
    for (const l of fieldLetters) {
      const rel = `${dir}${l}/`;
      yield page(rel, 'index', () => {
        const all = site.fields.get(l);
        const entries = keep
          ? all.map(([n, owners]) => [n, owners.filter(keep)]).filter(([, owners]) => owners.length)
          : all;
        return renderFields(ctx(rel), l, entries, fieldLetters, kind);
      });
    }
  }

  // enum pages
  for (const en of site.enums.values()) {
    const rel = `enum/${en.name}/`;
    yield page(rel, 'enum', (seen) => renderEnum(seeing(rel, seen), en), () => enumDeps(site, en));
  }

  // globals, split the way doxygen splits them
  for (const kind of ['', 'functions/', 'variables/', 'typedefs/', 'enums/', 'values/', 'macros/']) {
    const rel = `globals/${kind}`;
    yield page(rel, 'index', () => renderGlobals(ctx(rel), kind));
  }

  yield page('hierarchy/', 'index', () => renderHierarchy(ctx('hierarchy/')));
  yield page('files/', 'index', () => renderFilesIndex(ctx('files/')));
  yield page('changes/', 'index', () => {
    const { diff, prevLabel } = changes();
    return renderChanges(ctx('changes/'), diff, prevLabel);
  });
  // No diff is built for this one: it picks its own pair of builds and compares
  // them in the browser. See renderCompare in src/generate/render.js.
  yield page('compare/', 'index', () => renderCompare(ctx('compare/')));

  // file pages with embedded source
  const fileModels = new Map(site.rawFiles.map((f) => [f.path, f]));
  let chainOf;
  for (const f of site.files) {
    const rel = `file/${f.path.replace(/^scripts\//, '')}/`;
    // The blob sha is the whole dependency: renderFile reads nothing off the
    // site model, and the decls it lists are a pure function of these bytes.
    yield page(
      rel,
      'file',
      () => renderFile(ctx(rel), f, fileModels.get(f.path), fs.readFileSync(path.join(srcDir, f.path), 'utf8')),
      () => blobs.get(f.path)
    );
    // What the page's identifiers resolve to, fetched rather than inlined so
    // the page above keeps its hard link. Unlike that page this one does read
    // the site model — an inheritance chain can change under an untouched
    // file — so the chain goes into its dependency hash alongside the blob.
    yield {
      rel: `${rel}links.json`,
      file: `${rel}links.json`,
      kind: 'file',
      asset: true,
      render: () => JSON.stringify(buildFileLinks(fileModels.get(f.path), (chainOf ||= chainBuilder(site)))),
      deps: () => {
        chainOf ||= chainBuilder(site);
        const chains = fileModels.get(f.path).classes.map((c) => chainOf(c.name).join('>')).join(';');
        return `${blobs.get(f.path) || ''}|${chains}`;
      },
    };
  }

  // search index
  yield {
    rel: 'search.json',
    file: 'search.json',
    kind: 'search',
    asset: true,
    render: () => JSON.stringify(buildSearchIndex(site)),
  };

  // The sidebar's module topics. Kept out of the pages themselves so that they
  // stay identical from build to build and can go on being hard-linked; see
  // the note on NAV in html.js.
  yield {
    rel: 'nav.json',
    file: 'nav.json',
    kind: 'index',
    asset: true,
    render: () => JSON.stringify({ topics: site.moduleRoots.map((n) => [n, site.groups.get(n).title]) }),
  };
}

/**
 * The one descriptor whose `rel` is this URL, or null. A scan rather than a
 * lookup table, so there is nothing here that can disagree with what the
 * generator writes; ~8,700 descriptors with no rendering and no dependency
 * hashing behind them costs well under a millisecond.
 */
export function resolve(site, rel, opts) {
  for (const p of pages(site, opts)) if (p.rel === rel) return p;
  return null;
}
