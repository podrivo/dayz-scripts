// Tokenizer for Enforce Script. Produces a flat token stream including
// comments and preprocessor directives (the parser gives those meaning).
// Token: { type, value, line, start, end }
//   type: 'ident' | 'number' | 'string' | 'punct' | 'comment' | 'directive' | 'eof'

const PUNCT3 = new Set(['<<=', '>>=']);
const PUNCT2 = new Set([
  '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '++', '--',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '::',
]);

const isIdentStart = (c) => /[A-Za-z_]/.test(c);
const isIdentPart = (c) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c) => c >= '0' && c <= '9';

export function lex(source) {
  const tokens = [];
  const n = source.length;
  let i = 0;
  let line = 1;
  let atLineStart = true;

  const push = (type, start, end) => {
    tokens.push({ type, value: source.slice(start, end), line, start, end });
  };

  while (i < n) {
    const c = source[i];

    if (c === '\n') {
      line++;
      i++;
      atLineStart = true;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }

    // Preprocessor directive: '#' first on a line, consume to end of line.
    if (c === '#' && atLineStart) {
      const start = i;
      while (i < n && source[i] !== '\n') i++;
      push('directive', start, i);
      continue;
    }
    atLineStart = false;

    // Comments
    if (c === '/' && source[i + 1] === '/') {
      const start = i;
      while (i < n && source[i] !== '\n') i++;
      push('comment', start, i);
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const start = i;
      const startLine = line;
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line++;
        i++;
      }
      i = Math.min(i + 2, n);
      tokens.push({ type: 'comment', value: source.slice(start, i), line: startLine, start, end: i });
      continue;
    }

    // Strings (double quotes; backslash escapes)
    if (c === '"') {
      const start = i;
      const startLine = line;
      i++;
      while (i < n && source[i] !== '"') {
        if (source[i] === '\\') i++;
        else if (source[i] === '\n') line++; // tolerate unterminated strings
        i++;
      }
      i = Math.min(i + 1, n);
      tokens.push({ type: 'string', value: source.slice(start, i), line: startLine, start, end: i });
      continue;
    }

    // Numbers: hex, decimal, float
    if (isDigit(c) || (c === '.' && isDigit(source[i + 1]))) {
      const start = i;
      if (c === '0' && (source[i + 1] === 'x' || source[i + 1] === 'X')) {
        i += 2;
        while (i < n && /[0-9a-fA-F]/.test(source[i])) i++;
      } else {
        while (i < n && isDigit(source[i])) i++;
        if (source[i] === '.') {
          i++;
          while (i < n && isDigit(source[i])) i++;
        }
        if (source[i] === 'e' || source[i] === 'E') {
          let j = i + 1;
          if (source[j] === '+' || source[j] === '-') j++;
          if (isDigit(source[j])) {
            i = j;
            while (i < n && isDigit(source[i])) i++;
          }
        }
      }
      push('number', start, i);
      continue;
    }

    // Identifiers / keywords
    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdentPart(source[i])) i++;
      push('ident', start, i);
      continue;
    }

    // Punctuation / operators (longest match first)
    const three = source.slice(i, i + 3);
    if (PUNCT3.has(three)) {
      push('punct', i, i + 3);
      i += 3;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (PUNCT2.has(two)) {
      push('punct', i, i + 2);
      i += 2;
      continue;
    }
    push('punct', i, i + 1);
    i++;
  }

  tokens.push({ type: 'eof', value: '', line, start: n, end: n });
  return tokens;
}
