import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePath } from '../trainer/main/pathParser.mjs';

// Plain-object paths (v1 grammar)
const IDX_OK = [
  ['state.player.gold', [
    { kind: 'id', key: 'state' },
    { kind: 'id', key: 'player' },
    { kind: 'id', key: 'gold' },
  ]],
  ['cities[0].name', [
    { kind: 'id', key: 'cities' },
    { kind: 'idx', key: '0' },
    { kind: 'id', key: 'name' },
  ]],
  [`units['cavalry'].count`, [
    { kind: 'id', key: 'units' },
    { kind: 'idx', key: 'cavalry' },
    { kind: 'id', key: 'count' },
  ]],
  ['_a$.b', [
    { kind: 'id', key: '_a$' },
    { kind: 'id', key: 'b' },
  ]],
  ['arr[12]', [
    { kind: 'id', key: 'arr' },
    { kind: 'idx', key: '12' },
  ]],
  // Map.get call syntax (v1.1)
  ['world.cities.get(1).economy', [
    { kind: 'id', key: 'world' },
    { kind: 'id', key: 'cities' },
    { kind: 'get', key: '1' },
    { kind: 'id', key: 'economy' },
  ]],
  [`world.cities.get('capital')`, [
    { kind: 'id', key: 'world' },
    { kind: 'id', key: 'cities' },
    { kind: 'get', key: 'capital' },
  ]],
  // Singleton getInstance (v1.1 follow-up)
  ['EconomyEngine.getInstance().world.factions.get("FACTION_1534").gold', [
    { kind: 'id', key: 'EconomyEngine' },
    { kind: 'getInstance', key: '' },
    { kind: 'id', key: 'world' },
    { kind: 'id', key: 'factions' },
    { kind: 'get', key: 'FACTION_1534' },
    { kind: 'id', key: 'gold' },
  ]],
];

const BAD = [
  '',
  '.',
  'a..b',
  '[0]',
  'a[',
  'a]',
  'a[]',
  'a[k]',
  'a.__proto__',
  'a.constructor',
  'a.prototype',
  'a.Function',
  'a.eval',
  'a["a\\nb"]',
  "a['\nb']",
  // v1.1 — method calls only allow `.get(` and `.getInstance(`
  'world.set(1)',
  'world.foo(1)',
  'world.get(',         // unterminated
  'world.get()',        // empty arg (used to be valid for getInstance, now reserved)
  'world.get(1',        // missing close paren
  'world.get(a)',       // non-literal arg
  'EconomyEngine.getInstance(1)',  // getInstance takes no args
  'EconomyEngine.getInstance("x")', // getInstance takes no args
];

for (const [input, expected] of IDX_OK) {
  test(`parses ${JSON.stringify(input)}`, () => {
    assert.deepEqual(parsePath(input), { ok: true, segments: expected });
  });
}

for (const input of BAD) {
  test(`rejects ${JSON.stringify(input)}`, () => {
    const r = parsePath(input);
    assert.equal(r.ok, false, `should reject ${input}`);
  });
}
