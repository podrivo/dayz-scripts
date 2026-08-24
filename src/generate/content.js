// Hand-maintained homepage content: community resources plus the official
// forum thread for each PC stable update. None of it can be derived from the
// script sources, so it lives here and grows as new builds ship.

export const OFFICIAL_LINKS = [
  ['DayZ Forums', 'https://forums.dayz.com/', 'Announcements and stable update threads'],
  ['Community Wiki', 'https://community.bistudio.com/wiki/Category:DayZ', 'Bohemia Interactive wiki pages for DayZ'],
  ['Feedback Tracker', 'https://feedback.bistudio.com/tag/dayz/', 'Report bugs and follow known issues'],
  ['GitHub Repositories', 'https://github.com/orgs/BohemiaInteractive/repositories?q=dayz', 'Official Bohemia Interactive DayZ repos'],
];

export const COMMUNITY_LINKS = [
  ['Enfusion Modders', 'https://discord.gg/enfusion-modders-452035973786632194', 'Discord · modding and scripting help'],
  ['DZ Academy', 'https://discord.gg/Mh5nhD3qth', 'Discord · modders and server owners'],
  ['DayZ Editor', 'https://discord.gg/z65nVkU', 'Discord · support for the DayZ Editor mod'],
  ['DayZ BoosterZ Tools', 'https://dayzboosterz.com/showcase', 'Web tools for DayZ server owners'],
  ["Mikero's Tools", 'https://mikero.bytex.digital/', 'PBO packing and file conversion tools'],
  ['WOBO Tools', 'https://wobo.tools/', 'Item, weapon and loot data explorer'],
];

export const YADZ_DISCORD = 'https://discord.gg/nbrHqZCpA6';

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
