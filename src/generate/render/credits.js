// The credits page at /credits/. One page for the game, not a build: the
// latest roll plus anyone who left it, gathered from every documented
// credits.json. Same bytes in every build, so the page keeps its hard link.

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, UPSTREAM_DIR, git, readJson } from '../../util.js';
import { esc, layout, slug } from '../html.js';

const ACRONYMS = new Set(['ceo', 'pr', 'qa']);
const LEGAL_MARK = /copyright|©|\(c\)|portions of this/i;

function creditLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s[0] !== '#') return s;
  return s
    .slice(1)
    .split(/[_\s]+/)
    .map((w) => {
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (w !== w.toLowerCase()) return w;
      if (lower === 'and') return 'and';
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

function isLegalLine(s) {
  return LEGAL_MARK.test(s) || s.length > 90;
}

function isLegalDept(dept) {
  return /legal/i.test(dept.DepartmentName || '');
}

function isLegalSection(sec) {
  return (sec.SectionLines || []).some((l) => isLegalLine(String(l)));
}

function peopleOf(data) {
  const people = new Map();
  for (const dept of data.Departments || []) {
    if (isLegalDept(dept)) continue;
    const deptLabel = creditLabel(dept.DepartmentName);
    for (const sec of dept.Sections || []) {
      if (isLegalSection(sec)) continue;
      const role = creditLabel(sec.SectionName) || deptLabel;
      for (const raw of sec.SectionLines || []) {
        const name = String(raw).trim();
        if (!name || isLegalLine(name) || people.has(name)) continue;
        people.set(name, role);
      }
    }
  }
  return people;
}

/** Latest departments plus names that appear only in older rolls, newest-first. */
export function collectCredits(datas) {
  const latest = datas[0] || { Departments: [] };
  const current = peopleOf(latest);
  const memoir = new Map();
  for (const data of datas.slice(1)) {
    if (!data) continue;
    for (const [name, role] of peopleOf(data)) {
      if (!current.has(name) && !memoir.has(name)) memoir.set(name, role);
    }
  }
  return {
    departments: latest.Departments || [],
    memoir: [...memoir.entries()]
      .map(([name, role]) => ({ name, role }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en')),
  };
}

function creditsAt(sha) {
  try {
    return JSON.parse(git(['-C', UPSTREAM_DIR, 'show', `${sha}:scripts/data/credits.json`]));
  } catch {
    return null;
  }
}

let roll = null;

function loadCreditsRoll() {
  if (roll) return roll;
  const versionsFile = path.join(DATA_DIR, 'versions.json');
  if (!fs.existsSync(versionsFile)) {
    return (roll = { departments: [], memoir: [] });
  }
  const { versions } = readJson(versionsFile);
  return (roll = collectCredits(versions.map((v) => creditsAt(v.sha))));
}

function headingId(title, used) {
  let id = slug(title) || 'section';
  if (used.has(id)) {
    let i = 2;
    while (used.has(`${id}-${i}`)) i++;
    id = `${id}-${i}`;
  }
  used.add(id);
  return id;
}

function nameItem(raw) {
  const m = String(raw).match(/^(.+?)\s*\((.+)\)\s*$/);
  if (!m) return `<li>${esc(raw)}</li>`;
  return `<li>${esc(m[1])}<span class="muted">${esc(m[2])}</span></li>`;
}

function nameList(lines) {
  return `<ul class="credits-names">${lines.map(nameItem).join('')}</ul>`;
}

function renderSection(sec, used, tag) {
  const title = creditLabel(sec.SectionName);
  const lines = (sec.SectionLines || []).map((l) => String(l).trim()).filter(Boolean);
  if (!title && !lines.length) return '';
  const head = title ? `<${tag} id="${esc(headingId(title, used))}">${esc(title)}</${tag}>` : '';
  if (!lines.length) return head;
  if (isLegalSection(sec)) {
    return `${head}${lines.map((l) => `<p>${esc(l)}</p>`).join('')}`;
  }
  return `${head}${nameList(lines)}`;
}

function renderDept(dept, used) {
  const title = creditLabel(dept.DepartmentName);
  const sections = dept.Sections || [];
  if (!title) return sections.map((s) => renderSection(s, used, 'h2')).join('');
  return `<h2 id="${esc(headingId(title, used))}">${esc(title)}</h2>${sections
    .map((s) => renderSection(s, used, 'h3'))
    .join('')}`;
}

export function renderCredits(ctx) {
  const { departments, memoir } = loadCreditsRoll();
  const used = new Set();
  const people = departments.filter((d) => !isLegalDept(d));

  const peopleHtml = people.map((d) => renderDept(d, used)).join('');
  used.add('alumni');
  const alumniGroups = new Map();
  for (const p of memoir) {
    const role = p.role || 'Alumni';
    if (!alumniGroups.has(role)) alumniGroups.set(role, []);
    alumniGroups.get(role).push(p.name);
  }
  const memoirBlock = memoir.length
    ? `<h2 id="alumni">Alumni</h2>${[...alumniGroups.keys()]
        .sort((a, b) => a.localeCompare(b, 'en'))
        .map((role) => `<h3 id="${esc(headingId(role, used))}">${esc(role)}</h3>${nameList(alumniGroups.get(role))}`)
        .join('')}`
    : '';

  const content = /* html */ `
<h1>Credits</h1>
<p>Found in the game files. It might be outdated.</p>
${peopleHtml}
${memoirBlock}`;

  return layout({
    ...ctx,
    title: 'Credits',
    active: 'credits/',
    description: 'The DayZ credits roll, across every documented build.',
    breadcrumbs: [{ label: 'Credits' }],
    content,
  });
}
