// The changelog at /changelog/.

import { parseDoc } from '../../parser/docparse.js';
import { esc, layout } from '../html.js';
import { renderReleases } from './shared.js';
import { pageBar } from './pagebar.js';

const changelogTabs = (base, active) => [
  [`${base}changelog/`, 'Changes', active === 'changelog'],
  [`${base}deprecated/`, 'Deprecated', active === 'deprecated'],
];

/**
 * An empty shell, filled in by site/compare.js.
 *
 * What changed between two builds a modder actually cares about, which is
 * usually the one they built against and the one their users are running.
 *
 * There are 49 builds, so 1,176 pairs, and generating a page per pair would
 * mean holding two 8 MB models in memory 1,176 times over. It also would not
 * survive the obvious next ask, three builds at once, which is 18,424 triples.
 * So the pair is chosen in the browser instead, which is also what makes the
 * URL shareable: /changelog/?from=…&to=… names a comparison, not a build.
 *
 * The pickers name no build, for the same reason nothing else does: they
 * are filled from /assets/versions.json client-side. The official notes
 * name every known one, identically, so these bytes stay the same in all
 * 49 builds and keep their hard link. See layout() in src/generate/html.js.
 */
export function renderCompare(ctx) {
  const card = (side, label) => /* html */ `<label class="cmp-pick" data-side="${side}">
  <span>${label}</span><span class="cmp-sel"><select id="cmp${label}" aria-label="Compare ${side} build"></select></span>
</label>`;
  const content = /* html */ `
<h1>Changelog</h1>
<form class="cmp-stage" id="cmpBar" hidden>
  ${card('from', 'From')}
  <div class="cmp-mid">
    <button type="button" class="btn cmp-swap" id="cmpReset" disabled aria-hidden="true"><i class="ic ic-swap"></i></button>
    <span class="cmp-span" id="cmpSpan"></span>
  </div>
  ${card('to', 'To')}
</form>
<noscript><p>The changelog is built in the browser and needs JavaScript.</p></noscript>
<div class="cmp" id="compare" aria-live="polite" aria-busy="true"><p class="muted">Loading builds…</p></div>
<h2 id="release-notes">Release notes</h2>
<p class="muted">New builds land here as they ship — follow along with the <a href="/feed.xml">Atom feed</a>.</p>
<div class="releases">
${renderReleases(ctx, { highlight: false, absolute: true })}
</div>`;
  return layout({
    ...ctx,
    title: 'Changelog',
    active: 'changelog/',
    bar: pageBar({ tabs: changelogTabs(ctx.base, 'changelog') }),
    description: 'What changed in the DayZ Enforce Script API between two game builds.',
    breadcrumbs: [{ label: 'Changelog' }],
    content,
  });
}

function deprecationOf(item) {
  const doc = parseDoc(item.doc);
  let message;
  if (doc && Object.hasOwn(doc, 'deprecated')) {
    message = doc.deprecated;
  } else {
    const attr = item.attrs?.find((a) => /^\[\s*(?:Obsolete|Deprecated)\b/i.test(a));
    if (!attr) return null;
    message = attr.match(/\(\s*"((?:\\.|[^"])*)"/)?.[1];
    message = message ? message.replace(/\\"/g, '"').replace(/\\\\/g, '\\') : '';
  }

  let text = message.trim();
  const version = text.match(/^(\d+\.\d+):\s*(.*)$/);
  const prefix = version ? `${version[1]}: ` : '';
  if (version) text = version[2];
  if (/^no replacement\.?$/i.test(text)) return '';

  let match;
  if ((match = text.match(/^handled by ['"]?(.+?)['"]? now\.?$/i))) {
    text = `Use ${match[1]} instead`;
  } else if ((match = text.match(/^(.+?) is used now instead\.?$/i))) {
    text = `Use ${match[1]} instead`;
  } else if ((match = text.match(/^replaced by (?:the )?(.+?)\.?$/i))) {
    text = `Use ${match[1]} instead`;
  } else if ((match = text.match(/^use the (.+?) instead\.?$/i))) {
    text = `Use ${match[1]} instead`;
  } else if ((match = text.match(/^deprecated use,\s*\w+ uses (.+?) now!?\s*$/i))) {
    text = `Use ${match[1]} instead`;
  } else if ((match = text.match(/^(\w+) handles all .+$/i))) {
    text = `Use ${match[1]} instead`;
  } else if (/^not used but kept in the case of modders needing\/using it\.?$/i.test(text)) {
    text = 'Not used, but kept in case modders need it';
  } else {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }
  return prefix + text;
}

export function renderDeprecated(ctx) {
  const { site, base } = ctx;
  const entries = [];
  const add = (kind, label, href, item, owner) => {
    const guidance = deprecationOf(item);
    if (guidance === null) return;
    entries.push({ kind, label, href, guidance, owner });
  };
  const anchor = (name) => name.replace(/[^\w]/g, '_');
  const memberOwner = (type, member) => {
    const chain = [type, ...site.ancestorsOf(type)];
    return chain.find((name) => {
      const cls = site.classes.get(name);
      return cls && [...cls.methods, ...cls.members].some((item) => item.name === member);
    });
  };
  const guidanceHtml = (entry) => esc(entry.guidance).replace(
    /\b([A-Za-z_]\w*)(?:(::|\.)([A-Za-z_]\w*))?\b/g,
    (match, type, separator, member) => {
      if (member) {
        const owner = memberOwner(type, member);
        if (owner) {
          return `<a href="${base}classes/${owner}/#${anchor(member)}"><code>${esc(match)}</code></a>`;
        }
        if (site.classes.has(type)) {
          return `<a href="${base}classes/${type}/"><code>${esc(type)}</code></a>${esc(separator + member)}`;
        }
      } else if (site.classes.has(type)) {
        return `<a href="${base}classes/${type}/"><code>${esc(match)}</code></a>`;
      } else if (entry.owner) {
        const owner = memberOwner(entry.owner, type);
        if (owner) {
          return `<a href="${base}classes/${owner}/#${anchor(type)}"><code>${esc(match)}</code></a>`;
        }
      }
      return esc(match);
    }
  );

  for (const cls of site.classes.values()) {
    const href = `${base}classes/${cls.name}/`;
    add('Class', cls.name, href, cls);
    for (const method of cls.methods) {
      add('Method', `${cls.name}.${method.name}()`, `${href}#${anchor(method.name)}`, method, cls.name);
    }
    for (const member of cls.members) {
      add('Field', `${cls.name}.${member.name}`, `${href}#${anchor(member.name)}`, member, cls.name);
    }
  }
  for (const en of site.enums.values()) {
    const href = `${base}enum/${en.name}/`;
    add('Enum', en.name, href, en);
    for (const value of en.values) add('Enum value', `${en.name}.${value.name}`, `${href}#${anchor(value.name)}`, value);
  }
  for (const fn of site.functions) add('Function', `${fn.name}()`, `${base}globals/functions/#${anchor(fn.name)}`, fn);
  for (const value of site.globals) add('Constant', value.name, `${base}globals/constants/#${anchor(value.name)}`, value);
  for (const type of site.typedefs) add('Typedef', type.name, `${base}globals/typedefs/#${anchor(type.name)}`, type);
  for (const macro of site.defines) add('Macro', macro.name, `${base}globals/macros/#${anchor(macro.name)}`, macro);

  entries.sort((a, b) => a.label.localeCompare(b.label));
  const rows = entries.map((entry) => /* html */ `<tr>
<td><a href="${entry.href}"><code>${esc(entry.label)}</code></a></td>
<td>${entry.kind}</td>
<td>${entry.guidance ? guidanceHtml(entry) : ''}</td>
</tr>`).join('\n');
  const list = rows
    ? `<table class="list deprecated-list"><thead><tr><th>Declaration</th><th>Kind</th><th>Replacement or guidance</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="muted">No deprecated declarations were found in this build.</p>';
  const content = /* html */ `
<h1>Deprecated <span class="count">${entries.length.toLocaleString('en-US')}</span></h1>
<p>Declarations marked <code>Obsolete</code> or <code>@deprecated</code>, with the replacement or migration guidance supplied by the source when available.</p>
${list}`;

  return layout({
    ...ctx,
    title: 'Deprecated',
    active: 'changelog/',
    bar: pageBar({ tabs: changelogTabs(base, 'deprecated') }),
    description: 'Deprecated DayZ Enforce Script declarations and their recommended replacements.',
    breadcrumbs: [{ label: 'Deprecated' }],
    content,
  });
}
