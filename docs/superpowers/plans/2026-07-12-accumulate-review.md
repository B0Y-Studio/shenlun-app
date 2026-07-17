# 积累 Tab 复盘 / 笔记 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ShenlunApp 积累 Tab 内可推子页"复盘"和"笔记"，让学习闭环在积累 Tab 自我即可启动。

**Architecture:** 复用 RN 导航 Stack 推子页；后端补 `/api/articles?id-list=...` 批量接口；客户端用 MMKV 缓存的已读 id 做筛选；按月/按主题两个维度展示。

**Tech Stack:** React Native 0.74 + TypeScript、React Navigation 6 (native-stack)、MMKV 2.12、Python 3 card_server.py、JDK 17 / Gradle 8.6（构建）。

---

## Global Constraints

- 知识库路径固定：`E:/申论知识库/09_选卡阅读/时评/`，不要硬编码分号、反斜杠以外的字符
- 服务端 host：`124.223.5.144:8080`（nginx 80 代理），`card_server.py` 运行在此服务
- 数据库（MMKV）键：旧的不要破坏，新加 `articles_<id>` 也行、也可加 `cached_review_<month>` 等缓存键
- 不破坏 V3 首页定稿：HomeScreen.tsx 主菜单"复盘回顾"、"积累笔记"按按钮对应原来位置
- 字体：复用 `fonts.kai.bold` / `fonts.serif.bold` / `fonts.sans.regular`，与现有 V3 同
- 颜色 token: `t.seal`/`t.brass`/`t.ink`/`t.paper`/`t.border` 等，不引入新色
- 代码改动由浅入深，3-5 分钟一步

---

## Phase 0：基础设施

### Task 0.1：确认卡服务器 SSH 与控制方式

**Files:**
- Touch (validation only): `card_server_bak2.py`、`card_server_patched.py` （仅 sanity check 存在；不动）

**Step:**
- [ ] 验证 SSH key：`ssh -i ~/.ssh/xuexi_tencent -p 2222 root@124.223.5.144 "echo ok"` 期望："ok"
- [ ] 若失败：尝试上一个会话用过的口令（无法无人值守），上报用户
- [ ] 验证服务存活：`curl http://124.223.5.144/api/today?device_id=test` 期望：`{"count": 0, "cards": [], "date": "..."}` 或类似
- [ ] 验证 mmkv.ts 已导出的函数：`grep -E "getReadIds|getCachedArticles" src/storage/mmkv.ts` 期望：找到

**Self-check:**
- 若 SSH 失败，立即暂停 — 不要继续，避免后续服务端改动无人值守

---

## Phase 1：服务端：`/api/articles?id-list=...`

### Task 1.1：在 card_server.py 上加新路由并重启

**Files:**
- Modify: `card_server.py`（在 Python `/opt/xuexi/09_选卡阅读/` 目录下）

**Step 1：本地备份**
```bash
cp card_server.py card_server_bak_p0.py
```

**Step 2：加新路由**

找到 `/api/today` 路由后约 50 行内，插入以下 Python 路由：

```python
@app.route('/api/articles')
def api_articles():
    id_list_raw = request.args.get('id-list', '')
    device_id = request.args.get('device_id', '')
    ids = [s.strip() for s in id_list_raw.split(',') if s.strip()]
    if not ids:
        return jsonify({'items': [], 'missing': [], 'error': 'id-list required'}), 400
    if len(ids) > 200:
        return jsonify({'items': [], 'missing': [], 'error': 'max 200 per request'}), 400

    # 用所有文章的 norm -> 全字段映射
    all_articles = scan_shiping_articles()
    norm_map = {a.get('norm', ''): a for a in all_articles if a.get('norm')}

    items = []
    missing = []
    for nid in ids:
        a = norm_map.get(nid)
        if a:
            items.append({
                'id': nid,
                'norm': a.get('norm', ''),
                'title': a.get('title', ''),
                'date': a.get('date', ''),
                'source': a.get('source', ''),
                'author': a.get('author', ''),
                'tags': a.get('tags', []),
                'content': get_card_body(a.get('norm', '')) or a.get('norm', ''),
                'highlight': '',
            })
        else:
            missing.append(nid)
    return jsonify({'items': items, 'missing': missing})
```

> 注意：`get_card_body(norm)` 在文件顶部已有定义；如果某篇读不出内容，使用 norm 占位。

**Step 3：在本地 sanity 测**

跑一个非阻塞的小脚本，验证接口：
```bash
curl -s "http://124.223.5.144/api/articles?id-list=2026-07-10_产业创新要提出科学问题"  # 期望: items 含一篇
```
  
注意：实际 norm 是 URL 化的中文。先用一篇已知的：
```bash
# 让 Python 拿个真实 norm
python3 -c "
import sys; sys.path.insert(0, '/opt/xuexi/09_选卡阅读')
from card_server import scan_shiping_articles
arts = scan_shiping_articles()
print([a['norm'] for a in arts if '产业创新' in a.get('title','')][:1])
"
```

**Step 4：上传 + 重启服务**

```bash
scp -P 2222 -i ~/.ssh/xuexi_tencent card_server.py root@124.223.5.144:/opt/xuexi/09_选卡阅读/
ssh -i ~/.ssh/xuexi_tencent -p 2222 root@124.223.5.144 "pkill -f card_server.py; sleep 1; cd /opt/xuexi/09_选卡阅读 && nohup python3 card_server.py > /tmp/card_server.log 2>&1 &"
sleep 2
curl -s "http://124.223.5.144/api/today?device_id=test" | head -c 200  # 期望 ≥ 3 篇
```

**Step 5：再次 curl /api/articles 验证**

```bash
IDS=$(ssh -i ~/.ssh/xuexi_tencent -p 2222 root@124.223.5.144 "cd /opt/xuexi/09_选卡阅读 && python3 -c \"
import sys; sys.path.insert(0, '/opt/xuexi/09_选卡阅读')
from card_server import scan_shiping_articles
arts = scan_shiping_articles()
print(','.join(a['norm'] for a in arts[:3]))
\"")
curl -s "http://124.223.5.144/api/articles?id-list=$IDS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('items:', len(d.get('items', [])))
print('missing:', len(d.get('missing', [])))
print('first title:', d['items'][0]['title'] if d.get('items') else 'NONE')
"
```
期望：`items: 3`, `missing: 0`, `first title:` 含真实标题

**Step 6：Commit**

（如有 git：）
```bash
cd /opt/xuexi/09_选卡阅读
git add card_server.py
git commit -m "feat(server): /api/articles?id-list=... 批量查文章"
```

---

## Phase 2：客户端：API client + ModeTabs

### Task 2.1：`getArticlesByIds` 客户端 API

**Files:**
- Modify: `src/api/client.ts`（在 `getArticle` 函数后追加）

**Step 1：加 export 接口**

找到 `getArticle` 函数结尾处，追加：

```typescript
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
```

**Step 2：Type-check**

```bash
cd ShenlunApp && npx tsc --noEmit 2>&1 | grep -E "client.ts|getArticlesByIds"
```
期望：无输出

**Step 3：手工 curl 验证（如果 SSH 畅通）**

```bash
# 已在 Phase 1 验证通过，此步省略（避免重复）
```

---

### Task 2.2：`ModeTabs` 组件

**Files:**
- Create: `src/components/ModeTabs.tsx`

**Step 1：创建文件，写组件**

```tsx
// src/components/ModeTabs.tsx
// 复盘屏用的"按月 | 按主题" 模式切换条 (V3 风格)
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, spacing } from '../theme/tokens';

export interface ModeOption<K extends string = string> {
  key: K;
  label: string;
}

interface Props<K extends string> {
  value: K;
  options: ModeOption<K>[];
  onChange: (key: K) => void;
}

export function ModeTabs<K extends string>({ value, options, onChange }: Props<K>) {
  const { theme } = useTheme();
  const t = theme.tokens;
  return (
    <View style={[styles.bar, { borderColor: t.divider }]}>
      {options.map(opt => {
        const active = opt.key === value;
        return (
          <Pressable key={opt.key} onPress={() => onChange(opt.key)} style={styles.tab} hitSlop={6}>
            <Text
              style={[
                styles.lbl,
                {
                  color: active ? t.seal : t.inkSoft,
                  borderBottomWidth: active ? 3 : 1.5,
                  borderBottomColor: active ? t.seal : t.divider,
                  textShadowColor: active ? t.sealDeep : 'transparent',
                  textShadowRadius: active ? 1 : 0,
                  textShadowOffset: active ? { width: 0, height: 1 } : { width: 0, height: 0 },
                },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xl,
    borderBottomWidth: 1,
  },
  tab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  lbl: {
    fontFamily: fonts.kai.bold,
    fontSize: 18,
    letterSpacing: 4,
    lineHeight: 22,
    paddingBottom: 6,
  },
});
```

**Step 2：Type-check**

```bash
cd ShenlunApp && npx tsc --noEmit 2>&1 | grep -E "ModeTabs"
```
期望：无输出

---

## Phase 3：客户端：ReviewScreen

### Task 3.1：ReviewScreen — 骨架

**Files:**
- Create: `src/screens/ReviewScreen.tsx`

**Step 1：创建文件，写最简骨架（先不接 API，只验证路由能跳转进来）**

```tsx
// src/screens/ReviewScreen.tsx
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { getReadIds, getCachedArticles } from '../storage/mmkv';
import { getArticlesByIds } from '../api/client';
import type { Article } from '../api/client';
import { ModeTabs } from '../components/ModeTabs';
import { tabBus } from '../navigation/tabBus';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

type Mode = 'month' | 'theme';

const MODE_OPTIONS = [
  { key: 'month', label: '按 月' },
  { key: 'theme', label: '按 主 题' },
] as const;

export default function ReviewScreen(props: Props) {
  const { navigation } = props;
  const { theme } = useTheme();
  const t = theme.tokens;
  const [mode, setMode] = useState<Mode>('month');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  // 进来就同步：MMKV 已读 id → 查服务端拿详情 → 缓存兜底
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = getReadIds();
      if (ids.length === 0) {
        if (!cancelled) { setArticles([]); setLoading(false); }
        return;
      }
      // 先从缓存兜底（getDaily 缓存的就有），再补 /api/articles
      const cached = getCachedArticles();
      const cachedById = new Map(cached.map(a => [a.id, a]));
      const missing = ids.filter(id => !cachedById.has(id));
      const baseList: Article[] = ids
        .map(id => cachedById.get(id))
        .filter((x): x is Article => !!x);
      if (!cancelled) setArticles(baseList);

      if (missing.length) {
        const { items } = await getArticlesByIds(missing);
        if (cancelled) return;
        // 合并：按 id 去重
        const seen = new Set(baseList.map(a => a.id));
        const merged = [...baseList, ...items.filter(a => !seen.has(a.id))];
        setArticles(merged);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // 分组
  const groups = useMemo(() => {
    const buckets: Record<string, Article[]> = {};
    for (const a of articles) {
      if (mode === 'month') {
        const k = (a.date ?? '').slice(0, 7) || '其他';
        (buckets[k] ||= []).push(a);
      } else {
        const k = a.chapter || (a as any).tags?.[0] || '其他';
        (buckets[k] ||= []).push(a);
      }
    }
    // 时间倒序；按主题时按数量倒序
    const sorted = Object.entries(buckets).sort(([ka, va], [kb, vb]) => {
      if (mode === 'month') return kb.localeCompare(ka);
      return vb.length - va.length;
    });
    for (const [, arr] of sorted) {
      arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }
    return sorted;
  }, [articles, mode]);

  const onJumpToSource = useCallback((themeKey: string) => {
    tabBus.set('source');
    // setActiveFilter 暂未实现：在 SourceScreen 加 listener 接收，这里 setParams 占位
    try { navigation.setParams({ filterTheme: themeKey } as never); } catch {}
  }, [navigation]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      {/* TopBar */}
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Text style={[styles.back, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>复 盘</Text>
        <Text style={[styles.counter, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          {loading ? '…' : `已读 ${articles.length} 篇`}
        </Text>
      </View>

      <ModeTabs value={mode} options={MODE_OPTIONS as any} onChange={(k: Mode) => setMode(k)} />

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={t.brass} />
            <Text style={[styles.loadingText, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>加载中…</Text>
          </View>
        ) : articles.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
              暂无已读记录，去首页开始第一篇吧。
            </Text>
          </View>
        ) : (
          groups.map(([key, list]) => (
            <View key={key} style={styles.group}>
              <Text style={[styles.groupHead, { color: t.seal, fontFamily: fonts.kai.bold }]}>
                {key}  ·  共 {list.length} 篇
              </Text>
              {list.map(a => (
                <Pressable
                  key={a.id}
                  onPress={() => navigation.navigate('Reader', { id: a.id })}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: t.paper, borderColor: t.border },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.rowDate, { color: t.inkMuted, fontFamily: fonts.serif.regular }]}>
                    {(a.date ?? '').slice(5)}
                  </Text>
                  <View style={styles.rowBody}>
                    <Text
                      style={[styles.rowTitle, { color: t.ink, fontFamily: fonts.serif.bold }]}
                      numberOfLines={2}
                    >
                      {a.title || '无题'}
                    </Text>
                    <View style={styles.tagsRow}>
                      {(a as any).tags?.slice(0, 4).map((tg: string) => (
                        <Pressable
                          key={tg}
                          onPress={() => onJumpToSource(tg)}
                          style={({ pressed }) => [
                            styles.tag,
                            { borderColor: t.brass },
                            pressed && { backgroundColor: `${t.brass}22` },
                          ]}
                        >
                          <Text style={[styles.tagText, { color: t.brassDeep, fontFamily: fonts.kai.regular }]}>
                            {tg}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={[styles.rowMeta, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
                      {a.source || ''}  ·  {a.author || ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ))
        )}

        <Text style={[styles.footer, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
          案 牍 劳 形 · 不 废 研 读
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: borders.hair,
  },
  backBtn: { width: 60 },
  back: { fontSize: fontSizes.body },
  title: { flex: 1, fontSize: fontSizes.subtitle, letterSpacing: 4, textAlign: 'center' },
  counter: { fontSize: fontSizes.caption, width: 70, textAlign: 'right', letterSpacing: 2 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  loadingText: { marginTop: spacing.sm, fontSize: fontSizes.body, letterSpacing: 4 },
  empty: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  emptyText: { fontSize: fontSizes.body, letterSpacing: 3, paddingHorizontal: spacing.lg, textAlign: 'center' },
  group: { marginBottom: spacing.lg },
  groupHead: { fontSize: fontSizes.body, letterSpacing: 4, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderWidth: borders.hair, borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  rowDate: { fontSize: fontSizes.caption, width: 36, paddingTop: 2, letterSpacing: 1 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: fontSizes.body, lineHeight: 22 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.xs },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderRadius: 2 },
  tagText: { fontSize: 10, letterSpacing: 1 },
  rowMeta: { fontSize: 10, letterSpacing: 1, marginTop: spacing.xs },
  footer: { textAlign: 'center', fontSize: 11, letterSpacing: 6, marginTop: spacing.lg },
});
```

**Step 2：Type-check**

```bash
cd ShenlunApp && npx tsc --noEmit 2>&1 | head -30
```
期望：无输出（如果在 mmkv.ts / client.ts 里没找到导出，先停）

---

### Task 3.2：扩展 `Article` 类型以含 tags

**Files:**
- Modify: `src/storage/mmkv.ts`（`Article` 接口）

**Step 1：加 `tags` 字段为可选**

```typescript
export interface Article {
  id: string;
  chapter: string;
  title: string;
  date: string;
  content: string;
  highlight?: string;
  source: string;
  author: string;
  theme: string;
  tags?: string[];   // ← 新
}
```

**Step 2：补 `getArticlesByIds` 写入 tags**

（已在 Task 2.1 的 mapper 中——若你复制上面代码时漏了 tags，补：）
```typescript
// inside mapper .map(card => ({...})):
tags: card.tags ?? [],
```

**Step 3：Type-check**

```bash
cd ShenlunApp && npx tsc --noEmit 2>&1 | head -20
```
期望：无输出

---

## Phase 4：接入导航

### Task 4.1：App.tsx 加 Review 路由 + Notes 重映射

**Files:**
- Modify: `src/App.tsx`

**Step 1：在 `RootStackParamList` 加字段**

```typescript
export type RootStackParamList = {
  Main: undefined;
  Review: undefined;
  Reader: { id: string };
  Gold: undefined;
};
```

**Step 2：加 Review 屏**

```tsx
import ReviewScreen from './screens/ReviewScreen';
...
<Stack.Screen name="Review" component={ReviewScreen} />
```

**Step 3：测试 build**

```bash
cd ShenlunApp/android && JAVA_HOME="C:\Users\hecto\jdk17\jdk-17.0.19+10" ./gradlew.bat assembleDebug -x lint --no-daemon 2>&1 | tail -10
```
期望：`BUILD SUCCESSFUL`

---

### Task 4.2：HomeScreen 主菜单"复盘 / 笔记"改跳子页

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

**Step 1：在 `onMenuItem` 函数里替换**

```typescript
const onMenuItem = (key: string) => {
  if (key === 'review') { navigation.navigate('Review'); return; }
  if (key === 'note')   { navigation.navigate('Gold'); return; }
  const tabMap: Record<string, string> = {
    source: 'source', paper: 'paper', analysis: 'analysis',
  };
  const target = tabMap[key];
  if (target) tabBus.set(target);
};
```

**Step 2：Type-check + Build**

```bash
cd ShenlunApp && npx tsc --noEmit 2>&1 | head -10
cd ShenlunApp/android && JAVA_HOME="C:\Users\hecto\jdk17\jdk-17.0.19+10" ./gradlew.bat assembleDebug -x lint --no-daemon 2>&1 | tail -10
```
期望：两行都 BUILD / 无错误

---

## Phase 5：SourceScreen 接收"传过滤项"

### Task 5.1：SourceScreen 加 setActiveFilter + 路由参数监听

**Files:**
- Modify: `src/screens/SourceScreen.tsx`
- Modify: `src/App.tsx`（让 Main 通过 setParams 给 SourceScreen 注入 filterTheme）

**Step 1：tabBus 加 setActiveFilter 能力**

`src/navigation/tabBus.ts` 改成：

```typescript
type Filter = Record<string, any>;
type Listener = (key: string, payload?: { filter?: Filter }) => void;

let currentListener: Listener | null = null;

export const tabBus = {
  bind(listener: Listener): () => void {
    currentListener = listener;
    return () => { currentListener = null; };
  },
  set(key: string, payload?: { filter?: Filter }): void {
    currentListener?.(key, payload);
  },
};
```

**Step 2：App.tsx 里 RootNavigator 同步 activeFilter**

```typescript
const [activeKey, setActiveKey] = useState<string>('home');
const [activeFilter, setActiveFilter] = useState<Record<string, any>>({});

useEffect(() => {
  return tabBus.bind((k, payload) => {
    setActiveKey(k);
    if (payload?.filter) setActiveFilter(payload.filter);
  });
}, []);
```

把 activeFilter 通过一个 React Context 传下去，例如：

```tsx
// 在 App.tsx 加一个简单 context
import React, { createContext, useContext } from 'react';
const ActiveFilterContext = createContext<Record<string, any>>({});
export const useActiveFilter = () => useContext(ActiveFilterContext);

// 包裹 MainTabs
<ActiveFilterContext.Provider value={activeFilter}>
  <MainTabs activeKey={activeKey} setActiveKey={setActiveKey} />
</ActiveFilterContext.Provider>
```

**Step 3：SourceScreen 监听 filterTheme**

```tsx
import { useActiveFilter } from '../App';
...
export default function SourceScreen() {
  const filter = useActiveFilter();
  const filterTheme = filter.theme;
  // 现在SourceScreen可用 filterTheme（先打印提示）
  useEffect(() => {
    if (filterTheme) console.log('[Source] filter theme=', filterTheme);
  }, [filterTheme]);
  // ...原内容
}
```

**Step 4：更新 HomeScreen onJumpToSource 走带过滤项的 set**

```typescript
// 在 ReviewScreen onJumpToSource:
const onJumpToSource = useCallback((themeKey: string) => {
  tabBus.set('source', { filter: { theme: themeKey } });
}, []);
```

**Step 5：Type-check + Build**

```bash
cd ShenlunApp && npx tsc --noEmit 2>&1 | head -10
cd ShenlunApp/android && JAVA_HOME="C:\Users\hecto\jdk17\jdk-17.0.19+10" ./gradlew.bat assembleDebug -x lint --no-daemon 2>&1 | tail -5
```
期望：BUILD SUCCESSFUL

---

## Phase 6：端到端验收

### Task 6.1：验收清单（人工或截图）

**Step 1：核对 P0 验收 1-6**

打开 `app-debug.apk`（已签好）装到设备/模拟器，依次核：

| # | 操作 | 期望 |
|---|---|---|
| 1 | 进首页 → 点"伍 积累笔记" | 跳 GoldScreen，金句列表 |
| 2 | 进首页 → 点"壹 复盘回顾" | 跳 ReviewScreen，按月默认 |
| 3 | ReviewScreen 切"按主题" | 主题分组出现 |
| 4 | 点 ReviewScreen 任一篇 | 跳 ReaderScreen |
| 5 | 按月模式点主题 tag | 切到素材 Tab（控制台打 [Source] filter theme=...） |
| 6 | 关网络重开 | ReviewScreen 仍能显示（用 MMKV 缓存的 getDaily 那个） |

**Step 2：用 logcat 验证关键节点**

```bash
# Android
adb logcat -s ReactNativeJS:I | grep -E "Source|Review"
```

---

## 验收后清理

- [ ] 把 `card_server_bak_p0.py` 留作回滚依据，注释清楚
- [ ] APK 拷贝到 `C:/Users/hecto/ZCodeProject/app-debug.apk`
- [ ] 不再单独通知，写到 `docs/superpowers/specs/...` 末尾的 "Status" 一行
