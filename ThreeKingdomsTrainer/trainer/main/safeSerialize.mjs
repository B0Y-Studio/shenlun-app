// Only JSON scalars in v1. Anything else → { ok:false, error:'scalar-only' }.
//
// Returns the JS source expression that, when evaluated in the page,
// reproduces the value (with the same primitive type and value).

export function serializeScalar(value) {
  if (value === null) return { ok: true, expr: 'null' };
  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value)) return { ok: false, error: 'scalar-only' };
    return { ok: true, expr: JSON.stringify(value) };
  }
  if (t === 'string') return { ok: true, expr: JSON.stringify(value) };
  if (t === 'boolean') return { ok: true, expr: String(value) };
  return { ok: false, error: 'scalar-only' };
}