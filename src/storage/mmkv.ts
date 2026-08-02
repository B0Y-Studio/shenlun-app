// src/storage/mmkv.ts
// 懒加载 MMKV + 全局错误降级，避免原生模块问题导致整个 App 启动崩溃
import { createMMKV } from 'react-native-mmkv';
import type { MMKV } from 'react-native-mmkv';

let storage: MMKV | null = null;
let storageFailed = false;

export function getStorage(): MMKV | null {
  if (storageFailed) return null;
  if (storage) return storage;
  try {
    // mmkv v4 API: createMMKV(config) replaces `new MMKV(config)`.
    storage = createMMKV({ id: 'shenlun-storage' });
    return storage;
  } catch (e) {
    console.warn('[mmkv] 初始化失败，将使用内存存储:', e);
    storageFailed = true;
    return null;
  }
}

// 内存降级存储
const memoryStore: Record<string, string> = {};

function setValue(key: string, value: string): void {
  const s = getStorage();
  if (s) {
    try { s.set(key, value); return; } catch (e) { __DEV__ && console.warn('[mmkv] operation failed:', e); }
  }
  memoryStore[key] = value;
}

function getValue(key: string): string | undefined {
  const s = getStorage();
  if (s) {
    try { return s.getString(key); } catch (e) { __DEV__ && console.warn('[mmkv] operation failed:', e); }
  }
  return memoryStore[key];
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function getDeviceId(): string {
  let id = getValue('device_id');
  if (!id) {
    id = generateUUID();
    setValue('device_id', id);
  }
  return id;
}

export interface Article {
  id: string; chapter: string; title: string; date: string; content: string;
  highlight?: string; source: string; author: string; theme: string;
  tags?: string[];   // 复盘屏按主题分组、ReviewScreen tag chip 点击跳转素材 Tab 用
  /**
   * 服务端规范化后的标题（用于 markReadRemote 关联服务端 analytics）。
   * - 服务端响应（/api/today, /api/articles, /api/article/:id）都回传此字段，正常 ≥ 1 字符
   * - 离线缓存中可能为空字符串（升级前写的老 cache 没存 norm）
   *   这种情况 markReadRemote 会 early-return false（不会报错），只是该次已读不参与服务端聚合
   */
  norm?: string;
}

export interface Note {
  id: string; article_id: string; sentence: string;
  article_title: string; theme: string; created_at: string;
}

export function getCachedArticles(): Article[] {
  const raw = getValue('cached_articles');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { __DEV__ && console.warn('[mmkv] operation failed:', e); return []; }
}

export function setCachedArticles(articles: Article[]): void {
  try { setValue('cached_articles', JSON.stringify(articles)); } catch (e) { __DEV__ && console.warn('[mmkv] operation failed:', e); }
}

// 已读文章 id 列表（按文章 id，不按日期；想按日期自行扩展）
export function getReadIds(): string[] {
  const raw = getValue('read_ids');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { __DEV__ && console.warn('[mmkv] operation failed:', e); return []; }
}

export function markRead(articleId: string): void {
  if (!articleId) return;
  const ids = getReadIds();
  if (ids.includes(articleId)) return;
  ids.unshift(articleId);
  // 最多保留最近 1000 条，避免无限增长
  setValue('read_ids', JSON.stringify(ids.slice(0, 1000)));
  // 同步追加一条时间戳，用于"本月已读"等按时间窗口统计
  const history = getReadHistory();
  history.unshift({ id: articleId, at: Date.now() });
  setValue('read_history', JSON.stringify(history.slice(0, 1000)));
}

// 已读时间戳历史：{ id, at }[]，at 为 ms 时间戳，用于按时间窗口统计
export interface ReadHistoryItem { id: string; at: number; }
export function getReadHistory(): ReadHistoryItem[] {
  const raw = getValue('read_history');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { __DEV__ && console.warn('[mmkv] operation failed:', e); return []; }
}

// 给定 article 列表，返回"今日已读"的篇数（按文章 id 命中）
export function countReadInList(articles: Article[]): number {
  const ids = getReadIds();
  if (!ids.length || !articles.length) return 0;
  const set = new Set(ids);
  let n = 0;
  for (const a of articles) if (set.has(a.id)) n++;
  return n;
}

// 给定时间窗口（ms），返回该窗口内的已读 id 列表
export function countReadsInWindow(windowMs: number): number {
  const since = Date.now() - windowMs;
  return getReadHistory().filter(h => h.at >= since).length;
}

export function getLocalNotes(): Note[] {
  const raw = getValue('local_notes');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { __DEV__ && console.warn('[mmkv] operation failed:', e); return []; }
}

export function addLocalNote(note: Note): void {
  const notes = getLocalNotes();
  notes.unshift(note);
  setValue('local_notes', JSON.stringify(notes));
}

export function deleteLocalNote(noteId: string): void {
  const notes = getLocalNotes().filter(n => n.id !== noteId);
  setValue('local_notes', JSON.stringify(notes));
}