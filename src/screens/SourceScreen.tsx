// src/screens/SourceScreen.tsx
// 素材学习 Tab —— 按主题/来源/日期 查看全量素材库（V3 风格）
// 数据源：服务端 POST /api/articles（带过滤）
// 离线降级：服务端失败时返回 MMKV 缓存
// 跳转协议：从 ReviewScreen 点 tag chip → navigation.navigate('Main', { screen: 'Source', params: { filter: { theme } } }) 预填主题
//   presetThemeRef: 挂载时一次性快照 route.params.filter?.theme
//   - 当前架构: MainTabs 已切到 React Navigation bottom-tabs（keep-alive，屏不会 unmount）
//     route.params 变化时屏内 effect 重新拉取数据即可
//   - 副作用：若外部深链接切换 filter，屏不会重建，靠 presetThemeRef 重 fetch 触发刷新
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { ModeTabs } from '../components/ModeTabs';
import { ArticleCard } from '../components/ArticleCard';
import { getArticles } from '../api/client';
import { getReadIds } from '../storage/mmkv';
import type { Article } from '../storage/mmkv';
import type { RootStackParamList } from '../App';
import type { MainTabParamList } from '../App';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

type Mode = 'theme' | 'source' | 'date';

const MODE_OPTIONS: Array<{ key: Mode; label: string }> = [
  { key: 'theme',  label: '按 主 题' },
  { key: 'source', label: '按 来 源' },
  { key: 'date',   label: '按 日 期' },
];

interface GroupBucket { key: string; count: number }

export default function SourceScreen() {
  const { theme } = useTheme();
  const t = theme.tokens;
  const nav = useNavigation<NavProp>();
  const route = useRoute<RouteProp<MainTabParamList, 'Source'>>();
  const activeFilter = route.params?.filter ?? {};

  // M15: 用 useEffect 监听 activeFilter.theme 变化，drop 一次性 ref 快照
  // 屏内任意时刻主题被外部变更（深链接 / 复盘 chip 跳转）都重新拉取
  const presetTheme = (activeFilter?.theme as string | undefined) ?? null;

  // M5: 请求 id 计数器，用于丢弃被新请求超越的过期响应（避免快速切换 filter 时旧数据覆盖新数据）
  const reqIdRef = useRef(0);

  const [mode, setMode] = useState<Mode>('theme');
  // 初始 activeGroup 来自 presetTheme，让"全部"chip 之外的初始选中态正确
  const [activeGroup, setActiveGroup] = useState<string | null>(presetTheme);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [online, setOnline] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 分类 chips 的数据源：接口返回的全量 facets（themes/sources/dates），
  // 只在"无筛选"的加载（初始 / 切模式）时刷新 —— 选中分类或翻页不动它，
  // 保证 chips 始终展示全量分类视图，用户可直接切其他分类。
  // 此前用 bucketBy(articles) 对已加载页客户端分桶：分类列表/计数只反映
  // 当前 20 条，且 visible 再按 tags[0] 二次过滤与 theme=includes 的
  // 过滤语义冲突，导致"各分类下只显示 20 个"。
  const [facets, setFacets] = useState<GroupBucket[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);

  // H1: 已读 id 集合，focus / mount 时从 MMKV 读取。
  // ArticleCard.isRead 接收真实状态（之前硬编码 false，卡片永远"未读"）。
  // Set 用于 O(1) 命中，单屏 50-100 卡片不影响性能。
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set(getReadIds()));
  useEffect(() => {
    const refresh = () => setReadIds(new Set(getReadIds()));
    const unsub = nav.addListener('focus', refresh);
    return unsub;
  }, [nav]);

  // M2: 从服务端拉数据（POST JSON 避免中文 URL 编码）
  // 服务端已支持 page/pageSize/total（docs/server/card_server.py:757-791），
  // 客户端 pageSize 固定 20 + onEndReached 增量加载。
  const fetchPage = useCallback(async (overrideMode?: Mode, overrideGroup?: string | null, opts_: { reset?: boolean; nextPage?: number } = {}) => {
    const m = overrideMode ?? mode;
    const g = overrideGroup ?? activeGroup;
    const isReset = opts_.reset ?? false;
    const targetPage = opts_.nextPage ?? (isReset ? 1 : page);
    // M5: 抢占式请求 id，await 后比对丢弃过期响应
    const myId = ++reqIdRef.current;
    if (isReset) setLoading(true); else setLoadingMore(true);
    setErrorMsg(null);
    const opts: Parameters<typeof getArticles>[0] = {
      pageSize: 20,
      page: targetPage,
      with_summary: true,
    };
    if (m === 'theme' && g)  opts.theme  = g;
    if (m === 'source' && g) opts.source = g;
    if (m === 'date' && g)   opts.date   = g;
    try {
      const resp = await getArticles(opts);
      if (myId !== reqIdRef.current) return; // 被更新的请求超越，丢弃
      if (isReset) {
        setArticles(resp.items);
      } else {
        setArticles(prev => {
          const seen = new Set(prev.map(a => a.id));
          const fresh = resp.items.filter(a => !seen.has(a.id));
          return [...prev, ...fresh];
        });
      }
      setTotal(resp.total);
      setOnline(resp.online);
      setPage(targetPage);
      // 无筛选的加载（初始 / 切模式）时刷新全量 facets + 总数
      if (!g) {
        const f = m === 'theme' ? resp.themes : m === 'source' ? resp.sources : resp.dates;
        setFacets(f ?? []);
        setGrandTotal(resp.total);
      }
      setHasMore(resp.items.length >= 20 && (isReset ? resp.items.length : (articles.length + resp.items.length)) < resp.total);
    } catch (e: any) {
      if (myId !== reqIdRef.current) return;
      setErrorMsg(e?.message ?? '未知错误');
    } finally {
      if (myId === reqIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [mode, activeGroup, page, articles.length]);

  // M15: 从 ReviewScreen tag chip 跳过来时按 preset theme 过滤。
  // 改成 useEffect 依赖 activeFilter.theme，外部导航变更 / 重入此屏时自动重拉。
  useEffect(() => {
    if (!presetTheme) return;
    setActiveGroup(presetTheme);
    setHasMore(true);
    fetchPage('theme', presetTheme, { reset: true, nextPage: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetTheme]);

  // 首次加载：presetTheme 为空时拉一次全量（保持"全部"语义）
  useEffect(() => {
    if (presetTheme) return;
    fetchPage(undefined, undefined, { reset: true, nextPage: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换模式时重新拉全量（不传过滤）
  const onChangeMode = useCallback((k: Mode) => {
    setMode(k);
    setActiveGroup(null);
    setHasMore(true);
    fetchPage(k, null, { reset: true, nextPage: 1 });
  }, [fetchPage]);

  // 点击 chip 时按服务端过滤
  const onSelectGroup = useCallback((k: string | null) => {
    setActiveGroup(k);
    setHasMore(true);
    fetchPage(undefined, k, { reset: true, nextPage: 1 });
  }, [fetchPage]);

  // M2: 触底加载下一页
  const onEndReached = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    fetchPage(undefined, undefined, { nextPage: page + 1 });
  }, [loading, loadingMore, hasMore, page, fetchPage]);

  // 分类 chips：直接用接口全量 facets（见 state 注释），不再客户端分桶
  const groups = facets;

  // 列表数据：activeGroup 时 articles 已是按分类过滤 + 分页的结果
  //（服务端/本地都做 theme/source/date 过滤），不做二次筛选
  const visible = articles;

  const onItemPress = useCallback((id: string) => {
    nav.navigate('Reader', { id });
  }, [nav]);

  // L6: chip row 的 renderItem 抽 useCallback —— 否则每次 SourceScreen
  // 渲染（比如 loadMore 触发 setArticles）会重建所有 chip Pressable。
  const renderChip = useCallback(({ item }: { item: { key: string; count: number } }) => {
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
  }, [activeGroup, onSelectGroup, t.divider, t.seal, t.paper, t.inkSoft]);

  // L7: 顺手把 SourceScreen 主 FlatList 的 renderItem 也 useCallback 化。
  const renderArticle = useCallback(({ item, index }: { item: Article; index: number }) => (
    <ArticleCard
      chapter={item.chapter || (item.tags?.[0] ?? '')}
      title={item.title}
      content={item.content || item.highlight || '（暂无摘要，点击阅读全文）'}
      highlight={item.highlight}
      index={index + 1}
      total={visible.length}
      // H1: 真实已读状态（之前硬编码 false）
      isRead={readIds.has(item.id)}
      onPress={() => onItemPress(item.id)}
    />
  ), [visible.length, onItemPress, readIds]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: t.bg }]}>
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
      <ModeTabs<Mode> value={mode} options={MODE_OPTIONS} onChange={onChangeMode} />

      {/* group 筛选 */}
      {groups.length > 0 ? (
        <View style={styles.chipsRow}>
          <FlatList
            data={[{ key: '', count: grandTotal }, ...groups]}
            keyExtractor={item => item.key || '__all__'}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            renderItem={renderChip}
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
          // M2: 滚动到底部触发加载下一页
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          renderItem={renderArticle}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[styles.empty, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
                这个分组下没有文章
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={t.brass} />
              </View>
            ) : null
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
  footer: { paddingVertical: spacing.lg, alignItems: 'center' },
});