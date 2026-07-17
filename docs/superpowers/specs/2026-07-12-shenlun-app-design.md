# 申论积累 App · 设计规范

> 项目：申论积累 App
> 版本：v1.0
> 日期：2026-07-12
> 状态：已确认，待实现

---

## 一、项目概述

**一句话定义**
> "在墨韵新中式里，日积月累，遇见考场上的自己。"

**核心功能**
仅实现"选卡阅读"这一个核心功能：从云端拉取今日 3 篇时评，支持全文阅读、金句标记、金句库查看。

**目标用户**
备考国家公务员考试的考生（国考 / 省考），有每日晨读习惯。

---

## 二、技术方案

| 维度 | 选择 | 说明 |
|---|---|---|
| 框架 | React Native 0.74 + TypeScript | 复用已有 tsx 组件代码 |
| 状态管理 | React Context + useReducer | 轻量，无需 Redux |
| 数据层 | 云端 REST API + 设备 UUID token | http://124.223.5.144/ |
| 本地缓存 | react-native-mmkv | 存 device_id、已读状态、笔记 |
| 导航 | React Navigation 6（Stack） | 3 个页面：首页/阅读/金句库 |
| 图标 | react-native-vector-icons / AntDesign | 工具栏图标 |
| 字体 | 思源宋体 Source Han Serif SC | 需打包到 android/assets/fonts/ |

---

## 三、页面结构

```
启动页 (Splash) 1.5s
       ↓
首页 (HomeScreen) ←→ 金句库 (GoldScreen)
       ↓ tap 文章
阅读页 (ReaderScreen)
```

---

## 四、页面规格

### 4.1 首页（HomeScreen）

**功能**：展示今日 3 篇文章卡片，支持切换工具栏模式。

**布局**：
- 顶部：日期印章 + 页面标题（"今日 · 申论精读"）
- 卷轴分隔线
- Hero 文案（"晨起三篇，养浩然之气"）
- 工具栏（胶囊按钮 6 格：答案/涂鸦/挖空/编辑/设置/目录）
- 3 张文章卡片（ArticleCard），竖排
- 底部签名语

**工具栏按钮**（当前只实现"答案"）：
- 答案：显示/隐藏答案
- 涂鸦：占坑（P2）
- 挖空：占坑（P2）
- 编辑：占坑（P2）
- 设置：切换亮/暗主题
- 目录：跳转金句库

### 4.2 阅读页（ReaderScreen）

**功能**：全屏阅读单篇文章，支持左右滑翻页、金句标记。

**布局**：
- 顶部：章节标签 + 上一页/下一页箭头
- 标题（大字衬线）
- 卷轴分隔线
- 正文（衬线字体，行高 1.85，首字下沉）
- 底部：进度条（第 X / 3 篇）+ 标记按钮
- 浮层：金句标记时底部弹出一行动话泡

**交互**：
- 长按文字 → 弹出"标记为金句"按钮
- 左右滑 → 切换上/下一篇文章
- 标记金句 → POST 到 `/api/notes`

### 4.3 金句库（GoldScreen）

**功能**：展示用户所有已标记的金句，按主题分组。

**布局**：
- 顶部：标题 + 统计（共 X 条金句）
- 主题分类 Tab（乡村振兴/科技创新/…/全部）
- 金句卡片列表（内容 + 来源文章标题 + 删除按钮）

---

## 五、主题系统

### 5.1 颜色 Token

```typescript
const light = {
  bg:          '#F0EAD6',  // 宣纸
  bgAlt:       '#E8DFC4',  // 次宣纸
  paper:       '#FFFBF0',  // 卡片
  paperDeep:   '#F5EBD0',  // 浮层
  ink:         '#1C1714',  // 主文字
  inkSoft:     '#3D332B',  // 次文字
  inkMuted:    '#8B7355',  // 辅助文字
  inkFaint:    '#B8A88A',  // 极弱文字
  brass:       '#C9A962',  // 铜金
  brassDeep:   '#A88B45',  // 深铜
  seal:        '#C04851',  // 印章红
  sealDeep:    '#8B2635',  // 深红
  jade:        '#5A6B5C',  // 成功/已读
  border:      '#D4C49A',  // 边框
  divider:     'rgba(201,169,98,0.3)', // 分割线
};

const dark = {
  bg:          '#1C1714',  // 深栗
  bgAlt:       '#251E19',  // 浅栗
  paper:       '#2A221C',  // 卡片
  paperDeep:   '#1C1714',  // 浮层
  ink:         '#E8DFD4',  // 主文字
  inkSoft:     '#B8A88A',  // 次文字
  inkMuted:    '#8B7355',  // 辅助文字
  inkFaint:    '#5A4A3A',  // 极弱文字
  brass:       '#C9A962',  // 铜金（不变）
  brassDeep:   '#A88B45',  // 深铜
  seal:        '#C04851',  // 印章红（不变）
  sealDeep:    '#8B2635',  // 深红
  jade:        '#5A6B5C',  // 成功/已读
  border:      '#3D332B',  // 边框
  divider:     'rgba(201,169,98,0.2)', // 分割线
};
```

### 5.2 字体 Token

| 用途 | 字体 | 字号 | 字重 | 行高 |
|---|---|---|---|---|
| 主标题 | SourceHanSerifSC-Heavy | 32px | 800 | 1.2 |
| 卡片标题 | SourceHanSerifSC-Bold | 24px | 700 | 1.3 |
| 正文 | SourceHanSerifSC-Regular | 16px | 400 | 1.85 |
| 章节标签 | KaiTi | 12px | 400 | - |
| 印章文字 | KaiTi-Bold | 12px | 700 | - |
| 元数据 | PingFangSC-Regular | 11px | 400 | - |

### 5.3 间距 Token

```
xs: 4   sm: 8   md: 12   lg: 16   xl: 24   xxl: 32   xxxl: 48
```

### 5.4 动效 Token

| 类型 | 时长 | 缓动 |
|---|---|---|
| 按下反馈 | 150ms | ease-out |
| 状态切换 | 250ms | cubic-bezier(0.4, 0, 0.2, 1) |
| 翻页 | 400ms | cubic-bezier(0.65, 0, 0.35, 1) |
| 印章盖印 | 600ms | ease-in-out（先快后慢） |

---

## 六、API 接口

Base URL: `http://124.223.5.144/`

### 6.1 获取今日卡片

```
GET /api/daily?device_id=<uuid>
```

Response:
```json
{
  "date": "2026-07-12",
  "articles": [
    {
      "id": "xxx",
      "chapter": "复 兴 之 路",
      "title": "中国式现代化",
      "content": "中国式现代化是人口规模巨大的现代化...",
      "highlight": "全体人民共同富裕",
      "source": "学习强国",
      "theme": "政治"
    }
  ]
}
```

### 6.2 获取文章详情

```
GET /api/article/:id
```

Response:
```json
{
  "id": "xxx",
  "chapter": "复 兴 之 路",
  "title": "中国式现代化",
  "content": "全文...",
  "highlights": ["全体人民共同富裕", "人与自然和谐共生"],
  "source": "学习强国",
  "url": "https://www.xuexi.cn/...",
  "theme": "政治",
  "date": "2026-07-10"
}
```

### 6.3 提交金句笔记

```
POST /api/notes
Content-Type: application/json

{
  "device_id": "<uuid>",
  "article_id": "xxx",
  "sentence": "全体人民共同富裕的现代化",
  "article_title": "中国式现代化",
  "theme": "政治",
  "created_at": "2026-07-12T08:30:00Z"
}
```

Response:
```json
{ "id": "note_xxx", "success": true }
```

### 6.4 获取用户金句库

```
GET /api/notes?device_id=<uuid>
```

Response:
```json
{
  "notes": [
    {
      "id": "note_xxx",
      "sentence": "全体人民共同富裕的现代化",
      "article_title": "中国式现代化",
      "theme": "政治",
      "created_at": "2026-07-12T08:30:00Z"
    }
  ],
  "total": 1
}
```

---

## 七、云端改动（card_server.py）

改动点：
1. 所有 GET 接口接受 `device_id` query 参数
2. 新增 `POST /api/notes` 接口（保存金句到 SQLite）
3. 新增 `GET /api/notes` 接口（按 device_id 查询金句）
4. SQLite 表：新增 `notes` 表

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  article_id TEXT,
  sentence TEXT NOT NULL,
  article_title TEXT,
  theme TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notes_device ON notes(device_id);
```

---

## 八、项目结构

```
shenlun-app/
├── src/
│   ├── theme/
│   │   ├── tokens.ts          # 颜色/字体/间距/动效 token
│   │   └── ThemeContext.tsx   # React Context（亮/暗主题）
│   ├── screens/
│   │   ├── HomeScreen.tsx     # 首页（今日卡片）
│   │   ├── ReaderScreen.tsx   # 阅读页（全文+翻页）
│   │   └── GoldScreen.tsx     # 金句库
│   ├── components/
│   │   ├── ArticleCard.tsx    # 文章卡片（含首字下沉/印章）
│   │   ├── ToolBar.tsx        # 工具栏
│   │   ├── Divider.tsx        # 卷轴分隔线
│   │   ├── GoldCard.tsx       # 金句卡片
│   │   └── SplashScreen.tsx   # 启动页
│   ├── api/
│   │   └── client.ts          # 云端 API 封装
│   ├── storage/
│   │   └── mmkv.ts            # 本地 MMKV 封装
│   └── App.tsx                # 根组件（含主题 Provider）
├── android/
│   └── app/src/main/assets/fonts/   # 思源宋体字体文件
├── package.json
├── tsconfig.json
└── react-native.config.js     # 字体配置
```

---

## 九、功能优先级

| 优先级 | 功能 | 页面 |
|---|---|---|
| P0 | 今日卡片浏览 | HomeScreen |
| P0 | 文章详情阅读 | ReaderScreen |
| P0 | 亮/暗主题切换 | 全局 |
| P0 | 云端 API 对接 | 数据层 |
| P1 | 金句标记 | ReaderScreen |
| P1 | 金句库查看 | GoldScreen |
| P2 | 启动页动画 | Splash |
| P2 | 涂鸦笔记 | 占坑 |

---

## 十、验收标准

- [ ] App 名称显示为"申论积累"
- [ ] 启动页：印章 Logo，1.5s 后自动跳转首页
- [ ] 首页：3 篇文章卡片，衬线字体，铜金边框，印章红标签
- [ ] 阅读页：全文显示，首字下沉，长按可标记金句
- [ ] 亮/暗模式：跟随系统设置，App 内可手动切换
- [ ] 金句库：显示所有已标记金句，按主题筛选
- [ ] 数据：从 `http://124.223.5.144/api/daily` 获取
- [ ] 离线：已读过的文章缓存到本地 MMKV，下次打开即时显示

---

## 十一、已知限制

- 字体文件（思源宋体）需要手动下载放入 `android/assets/fonts/`
- 涂鸦笔记（P2）本期不做，留空工具栏按钮
- 多设备同步（P2）本期不做，设备 UUID 换机会丢失数据
