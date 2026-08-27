/* Loads an archived build page. Pretty /v/<build>/… URLs are a Netlify rewrite
   to /archive.html; identical pages are fetched from the latest build, and
   pages that differ are filled from /_b/<sha> into the layout template. */
(() => {
  'use strict';
  const MARK = { title: '§T§', desc: '§D§', base: '§B§', vpath: '§P§', inner: '§C§' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const m = location.pathname.match(/^\/v\/([^/]+)\/(.*)$/);
  if (!m) return;
  const build = m[1];
  let rel = m[2];
  if (rel && !rel.endsWith('/') && !rel.includes('.')) rel += '/';

  const fill = (tpl, meta, inner) =>
    tpl
      .replaceAll(`${MARK.title} · DIFF`, esc(meta.title))
      .replaceAll(MARK.desc, esc(meta.description))
      .replaceAll(MARK.vpath, esc(meta.vpath))
      .replaceAll(MARK.base, meta.base)
      .replaceAll(MARK.inner, inner);

  const write = (html) => {
    document.open();
    document.write(html);
    document.close();
  };

  const maps = {};
  const loadMap = async (b) => {
    if (!maps[b]) {
      try {
        const cached = sessionStorage.getItem(`pages:${b}`);
        if (cached) maps[b] = JSON.parse(cached);
      } catch {}
    }
    if (!maps[b]) {
      const res = await fetch(`/v/${b}/pages.json`);
      maps[b] = res.ok ? await res.json() : {};
      try { sessionStorage.setItem(`pages:${b}`, JSON.stringify(maps[b])); } catch {}
    }
    return maps[b];
  };

  (async () => {
    const map = await loadMap(build);
    const sha = map[rel];
    if (!sha) {
      const res = await fetch(`/${rel}`);
      if (!res.ok) {
        write(await fetch('/404.html').then((r) => r.text()));
        return;
      }
      write(await res.text());
      return;
    }
    const [packed, tpl] = await Promise.all([
      fetch(`/_b/${sha}`).then((r) => r.text()),
      fetch('/archive.tpl').then((r) => r.text()),
    ]);
    const i = packed.indexOf('\n');
    const meta = JSON.parse(packed.slice(0, i));
    write(fill(tpl, meta, packed.slice(i + 1)));
  })().catch(() => {
    document.body.innerHTML = '<p class="muted" style="padding:2rem">This page could not be loaded.</p>';
  });
})();
