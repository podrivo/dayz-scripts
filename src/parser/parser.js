// Recursive-descent declaration parser for Enforce Script.
//
// Parses declaration heads precisely (classes, methods, members, enums,
// typedefs, globals); method bodies and initializer expressions are skipped
// with brace/paren matching so they can never cause a parse failure.
//
// Preprocessor conditionals (#ifdef/#ifndef/#else/#endif) are not stripped:
// every declaration carries the stack of conditions it appears under
// (e.g. ["DIAG_DEVELOPER", "!SERVER"]).
//
// The parser never throws on malformed input: it records a diagnostic and
// resynchronizes at the next `;` or brace boundary.

import { lex } from './lexer.js';

const MEMBER_MODS = new Set([
  'private', 'protected', 'static', 'proto', 'native', 'owned', 'external',
  'volatile', 'override', 'event', 'sealed', 'modded', 'reference',
]);
const TYPE_PREFIX_MODS = new Set(['ref', 'autoptr', 'const', 'owned', 'notnull', 'local']);
const PARAM_MODS = new Set(['out', 'inout', 'notnull', 'ref', 'autoptr', 'const', 'owned']);
const DECL_KEYWORDS = new Set(['class', 'enum', 'typedef']);

/** Names that take a '(' without being a call. */
const NOT_CALLS = new Set([
  'if', 'else', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'return',
  'new', 'delete', 'thread', 'catch', 'sizeof', 'typeof', 'break', 'continue',
]);

const isDocBlock = (v) =>
  (v.startsWith('/**') && v[3] !== '*') || v.startsWith('/*!');
const isDocLine = (v) => v.startsWith('//!') || (v.startsWith('///') && v[3] !== '/');

function cleanBlockComment(v) {
  let body = v.replace(/^\/\*[*!]?/, '').replace(/\*\/$/, '');
  return body
    .split('\n')
    .map((l) => l.replace(/^\s*\*(?!\/)\s?/, '').replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

function cleanLineComment(v) {
  return v.replace(/^\/\/[!/]?<?\s?/, '').replace(/\s+$/, '');
}

/** A \name block: it nests inside a topic without being one. */
const MEMBER_BLOCK = Symbol('member group');

export class Parser {
  constructor(source, file = '<input>') {
    this.source = source;
    this.file = file;
    this.tokens = lex(source);
    this.pos = 0;
    this.diagnostics = [];
    this.conds = []; // active preprocessor conditions
    this.groups = []; // open blocks, innermost last: a group or MEMBER_BLOCK
    this.pendingGroup = null;
    this.pendingDoc = null; // {text, line}
    this.pendingAttrs = null; // [Attribute(...)] decorations
    this.out = {
      path: file,
      classes: [],
      enums: [],
      typedefs: [],
      globals: [],
      functions: [],
      defines: [],
    };
  }

  // ---- token helpers -------------------------------------------------------

  peekRaw(k = 0) {
    return this.tokens[Math.min(this.pos + k, this.tokens.length - 1)];
  }

  /** Peek the next significant token (skipping comments/directives) WITHOUT
   * processing them. Used for lookahead decisions only. */
  peek(k = 0) {
    let i = this.pos;
    let seen = 0;
    while (i < this.tokens.length) {
      const t = this.tokens[i];
      if (t.type !== 'comment' && t.type !== 'directive') {
        if (seen === k) return t;
        seen++;
      }
      i++;
    }
    return this.tokens[this.tokens.length - 1];
  }

  /** Advance one token, processing comments (docs) and directives (conds). */
  advance() {
    const t = this.tokens[this.pos++];
    return t;
  }

  /** Consume comments/directives, processing their side effects, then return
   * (without consuming) the next significant token. */
  sig() {
    for (;;) {
      const t = this.peekRaw();
      if (t.type === 'comment') {
        this.handleComment(t);
        this.pos++;
      } else if (t.type === 'directive') {
        this.handleDirective(t);
        this.pos++;
      } else {
        return t;
      }
    }
  }

  nextSig() {
    const t = this.sig();
    if (t.type !== 'eof') this.pos++;
    return t;
  }

  eatIf(value) {
    const t = this.sig();
    if (t.type !== 'eof' && t.value === value) {
      this.pos++;
      return true;
    }
    return false;
  }

  expect(value, context) {
    const t = this.sig();
    if (t.value === value) {
      this.pos++;
      return t;
    }
    this.diag(`expected '${value}' in ${context}, found '${t.value || 'eof'}'`, t.line);
    return null;
  }

  diag(msg, line) {
    this.diagnostics.push({ file: this.file, line, msg });
  }

  takeDoc() {
    const d = this.pendingDoc;
    this.pendingDoc = null;
    return d ? d.text : null;
  }

  takeAttrs() {
    const a = this.pendingAttrs;
    this.pendingAttrs = null;
    return a;
  }

  /** Capture a balanced [Attribute(...)] decoration; positioned ON the '['. */
  parseAttribute() {
    const startTok = this.sig();
    let depth = 0;
    let endOffset = startTok.start;
    for (;;) {
      const t = this.sig();
      if (t.type === 'eof') break;
      this.pos++;
      endOffset = t.end;
      if (t.value === '[' || t.value === '(' || t.value === '{') depth++;
      else if (t.value === ']' || t.value === ')' || t.value === '}') {
        depth--;
        if (depth <= 0 && t.value === ']') break;
      }
    }
    const text = this.source.slice(startTok.start, endOffset).replace(/\s+/g, ' ').trim();
    (this.pendingAttrs ??= []).push(text);
  }

  snapshotConds() {
    return this.conds.length ? this.conds.map((c) => (c.neg ? '!' : '') + c.name) : undefined;
  }

  currentGroup() {
    for (let i = this.groups.length - 1; i >= 0; i--) {
      if (this.groups[i] !== MEMBER_BLOCK) return this.groups[i].name;
    }
    return undefined;
  }

  // ---- comments & preprocessor --------------------------------------------

  handleComment(t) {
    const v = t.value;
    if (t.type === 'comment' && (isDocBlock(v) || isDocLine(v))) {
      const text = v.startsWith('//') ? cleanLineComment(v) : cleanBlockComment(v);

      // Group handling: "/** \defgroup Name Title ... @{ */" opens a group and
      // documents it; "\addtogroup Name @{" reopens one defined elsewhere.
      // A group opened while another is still open is nested inside it, which
      // is where the module tree comes from.
      const dg = text.match(/[\\@](defgroup|addtogroup)\s+(\S+)([^\n]*)/);
      if (dg) {
        const define = dg[1] === 'defgroup';
        const title = dg[3].trim().replace(/^\((.*)\)$/, '$1');
        const group = { name: dg[2], parent: this.currentGroup() };
        if (/@\{/.test(text)) this.groups.push(group);
        else this.pendingGroup = group;
        if (!this.out.groups) this.out.groups = [];
        this.out.groups.push({
          name: group.name,
          title: title || group.name,
          parent: group.parent,
          define,
          desc: define ? text : undefined,
        });
        return;
      }
      // A @{ that does not name a group opens a member group -- the sources
      // use them under \name to caption a run of related declarations. They
      // nest inside the topic rather than being one, so they go on the same
      // stack and take their own @} with them; without that, the member group
      // in enwidgets.c would close the topic covering the whole widget API.
      if (/@\{/.test(text)) {
        this.groups.push(this.pendingGroup || MEMBER_BLOCK);
        this.pendingGroup = null;
        return;
      }
      if (/@\}/.test(text)) {
        this.groups.pop();
        return;
      }

      // merge consecutive doc lines (//! a \n //! b)
      if (this.pendingDoc && v.startsWith('//') && this.pendingDoc.line >= t.line - 1 && this.pendingDoc.fromLine) {
        this.pendingDoc = { text: this.pendingDoc.text + '\n' + text, line: t.line, fromLine: true };
      } else {
        this.pendingDoc = { text, line: t.line, fromLine: v.startsWith('//') };
      }
    } else if (/@\{/.test(v) && this.pendingGroup) {
      this.groups.push(this.pendingGroup);
      this.pendingGroup = null;
    }
    // A plain "//@}" closes nothing. Doxygen reads @} as a terminator only
    // inside a documentation comment, so the 257 plain ones here -- sound.c
    // ends its API topic with one -- were ignored and those topics ran on to
    // the end of the file. Honouring them instead files 9% fewer of the names
    // the old documentation listed.
  }

  handleDirective(t) {
    const v = t.value.trim();
    let m;
    if ((m = v.match(/^#\s*ifdef\s+(\w+)/))) {
      this.conds.push({ name: m[1], neg: false });
    } else if ((m = v.match(/^#\s*ifndef\s+(\w+)/))) {
      this.conds.push({ name: m[1], neg: true });
    } else if ((m = v.match(/^#\s*if\b(.*)/))) {
      this.conds.push({ name: m[1].trim() || '?', neg: false });
    } else if (/^#\s*else\b/.test(v)) {
      const top = this.conds[this.conds.length - 1];
      if (top) top.neg = !top.neg;
    } else if (/^#\s*endif\b/.test(v)) {
      this.conds.pop();
    } else if ((m = v.match(/^#\s*define\s+(\w+)\s*(.*)/))) {
      this.out.defines.push({
        name: m[1],
        value: m[2].trim() || undefined,
        line: t.line,
        cond: this.snapshotConds(),
        group: this.currentGroup(),
      });
    }
    // #include and anything else: ignore
  }

  /** If the next raw token is a comment on `line`, consume it and return its
   * cleaned text (trailing comment, e.g. "const int X = 1; // explanation"). */
  takeTrailing(line) {
    const t = this.peekRaw();
    if (t.type === 'comment' && t.line === line && !t.value.includes('\n')) {
      this.pos++;
      return t.value.startsWith('//') ? cleanLineComment(t.value) : cleanBlockComment(t.value);
    }
    return null;
  }

  // ---- skipping ------------------------------------------------------------

  /** Skip a balanced {...} block; positioned ON the '{'.
   *  Given a Map, records every called name with the receiver expression it
   *  is called on, when one can be read from the tokens: a chain of
   *  identifiers and calls (`a.b.Show()`, `GetGame().GetMission()`), a class
   *  name (`PlayerBase.Cast(...)`), or `new X(...)` (a constructor).
   *  Given a second Map, records local declarations (`PlayerBase player = …`,
   *  `foreach (Widget w : list)`) so those receivers can later be typed. */
  skipBraces(calls, locals, refs) {
    let depth = 0;
    const history = [];
    const stmt = []; // tokens since the last statement boundary
    for (;;) {
      const t = this.sig();
      if (t.type === 'eof') return;
      this.pos++;
      const name = history.at(-1);
      if (refs && t.type === 'ident' && this.peek().value !== '(') {
        const dotted = history.at(-1)?.value === '.' || history.at(-1)?.value === '::';
        const receiverToken = dotted ? history.at(-2) : undefined;
        const receiver = receiverToken?.type === 'ident' ? receiverToken.value : undefined;
        if (!dotted || receiver) {
          refs.set(`${receiver || ''}\0${t.value}`, receiver ? { name: t.value, receiver } : { name: t.value });
        }
      }
      if (calls && t.value === '(' && name?.type === 'ident' && !NOT_CALLS.has(name.value)) {
        const matchBack = (close, open, from) => {
          let d = 0;
          for (let j = from; j >= 0; j--) {
            if (history[j].value === close) d++;
            else if (history[j].value === open && --d === 0) return j;
          }
          return -1;
        };
        const segments = [];
        let i = history.length - 2;
        for (;;) {
          if (history[i]?.value !== '.' && history[i]?.value !== '::') break;
          // Peel grouping parentheses: `(Type.Cast(x)).Method`
          let k = i - 1;
          for (;;) {
            if (history[k]?.value !== ')') break;
            const open = matchBack(')', '(', k);
            if (open < 0) {
              k = -1;
              break;
            }
            const prev = history[open - 1];
            if (prev?.type === 'ident' && !NOT_CALLS.has(prev.value)) break;
            k -= 1;
          }
          if (k < 0) {
            segments.length = 0;
            break;
          }
          const before = history[k];
          if (before?.type === 'ident') {
            segments.unshift(before.value);
            i = k - 1;
          } else if (before?.type === 'string') {
            // `"text".Length()` — the receiver is the string class.
            segments.unshift('string');
            break;
          } else if (before?.value === ')') {
            const open = matchBack(')', '(', k);
            const callee = history[open - 1];
            if (open < 0 || callee?.type !== 'ident' || NOT_CALLS.has(callee.value)) {
              segments.length = 0;
              break;
            }
            segments.unshift(`${callee.value}()`);
            i = open - 2;
          } else if (before?.value === ']') {
            // `ingredients[0].IsEmpty()` — type the element via the array name.
            const open = matchBack(']', '[', k);
            const base = history[open - 1];
            if (open < 0 || base?.type !== 'ident') {
              segments.length = 0;
              break;
            }
            // `name[]` marks element access so the resolver uses the element type,
            // not the array class (which is itself a declared type in Enforce).
            segments.unshift(`${base.value}[]`);
            i = open - 2;
          } else if (before?.value === '>') {
            // `JsonFileLoader<T>.LoadFile()` — skip template arguments.
            const open = matchBack('>', '<', k);
            const base = history[open - 1];
            if (open < 0 || base?.type !== 'ident') {
              segments.length = 0;
              break;
            }
            segments.unshift(base.value);
            i = open - 2;
          } else {
            segments.length = 0;
            break;
          }
        }
        const call = { name: name.value };
        if (segments.length) call.receiver = segments.join('.');
        else if (history.at(-2)?.value === 'new') call.ctor = true;
        calls.set(`${call.ctor ? 'new ' : ''}${call.receiver || ''}\0${call.name}`, call);
      }
      if (locals && (t.value === '=' || t.value === ';' || t.value === ':' || t.value === ',')) {
        const v = stmt.at(-1);
        const prev = stmt.at(-2);
        if (
          stmt.length >= 2 && v?.type === 'ident' && !NOT_CALLS.has(stmt[0].value) &&
          (prev?.type === 'ident' ||
            (prev?.value === '>' && stmt.some((x) => x.value === '<'))) &&
          !locals.has(v.value)
        ) {
          locals.set(v.value, stmt.slice(0, -1).map((x) => x.value).join(' '));
        }
      }
      if (t.value === '{') depth++;
      else if (t.value === '}') {
        depth--;
        if (depth <= 0) return;
      }
      if (';{}()=:,'.includes(t.value)) stmt.length = 0;
      else stmt.push(t);
      history.push(t);
    }
  }

  /** Capture raw source until a stopper punct at depth 0. Returns trimmed text.
   * Stops BEFORE the stopper. Tracks (), [], {} depth. */
  captureUntil(stoppers) {
    const startTok = this.sig();
    let depth = 0;
    let endOffset = startTok.start;
    for (;;) {
      const t = this.sig();
      if (t.type === 'eof') break;
      if (depth === 0 && t.type === 'punct' && stoppers.includes(t.value)) break;
      if (t.value === '(' || t.value === '[' || t.value === '{') depth++;
      else if (t.value === ')' || t.value === ']' || t.value === '}') {
        if (depth === 0) break; // unbalanced closer belongs to caller
        depth--;
      }
      this.pos++;
      endOffset = t.end;
      // Swallow template args after an identifier (e.g. "new map<K, V>()")
      // so the commas inside <> don't terminate the capture.
      if (t.type === 'ident' && this.peekRaw().value === '<') {
        const targs = this.tryTemplateArgs();
        if (targs) endOffset = this.tokens[this.pos - 1].end;
      }
    }
    return this.source.slice(startTok.start, endOffset).replace(/\s+/g, ' ').trim();
  }

  /** Recover from a parse error: skip to next ';' (consumed) or stop before
   * '}' / next declaration keyword. */
  recover() {
    for (;;) {
      const t = this.sig();
      if (t.type === 'eof') return;
      if (t.value === ';') {
        this.pos++;
        return;
      }
      if (t.value === '}') return;
      if (t.type === 'ident' && DECL_KEYWORDS.has(t.value)) return;
      if (t.value === '{') {
        this.skipBraces();
        return;
      }
      this.pos++;
    }
  }

  // ---- types ---------------------------------------------------------------

  /** Try to parse template args starting at '<'. Returns raw string or null. */
  tryTemplateArgs() {
    const save = this.pos;
    const open = this.sig();
    if (open.value !== '<') return null;
    // Lookahead: find matching '>' before any ';', '{', '}' or eof, allowing
    // only tokens that can legally appear inside template args (identifiers,
    // commas, nested angles, array suffixes). Anything else (operators,
    // numbers, strings) means this '<' is a comparison, not a template.
    let i = this.pos;
    let depth = 0;
    let ok = false;
    let guard = 0;
    while (i < this.tokens.length && guard++ < 400) {
      const t = this.tokens[i];
      if (t.type === 'comment' || t.type === 'directive') { i++; continue; }
      if (t.value === '<') depth++;
      else if (t.value === '>') {
        depth--;
        if (depth === 0) { ok = true; break; }
      } else if (t.value === '>>') {
        depth -= 2;
        if (depth <= 0) { ok = true; break; }
      } else if (t.type === 'ident' || t.value === ',' || t.value === '[' || t.value === ']') {
        // fine inside template args
      } else {
        break;
      }
      i++;
    }
    if (!ok) {
      this.pos = save;
      return null;
    }
    // consume through the matching '>'
    const startTok = this.tokens[this.pos];
    let depth2 = 0;
    let endOffset = startTok.start;
    for (;;) {
      const t = this.sig();
      if (t.type === 'eof') break;
      this.pos++;
      endOffset = t.end;
      if (t.value === '<') depth2++;
      else if (t.value === '>') {
        depth2--;
        if (depth2 === 0) break;
      } else if (t.value === '>>') {
        depth2 -= 2;
        if (depth2 <= 0) break;
      }
    }
    return this.source.slice(startTok.start, endOffset);
  }

  /** Parse a type at the current position. Returns string or null. */
  parseType() {
    const parts = [];
    for (;;) {
      const t = this.sig();
      if (t.type === 'ident' && TYPE_PREFIX_MODS.has(t.value)) {
        // 'const' could also be a mod handled earlier; here it's part of type
        parts.push(t.value);
        this.pos++;
      } else break;
    }
    const t = this.sig();
    if (t.type !== 'ident') return parts.length ? parts.join(' ') : null;
    this.pos++;
    let type = t.value;
    const targs = this.tryTemplateArgs();
    if (targs) type += targs;
    // array suffixes: [] or [expr]
    while (this.sig().value === '[') {
      // Only when directly a type suffix, e.g. "typedef int[] TypeID" or
      // return types. Variable-name arrays are handled by the caller, so we
      // only consume if followed by ']' or a simple constant then ']'.
      const save = this.pos;
      this.pos++; // '['
      const inner = this.captureUntil([';', ',']);
      if (this.sig().value === ']') {
        this.pos++;
        // Heuristic: `int[3] x` / `int[] x` is a type suffix; `int x[3]` is
        // handled elsewhere. If the NEXT token is an ident, this was a type
        // suffix. Otherwise restore.
        if (this.sig().type === 'ident' || inner === '') {
          type += `[${inner}]`;
          continue;
        }
      }
      this.pos = save;
      break;
    }
    return parts.length ? parts.join(' ') + ' ' + type : type;
  }

  // ---- declarations ---------------------------------------------------------

  parseFile() {
    for (;;) {
      const t = this.sig();
      if (t.type === 'eof') break;
      this.parseTopLevel();
    }
    return { model: this.out, diagnostics: this.diagnostics };
  }

  /** True when the upcoming tokens are [modifiers...] followed by `keyword`. */
  aheadIs(keyword) {
    for (let k = 0; k < 8; k++) {
      const t = this.peek(k);
      if (t.value === keyword) return true;
      if (t.type !== 'ident' || !(MEMBER_MODS.has(t.value) || t.value === 'const')) return false;
    }
    return false;
  }

  parseTopLevel() {
    const t = this.sig();
    if (t.type === 'eof') return;

    if (t.value === ';') {
      this.pos++;
      return;
    }
    if (t.value === '[') {
      this.parseAttribute();
      return;
    }
    if (this.aheadIs('class')) {
      this.parseClass();
      return;
    }
    if (this.aheadIs('enum')) {
      this.parseEnum();
      return;
    }
    if (t.value === 'typedef') {
      this.parseTypedef();
      return;
    }
    if (t.type === 'ident') {
      this.parseMemberOrFunction(null);
      return;
    }
    this.diag(`unexpected '${t.value}' at top level`, t.line);
    this.pos++;
    this.recover();
  }

  parseClass() {
    const doc = this.takeDoc();
    const attrs = this.takeAttrs();
    const startTok = this.sig();
    let modded = false;
    const clsMods = [];
    // modifiers may precede 'class': "sealed class Contact", "modded class X"
    for (;;) {
      const t = this.sig();
      if (t.type === 'ident' && t.value !== 'class' && (MEMBER_MODS.has(t.value) || t.value === 'const')) {
        if (t.value === 'modded') modded = true;
        else clsMods.push(t.value);
        this.pos++;
      } else break;
    }
    this.expect('class', 'class declaration');
    const nameTok = this.nextSig();
    if (nameTok.type !== 'ident') {
      this.diag(`expected class name, found '${nameTok.value}'`, nameTok.line);
      this.recover();
      return;
    }

    const cls = {
      name: nameTok.value,
      line: startTok.line,
      doc,
      cond: this.snapshotConds(),
      group: this.currentGroup(),
      methods: [],
      members: [],
    };
    if (modded) cls.modded = true;
    if (clsMods.length) cls.mods = clsMods;
    if (attrs) cls.attrs = attrs;

    const generics = this.tryTemplateArgs();
    if (generics) cls.generics = generics;

    const nxt = this.sig();
    if (nxt.value === 'extends' || nxt.value === ':') {
      this.pos++;
      const base = this.parseType();
      if (base) cls.base = base;
      else this.diag('expected base class name', nxt.line);
    }

    const bodyStart = this.sig();
    if (bodyStart.value === ';') {
      this.pos++;
      cls.forward = true;
      this.out.classes.push(cls);
      return;
    }
    if (bodyStart.value === 'class' || bodyStart.value === 'modded' ||
        (bodyStart.type === 'ident' && MEMBER_MODS.has(bodyStart.value) && this.aheadIs('class'))) {
      // Alternative class header in an #ifdef/#else pair sharing one body:
      //   #ifdef FEATURE_X
      //   class Man extends Person
      //   #else
      //   class Man extends EntityAI
      //   #endif
      //   { ... }
      // This header has no body of its own; the following header gets it.
      // Both carry their preprocessor conditions, so nothing is lost.
      cls.forward = true;
      this.out.classes.push(cls);
      return;
    }
    if (bodyStart.value !== '{') {
      this.diag(`expected '{' for class ${cls.name}, found '${bodyStart.value}'`, bodyStart.line);
      this.out.classes.push(cls);
      this.recover();
      return;
    }
    this.pos++; // '{'

    for (;;) {
      const t = this.sig();
      if (t.type === 'eof') {
        this.diag(`unterminated class ${cls.name}`, cls.line);
        break;
      }
      if (t.value === '}') {
        this.pos++;
        cls.endLine = t.line;
        break;
      }
      if (t.value === ';') {
        this.pos++;
        continue;
      }
      if (t.value === '[') {
        this.parseAttribute();
        continue;
      }
      if (this.aheadIs('class') && this.peek(0).value === 'class') {
        // nested class (unusual) - parse and hoist
        this.parseClass();
        continue;
      }
      if (t.value === 'enum') {
        this.parseEnum();
        continue;
      }
      if (t.value === 'typedef') {
        this.parseTypedef();
        continue;
      }
      if (t.type === 'ident' || t.value === '~') {
        this.parseMemberOrFunction(cls);
        continue;
      }
      this.diag(`unexpected '${t.value}' in class ${cls.name}`, t.line);
      this.pos++;
      this.recover();
    }

    this.eatIf(';');
    this.pendingDoc = null;
    this.out.classes.push(cls);
  }

  parseEnum() {
    const doc = this.takeDoc();
    const startTok = this.sig();
    this.expect('enum', 'enum declaration');
    const nameTok = this.sig();
    let name = null;
    if (nameTok.type === 'ident') {
      name = nameTok.value;
      this.pos++;
    }
    const en = {
      name: name || '(anonymous)',
      line: startTok.line,
      doc,
      cond: this.snapshotConds(),
      group: this.currentGroup(),
      values: [],
    };
    const nxt = this.sig();
    if (nxt.value === ':' || nxt.value === 'extends') {
      this.pos++;
      const base = this.parseType();
      if (base) en.base = base;
    }
    if (!this.expect('{', `enum ${en.name}`)) {
      this.out.enums.push(en);
      this.recover();
      return;
    }
    for (;;) {
      const t = this.sig();
      if (t.type === 'eof') break;
      if (t.value === '}') {
        this.pos++;
        break;
      }
      if (t.value === ',' || t.value === ';') {
        // ';' as separator appears in older scripts (e.g. enum ImpactTypes)
        this.pos++;
        continue;
      }
      if (t.type !== 'ident') {
        this.diag(`unexpected '${t.value}' in enum ${en.name}`, t.line);
        this.pos++;
        continue;
      }
      const entry = {
        name: t.value,
        line: t.line,
        doc: this.takeDoc(),
        cond: this.snapshotConds(),
      };
      this.pos++;
      if (this.eatIf('=')) {
        entry.value = this.captureUntil([',', '}']) || undefined;
      }
      // consume trailing same-line comment as doc if none
      const afterTok = this.peekRaw();
      let sameLine = entry.line;
      if (afterTok.type === 'punct' && afterTok.value === ',') {
        this.pos++;
        sameLine = afterTok.line;
      }
      const trail = this.takeTrailing(sameLine);
      if (trail && !entry.doc) entry.doc = trail;
      en.values.push(entry);
    }
    this.eatIf(';');
    this.pendingDoc = null;
    this.out.enums.push(en);
  }

  parseTypedef() {
    const doc = this.takeDoc();
    const startTok = this.sig();
    this.expect('typedef', 'typedef');
    const type = this.parseType();
    const nameTok = this.nextSig();
    if (!type || nameTok.type !== 'ident') {
      this.diag('malformed typedef', startTok.line);
      this.recover();
      return;
    }
    const td = {
      name: nameTok.value,
      type,
      line: startTok.line,
      doc,
      cond: this.snapshotConds(),
      group: this.currentGroup(),
    };
    // function-style typedefs: typedef func TFunc; / typedef X Y(params)?
    if (this.sig().value === '(') {
      this.pos++;
      td.params = this.captureUntil([')']);
      this.eatIf(')');
    }
    const term = this.sig();
    if (term.value === ';') this.pos++;
    else if (term.value !== '}' && term.type !== 'eof' &&
             !(term.type === 'ident' && (DECL_KEYWORDS.has(term.value) || term.line > nameTok.line))) {
      this.diag(`expected ';' in typedef ${td.name}, found '${term.value}'`, term.line);
      this.recover();
    }
    this.out.typedefs.push(td);
  }

  /**
   * Parse a member variable, method, global variable/constant or global
   * function. `cls` is null at file scope.
   */
  parseMemberOrFunction(cls) {
    const doc = this.takeDoc();
    const attrs = this.takeAttrs();
    const startTok = this.sig();
    const mods = [];
    const typePrefix = [];

    // Leading modifiers and type prefixes, in ANY order (real sources contain
    // both "protected ref X" and "ref protected X").
    for (;;) {
      const t = this.sig();
      if (t.type !== 'ident') break;
      if (MEMBER_MODS.has(t.value) || t.value === 'const') {
        mods.push(t.value);
        this.pos++;
      } else if (t.value === 'ref' || t.value === 'autoptr' || t.value === 'local' || t.value === 'notnull') {
        typePrefix.push(t.value);
        this.pos++;
      } else break;
    }

    // destructor: [private] void ~Name() — '~' may appear before the name,
    // but also directly as "~Name()" with implicit void
    let dtor = false;
    if (this.sig().value === '~') {
      this.pos++;
      dtor = true;
    }

    let type = dtor ? 'void' : this.parseType();
    if (type && typePrefix.length) type = typePrefix.join(' ') + ' ' + type;
    if (!type) {
      const t = this.sig();
      this.diag(`expected type, found '${t.value || 'eof'}'`, t.line);
      this.pos++;
      this.recover();
      return;
    }

    // Case: constructor/destructor written without return type:
    // "PlayerBase()" — type parsed is actually the name and next is '('.
    let name;
    let nameLine = startTok.line;
    const afterType = this.sig();
    if (afterType.value === '(' && cls && type.replace(/^.*\s/, '') === cls.name) {
      name = (dtor ? '~' : '') + cls.name;
    } else if (
      (afterType.value === ',' || afterType.value === ';') &&
      /^\w+$/.test(type) && !mods.length && !typePrefix.length
    ) {
      // Bare identifier list (doc-only #ifdef DOXYGEN blocks):
      //   TextWidgetTypeID, MultilineTextWidgetTypeID, ...
      // Reinterpret the parsed "type" as the declared name.
      name = type;
      type = undefined;
    } else {
      if (afterType.value === '~') {
        this.pos++;
        dtor = true;
      }
      const nameTok = this.sig();
      if (nameTok.type !== 'ident') {
        this.diag(`expected name after type '${type}', found '${nameTok.value || 'eof'}'`, nameTok.line);
        this.recover();
        return;
      }
      this.pos++;
      name = (dtor ? '~' : '') + nameTok.value;
      nameLine = nameTok.line;
    }

    const cond = this.snapshotConds();

    if (this.sig().value === '(') {
      // ---- function/method
      this.pos++; // '('
      const params = this.parseParams();
      const closeLine = this.tokens[this.pos - 1]?.line ?? nameLine;
      const fn = {
        name,
        ret: type,
        params,
        line: nameLine,
        doc,
        cond,
      };
      if (mods.length) fn.mods = mods;
      if (attrs) fn.attrs = attrs;
      if (cls) {
        if (dtor) fn.kind = 'dtor';
        else if (name === cls.name) fn.kind = 'ctor';
      }
      const after = this.sig();
      if (after.value === ';') {
        this.pos++;
        fn.proto = true;
        const trail = this.takeTrailing(after.line);
        if (trail && !fn.doc) fn.doc = trail;
      } else if (after.value === '{') {
        const calls = new Map();
        const locals = new Map();
        const refs = new Map();
        this.skipBraces(calls, locals, refs);
        calls.delete(`\0${name}`); // recursion is not a cross-reference worth listing
        calls.delete(`this\0${name}`);
        if (calls.size) {
          fn.calls = [...calls.values()].sort(
            (a, b) => a.name.localeCompare(b.name) || (a.receiver || '').localeCompare(b.receiver || '')
          );
        }
        if (locals.size) fn.locals = Object.fromEntries(locals);
        if (refs.size) fn.refs = [...refs.values()].sort(
          (a, b) => a.name.localeCompare(b.name) || (a.receiver || '').localeCompare(b.receiver || '')
        );
        this.eatIf(';');
      } else if (after.value === '}' || after.type === 'eof' || (after.type === 'ident' && after.line > closeLine)) {
        // Missing ';' after a prototype — the engine compiler tolerates this
        // (e.g. proto.c: "proto native int SetSoundVolume(...)" with no ';').
        fn.proto = true;
      } else {
        this.diag(`expected ';' or '{' after ${name}(), found '${after.value || 'eof'}'`, after.line);
        this.recover();
      }
      fn.group = this.currentGroup();
      (cls ? cls.methods : this.out.functions).push(fn);
      return;
    }

    // ---- variable(s)
    let first = true;
    let varName = name;
    let varLine = nameLine;
    for (;;) {
      const v = {
        name: varName,
        type,
        line: varLine,
        doc: first ? doc : undefined,
        cond,
      };
      if (mods.length) v.mods = mods;
      if (attrs && first) v.attrs = attrs;
      v.group = this.currentGroup();

      // fixed-size array suffix(es) on the NAME: int x[4]; float uv[4][2];
      while (this.sig().value === '[') {
        this.pos++;
        const dim = this.captureUntil([']']) || '';
        this.eatIf(']');
        v.array = v.array === undefined ? dim : `${v.array}][${dim}`;
      }
      if (this.eatIf('=')) {
        v.init = this.captureUntil([',', ';']) || undefined;
      }
      (cls ? cls.members : this.out.globals).push(v);

      const sep = this.sig();
      if (sep.value === ',') {
        this.pos++;
        const nt = this.sig();
        // A dangling comma before a new declaration (happens in doc-only
        // #ifdef DOXYGEN identifier lists) ends the list.
        if (nt.type === 'ident' && DECL_KEYWORDS.has(nt.value)) return;
        if (nt.type !== 'ident') {
          this.diag(`expected name after ',' in declaration`, nt.line);
          this.recover();
          return;
        }
        this.pos++;
        varName = nt.value;
        varLine = nt.line;
        first = false;
        continue;
      }
      if (sep.value === ';') {
        this.pos++;
        const trail = this.takeTrailing(sep.line);
        if (trail && !v.doc) v.doc = trail;
        return;
      }
      const prevLine = this.tokens[this.pos - 1]?.line ?? varLine;
      if (sep.value === '}' || sep.type === 'eof' || (sep.type === 'ident' && sep.line > prevLine)) {
        // Missing ';' before '}' or the next declaration — engine-tolerated
        // (e.g. "int Mask[8]" directly before the closing brace).
        return;
      }
      this.diag(`expected ';' after declaration of '${v.name}', found '${sep.value || 'eof'}'`, sep.line);
      this.recover();
      return;
    }
  }

  parseParams() {
    const params = [];
    if (this.eatIf(')')) return params;
    for (;;) {
      const t = this.sig();
      if (t.type === 'eof') break;
      if (t.value === ')') {
        this.pos++;
        break;
      }
      const p = {};
      const mods = [];
      for (;;) {
        const mt = this.sig();
        if (mt.type === 'ident' && PARAM_MODS.has(mt.value)) {
          // "ref"/"autoptr"/"const" belong to the type; out/inout/notnull are mods
          if (mt.value === 'out' || mt.value === 'inout' || mt.value === 'notnull') {
            mods.push(mt.value);
            this.pos++;
            continue;
          }
        }
        break;
      }
      const ptype = this.parseType();
      if (!ptype) {
        this.diag(`bad parameter near '${this.sig().value}'`, this.sig().line);
        // skip to ',' or ')'
        this.captureUntil([',', ')']);
      } else {
        p.type = ptype;
        const nameTok = this.sig();
        if (nameTok.type === 'ident') {
          p.name = nameTok.value;
          this.pos++;
          while (this.sig().value === '[') {
            this.pos++;
            const dim = this.captureUntil([']']) || '';
            this.eatIf(']');
            p.array = p.array === undefined ? dim : `${p.array}][${dim}`;
          }
        }
        if (this.eatIf('=')) {
          p.def = this.captureUntil([',', ')']) || undefined;
        }
      }
      if (mods.length) p.mods = mods;
      if (p.type) params.push(p);
      const sep = this.sig();
      if (sep.value === ',') {
        this.pos++;
        continue;
      }
      if (sep.value === ')') {
        this.pos++;
        break;
      }
      this.diag(`expected ',' or ')' in parameter list, found '${sep.value || 'eof'}'`, sep.line);
      this.captureUntil([')', ';', '{']);
      this.eatIf(')');
      break;
    }
    return params;
  }
}

export function parseFile(source, file) {
  return new Parser(source, file).parseFile();
}
