// src/llm/llmConfigStore.ts
// 独立模式的 LLM 配置本地存储（MMKV）。
// 服务器模式下配置存在服务端 judge_db（Fernet 加密）；本地模式 Key 仅存
// 本机，评卷请求由 App 直连 LLM 厂商（OpenAI 兼容 SSE），不经服务器。

import { getStorage } from '../storage/mmkv';
import type { LlmConfig, Provider } from './provider';

const KEY = 'llm_config_v1';

interface StoredLlmConfig extends LlmConfig {
  updatedAt: number;
}

export function getLocalLlmConfig(): LlmConfig | null {
  const raw = getStorage()?.getString(KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<StoredLlmConfig>;
    if (!o.baseUrl || !o.model || !o.apiKey) return null;
    return {
      provider: (o.provider as Provider) || 'custom',
      baseUrl: o.baseUrl,
      model: o.model,
      apiKey: o.apiKey,
    };
  } catch {
    return null;
  }
}

export function saveLocalLlmConfig(cfg: LlmConfig): void {
  const prev = getLocalLlmConfig();
  const full: StoredLlmConfig = { ...cfg, updatedAt: Date.now() };
  getStorage()?.set(KEY, JSON.stringify(full));
  void prev;
}

export function deleteLocalLlmConfig(): void {
  getStorage()?.delete(KEY);
}

export function getLocalLlmConfigUpdatedAt(): number {
  const raw = getStorage()?.getString(KEY);
  if (!raw) return 0;
  try { return Number((JSON.parse(raw) as StoredLlmConfig).updatedAt) || 0; }
  catch { return 0; }
}