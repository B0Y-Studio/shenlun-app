// src/llm/__tests__/runJudge.test.ts
// runJudge 是 SSE 流式消费 + AbortController 协作的生成器函数。
// 这里通过 mock 全局 fetch 构造不同的 Response，验证三种路径：
// 1) 中途 abort → AbortError 被静默吞掉，不产生 error 事件
// 2) 正常 [DONE] → 产生一个 result 事件（含解析后的 JudgeResult）
// 3) HTTP 5xx → 产生一个 error 事件

import { runJudge } from '../client';
import type { Question } from '../../api/client';

// === mock storage ===
// runJudge -> client.ts -> getDeviceId() -> ../../storage/mmkv -> react-native-mmkv
// 用 jest.mock 替换掉 mmkv 模块，避免原生依赖加载失败。

jest.mock('../../storage/mmkv', () => ({
  getStorage: () => null,
  getDeviceId: () => 'test-device-id',
  getCachedArticles: () => [],
  setCachedArticles: () => {},
  getReadIds: () => [],
  getReadHistory: () => [],
  getLocalNotes: () => [],
}));

// === helpers ===

const mockQuestion: Question = {
  filename: 'test.md',
  id: 'q1',
  title: 'Test Question',
  body: 'Q body content',
  score: 20,
  question_no: '1',
  question_no_int: 1,
  qa: 'q',
  source_paper_id: 'p1',
};

const mockAnswer =
  'This is a test answer that is at least fifty characters long for the judge to evaluate properly.';

function makeSseStream(payloads: string[]): Response {
  // SSE 帧以 \n\n 分隔。每个 payload 包成 "data: <payload>\n\n"
  const body =
    payloads.map(p => `data: ${p}\n\n`).join('') + 'data: [DONE]\n\n';
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // 单帧喂入（不分块），避免 split 边界切到帧中间
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function makeAbortStream(): Response {
  // 模拟 AbortController 在 RN 环境中发出的 abort 信号。
  // 在 RN 里 abort 抛出的实际是 DOMException，不继承自 Error，
  // 因此必须用 `.name === 'AbortError'` 判定，不能依赖 `instanceof Error`。
  // 这里用 plain object 模拟 DOMException-shape（非 Error 子类）来覆盖该路径。
  const abortError: { name: string; message: string } = {
    name: 'AbortError',
    message: 'aborted',
  };
  const stream = new ReadableStream({
    pull(controller) {
      controller.error(abortError);
    },
  });
  return new Response(stream, { status: 200 });
}

function makeErrorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// === tests ===

describe('runJudge', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('absorbs AbortError silently during stream', async () => {
    global.fetch = jest.fn(() => Promise.resolve(makeAbortStream())) as unknown as typeof fetch;

    const events: Array<{ type: string }> = [];
    for await (const evt of runJudge(mockQuestion, mockAnswer, 'dev-1', {
      signal: new AbortController().signal,
    })) {
      events.push({ type: evt.type });
    }

    // 流被 abort 时：不会有 error 事件被 yield 出来（AbortError 被静默吞掉）
    expect(events.some(e => e.type === 'error')).toBe(false);
    // 也不应该有 result 事件（流未正常 DONE）
    expect(events.some(e => e.type === 'result')).toBe(false);
  });

  it('yields result event on [DONE]', async () => {
    // SSE 流的实际形态：服务端先发多个 `data: {"delta":"..."}` 帧拼接成完整文本，
    // 最后发 `data: [DONE]`。runJudge 在遇到 [DONE] 时调用 safeParseJudgeResult
    // 从累计 fullText 中提取 JSON。
    const judgeJson = JSON.stringify({
      commentary: 'Looks good',
      total: 15,
      dimensions: [{ key: 'theme', score: 5, comment: 'ok' }],
      highlights: ['strong opening'],
      weaknesses: ['weak ending'],
      rewrite_hint: 'Tighten the conclusion',
    });
    // 把整段 JSON 切成多个 delta 字段，每个字段独立 JSON 序列化
    const chunkSize = 30;
    const deltas: string[] = [];
    for (let i = 0; i < judgeJson.length; i += chunkSize) {
      deltas.push(JSON.stringify({ delta: judgeJson.slice(i, i + chunkSize) }));
    }
    global.fetch = jest.fn(() =>
      Promise.resolve(makeSseStream(deltas)),
    ) as unknown as typeof fetch;

    const events: Array<{ type: string; payload?: unknown }> = [];
    for await (const evt of runJudge(mockQuestion, mockAnswer, 'dev-2')) {
      events.push({ type: evt.type, payload: evt });
    }

    const resultEvt = events.find(e => e.type === 'result');
    expect(resultEvt).toBeDefined();
    const payload = resultEvt?.payload as { result: { total: number; commentary: string } | null };
    expect(payload.result).not.toBeNull();
    expect(payload.result?.total).toBe(15);
    expect(payload.result?.commentary).toBe('Looks good');
  });

  it('yields error event on HTTP failure', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(makeErrorResponse(503, { error: 'service unavailable' })),
    ) as unknown as typeof fetch;

    const events: Array<{ type: string; payload?: unknown }> = [];
    for await (const evt of runJudge(mockQuestion, mockAnswer, 'dev-3')) {
      events.push({ type: evt.type, payload: evt });
    }

    const errorEvt = events.find(e => e.type === 'error');
    expect(errorEvt).toBeDefined();
    const payload = errorEvt?.payload as { code: string; message: string };
    expect(payload.code).toBe('http_503');
    expect(payload.message).toBe('service unavailable');
  });
});