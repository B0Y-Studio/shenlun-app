// src/llm/__tests__/judgeStore.test.ts
// judgeStore 在 MMKV 上做本地批改记录的 CRUD。
// 由于 jest 环境跑不了原生 MMKV，用 jest.mock 替换 mmkv 模块为内存 Map。

jest.mock('../../storage/mmkv', () => {
  const store = new Map<string, string>();
  const mmkv = {
    getStorage: () => ({
      set: (k: string, v: string) => store.set(k, v),
      getString: (k: string) => store.get(k) ?? undefined,
    }),
    setCachedArticles: () => {},
    getCachedArticles: () => [],
    getDeviceId: () => 'test-device-id',
    getReadIds: () => [],
    getReadHistory: () => [],
    getLocalNotes: () => [],
    __clearStore: () => store.clear(),
  };
  return mmkv;
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mmkvMock = require('../../storage/mmkv') as { __clearStore: () => void };

import {
  addLocalRecord,
  listLocalRecords,
  deleteLocalRecord,
  upsertLocalRecord,
  getLocalRecord,
  type LocalJudgeRecord,
} from '../judgeStore';

function fixture(overrides: Partial<LocalJudgeRecord> = {}): Omit<LocalJudgeRecord, 'id' | 'createdAt'> {
  return {
    questionId: 'q1',
    questionNo: '1',
    questionTitle: 'Title',
    questionScore: 20,
    totalScore: 15,
    raw: '{"total":15}',
    result: { commentary: '', total: 15, dimensions: [], highlights: [], weaknesses: [], rewrite_hint: '' },
    ...overrides,
  };
}

describe('judgeStore', () => {
  beforeEach(() => {
    mmkvMock.__clearStore();
  });
  it('addLocalRecord adds + persists a record', () => {
    const added = addLocalRecord(fixture());
    expect(added.id).toMatch(/^local-/);
    expect(typeof added.createdAt).toBe('number');
    const all = listLocalRecords();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe(added.id);
    expect(all[0].questionId).toBe('q1');
  });

  it('listLocalRecords returns the array (newest first)', () => {
    addLocalRecord(fixture({ questionNo: '1' }));
    addLocalRecord(fixture({ questionNo: '2' }));
    const all = listLocalRecords();
    expect(all.length).toBe(2);
    // unshift 保证最新在前
    expect(all[0].questionNo).toBe('2');
    expect(all[1].questionNo).toBe('1');
  });

  it('deleteLocalRecord removes the matching record', () => {
    const a = addLocalRecord(fixture({ questionNo: '1' }));
    const b = addLocalRecord(fixture({ questionNo: '2' }));
    deleteLocalRecord(a.id);
    const all = listLocalRecords();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe(b.id);
    // 再次删除不存在的 id 应是幂等
    deleteLocalRecord(a.id);
    expect(listLocalRecords().length).toBe(1);
  });

  it('upsertLocalRecord updates existing or inserts new', () => {
    const a = addLocalRecord(fixture({ questionNo: '1', totalScore: 10 }));
    // 已有 id → 更新 totalScore
    upsertLocalRecord({ ...a, totalScore: 18 });
    const updated = getLocalRecord(a.id);
    expect(updated?.totalScore).toBe(18);
    expect(listLocalRecords().length).toBe(1);
    // 新 id → 插入
    const newRec: LocalJudgeRecord = {
      ...fixture({ questionNo: '3', totalScore: 5 }),
      id: 'local-fresh9999',
      createdAt: Date.now(),
    };
    upsertLocalRecord(newRec);
    expect(listLocalRecords().length).toBe(2);
    expect(getLocalRecord('local-fresh9999')?.totalScore).toBe(5);
  });
});