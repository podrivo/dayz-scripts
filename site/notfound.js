// Sends a mis-cased URL to the page it was reaching for.
//
// Every URL here is spelled the way the sources spell the thing it names:
// /classes/PlayerBase/, /topics/DeveloperRPC/, /files/1_Core/WorkbenchApi.c/.
// None of those is guessable from a lowercased copy of itself, and the whole
// lowercase form is what this site served for files until recently, so it has
// to keep resolving. No slug collides with another once lowercased, so the
// wrong casing still names exactly one page.
//
// This lives on the 404 page because that is the only place it is needed.
// Netlify serves 404.html for every path it holds no file for, and Netlify's
// own redirects are case-sensitive with no way to fold case over a wildcard;
// enumerating a rule per page would be ~9,400 of them, walked in order, ahead
// of the /v/:build/* archive rewrite. Matching here costs the pages that do
// exist nothing.
//
// A redirect only ever moves to a path that differs from this one, and the
// target is what this script would compute again on arrival, so a genuine
// miss cannot loop.

const NAMES = {
  topics: (index) => index.topics.map(([name]) => name),
  classes: (index) => index.classes,
  enum: (index) => index.enums,
  files: (index) => index.files,
};

const match = /^\/(?:v\/([^/]+)\/)?(topics|classes|enum|files)\/(.+)\/$/i.exec(location.pathname);

const track404 = (recovered) => {
  try { globalThis.gtag?.('event', 'not_found', { recovered }); } catch { /* blocked or absent */ }
};

if (!match) track404(false);

if (match) {
  const [, build, rawKind, rawSlug] = match;
  const kind = rawKind.toLowerCase();
  const root = build ? `/v/${build}/` : '/';
  const slug = decodeURIComponent(rawSlug);
  const wanted = slug.toLowerCase();

  // The spelling has to come from the build itself, which the search index
  // already lists for all four kinds -- and which the search palette usually
  // has in cache by the time anyone lands here.
  fetch(`${root}search.json`)
    .then((r) => r.json())
    .then((index) => NAMES[kind](index).find((name) => name.toLowerCase() === wanted))
    .then((name) => {
      if (!name) { track404(false); return; }
      // Compared decoded, because `name` is: an encoded path would look
      // different from an identical decoded one and bounce forever.
      const target = `${root}${kind}/${name}/`;
      if (target === decodeURIComponent(location.pathname)) { track404(false); return; }
      track404(true);
      location.replace(target + location.search + location.hash);
    })
    .catch(() => { track404(false); });
}
