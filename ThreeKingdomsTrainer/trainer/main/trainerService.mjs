// Orchestrates: parsePath → build IIFE expression → cdpClient.eval
//
// The IIFEs embed (a) the parsed segments and (b) the JSON-encoded value
// directly into source text. We deliberately do NOT concatenate the user's
// path into source — segments come from the parser as plain strings and
// are spliced as data, not as code.

import { parsePath } from './pathParser.mjs';
import { serializeScalar } from './safeSerialize.mjs';
import { CdpClient } from './cdpClient.mjs';
import { SAFE_READ_SOURCE, SAFE_WRITE_SOURCE } from './safeInjectScript.mjs';

/** @typedef {import('./cdpClient.mjs').CdpClient} Cdp */

export class TrainerService {
  /** @param {Cdp} cdp */
  constructor(cdp) {
    this.cdp = cdp;
  }

  async ensureHelpersInjected() {
    // Idempotent — Page.addScriptToEvaluateOnNewDocument returns a fresh id
    // each call. We rely on the fact that re-injection is harmless; the
    // helpers just get re-defined.
    await this.cdp.injectOnNewDocument(SAFE_READ_SOURCE);
    await this.cdp.injectOnNewDocument(SAFE_WRITE_SOURCE);
  }

  /** Read a path. Returns the raw value from `eval` (already JSON-friendly
   *  because of `returnByValue`). */
  async inspect(path) {
    const parsed = parsePath(path);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const segmentsJson = JSON.stringify(parsed.segments);
    const expr = `(function(){ try { var s=${segmentsJson}; var o=window; for (var i=0;i<s.length;i++){ if (o==null) return { __error:'null-deref' }; o = o[s[i]]; } return window.__trainerSafeRead(o); } catch (e) { return { __error: String(e) }; } })()`;

    try {
      const value = await this.cdp.eval(expr);
      if (value && typeof value === 'object' && value.__error) {
        return { ok: false, error: value.__error };
      }
      return { ok: true, value };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  /** Write a scalar. Verifies target writability via descriptor before
   *  assigning. */
  async apply(path, rawValue) {
    const parsed = parsePath(path);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const ser = serializeScalar(rawValue);
    if (!ser.ok) return { ok: false, error: ser.error };

    const segmentsJson = JSON.stringify(parsed.segments);
    const valueLiteral = ser.expr;
    // Delegate the path walk + writability check + assignment to the
    // __trainerSafeWrite helper injected on every new document by
    // ensureHelpersInjected(). This keeps the IIFE here small and avoids
    // duplicating the path-walk logic in two places.
    const expr = `(function(){ try { return window.__trainerSafeWrite(${segmentsJson}, ${valueLiteral}); } catch (e) { return { __error: 'write-failed:' + String(e) }; } })()`;

    try {
      const value = await this.cdp.eval(expr);
      if (value && typeof value === 'object' && value.__error) {
        return { ok: false, error: value.__error };
      }
      return { ok: true, value };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }
}