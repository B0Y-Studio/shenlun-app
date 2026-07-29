# AI 评卷功能 — 设计文档

**状态**：草案 v0.9（待用户审阅）
**日期**：2026-07-29
**作者**：ZCode（brainstorming 协作产出）

## 1. 目标

在 ShenlunApp 内集成"AI 申论评卷"：用户从真题选题 → 粘贴/手打答案 → LLM 评分 → 多维度反馈与历史回看。

不引入图片链路（用户环境敏感词约束 + 避免 OCR 复杂度）。
不引入服务端 LLM Key 持有（用户自付 + 用户自管）。

## 2. 已确定的设计决策（来自 brainstorming）

| # | 决策 | 备注 |
|---|---|---|
| D1 | 输入方式 = 纯文本 | 文本框输入或粘贴；预留 `image` 字段供 V2 |
| D2 | Rubric 来源 = LLM 即评即生 | 用 5 维度模板（立意/结构/论据/语言/字数），无需预存 |
| D3 | LLM = App → Server → LLM 厂商 | Server 中转，能加限流/缓存/审计/同步 |
| D4 | Key 存 = App 上传，Server 端 Fernet 加密存 SQLite | 多设备共享；Server 不存明文 |
| D5 | 评卷结果 = 5 维度 + 总体评语 + 亮点/不足 + 重写建议 | 渲染为多卡片 |
| D6 | 历史 = 本地 MMKV + Server SQLite（多设备同步） | Server 兜底，本地为先 |
| D7 | 流式 = Server 流式转发 LLM delta，App 端打字机显示，末尾按括号深度切 JSON | 用户体验好 |
| D8 | LLM 提供商 = 3 预设（DeepSeek / 豆包 / OpenAI）+ 自定义 | 高级用户可填 base_url + model |
| D9 | 服务端 0 依赖新增 | 全部走 stdlib（urllib / sqlite3 / http.server） |
| D10 | 限流 = Server 端每 device_id 5 次/分钟 | 防止刷量 |

## 3. 架构

```
┌──────────────────── 客户端 (RN) ────────────────────┐
│ 入口:                                               │
│  - PaperScreen 题详情页右上"🤖 AI 评卷"按钮          │
│  - AnalysisScreen 现有"AI 评卷"卡片（保留）           │
│                                                     │
│ JudgeScreen:                                        │
│  - 选题（默认带 context 跳过来）                    │
│  - TextInput 多行输入                               │
│  - "开始评卷" 按钮                                  │
│                                                     │
│ src/llm/                                            │
│  - provider.ts: 3 预设 + 自定义 base_url             │
│  - prompt.ts: system / user 模板                    │
│  - client.ts: SSE 流式解析                          │
│  - judgeStore.ts: 历史 CRUD（MMKV）                 │
│                                                     │
│ ErrorBoundary 包裹                                  │
└─────────┬───────────────────────────────────────────┘
          │ HTTPS (TLS)
          ▼
┌──────────────────── 服务端 (Python) ─────────────────┐
│ card_server.py 新增路由:                            │
│  - POST /api/judge/llm-config                       │
│  - GET  /api/judge/llm-config                       │
│  - DELETE /api/judge/llm-config                     │
│  - POST /api/judge/run (SSE 流式)                   │
│  - GET  /api/judge/history?device_id=&limit=        │
│  - GET  /api/judge/<id>                             │
│  - DELETE /api/judge/<id>                           │
│                                                     │
│ 新增 SQLite: _records/judge.db                      │
│  - llm_config (device_id PK)                        │
│  - judge_history (id PK)                            │
│  - judge_index (device_id, created_at)              │
│                                                     │
│ 加密: Fernet，对称密钥                              │
│  - 优先读环境变量 JUDGE_FERNET_KEY                  │
│  - 缺失则启动时生成 → 写 _records/.fernet_key        │
│                                                     │
│ LLM 调用: urllib (POST chat/completions)            │
│  - 读 llm_config.api_key_cipher → decrypt           │
│  - 加 Authorization: Bearer <key>                   │
│  - stream=true → 逐 chunk read → 推给 client        │
│  - 失败 → 401/429/502 透传                          │
│  - 限流: 内存字典 {device_id: [timestamps]}         │
└─────────┬───────────────────────────────────────────┘
          │ HTTPS
          ▼
   api.deepseek.com / ark.cn-beijing.volces.com / api.openai.com
```

## 4. 数据契约

### 4.1 POST /api/judge/llm-config

请求：
```json
{
  "device_id": "uuid",
  "provider": "deepseek" | "doubao" | "openai" | "custom",
  "base_url": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "api_key": "sk-xxx"
}
```

后端行为：
- `api_key` 接收后立即用 Fernet 加密
- upsert 到 `llm_config`
- 响应：仅回 `{ok: true, provider, base_url, model, updated_at}`，**不返回 api_key**

### 4.2 GET /api/judge/llm-config?device_id=

响应：
```json
{
  "configured": true,
  "provider": "deepseek",
  "base_url": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "updated_at": "2026-07-29T10:00:00Z"
}
```

App 用此判断"是否已配置"，不返回 key。

### 4.3 POST /api/judge/run

请求：
```json
{
  "device_id": "uuid",
  "question": {
    "id": "2024-guokao-q-1",
    "title": "概括...",
    "body": "...",
    "score": 20,
    "question_no": "一"
  },
  "user_answer": "..."
}
```

后端：
1. 查 llm_config，无 → 返 400 `{error: "no_llm_config"}`
2. 限流检查（5/min）超 → 返 429
3. 拼 prompt（见 §6）
4. urllib POST 到 `<base_url>/v1/chat/completions` (OpenAI 兼容)
   - `stream: true`
   - **不设** `response_format`（与 stream 不兼容，详见 §6.2）
5. 流式转发：
   - Server 边读 chunk → 边 `self.wfile.write(chunk)` 给 client
   - Content-Type: `text/event-stream`
6. 流关闭后：
   - 拼出完整 response
   - 解析 JSON（容错：失败存原文）
   - 写 `judge_history`（异步线程，不阻塞连接）
7. 返 SSE 结束 marker：`data: [DONE]\n\n`

响应（SSE 事件流）：
```
data: {"delta":"<text>"}

data: {"delta":"..."}

...

data: {"result": <完整 JSON>}

data: [DONE]
```

### 4.4 GET /api/judge/history?device_id=&limit=20

响应：
```json
{
  "items": [
    {
      "id": "judge-uuid",
      "question_id": "2024-guokao-q-1",
      "question_title": "概括...",
      "question_score": 20,
      "total_score": 16,
      "created_at": "2026-07-29T10:30:00Z"
    }
  ]
}
```

### 4.5 DELETE /api/judge/<id>

无 body，返 `{ok: true}`。

## 5. 客户端 UI

### 5.1 JudgeScreen（评卷主屏）

布局：
```
┌────────────────────────────┐
│  ←  返回          评卷历史  │  顶栏
├────────────────────────────┤
│  ┌──────────────────────┐  │
│  │ 题目信息卡            │  │  分值 / 题干前 200 字
│  │ 第X题  ·  XX分        │  │
│  │ 概括...               │  │
│  │ [换题]                │  │
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │ TextInput 多行        │  │  minHeight 200
│  │  粘贴/输入答案...      │  │
│  │                       │  │
│  │  字数: 0 / 800+        │  │  底部实时
│  └──────────────────────┘  │
│                            │
│   [   开始评卷 →    ]       │  醒目的 seal 色
│                            │
│  评卷过程区（出现时展开）  │
│  ┌──────────────────────┐  │
│  │ 正在评卷中...         │  │  + 打字机流式文字
│  │ <流式评语内容>        │  │
│  └──────────────────────┘  │
│                            │
│  评卷结果（解析后展开）    │
│  ┌──────────────────────┐  │
│  │ 总分  16 / 20  ⭐      │  │
│  ├──────────────────────┤  │
│  │ 立意 5/5   ✓ 扣题      │  │  5 维度横向卡片
│  │ 结构 4/5   论述清晰     │  │
│  │ ...                   │  │
│  ├──────────────────────┤  │
│  │ ✨ 亮点                │  │
│  │  - ...                │  │
│  │ ⚠ 不足                │  │
│  │  - ...                │  │
│  │ 📝 重写建议            │  │
│  │  ...                  │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

### 5.2 JudgeHistoryScreen（评卷历史）

- 顶栏"评卷历史"按钮 → 进入
- 列表：每行显示 `第X题  16/20  7-29 10:30` + 右滑删除

### 5.3 SettingsScreen（设置屏新增 LLM 配置区）

- 区块标题：「AI 评卷 · LLM 配置」
- 显示当前 `provider / base_url / model`（不显示 key）
- 点"修改"进入 LlmConfigScreen：
  - 4 个 radio：DeepSeek / 豆包 / OpenAI / 自定义
  - 选预设后：base_url 和 model 自动填入占位
  - 用户可改 base_url / model
  - api_key 输入框（password 类型）
  - "保存" → POST /api/judge/llm-config
  - "测试连接" → POST /api/judge/run with `{question: dummy, user_answer: "test"}`，看是否成功（**会真发请求，会扣一次 LLM 调用费**，按钮上加注）

### 5.4 PaperScreen 入口

题详情页右上角加"🤖 AI 评卷"按钮 → `navigation.navigate('Judge', { question })`

## 6. Prompt 模板

### 6.1 System Prompt

```
你是申论阅卷老师。用户提交了一道申论题答案，请按官方评分维度评判并以严格 JSON 返回。

维度与权重（按题目分值等比缩放，本题总分为 {SCORE} 分）：
- 立意 (25%): 是否扣题、观点是否明确、是否切合题意
- 结构 (20%): 是否总分/并列/递进，开头结尾是否呼应，段落逻辑是否清晰
- 论据 (25%): 是否充实、是否结合材料/时政/案例、数据是否准确
- 语言 (20%): 表达是否规范、是否书面化、有无语病/口语化
- 字数 (10%): 是否达到题目要求（一般 ≥ 800 字达标）

输出格式（**只返回 JSON，不要任何其他文字，不要用 ```json 包裹**）：
{
  "commentary": "<一段流式评语，长度 200-400 字>",
  "total": <0-{SCORE}>,
  "dimensions": [
    {"key": "theme",    "score": <0-{SCORE}*0.25>, "comment": "<一句话点评>"},
    {"key": "structure","score": <0-{SCORE}*0.20>, "comment": "<一句话点评>"},
    {"key": "argument", "score": <0-{SCORE}*0.25>, "comment": "<一句话点评>"},
    {"key": "language", "score": <0-{SCORE}*0.20>, "comment": "<一句话点评>"},
    {"key": "wordcount","score": <0-{SCORE}*0.10>, "comment": "<一句话点评>"}
  ],
  "highlights": ["<亮点1>", "<亮点2>", "<亮点3>"],
  "weaknesses": ["<不足1>", "<不足2>", "<不足3>"],
  "rewrite_hint": "<一段话：建议重写方向，100-200 字>"
}
```

### 6.2 关于 stream + json_object 冲突

OpenAI 协议中 `response_format: {type: json_object}` 与 `stream: true` **不兼容**。解决方案：

- **本设计采用**：不设 `response_format`，让 LLM 自由输出
- Prompt 强约束："只返回 JSON，不要任何其他文字"
- App 端解析：边收 `delta.content` 累加 → 检测到第一个 `{` 开始记录 → 检测到匹配的 `}` （按括号深度 = 0）切出 JSON → 解析
- 解析失败：把整段文本作为"评语"显示，提示"结构化评分失败"

### 6.3 User Prompt 模板

```
题目：{question.title}
分值：{question.score} 分
题型：申论

题干（节选）：
{question.body 的前 300 字，如更长截断并加 "..."}

用户答案（{字数} 字）：
{user_answer}

请按 System Prompt 中定义的维度评判并只返回 JSON。
```

## 7. 错误处理

| 错误源 | HTTP | App 处理 |
|---|---|---|
| 缺 llm_config | 400 | 弹"请到设置配置 LLM" |
| LLM Key 无效 (401/403) | 401 | 弹"Key 无效或过期，请到设置修改" |
| LLM 限流 (429) | 429 | 弹"调用过快，请稍候 1 分钟"，保留输入 |
| LLM 5xx | 502 | 弹"评卷服务暂不可用，可重试"，保留输入 |
| 网络断 (catch) | - | 弹"网络异常" |
| JSON 解析失败 | - | 渲染纯评语卡，提示"评分维度解析失败" |
| 用户答案 < 50 字 | - | 客户端拦截，提示"答案至少 50 字" |
| LLM 超时 60s | 504 | 弹"评卷超时"，保留输入 |

所有错误：用户输入不丢，可点"重试"。

## 8. 隐私

- **API Key**：明文在 App → 立即 HTTPS POST 到 Server → Server 端 Fernet 加密后存 SQLite。Server 启动日志不打印 key。
- **题目 + 答案**：仅在评卷请求时（POST /api/judge/run）经 Server 透传到 LLM 厂商，不存 SQLite（不写 history 直到流结束）。流结束后写 history，body 和 user_answer 都存。
- **历史记录**：App 端 MMKV + Server 端 SQLite 双向同步。删除时双向删。
- **限流日志**：仅记 `device_id` + `endpoint` + `timestamp`，不记内容。
- **可关闭**：SettingsScreen 加"云同步评卷历史"开关，关掉后只写本地。

## 9. 测试

### 9.1 服务端单元（pytest 或 stdlib unittest）

- `test_encrypt_decrypt.py`：Fernet 加解密 round-trip
- `test_rate_limit.py`：5 次/min 第 6 次 429
- `test_prompt_build.py`：system + user prompt 模板正确性
- `test_history_crud.py`：upsert / list / delete
- `test_no_config.py`：未配置 LLM 返 400

### 9.2 客户端单元

- `provider.test.ts`：3 预设的 base_url 正确
- `prompt.test.ts`：模板填空正确，字数统计正确
- `client.test.ts`：SSE 解析正确（mock fetch 返回 SSE 流）
- `judgeStore.test.ts`：MMKV CRUD

### 9.3 端到端（手动）

1. 安装新 APK（先 SettingsScreen 配置 DeepSeek Key）
2. PaperScreen 任一题 → 🤖 AI 评卷
3. 粘贴一段 200 字申论答案
4. 点"开始评卷"
5. 观察：loading → 流式评语 → 多卡片渲染
6. 关闭 App 重开：评卷历史保留
7. 删一条历史：本地 + Server 都删

## 10. 风险与回滚

| 风险 | 缓解 |
|---|---|
| LLM 厂商接口变更 | 保留 3 预设 + 自定义 base_url |
| 评卷质量差 | Prompt 模板预留迭代位，V1.1 可热更新 prompt |
| Server 端加解密失误 | 启动时自检：写一个测试 key，加密→解密 round-trip |
| 流量超限被厂商封 | 限流 + Server 端缓存"相同 question+answer 的最近一次结果" 5 分钟 |
| 内存中的限流字典泄漏 | 不存敏感数据；进程重启清零 |
| .fernet_key 丢失 | 启动时检测：若 key 文件存在但无法解密 → **强制清空** llm_config 表中所有行并重新生成 key（要求用户重配），warn 日志 |

## 11. 后续 (V2+)

- 多模态：上传手写答案图片（image 字段已在请求体预留）
- 自动按高频主题推荐题：复用 `getAnalyticsThemes` 输出
- 评卷历史导出为学习报告 PDF
- 班级/小组模式：teacher 创建题 → students 提交 → teacher 看 dashboard
- 离线 rubric：对题库中已有"评分要点"字段的题直接对照
- LLM 改写：基于 weaknesses + rewrite_hint 一键生成改写版
