import path from 'node:path';
import { ROOT, readJson } from './util.js';

// TODO(2027-03-01): Remove this temporary migration bridge once the retired
// Doxygen URLs no longer receive useful traffic. Delete this module, the map,
// map generator and Netlify function; then remove their imports/rules from
// generate/index.js, dev.js, serve.js, package.json and netlify.toml.
const redirects = readJson(path.join(ROOT, 'site', 'doxygen-redirects.json'));

export const doxygenRedirect = (pathname) => redirects[pathname] || null;

export const doxygenStaticRedirects = Object.entries(redirects)
  .filter(([pathname]) => !/^\/d[0-f]\//.test(pathname))
  .map(([from, to]) => `${from} ${to} 301!`);
