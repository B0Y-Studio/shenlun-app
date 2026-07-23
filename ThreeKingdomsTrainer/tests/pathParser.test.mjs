import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePath } from '../trainer/main/pathParser.mjs';

const OK = [
  ['state.player.gold', ['state', 'player', 'gold']],
  ['cities[0].name', ['cities', '0', 'name']],
  [`units['cavalry'].count`, ['units', 'cavalry', 'count']],
  ['_a$.b', ['_a$', 'b']],
  ['arr[12]', ['arr', '12']],
];

const BAD = [
  '',
  '.',
  'a..b',
  '[0]',
  'a[',
  'a]',
  'a[]',
  'a[k]', // unquoted non-numeric index
  'a.__proto__',
  'a.constructor',
  'a.prototype',
  'a.Function',
  'a.eval',
  'a["a\\nb"]', // backslash in string index
  "a['\nb']",   // newline in string index
];

for (const [input, expected] of OK) {
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