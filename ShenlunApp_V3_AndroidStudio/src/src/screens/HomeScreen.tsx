// src/screens/HomeScreen.tsx
// V3 定稿首页 —— 头部(申论+农历日期) / 锦言 / 昨日总结 / 今日待做 / 5 行主菜单
// 注意：底栏 TabBar 由 App.tsx 注入，此屏只负责内容滚动区
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScrollView, StyleSheet, SafeAreaView, View, Text, StatusBar, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing } from '../theme/tokens';
import { buildHeaderDate, MENU_ITEMS } from '../theme/tokens';
import { QuoteCard } from '../components/QuoteCard';
import { YesterdayCard } from '../components/YesterdayCard';
import { TodayTaskBanner } from '../components/TodayTaskBanner';
import { MenuList } from '../components/MenuList';
import { getDaily, type Article } from '../api/client';
import { getReadIds, markRead } from '../storage/mmkv';
import { tabBus } from '../navigation/tabBus';
import type { RootStackParamList } from '../App';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { theme } = useTheme();
  const t = theme.tokens;
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // 头部日期（公历，简化为"X月/日"表示；以后可换真农历）
  const headerDate = useMemo(() => buildHeaderDate(new Date()), []);

  const load = useCallback(async () => {
    try {
      const data = await getDaily();
      setArticles(data);
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await load();
      setReadIds(new Set(getReadIds()));
    })();
    // 从阅读页返回时也同步一次已读 id（focussed 时）
    const unsub = navigation.addListener('focus', () => {
      setReadIds(new Set(getReadIds()));
    });
    return () => { cancelled = true; unsub(); };
  }, [navigation, load]);

  const doneCount = useMemo(() => {
    if (!readIds.size || !articles.length) return 0;
    let n = 0;
    for (const a of articles) if (readIds.has(a.id)) n++;
    return n;
  }, [readIds, articles]);

  // 今日待做 banner 的标题：用第一篇文章的 title（截短），缺则用默认
  const bannerTitle = useMemo(() => {
    const first = articles[0];
    if (!first?.title) return '晨起三篇，养浩然之气';
    // 太长的截前 14 字
    const t = first.title.replace(/\s+/g, '');
    return t.length > 14 ? `${t.slice(0, 14)}…` : t;
  }, [articles]);

  const onTodayPress = () => {
    if (!articles.length) return;
    // 进入第一篇未读的；都读完了进第一篇
    const firstUnread = articles.find(a => !readIds.has(a.id));
    const target = firstUnread ?? articles[0];
    markRead(target.id);
    setReadIds(prev => {
      if (prev.has(target.id)) return prev;
      const next = new Set(prev); next.add(target.id); return next;
    });
    navigation.navigate('Reader', { id: target.id });
  };

  const onMenuItem = (key: string) => {
    // 主菜单项 → 切换外层 Tab 或推子页
    if (key === 'review') { navigation.navigate('Review'); return; }
    if (key === 'note')   { navigation.navigate('Gold'); return; }
    // source/paper/analysis：请求切 Tab
    const tabMap: Record<string, string> = {
      source:   'source',
      paper:    'paper',
      analysis: 'analysis',
    };
    const target = tabMap[key];
    if (target) tabBus.set(target);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <StatusBar
        barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={t.bg}
      />

      {/* 顶部微红径向晕（mockup .scroll 背景） */}
      <View
        style={[
          styles.topGlow,
          { backgroundColor: theme.mode === 'dark' ? 'rgba(192,72,81,0.12)' : 'rgba(192,72,81,0.07)' },
        ]}
        pointerEvents="none"
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 头部：申论 + 公历日期 */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>申论</Text>
          <View style={[styles.dateSeal, { backgroundColor: t.seal }]}>
            <Text style={[styles.dateLine, { color: t.paper, fontFamily: fonts.kai.bold }]}>
              {headerDate.line1}
            </Text>
            <Text style={[styles.dateLine, { color: t.paper, fontFamily: fonts.kai.bold }]}>
              {headerDate.line2}
            </Text>
          </View>
        </View>

        {/* 锦言 */}
        <QuoteCard />

        {/* 昨日总结 */}
        <YesterdayCard />

        {/* 今日待做 */}
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={t.brass} />
            <Text style={[styles.loadingText, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>加载中…</Text>
          </View>
        ) : (
          <TodayTaskBanner
            doneCount={doneCount}
            totalCount={articles.length || 3}
            title={bannerTitle}
            onPress={onTodayPress}
          />
        )}

        {/* 主菜单 5 行 */}
        <MenuList onItemPress={onMenuItem} />

        <Text style={[styles.footer, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
          案 牍 劳 形 · 不 废 研 读
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: '20%',
    width: '60%',
    height: 280,
    borderRadius: 280,
    opacity: 1,
    // 边缘自然淡出：用大半径 + 透明度弱化
  },
  scroll: { paddingTop: spacing.sm, paddingBottom: spacing.sm },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: { fontSize: 28, letterSpacing: 10 },
  dateSeal: {
    minWidth: 64,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 2,
    transform: [{ rotate: '-3deg' }],
    alignItems: 'center',
  },
  dateLine: { fontSize: 13, letterSpacing: 2, lineHeight: 20 },
  loading: { paddingVertical: spacing.lg, alignItems: 'center' },
  loadingText: { marginTop: spacing.xs, fontSize: fontSizes.caption, letterSpacing: 4 },
  footer: { textAlign: 'center', fontSize: 11, letterSpacing: 6, marginTop: spacing.md, marginBottom: spacing.sm },
});
