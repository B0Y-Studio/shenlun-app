// src/api/client.ts
import { getDeviceId, getCachedArticles, setCachedArticles, type Article, type Note } from '../storage/mmkv';
export type { Article, Note };

const BASE = 'http://124.223.5.144';

function deviceId(): string { return getDeviceId(); }

export async function getDaily(): Promise<Article[]> {
  try {
    const res = await fetch(`${BASE}/api/today?device_id=${deviceId()}`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    // /api/today 返回: { date, count, cards: [{ id, norm, title, date, content, source, author, tags, highlight, file_path }] }
    // 这里只取前端需要的字段，缺失时降级（id 退回 file_path / title；content 退回 norm）
    const articles: Article[] = (data.cards ?? []).map((card: any) => ({
      id: card.id ?? card.file_path ?? card.title,
      chapter: card.tags?.[0] ?? '',
      title: card.title,
      date: card.date,
      content: card.content ?? card.norm ?? '',
      highlight: card.highlight ?? '',
      source: card.source ?? '',
      author: card.author ?? '',
    }));
    setCachedArticles(articles);
    return articles;
  } catch {
    return getCachedArticles();
  }
}

export async function getArticle(id: string): Promise<Article | null> {
  try {
    // id 是 file_path（含中文 / 斜杠 / `&` 等），必须 encodeURIComponent
    const url = `${BASE}/api/article/${encodeURIComponent(id)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// 批量按 id 拉文章（用于 ReviewScreen 复盘）
// 后端路由尚未上线，返回网络/4xx/5xx 时返回空数组，避免阻塞 UI
export async function getArticlesByIds(ids: string[]): Promise<{items: Article[]; missing: string[]}> {
  if (!ids.length) return { items: [], missing: [] };
  try {
    const url = `${BASE}/api/articles?id-list=${encodeURIComponent(ids.join(','))}&device_id=${deviceId()}`;
    const res = await fetch(url);
    if (!res.ok) return { items: [], missing: ids };
    const data = await res.json();
    const items: Article[] = (data.items ?? []).map((card: any) => ({
      id: card.id ?? card.norm,
      chapter: card.tags?.[0] ?? '',
      title: card.title,
      date: card.date,
      content: card.content ?? card.norm ?? '',
      source: card.source ?? '',
      author: card.author ?? '',
      highlight: card.highlight ?? '',
    }));
    return { items, missing: data.missing ?? [] };
  } catch {
    return { items: [], missing: ids };
  }
}

// === 全量素材库（/api/articles，POST JSON 避免 URL 中文编码） ===

export interface ArticlesListResp {
  items: Article[];
  total: number;
  page: number;
  pageSize: number;
  themes: Array<{ key: string; count: number }>;
  sources: Array<{ key: string; count: number }>;
  dates: Array<{ key: string; count: number }>;
  /** 当 items 中包含 summary 时存在（服务端 with_summary=1） */
  has_summary?: boolean;
}

export interface ArticlesListResult extends ArticlesListResp {
  /** true 表示来自服务端；false 表示离线缓存降级 */
  online: boolean;
}

export async function getArticles(opts: {
  theme?: string;
  source?: string;
  date?: string;       // YYYY / YYYY-MM / YYYY-MM-DD
  q?: string;
  page?: number;
  pageSize?: number;
  with_summary?: boolean;  // 服务端返回每篇 summary 字段（增加 IO）
} = {}): Promise<ArticlesListResult> {
  try {
    const body: Record<string, any> = {};
    if (opts.theme)  body.theme  = opts.theme;
    if (opts.source) body.source = opts.source;
    if (opts.date)   body.date   = opts.date;
    if (opts.q)      body.q      = opts.q;
    body.page     = opts.page     ?? 1;
    body.pageSize = opts.pageSize ?? 50;
    if (opts.with_summary) body.with_summary = 1;

    const res = await fetch(`${BASE}/api/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    // 服务端 items: [{ id, norm, title, date, source, author, tags, category, source_type, month, url, file_path }]
    // → Article: id 保留 file_path，chapter=source，theme=tags[0]，tags 保留
    const items: Article[] = (data.items ?? []).map((it: any) => ({
      id: it.id ?? it.file_path ?? it.title,
      chapter: it.source || '',
      title: it.title || '',
      date: it.date || '',
      // 有 with_summary 时用服务端 summary，没有就空字符串
      content: it.summary || '',
      highlight: '',
      source: it.source || '',
      author: it.author || '',
      theme: (it.tags && it.tags[0]) || '',
      tags: it.tags || [],
    }));
    return {
      items,
      total: data.total ?? items.length,
      page: data.page ?? 1,
      pageSize: data.pageSize ?? items.length,
      themes: data.themes ?? [],
      sources: data.sources ?? [],
      dates: data.dates ?? [],
      online: true,
    };
  } catch {
    // 离线降级：返回本地缓存
    const cached = getCachedArticles();
    return {
      items: cached,
      total: cached.length,
      page: 1,
      pageSize: cached.length,
      themes: [],
      sources: [],
      dates: [],
      online: false,
    };
  }
}

// === 服务端分析（/api/analytics） ===

export interface AnalyticsBucket { key: string; count: number }

export interface AnalyticsSummary {
  device_id: string;
  total_reads: number;
  today_reads: number;
  week_reads: number;
  month_reads: number;
  themes: AnalyticsBucket[];
  sources: AnalyticsBucket[];
  dates: AnalyticsBucket[];
  /** true 表示来自服务端；false 表示离线降级 */
  online: boolean;
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  try {
    const url = `${BASE}/api/analytics/summary?device_id=${deviceId()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('API error');
    const d = await res.json();
    return { ...d, online: true };
  } catch {
    // 离线降级：返回空统计
    return {
      device_id: getDeviceId(),
      total_reads: 0,
      today_reads: 0,
      week_reads: 0,
      month_reads: 0,
      themes: [],
      sources: [],
      dates: [],
      online: false,
    };
  }
}

export interface AnalyticsThemes {
  device_id: string;
  themes: AnalyticsBucket[];
  total_unique: number;
  online: boolean;
}

export async function getAnalyticsThemes(top = 10): Promise<AnalyticsThemes> {
  try {
    const url = `${BASE}/api/analytics/themes?device_id=${deviceId()}&top=${top}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('API error');
    const d = await res.json();
    return { ...d, online: true };
  } catch {
    return {
      device_id: getDeviceId(),
      themes: [],
      total_unique: 0,
      online: false,
    };
  }
}

// 同步已读到服务端（POST /api/mark-read）
export async function markReadRemote(article: Article): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/mark-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId(),
        norm: article.chapter || article.id,  // 用 chapter(源) 作为 norm；fallback id
        title: article.title,
        date: article.date,
        file_path: article.id,                 // 文章 id 实际是 file_path
        duration: 0,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// === 真题库 ===

export interface Paper {
  id: string;
  title: string;
  level: 'guokao' | 'shengkao';
  province: string;
  year: number;
  volume: string;
  joint?: boolean;
  qa: 'q' | 'a';
}

export interface PaperListResp {
  items: Paper[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getPapers(opts: {
  level?: 'guokao' | 'shengkao';
  province?: string;
  year?: number;
  qa?: 'q' | 'a';
  q?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<PaperListResp> {
  try {
    const params = new URLSearchParams();
    if (opts.level) params.set('level', opts.level);
    if (opts.province) params.set('province', opts.province);
    if (opts.year) params.set('year', String(opts.year));
    if (opts.qa) params.set('qa', opts.qa);
    if (opts.q) params.set('q', opts.q);
    if (opts.page) params.set('page', String(opts.page));
    if (opts.pageSize) params.set('pageSize', String(opts.pageSize));
    const res = await fetch(`${BASE}/api/papers?${params}`);
    if (!res.ok) return { items: [], total: 0, page: 1, pageSize: 50 };
    return await res.json();
  } catch {
    return { items: [], total: 0, page: 1, pageSize: 50 };
  }
}

export interface PaperDetail extends Paper {
  filename: string;
  content: string;  // 全文 markdown（含 frontmatter）
}

export async function getPaper(id: string): Promise<PaperDetail | null> {
  try {
    const url = `${BASE}/api/paper?id=${encodeURIComponent(id)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return data as PaperDetail;
  } catch {
    return null;
  }
}

export interface Question {
  filename: string;
  id: string;
  question_no: string;
  question_no_int: number;
  score: number;
  title: string;
  qa: 'q' | 'a';
  source_paper_id: string;
  body: string;
}

export interface QuestionsResp {
  items: Question[];
  total: number;
  paper_id: string;
}

export async function getQuestions(paperId: string): Promise<QuestionsResp> {
  try {
    const url = `${BASE}/api/questions?paper_id=${encodeURIComponent(paperId)}`;
    const res = await fetch(url);
    if (!res.ok) return { items: [], total: 0, paper_id: paperId };
    return await res.json();
  } catch {
    return { items: [], total: 0, paper_id: paperId };
  }
}

export async function getNotes(): Promise<Note[]> {
  try {
    const res = await fetch(`${BASE}/api/notes?device_id=${deviceId()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.notes ?? [];
  } catch {
    return [];
  }
}

export async function postNote(note: Omit<Note, 'id'>): Promise<Note | null> {
  try {
    const res = await fetch(`${BASE}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...note, device_id: deviceId() }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
