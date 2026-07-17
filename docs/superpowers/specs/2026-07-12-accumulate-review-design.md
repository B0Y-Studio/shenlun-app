# 积累 Tab 复盘 / 笔记 设计文档

> **日期**: 2026-07-12
> **项目**: 申论精读 (ShenlunApp)
> **作者**: ZCode (brainstorming)
> **状态**: 已确认，待写实施计划

---

## 1. 背景与目标

### 1.1 背景
- 用户已完成 V3 首页定稿（5 个 Tab、状态栏同色、宣纸 + 印章红 + 黄铜金）
- 知识库现状：1,234 篇时评，已按月分目录、按 frontmatter 全打 tag（12 主题 + 多来源 + 时节）
- 当前积累 Tab（HomeScreen）只显示 5 行主菜单入口按钮，但点击的"复盘回顾"和"积累笔记"目的地混乱

### 1.2 目标
建立"学习闭环"分支结构：
- **积累** = 输入（每日阅读、复盘）→  **素材** = 储备（主题库）→ **题目** = 应用（真题练习）→ **分析** = 反哺（数据建议）→ 回到积累
- P0：让"积累 Tab"内可推子页"复盘"和"笔记"，闭环从积累自我即可启动

### 1.3 范围
- **In**: 复盘页（按月 / 按主题二选切换）、复用 GoldScreen 做笔记、新增 `/api/articles` 批量接口
- **Out**: 真实题库、AI 评卷、跨 Tab 跳数据埋点、主题/来源矩阵筛选（P1+）

---

## 2. 信息架构

### 2.1 全局 5 Tab + Stack
```
Stack.Navigator
  ├─ Main                  (外层包 5 Tab)
  │   ├─ Home (积累)        ←── default activeKey='home'
  │   ├─ Source (素材)
  │   ├─ Paper (题目)
  │   ├─ Analysis (分析)
  │   └─ Settings (设置)
  ├─ Review                (积累 Tab 内推：复盘)
  ├─ Notes                 (积累 Tab 内推：笔记 → 复用 GoldScreen)
  ├─ ArticleList           (公共：按 theme/source 批量浏览)        [P0 不实现]
  └─ Reader                (已有：单篇阅读)
```

### 2.2 路由 API
| 路由 | 入参 | 出参 | 备注 |
|---|---|---|---|
| `Main` | — | — | 外层壳，按 activeKey 渲染 Tab 内容 |
| `Review` | `{ tab: 'home', initialFilter?: {mode:'month'\|'theme', key?:string} }` | — | 复盘屏 |
| `Notes` | — | — | 直接复用 GoldScreen，不另写 |
| `Reader` | `{ id: string }` | — | 已有，未改 |

### 2.3 跨 Tab 跳转矩阵

| 起点 → 终点 | 触发 | 实现 |
|---|---|---|
| 积累·复盘/笔记 → 阅读页 | 点单篇 | `navigation.navigate('Reader', { id })` |
| 阅读页 → 标记金句 → 笔记 | 标记后弹窗按钮 | `navigation.navigate('Notes')` |
| 复盘屏（按主题模式）→ 素材 Tab · 同主题 | 点主题 tag | `tabBus.set('source')` + `setActiveFilter({theme})` |
| 主菜单·"素材学习" | 点 | `tabBus.set('source')` |
| 主菜单·"题目练习" | 点 | `tabBus.set('paper')` |
| 主菜单·"分析建议" | 点 | `tabBus.set('analysis')` |
| 主菜单·"复盘回顾" | 点 | `tabBus.set('home')` + `navigate('Review')` |
| 主菜单·"积累笔记" | 点 | `tabBus.set('home')` + `navigate('Notes')` |

---

## 3. 复盘屏（ReviewScreen）规格

### 3.1 屏幕结构
```
SafeAreaView (背景: t.bg)
├─ TopBar             ← 返回 + 「复盘」标题 + 主题模式计数器（"N 篇已读"）
├─ Toggle (ModeTabs)  ← 按月 | 按主题（默认 "按月"）
│   └─ 当前项下加 印章红 3px 下划线（与 TabBar 一致）
├─ Body (ScrollView)
│   ├─ 按月模式：按"YYYY-MM"分组合并显示
│   │   ├─ 2026-07    (共 87，本月已读 12)
│   │   │   ├─ 7-10  《"产业创新要提出科学问题"》  人民日报  [科技创新·经济发展]
│   │   │   ├─ 7-08  《"展示了马克思主义的强大生命力"》 新华社  [科技·党建·经济...]
│   │   │   └─ ...
│   │   └─ 2026-06    (共 211，已读 N)
│   │       └─ ...
│   │   [每篇右侧的 tag 是可点击的"主主题按钮"（印章红字），表示跳素材 Tab 同主题]
│   └─ 按主题模式：按 12 主题分组合并
│       ├─ 经济发展 (1099 篇，已读 36)
│       │   ├─ 2026-07-10 《"产业创新要提出科学问题"》 [科技]
│       │   └─ ...
│       └─ 民生 (807 篇，已读 22)
└─ Empty State (空白)：v"今日新阅读 + 主菜单·今日待做 + 一个月会因读"
```

### 3.2 数据来源
- **`readIds: string[]`** — 来自 MMKV（已有 `getReadIds()`）
- **批量文章**: 新增 `GET /api/articles?id-list=<csv>`
- 客户端组合：按 date（或 tags[0]）分组，每组做时间倒序

### 3.3 交互
| 操作 | 反馈 |
|---|---|
| 点 ModeTabs | 切下方 Body；状态保持 |
| 点 单篇 | `navigate('Reader', { id })` |
| 点 主题 tag (按月模式) | tabBus.set('source') + setActiveFilter({theme}) |
| 空状态 | 引导点「素材学习」/「今日待做」 |

---

## 4. 服务端：新增 `/api/articles`

### 4.1 接口
```
GET /api/articles?id-list=a,b,c&device_id=xxx

200 OK
{
  "items": [
    {
      "id": "...",
      "norm": "...",
      "title": "...",
      "date": "2026-07-10",
      "source": "人民日报",
      "author": "...",
      "tags": ["科技创新", ...],
      "content": "...",
      "highlight": "..."
    },
    ...
  ],
  "missing": ["abc", "def"]   // 服务端拿不到的 id
}
400 Bad Request  (id-list > 200 或缺参数)
503 Server Error
```

### 4.2 实现要点（Python，card_server.py）
- 复用 `scan_shiping_articles()` 拿 `all_articles: [{file_path, title, date, source, author, tags, norm}]`
- 用 `norm` 反查：`id` 与 `norm` 是同一字符串（客户端用 norm 当 id）
- 缺文章返回 `missing` 字段；不抛异常
- 限制：单次最多 200 id

### 4.3 性能与容错
- 缓存每篇文章 24h（不必要，但降 I/O）
- 文件名拼错时跳进 `missing`
- 修双 frontmatter 解析失败的文件 → 进 `missing`

---

## 5. 客户端实现清单

### 5.1 文件改动
| 文件 | 动作 | 内容 |
|---|---|---|
| `src/api/client.ts` | 加 | `getArticlesByIds(ids: string[]): Promise<Article[]>` |
| `src/screens/ReviewScreen.tsx` | 新建 | 复用 Home 的"白卡"风格 |
| `src/screens/HomeScreen.tsx` | 改 | 主菜单`复盘/笔记`改为走 navigate('Review')/navigate('Notes') |
| `src/App.tsx` | 改 | Stack 加 `Review`、`Notes=GoldScreen` |
| `src/theme/tokens.ts` | 加 | `REVIEW_FILTER_INITIAL` 常量、Toggle 类型 |
| `card_server.py` | 改 | 加 `/api/articles` 路由 + dedup by norm |
| `card_server_bak*.py` | 不动 | 仅作回滚用 |

### 5.2 新组件
**`src/components/ModeTabs.tsx`** — 模式切换条（按月 | 按主题）
- props: `{ value, onChange, options: {key,label}[] }`
- 复用 TabBar 视觉：`fontFamily: kai.bold`, `fontSize: 18` + active 红下划线
- 注意：和 TabBar 区分（更矮）

### 5.3 服务部署
1. 重写 `card_server.py`：加 `/api/articles` 路由
2. 重启服务：`pkill -f card_server && nohup python3 card_server.py &`
3. 健康检查：`curl http://124.223.5.144/api/articles?id-list=test`

### 5.4 验收
1. App 进首页 → 点"伍 积累笔记" → 跳 GoldScreen，看到已有金句
2. App 进首页 → 点"壹 复盘回顾" → 看到 ReviewScreen，按月默认，列已读项
3. ReviewScreen 切"按主题" → 主题分组；每条卡片显示来源
4. 点单篇 → ReaderScreen 正常
5. 按月模式点主题 tag → 切到素材 Tab，传过滤项
6. 关网络 → ReviewScreen 显示降级（用 MMKV 缓存的文章）

---

## 6. 非目标（明确不做）

- 主题/来源矩阵浏览（P1）
- 真题题库 + AI 评卷（P2）
- 阅读时长 / 主题分布饼图（P2）
- 导出笔记 / 同步至服务端（P3）
- 字号设置（P3）

---

## 7. 风险

- **后端**：批量查询大量文件慢 — 单次 ≤ 200，前端提前按月分组（默认按月下不超 50 条）
- **MMKV 容量**：已读 id 上限 1000（已有函数）
- **review 屏空状态**：网络/缓存均为空时，引导加插画

---

## 8. 实现顺序

1. [ ] 服务端：加 `GET /api/articles` 接口（先服务端 demo 测）
2. [ ] 客户端：加 `getArticlesByIds`
3. [ ] 客户端：建 `ModeTabs` 组件
4. [ ] 客户端：建 `ReviewScreen`（连网络 → 缓存降级 → 空态）
5. [ ] 客户端：改 HomeScreen 主菜单入口
6. [ ] 客户端：改 App.tsx Stack 路由
7. [ ] 打包 APK + 设备验
