# DayZ Scripts Docs

Custom documentation site for the DayZ Enforce Script API, generated from the
official [DayZ Script Diff](https://github.com/BohemiaInteractive/DayZ-Script-Diff)
sources. Live at [dayz-scripts.yadz.app](https://dayz-scripts.yadz.app).

This replaces the previous Doxygen-based site (preserved on the
[`doxygen-archive`](../../tree/doxygen-archive) branch) with a fully custom,
mobile-friendly static site: friendly URLs, fast client-side search,
inheritance trees, syntax-highlighted sources, and per-build changelogs with
a build selector (every published build, e.g. 1.29.163709, 1.29.163451, ...).

## How it works

```
src/fetch.js      clones DayZ-Script-Diff, maps commits to builds    -> data/versions.json
src/parse-all.js  parses every build's .c files (Enforce Script)     -> data/model-<build>.json
src/generate/     renders static HTML from the models                -> dist/
```

The homepage also carries hand-maintained content — community links and the
official forum thread of each PC stable update — which lives in
`src/generate/content.js`. Add the thread URL there when a new build ships;
builds without one still appear, they just don't link to release notes.

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

- [DayZ Script Diff](https://github.com/BohemiaInteractive/DayZ-Script-Diff)
- [DayZ Modding Samples](https://github.com/BohemiaInteractive/DayZ-Samples)
- [DayZ Central Economy](https://github.com/BohemiaInteractive/DayZ-Central-Economy)
- [DayZ Additional Resources](https://github.com/BohemiaInteractive/DayZ-Misc)

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
