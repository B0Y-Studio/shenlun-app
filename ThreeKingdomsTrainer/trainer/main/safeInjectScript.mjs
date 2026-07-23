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

// segments is a plain JS array of strings (parsed by the Node-side pathParser).
// We do not re-parse segments here — the path grammar is enforced server-side.
export const SAFE_WRITE_SOURCE = `
window.__trainerSafeWrite = function writeLeaf(segments, value) {
  try {
    if (!Array.isArray(segments) || segments.length === 0) {
      return { __error: 'bad-path' };
    }
    var o = window;
    for (var i = 0; i < segments.length - 1; i++) {
      if (o == null) return { __error: 'null-deref' };
      o = o[segments[i]];
    }
    if (o == null) return { __error: 'null-parent' };
    var last = segments[segments.length - 1];
    var proto = Object.getPrototypeOf(o);
    var desc = proto ? Object.getOwnPropertyDescriptor(proto, last)
                      : Object.getOwnPropertyDescriptor(o, last);
    if (desc && desc.writable === false) return { __error: 'not-writable' };
    if (desc && typeof desc.set === 'function') return { __error: 'has-setter' };
    o[last] = value;
    return window.__trainerSafeRead(o[last]);
  } catch (e) {
    return { __error: 'write-failed:' + String(e) };
  }
};
`;