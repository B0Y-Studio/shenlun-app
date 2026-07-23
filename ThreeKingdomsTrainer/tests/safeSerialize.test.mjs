import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeScalar } from '../trainer/main/safeSerialize.mjs';

const OK = [
  [0, '0'],
  [-3.14, '-3.14'],
  ['', '""'],
  ['hello', '"hello"'],
  [true, 'true'],
  [false, 'false'],
  [null, 'null'],
];

const BAD = [
  [],
  {},
  [1, 2, 3],
  { a: 1 },
  undefined,
  NaN,
  Infinity,
  new Date(),
  () => 1,
];

for (const [input, expected] of OK) {
  test(`serializes ${JSON.stringify(input)}`, () => {
    const r = serializeScalar(input);
    assert.equal(r.ok, true);
    assert.equal(r.expr, expected);
  });
}

for (const input of BAD) {
  test(`rejects ${Object.prototype.toString.call(input)}`, () => {
    const r = serializeScalar(input);
    assert.equal(r.ok, false, `should reject ${input}`);
    assert.equal(r.error, 'scalar-only');
  });
}