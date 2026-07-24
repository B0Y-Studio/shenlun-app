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
 *   - {kind:'id'|'idx'}                       → obj = obj[key]
 *   - {kind:'get', argKind:'num', key:'1009'} → obj = obj.get(1009)
 *   - {kind:'get', argKind:'str', key:'x'}    → obj = obj.get("x")
 *   - {kind:'getInstance'}                    → obj = obj.getInstance()
 *
 * The output is an expression that evaluates to the value walked to; it
 * embeds only JSON data (segments + value), no user-supplied source.
 */
function walkExpr(varName, segmentsJson) {
  return `var steps=${segmentsJson}; for (var i=0;i<steps.length;i++){ var s=steps[i]; if (${varName}==null) return { __error:'null-deref' }; if (s.kind==='getInstance') ${varName} = ${varName}.getInstance(); else if (s.kind==='get') ${varName} = ${varName}.get(s.argKind==='num' ? Number(s.key) : s.key); else ${varName} = ${varName}[s.key]; }`;
}

export class TrainerService {
  /** @param {Cdp} cdp */
  constructor(cdp) {
    this.cdp = cdp;
  }

  async ensureHelpersInjected() {
    // 1) Register the source so future documents (route changes, reloads)
    //    also have the helpers wired up. Page.addScriptToEvaluateOnNewDocument
    //    only runs the source on subsequent document creation — it does NOT
    //    execute against the already-loaded page.
    await this.cdp.injectOnNewDocument(SAFE_READ_SOURCE);
    await this.cdp.injectOnNewDocument(SAFE_WRITE_SOURCE);
    // 2) Also evaluate the source *now* via Runtime.evaluate so the
    //    currently-loaded page has `window.__trainerSafeRead` etc. defined.
    //    Page.addScriptToEvaluateOnNewDocument alone is insufficient
    //    because the game was already running before connect.
    await this.cdp.eval(SAFE_READ_SOURCE);
    await this.cdp.eval(SAFE_WRITE_SOURCE);
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
