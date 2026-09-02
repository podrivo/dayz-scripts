/* The client. Every feature lives in its own module under site/app/; this
   file is the list of them, in the order they run.

   Each init below is guarded by whether the thing it works on is on the page,
   so on any one page most of them do nothing: the source view only runs on
   /files/…/, the notes only on a class or enum, the minimap only where there
   is code to map. That is why one script serves all ~660,000 pages.

   Loaded as a module (see layout() in src/generate/html.js), so it is
   deferred and the page is fully parsed before any of this runs. */

import { initTheme } from './app/theme.js';
import { initNav } from './app/nav.js';
import { initBuilds, initVersionPicker } from './app/builds.js';
import { recordVisit } from './app/recent.js';
import { initSearch } from './app/search.js';
import { initShortcuts } from './app/shortcuts.js';
import { initChangelog } from './app/changelog.js';
import { initWorkshop } from './app/workshop.js';
import { initSourceView } from './app/source.js';
import { initShare } from './app/share.js';
import { initInlineCode } from './app/highlight.js';
import { initHistory } from './app/history.js';
import { initNotes } from './app/notes.js';
import { initGlossary } from './app/glossary.js';
import { initTooltip } from './app/tooltip.js';
import { initCopyBlocks, initCopySignatures } from './app/copy.js';
import { initLlmCopy } from './app/llm.js';
import { initPageBar } from './app/pagebar.js';
import { initFileTree } from './app/filetree.js';
import { initAllMembers, initFieldsIndex } from './app/members.js';
import { initCredits } from './app/credits.js';
import { initToc } from './app/toc.js';
import { initMinimap } from './app/minimap.js';
import { initSwap } from './app/swap.js';

// the chrome: header, navigation, and which build this page is
initTheme();
initNav();
initBuilds();
initVersionPicker();

// finding things
recordVisit();
initSearch();
initShortcuts();

// the source view, and the one page that fetches its own behaviour
initChangelog();
initWorkshop();
initSourceView();
initShare();
initInlineCode();

// what gets added to a declaration once the page is up
initHistory();
initNotes();
// before the tooltip: the glossary lays data-tip on a keyword during the
// same pointerover the tooltip then reads it on
initGlossary();
initTooltip();
initCopyBlocks();
initCopySignatures();
initLlmCopy();

// moving around a long page
initPageBar();
initFileTree();
initAllMembers();
initFieldsIndex();
initCredits();
initToc();
initMinimap();

// last: from here on, moving between source files replaces the listing above
// rather than the document, and runs the relevant few of these again
initSwap();
