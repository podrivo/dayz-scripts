// The Atom feed at /feed.xml: one entry per documented PC stable build.
//
// The changelog answers "what changed" once someone comes to ask; this is for
// finding out without coming to ask. A feed reader — or the Discord bots that
// watch feeds — learns a build's scripts are up the day the site does.
//
// Latest-only, like api.json: there is one feed for the site, not one per
// build. Every byte is derived from the build list and the hand-maintained
// release threads — no generation timestamp — so rendering it twice gives the
// same feed, which is what `generate:verify` expects of every page.

import { esc } from './html.js';
import { SITE_URL, FORUM_THREADS, VERSION_TITLES } from './content.js';
import { updateNames, fmtDate } from './render/shared.js';

/** A date-only stamp as the full form Atom requires of one. */
const day = (iso) => `${iso}T00:00:00Z`;

/**
 * `versions` is the build list from data/versions.json, newest first — the
 * same array every renderer gets. Entry ids are the archive URLs, which never
 * move: /v/<build>/ redirects to the root while that build is the latest and
 * serves the archive once it is not.
 */
export function renderFeed(versions) {
  const names = updateNames(versions);

  const entries = versions.map((v, i) => {
    const prev = versions[i + 1];
    const url = `${SITE_URL}/v/${v.label}/`;
    const changelog = prev
      ? `${SITE_URL}/changelog/?from=${prev.build}&to=${v.build}`
      : `${SITE_URL}/changelog/`;
    const thread = FORUM_THREADS[v.build]?.url;
    const titled = VERSION_TITLES[v.version] ? ` — ${VERSION_TITLES[v.version]}` : '';

    const content =
      `<p>The scripts of DayZ ${names.get(v.build)}${titled} (build ${v.build}), ` +
      `released ${fmtDate(v.date)}, are documented.</p><ul>` +
      `<li><a href="${changelog}">What changed in the script API</a></li>` +
      `<li><a href="${url}">Browse this build's documentation</a></li>` +
      (thread ? `<li><a href="${thread}">Official release notes</a></li>` : '') +
      `</ul>`;

    return `<entry>
<title>DayZ ${esc(names.get(v.build))} (${esc(v.build)})</title>
<id>${esc(url)}</id>
<link href="${esc(url)}"/>
<updated>${day(v.date)}</updated>
<content type="html">${esc(content)}</content>
</entry>`;
  });

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>DIFF — DayZ PC stable builds</title>
<subtitle>New DayZ script API builds documented on ${SITE_URL.replace(/^https?:\/\//, '')}</subtitle>
<id>${SITE_URL}/feed.xml</id>
<link rel="self" href="${SITE_URL}/feed.xml"/>
<link href="${SITE_URL}/"/>
<updated>${day(versions[0].date)}</updated>
<author><name>YADZ</name></author>
${entries.join('\n')}
</feed>
`;
}
