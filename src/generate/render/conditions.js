import { conditionSlug, esc, layout } from '../html.js';

const anchor = (name) => name.replace(/[^\w]/g, '_');
const params = (item) => (item.params || []).map((p) => p.type).join(', ');

export function collectConditions(site) {
  const conditions = new Map();
  const add = (cond, kind, label, href) => {
    for (const value of cond || []) {
      const neg = value.startsWith('!');
      const name = neg ? value.slice(1) : value;
      let group = conditions.get(name);
      if (!group) {
        group = { name, defined: [], notDefined: [] };
        conditions.set(name, group);
      }
      group[neg ? 'notDefined' : 'defined'].push({ kind, label, href });
    }
  };

  for (const cls of site.classes.values()) {
    add(cls.cond, 'Class', cls.name, `classes/${cls.name}/`);
    for (const base of cls.bases) {
      add(base.cond, 'Base class', `${cls.name} extends ${base.base}`, `classes/${cls.name}/`);
    }
    for (const method of cls.methods) {
      add(method.cond, 'Method', `${cls.name}.${method.name}(${params(method)})`, `classes/${cls.name}/#${anchor(method.name)}`);
    }
    for (const member of cls.members) {
      add(member.cond, 'Field', `${cls.name}.${member.name}`, `classes/${cls.name}/#${anchor(member.name)}`);
    }
  }
  for (const en of site.enums.values()) {
    add(en.cond, 'Enum', en.name, `enum/${en.name}/`);
    for (const value of en.values) {
      add(value.cond, 'Enum value', `${en.name}.${value.name}`, `enum/${en.name}/#${value.name}`);
    }
  }
  for (const item of site.typedefs) add(item.cond, 'Typedef', item.name, `globals/typedefs/#${item.name}`);
  for (const item of site.globals) add(item.cond, 'Constant', item.name, `globals/constants/#${item.name}`);
  for (const item of site.functions) {
    add(item.cond, 'Function', `${item.name}(${params(item)})`, `globals/functions/#${anchor(item.name)}`);
  }
  for (const item of site.defines) add(item.cond, 'Macro', item.name, `globals/macros/#${item.name}`);

  for (const group of conditions.values()) {
    const byLabel = (a, b) => a.label.localeCompare(b.label) || a.kind.localeCompare(b.kind);
    group.defined.sort(byLabel);
    group.notDefined.sort(byLabel);
  }
  return new Map([...conditions].sort(([a], [b]) => a.localeCompare(b)));
}

export function renderConditionsIndex(ctx, conditions) {
  const { base } = ctx;
  const names = [...conditions.values()]
    .map((group) => {
      const count = group.defined.length + group.notDefined.length;
      return `<tr><td><a class="badge badge-cond" href="${base}conditions/${conditionSlug(group.name)}/">${esc(group.name)}</a></td><td>${count.toLocaleString('en-US')} declaration${count === 1 ? '' : 's'}</td></tr>`;
    })
    .join('\n');
  return layout({
    ...ctx,
    title: 'Build conditions',
    description: 'Preprocessor conditions used by the DayZ Enforce Script API.',
    breadcrumbs: [{ label: 'Build conditions' }],
    content: `<h1>Build conditions <span class="count">${conditions.size}</span></h1>
<p>Declarations included only in particular builds or configurations.</p>
<table class="list"><tbody>${names}</tbody></table>`,
  });
}

export function renderCondition(ctx, group) {
  const { base } = ctx;
  const section = (id, title, entries) => {
    if (!entries.length) return '';
    const rows = entries
      .map((entry) => `<tr><td>${esc(entry.kind)}</td><td><a href="${base}${entry.href}"><code>${esc(entry.label)}</code></a></td></tr>`)
      .join('\n');
    return `<h2 class="condition-heading" id="${id}">${title} <span class="count">${entries.length}</span></h2>
<table class="list"><thead><tr><th>Kind</th><th>Declaration</th></tr></thead><tbody>${rows}</tbody></table>`;
  };
  const total = group.defined.length + group.notDefined.length;
  const badge = `<span class="badge badge-cond">${esc(group.name)}</span>`;
  const content = `<h1>${esc(group.name)} <span class="count">${total}</span></h1>
<p>Declarations controlled by this preprocessor condition.</p>
${section('defined', `When ${badge} is defined`, group.defined)}
${section('not-defined', `When ${badge} is not defined`, group.notDefined)}`;
  return layout({
    ...ctx,
    title: group.name,
    description: `DayZ Enforce Script declarations controlled by ${group.name}.`,
    breadcrumbs: [
      { label: 'Build conditions', href: `${base}conditions/` },
      { label: group.name },
    ],
    content,
  });
}
