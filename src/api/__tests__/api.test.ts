// src/api/__tests__/api.test.ts
// mapArticle 把后端返回的 card 字段映射成前端 Article：
// - id 退回 file_path / title（前端用 file_path 作主键）
// - chapter 取 tags[0]
// - content 退回 norm
// - 其他字段空值用空串兜底
//
// 重点：测试在缺字段时的 fallback，而不是依赖完整字段。

jest.mock('../../storage/mmkv', () => ({
  getStorage: () => null,
  getDeviceId: () => 'test-device-id',
  getCachedArticles: () => [],
  setCachedArticles: () => {},
  getReadIds: () => [],
  getReadHistory: () => [],
  getLocalNotes: () => [],
}));

jest.mock('../../config/api', () => ({ API_BASE: 'http://test.local' }));

import { mapArticle } from '../client';

describe('mapArticle', () => {
  it('populates all fields when card has full payload', () => {
    const card = {
      id: 'card-1',
      norm: 'normalized-title',
      title: 'Full Article Title',
      date: '2026-01-15',
      content: '<p>full body</p>',
      source: 'shenlun',
      author: 'Author X',
      tags: ['theme-a', 'theme-b'],
      highlight: 'key phrase',
      file_path: 'a/b/c.md',
    };
    const a = mapArticle(card);
    expect(a.id).toBe('card-1');
    expect(a.title).toBe('Full Article Title');
    expect(a.date).toBe('2026-01-15');
    expect(a.content).toBe('<p>full body</p>');
    expect(a.source).toBe('shenlun');
    expect(a.author).toBe('Author X');
    expect(a.chapter).toBe('theme-a');
    expect(a.highlight).toBe('key phrase');
    expect(a.norm).toBe('normalized-title');
  });

  it('falls back to safe defaults when fields are missing', () => {
    // 只有 id + title，其余字段都缺 —— 验证 fallback 链
    const card = { id: 'card-only-id', title: 'Minimal' };
    const a = mapArticle(card);
    expect(a.id).toBe('card-only-id');
    expect(a.title).toBe('Minimal');
    expect(a.date).toBeUndefined();
    expect(a.content).toBe('');         // content 缺 → 退回 norm，norm 也缺 → ''
    expect(a.source).toBe('');
    expect(a.author).toBe('');
    expect(a.chapter).toBe('');         // tags 缺 → ''
    expect(a.highlight).toBe('');
    expect(a.norm).toBe('');

    // 没有 id：fallback 到 title
    const byTitle = mapArticle({ title: 'Only Title' });
    expect(byTitle.id).toBe('Only Title');

    // 没有 id / title / file_path —— 返回 undefined（透传）
    const empty = mapArticle({});
    expect(empty.id).toBeUndefined();
    expect(empty.title).toBeUndefined();
  });
});