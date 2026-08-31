// Hand-maintained content for /community/ and /about/: links off the site,
// plus the official forum thread for each PC stable update. None of it can
// be derived from the script sources, so it lives here and grows as new
// builds ship. Maps and known Workshop mods live in site/workshop.json.

import path from 'node:path';
import { ROOT, readJson } from '../util.js';

const catalog = readJson(path.join(ROOT, 'site', 'workshop.json'));
const workshopHref = (id) => `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;
const alpha = (links) => links.toSorted((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }));
const fmtCount = (n) => Number(n).toLocaleString('en-US');
const mapLink = (m) => {
  if (!m.id) return [m.name, m.url, m.note];
  return [m.name, workshopHref(m.id), m.subscriptions ? `${fmtCount(m.subscriptions)} subscribers` : 'Steam Workshop'];
};

/** Where the site is served from, for the absolute URLs that have to name it:
 *  the sitemap, robots.txt, and the canonical and OpenGraph tags on a page. */
export const SITE_URL = 'https://diff.yadz.app';

/** This site's own source, which is where a community note is contributed. The
 *  repository root rather than a path into it, so the link cannot rot as files
 *  and branches move. */
export const REPO_URL = 'https://github.com/yadzapp/diff';

/** The same Google Analytics property the Doxygen site reported to, so the
 *  two sets of numbers stay one series across the move. */
export const ANALYTICS_ID = 'G-R8ZT2QC248';

/** PostHog project token. Public, like ANALYTICS_ID: it ships in the page. */
export const POSTHOG_KEY = 'phc_nQv26gW5YJWEVvLcAWFLsBdgoGRFFUZfCrt948xfRdDP';

export const OFFICIAL_LINKS = [
  ['DayZ.com', 'https://dayz.com/', 'Official game website and news'],
  ...alpha([
    ['Community Wiki', 'https://community.bistudio.com/wiki/Category:DayZ', 'Bohemia Interactive wiki pages for DayZ'],
    ['DayZ Forums', 'https://forums.dayz.com/', 'Announcements and stable update threads'],
    ['DayZ Tools', 'https://store.steampowered.com/app/830640/DayZ_Tools/', 'Official modding tools on Steam'],
    ['Enforce Script Syntax', 'https://community.bistudio.com/wiki/DayZ:Enforce_Script_Syntax', 'The language itself: types, operators and keywords'],
    ['Feedback Tracker', 'https://feedback.bistudio.com/tag/dayz/', 'Report bugs and follow known issues'],
    ['GitHub Repositories', 'https://github.com/orgs/BohemiaInteractive/repositories?q=dayz', 'Official Bohemia Interactive DayZ repos'],
  ]),
];

/** Bohemia's own modding material. */
export const OFFICIAL_MODDING_LINKS = alpha([
  ['Central Economy', 'https://github.com/BohemiaInteractive/DayZ-Central-Economy', 'The vanilla loot economy files, as the game ships them'],
  ['Modding Basics', 'https://community.bistudio.com/wiki/DayZ:Modding_Basics', 'Official walkthrough: project drive, config.cpp, packing, first script'],
  ['Modding Samples', 'https://github.com/BohemiaInteractive/DayZ-Samples', 'Sample mods to start a project from'],
]);

export const OFFICIAL_MAPS = alpha(catalog.maps.filter((m) => !m.id).map(mapLink));
export const WORKSHOP_MAPS = alpha(catalog.maps.filter((m) => m.id).map(mapLink));

/** The servers to ask in. */
export const DISCORD_LINKS = [
  ['DayZ Modders', 'https://discord.gg/dayz-modders-452035973786632194', 'Discord · modding and scripting help'],
  ...alpha([
    ['DayZ Academy', 'https://discord.gg/BMnpGEzKdx', 'Discord · modders and server owners'],
    ['DayZ Editor', 'https://discord.gg/dayz-editor-738181536029081662', 'Discord · support for the DayZ Editor mod'],
  ]),
];

/**
 * What the community has built around the scripts, grouped the way /community/
 * lists it. None of it is official, endorsed, or vetted here beyond being
 * something a scripter actually reaches for.
 */
export const COMMUNITY_SECTIONS = [
  {
    id: 'reference',
    title: 'Reference & guides',
    links: alpha([
      ['Custom lockable items', 'https://github.com/salutesh/DayZ-Expansion-Scripts/wiki/%5BModding%5D-Creating-a-custom-openable-closable-and-or-lockable-item', 'Expansion wiki: openable, closable and lockable items',
        [['Example', 'https://github.com/TrueDolphin/CodeLock-Example']]],
      ['Custom script modules', 'https://wrdg.net/posts/dayz/custom-script-module-exploitation', 'How ScriptModule.LoadScript works; the retail-client hole was closed in 1.24'],
      ['DayZ Modding Wiki', 'https://github.com/StarDZ-Team/DayZ-Modding-Wiki', 'Open wiki on the language, layouts, engine API and its traps'],
      ['DayZ Wiki', 'https://dayz.wiki.gg/', 'Community-run gameplay and item wiki'],
      ['Enforce Script cheat sheet', 'https://gist.github.com/creativ3lab/49a4055c6b5c87d2c9ccb08ad04d5b86', 'The syntax reference as one scrollable page'],
    ]),
  },
  {
    id: 'tooling',
    title: 'Editors & tooling',
    links: alpha([
      ['Bisign2Bikey', 'https://github.com/wrdg/Bisign2Bikey', 'Pulls a .bikey out of .bisign files for DayZ and Arma'],
      ['Community Offline Mode', 'https://github.com/Arkensor/DayZCommunityOfflineMode', 'Single-player mission for exploring and testing without a server'],
      ['DayZ CE Schema', 'https://marketplace.visualstudio.com/items?itemName=rvost.dayz-ce-schema', 'VS Code validation and completion for Central Economy XML',
        [['GitHub', 'https://github.com/rvost/dayz-ce-schema/']]],
      ['DayZ Editor', 'https://github.com/InclementDab/DayZ-Editor', 'In-game 3D editor for building scenes and exporting them'],
      ['DayZ Imageset Editor', 'https://github.com/Strykar86/DayZ-Imageset-Editor', 'Visual layout editor and atlas packer for .imageset files'],
      ['DayZ Labs', 'https://borcioo.github.io/dayz-labs/', 'Dev launcher for server, client, builds and logs',
        [['GitHub', 'https://github.com/Borcioo/dayz-labs']]],
      ['DayZ Mod Template', 'https://github.com/InclementDab/DayZ-Mod-Template', 'Starter repo with Workbench project, build tools and script folders'],
      ['DayzModTool', 'https://github.com/accuratealx/DayzModTool', 'Windows replacement for DayZ Tools: P: drive, PBO packing and stringtable'],
      ['DayZExtract', 'https://github.com/wrdg/DayZExtract', 'Faster PBO extract than DayZ Tools Extract or DayZ2P'],
      ['DevZ Tools', 'https://marketplace.visualstudio.com/items?itemName=devz-tools.devz-tools', 'VS Code extension around an Enforce Script language server'],
      ['edds2png', 'https://github.com/wrdg/edds2png', 'Converts Enfusion DDS (.edds) images to PNG'],
      ['EnScript for VS Code', 'https://marketplace.visualstudio.com/items?itemName=forestbelton.bohemia-enscript', 'Enforce Script highlighting and language support'],
      ["Mikero's Tools", 'https://mikero.bytex.digital/', 'PBO packing and file conversion tools'],
      ['RaG DayZ Tools', 'https://github.com/Tyson89/RaG-DayZ-Tools', 'PBO builder, inspector and game data extractor'],
    ]),
  },
  {
    id: 'frameworks',
    title: 'Frameworks & libraries',
    links: alpha([
      ['Community Framework', 'https://github.com/Arkensor/DayZ-CommunityFramework', 'The RPC and utility layer most script mods are built on'],
      ['Community Online Tools', 'https://github.com/Jacob-Mango/DayZ-CommunityOnlineTools', 'Modular in-game admin GUI that other mods add menus to'],
      ['Dabs Framework', 'https://github.com/InclementDab/DayZ-Dabs-Framework', 'Open-source MVC framework, events manager and Workbench plugins'],
      ['DayZ Expansion', 'https://dayzexpansion.com/', 'Mod framework wiki, guides and configuration',
        [['GitHub', 'https://github.com/salutesh/DayZ-Expansion-Scripts']]],
      ['DayZ Universal API', 'https://github.com/DaemonForge/DayZ-UniveralApi', 'Cross-server API backend with auth, Discord and database helpers'],
      ['InfinityDayZ', 'https://github.com/EnfusionModders/InfinityDayZ', 'Server C++ plugins that register custom proto methods'],
      ['VPP Admin Tools', 'https://github.com/VanillaPlusPlus/VPP-Admin-Tools', 'In-game administrator tools for managing players and servers'],
    ]),
  },
  {
    id: 'agents',
    title: 'Agents & automation',
    links: alpha([
      ['DayZ MCP', 'https://github.com/willy92wins/dayz-mcp', 'MCP server that lets an agent run and test a mod in game'],
      ['Lake-Dayz-MCP', 'https://github.com/ZeripeDaniel/Lake-Dayz-MCP', 'MCP that pre-flights Enforce mods before you pack a PBO'],
      ['Modding Knowledge Pack', 'https://github.com/willy92wins/DayZ-Modding-Knowledge-Pack/', 'Agent skills and notes on scripts, models and infrastructure'],
    ]),
  },
  {
    id: 'data',
    title: 'Game data & servers',
    links: alpha([
      ['Central Economy Schema', 'https://github.com/rvost/DayZ-Central-Economy-Schema', 'Unofficial XSD schemas that validate types.xml and the rest'],
      ['CFTools Cloud', 'https://cftools.cloud/', 'Server management, player and ban tools'],
      ['DayZ Types Splitter', 'https://github.com/Borcioo/Dayz-Types-Splitter/', 'Split types.xml by category and emit the cfgeconomycore snippet'],
      ['dayz-ctl', 'https://dayz-ctl.woozymasta.ru/', 'Linux CLI launcher: server browser, mods and Proton',
        [['GitHub', 'https://github.com/WoozyMasta/dayz-ctl']]],
      ['DZMap', 'https://dzmap.woozymasta.ru', 'Self-hosted tile server and GeoJSON locations for DayZ maps',
        [['GitHub', 'https://github.com/WoozyMasta/dzmap']]],
      ['iZurvive', 'https://izurvive.com/', 'Interactive maps with loot spawn layers'],
      ['xam.nu', 'https://dayz.xam.nu/', 'Interactive maps for official and Workshop terrains'],
      ['MetricZ', 'https://github.com/WoozyMasta/metricz', 'In-game metrics mod, with a Prometheus exporter for A2S and RCon',
        [['Exporter', 'https://github.com/WoozyMasta/metricz-exporter']]],
      ['RaG Economy Manager', 'https://github.com/Tyson89/RaG-Economy-Manager', 'Inspect and edit mission economy XML without hand-editing'],
      ["Sam's Object Finder", 'https://samsobjectfinder.com/', 'Every placeable object, with types.xml entries and maps',
        [['GitHub', 'https://github.com/samgeekman/samsdayzobjectfinder']]],
      ['WOBO Tools', 'https://wobo.tools/', 'Item, weapon and loot data explorer'],
    ]),
  },
];

export const YADZ_DISCORD = 'https://discord.yadz.app/';

/** How to reach the people who build this site. Only on /about/. */
export const COLLABORATION_LINKS = [
  ['GitHub', REPO_URL, 'Issues, pull requests, and community notes'],
  ['Discord', YADZ_DISCORD, 'Feedback on the site'],
];

/** Marketing name of a game version, when the whole version carries one. */
export const VERSION_TITLES = {
  '1.26': 'Frostline DLC',
};

/**
 * Forum thread for each PC stable update, keyed by game build. Dates are only
 * used for builds we don't track (their scripts never reached the Script Diff
 * repository) — otherwise the build's own release date wins.
 */
export const FORUM_THREADS = {
  '1.29.163709': { url: 'https://forums.dayz.com/topic/266379-stable-update-129/?tab=comments#comment-2504736', date: '2026-08-12' },
  '1.29.163451': { url: 'https://forums.dayz.com/topic/266379-stable-update-129/?tab=comments#comment-2504730', date: '2026-07-15' },
  '1.29.163047': { url: 'https://forums.dayz.com/topic/266379-stable-update-129/?tab=comments#comment-2504722', date: '2026-06-01' },
  '1.29.162510': { url: 'https://forums.dayz.com/topic/266379-stable-update-129/', date: '2026-04-08' },

  '1.28.161464': { url: 'https://forums.dayz.com/topic/266370-stable-update-128/?tab=comments#comment-2504706', date: '2025-12-04' },
  '1.28.160420': { url: 'https://forums.dayz.com/topic/266370-stable-update-128/?tab=comments#comment-2504688', date: '2025-08-04' },
  '1.28.160123': { url: 'https://forums.dayz.com/topic/266370-stable-update-128/?tab=comments#comment-2504677', date: '2025-07-01' },
  '1.28.159992': { url: 'https://forums.dayz.com/topic/266370-stable-update-128/', date: '2025-06-02' },

  '1.27.159674': { url: 'https://forums.dayz.com/topic/265911-stable-update-127/?tab=comments#comment-2504018', date: '2025-04-03' },
  '1.27.159586': { url: 'https://forums.dayz.com/topic/265911-stable-update-127/?tab=comments#comment-2503915', date: '2025-03-18' },
  '1.27.159420': { url: 'https://forums.dayz.com/topic/265911-stable-update-127/', date: '2025-02-25' },

  '1.26.159040': { url: 'https://forums.dayz.com/topic/264080-stable-update-126/?page=4&tab=comments#comment-2501418', date: '2024-11-19' },
  '1.26.158950': { url: 'https://forums.dayz.com/topic/264080-stable-update-126/?page=3&tab=comments#comment-2500969', date: '2024-10-31' },
  '1.26.158898': { url: 'https://forums.dayz.com/topic/264080-stable-update-126/', date: '2024-10-15' },

  '1.25.158593': { url: 'https://forums.dayz.com/topic/259858-stable-update-125/?page=3&tab=comments#comment-2499067', date: '2024-08-19' },
  '1.25.158396': { url: 'https://forums.dayz.com/topic/259858-stable-update-125/?page=2&tab=comments#comment-2498253', date: '2024-07-03' },
  '1.25.158344': { url: 'https://forums.dayz.com/topic/259858-stable-update-125/?page=2&tab=comments#comment-2498026', date: '2024-06-19' },
  '1.25.158199': { url: 'https://forums.dayz.com/topic/259858-stable-update-125/', date: '2024-05-27' },

  '1.24.157828': { url: 'https://forums.dayz.com/topic/259072-stable-update-124/?page=3&tab=comments#comment-2493582', date: '2024-04-11' },
  '1.24.157623': { url: 'https://forums.dayz.com/topic/259072-stable-update-124/?page=3&tab=comments#comment-2493037', date: '2024-03-07' },
  '1.24.157551': { url: 'https://forums.dayz.com/topic/259072-stable-update-124/?page=2&tab=comments#comment-2492939', date: '2024-02-29' },
  '1.24.157448': { url: 'https://forums.dayz.com/topic/259072-stable-update-124/', date: '2024-02-20' },

  '1.23.157045': { url: 'https://forums.dayz.com/topic/257986-stable-update-123/?page=2&tab=comments#comment-2491015', date: '2023-11-30' },
  '1.23.156951': { url: 'https://forums.dayz.com/topic/257986-stable-update-123/', date: '2023-11-07' },

  '1.22.156718': { url: 'https://forums.dayz.com/topic/256662-stable-update-122/?page=3&tab=comments#comment-2489452', date: '2023-09-18' },
  '1.22.156656': { url: 'https://forums.dayz.com/topic/256662-stable-update-122/?page=2&tab=comments#comment-2489075', date: '2023-09-09' },
  '1.22.156593': { url: 'https://forums.dayz.com/topic/256662-stable-update-122/', date: '2023-08-29' },

  '1.21.156300': { url: 'https://forums.dayz.com/topic/254893-stable-update-121/?page=3&tab=comments#comment-2486208', date: '2023-06-20' },
  '1.21.156243': { url: 'https://forums.dayz.com/topic/254893-stable-update-121/?page=2&tab=comments#comment-2485977', date: '2023-06-06' },
  '1.21.156201': { url: 'https://forums.dayz.com/topic/254893-stable-update-121/', date: '2023-05-23' },

  '1.20.155981': { url: 'https://forums.dayz.com/topic/254301-stable-update-120/?page=6&tab=comments#comment-2484819', date: '2023-03-28' },
  '1.20.155881': { url: 'https://forums.dayz.com/topic/254301-stable-update-120/?page=5&tab=comments#comment-2484453', date: '2023-03-08' },
  '1.20.155844': { url: 'https://forums.dayz.com/topic/254301-stable-update-120/?page=4&tab=comments#comment-2484270', date: '2023-03-01' },
  '1.20.155817': { url: 'https://forums.dayz.com/topic/254301-stable-update-120/?page=3&tab=comments#comment-2484121', date: '2023-02-22' },
  '1.20.155766': { url: 'https://forums.dayz.com/topic/254301-stable-update-120/', date: '2023-02-14' },
};
