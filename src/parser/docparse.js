// Parses the text of a Doxygen-style doc comment (already stripped of comment
// markers) into a structured object:
//   { brief, desc, params: [{name, dir, text}], returns, notes, warnings,
//     code: [..], see: [..] }
// Unrecognized tags are kept in the description so nothing is lost.

const TAG_RE = /^[\\@](brief|param|returns?|return|note|warning|see|code|endcode|desc|deprecated)\b(?:\[(\w+)\])?\s*/;
const DECL_RE = /^[\\@](?:class|fn|struct|enum|file)\b/;

export function parseDoc(text) {
  if (!text) return null;
  const out = { notes: [], warnings: [], params: [], see: [], code: [] };
  let brief = null;
  let returns = null;
  let deprecated = null;
  const descLines = [];

  const lines = text.split('\n');
  let i = 0;
  let current = { kind: 'desc' }; // where free text accumulates

  const flushTo = (line) => {
    switch (current.kind) {
      case 'brief':
        brief = brief ? brief + ' ' + line : line;
        break;
      case 'param':
        current.param.text += (current.param.text ? ' ' : '') + line;
        break;
      case 'returns':
        returns = returns ? returns + ' ' + line : line;
        break;
      case 'note':
        out.notes[out.notes.length - 1] += ' ' + line;
        break;
      case 'warning':
        out.warnings[out.warnings.length - 1] += ' ' + line;
        break;
      case 'deprecated':
        deprecated = deprecated ? deprecated + ' ' + line : line;
        break;
      default:
        descLines.push(line);
    }
  };

  while (i < lines.length) {
    let line = lines[i].trim();

    if (DECL_RE.test(line)) {
      i++;
      continue;
    }

    // code block: capture verbatim until @endcode
    if (/^[\\@]code\b/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*[\\@]endcode\b/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip @endcode
      // strip common leading whitespace
      const indents = buf.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length);
      const cut = indents.length ? Math.min(...indents) : 0;
      out.code.push(buf.map((l) => l.slice(cut)).join('\n'));
      continue;
    }

    const m = line.match(TAG_RE);
    if (m) {
      const tag = m[1];
      let rest = line.slice(m[0].length);
      if (tag === 'brief' || tag === 'desc') {
        current = { kind: 'brief' };
        if (rest) flushTo(rest);
      } else if (tag === 'param') {
        const pm = rest.match(/^(\w+)\s*(.*)$/);
        const param = { name: pm ? pm[1] : '', dir: m[2] || undefined, text: pm ? pm[2] : rest };
        out.params.push(param);
        current = { kind: 'param', param };
      } else if (tag === 'return' || tag === 'returns') {
        current = { kind: 'returns' };
        if (rest) flushTo(rest);
      } else if (tag === 'note') {
        out.notes.push(rest);
        current = { kind: 'note' };
      } else if (tag === 'warning') {
        out.warnings.push(rest);
        current = { kind: 'warning' };
      } else if (tag === 'see') {
        if (rest) out.see.push(...rest.split(/[,\s]+/).filter(Boolean));
        current = { kind: 'desc' };
      } else if (tag === 'deprecated') {
        current = { kind: 'deprecated' };
        if (rest) flushTo(rest);
        else deprecated = deprecated || ' ';
      }
      i++;
      continue;
    }

    if (line === '') {
      // paragraph break returns accumulation to description
      if (current.kind === 'desc') descLines.push('');
      else current = { kind: 'desc' };
      i++;
      continue;
    }
    flushTo(line);
    i++;
  }

  const desc = descLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const result = {};
  if (brief) result.brief = brief.trim();
  if (desc) {
    // No explicit \brief: first sentence/line of the description is the brief.
    // A markdown table is data, not a one-line summary — leave it in desc.
    if (!result.brief) {
      const firstBreak = desc.indexOf('\n\n');
      const first = firstBreak === -1 ? desc : desc.slice(0, firstBreak);
      if (/^\s*\|/.test(first) && /\|[\s:|-]*---/.test(first)) {
        result.desc = desc;
      } else {
        result.brief = first.replace(/\s+/g, ' ').trim();
        const restDesc = firstBreak === -1 ? '' : desc.slice(firstBreak).trim();
        if (restDesc) result.desc = restDesc;
      }
    } else {
      result.desc = desc;
    }
  }
  if (returns) result.returns = returns.trim();
  if (deprecated) result.deprecated = deprecated.trim();
  if (out.params.length) result.params = out.params;
  if (out.notes.length) result.notes = out.notes.map((s) => s.trim());
  if (out.warnings.length) result.warnings = out.warnings.map((s) => s.trim());
  if (out.see.length) result.see = out.see;
  if (out.code.length) result.code = out.code;
  return Object.keys(result).length ? result : null;
}
