// src/storage/highlightsStore.ts
// 阅读器荧光笔标记（仅本机，MMKV）。
// 按 articleId 存区间列表 { start, end, color, text, createdAt }：
// - 正文在本地/服务器数据里都是固定文本，字符偏移跨会话稳定
// - text 存选中文本快照（调试与防错：渲染时按 start/end 切段，不依赖 text）
// - 后标的区间覆盖先标的：插入时移除所有与新区间相交的旧区间

import { getStorage } from './mmkv';

export interface TextHighlight {
  start: number;
  end: number;
  color: string;
  /** 选中时的文本快照（渲染不使用，仅供核对/导出） */
  text: string;
  createdAt: number;
}

const KEY = 'article_highlights_v1';

type AllHighlights = Record<string, TextHighlight[]>;

function readAll(): AllHighlights {
  const raw = getStorage()?.getString(KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) as AllHighlights; } catch { return {}; }
}

function writeAll(all: AllHighlights): void {
  getStorage()?.set(KEY, JSON.stringify(all));
}

export function getHighlights(articleId: string): TextHighlight[] {
  // 返回按 start 升序的拷贝
  return [...(readAll()[articleId] ?? [])].sort((a, b) => a.start - b.start);
}

export function addHighlight(articleId: string, h: Omit<TextHighlight, 'createdAt'>): TextHighlight {
  const full: TextHighlight = { ...h, createdAt: Date.now() };
  const all = readAll();
  const list = all[articleId] ?? [];
  // 覆盖语义：移除与新区间相交的旧区间（start < hEnd && end > hStart）
  const kept = list.filter(x => !(x.start < full.end && x.end > full.start));
  kept.push(full);
  kept.sort((a, b) => a.start - b.start);
  all[articleId] = kept;
  writeAll(all);
  return full;
}

export function removeHighlight(articleId: string, createdAt: number): void {
  const all = readAll();
  const list = all[articleId];
  if (!list) return;
  const kept = list.filter(x => x.createdAt !== createdAt);
  if (kept.length === 0) delete all[articleId];
  else all[articleId] = kept;
  writeAll(all);
}

export function countHighlights(): number {
  const all = readAll();
  return Object.values(all).reduce((n, list) => n + list.length, 0);
}