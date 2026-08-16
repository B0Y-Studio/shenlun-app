// src/llm/__tests__/runJudge.local.test.ts
// 独立模式（本地直连厂商）的 runJudge 行为验证：
// 1) 无本地配置 → no_config error 事件
// 2) 有配置 → 直连 OpenAI 兼容 endpoint（URL 拼接 + Bearer 头），
//    解析厂商 SSE（choices[0].delta.content）产出 delta / result 事件

// 必须在 import 被测模块前 mock（Hoisted 注释）
jest.mock('../../storage/mmkv', () => ({
  getStorage: () => null,
  getDeviceId: () => 'test-device-id',
  getCachedArticles: () => [],
  setCachedArticles: () => {},
  getReadIds: () => [],
  getReadHistory: () => [],
  getLocalNotes: () => [],
}));

jest.mock('../../config/dataMode', () => ({
  isLocalMode: () => true,
  getDataMode: () => 'local',
  setDataMode: () => {},
}));

// llmConfigStore 的返回值在用例里动态切换（无配置 / 有配置）
const storeState = { cfg: null as null | { provider: string; baseUrl: string; model: string; apiKey: string } };
jest.mock('../llmConfigStore', () => ({
  getLocalLlmConfig: () => storeState.cfg,
  saveLocalLlmConfig: () => {},
  deleteLocalLlmConfig: () => {},
  getLocalLlmConfigUpdatedAt: () => 0,
}));

import { runJudge, vendorChatUrl } from '../client';
import type { Question } from '../../api/client';

const mockQuestion: Question = {
  filename: 'test.md', id: 'q1', title: 'Test Question', body: 'Q body', score: 20,
  question_no: '1', question_no_int: 1, qa: 'q', source_paper_id: 'p1',
};
const answer50 = 'This is a test answer that is at least fifty characters long for judge.';

describe('vendorChatUrl 拼接', () => {
  it('裸域名补 /v1', () => {
    expect(vendorChatUrl('https://api.deepseek.com')).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(vendorChatUrl('https://api.openai.com/')).toBe('https://api.openai.com/v1/chat/completions');
  });
  it('已带版本段不再补 /v1（豆包 ark）', () => {
    expect(vendorChatUrl('https://ark.cn-beijing.volces.com/api/v3'))
      .toBe('https://ark.cn-beijing.volces.com/api/v3/chat/completions');
    expect(vendorChatUrl('https://x.example.com/v1'))
      .toBe('https://x.example.com/v1/chat/completions');
  });
});

describe('runJudge 本地直连（独立模式）', () => {
  afterEach(() => {
    // @ts-expect-error 测试环境存在 global.fetch（jest-environment-node 18+）
    if (global.fetch) global.fetch.mockRestore?.();
    storeState.cfg = null;
  });

  it('无本地配置 → no_config error', async () => {
    storeState.cfg = null;
    const events: any[] = [];
    for await (const e of runJudge(mockQuestion, answer50, 'dev', {})) events.push(e);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('error');
    expect(events[0].code).toBe('no_config');
  });

  it('有配置 → 直连厂商并解析 OpenAI SSE（delta + result）', async () => {
    storeState.cfg = {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKey: 'sk-test-local',
    };

    const chunks = [
      '{"commentary":"总评","total":16,"dimensions":[{"key":"theme","score":4,"comment":"扣题"}],"highlights":["a"],"weaknesses":["b"],"rewrite_hint":"c"}',
    ];
    const sseBody = [
      ...chunks.map(c => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`),
      'data: [DONE]\n\n',
    ].join('');
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );
    // @ts-expect-error 注入 global.fetch
    global.fetch = fetchMock;

    const events: any[] = [];
    for await (const e of runJudge(mockQuestion, answer50, 'dev', {})) events.push(e);

    // 请求侧：URL 拼接 + Authorization
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect((init as any).headers.Authorization).toBe('Bearer sk-test-local');
    const body = JSON.parse((init as any).body);
    expect(body.model).toBe('deepseek-chat');
    expect(body.stream).toBe(true);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('申论阅卷老师');
    expect(body.messages[1].role).toBe('user');

    // 事件侧：delta + result（JSON 已被 safeParseJudgeResult 解析）
    const deltas = events.filter(e => e.type === 'delta');
    const result = events.find(e => e.type === 'result');
    expect(deltas).toHaveLength(1);
    expect(deltas[0].text).toContain('"total":16');
    expect(result).toBeDefined();
    expect(result.result.total).toBe(16);
    expect(result.result.dimensions[0].key).toBe('theme');
    const errs = events.filter(e => e.type === 'error');
    expect(errs).toHaveLength(0);
  });
});