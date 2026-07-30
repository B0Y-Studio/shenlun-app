// ShenlunApp/src/llm/provider.ts
export type Provider = 'deepseek' | 'doubao' | 'openai' | 'custom';

export interface LlmPreset {
  provider: Provider;
  label: string;
  baseUrl: string;
  model: string;
}

export const PRESETS: LlmPreset[] = [
  { provider: 'deepseek', label: 'DeepSeek（推荐）', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { provider: 'doubao',   label: '豆包（火山）',     baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-1-5-pro-32k-250115' },
  { provider: 'openai',   label: 'OpenAI',          baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' },
  { provider: 'custom',   label: '自定义（OpenAI 兼容）', baseUrl: '', model: '' },
];

export interface LlmConfig {
  provider: Provider;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export function findPreset(provider: Provider): LlmPreset | undefined {
  return PRESETS.find(p => p.provider === provider);
}
