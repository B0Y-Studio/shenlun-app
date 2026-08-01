// ShenlunApp/src/llm/client.ts
import { getDeviceId } from '../storage/mmkv';
import type { Question } from '../api/client';

import { API_BASE as BASE } from '../config/api';

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

export function safeParseJudgeResult(raw: string): JudgeResult | null {
  const { json } = extractJsonByBraceDepth(raw);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<JudgeResult>;
    return {
      commentary: typeof o.commentary === 'string' ? o.commentary : '',
      total: Number(o.total ?? 0),
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

export async function* runJudge(
  question: Question,
  userAnswer: string,
  deviceId: string = getDeviceId(),
  opts: { signal?: AbortSignal; onDelta?: (t: string) => void } = {},
): AsyncGenerator<JudgeEvent> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/judge/run`, {
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
    });
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
          const result = safeParseJudgeResult(fullText);
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
  } catch (e) {
    // AbortError 是用户主动取消，静默；其它错误上报
    if (!(e instanceof Error && e.name === 'AbortError')) {
      yield { type: 'error', code: 'stream', message: e instanceof Error ? e.message : String(e) };
    }
    return;
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
  // 流未正常 DONE
  const result = safeParseJudgeResult(fullText);
  yield { type: 'result', result, raw: fullText };
}
