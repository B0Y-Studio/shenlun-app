// Discovers likely state roots from `window` by scanning key names matching
// common patterns. Returns the list (also prints it for the CLI use case).

const CANDIDATE_RE = /^(gameStore|state|app|store|session|root|game|world|player)$/i;
// Field-name allowlist. `food|silver|funds|hp|economy|...` covers both the
// generic v1 list and the BLIND삼국-specific numeric fields we observed on
// economy-game cities (economy, agriculture, publicOrder, troops, soldiers).
const VALUE_KEY_RE = /^(gold|coins|money|rice|food|silver|funds|hp|maxHp|mp|treasury|population|soldiers|comrades|treasur|strength|cash|economy|agriculture|publicOrder|level|reputation|loyalty|popularity|morale|gold_?total|maxGold|food_?total|troops|reservedTroopsByType)$/i;

// Roots pass: keys on window whose name looks like a state object.
const PRINT_EXPR = `(function(){
  var keys = Object.keys(window).filter(function(k){ return /^${CANDIDATE_RE.source}/.test(k); });
  return JSON.stringify(keys);
})()`;

// v1.1 deep probe: in addition to plain roots, find singleton classes via
// `getInstance()` and walk one level into their public fields. Reports both
// plain-object hits and Map shapes as <root>.<field>[.get(k)].<field>=value.
//
// All walker code runs *inside* the IIFE, because Runtime.evaluate executes
// in the page context and cannot call Node-side helpers.
const SCAN_EXPR = `(function(){
  var hits = [];
  var seen = new Set();
  var VALUE_RE = /^(?:${VALUE_KEY_RE.source})$/i;

  function walkInto(v, path, depth) {
    if (depth > 4) return;
    if (v == null || seen.has(v)) return;
    if (hits.length > 200) return;
    if (typeof v !== 'object') return;
    seen.add(v);
    var ctorName = (v.constructor && v.constructor.name) || '';
    if (ctorName === 'Map') {
      var sample = Array.from(v.keys()).slice(0, 3).map(function(k){ return String(k); }).join(',');
      hits.push(path + ' (Map size=' + v.size + ' sample=' + sample + ')');
      // v1.1: peek into the first Map entry's numeric fields (already what
      // the trainer will read/apply).
      var firstKey = v.keys().next().value;
      if (firstKey !== undefined) {
        var firstVal = v.get(firstKey);
        if (firstVal && typeof firstVal === 'object') {
          var sampleFields = Object.keys(firstVal).filter(function(k){
            return VALUE_RE.test(k);
          }).slice(0, 8);
          for (var s = 0; s < sampleFields.length; s++) {
            var fk = sampleFields[s];
            var fv = firstVal[fk];
            if (typeof fv === 'number' || typeof fv === 'string' || typeof fv === 'boolean') {
              hits.push(path + '.get(' + JSON.stringify(String(firstKey)) + ').' + fk + '=' + String(fv));
            }
          }
          // v1.1: for the factions map specifically, dump each entry's
          // name + leaderId + gold/food so the trainer user can identify
          // their own faction at a glance.
          if (path.indexOf('factions') !== -1) {
            var fkeys = Array.from(v.keys());
            for (var f = 0; f < fkeys.length && f < 25; f++) {
              var fk = fkeys[f];
              var fv = v.get(fk);
              var nm = (fv && (fv.name || fv.displayName || fv.shortName)) || '?';
              var lid = (fv && fv.leaderId) || '?';
              hits.push(path + '.get(' + JSON.stringify(String(fk)) + ')  name=' + nm + '  leaderId=' + lid +
                         '  gold=' + String(fv.gold) + '  food=' + String(fv.food));
            }
          }
        }
      }
      return;
    }
    if (ctorName === 'Set') return;
    var keys = Object.keys(v);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var child;
      try { child = v[k]; } catch (e) { continue; }
      if (child == null) continue;
      var t = typeof child;
      if ((t === 'number' || t === 'string' || t === 'boolean') && VALUE_RE.test(k)) {
        hits.push(path + '.' + k + '=' + String(child));
      } else if (t === 'object' && !seen.has(child) && depth < 3 &&
                 child.constructor && child.constructor.name &&
                 child.constructor.name !== 'Array' &&
                 Object.keys(child).length < 80) {
        walkInto(child, path + '.' + k, depth + 1);
      }
    }
  }

  // 1) plain roots (v1)
  var plainRoots = Object.keys(window).filter(function(k){
    return /^${CANDIDATE_RE.source}/.test(k) && /^(object|function)$/.test(typeof window[k]);
  });
  for (var i = 0; i < plainRoots.length; i++) {
    walkInto(window[plainRoots[i]], plainRoots[i], 0);
  }

  // 2) singletons (v1.1) — try every capitalized function for getInstance().
  var wkeys = Object.keys(window);
  for (var j = 0; j < wkeys.length; j++) {
    var k = wkeys[j];
    if (!/^[A-Z]/.test(k)) continue;
    var v = window[k];
    if (typeof v !== 'function' || typeof v.getInstance !== 'function') continue;
    var inst;
    try { inst = v.getInstance(); } catch (e) { continue; }
    if (inst == null || seen.has(inst)) continue;
    walkInto(inst, k + '.getInstance()', 0);
  }

  return JSON.stringify(hits.slice(0, 30));
})()`;

export async function runSmoke(cdp) {
  await cdp.connect();
  const rootsJson = await cdp.eval(PRINT_EXPR);
  const scanJson = await cdp.eval(SCAN_EXPR);
  return {
    roots: JSON.parse(rootsJson),
    sampleHits: JSON.parse(scanJson),
  };
}

export const SMOKE_PRINT_EXPR = PRINT_EXPR;
export const SMOKE_SCAN_EXPR = SCAN_EXPR;
