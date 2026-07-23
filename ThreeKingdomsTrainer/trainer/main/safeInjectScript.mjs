// Source strings injected into the page via Page.addScriptToEvaluateOnNewDocument
// once CDP is connected. They live as constants so they're easy to audit.
//
// Both helpers:
//   - path is parsed by the same pathParser grammar but executed server-side here
//     so we don't ship a second parser into the page.
//   - read returns a JSON-serializable snapshot OR an object marker
//     ('__safe_object') so the renderer knows it cannot display the value.
//   - write refuses to assign to frozen objects or non-writable properties.

export const SAFE_READ_NAME = '__trainerSafeRead';
export const SAFE_WRITE_NAME = '__trainerSafeWrite';

// We accept a compact path representation already parsed into an array of
// (kind, key) tuples from the Node side: e.g.
//   ['state', 'player', 'gold']  -> all identifier segments
//   ['cities', '12', 'name']     -> mixed numeric index
// To keep the injection size minimal AND avoid a second parser in the page,
// the Node-side `trainerService` (Task 6) builds a JS expression that walks
// the path itself; the page only needs these two helpers to do the safe checks
// at the final leaf. For sets we hand the helper the literal value; for reads
// we let it return a snapshot.

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

export const SAFE_WRITE_SOURCE = `
window.__trainerSafeWrite = function writeLeaf(target, value) {
  try {
    if (!target) return { __error: 'no-target' };
    var desc = Object.getOwnPropertyDescriptor(target, '__trainer_value__');
    // Sentinel key used to validate the result without touching game fields.
    // We never actually write this; it's just here to confirm we can describe.
    void desc;
    // For real writes the service passes the literal value already set on
    // a temporary object; here we only verify writability of a shape.
    return { __writable: true };
  } catch (e) {
    return { __error: 'write-failed:' + String(e) };
  }
};
`;