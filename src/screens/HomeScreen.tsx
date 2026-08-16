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
import { isLocalMode } from '../config/dataMode';
import type { RootStackParamList } from '../App';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { theme } = useTheme();
  const t = theme.tokens;
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  // 独立模式标识：头部显示 "· 本地数据"（服务器模式 + 离线时为 false）
  const [localMode, setLocalMode] = useState(false);

  // 头部日期（公历，简化为"X月/日"表示；以后可换真农历）
  const headerDate = useMemo(() => buildHeaderDate(new Date()), []);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      // M14: getDaily 现在返回 {items, online}，解构使用
      const { items, online } = await getDaily({ signal });
      setArticles(items);
      // 独立模式（数据源=本地）时 online 恒为 false —— 头部显示本地标识
      setLocalMode(isLocalMode() || !online);
    } catch (e: any) {
      // AbortError 表示组件卸载 / 5s 超时 / fetch 被 controller.abort() 取消
      // 此时 setArticles([]) 会清掉 state 里的内容（包括之前 fetch 成功的缓存）
      // 不要写 state，让 useEffect 后续的 cancelled 检查兜住
      if (e?.name === 'AbortError') return;
      // 真正的网络错误：getDaily 内已 fallback 到 MMKV 缓存，不会到 catch
      // 这里兜个空数组防止 setArticles 卡住
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // 模拟器无网络/服务端慢时 fetch /api/today 可能长时间 hang：
    //   - 用户体验：loading 一直转，看不到内容
    //   - 资源：与 RNScreens/SafeArea 叠加可能放大启动期内存峰值
    // 加 5s 硬超时，超时后强制关闭 loading。
    // 注意：超时分支本身不读取 MMKV 缓存（缓存降级由 load() 内部 try/catch 处理），
    //       状态中的 articles 仍是 useState 初值 []。
    const HARD_TIMEOUT_MS = 5000;
    // 用 AbortController 真正取消 fetch（避免网络恢复后 stale write）
    const controller = new AbortController();
    const hardTimer = setTimeout(() => {
      if (cancelled) return;
      // 不阻塞 UI；articles 已经是 MMKV 缓存或 []
      controller.abort();           // 让挂着的 fetch 抛 AbortError
      setLoading(false);
    }, HARD_TIMEOUT_MS);

    (async () => {
      if (cancelled) return;
      await load(controller.signal);
      if (cancelled) return;
      setReadIds(new Set(getReadIds()));
      clearTimeout(hardTimer);
    })();
    // 从阅读页返回时也同步一次已读 id（focussed 时）
    const unsub = navigation.addListener('focus', () => {
      setReadIds(new Set(getReadIds()));
    });
    return () => {
      cancelled = true;
      clearTimeout(hardTimer);
      controller.abort();             // 卸载/重挂载时也取消
      unsub();
    };
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
    // source/paper/analysis：请求切到 Main 下的某个 Tab
    // 这里 HomeScreen 是 Stack.Screen 'Main' 的子屏，useNavigation 拿到的是 root stack
    // 跳到嵌套 Tab Navigator 必须用 navigation.navigate('Main', { screen, params }) 形式
    const tabMap: Record<string, 'Source' | 'Paper' | 'Analysis'> = {
      source:   'Source',
      paper:    'Paper',
      analysis: 'Analysis',
    };
    const target = tabMap[key];
    if (target) navigation.navigate('Main', { screen: target });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <StatusBar
        barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={t.bg}
      />

      {/* H5: 顶部微红晕从三层绝对定位 View（200% / 120% / 60%，GPU 重绘
          开销大）减到单层 View + rgba 颜色。视觉差异极小（红色微染背景），
          滚动掉帧明显减少。glowRing 样式保留以兼容未来扩展，但不再使用。 */}
      <View
        style={[styles.glowWrap, { backgroundColor: 'rgba(192,72,81,0.05)' }]}
        pointerEvents="none"
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 头部：申论 + 公历日期 */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>申论</Text>
          <View
            style={[
              styles.dateSeal,
              {
                backgroundColor: t.seal,
                shadowColor: t.sealDeep,
                shadowOffset: { width: 1, height: 1 },
                shadowOpacity: 1,
                shadowRadius: 0,
                elevation: 0,
              },
            ]}
          >
            <Text style={[styles.dateLine, { color: t.paper, fontFamily: fonts.kai.bold }]}>
              {headerDate.line1}
            </Text>
            <Text style={[styles.dateLine, { color: t.paper, fontFamily: fonts.kai.bold }]}>
              {headerDate.line2}
            </Text>
          </View>
          {/* 独立模式 / 离线标识（数据源=本地 或 服务器不可达时显示） */}
          {localMode ? (
            <Text style={[styles.localBadge, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
              · 本地数据
            </Text>
          ) : null}
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
  glowWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 320,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'visible',
    opacity: 0.9,
  },
  scroll: { paddingTop: 10, paddingHorizontal: 20, paddingBottom: 10 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 8,
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
  localBadge: { position: 'absolute', right: 0, bottom: 4, fontSize: fontSizes.micro, letterSpacing: 2 },
  footer: { textAlign: 'center', fontSize: 11, letterSpacing: 6, marginTop: spacing.md, marginBottom: spacing.sm },
});
