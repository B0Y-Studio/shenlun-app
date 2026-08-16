#!/usr/bin/env node
// scripts/build-local-data.mjs
// 独立模式数据打包：把服务器备份的时评 + 本地 E 盘真题单题，编译成两份
// JSON 供 App 内联（require）使用。
//
// 输入：
//   1. server_backup_*/articles_content/*.json  —— /api/article/:id 导出
//      （含 body_html；HTML → 纯文本在此转换）
//   2. server_backup_*/api/articles_all.json    —— 元数据索引（用于排序/
//      去重校验；正文文件本身已含全部元数据）
//   3. E:\申论知识库\06_真题库\单题\_questions_index.json + 单题 .md
//      （frontmatter + 题干正文；聚合为 Paper / Question）
//
// 输出（均入 git）：
//   src/data/articles.local.json —— { version, count, items }
//   src/data/papers.local.json   —— { version, paperCount, questionCount,
//                                     papers, questions, contents }
//
// 以后新增时评/真题后重跑：npm run build:data && npm run build:release

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'src', 'data');

// ---------- 自动找最新的 server_backup_* ----------
const backupDirs = fs.readdirSync(ROOT)
  .filter(d => /^server_backup_\d{8}$/.test(d))
  .sort()
  .reverse();
if (backupDirs.length === 0) {
  console.error('[build:data] 找不到 server_backup_* 目录（时评数据源）');
  process.exit(1);
}
const BACKUP = path.join(ROOT, backupDirs[0]);
console.log(`[build:data] 使用备份目录: ${backupDirs[0]}`);

const QUESTIONS_ROOT = 'E:/申论知识库/06_真题库/单题';
const VERSION = new Date().toISOString().slice(0, 10);

// ============================================================
// Part 1: 时评（HTML → 纯文本）
// ============================================================

function htmlToText(html) {
  let s = String(html || '');
  // 块级标签 → 段落断行（先统一换行语义）
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n\n');
  // 去掉剩余标签
  s = s.replace(/<[^>]+>/g, '');
  // HTML 实体
  s = s.replace(/&nbsp;/gi, ' ')
       .replace(/&amp;/gi, '&')
       .replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>')
       .replace(/&quot;/gi, '"')
       .replace(/&#39;/gi, "'")
       .replace(/&ldquo;|&rdquo;/gi, '"')
       .replace(/&lsquo;|&rsquo;/gi, "'")
       .replace(/&mdash;/gi, '—')
       .replace(/&hellip;/gi, '…');
  // 压缩空白：连续 3+ 换行 → 2；行首尾空格；全角空格串
  s = s.replace(/\n{3,}/g, '\n\n')
       .replace(/[ \t\u3000]+/g, ' ')
       .split('\n')
       .map(l => l.trim())
       .join('\n')
       .replace(/\n{3,}/g, '\n\n')
       .trim();
  return s;
}

function cleanAuthor(author) {
  const a = String(author || '').trim();
  // 备份里部分 author 字段被 url 污染（"url: https://..."）——置空
  if (!a || /^url\s*:/i.test(a) || a.startsWith('http')) return '';
  return a;
}

function buildArticles() {
  const contentDir = path.join(BACKUP, 'articles_content');
  const files = fs.readdirSync(contentDir).filter(f => f.endsWith('.json'));
  const items = [];
  const seen = new Set();
  let emptyBody = 0;
  for (const f of files) {
    let d;
    try {
      d = JSON.parse(fs.readFileSync(path.join(contentDir, f), 'utf-8'));
    } catch {
      console.warn(`  [warn] 解析失败，跳过: ${f}`);
      continue;
    }
    const id = d.id || d._id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const content = htmlToText(d.body_html);
    if (!content) emptyBody += 1;
    items.push({
      id,
      norm: d.norm || '',
      title: d.title || '',
      date: d.date || '',
      source: d.source || '',
      author: cleanAuthor(d.author),
      tags: Array.isArray(d.tags) ? d.tags : [],
      month: d.month || String(d.date || '').slice(0, 7),
      url: d.url || '',
      summary: d.summary || '',
      content,
    });
  }
  // 日期倒序（新的在前，与服务端一致）
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const out = { version: VERSION, count: items.length, items };
  const outPath = path.join(OUT_DIR, 'articles.local.json');
  fs.writeFileSync(outPath, JSON.stringify(out), 'utf-8');
  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`[build:data] 时评: ${items.length} 篇（空正文 ${emptyBody}）→ articles.local.json (${sizeMB} MB)`);
  return { count: items.length };
}

// ============================================================
// Part 2: 真题（单题索引 + md 正文 → Paper/Question 聚合）
// ============================================================

function stripFrontmatter(s) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(s);
  return { fm: m ? m[1] : '', body: m ? s.slice(m[0].length).trim() : s.trim() };
}

// 单题 md 正文头部有拆分脚本留下的冗余：`# 第X题` 标题行（Question.title
// 已有）和 `> 题目（来源 ...）` 引用行。剥掉它们，题干从真正的材料开始。
function cleanQuestionBody(body) {
  let s = body;
  s = s.replace(/^#\s*第[一二三四五六七八九十\d]+题[^\n]*\n*/m, '');
  s = s.replace(/^>\s*题目（来源[^）]*）\s*\n+/m, '');
  return s.trim();
}

function parseFm(fm) {
  const o = {};
  for (const line of fm.split(/\r?\n/)) {
    const m = /^([a-z_]+)\s*:\s*(.*)$/i.exec(line.trim());
    if (m) {
      let v = m[2].trim();
      v = v.replace(/^"(.*)"$/s, '$1');
      o[m[1]] = v;
    }
  }
  return o;
}

function buildPapers() {
  const indexPath = path.join(QUESTIONS_ROOT, '_questions_index.json');
  if (!fs.existsSync(indexPath)) {
    console.warn(`[build:data] 找不到真题索引 ${indexPath}，跳过真题打包`);
    return null;
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  console.log(`[build:data] 真题索引: ${index.length} 条`);

  // paper_id 规范化：保留 `-q-`/`-a-` 中缀（PaperScreen q/a 切换依赖
  // detail.id.replace(/-q-/, '-a-)）。
  // 规范形式: paper-{qa}-{level}-{year}-{province}-{volume}
  function normPaperId(entry) {
    const seg = (s) => String(s || '').replace(/\s+/g, '');
    return ['paper', entry.qa, entry.level, entry.year, seg(entry.province), seg(entry.volume)].join('-');
  }

  const papers = new Map();     // paperId -> { meta, questions: [] }
  const contents = new Map();   // paperId -> string（单题正文按题号拼接）
  let missing = 0;
  let parsed = 0;

  for (const entry of index) {
    const pid = normPaperId(entry);
    if (!papers.has(pid)) {
      papers.set(pid, {
        meta: {
          id: pid,
          title: `${entry.year} ${entry.province}${entry.volume && entry.volume !== '通用' ? ' · ' + entry.volume : ''} · ${entry.qa === 'q' ? '试题' : '答案'}`,
          level: entry.level,
          province: entry.province || '',
          year: Number(entry.year) || 0,
          volume: entry.volume || '通用',
          joint: !!entry.joint,
          qa: entry.qa,
        },
        questions: [],
      });
      contents.set(pid, []);
    }
    const p = papers.get(pid);

    let body = '';
    let fmTitle = '';
    if (entry.path && fs.existsSync(entry.path)) {
      const raw = fs.readFileSync(entry.path, 'utf-8');
      const { fm, body: b } = stripFrontmatter(raw);
      body = cleanQuestionBody(b);
      fmTitle = parseFm(fm).question_title || '';
      parsed += 1;
    } else {
      missing += 1;
      if (missing <= 5) console.warn(`  [warn] 单题文件缺失: ${entry.path}`);
      continue; // 缺文件的单题不进包
    }

    p.questions.push({
      filename: path.basename(entry.path || ''),
      id: entry.id,
      question_no: String(entry.question_no || ''),
      question_no_int: Number(entry.question_no_int) || 0,
      score: Number(entry.score) || 0,
      title: fmTitle || `第${entry.question_no}题`,
      qa: entry.qa,
      source_paper_id: pid,
      body,
    });
    contents.get(pid).push(`# 第${entry.question_no}题${fmTitle && fmTitle !== `第${entry.question_no}题` ? ' · ' + fmTitle : ''}\n\n${body}`);
  }

  // 每卷题目按题号排序；卷全文 = 拼接
  const paperList = [];
  const questionsMap = {};
  const contentsObj = {};
  for (const [pid, p] of papers) {
    if (p.questions.length === 0) continue;
    p.questions.sort((a, b) => a.question_no_int - b.question_no_int);
    paperList.push(p.meta);
    questionsMap[pid] = p.questions;
    contentsObj[pid] = `${p.meta.title}\n\n${contents.get(pid).join('\n\n---\n\n')}`;
  }
  // 列表排序：年份倒序，同年同 level 优先
  paperList.sort((a, b) =>
    (b.year - a.year) ||
    (a.level === b.level ? 0 : a.level === 'guokao' ? -1 : 1) ||
    a.province.localeCompare(b.province, 'zh') ||
    (a.qa === b.qa ? 0 : a.qa === 'q' ? -1 : 1)
  );

  const questionCount = paperList.reduce((n, p) => n + questionsMap[p.id].length, 0);
  const out = {
    version: VERSION,
    paperCount: paperList.length,
    questionCount,
    papers: paperList,
    questions: questionsMap,
    contents: contentsObj,
  };
  const outPath = path.join(OUT_DIR, 'papers.local.json');
  fs.writeFileSync(outPath, JSON.stringify(out), 'utf-8');
  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`[build:data] 真题: ${paperList.length} 卷 / ${questionCount} 题（索引 ${index.length}，解析 ${parsed}，缺文件 ${missing}）→ papers.local.json (${sizeMB} MB)`);
  return { paperCount: paperList.length, questionCount };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const a = buildArticles();
const p = buildPapers();
console.log(`[build:data] 完成。版本 ${VERSION} · 时评 ${a.count} 篇${p ? ` · 真题 ${p.paperCount} 卷 ${p.questionCount} 题` : ''}`);
