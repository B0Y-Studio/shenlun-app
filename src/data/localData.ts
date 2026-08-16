// src/data/localData.ts
// 独立模式的本地数据源。
//
// 数据由 scripts/build-local-data.mjs 生成（npm run build:data），通过
// require() 内联进 JS bundle —— Metro 在构建期解析 JSON，零运行时 IO。
// 网络代码（src/api/client.ts 的服务器分支）原样保留，由
// src/config/dataMode.ts 决定走哪条路。
//
// 注意：本模块导出的查询函数只覆盖 client.ts 需要本地化的部分；
// AI 评卷（/api/judge/*）是服务器代理架构，本地模式不提供替代实现。

import type {
  Article, ArticlesListResult, Paper, PaperDetail, Question, QuestionsResp,
  PaperListResp, AnalyticsSummary, AnalyticsThemes,
} from '../api/client';
import type { Article as LocalArticle } from '../storage/mmkv';
import { getReadHistory, setCachedArticles } from '../storage/mmkv';

// ---- 打包数据（构建期内联；类型宽一些，字段以打包脚本产出为准） ----
import articlesJson from './articles.local.json';
import papersJson from './papers.local.json';

interface LocalArticleRecord {
  id: string; norm: string; title: string; date: string; source: string;
  author: string; tags: string[]; month: string; url: string;
  summary: string; content: string;
}
interface LocalPapersFile {
  version: string; paperCount: number; questionCount: number;
  papers: Array<Paper & { id: string }>;
  questions: Record<string, Question[]>;
  contents: Record<string, string>;
}

const ARTICLES = (articlesJson as { version: string; count: number; items: LocalArticleRecord[] }).items;
const PAPERS_FILE = papersJson as unknown as LocalPapersFile;

// ---- 内存索引（首访构建一次） ----
let byId: Map<string, LocalArticleRecord> | null = null;
function getIndex(): Map<string, LocalArticleRecord> {
  if (!byId) {
    byId = new Map(ARTICLES.map(a => [a.id, a]));
  }
  return byId;
}

/** 元数据记录 → App 的 Article 形状（与服务端 /api/articles 映射一致：列表卡
    片用 summary 作预览；全文在 localGetArticle 里补） */
function toCardArticle(a: LocalArticleRecord): Article {
  return {
    id: a.id,
    chapter: a.source,
    title: a.title,
    date: a.date,
    content: a.summary || '',
    highlight: '',
    source: a.source,
    author: a.author,
    theme: a.tags?.[0] || '',
    norm: a.norm,
    tags: a.tags,
  };
}

function toFullArticle(a: LocalArticleRecord): Article {
  return { ...toCardArticle(a), content: a.content };
}

// ---- 版本信息（设置页显示） ----
export function getLocalDataVersion(): string {
  const a = articlesJson as { version: string; count: number };
  return `${a.version} · 时评 ${a.count} 篇 · 真题 ${PAPERS_FILE.paperCount} 卷 ${PAPERS_FILE.questionCount} 题`;
}

/** 打包时评总数（分析页"素材库"计数用；不触发索引构建） */
export function localArticleCount(): number {
  return ARTICLES.length;
}

// ---- 时评查询 ----

export function localGetArticles(opts: {
  theme?: string; source?: string; date?: string; q?: string;
  page?: number; pageSize?: number;
} = {}): ArticlesListResult {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, opts.pageSize ?? 50));

  let list = ARTICLES;
  if (opts.theme) list = list.filter(a => a.tags.includes(opts.theme!));
  if (opts.source) list = list.filter(a => a.source === opts.source);
  if (opts.date) list = list.filter(a => a.date.startsWith(opts.date!));
  if (opts.q) {
    const kw = opts.q.toLowerCase();
    list = list.filter(a =>
      a.title.toLowerCase().includes(kw) || a.summary.toLowerCase().includes(kw));
  }

  // facets 在过滤后的集合上聚合（与服务端语义一致：过滤后可见的分组）
  const themes: Record<string, number> = {};
  const sources: Record<string, number> = {};
  const dates: Record<string, number> = {};
  for (const a of ARTICLES) {
    const t = a.tags[0] || '未分类';
    themes[t] = (themes[t] || 0) + 1;
    sources[a.source || '未署名'] = (sources[a.source || '未署名'] || 0) + 1;
    const m = a.month || a.date.slice(0, 7) || '未知';
    dates[m] = (dates[m] || 0) + 1;
  }

  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize).map(toCardArticle);
  return {
    items,
    total: list.length,
    page,
    pageSize,
    themes: Object.entries(themes).sort((x, y) => y[1] - x[1]).map(([key, count]) => ({ key, count })),
    sources: Object.entries(sources).sort((x, y) => y[1] - x[1]).map(([key, count]) => ({ key, count })),
    dates: Object.entries(dates).sort((x, y) => y[0].localeCompare(x[0])).map(([key, count]) => ({ key, count })),
    online: false,
  };
}

export function localGetArticle(id: string): Article | null {
  const a = getIndex().get(id);
  return a ? toFullArticle(a) : null;
}

export function localGetArticlesByIds(ids: string[]): { items: Article[]; missing: string[] } {
  const idx = getIndex();
  const items: Article[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const a = idx.get(id);
    if (a) items.push(toFullArticle(a));
    else missing.push(id);
  }
  return { items, missing };
}

// ---- 每日 3 篇（确定性：同一天选择固定；偏好近期未读） ----

function hashStr(s: string): number {
  // djb2 —— 够用的确定性 hash
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function localGetDaily(n = 3): { items: Article[]; online: boolean } {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const daySeed = hashStr(`${yyyy}-${mm}-${dd}`);

  // 候选：最近 90 天的文章优先（保持新鲜度），不足再扩到全量
  const cutoff = `${yyyy}-${mm}-${dd}`;
  const recent = ARTICLES.filter(a => a.date >= addDays(cutoff, -90));
  const pool = recent.length >= n * 3 ? recent : ARTICLES;

  // daySeed 做确定性起点轮转 —— 同一天结果稳定，跨天不重复
  const start = daySeed % Math.max(1, pool.length);
  const picked: LocalArticleRecord[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < pool.length && picked.length < n; i++) {
    const a = pool[(start + i) % pool.length];
    if (!seen.has(a.id)) { seen.add(a.id); picked.push(a); }
  }
  const items = picked.map(toFullArticle);
  // 与服务端路径对齐：写今日缓存，ReaderScreen 的 cache-first 查找、
  // "第 X / Y 篇"进度、markReadRemote 元数据都依赖 cached_articles
  setCachedArticles(items);
  return { items, online: false };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---- 真题查询 ----

export function localGetPapers(opts: {
  level?: string; province?: string; year?: number; qa?: string; q?: string;
  page?: number; pageSize?: number;
} = {}): PaperListResp {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 50);
  let list = PAPERS_FILE.papers;
  if (opts.level) list = list.filter(p => p.level === opts.level);
  if (opts.province) list = list.filter(p => p.province.includes(opts.province!));
  if (opts.year) list = list.filter(p => p.year === opts.year);
  if (opts.qa) list = list.filter(p => p.qa === opts.qa);
  if (opts.q) {
    const kw = opts.q.toLowerCase();
    list = list.filter(p => p.title.toLowerCase().includes(kw));
  }
  const start = (page - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    total: list.length,
    page,
    pageSize,
  };
}

export function localGetPaper(id: string): PaperDetail | null {
  const p = PAPERS_FILE.papers.find(x => x.id === id);
  if (!p) return null;
  return {
    ...p,
    filename: id,
    content: PAPERS_FILE.contents[id] ?? '',
  };
}

export function localGetQuestions(paperId: string): QuestionsResp {
  const items = PAPERS_FILE.questions[paperId] ?? [];
  return { items, total: items.length, paper_id: paperId };
}

// ---- 分析（本地：read_history × 全量文章聚合） ----

export function localAnalyticsSummary(): AnalyticsSummary {
  const history = getReadHistory();
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const todayStr = new Date().toISOString().slice(0, 10);

  const idx = getIndex();
  const themes: Record<string, number> = {};
  const sources: Record<string, number> = {};
  const dates: Record<string, number> = {};
  let todayReads = 0, weekReads = 0, monthReads = 0;

  for (const h of history) {
    const a = idx.get(h.id);
    if (a) {
      for (const t of a.tags) themes[t] = (themes[t] || 0) + 1;
      sources[a.source || '未署名'] = (sources[a.source || '未署名'] || 0) + 1;
      dates[a.month || '未知'] = (dates[a.month || '未知'] || 0) + 1;
    }
    if (now - h.at < 1 * DAY) todayReads += 1;
    if (now - h.at < 7 * DAY) weekReads += 1;
    if (now - h.at < 30 * DAY) monthReads += 1;
  }
  void todayStr;

  const sortDesc = (o: Record<string, number>) =>
    Object.entries(o).sort((x, y) => y[1] - x[1]).map(([key, count]) => ({ key, count }));

  return {
    device_id: '',
    total_reads: history.length,
    today_reads: todayReads,
    week_reads: weekReads,
    month_reads: monthReads,
    themes: sortDesc(themes),
    sources: sortDesc(sources),
    dates: Object.entries(dates).sort((x, y) => y[0].localeCompare(x[0])).map(([key, count]) => ({ key, count })),
    online: false,
  };
}

export function localAnalyticsThemes(top = 10): AnalyticsThemes {
  const { themes } = localAnalyticsSummary();
  return {
    device_id: '',
    themes: themes.slice(0, Math.max(1, Math.min(50, top))),
    total_unique: themes.length,
    online: false,
  };
}

// 供 mmkv 类型复用（避免循环依赖时直接 import type）
export type { LocalArticle };
