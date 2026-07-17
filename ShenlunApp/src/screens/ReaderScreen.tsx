// src/screens/ReaderScreen.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { getArticle, type Article } from '../api/client';
import { getCachedArticles, markRead } from '../storage/mmkv';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { Divider } from '../components/Divider';
import { fonts, fontSizes, lineHeights, spacing, radii } from '../theme/tokens';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Reader'>;

// 拼接非空字段，避免出现 "来源： |" 这种悬挂分隔符
function joinMetaParts(article: Article): string[] {
  const parts: string[] = [];
  if (article.source) parts.push(`来源：${article.source}`);
  if (article.date) parts.push(article.date);
  if (article.author) parts.push(article.author);
  return parts;
}

export default function ReaderScreen(props: Props) {
  const { navigation } = props;
  const { route } = props;
  const { theme } = useTheme();
  const t = theme.tokens;
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 守卫 route.params.id（类型上已是非空，但运行时仍可能缺失）
    const id = route.params?.id;
    if (!id) {
      navigation.goBack();
      return;
    }
    const safeId: string = id; // 收窄为非空 string，函数签名要 string

    let cancelled = false;
    // 进入阅读页即把当前 id 标为已读，回到首页时会显示计数
    markRead(id);

    // Cache-first: 文章正文已在 /api/today 响应里带过来了，优先用缓存，避免多余网络请求。
    // 若缓存缺失（如冷启动且未联网），再回退到 getArticle。
    const cached = getCachedArticles().find(a => a.id === safeId);
    if (cached) {
      setArticle(cached);
      setLoading(false);
      return () => { cancelled = true; };
    }
    async function load() {
      try {
        const data = await getArticle(safeId);
        if (cancelled) return;
        setArticle(data);
      } catch {
        if (cancelled) return;
        setArticle(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [route.params?.id, navigation]);

  // 过滤空字段后再拼 " | "
  const metaText = useMemo(() => {
    if (!article) return '';
    return joinMetaParts(article).join(' | ');
  }, [article]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={t.brass} />
        </View>
      </SafeAreaView>
    );
  }

  if (!article) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={styles.loading}>
          <Text style={[styles.errorText, { color: t.inkMuted }]}>文章未找到</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      {/* 顶部导航：单行 [← 返回] [flex spacer] */}
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 标题：缺标题时显示"无题"，不再用"未知" */}
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>
          {article.title || '无题'}
        </Text>

        {/* 元数据：来源 | 日期 | 作者 — 缺字段自动隐藏 */}
        {metaText ? (
          <Text style={[styles.metaText, { color: t.inkMuted }]}>{metaText}</Text>
        ) : null}

        <Divider />

        {/* 正文 */}
        <Text style={[styles.content, { color: t.inkSoft, fontFamily: fonts.serif.regular }]}>
          {article.content}
        </Text>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      {/* 底部工具栏 */}
      <View style={[styles.bottomBar, { backgroundColor: t.paper, borderTopColor: t.border }]}>
        <Text style={[styles.progress, { color: t.inkMuted }]}>第 1 / 3 篇</Text>
        <Pressable style={[styles.markBtn, { backgroundColor: t.seal }]}>
          <Text style={[styles.markBtnText, { color: t.paper }]}>标记金句</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  backBtn: { paddingVertical: spacing.xs },
  topSpacer: { flex: 1 },
  backText: { fontSize: fontSizes.body },
  title: { fontSize: fontSizes.hero, lineHeight: fontSizes.hero * lineHeights.tight, marginBottom: spacing.sm },
  metaText: { fontFamily: fonts.sans.regular, fontSize: fontSizes.caption, marginBottom: spacing.md },
  content: { fontSize: fontSizes.body, lineHeight: fontSizes.body * lineHeights.reading },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1 },
  progress: { fontFamily: fonts.serif.regular, fontSize: fontSizes.caption },
  markBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.sm },
  markBtnText: { fontFamily: fonts.serif.bold, fontSize: fontSizes.caption },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontFamily: fonts.kai.regular, fontSize: fontSizes.body },
});
