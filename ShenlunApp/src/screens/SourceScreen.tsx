// src/screens/SourceScreen.tsx
// 素材学习 Tab —— 按主题/来源/日期 查看已读积累库（V3 风格）
// 数据源：MMKV 中 getCachedArticles()（即历史 /api/today 拉取过的全部文章）
// 跳转协议：从 ReviewScreen 点 tag chip → tabBus.set('source', { filter: { theme } }) 预填主题
import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { useActiveFilter } from '../App';
import { getCachedArticles, type Article } from '../storage/mmkv';
import { ModeTabs } from '../components/ModeTabs';
import { ArticleCard } from '../components/ArticleCard';
import type { RootStackParamList } from '../App';

// 把 Article 适配成 ArticleCard 期望的 props（首张标记为"精"）
function toCardProps(
  article: Article,
  index: number,
  total: number,
  showTheme: boolean,
  showSource: boolean,
) {
  return {
    chapter: article.chapter || (article.tags?.[0] ?? ''),
    title: article.title,
    content: article.highlight || article.content.slice(0, 120),
    highlight: article.highlight,
    index,
    total,
    isRead: false,
  };
}

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

type Mode = 'theme' | 'source' | 'date';

const MODE_OPTIONS = [
  { key: 'theme',  label: '按 主 题' },
  { key: 'source', label: '按 来 源' },
  { key: 'date',   label: '按 日 期' },
] as const;

function bucketByTheme(articles: Article[]): Record<string, Article[]> {
  const out: Record<string, Article[]> = {};
  for (const a of articles) {
    const k = a.tags?.[0] || a.chapter || '未分类';
    (out[k] ||= []).push(a);
  }
  return out;
}

function bucketBySource(articles: Article[]): Record<string, Article[]> {
  const out: Record<string, Article[]> = {};
  for (const a of articles) {
    const k = a.source || '未署名';
    (out[k] ||= []).push(a);
  }
  return out;
}

function bucketByDate(articles: Article[]): Record<string, Article[]> {
  const out: Record<string, Article[]> = {};
  for (const a of articles) {
    const k = a.date || '未知日期';
    (out[k] ||= []).push(a);
  }
  return out;
}

export default function SourceScreen() {
  const { theme } = useTheme();
  const t = theme.tokens;
  const nav = useNavigation<NavProp>();
  const activeFilter = useActiveFilter();

  const [mode, setMode] = useState<Mode>('theme');
  // 各模式的当前 group（key）
  const [activeGroup, setActiveGroup] = useState<string | null>(
    (activeFilter?.theme as string) ?? null
  );
  const [loading] = useState(false);

  // 一次性从 MMKV 拉取全部已读素材（已通过 /api/today 缓存）
  const all = useMemo(() => getCachedArticles(), []);

  // 当前模式的 group 列表（按出现顺序，文章多的排前）
  const groups = useMemo(() => {
    const map =
      mode === 'theme'  ? bucketByTheme(all) :
      mode === 'source' ? bucketBySource(all) :
                          bucketByDate(all);
    return Object.entries(map)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([key, list]) => ({ key, count: list.length, list }));
  }, [mode, all]);

  // 当前选中 group 的文章列表
  const visible = useMemo(() => {
    if (!activeGroup) return all;
    const g = groups.find(g => g.key === activeGroup);
    return g?.list ?? [];
  }, [activeGroup, groups, all]);

  const onChangeMode = useCallback((k: Mode) => {
    setMode(k);
    setActiveGroup(null); // 切模式清空选中 group
  }, []);

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
      </View>

      {/* 模式切换条（按主题 / 按来源 / 按日期） */}
      <ModeTabs<Mode> value={mode} options={MODE_OPTIONS as any} onChange={onChangeMode} />

      {/* group 筛选（横向滚动 chips） */}
      {groups.length > 0 ? (
        <View style={styles.chipsRow}>
          <FlatList
            data={[{ key: '', count: all.length, list: all }, ...groups]}
            keyExtractor={item => item.key || '__all__'}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            renderItem={({ item }) => {
              const active = (item.key === '' && !activeGroup) || item.key === activeGroup;
              return (
                <Pressable
                  onPress={() => setActiveGroup(item.key || null)}
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

      {/* 主体列表 */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.brass} />
        </View>
      ) : all.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            还没有素材库内容{'\n'}回首页读几篇文章，会自动积累到素材库
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <ArticleCard
              {...toCardProps(item, index + 1, visible.length, mode !== 'theme', mode !== 'source')}
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
  subtitle: { fontSize: fontSizes.caption, letterSpacing: 2, marginBottom: spacing.sm },
  chipsRow: {
    paddingVertical: spacing.sm,
  },
  chipsContent: {
    paddingHorizontal: spacing.lg,
  },
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