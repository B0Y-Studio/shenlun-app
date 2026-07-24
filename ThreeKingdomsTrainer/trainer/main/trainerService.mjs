// Orchestrates: parsePath → build IIFE expression → cdpClient.eval
//
// The IIFEs embed (a) the parsed segments-as-data and (b) the JSON-encoded
// value directly into source text. We never concatenate the user's path
// into source — segments come from the parser as data (already JSON-safe)
// and are spliced as a JSON literal that the page walks via runtime code
// generated here.

import { parsePath } from './pathParser.mjs';
import { serializeScalar } from './safeSerialize.mjs';
import { CdpClient } from './cdpClient.mjs';
import { SAFE_READ_SOURCE, SAFE_WRITE_SOURCE } from './safeInjectScript.mjs';

/** @typedef {import('./cdpClient.mjs').CdpClient} Cdp */

/**
 * Encode parsed segments into a JS source string that walks `obj` through
 * each step, returning a new `obj`. Steps:
 *   - {kind:'id'|'idx'} → obj = obj[key]
 *   - {kind:'get'}      → obj = obj.get(key)
 *
 * The output is an expression that evaluates to the value walked to; it
 * embeds only JSON data (segments + value), no user-supplied source.
 *
 * @param {string} varName   name of the JS variable holding the starting value
 * @returns {string}         source expression fragment after `varName = `
 */
function walkExpr(varName, segmentsJson) {
  // Split into a small chain of statements emitted as source.
  // We hand-format this so the result is the most readable source we can
  // produce for chrome devtools to display alongside the eval call.
  return `var steps=${segmentsJson}; for (var i=0;i<steps.length;i++){ var s=steps[i]; if (${varName}==null) return { __error:'null-deref' }; ${varName} = (s.kind==='get') ? ${varName}.get(s.key) : ${varName}[s.key]; }`;
}

export class TrainerService {
  /** @param {Cdp} cdp */
  constructor(cdp) {
    this.cdp = cdp;
  }

  async ensureHelpersInjected() {
    await this.cdp.injectOnNewDocument(SAFE_READ_SOURCE);
    await this.cdp.injectOnNewDocument(SAFE_WRITE_SOURCE);
  }

  /** Read a path. Returns the raw value from `eval` (already JSON-friendly
   *  because of `returnByValue`). */
  async inspect(path) {
    const parsed = parsePath(path);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const segmentsJson = JSON.stringify(parsed.segments);
    const walk = walkExpr('o', segmentsJson);
    const expr = `(function(){ try { var o=window; ${walk}; return window.__trainerSafeRead(o); } catch (e) { return { __error: 'inspect-failed:' + String(e) }; } })()`;

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
