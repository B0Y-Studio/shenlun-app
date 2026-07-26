// src/screens/SourceScreen.tsx
// 素材学习 Tab —— 按主题/来源/日期 查看全量素材库（V3 风格）
// 数据源：服务端 POST /api/articles（带过滤）
// 离线降级：服务端失败时返回 MMKV 缓存
// 跳转协议：从 ReviewScreen 点 tag chip → tabBus.set('source', { filter: { theme } }) 预填主题
//   presetThemeRef: 挂载时一次性快照 activeFilter?.theme
//   - 当前架构: MainTabs 用 {activeKey === 'source' && <SourceScreen />} 条件渲染，
//     切 Tab 时 SourceScreen 会 unmount→remount，每次挂载重新读 activeFilter
//   - 当前 ref 等价于 useState，保留 ref 是为了未来切到 React Navigation Tab Navigator
//     (keep-alive) 时仍然有效，注释里说明这个前提
//   - 副作用：若 MainTabs 未来改成 keep-alive (lazy=false, unmountOnBlur=false)，
//     屏内 tabBus 切换 filter 不会刷新数据（按需重 fetch 即可）
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { useActiveFilter } from '../App';
import { ModeTabs } from '../components/ModeTabs';
import { ArticleCard } from '../components/ArticleCard';
import { getArticles } from '../api/client';
import type { Article } from '../storage/mmkv';
import type { RootStackParamList } from '../App';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

type Mode = 'theme' | 'source' | 'date';

const MODE_OPTIONS = [
  { key: 'theme',  label: '按 主 题' },
  { key: 'source', label: '按 来 源' },
  { key: 'date',   label: '按 日 期' },
] as const;

interface GroupBucket { key: string; count: number; list: Article[] }

function bucketByTheme(articles: Article[]): GroupBucket[] {
  const map: Record<string, Article[]> = {};
  for (const a of articles) {
    const k = a.tags?.[0] || a.chapter || '未分类';
    (map[k] ||= []).push(a);
  }
  return Object.entries(map)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, list]) => ({ key, count: list.length, list }));
}

function bucketBySource(articles: Article[]): GroupBucket[] {
  const map: Record<string, Article[]> = {};
  for (const a of articles) {
    const k = a.source || '未署名';
    (map[k] ||= []).push(a);
  }
  return Object.entries(map)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, list]) => ({ key, count: list.length, list }));
}

function bucketByDate(articles: Article[]): GroupBucket[] {
  const map: Record<string, Article[]> = {};
  for (const a of articles) {
    const k = a.date || '未知日期';
    (map[k] ||= []).push(a);
  }
  return Object.entries(map)
    .sort((a, b) => b[0].localeCompare(a[0])) // 日期倒序
    .map(([key, list]) => ({ key, count: list.length, list }));
}

export default function SourceScreen() {
  const { theme } = useTheme();
  const t = theme.tokens;
  const nav = useNavigation<NavProp>();
  const activeFilter = useActiveFilter();

  // 记录 tabBus 预填的 theme（只取一次，挂载后不应跟随 activeFilter 变化被覆盖）
  const presetThemeRef = useRef<string | null>(
    (activeFilter?.theme as string) ?? null
  );

  const [mode, setMode] = useState<Mode>('theme');
  // 初始 activeGroup 来自 presetTheme，让"全部"chip 之外的初始选中态正确
  const [activeGroup, setActiveGroup] = useState<string | null>(presetThemeRef.current);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [total, setTotal] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 从服务端拉数据（POST JSON 避免中文 URL 编码）
  const fetchPage = useCallback(async (overrideMode?: Mode, overrideGroup?: string | null) => {
    const m = overrideMode ?? mode;
    const g = overrideGroup ?? activeGroup;
    setLoading(true);
    setErrorMsg(null);
    const opts: Parameters<typeof getArticles>[0] = { pageSize: 100, with_summary: true };
    if (m === 'theme' && g)  opts.theme  = g;
    if (m === 'source' && g) opts.source = g;
    if (m === 'date' && g)   opts.date   = g;
    try {
      const resp = await getArticles(opts);
      setArticles(resp.items);
      setTotal(resp.total);
      setOnline(resp.online);
    } catch (e: any) {
      setErrorMsg(e?.message ?? '未知错误');
    } finally {
      setLoading(false);
    }
  }, [mode, activeGroup]);

  // 首次加载：从 ReviewScreen tag chip 跳过来时按 preset theme 过滤（tap chip 路径）
  // 没有 preset 时保持原来"全部"语义
  // 使用 presetThemeRef 避免被后续 activeFilter 变化干扰（用 ref 一次性快照）
  useEffect(() => {
    (async () => {
      setLoading(true);
      const preset = presetThemeRef.current;
      const opts: Parameters<typeof getArticles>[0] = { pageSize: 100, with_summary: true };
      if (preset) opts.theme = preset;
      try {
        const resp = await getArticles(opts);
        setArticles(resp.items);
        setTotal(resp.total);
        setOnline(resp.online);
      } catch (e: any) {
        setErrorMsg(e?.message ?? '未知错误');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 切换模式时重新拉全量（不传过滤）
  const onChangeMode = useCallback((k: Mode) => {
    setMode(k);
    setActiveGroup(null);
    fetchPage(k, null);
  }, [fetchPage]);

  // 点击 chip 时按服务端过滤
  const onSelectGroup = useCallback((k: string | null) => {
    setActiveGroup(k);
    fetchPage(undefined, k);
  }, [fetchPage]);

  // 客户端二次分桶（chip 行展示用）
  const groups = useMemo<GroupBucket[]>(() => {
    if (mode === 'theme')  return bucketByTheme(articles);
    if (mode === 'source') return bucketBySource(articles);
    return bucketByDate(articles);
  }, [mode, articles]);

  const visible = useMemo(() => {
    if (!activeGroup) return articles;
    const g = groups.find(g => g.key === activeGroup);
    return g?.list ?? articles;
  }, [activeGroup, groups, articles]);

  const onItemPress = useCallback((id: string) => {
    nav.navigate('Reader', { id });
  }, [nav]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      {/* 顶部标题 */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>
          素 材 学 习
        </Text>
        <Text style={[styles.subtitle, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          政策理论 · 基层治理 · 数字中国
        </Text>
        <Text style={[styles.onlineHint, { color: online ? t.jade : t.inkFaint }]}>
          {online ? `· 在线 · 全量 ${total} 篇` : `· 离线 · 缓存 ${total} 篇`}
        </Text>
      </View>

      {/* 模式切换条 */}
      <ModeTabs<Mode> value={mode} options={[...MODE_OPTIONS]} onChange={onChangeMode} />

      {/* group 筛选 */}
      {groups.length > 0 ? (
        <View style={styles.chipsRow}>
          <FlatList
            data={[{ key: '', count: articles.length }, ...groups]}
            keyExtractor={item => item.key || '__all__'}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            renderItem={({ item }) => {
              const active = (item.key === '' && !activeGroup) || item.key === activeGroup;
              return (
                <Pressable
                  onPress={() => onSelectGroup(item.key || null)}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: t.divider, backgroundColor: active ? t.seal : t.paper },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? t.paper : t.inkSoft, fontFamily: fonts.serif.bold },
                    ]}
                    numberOfLines={1}
                  >
                    {item.key || '全部'} · {item.count}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      {/* 主体 */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.brass} />
        </View>
      ) : errorMsg ? (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            加载失败：{errorMsg}
          </Text>
        </View>
      ) : articles.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            还没有素材库内容{'\n'}检查网络或服务端 /api/articles
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <ArticleCard
              chapter={item.chapter || (item.tags?.[0] ?? '')}
              title={item.title}
              content={item.content || item.highlight || '（暂无摘要，点击阅读全文）'}
              highlight={item.highlight}
              index={index + 1}
              total={visible.length}
              isRead={false}
              onPress={() => onItemPress(item.id)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[styles.empty, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
                这个分组下没有文章
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  title: { fontSize: fontSizes.hero, letterSpacing: 6, marginBottom: spacing.xs },
  subtitle: { fontSize: fontSizes.caption, letterSpacing: 2, marginBottom: spacing.xs },
  onlineHint: { fontSize: fontSizes.micro, letterSpacing: 1 },
  chipsRow: { paddingVertical: spacing.sm },
  chipsContent: { paddingHorizontal: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: borders.hair,
    borderRadius: radii.pill,
    marginRight: spacing.sm,
    maxWidth: 200,
  },
  chipText: { fontSize: fontSizes.caption, letterSpacing: 2 },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  empty: { textAlign: 'center', fontSize: fontSizes.body, letterSpacing: 2, lineHeight: fontSizes.body * 1.6 },
});