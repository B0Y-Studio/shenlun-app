// ShenlunApp/src/llm/client.ts
import { getDeviceId } from '../storage/mmkv';
import type { Question } from '../api/client';
import { isLocalMode } from '../config/dataMode';
import { getLocalLlmConfig } from './llmConfigStore';

import { API_BASE as BASE } from '../config/api';
import { fetchWithTimeout } from '../api/fetchWithTimeout';

export interface JudgeDimension { key: string; score: number; comment: string }
export interface JudgeResult {
  commentary: string;
  total: number;
  dimensions: JudgeDimension[];
  highlights: string[];
  weaknesses: string[];
  rewrite_hint: string;
}

export type JudgeEvent =
  | { type: 'delta'; text: string }
  | { type: 'result'; result: JudgeResult | null; raw: string }
  | { type: 'error'; code: string; message: string };

/** 按括号深度从 text 中切出第一个完整顶层 {...} */
export function extractJsonByBraceDepth(text: string): { json: string | null; start: number; end: number } {
  const start = text.indexOf('{');
  if (start < 0) return { json: null, start: -1, end: -1 };
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { json: text.slice(start, i + 1), start, end: i + 1 };
    }
  }
  return { json: null, start, end: -1 };
}

export function safeParseJudgeResult(raw: string, maxScore: number = 100): JudgeResult | null {
  const { json } = extractJsonByBraceDepth(raw);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<JudgeResult>;
    const total = Math.max(0, Math.min(maxScore, Number(o.total ?? 0)));
    return {
      commentary: typeof o.commentary === 'string' ? o.commentary : '',
      total,
      dimensions: Array.isArray(o.dimensions) ? o.dimensions.map(d => ({
        key: String(d.key ?? ''),
        score: Number(d.score ?? 0),
        comment: String(d.comment ?? ''),
      })) : [],
      highlights: Array.isArray(o.highlights) ? o.highlights.map(String) : [],
      weaknesses: Array.isArray(o.weaknesses) ? o.weaknesses.map(String) : [],
      rewrite_hint: typeof o.rewrite_hint === 'string' ? o.rewrite_hint : '',
    };
  } catch {
    return null;
  }
}

// ============================================================
// 独立模式：App 直连 LLM 厂商（OpenAI 兼容 SSE），不经服务器。
// Key 存本机（llmConfigStore），prompt 复刻自服务端
// card_server.py 的 _build_system_prompt / _build_user_prompt。
// ============================================================

/** OpenAI 兼容 endpoint：豆包(ark)的 baseUrl 以 /api/v3 结尾时不再加 /v1 */
export function vendorChatUrl(baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/+$/, '');
  if (/\/(v\d+|api\/v\d+)$/.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

function buildJudgeSystemPrompt(score: number): string {
  const s = int(score) || 20;
  const w = (p: number) => Math.round(s * p);
  return `你是申论阅卷老师。用户提交了一道申论题答案，请按官方评分维度评判并以严格 JSON 返回。

维度与权重（按题目分值等比缩放，本题总分为 ${s} 分）：
- 立意 (25%): 是否扣题、观点是否明确、是否切合题意
- 结构 (20%): 是否总分/并列/递进，开头结尾是否呼应，段落逻辑是否清晰
- 论据 (25%): 是否充实、是否结合材料/时政/案例、数据是否准确
- 语言 (20%): 表达是否规范、是否书面化、有无语病/口语化
- 字数 (10%): 是否达到题目要求（一般 ≥ 800 字达标）

输出格式（**只返回 JSON，不要任何其他文字，不要用 \`\`\`json 包裹**）：
{
  "commentary": "<一段流式评语，长度 200-400 字>",
  "total": <0-${s}>,
  "dimensions": [
    {"key": "theme",    "score": <0-${w(0.25)}>, "comment": "<一句话点评>"},
    {"key": "structure","score": <0-${w(0.20)}>, "comment": "<一句话点评>"},
    {"key": "argument", "score": <0-${w(0.25)}>, "comment": "<一句话点评>"},
    {"key": "language", "score": <0-${w(0.20)}>, "comment": "<一句话点评>"},
    {"key": "wordcount","score": <0-${w(0.10)}>, "comment": "<一句话点评>"}
  ],
  "highlights": ["<亮点1>", "<亮点2>", "<亮点3>"],
  "weaknesses": ["<不足1>", "<不足2>", "<不足3>"],
  "rewrite_hint": "<一段话：建议重写方向，100-200 字>"
}`;
}

function buildJudgeUserPrompt(question: Question, userAnswer: string): string {
  const full = question.body || '';
  const body = full.length > 300 ? `${full.slice(0, 300)}...` : full;
  const n = userAnswer.length;
  return `题目：${question.title || ''}
分值：${question.score ?? ''} 分
题型：申论

题干（节选）：
${body}

用户答案（${n} 字）：
${userAnswer}

请按 System Prompt 中定义的维度评判并只返回 JSON。`;
}

function int(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 独立模式直连：解析厂商 OpenAI 兼容 SSE（choices[0].delta.content） */
async function* runJudgeDirect(
  question: Question,
  userAnswer: string,
  opts: { signal?: AbortSignal },
): AsyncGenerator<JudgeEvent> {
  const cfg = getLocalLlmConfig();
  if (!cfg) {
    yield { type: 'error', code: 'no_config', message: '未配置 LLM（请在设置 → AI 评卷 · LLM 配置 中填写）' };
    return;
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(vendorChatUrl(cfg.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: buildJudgeSystemPrompt(question.score) },
          { role: 'user', content: buildJudgeUserPrompt(question, userAnswer) },
        ],
        stream: true,
        temperature: 0.3,
      }),
      signal: opts.signal,
    }, 180_000);
  } catch (e: unknown) {
    if (!e || (e as { name?: string })?.name === 'AbortError') return;
    yield { type: 'error', code: 'network', message: e instanceof Error ? e.message : String(e) };
    return;
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = (j as { error?: { message?: string } }).error?.message || (j as { error?: string }).error || msg;
    } catch { /* ignore */ }
    yield { type: 'error', code: `http_${res.status}`, message: msg };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: 'error', code: 'no_body', message: 'response body is null' };
    return;
  }
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let fullText = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n\n')) >= 0) {
        const evt = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        // 厂商 SSE：每行一个 data: {...}（可能多行，取所有 data: 行）
        for (const lineRaw of evt.split('\n')) {
          if (!lineRaw.startsWith('data:')) continue;
          const payload = lineRaw.slice(5).trim();
          if (payload === '[DONE]') continue; // 结束由外层流 done 处理
          try {
            const obj = JSON.parse(payload);
            if (obj.error) {
              yield { type: 'error', code: 'upstream', message: String(obj.error.message ?? obj.error) };
              return;
            }
            const delta: string = ((obj.choices ?? [{}])[0]).delta?.content ?? '';
            if (delta) {
              fullText += delta;
              yield { type: 'delta', text: delta };
            }
          } catch {
            // 忽略非 JSON 行（注释/心跳）
          }
        }
      }
    }
  } catch (e: unknown) {
    if (!e || (e as { name?: string })?.name !== 'AbortError') {
      yield { type: 'error', code: 'stream', message: e instanceof Error ? e.message : String(e) };
    }
    return;
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
  const result = safeParseJudgeResult(fullText, question.score);
  yield { type: 'result', result, raw: fullText };
}

/** 独立模式的"测试连接"：直连厂商最小非流式调用 */
export async function testLlmConnectionDirect(): Promise<{ ok: boolean; status: number }> {
  const cfg = getLocalLlmConfig();
  if (!cfg) return { ok: false, status: 0 };
  try {
    const r = await fetchWithTimeout(vendorChatUrl(cfg.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    }, 30_000);
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function* runJudge(
  question: Question,
  userAnswer: string,
  deviceId: string = getDeviceId(),
  opts: { signal?: AbortSignal; onDelta?: (t: string) => void } = {},
): AsyncGenerator<JudgeEvent> {
  // 独立模式：App 直连 LLM 厂商（服务器代理路径保留在下方）
  if (isLocalMode()) {
    yield* runJudgeDirect(question, userAnswer, { signal: opts.signal });
    return;
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BASE}/api/judge/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        question: {
          id: question.id,
          title: question.title,
          body: question.body,
          score: question.score,
          question_no: question.question_no,
        },
        user_answer: userAnswer,
      }),
      signal: opts.signal,
    }, 120_000);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    yield { type: 'error', code: 'network', message };
    return;
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    yield { type: 'error', code: `http_${res.status}`, message: msg };
    return;
  }
  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: 'error', code: 'no_body', message: 'response body is null' };
    return;
  }
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let fullText = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n\n')) >= 0) {
        const evt = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const line = evt.split('\n').find(l => l.startsWith('data:'));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          const result = safeParseJudgeResult(fullText, question.score);
          yield { type: 'result', result, raw: fullText };
          return;
        }
        try {
          const obj = JSON.parse(payload);
          if (obj.error) {
            yield { type: 'error', code: 'upstream', message: String(obj.error) };
            return;
          }
          if (typeof obj.delta === 'string') {
            fullText += obj.delta;
            opts.onDelta?.(obj.delta);
            yield { type: 'delta', text: obj.delta };
          }
        } catch {
          // 忽略非 JSON 行
        }
      }
    }
  } catch (e: unknown) {
    // AbortError 是用户主动取消，静默；其它错误上报。
    // 在 RN 中 AbortController.abort() 抛的是 DOMException，不继承自 Error，
    // 因此必须用 `.name` 判定，不能用 `instanceof Error`。
    if (!e || (e as { name?: string })?.name !== 'AbortError') {
      yield { type: 'error', code: 'stream', message: e instanceof Error ? e.message : String(e) };
    }
    return;
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
  // 流未正常 DONE
  const result = safeParseJudgeResult(fullText, question.score);
  yield { type: 'result', result, raw: fullText };
}
