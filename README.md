# DayZ Scripts Docs

Custom documentation site for the DayZ Enforce Script API, generated from the
official [DayZ Script Diff](https://github.com/BohemiaInteractive/DayZ-Script-Diff)
sources. Live at [dayz-scripts.yadz.app](https://dayz-scripts.yadz.app).

It is a fully custom, mobile-friendly static site: friendly URLs, fast
client-side search, inheritance trees, syntax-highlighted sources, and
per-build changelogs with a build selector (every published build, e.g.
1.29.163709, 1.29.163451, ...).

## How it works

```
src/fetch.js      clones DayZ-Script-Diff, maps commits to builds    -> data/versions.json
src/parse-all.js  parses every build's .c files (Enforce Script)     -> data/model-<build>.json
src/generate/     renders static HTML from the models                -> dist/
```

Pages carry no build number, version or date: consecutive builds share 98-99%
of their pages, so the generator emits each distinct page once and hard-links
every other URL to it. That turns ~417,000 pages into ~23,000 files and keeps
`dist/` around 380 MB instead of 3.9 GB, and lets Netlify upload each unique
page once. The build stamp is restored in the browser from the URL plus
`assets/versions.json`. `test/render.test.js` guards the invariant, because a
build number leaking back into `layout()` would silently undo all of it.

Two consequences worth knowing: `dist/` measures ~3 GB to anything that follows
hard links (`cp -r`, `tar`, `du -L`) rather than counting inodes, and pages must
reference assets by absolute path since the same file is served at several
depths.

The homepage also carries hand-maintained content — community links, the official
forum thread of each PC stable update, and the marketing name of the versions
that have one — which lives in `src/generate/content.js`. Add the thread URL
there when a new build ships; builds without one still appear, they just don't
link to release notes.

The parser is a real lexer + recursive-descent declaration parser for Enforce
Script (not regex scraping). It understands classes (both `extends` and `:`
inheritance), generic templates, the full method modifier set (`proto`,
`native`, `owned`, `external`, `volatile`, `event`, `sealed`, ...), enums,
typedefs, global constants/functions, Doxygen-style doc comments, and
preprocessor conditions (`#ifdef DIAG_DEVELOPER` etc.), which are shown as
badges instead of being stripped.

## Local development

Requires Node.js 20+ and git. No npm dependencies.

```sh
npm run fetch      # clone/update upstream, detect versions
npm run parse      # parse all versions into JSON models (cached by commit)
npm run generate   # render the static site into dist/
npm run generate:latest  # render only the newest build (fast inner loop)
npm run build      # all of the above
npm run dev        # preview dist/ at http://localhost:3000
npm test           # parser test suite
```

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
- [DayZ Forums](https://forums.dayz.com/) — announcements and stable update threads
- [Community Wiki](https://community.bistudio.com/wiki/Category:DayZ) — Bohemia Interactive wiki pages for DayZ
- [Feedback Tracker](https://feedback.bistudio.com/tag/dayz/) — report bugs and follow known issues

**Community**

- [YADZ](https://discord.gg/nbrHqZCpA6) — Discord · bugs and suggestions for this site
- [Enfusion Modders](https://discord.gg/enfusion-modders-452035973786632194) — Discord · modding and scripting help
- [DZ Academy](https://discord.gg/Mh5nhD3qth) — Discord · modders and server owners
- [DayZ Editor](https://discord.gg/z65nVkU) — Discord · support for the DayZ Editor mod
- [DayZ BoosterZ Tools](https://dayzboosterz.com/showcase) — web tools for DayZ server owners
- [Mikero's Tools](https://mikero.bytex.digital/) — PBO packing and file conversion tools
- [WOBO Tools](https://wobo.tools/) — item, weapon and loot data explorer

## License

Two different licenses apply, and the distinction matters:

**This generator** — everything tracked in this repository, i.e. `src/`,
`site/`, `test/` and the build configuration — is released under the
[MIT License](LICENSE). Reuse it however you like.

**The generated documentation** — the DayZ script sources it renders, which
live in `data/` and `dist/` and are deliberately not tracked here — is not
mine to license, and MIT does not extend to it. Those terms follow.

Those sources are © 2022 BOHEMIA INTERACTIVE a.s., all rights reserved, and are
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
