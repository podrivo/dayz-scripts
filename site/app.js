/* The client. Every feature lives in its own module under site/app/; this
   file is the list of them, in the order they run.

   Each init below is guarded by whether the thing it works on is on the page,
   so on any one page most of them do nothing: the source view only runs on
   /files/…/, the notes only on a class or enum, the minimap only where there
   is code to map. That is why one script serves all ~660,000 pages.

   Loaded as a module (see layout() in src/generate/html.js), so it is
   deferred and the page is fully parsed before any of this runs. */

import { initTheme, initBrand } from './app/theme.js';
import { initNav, initNavTopics } from './app/nav.js';
import { initBuilds, initVersionPicker } from './app/builds.js';
import { recordVisit } from './app/recent.js';
import { initSearch } from './app/search.js';
import { initShortcuts } from './app/shortcuts.js';
import { initChangelog } from './app/changelog.js';
import { initSourceView } from './app/source.js';
import { initShare } from './app/share.js';
import { initInlineCode } from './app/highlight.js';
import { initHistory } from './app/history.js';
import { initNotes } from './app/notes.js';
import { initCopyBlocks, initCopySignatures } from './app/copy.js';
import { initPageBar } from './app/pagebar.js';
import { initTreeTools, initFilter } from './app/filter.js';
import { initAllMembers, initFieldsIndex } from './app/members.js';
import { initToc } from './app/toc.js';
import { initMinimap } from './app/minimap.js';

// the chrome: header, navigation, and which build this page is
initTheme();
initBrand();
initNav();
initNavTopics();
initBuilds();
initVersionPicker();

// finding things
recordVisit();
initSearch();
initShortcuts();

// the source view, and the one page that fetches its own behaviour
initChangelog();
initSourceView();
initShare();
initInlineCode();

// what gets added to a declaration once the page is up
initHistory();
initNotes();
initCopyBlocks();
initCopySignatures();

// moving around a long page. The bar holds the controls; the filter goes
// before the two pages below, which build their rows from search.json and
// hand them back to it when they land.
initPageBar();
initTreeTools();
initFilter();
initAllMembers();
initFieldsIndex();
initToc();
initMinimap();
