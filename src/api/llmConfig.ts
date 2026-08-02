// ShenlunApp/src/api/llmConfig.ts
import { getDeviceId } from '../storage/mmkv';
import type { LlmConfig } from '../llm/provider';

import { API_BASE as BASE } from '../config/api';
import { fetchWithTimeout } from './fetchWithTimeout';

export interface RemoteLlmConfig {
  configured: boolean;
  provider?: string;
  baseUrl?: string;
  model?: string;
  updatedAt?: number;
}

export async function fetchLlmConfig(deviceId: string = getDeviceId()): Promise<RemoteLlmConfig> {
  try {
    const r = await fetchWithTimeout(`${BASE}/api/judge/llm-config?device_id=${encodeURIComponent(deviceId)}`);
    if (!r.ok) return { configured: false };
    return await r.json() as RemoteLlmConfig;
  } catch {
    return { configured: false };
  }
}

export async function saveLlmConfig(deviceId: string, cfg: LlmConfig): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(`${BASE}/api/judge/llm-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        provider: cfg.provider,
        base_url: cfg.baseUrl,
        model: cfg.model,
        api_key: cfg.apiKey,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function deleteLlmConfig(deviceId: string = getDeviceId()): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(`${BASE}/api/judge/llm-config?device_id=${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
    return r.ok;
  } catch {
    return false;
  }
}

export interface RemoteJudgeItem {
  id: string;
  questionId: string;
  questionTitle: string;
  questionScore: number;
  totalScore: number;
  createdAt: number;
}

export async function fetchJudgeHistory(deviceId: string, limit = 20): Promise<RemoteJudgeItem[]> {
  // deviceId is required (caller must pass getDeviceId() explicitly). Previous signature
  // had `deviceId: string = getDeviceId()` default + `undefined` opt-in from call sites,
  // which was a code smell (final review Important #5).
  try {
    const r = await fetchWithTimeout(`${BASE}/api/judge/history?device_id=${encodeURIComponent(deviceId)}&limit=${limit}`);
    if (!r.ok) return [];
    const j = await r.json() as { items: any[] };
    return (j.items ?? []).map(it => ({
      id: it.id,
      questionId: it.question_id ?? '',
      questionTitle: it.question_title ?? '',
      questionScore: Number(it.question_score ?? 0),
      totalScore: Number(it.total_score ?? 0),
      createdAt: Number(it.created_at ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function deleteJudgeHistoryServer(id: string, deviceId: string = getDeviceId()): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(`${BASE}/api/judge/${encodeURIComponent(id)}?device_id=${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Lightweight connectivity probe to the server's `/api/judge/run` endpoint.
 * Issues a real LLM call with a 70-char dummy answer (passes the server's 50-char
 * minimum); costs the user 1 LLM call. Use only when the user explicitly clicks
 * "测试连接". Centralizes the BASE URL so future changes don't touch call sites.
 */
export async function testLlmConnection(deviceId: string = getDeviceId()): Promise<{ ok: boolean; status: number }> {
  try {
    const r = await fetchWithTimeout(`${BASE}/api/judge/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        question: { id: 'test', title: '测试题', body: '这是一道测试题', score: 10, question_no: '0' },
        user_answer: '这是一段测试答案，至少要达到五十字才能通过校验，确保服务端接收到正确的请求。本测试答案用于校验LLM连接，不计入评分，仅作为联通性验证用途。',
      }),
    });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
