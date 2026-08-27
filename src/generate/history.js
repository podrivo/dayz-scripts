// When each class, enum and member first appeared, and when a member last
// changed. Built from the same adjacent diffs the changelog folds — one walk
// oldest → newest while generate already holds each pair.
//
// Packed as build indices into a newest-first `builds` array so the file stays
// small and the client can ignore events newer than the build it is viewing.
// A type that is already in the oldest tracked build is not "added" there; the
// client prints Since, because the archive does not go further back.

import { ADDED, REMOVED, CHANGED, diffModels } from './diff.js';

function emptyRec(build) {
  return { added: build, members: new Map() };
}

function seedKind(names, build) {
  const out = new Map();
  for (const name of names) out.set(name, emptyRec(build));
  return out;
}

export function seedHistory(site) {
  return {
    class: seedKind(site.classes.keys(), site.build),
    enum: seedKind(site.enums.keys(), site.build),
  };
}

function applyKind(map, kind, build) {
  if (!kind) return;
  for (const name of kind.added) map.set(name, emptyRec(build));
  for (const name of kind.removed) map.delete(name);
  for (const entry of kind.changed) {
    let rec = map.get(entry.name);
    if (!rec) map.set(entry.name, (rec = emptyRec(build)));
    for (const row of entry.rows) {
      const [op, mem] = row;
      if (op === ADDED) {
        const prev = rec.members.get(mem);
        rec.members.set(mem, { added: build, changed: prev?.changed });
      } else if (op === CHANGED) {
        const prev = rec.members.get(mem) || {};
        rec.members.set(mem, { added: prev.added, changed: build });
      } else if (op === REMOVED) rec.members.delete(mem);
    }
  }
}

export function applyDiff(history, diff, build) {
  applyKind(history.class, diff.class, build);
  applyKind(history.enum, diff.enum, build);
}

function packMembers(members, idx) {
  const out = {};
  for (const [name, ev] of members) {
    const a = ev.added != null ? idx.get(ev.added) : undefined;
    const c = ev.changed != null ? idx.get(ev.changed) : undefined;
    if (a == null && c == null) continue;
    out[name] = c == null ? a : [a ?? -1, c];
  }
  return out;
}

function packKind(map, idx) {
  const out = {};
  for (const [name, rec] of map) {
    const added = idx.get(rec.added);
    if (added == null) continue;
    const members = packMembers(rec.members, idx);
    out[name] = Object.keys(members).length ? [added, members] : added;
  }
  return out;
}

/** Newest-first `versions` (the same order as assets/versions.json). */
export function serializeHistory(history, versions) {
  const idx = new Map(versions.map((v, i) => [v.build, i]));
  return {
    builds: versions.map((v) => v.build),
    class: packKind(history.class, idx),
    enum: packKind(history.enum, idx),
  };
}

/**
 * Walk every build oldest → newest. Used by the dev server, which never
 * generates; generate itself applies each diff as it goes instead.
 */
export function buildHistory(versions, siteFor) {
  let history = null;
  let prev = null;
  for (const v of [...versions].reverse()) {
    const site = siteFor(v.label);
    if (!site) continue;
    if (!history) history = seedHistory(site);
    else applyDiff(history, diffModels(site, prev), site.build);
    prev = site;
  }
  return history ? serializeHistory(history, versions) : { builds: [], class: {}, enum: {} };
}
