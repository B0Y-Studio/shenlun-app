// Pure path parser. No side effects. No fs. No globals beyond Function.
//
// Input grammar:
//   path     := segment ( '.' segment | '[' index ']' )*
//   segment  := /[A-Za-z_$][A-Za-z0-9_$]*/
//   index    := /[0-9]+/ | /'[^'\n\r\\]*'/ | /"[^"\n\r\\]*"/
//
// Rejects anything containing __proto__ / constructor / prototype /
// Function / eval as a defensive guard against accidental type confusion.

const SEG = /[A-Za-z_$][A-Za-z0-9_$]*/y;
const NUM_INDEX = /[0-9]+/y;
const STR_INDEX_SINGLE = /'[^'\n\r\\]*'/y;
const STR_INDEX_DOUBLE = /"[^"\n\r\\]*"/y;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype', 'Function', 'eval']);

export function parsePath(input) {
  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, error: 'bad-path' };
  }

  const segments = [];
  let i = 0;

  // First segment must be a bare identifier.
  const seg = readSegment(input, 0);
  if (!seg) return { ok: false, error: 'bad-path' };
  segments.push(seg.value);
  i = seg.end;
  if (FORBIDDEN.has(seg.value)) return { ok: false, error: 'forbidden-segment' };

  while (i < input.length) {
    const c = input[i];
    if (c === '.') {
      const seg = readSegment(input, i + 1);
      if (!seg) return { ok: false, error: 'bad-path' };
      if (FORBIDDEN.has(seg.value)) return { ok: false, error: 'forbidden-segment' };
      segments.push(seg.value);
      i = seg.end;
    } else if (c === '[') {
      const idx = readIndex(input, i);
      if (!idx) return { ok: false, error: 'bad-path' };
      segments.push(idx.value);
      i = idx.end;
    } else {
      return { ok: false, error: 'bad-path' };
    }
  }

  return { ok: true, segments };
}

function readSegment(input, start) {
  // Pin the start so ^ inside /y anchors matter and we read the full match.
  SEG.lastIndex = start;
  const m = SEG.exec(input);
  if (!m || m.index !== start) return null;
  return { value: m[0], end: start + m[0].length };
}

function readIndex(input, start) {
  // start points at '['; expect '[', <index>, ']'
  if (input[start] !== '[') return null;
  // Try numeric
  NUM_INDEX.lastIndex = start + 1;
  const nm = NUM_INDEX.exec(input);
  if (nm && nm.index === start + 1) {
    const after = start + 1 + nm[0].length;
    if (input[after] !== ']') return null;
    return { value: nm[0], end: after + 1 };
  }
  // Try single-quoted
  STR_INDEX_SINGLE.lastIndex = start + 1;
  const sm1 = STR_INDEX_SINGLE.exec(input);
  if (sm1 && sm1.index === start + 1) {
    const after = start + 1 + sm1[0].length;
    if (input[after] !== ']') return null;
    // Drop the quotes.
    return { value: sm1[0].slice(1, -1), end: after + 1 };
  }
  // Try double-quoted
  STR_INDEX_DOUBLE.lastIndex = start + 1;
  const sm2 = STR_INDEX_DOUBLE.exec(input);
  if (sm2 && sm2.index === start + 1) {
    const after = start + 1 + sm2[0].length;
    if (input[after] !== ']') return null;
    return { value: sm2[0].slice(1, -1), end: after + 1 };
  }
  return null;
}