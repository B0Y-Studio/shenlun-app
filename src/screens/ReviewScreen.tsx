// src/screens/ReviewScreen.tsx
// 积累 Tab · 复盘屏（V3 风格）
// - 顶部: 单行 [← 返回] [复 盘] [已读 X 篇]
// - 中部: ModeTabs「按月 | 按主题」，默认按月
// - 主体: 已读文章分组列表，每条卡片带日期 + 标题 + 来源/作者 + tag chip
// - 主体底部: 案牍劳形 不废研读
// - tag chip 点击 → navigation.navigate('Main', { screen: 'Source', params: { filter: { theme } } })
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
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

type Mode = 'month' | 'theme';

const MODE_OPTIONS: Array<{ key: Mode; label: string }> = [
  { key: 'month', label: '按 月' },
  { key: 'theme', label: '按 主 题' },
];

export default function ReviewScreen(props: Props) {
  const { navigation } = props;
  const { theme } = useTheme();
  const t = theme.tokens;
  const [mode, setMode] = useState<Mode>('month');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载：MMKV 已读 id → 缓存兜底 → /api/articles 补全
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = getReadIds();
      if (ids.length === 0) {
        if (!cancelled) { setArticles([]); setLoading(false); }
        return;
      }
      // 缓存兜底
      const cached = getCachedArticles();
      const cachedById = new Map(cached.map(a => [a.id, a]));
      const missing = ids.filter(id => !cachedById.has(id));
      const baseList: Article[] = ids
        .map(id => cachedById.get(id))
        .filter((x): x is Article => !!x);
      if (!cancelled) setArticles(baseList);

      // 服务端补全（容忍网络/路由失败）
      if (missing.length) {
        try {
          const { items } = await getArticlesByIds(missing);
          if (cancelled) return;
          const seen = new Set(baseList.map(a => a.id));
          const merged = [...baseList, ...items.filter(a => !seen.has(a.id))];
          setArticles(merged);
        } catch { /* 降级 */ }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // 分组（按月 / 按主题）
  const groups = useMemo(() => {
    const buckets: Record<string, Article[]> = {};
    for (const a of articles) {
      if (mode === 'month') {
        const k = (a.date ?? '').slice(0, 7) || '其他';
        (buckets[k] ||= []).push(a);
      } else {
        const k = a.chapter || (a.tags?.[0]) || '其他';
        (buckets[k] ||= []).push(a);
      }
    }
    const sorted = Object.entries(buckets).sort(([ka, va], [kb, vb]) => {
      // 按月：时间倒序；按主题：数量倒序
      if (mode === 'month') return kb.localeCompare(ka);
      return vb.length - va.length || ka.localeCompare(kb);
    });
    for (const [, arr] of sorted) {
      arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }
    return sorted;
  }, [articles, mode]);

  const onJumpToSource = useCallback((themeKey: string) => {
    // ReviewScreen 是 Stack.Screen 'Review'（Main 的兄弟屏），
    // useNavigation 拿到的是 root stack，跳到 Main 内的 Tab 必须用嵌套 navigate 形式
    navigation.navigate('Main', { screen: 'Source', params: { filter: { theme: themeKey } } });
  }, [navigation]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Text style={[styles.back, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>复 盘</Text>
        <Text style={[styles.counter, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          {loading ? '…' : `已读 ${articles.length} 篇`}
        </Text>
      </View>

      <ModeTabs<Mode> value={mode} options={MODE_OPTIONS} onChange={setMode} />

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
                  android_ripple={{ color: `${t.brass}22` }}
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
                    {(a.tags ?? []).slice(0, 4).length > 0 && (
                      <View style={styles.tagsRow}>
                        {(a.tags ?? []).slice(0, 4).map((tg: string) => (
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
                    )}
                    {(a.source || a.author) ? (
                      <Text style={[styles.rowMeta, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
                        {a.source || ''}{a.source && a.author ? '  ·  ' : ''}{a.author || ''}
                      </Text>
                    ) : null}
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
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderWidth: borders.hair, borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  rowDate: { fontSize: fontSizes.caption, width: 36, paddingTop: 2, letterSpacing: 1, marginRight: spacing.sm },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: fontSizes.body, lineHeight: 22 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderRadius: 2, marginRight: 4, marginBottom: 4 },
  tagText: { fontSize: 10, letterSpacing: 1 },
  rowMeta: { fontSize: 10, letterSpacing: 1, marginTop: spacing.xs },
  footer: { textAlign: 'center', fontSize: 11, letterSpacing: 6, marginTop: spacing.lg },
});
