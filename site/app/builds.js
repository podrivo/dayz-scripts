/* Which DayZ build this page is, and the switcher for moving between them.

   Pages are byte-identical across builds so dist/ can hard-link them, which
   means the build number, date and version are deliberately absent from the
   HTML. Everything here recovers them from the URL and /assets/versions.json
   and stamps them back into the chrome. */

import { $, ROOT, VPATH, fmtDate, pathBuild } from './dom.js';

let pagesMapPromise;

/** Which archived pages differ from the latest build's copy. Empty at the
    site root, where every page is the latest copy by definition. */
export const loadPagesMap = () => {
  if (!pathBuild) return Promise.resolve({});
  return (pagesMapPromise ||= fetch(`/v/${pathBuild}/pages.json`).then((r) => r.json()).catch(() => ({})));
};

let buildsPromise;
const loadBuilds = () => (buildsPromise ||= fetch(ROOT + 'assets/versions.json').then((r) => r.json()));

const patchOf = (build) => build.split('.').pop();

/** "1.29 Update 1" from the oldest of that version, then Update 2, … */
function nameBuilds(builds) {
  const count = Object.create(null);
  const seen = Object.create(null);
  for (const b of builds) count[b.version] = (count[b.version] || 0) + 1;
  for (const b of builds) {
    const n = (seen[b.version] = (seen[b.version] || 0) + 1);
    b.name = `${b.version} Update ${count[b.version] - n + 1}`;
  }
  return builds;
}

/* The build being viewed. A live binding rather than a getter, so the modules
   that read it after awaiting identity() see what it was set to. */
export let current = null;

let identityPromise = null;

/**
 * The build list, named, with `current` set and the chrome stamped. Every
 * feature that needs to know which build this is awaits this one promise, so
 * versions.json is fetched once however many of them are on the page.
 */
export function identity() {
  return (identityPromise ||= loadBuilds().then((builds) => {
    if (Array.isArray(builds)) nameBuilds(builds);
    current = (pathBuild && builds.find((b) => b.build === pathBuild)) || builds[0];
    const label = $('.ver-label');
    if (label) label.textContent = current.name;
    const gh = $('#ghSrc');
    if (gh && current.sha) gh.href = gh.href.replace('/blob/main/', `/blob/${current.sha}/`);
    return builds;
  }));
}

export const initBuilds = () => { identity(); };

/** A button opening a popover of all builds grouped by game version. */
export function initVersionPicker() {
  const verBtn = $('#verBtn');
  const verMenu = $('#verMenu');
  if (!verBtn) return;

  let loaded = false;
  async function fillMenu() {
    if (loaded) return;
    loaded = true;
    const builds = await identity();
    let html = '';
    let version = '';
    builds.forEach((b, i) => {
      if (b.version !== version) {
        version = b.version;
        html += `<div class="ver-group">DayZ ${version}</div>`;
      }
      const cur = b.build === current?.build;
      const href = ROOT + (i === 0 ? '' : `v/${b.build}/`) + VPATH;
      html += `<a href="${href}"${cur ? ' class="cur" aria-current="page"' : ''} title="${b.build}">` +
        `<span class="ver-row"><span class="ver-name">${b.name}</span>` +
        `<span class="ver-build">${patchOf(b.build)}</span>` +
        (i === 0 ? '<span class="ver-latest">latest</span>' : '') +
        `<span class="ver-date">${fmtDate(b.date)}</span></span>` +
        '</a>';
    });
    verMenu.innerHTML = html;
  }

  function closeVerMenu() {
    verMenu.hidden = true;
    verBtn.setAttribute('aria-expanded', 'false');
  }

  verBtn.addEventListener('click', async () => {
    if (!verMenu.hidden) return closeVerMenu();
    await fillMenu();
    verMenu.hidden = false;
    verBtn.setAttribute('aria-expanded', 'true');
    const cur = verMenu.querySelector('.cur');
    if (cur) verMenu.scrollTop = cur.offsetTop - verMenu.clientHeight / 2;
  });
  verMenu.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && location.hash) a.href += location.hash; // keep deep links across builds
  });
  verBtn.parentElement.addEventListener('keydown', (e) => {
    if (verMenu.hidden) return;
    if (e.key === 'Escape') {
      closeVerMenu();
      verBtn.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const links = [...verMenu.querySelectorAll('a')];
      const i = links.indexOf(document.activeElement);
      const next = i === -1 ? 0 : (i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links[next]?.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!verMenu.hidden && !e.target.closest('.verpicker')) closeVerMenu();
  });
}
