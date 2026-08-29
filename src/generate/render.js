// Per-page renderers. Each returns a full HTML document string.
//
// One file per kind of page, under render/, so the file to edit is the one
// named after the page you are looking at:
//
//   /                             render/home.js
//   /topics/  /topics/<Name>/     render/topics.js
//   /classes/ …  /classes/fields/ render/classes.js
//   /classes/<Name>/  …/members/  render/class.js
//   /enum/<Name>/  /globals/…     render/globals.js
//   /files/  /files/<Dir>/<F.c>/  render/files.js
//   /hierarchy/                   render/hierarchy.js
//   /changelog/                   render/changelog.js
//   /community/                   render/community.js
//   /about/                       render/about.js
//   404                           render/notfound.js
//
// The chrome around every body — the head, header, nav and search palette —
// is layout() in html.js, and the pieces more than one page needs are in
// render/shared.js. This file only re-exports, so nothing outside has to know
// which of them a renderer came from; src/generate/routes.js is the map from
// URL to renderer.

export { renderHome } from './render/home.js';
export { renderModulesIndex, renderModule } from './render/topics.js';
export {
  renderAnnotated, renderClassesIndex, renderClassesLetter, renderFields,
} from './render/classes.js';
export { renderClass, renderClassMembers } from './render/class.js';
export { renderEnum, renderGlobals } from './render/globals.js';
export { renderFilesIndex, renderFile } from './render/files.js';
export { renderHierarchy } from './render/hierarchy.js';
export { renderCompare } from './render/changelog.js';
export { renderCommunity } from './render/community.js';
export { renderAbout } from './render/about.js';
export { render404 } from './render/notfound.js';
