# PaperScreen 真题接入 / 拆题 / Tags 设计

> **日期**: 2026-07-13
> **项目**: ShenlunApp 申论精读
> **作者**: ZCode brainstorming
> **状态**: 已确认，待写实施计划

---

## 1. 背景与目标

### 1.1 背景

- 当前 `PaperScreen` 是占位屏
- 知识库 `E:/申论知识库/06_真题库/` 已建好：
  - `历年真题/试题/` (45 卷)
  - `历年真题/答案/` (45 卷)
  - `历年真题/_skipped/` (1 卷)
  - `各省联考/试题/` (~602 卷)
  - `各省联考/答案/` (~602 卷)
  - `各省联考/_skipped/` (~263 卷)
  - 总计 ~1557 个 md 文件
- 服务端 `card_server.py` 已经稳定，新增 `/api/articles`，未上 SSH 可同步
- 客户端 `getArticlesByIds` 已实现优雅降级

### 1.2 目标

P0 范围（一次性做完）：
1. **拆题**：每卷 "作答要求" 拆成 5 道单题文件，题号 / 题型 / 来源 / 答案指针都带
2. **tags**：每份试卷 frontmatter 加主题 tag（5-8 个粗分主题）
3. **PaperScreen 接入**：
   - 整卷列表（年份 / 省份 / 卷别）
   - 整卷详情（题号列表）
   - 题目详情（题干 + 答案 / 解析 / 评分要点）
4. **服务端**：新增 `/api/papers` + `/api/papers/{id}` 接口

### 1.3 非目标

- AI 自动阅卷 / 自动评分
- 历年真题 vs 联考的合并去重
- 用户作答 / 答分记录
- 按主题分类聚合（先按年份 + 省份 + 卷别）

---

## 2. 数据流

### 2.1 服务端接口

```
GET /api/papers?exam=guokao|shengkao&year=YYYY&province=XX&volume=YY&page=N&limit=M
200 OK
{
  "items": [
    {
      "id": "guokao-2025-副省级",
      "title": "2025年国家公务员考试《申论》题（副省级）真题",
      "year": 2025,
      "level": "guokao",        # guokao / shengkao
      "province": "国考",
      "volume": "副省级",
      "is_joint": false,
      "tags": ["数字中国", "科技创新"],
      "question_count": 5,
      "has_answer": true,
      "source_path": "E:/申论知识库/06_真题库/历年真题/试题/2025_真题_副省级.md",
    },
    ...
  ],
  "total": N,
  "page": N,
  "limit": M
}

GET /api/papers/{id}
200 OK
{
  "id": "guokao-2025-副省级",
  "title": "...",
  "year": 2025, ...
  "intro": "材料部分（无题号）",
  "questions": [
    {
      "id": "guokao-2025-副省级-q1",
      "index": "一",
      "label": "第一题",
      "type": "归纳概括",
      "score": 25,
      "stem": "根据\"给定资料1\"，概括\"三条黄河\"...",
      "source_path": "E:/申论知识库/06_真题库/历年真题/题目/2025_副省级_q1.md",
      "answer_id": "guokao-2025-副省级-q1",
      "answer_path": "E:/申论知识库/06_真题库/历年真题/答案/2025_副省级_q1.md"
    },
    ...
  ]
}

GET /api/papers/{id}/answers/{qid}
200 OK
{
  "id": "guokao-2025-副省级-q1",
  "question_id": "...",
  "answer_text": "...",
  "analysis": "华图解析: ..."    # 可选
}
```

### 2.2 拆题产物结构

```
E:/申论知识库/06_真题库/历年真题/
├── 试题/2025_真题_副省级.md          ← 原文件保留（P0 期间并存）
├── 题目/                              ← 新建：拆题产物
│   └── 2025_副省级_q1.md             ← 5 道题 × 45 卷 ≈ 225 文件
├── 答案/2025_答案_副省级.md
├── 答案（拆题）/
│   └── 2025_副省级_q1.md             ← 题+答成对
└── _skipped/

各省联考/同样：
├── 试题/2010_安徽_A卷_真题.md
├── 题目/2010_安徽_A卷_q1.md ...
├── 答案/2010_安徽_A卷_答案.md
├── 答案（拆题）/2010_安徽_A卷_q1.md
```

每道题 md 的 frontmatter：
```yaml
---
question_id: "guokao-2025-副省级-q1"
paper_id: "guokao-2025-副省级"
year: 2025
level: "guokao"
province: "国考"
volume: "副省级"
index: "一"
index_num: 1
label: "第一题"
type: "归纳概括"     # 题型，可空
score: 25             # 分值，可空
source_file: "2025_真题_副省级.md"   # 原卷路径相对
title: "..."        # 题干首行
---

[题干正文]
```

每道答案 md 的 frontmatter：
```yaml
---
answer_id: "guokao-2025-副省级-q1"
question_id: "guokao-2025-副省级-q1"
paper_id: "guokao-2025-副省级"
year: 2025
level: "guokao"
index: "一"
source_file: "2025_答案_副省级.md"
title: "..."
---

[答案正文，可含 "华图解析" / "参考答案"]
```

### 2.3 客户端类型

```typescript
interface Paper {
  id: string;
  title: string;
  year: number;
  level: 'guokao' | 'shengkao';
  province: string;
  volume: string;
  is_joint: boolean;
  tags: string[];
  question_count: number;
  has_answer: boolean;
}

interface PaperQuestion {
  id: string;
  index: string;     // "一" / "二"
  label: string;     // "第一题"
  type?: string;
  score?: number;
  stem: string;
  source_path: string;
  answer_id: string;
}

interface PaperDetail extends Paper {
  intro: string;
  questions: PaperQuestion[];
}

interface PaperAnswer {
  id: string;
  question_id: string;
  answer_text: string;
  analysis?: string;
}
```

---

## 3. 拆题脚本设计

### 3.1 输入

`试题/{key}.md` —— 一份卷题本（包含材料 + 作答要求 + 题目）

### 3.2 切分逻辑

1. 切"作答要求"之前 = 材料（intro），之后 = 题目（questions）
2. 在"作答要求"之后，按大写中文数字（`一、 二、 三、 四、 五、 六、 七、 八、 九、 十`）做 split
3. 提取每题题干首行作 `title`，分值（如 `(25 分)`）作 `score`
4. 题型识别（粗略）：
   - 含"概括 / 归纳" → `归纳概括`
   - 含"分析 / 解释" → `综合分析`
   - 含"对策 / 建议 / 措施" → `提出对策`
   - 含"倡议 / 公开信 / 通知 / 报告" → `应用文`
   - 含"文章 / 写一篇 / 议论文" → `文章论述`

### 3.3 答案切分

`答案/{key}.md` —— 在答案文件里按"一、"~"五、"切分，**题号位置可能不固定**：
- 有些答案是：`一、1.... 2....\n二、...`（每题下用数字小标）
- 有些答案是：`一、 华图解析... 参考答案：...\n二、 华图解析...`

策略：用 `re.match(r'^[一二三四五六七八九十]、', line)` 在答案文件里扫，找到前 5 个这样的行作切分点。

### 3.4 拆题脚本

`C:\Users\hecto\ZCodeProject\split_papers_into_questions.py`

```
Input: E:/申论知识库/06_真题库/{历年真题,各省联考}/{试题,答案}/*.md
Output:
  E:/申论知识库/06_真题库/{历年真题,各省联考}/题目/{key}_q{n}.md
  E:/申论知识库/06_真题库/{历年真题,各省联考}/答案（拆题）/{key}_q{n}.md
```

---

## 4. Tags 注入

### 4.1 来源

- **AI 推断** —— 你下次开新会话时 AI 一次性扫所有试卷内容
- 我（这次会话）**不动 tags**，但建好骨架（frontmatter 加 `tags: []` 字段 + 注释：待 AI 填充）

### 4.2 主题候选集

申论常见主题（8 个）：
- 社会治理 / 城乡发展 / 营商环境 / 文化传承
- 生态文明 / 数字中国 / 民生服务 / 干部作风

按材料关键词匹配（不是这次任务，下次会话 AI 调 API 时填充）。

---

## 5. PaperScreen UI

### 5.1 当前状态

`PaperScreen` 是占位屏（"题目练习"标题 + "即将上线"），需要重写。

### 5.2 重写后结构

```
PaperScreen
├── 顶部
│   ├── 标题 "题目练习"
│   └── Toggle: [真题] [筛选]
├── Filter (顶部可折叠)
│   ├── 来源: [国考] [省考]
│   ├── 年份: [全部] [2025] [2024] ...
│   ├── 省份: [全部] [安徽] [浙江] ...
│   └── 卷别: [全部] [A卷] [B卷] ...
├── 主区: 试卷列表
│   ├── 每项: 标题 + 年份 + 省份 + 卷别 + 题目数 + tag chips
│   └── 滚动到底加载下一页
└── Tap 单项 → PaperDetailScreen (新)
    ├── 顶: 标题 + 元数据 + Tag
    ├── Scroll: 材料 (intro) + 5 道题列表
    └── Tap 单题 → QuestionScreen (新)
        ├── 顶: 题号 + 题型 + 分值
        ├── 中: 题干 (stem)
        ├── 下: "查看答案" toggle
        │   └── 展开后: 答案正文 + 华图解析
        └── 底部: 上一题 / 下一题
```

新增路由：`PaperDetail` / `Question`（在 `App.tsx` Stack 加）。

---

## 6. 接口契约

### 6.1 客户端 API（`src/api/client.ts`）

```typescript
export async function getPapers(filter: PaperFilter): Promise<{items: Paper[], total: number}>
export async function getPaperDetail(id: string): Promise<PaperDetail>
export async function getPaperAnswer(qid: string): Promise<PaperAnswer>
```

### 6.2 服务端

- `/api/papers` —— 列出所有试卷索引（带 filter）
- `/api/papers/{id}` —— 试卷详情（含题目数组）
- `/api/papers/{id}/answers/{qid}` —— 单题答案

服务端**不**对试卷内容做缓存（每次读盘），但对元数据索引做 5 分钟缓存（与现有 `_article_cache.pkl` 兼容）。

---

## 7. 风险与注意

- **拆题边界**：极少数试卷可能没"作答要求"小节，整卷作 1 题
- **题型识别误判**：复杂题型可能识别错，需要前端给"题型未知"显示 + 留编辑入口（V1 不做编辑）
- **答案匹配**：答案文件可能与题目数量不一致（极少见），fallback 用题号相同位置
- **超大响应**：一份试卷 detail 可能 100+ KB，前端按需加载题目（不预载全部）
- **服务端缓存**：扫 1500+ 文件需要约 1-2 秒，加缓存到 ~50ms

---

## 8. 验收

- [ ] 服务端 `/api/papers` 返回至少 600 个 items
- [ ] 服务端 `/api/papers/{id}` 返回 detail 含 ≥3 道题
- [ ] 客户端 PaperScreen 显示列表 + 详情 + 答案
- [ ] 拆题产物正确（一份卷 5 道题左右）
- [ ] tags 注入（下次会话 AI 一次性处理）
- [ ] APK 重打 + 装机验

---

## 9. 实施顺序

P0:
1. 服务端 `/api/papers` + `/api/papers/{id}` + 答案接口
2. 拆题脚本（一次性扫所有试卷）
3. 客户端 API client (`getPapers/getPaperDetail/getPaperAnswer`)
4. 客户端 PaperScreen / PaperDetailScreen / QuestionScreen 重写
5. App.tsx 加新路由
6. APK 重打 + 装机验