// Computes the semantic API diff between two site models (new vs old).

function sigText(m) {
  const mods = m.mods?.length ? m.mods.join(' ') + ' ' : '';
  const params = (m.params || [])
    .map((p) => {
      const pm = p.mods?.length ? p.mods.join(' ') + ' ' : '';
      const arr = p.array !== undefined ? `[${p.array}]` : '';
      const def = p.def !== undefined ? ` = ${p.def}` : '';
      return `${pm}${p.type}${p.name ? ' ' + p.name : ''}${arr}${def}`;
    })
    .join(', ');
  return `${mods}${m.ret ? m.ret + ' ' : ''}${m.name}(${params})`;
}

function varText(v) {
  const mods = v.mods?.length ? v.mods.join(' ') + ' ' : '';
  const arr = v.array !== undefined ? `[${v.array}]` : '';
  return `${mods}${v.type ? v.type + ' ' : ''}${v.name}${arr}`;
}

export function diffModels(newSite, oldSite) {
  const classesAdded = [];
  const classesRemoved = [];
  const classesChanged = [];

  for (const name of newSite.classes.keys()) {
    if (!oldSite.classes.has(name)) classesAdded.push(name);
  }
  for (const name of oldSite.classes.keys()) {
    if (!newSite.classes.has(name)) classesRemoved.push(name);
  }

  for (const [name, nc] of newSite.classes) {
    const oc = oldSite.classes.get(name);
    if (!oc) continue;

    const oldByName = new Map(oc.methods.map((m) => [m.name, m]));
    const newByName = new Map(nc.methods.map((m) => [m.name, m]));

    const methodsAdded = [];
    const methodsRemoved = [];
    const methodsChanged = [];
    for (const m of nc.methods) {
      const om = oldByName.get(m.name);
      if (!om) methodsAdded.push(sigText(m));
      else {
        const a = sigText(m);
        const b = sigText(om);
        if (a !== b) methodsChanged.push({ name: m.name, from: b, to: a });
      }
    }
    for (const om of oc.methods) {
      if (!newByName.has(om.name)) methodsRemoved.push(sigText(om));
    }

    const oldVars = new Set(oc.members.map((v) => v.name));
    const newVars = new Set(nc.members.map((v) => v.name));
    const membersAdded = nc.members.filter((v) => !oldVars.has(v.name)).map(varText);
    const membersRemoved = oc.members.filter((v) => !newVars.has(v.name)).map(varText);

    if (methodsAdded.length || methodsRemoved.length || methodsChanged.length || membersAdded.length || membersRemoved.length) {
      classesChanged.push({ name, methodsAdded, methodsRemoved, methodsChanged, membersAdded, membersRemoved });
    }
  }

  const enumsAdded = [];
  const enumsRemoved = [];
  const enumsChanged = [];
  for (const name of newSite.enums.keys()) if (!oldSite.enums.has(name)) enumsAdded.push(name);
  for (const name of oldSite.enums.keys()) if (!newSite.enums.has(name)) enumsRemoved.push(name);
  for (const [name, ne] of newSite.enums) {
    const oe = oldSite.enums.get(name);
    if (!oe) continue;
    const oldVals = new Set(oe.values.map((v) => v.name));
    const newVals = new Set(ne.values.map((v) => v.name));
    const valuesAdded = ne.values.filter((v) => !oldVals.has(v.name)).map((v) => v.name);
    const valuesRemoved = oe.values.filter((v) => !newVals.has(v.name)).map((v) => v.name);
    if (valuesAdded.length || valuesRemoved.length) enumsChanged.push({ name, valuesAdded, valuesRemoved });
  }

  const sortAll = (arr) => arr.sort((a, b) => (a.name || a).localeCompare(b.name || b));
  sortAll(classesAdded);
  sortAll(classesRemoved);
  sortAll(classesChanged);
  sortAll(enumsAdded);
  sortAll(enumsRemoved);
  sortAll(enumsChanged);

  return { classesAdded, classesRemoved, classesChanged, enumsAdded, enumsRemoved, enumsChanged };
}
