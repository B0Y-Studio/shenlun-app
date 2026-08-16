// src/storage/__tests__/highlightsStore.test.ts
// highlightsStore 用内存 Map 模拟 MMKV getStorage，验证：
// 增/删/读、后标覆盖相交旧标、区间有序、text 快照。

jest.mock('../mmkv', () => {
  const mem = new Map<string, string>();
  return {
    getStorage: () => ({
      getString: (k: string) => mem.get(k),
      set: (k: string, v: string) => { mem.set(k, v); },
      delete: (k: string) => { mem.delete(k); },
    }),
    getDeviceId: () => 'test-device',
    getCachedArticles: () => [],
    setCachedArticles: () => {},
    getReadIds: () => [],
    getReadHistory: () => [],
    getLocalNotes: () => [],
  };
});

import { getHighlights, addHighlight, removeHighlight, countHighlights } from '../highlightsStore';

describe('highlightsStore', () => {
  it('add → get 返回区间与快照', () => {
    const h = addHighlight('a1', { start: 10, end: 20, color: '#FFE066', text: '答案是淋漓尽致的' });
    expect(h.createdAt).toBeGreaterThan(0);
    const list = getHighlights('a1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ start: 10, end: 20, color: '#FFE066', text: '答案是淋漓尽致的' });
  });

  it('后标覆盖相交旧标（含被完全包含/跨界三种）', () => {
    addHighlight('a2', { start: 0, end: 5, color: '#91D5FF', text: '01234' });
    addHighlight('a2', { start: 10, end: 15, color: '#A8E6A1', text: 'abcde' });
    // 新区间 [3,12] 与上面两条都相交 → 只剩它自己
    addHighlight('a2', { start: 3, end: 12, color: '#FFB3C6', text: '3..11' });
    const list = getHighlights('a2');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ start: 3, end: 12, color: '#FFB3C6' });
  });

  it('相邻不重叠的区间共存且按 start 有序', () => {
    addHighlight('a3', { start: 20, end: 25, color: '#FFE066', text: 'x' });
    addHighlight('a3', { start: 0, end: 5, color: '#A8E6A1', text: 'y' });
    addHighlight('a3', { start: 10, end: 12, color: '#FFC48C', text: 'z' });
    const list = getHighlights('a3');
    expect(list.map(h => h.start)).toEqual([0, 10, 20]);
  });

  it('零长度相接不算重叠（end == start）', () => {
    addHighlight('a4', { start: 0, end: 5, color: '#FFE066', text: 'q' });
    addHighlight('a4', { start: 5, end: 9, color: '#A8E6A1', text: 'w' });
    expect(getHighlights('a4')).toHaveLength(2);
  });

  it('removeHighlight 按 createdAt 删除；删空后不残留空数组', () => {
    const h = addHighlight('a5', { start: 0, end: 3, color: '#FFE066', text: 't' });
    expect(countHighlights()).toBeGreaterThan(0);
    removeHighlight('a5', h.createdAt);
    expect(getHighlights('a5')).toHaveLength(0);
  });

  it('不同文章互不干扰', () => {
    addHighlight('x', { start: 0, end: 1, color: '#FFE066', text: 'a' });
    addHighlight('y', { start: 0, end: 1, color: '#A8E6A1', text: 'b' });
    expect(getHighlights('x')).toHaveLength(1);
    expect(getHighlights('y')).toHaveLength(1);
  });
});