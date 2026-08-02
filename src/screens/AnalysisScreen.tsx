// src/screens/AnalysisScreen.tsx
// 分析建议 Tab —— 学习概览 + 高频主题 + 待补强 + AI 评卷入口
// 数据源：本地 MMKV（getCachedArticles / getReadIds / getReadHistory / getLocalNotes）
//   服务端没有题型字段，"薄弱题型" 用 "已读较少的主题" 替代
import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import {
  getCachedArticles, getReadHistory, countReadsInWindow,
  getLocalNotes, type Article,
} from '../storage/mmkv';
import { getAnalyticsSummary } from '../api/client';
import type { RootStackParamList } from '../App';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

// 把 article.tags / chapter / theme 合并成"主题 key"，兜底"未分类"
function themeOf(a: Article): string {
  return a.tags?.[0] || a.chapter || a.theme || '未分类';
}

export default function AnalysisScreen() {
  const { theme } = useTheme();
  const t = theme.tokens;
  const nav = useNavigation<NavProp>();

  // 服务端统计（在线时用）/ 本地兜底（离线）
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof getAnalyticsSummary>> | null>(null);
  const [online, setOnline] = useState(false);
  // M11: 加载状态，用于显示 loading 占位符
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const a = await getAnalyticsSummary();
      if (cancelled) return;
      setAnalytics(a);
      setOnline(a.online);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const articles = getCachedArticles();
    const notes = getLocalNotes();
    // 服务端聚合优先；否则用本地兜底
    const monthReads = analytics?.month_reads ?? countReadsInWindow(30 * 24 * 60 * 60 * 1000);
    const totalReads = analytics?.total_reads ?? getReadHistory().length;
    // 主题聚合：服务端 themes 数组（如有），否则本地按 tags 聚合
    const themes: Array<{ key: string; count: number }> = (analytics?.themes && analytics.themes.length > 0)
      ? analytics.themes
      : (() => {
          const m: Record<string, number> = {};
          for (const a of articles) {
            const k = themeOf(a);
            m[k] = (m[k] || 0) + 1;
          }
          return Object.entries(m)
            .sort((a, b) => b[1] - a[1])
            .map(([key, count]) => ({ key, count }));
        })();

    return {
      articles: articles.length,
      totalReads,
      monthReads,
      notes: notes.length,
      themes,
      sources: analytics?.sources ?? [],
      dates: analytics?.dates ?? [],
    };
  }, [analytics]);

  // 高频主题 Top 5
  const topThemes = stats.themes.slice(0, 5);
  const maxCount = topThemes.length > 0 ? topThemes[0].count : 1;

  // 待补强：已读 1-2 篇的主题（提示用户去素材 Tab 看更多）
  const weakThemes = useMemo(() => {
    if (stats.themes.length === 0) return [];
    return stats.themes
      .filter(t => t.count <= 2)
      .slice(0, 5)
      .map(t => t.key);
  }, [stats]);

  const onJumpToSource = useCallback((key: string) => {
    // AnalysisScreen 是 Stack.Screen 'Main' 的子屏，useNavigation 拿到的是 root stack
    // 跳到嵌套 Tab Navigator 必须用 navigation.navigate('Main', { screen, params }) 形式
    nav.navigate('Main', { screen: 'Source', params: { filter: { theme: key } } });
  }, [nav]);

  const onJumpToPaper = useCallback(() => {
    nav.navigate('Main', { screen: 'Paper' });
  }, [nav]);

  const onAIJudge = useCallback(() => {
    nav.navigate('Judge', { question: undefined });
  }, [nav]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 顶部标题 */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>
            分 析 建 议
          </Text>
          <Text style={[styles.subtitle, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            薄弱题型 · 高频考点 · AI 评卷
          </Text>
        </View>

        {/* 学习概览卡 */}
        <View style={[styles.card, { backgroundColor: t.paper, borderColor: t.border }]}>
          <Text style={[styles.cardHead, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            概     览
          </Text>
          {loading ? (
            <View style={styles.statsLoading}>
              <ActivityIndicator size="small" color={t.brass} />
              <Text style={[styles.statsLoadingText, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
                统计加载中…
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.statsRow}>
                <Stat label="本月已读" value={String(stats.monthReads)} unit="篇" color={t.seal} />
                <Stat label="累计已读" value={String(stats.totalReads)} unit="篇" color={t.ink} />
                <Stat label="标金"      value={String(stats.notes)}        unit="句" color={t.brassDeep} />
              </View>
              <View style={styles.statsRow}>
                <Stat label="素材库" value={String(stats.articles)} unit="篇" color={t.jade} />
                <Pressable onPress={onJumpToPaper} style={styles.statLinkBtn}>
                  <Text style={[styles.statLink, { color: t.brassDeep, fontFamily: fonts.serif.bold }]}>
                    做真题 →
                  </Text>
                </Pressable>
                <View style={{ width: 90 }} />
              </View>
            </>
          )}
        </View>

        {/* 高频主题 */}
        <View style={[styles.card, { backgroundColor: t.paper, borderColor: t.border }]}>
          <Text style={[styles.cardHead, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            高 频 主 题  Top 5
          </Text>
          {topThemes.length === 0 ? (
            <Text style={[styles.empty, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
              还没有阅读记录
            </Text>
          ) : (
            topThemes.map((theme) => {
              const pct = maxCount > 0 ? theme.count / maxCount : 0;
              return (
                <View key={theme.key} style={styles.themeRow}>
                  <Text style={[styles.themeName, { color: t.ink, fontFamily: fonts.kai.regular }]} numberOfLines={1}>
                    {theme.key}
                  </Text>
                  <View style={[styles.barBg, { backgroundColor: t.bgAlt }]}>
                    <View style={[styles.barFg, { backgroundColor: t.seal, width: `${pct * 100}%` }]} />
                  </View>
                  <Text style={[styles.themeCount, { color: t.inkMuted, fontFamily: fonts.serif.bold }]}>
                    {theme.count}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* 待补强主题 */}
        <View style={[styles.card, { backgroundColor: t.paper, borderColor: t.border }]}>
          <Text style={[styles.cardHead, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            待 补 强 主 题
          </Text>
          {weakThemes.length === 0 ? (
            <Text style={[styles.empty, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
              当前素材库覆盖较均衡，继续保持
            </Text>
          ) : (
            <View style={styles.chipsRow}>
              {weakThemes.map(k => (
                <Pressable
                  key={k}
                  onPress={() => onJumpToSource(k)}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: t.brassDeep, backgroundColor: t.paper },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.chipText, { color: t.brassDeep, fontFamily: fonts.serif.bold }]}>
                    {k} →
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* AI 评卷入口 */}
        <Pressable
          onPress={onAIJudge}
          style={({ pressed }) => [
            styles.aiCard,
            { backgroundColor: t.seal, borderColor: t.sealDeep },
            pressed && { opacity: 0.9 },
          ]}
        >
          <View style={styles.aiLeft}>
            <Text style={styles.aiIcon}>🤖</Text>
            <View>
              <Text style={[styles.aiTitle, { color: t.paper, fontFamily: fonts.serif.bold }]}>
                AI 评卷
              </Text>
              <Text style={[styles.aiSub, { color: t.paper, fontFamily: fonts.kai.regular }]}>
                上传手写答案，按评分要点评分
              </Text>
            </View>
          </View>
          <Text style={[styles.aiArrow, { color: t.paper }]}>›</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// 单个数字块
function Stat({
  label, value, unit, color,
}: { label: string; value: string; unit: string; color: string }) {
  const { theme } = useTheme();
  const t = theme.tokens;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color, fontFamily: fonts.serif.bold }]}>
        {value}
        <Text style={[styles.statUnit, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          {' '}{unit}
        </Text>
      </Text>
      <Text style={[styles.statLabel, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  title: { fontSize: fontSizes.hero, letterSpacing: 6, marginBottom: spacing.xs },
  subtitle: { fontSize: fontSizes.caption, letterSpacing: 2 },
  card: {
    padding: spacing.lg,
    borderWidth: borders.hair,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  cardHead: {
    fontSize: fontSizes.body,
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  empty: { textAlign: 'center', fontSize: fontSizes.body, letterSpacing: 2, paddingVertical: spacing.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  statsLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
  statsLoadingText: { marginTop: spacing.xs, fontSize: fontSizes.caption, letterSpacing: 4 },
  stat: { width: 90, alignItems: 'center' },
  statValue: { fontSize: fontSizes.title, lineHeight: fontSizes.title * 1.1, marginBottom: 2 },
  statUnit: { fontSize: fontSizes.caption },
  statLabel: { fontSize: fontSizes.caption, letterSpacing: 2 },
  statLinkBtn: { width: 90, alignItems: 'center', justifyContent: 'center' },
  statLink: { fontSize: fontSizes.body, letterSpacing: 3 },
  themeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  themeName: { width: 70, fontSize: fontSizes.caption, letterSpacing: 2 },
  barBg: { flex: 1, height: 8, borderRadius: 4, marginHorizontal: spacing.sm, overflow: 'hidden' },
  barFg: { height: 8, borderRadius: 4 },
  themeCount: { width: 28, textAlign: 'right', fontSize: fontSizes.caption },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: borders.hair,
    borderRadius: radii.pill,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipText: { fontSize: fontSizes.caption, letterSpacing: 2 },
  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderWidth: borders.hair,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  aiLeft: { flexDirection: 'row', alignItems: 'center' },
  aiIcon: { fontSize: 28, marginRight: spacing.md },
  aiTitle: { fontSize: fontSizes.title, letterSpacing: 4, marginBottom: 2 },
  aiSub: { fontSize: fontSizes.caption, letterSpacing: 2, opacity: 0.85 },
  aiArrow: { fontSize: 28, paddingHorizontal: spacing.sm },
});