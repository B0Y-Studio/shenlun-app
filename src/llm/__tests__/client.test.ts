// ShenlunApp/src/llm/__tests__/client.test.ts

// Mock the Nitro-based mmkv v4 so the import chain in src/llm/client.ts
// (which transitively imports src/storage/mmkv) does not try to resolve
// the NitroModules TurboModule (no native binary in Jest).
jest.mock('../../storage/mmkv', () => {
  const mem = new Map();
  const instance = {
    id: 'shenlun-storage',
    set: (k, v) => mem.set(k, v),
    getString: (k) => (typeof mem.get(k) === 'string' ? mem.get(k) : undefined),
    getNumber: (k) => (typeof mem.get(k) === 'number' ? mem.get(k) : undefined),
    getBoolean: (k) => (typeof mem.get(k) === 'boolean' ? mem.get(k) : undefined),
    contains: (k) => mem.has(k),
    delete: (k) => mem.delete(k),
    clearAll: () => mem.clear(),
    getAllKeys: () => Array.from(mem.keys()),
  };
  return {
    getStorage: () => instance,
    getDeviceId: () => 'test-device-id',
    getCachedArticles: () => [],
    setCachedArticles: () => {},
    getReadIds: () => [],
    markRead: () => {},
    getReadHistory: () => [],
    countReadInList: () => 0,
    countReadsInWindow: () => 0,
    getLocalNotes: () => [],
    addLocalNote: () => {},
    deleteLocalNote: () => {},
  };
});

import { extractJsonByBraceDepth, safeParseJudgeResult } from '../client';

describe('extractJsonByBraceDepth', () => {
  it('returns null when no brace', () => {
    expect(extractJsonByBraceDepth('hello')).toEqual({ json: null, start: -1, end: -1 });
  });

  it('extracts simple object', () => {
    const r = extractJsonByBraceDepth('prefix {"a":1} suffix');
    expect(r.json).toBe('{"a":1}');
  });

  it('handles nested objects', () => {
    const r = extractJsonByBraceDepth('x {"a":{"b":2},"c":3} y');
    expect(r.json).toBe('{"a":{"b":2},"c":3}');
  });

  it('handles braces inside strings', () => {
    const r = extractJsonByBraceDepth('x {"a":"{not}"} y');
    expect(r.json).toBe('{"a":"{not}"}');
  });

  it('handles escaped quotes', () => {
    const r = extractJsonByBraceDepth('x {"a":"he said \\"hi\\""} y');
    expect(r.json).toBe('{"a":"he said \\"hi\\""}');
  });

  it('returns null when not closed', () => {
    const r = extractJsonByBraceDepth('x {"a":1');
    expect(r.json).toBeNull();
  });
});

describe('safeParseJudgeResult', () => {
  it('parses valid result', () => {
    const raw = '{"commentary":"好","total":18,"dimensions":[{"key":"theme","score":5,"comment":"扣题"}],"highlights":["a"],"weaknesses":["b"],"rewrite_hint":"x"}';
    const r = safeParseJudgeResult(raw);
    expect(r?.total).toBe(18);
    expect(r?.dimensions[0].key).toBe('theme');
  });

  it('returns null on bad json', () => {
    expect(safeParseJudgeResult('not json')).toBeNull();
  });

  it('returns defaults on missing fields', () => {
    const r = safeParseJudgeResult('{"total":5}');
    expect(r?.commentary).toBe('');
    expect(r?.dimensions).toEqual([]);
    expect(r?.highlights).toEqual([]);
  });
});
