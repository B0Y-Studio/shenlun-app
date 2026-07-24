// Pure path parser. No side effects. No fs. No globals beyond Function.
//
// Input grammar (extended for v1.1):
//   path     := segment step*
//   segment  := identifier
//   step     := '.' identifier | '[' index ']' | '.' 'get' '(' arg ')'
//   index    := <digits> | '[^'\n\r\\]*' | "[^"\n\r\\]*"
//   arg      := <digits> | '[^'\n\r\\]*' | "[^"\n\r\\]*"
//
// Each parsed step is recorded as `{ kind, key, mode }` where:
//   - kind === 'id'    : plain object property `obj[key]`
//   - kind === 'idx'   : also plain object property (numeric or stringy index)
//                        kept as a separate kind only so the renderer can
//                        distinguish them in display; runtime treats both as
//                        `obj[key]`
//   - kind === 'get'   : Map / Set / collection method `obj.get(key)`
//
// Step kinds share `mode === 'r'|'w'` ('r' read-only, 'w' writable). The
// renderer currently treats them all the same; `mode` is forward compat.
//
// Forbidden identifier guard (`__proto__`, `constructor`, ...) only fires
// on plain id steps. Map.get(key) deliberately accepts arbitrary keys,
// because those keys index into a collection, not the prototype chain.

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

  // First segment must be a bare identifier (root object).
  const seg = readSegment(input, 0);
  if (!seg) return { ok: false, error: 'bad-path' };
  if (FORBIDDEN.has(seg.value)) return { ok: false, error: 'forbidden-segment' };
  segments.push({ kind: 'id', key: seg.value });
  i = seg.end;

  while (i < input.length) {
    const c = input[i];

    if (c === '.') {
      // Decide between '.identifier' and '.method(' by scanning the method name.
      const name = readSegment(input, i + 1);
      if (!name) return { ok: false, error: 'bad-path' };
      const parenIdx = i + 1 + name.value.length;
      if (input[parenIdx] === '(') {
        // v1.1 — only allow `.get(arg)` (Map lookup) and `.getInstance()` (no
        // arg, returns singleton) at parse time. Anything else would inject
        // arbitrary method calls and is forbidden with `bad-method`.
        let methodKind;
        if (name.value === 'get') {
          methodKind = 'get';
        } else if (name.value === 'getInstance') {
          methodKind = 'getInstance';
        } else {
          return { ok: false, error: 'bad-method' };
        }
        const r = readCall(input, parenIdx);
        if (!r) return { ok: false, error: 'bad-path' };
        // For `.get(N)` we expect exactly one argument; for `.getInstance()`
        // we expect zero arguments.
        if (methodKind === 'getInstance' && r.value !== '') {
          return { ok: false, error: 'getInstance-takes-no-args' };
        }
        if (methodKind === 'get' && r.value === '') {
          return { ok: false, error: 'get-takes-one-arg' };
        }
        segments.push({ kind: methodKind, key: r.value });
        i = r.end;
      } else {
        if (FORBIDDEN.has(name.value)) return { ok: false, error: 'forbidden-segment' };
        segments.push({ kind: 'id', key: name.value });
        i = name.end;
      }
    } else if (c === '[') {
      const idx = readIndex(input, i);
      if (!idx) return { ok: false, error: 'bad-path' };
      segments.push({ kind: 'idx', key: idx.value });
      i = idx.end;
    } else {
      return { ok: false, error: 'bad-path' };
    }
  }

  return { ok: true, segments };
}

function readSegment(input, start) {
  SEG.lastIndex = start;
  const m = SEG.exec(input);
  if (!m || m.index !== start) return null;
  return { value: m[0], end: start + m[0].length };
}

function readIndex(input, start) {
  if (input[start] !== '[') return null;
  // numeric
  NUM_INDEX.lastIndex = start + 1;
  const nm = NUM_INDEX.exec(input);
  if (nm && nm.index === start + 1) {
    const after = start + 1 + nm[0].length;
    if (input[after] !== ']') return null;
    return { value: nm[0], end: after + 1 };
  }
  STR_INDEX_SINGLE.lastIndex = start + 1;
  const sm1 = STR_INDEX_SINGLE.exec(input);
  if (sm1 && sm1.index === start + 1) {
    const after = start + 1 + sm1[0].length;
    if (input[after] !== ']') return null;
    return { value: sm1[0].slice(1, -1), end: after + 1 };
  }
  STR_INDEX_DOUBLE.lastIndex = start + 1;
  const sm2 = STR_INDEX_DOUBLE.exec(input);
  if (sm2 && sm2.index === start + 1) {
    const after = start + 1 + sm2[0].length;
    if (input[after] !== ']') return null;
    return { value: sm2[0].slice(1, -1), end: after + 1 };
  }
  return null;
}

// Reads " ( arg ) " where `start` points at '(' and `arg` is one of:
//   - numeric (<digits>)
//   - single-quoted string ('...')
//   - double-quoted string ("...")
//   - empty (zero-arg call, e.g. `.getInstance()`); returns value=''
//
// Whitelisted by caller (currently `.get` and `.getInstance`).
function readCall(input, start) {
  // start points at '('
  if (input[start] !== '(') return null;
  // Zero-arg form: empty parens immediately close.
  if (input[start + 1] === ')') {
    return { value: '', end: start + 2 };
  }
  NUM_INDEX.lastIndex = start + 1;
  const nm = NUM_INDEX.exec(input);
  if (nm && nm.index === start + 1) {
    const after = start + 1 + nm[0].length;
    if (input[after] !== ')') return null;
    return { value: nm[0], end: after + 1 };
  }
  STR_INDEX_SINGLE.lastIndex = start + 1;
  const sm1 = STR_INDEX_SINGLE.exec(input);
  if (sm1 && sm1.index === start + 1) {
    const after = start + 1 + sm1[0].length;
    if (input[after] !== ')') return null;
    return { value: sm1[0].slice(1, -1), end: after + 1 };
  }
  STR_INDEX_DOUBLE.lastIndex = start + 1;
  const sm2 = STR_INDEX_DOUBLE.exec(input);
  if (sm2 && sm2.index === start + 1) {
    const after = start + 1 + sm2[0].length;
    if (input[after] !== ')') return null;
    return { value: sm2[0].slice(1, -1), end: after + 1 };
  }
  return null;
}
