// Discovers likely state roots from `window` by scanning key names matching
// common patterns. Returns the list (also prints it for the CLI use case).

const CANDIDATE_RE = /^(gameStore|state|app|store|session|root|game|world|player)$/i;
const VALUE_KEY_RE = /^(gold|coins|money|rice|food|silver|funds|hp|maxHp|mp|treasury|population|soldiers|comrades|treasur|strength)$/i;

const PRINT_EXPR = `(function(){
  var keys = Object.keys(window).filter(function(k){ return ${CANDIDATE_RE.source}.test(k); });
  return JSON.stringify(keys);
})()`;

const SCAN_EXPR = `(function(){
  var roots = Object.keys(window).filter(function(k){ return ${CANDIDATE_RE.source}.test(k); });
  var hits = [];
  function walk(v, path, depth){
    if (depth > 6 || v == null) return;
    if (typeof v !== 'object') return;
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      var child = v[k];
      if (${VALUE_KEY_RE.source}.test(k) && typeof child !== 'object') {
        hits.push(path + '.' + k + '=' + String(child));
      } else if (typeof child === 'object') {
        walk(child, path + '.' + k, depth+1);
      }
    }
  }
  for (var i=0;i<roots.length;i++) {
    try { walk(window[roots[i]], roots[i], 0); } catch (e) {}
  }
  return JSON.stringify(hits.slice(0, 20));
})()`;

export async function runSmoke(cdp) {
  await cdp.connect();
  // Make sure helpers exist before any inspect/apply (smoke doesn't need them
  // but it primes the page for later calls).
  const rootsJson = await cdp.eval(PRINT_EXPR);
  const scanJson = await cdp.eval(SCAN_EXPR);
  return {
    roots: JSON.parse(rootsJson),
    sampleHits: JSON.parse(scanJson),
  };
}

export const SMOKE_PRINT_EXPR = PRINT_EXPR;
export const SMOKE_SCAN_EXPR = SCAN_EXPR;
