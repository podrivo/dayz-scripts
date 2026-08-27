# YADZ DIFF - DayZ Internal File Finder

Custom documentation site for the DayZ Enforce Script API, generated from the
official [DayZ Script Diff](https://github.com/BohemiaInteractive/DayZ-Script-Diff)
sources. Live at [dayz-scripts.yadz.app](https://dayz-scripts.yadz.app).

It is a fully custom, mobile-friendly static site: friendly URLs, fast
client-side search, inheritance trees, syntax-highlighted sources, and
per-build changelogs with a build selector (every published build, e.g.
1.29.163709, 1.29.163451, ...).

## Structure

The scripts are documented with [Doxygen](https://www.doxygen.nl/) comments;
this site renders them, following Doxygen's usual sections:

- **Modules** (`/modules/`, `/modules/<Name>/`) — the topics the sources group
  themselves into with `\defgroup` blocks: the engine-facing APIs (math,
  physics, entities, widgets) and the constant tables. Nesting comes from
  blocks opened inside other blocks, so the tree is the one the sources
  describe rather than one imposed here.
- **Data Structures** — every class, as an annotated list (`/classes/`), a
  name-only index by initial (`/classes/index/`), the inheritance tree
  (`/hierarchy/`) and an index of all ~43,000 members (`/classes/fields/`). A class
  with a base class also has `/class/<Name>/members/`, everything it inherits
  in one list.
- **Files** — the script tree (`/files/`, `/file/<path>/`) and everything
  declared outside a class (`/globals/`), split into functions, constants,
  typedefs, enums, values and macros.

## How it works

```
src/fetch.js      clones DayZ-Script-Diff, maps commits to builds    -> data/versions.json
src/parse-all.js  parses every build's .c files (Enforce Script)     -> data/model-<build>.json
src/generate/     renders static HTML from the models                -> dist/
src/dev.js        renders one page per request, for development      -> localhost:3000
```

Which pages a build has lives in `src/generate/routes.js`, as one generator
yielding a descriptor per page. Both readers go through it, from opposite
ends: `src/generate/index.js` walks the whole build to write it out, and
`src/dev.js` looks a single page up by URL. That is what keeps the dev server
from becoming a second, drifting copy of the site map — a page reachable in
one is reachable in the other by construction, which `test/routes.test.js`
asserts directly.

Pages carry no build number, version or date: consecutive builds share 98-99%
of their pages, so the generator writes the latest build as real HTML and
stores only the pages that differ for older builds. Unique historical bodies
live under `/_b/<sha>` (the page inner, without layout chrome) and
`/v/<build>/pages.json` lists those exceptions. Identical archive URLs rewrite
to `/archive.html`, which fetches the latest copy, so `dist/` stays one copy
of each body instead of ~49 hard-linked trees. The build stamp is restored in
the browser from the URL plus `assets/versions.json`. `test/render.test.js`
guards the invariant, because a build number leaking back into `layout()`
would silently undo all of it.

That same redundancy is worth avoiding earlier, while rendering rather than
while writing. A page is only rendered when something it reads has changed
since the previous build, which is true of about 6% of them; the rest reuse the
bytes they already hashed to. That means tracking what each page reads — its
model object, the inheritance graph around it, and every type name it looked
up to decide what becomes a link — which `src/generate/memo.js` explains in
full. `npm run generate:verify` re-renders every reused page and fails if one
of them changed, so a renderer that grows a dependency the tracking does not
know about is caught rather than shipped.

Filesystem work (writes, and the remaining hard links for identical latest
pages) runs on a worker pool while the main thread renders the next build.

Pages must reference assets by absolute path since an archived page is served
from `/archive.html` while the URL stays at `/v/<build>/…`.

The sidebar is the third consequence, and the least obvious one. Anything in it
is in every page, so anything in it that a build can change costs the reuse of
every page in the builds where it changes — and, worse, is not noticed by the
dependency tracking above, which watches the model rather than the chrome, so
reused pages keep the sidebar of the build that first rendered them. The
module topics are the one part that varies, and they are fetched per build
from `nav.json` instead of being written into the page. The rest of the tree is
the same in every build and is inlined.

## Topics

The Modules section is built from the `\defgroup` blocks the sources wrap their
declarations in, and reading those the way Doxygen did turns out to be most of
the work. Two rules decide almost everything:

- A plain `//@}` closes nothing. In Doxygen's `src/commentcnv.l` only `///` and
  `//!` set `inSpecialComment`, and only special comments reach `commentscan.l`
  where `@}` calls `docGroup.close()`; a plain `//` comment matches the "one
  line normal C++ comment" rule and is passed through. The sources use the plain
  form 257 times across 34 files, so those topics ran on to the end of the file.
  `sound.c` ends its API topic that way; honouring it leaves that topic with
  three functions instead of the six classes and eighty members Doxygen showed.
- A `@{` that names no group opens a *member group* — the sources use them under
  `\name` to caption a run of constants — and it takes its own `@}` with it.
  Without that distinction the member group at the top of `enwidgets.c` closes
  the topic covering the entire widget API, and all 29 of its classes fall out.

Topic pages follow the order Doxygen used for a group, which is `group/memberdecl/*`
then `group/memberdef/*` in its `src/layout.cpp`: every declaration is summarised
in a table — Data Structures, Macros, Typedefs, Enumerations, Enumerator,
Functions, Variables — and then documented in full below under Function
Documentation and its siblings. Members are bucketed by shape rather than by
owner, so a class method sits under Functions beside a free one, which is why
each documented block names the type it belongs to. That repetition is what made
Doxygen's group pages run to 300 KB, and it is why ours run to 500 KB.

Two differences from the archived output are deliberate. `SoundController` there
lists eleven `WaveKind` enumerators under Variables and has no Enumerations
section at all, because Enforce Script omits the semicolon after `}` and
Doxygen's C parser therefore never finished the `enum WaveKind {…}` declaration
at the top of `sound.c` — it consumed the `\defgroup … @{` comment seven lines
below while still inside it, so the enum's values landed in a group that starts
after them. We file all fourteen values under the enums that declare them. And
`Overwrite`, `~AbstractWave` and the five `ScriptInvoker` event fields appear
here and not there.

The `doxygen-archive` branch keeps a copy of Doxygen's generated HTML for the
same scripts — an older version of this website.

## Cross-references

Only 4,869 of the 42,927 class members carry a doc comment, so for most of this
API the way to learn what something does is to read somewhere it is already
used. Every signature carries both directions of that: "References" for what
the body calls, "Referenced by" for where it is called from, which are the two
lists Doxygen printed under the same names.

The parser records the names each function body calls but does not resolve what
they are called on, so the index is keyed by bare name and everything called
`Show` shares an entry. That is imprecise for the common names and exact for
the long tail, which is where it earns its keep: the median name has two
callers, and `Cast` has 4,955. Past three the rest fold away, and past fifty
they are only counted. Going the other way a name is linked only where one
declaration in the build answers to it — 53% of them — and the rest are printed
as plain text, which is what `definition.cpp` does with a name it cannot
resolve either.

Three things this costs. Bodies are no longer skipped, which grows a parsed
model by about 17%. The lists are 23 MB of the newest build, three quarters of
it the callers, since what a body calls is bounded by its length while what
calls it is not. And a class page now depends on the whole call graph rather
than on its own class, so `classDeps` in src/generate/memo.js hashes both the
caller list of every method it shows and where each name those methods call
resolves to; a second class picking up a name unlinks it on every page that
calls it. Without that a reused packed body would serve whichever build
rendered it first. Only the newest build carries cross-references for that
reason — extending them to all 49 costs 419 MB of lost deduplication against
the 54 MB they cost on their own.

## Source cross-links

Doxygen's source pages linked every name to the declaration it resolved to, and
with 89% of members undocumented that is most of what made them worth reading.
The same links are here, but resolved in the browser rather than written into
the page: `site/app.js` already highlights the source client-side, and
`search.json` already carries every class, enum, typedef and method with its
owner, so the file page is painted once immediately and again once that index
arrives. Nothing is added to the HTML, which is what lets a file page stay
byte-identical across builds — the same constraint that keeps the module tree
out of the sidebar.

Resolving against that index alone only links the names exactly one
declaration in the build answers to, which leaves out `Init`, `Update`,
`GetGame` and most of what is worth clicking — about 36% of the identifiers on
a page. What is missing is the scope, and the generator has it, so each file
page carries a `links.json` beside it (`src/generate/srclinks.js`) holding the
line range of every class body with its inheritance chain, plus the line each
declaration sits on. A bare `GetPosition()` inside `PlayerBase` is then looked
up against `PlayerBase` and then its ancestors, which takes coverage to about
60% — the rest being local variables and parameters, which have nothing to
link to. The same file tells each declaration's line number where its
documentation is, so the gutter links back the way the `src` link on a member
links out.

## All members of a class

`/class/<Name>/members/` lists everything callable on a class, its own and
everything it inherits, with the class that declares each name and whether it
overrides one further up. `ItemBase` is `ItemBase › InventoryItem › EntityAI ›
Entity › ObjectTyped › Object › IEntity › Managed`, and its own page shows one
eighth of the 1,187 members it actually has.

The rows are built in the browser. Written into the page they cost 564 MB
across a single build, because a member appears once for every class that
inherits it and these hierarchies are both deep and wide; composed from
`search.json`, which already lists every class's methods and fields with their
owner and is fetched for the command palette regardless, they cost nothing.
The page ships the chain and an empty table, so its bytes depend on the chain
alone and adding a member to a base class does not touch any of the six
thousand pages below it.

## Path capitalisation

The upstream repository lowercases every path, so the file the game ships as
`1_Core/Debug/DebugText.c` arrives as `scripts/1_core/debug/debugtext.c`. The
site shows the original spelling back: `src/generate/pathnames.json` holds the
game tree's own capitalisation, and covers all but a handful of today's files.
The rest are spelled after the type they declare, since `contextmenu.c` holds
`class ContextMenu`.

Only what is displayed changes. URLs, redirects and the search index keep the
lowercase spelling, and `test/casing.test.js` asserts that a display path never
disagrees with its URL about which file it is.

The homepage also carries hand-maintained content — community links, the official
forum thread of each PC stable update, and the marketing name of the versions
that have one — which lives in `src/generate/content.js`. Add the thread URL
there when a new build ships; builds without one still appear, they just don't
link to release notes.

The parser is a real lexer + recursive-descent declaration parser for Enforce
Script (not regex scraping). It understands classes (both `extends` and `:`
inheritance), generic templates, the full method modifier set (`proto`,
`native`, `owned`, `external`, `volatile`, `event`, `sealed`, ...), enums,
typedefs, global constants/functions, macros, Doxygen-style doc comments and
group blocks (`\defgroup` / `\addtogroup`, which become the Modules section),
and preprocessor conditions (`#ifdef DIAG_DEVELOPER` etc.), which are shown as
badges instead of being stripped.

## Local development

Requires Node.js 20+ and git. No npm dependencies.

```sh
npm run fetch      # clone/update upstream, detect versions
npm run parse      # parse all versions into JSON models (cached by commit)
npm run dev        # render on demand at http://localhost:3000, reload on save
npm run generate   # render the static site into dist/
npm run generate:latest  # render only the newest build
npm run generate:verify  # re-render every reused page and check it is unchanged
npm run build      # fetch, parse and generate
npm run preview    # serve a real dist/ at http://localhost:3000
npm test           # parser, routing, rendering, casing and module-tree tests
```

`npm run dev` is the inner loop, and it never generates anything. It loads the
newest build's model once and renders whichever page the browser asks for,
which is a few milliseconds each; older builds under `/v/<build>/` load the
same way if you browse to one, and the changelog's diffs are built only when
that page fetches them. So it needs `fetch` and `parse`, but not `generate`.

Edits are picked up by restarting rather than by invalidating anything, since
rebuilding one model costs less than the browser takes to notice: it runs under
`node --watch`, and every page it serves carries a snippet that watches the
process over SSE and reloads when it changes. Editing a renderer, the
stylesheet or `site/app.js` is in the browser about a second later. Assets come
straight from `site/`, so there is no copy step in the way.

Use `npm run preview` when the thing being checked is the real `dist/` —
archive rewrites, redirects, the sitemap — rather than a page.

Changing the parser means the cached models no longer match what it produces,
so re-run the parse with `FORCE_PARSE=1 npm run parse` (or `ONLY_VERSION=1.29`
for a single build) rather than relying on the commit-sha cache.

`LINK_THREADS` overrides how many threads do the filesystem writes.

## Deployment

`.github/workflows/build.yml` runs on a daily schedule (and on push / manual
dispatch). It skips early when the upstream repo has no new commit, otherwise
it rebuilds everything and deploys `dist/` to Netlify. Requires two repository
secrets: `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.

## Links

The homepage carries the same two lists, from `src/generate/content.js`.

**Official**

- [DayZ Script Diff](https://github.com/BohemiaInteractive/DayZ-Script-Diff) — the script sources this site is generated from
- [DayZ Modding Samples](https://github.com/BohemiaInteractive/DayZ-Samples)
- [DayZ Central Economy](https://github.com/BohemiaInteractive/DayZ-Central-Economy)
- [DayZ Additional Resources](https://github.com/BohemiaInteractive/DayZ-Misc)
- [GitHub Repositories](https://github.com/orgs/BohemiaInteractive/repositories?q=dayz) — every official Bohemia Interactive DayZ repo
- [DayZ.com](https://dayz.com/) — official game website and news
- [DayZ Forums](https://forums.dayz.com/) — announcements and stable update threads
- [Community Wiki](https://community.bistudio.com/wiki/Category:DayZ) — Bohemia Interactive wiki pages for DayZ
- [Feedback Tracker](https://feedback.bistudio.com/tag/dayz/) — report bugs and follow known issues
- [DayZ Tools](https://store.steampowered.com/app/830640/DayZ_Tools/) — official modding tools on Steam

**Community**

- [YADZ](https://discord.gg/nbrHqZCpA6) — Discord · bugs and suggestions for this site
- [DayZ Modders](https://discord.gg/dayz-modders-452035973786632194) — Discord · modding and scripting help
- [DayZ Academy](https://discord.gg/BMnpGEzKdx) — Discord · modders and server owners
- [DayZ Editor](https://discord.gg/dayz-editor-738181536029081662) — Discord · support for the DayZ Editor mod
- [Mikero's Tools](https://mikero.bytex.digital/) — PBO packing and file conversion tools
- [WOBO Tools](https://wobo.tools/) — item, weapon and loot data explorer
- [DayZ Wiki](https://dayz.wiki.gg/) — community-run gameplay and item wiki
- [iZurvive](https://izurvive.com/) — interactive maps with loot spawn layers
- [CFTools Cloud](https://cftools.cloud/) — server management, player and ban tools
- [DayZ Expansion](https://dayzexpansion.com/) — mod framework wiki, guides and configuration

## License

Two different licenses apply, and the distinction matters:

**This generator** — everything tracked in this repository, i.e. `src/`,
`site/`, `test/` and the build configuration — is released under the
[MIT License](LICENSE). Reuse it however you like.

**The generated documentation** — the DayZ script sources it renders, which
live in `data/` and `dist/` and are deliberately not tracked here — is not
mine to license, and MIT does not extend to it. Those terms follow.
(`src/generate/pathnames.json` is the one exception in this repository: it
holds the file and directory names of the script tree, and nothing of its
contents, so that the site can spell paths the way the game does.)

Those sources are © BOHEMIA INTERACTIVE a.s., all rights reserved, and are
licensed under the
[DayZ Public License (DPL)](https://www.bohemia.net/community/licenses/dayz-public-license-dpl),
which permits non-commercial, DayZ-only reuse with attribution. They are
modified here only for presentation — parsed, reorganized and reformatted into
documentation pages — from the originals in
[DayZ Script Diff](https://github.com/BohemiaInteractive/DayZ-Script-Diff/tree/main/scripts),
and are offered as-is, without warranties of any kind.

The DPL does not license trademarks and carries no share-alike obligation, so
it places no conditions on the MIT-licensed generator above.

This is not an official documentation and it is not affiliated with DayZ or
Bohemia Interactive. DAYZ®, ENFUSION®, and BOHEMIA INTERACTIVE® are registered
trademarks of BOHEMIA INTERACTIVE a.s.
