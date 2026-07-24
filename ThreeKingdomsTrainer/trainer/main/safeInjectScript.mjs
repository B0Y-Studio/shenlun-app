// Source strings injected into the page via Page.addScriptToEvaluateOnNewDocument
// once CDP is connected. They live as constants so they're easy to audit.
//
// These helpers implement the path-walk + write guard logic that the spec
// (§3.3) calls for:
//   - __trainerSafeRead(value)         — convert any value to a JSON-safe snapshot
//   - __trainerSafeWrite(segments, v)  — walk segments to a parent, verify the
//                                        last segment is writable, then assign
//
// Returning a JSON-friendly error object (with `__error`) lets the Node-side
// TrainerService (Task 6) surface a real cause rather than catching the generic
// string exception that JS would otherwise produce.

export const SAFE_READ_NAME = '__trainerSafeRead';
export const SAFE_WRITE_NAME = '__trainerSafeWrite';

export const SAFE_READ_SOURCE = `
window.__trainerSafeRead = function readLeaf(value) {
  try {
    if (value === null) return null;
    if (value === undefined) return undefined;
    var t = typeof value;
    if (t === 'number' || t === 'string' || t === 'boolean') return value;
    if (t === 'bigint') return value.toString();
    return { __safe_object: true, kind: t };
  } catch (e) {
    return { __error: 'read-failed:' + String(e) };
  }
};
`;

// segments is a parsed-path array of `{kind, key}` steps. We do not re-parse
// segments here — the path grammar is enforced server-side. Steps can use
// either `obj[key]` (plain object) or `obj.get(key)` (Map / collection);
// see trainerService.mjs#walkExpr for the matching reader walk.
export const SAFE_WRITE_SOURCE = `
window.__trainerSafeWrite = function writeLeaf(segments, value) {
  try {
    if (!Array.isArray(segments) || segments.length === 0) {
      return { __error: 'bad-path' };
    }
    var o = window;
    // Walk to the parent of the leaf.
    for (var i = 0; i < segments.length - 1; i++) {
      if (o == null) return { __error: 'null-deref' };
      var s = segments[i];
      o = (s.kind === 'get') ? o.get(s.key) : o[s.key];
    }
    if (o == null) return { __error: 'null-parent' };
    var last = segments[segments.length - 1];
    if (last.kind === 'get') {
      // Writing through .get(N) is not meaningful for Map; the user almost
      // certainly meant to mutate the value at that key. Refuse rather than
      // silently no-op.
      return { __error: 'cannot-write-through-get' };
    }
    var proto = Object.getPrototypeOf(o);
    var desc = proto ? Object.getOwnPropertyDescriptor(proto, last.key)
                      : Object.getOwnPropertyDescriptor(o, last.key);
    if (desc && desc.writable === false) return { __error: 'not-writable' };
    if (desc && typeof desc.set === 'function') return { __error: 'has-setter' };
    o[last.key] = value;
    return window.__trainerSafeRead(o[last.key]);
  } catch (e) {
    return { __error: 'write-failed:' + String(e) };
  }
};
`;