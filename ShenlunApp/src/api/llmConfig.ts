// ShenlunApp/src/api/llmConfig.ts
import { getDeviceId } from '../storage/mmkv';
import type { LlmConfig } from '../llm/provider';

const BASE = 'http://124.223.5.144';

export interface RemoteLlmConfig {
  configured: boolean;
  provider?: string;
  baseUrl?: string;
  model?: string;
  updatedAt?: number;
}

export async function fetchLlmConfig(deviceId: string = getDeviceId()): Promise<RemoteLlmConfig> {
  try {
    const r = await fetch(`${BASE}/api/judge/llm-config?device_id=${encodeURIComponent(deviceId)}`);
    if (!r.ok) return { configured: false };
    return await r.json() as RemoteLlmConfig;
  } catch {
    return { configured: false };
  }
}

export async function saveLlmConfig(deviceId: string, cfg: LlmConfig): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/judge/llm-config`, {
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
    const r = await fetch(`${BASE}/api/judge/llm-config?device_id=${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
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
    const r = await fetch(`${BASE}/api/judge/history?device_id=${encodeURIComponent(deviceId)}&limit=${limit}`);
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
    const r = await fetch(`${BASE}/api/judge/${encodeURIComponent(id)}?device_id=${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
    return r.ok;
  } catch {
    return false;
  }
}
