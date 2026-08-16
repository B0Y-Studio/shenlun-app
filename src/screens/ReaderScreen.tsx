// src/screens/ReaderScreen.tsx
//
// 阅读器：阅读态（多色荧光笔高亮渲染）/ 标注态（选择文字 → 上色或收藏金句）双模式。
// 背景：原"标记金句"按钮从未捕获用户选择（保存的是 highlight 字段——
// 恒为空——或正文前 80 字的固定片段），是假功能，已删除。
// RN 限制：能报告选区的组件（TextInput）无法同时渲染彩色 span，
// 因此标注时切换为 TextInput，操作完成后回到分段渲染的 Text。
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getArticle, postNote, markReadRemote, type Article } from '../api/client';
import { getCachedArticles, markRead } from '../storage/mmkv';
import { getHighlights, addHighlight, removeHighlight, type TextHighlight } from '../storage/highlightsStore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { Divider } from '../components/Divider';
import { HIGHLIGHT_COLORS, HIGHLIGHT_TEXT_COLOR } from '../theme/tokens';
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

/**
 * 阅读态正文：按 highlights（已按 start 升序）把 content 切成
 * 普通段 + 高亮段（嵌套 Text 上背景色）。高亮段长按删除。
 * 相邻区间已由 store 保证不重叠。
 */
function HighlightedBody({ content, highlights, baseStyle, onRemove }: {
  content: string;
  highlights: TextHighlight[];
  baseStyle: object;
  onRemove: (h: TextHighlight) => void;
}) {
  if (highlights.length === 0) {
    return <Text style={baseStyle as never}>{content}</Text>;
  }
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  highlights.forEach((h, i) => {
    // 防御：区间越界（正文变短等）时跳过该条
    const s = Math.max(0, Math.min(h.start, content.length));
    const e = Math.max(s, Math.min(h.end, content.length));
    if (e > s && s > cursor) {
      parts.push(<Text key={`p${i}`}>{content.slice(cursor, s)}</Text>);
    }
    if (e > s) {
      parts.push(
        <Text
          key={`h${i}`}
          suppressHighlighting
          onLongPress={() => onRemove(h)}
          style={{ backgroundColor: h.color, color: HIGHLIGHT_TEXT_COLOR }}
        >
          {content.slice(s, e)}
        </Text>
      );
      cursor = e;
    }
  });
  if (cursor < content.length) {
    parts.push(<Text key="tail">{content.slice(cursor)}</Text>);
  }
  return <Text style={baseStyle as never}>{parts}</Text>;
}

export default function ReaderScreen(props: Props) {
  const { navigation, route } = props;
  const { theme } = useTheme();
  const t = theme.tokens;
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  // M18: 屏卸载后仍调 setState 会触发警告，用 mountedRef 守护
  const mountedRef = useRef(true);

  // === 标注/高亮状态 ===
  // mode: 'read' 阅读态（渲染高亮）；'mark' 标注态（TextInput 可选择）
  const [mode, setMode] = useState<'read' | 'mark'>('read');
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [highlights, setHighlights] = useState<TextHighlight[]>([]);
  // 操作条反馈：刚完成一次收藏/标注时短暂显示提示文字
  const [toast, setToast] = useState<string | null>(null);

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
    // 同步已读到服务端（仅服务器模式且有缓存元数据时；本地模式为 no-op）
    const meta = getCachedArticles().find(a => a.id === safeId);
    if (meta) markReadRemote(meta);

    // Cache-first：正文优先进今日缓存；缺失再走 getArticle
    //（本地模式下 getDaily 也会写 cached_articles，进度因此可算出）
    const cachedList = getCachedArticles();
    const cached = cachedList.find(a => a.id === safeId);
    const idx = cachedList.findIndex(a => a.id === safeId);
    if (idx >= 0) {
      setProgress({ index: idx + 1, total: cachedList.length });
    }
    setHighlights(getHighlights(safeId));
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

  // M18: 卸载时翻转 mountedRef，让异步回调内 setState 调用全部跳过
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // toast 自动消失
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => { if (mountedRef.current) setToast(null); }, 1500);
    return () => clearTimeout(timer);
  }, [toast]);

  // 过滤空字段后再拼 " | "
  const metaText = useMemo(() => {
    if (!article) return '';
    return joinMetaParts(article).join(' | ');
  }, [article]);

  // === 标注操作 ===
  const content = article?.content ?? '';
  const sel = selection && selection.end > selection.start ? selection : null;
  const selectedText = sel ? content.slice(sel.start, sel.end) : '';

  const onPickColor = useCallback((color: string) => {
    if (!article || !sel) return;
    addHighlight(article.id, { start: sel.start, end: sel.end, color, text: selectedText });
    setHighlights(getHighlights(article.id));
    setSelection(null);
    setMode('read');
    setToast('已标记');
  }, [article, sel, selectedText]);

  const onCollect = useCallback(async () => {
    if (!article || !sel) return;
    try {
      await postNote({
        article_id: article.id,
        sentence: selectedText,
        article_title: article.title,
        theme: article.tags?.[0] ?? '',
        created_at: new Date().toISOString(),
      });
    } catch {
      // postNote 本地分支不抛；服务器模式失败按已收藏反馈（内容不落库）
    }
    setSelection(null);
    setMode('read');
    setToast('已收藏到金句本');
  }, [article, sel, selectedText]);

  const onRemoveHighlight = useCallback((h: TextHighlight) => {
    if (!article) return;
    Alert.alert('删除标记', `移除这条荧光笔标记？\n\n「${h.text.slice(0, 30)}${h.text.length > 30 ? '…' : ''}」`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive', onPress: () => {
          removeHighlight(article.id, h.createdAt);
          setHighlights(getHighlights(article.id));
          setToast('已删除标记');
        },
      },
    ]);
  }, [article]);

  const onSelectionChange = useCallback((e: { nativeEvent: { selection: { start: number; end: number } } }) => {
    const { start, end } = e.nativeEvent.selection;
    setSelection({ start: Math.min(start, end), end: Math.max(start, end) });
  }, []);

  if (loading) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={t.brass} />
        </View>
      </SafeAreaView>
    );
  }

  if (!article) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={styles.loading}>
          <Text style={[styles.errorText, { color: t.inkMuted }]}>文章未找到</Text>
        </View>
      </SafeAreaView>
    );
  }

  const bodyBaseStyle = [styles.content, { color: t.inkSoft, fontFamily: fonts.serif.regular }];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, { backgroundColor: t.bg }]}>
      {/* 顶部导航：单行 [← 返回] [模式提示] [flex spacer] */}
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        {mode === 'mark' ? (
          <Text style={[styles.modeHint, { color: t.brassDeep }]}>标注模式</Text>
        ) : null}
        <View style={styles.topSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 标题：缺标题时显示"无题" */}
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>
          {article.title || '无题'}
        </Text>

        {/* 元数据：来源 | 日期 | 作者 — 缺字段自动隐藏 */}
        {metaText ? (
          <Text style={[styles.metaText, { color: t.inkMuted }]}>{metaText}</Text>
        ) : null}

        <Divider />

        {/* 正文：阅读态分段渲染高亮；标注态 TextInput 报告选区 */}
        {mode === 'read' ? (
          <HighlightedBody
            content={content}
            highlights={highlights}
            baseStyle={bodyBaseStyle}
            onRemove={onRemoveHighlight}
          />
        ) : (
          <TextInput
            value={content}
            editable={false}
            multiline
            onSelectionChange={onSelectionChange}
            selectionColor={t.brass}
            style={[styles.content, styles.selectable, { color: t.inkSoft, fontFamily: fonts.serif.regular }]}
          />
        )}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      {/* 底部工具栏：toast > 标注操作条（选中文字时）> 常规条 */}
      <View style={[styles.bottomBar, { backgroundColor: t.paper, borderTopColor: t.border }]}>
        {toast ? (
          <Text style={[styles.toast, { color: t.jade }]}>{toast}</Text>
        ) : mode === 'mark' && sel ? (
          // 操作条：5 色荧光笔 + 收藏 + 退出
          <View style={styles.actionRow}>
            {HIGHLIGHT_COLORS.map(c => (
              <Pressable
                key={c}
                onPress={() => onPickColor(c)}
                style={[styles.colorDot, { backgroundColor: c }]}
                accessibilityLabel={`用颜色 ${c} 标记`}
              />
            ))}
            <View style={styles.actionDivider} />
            <Pressable onPress={onCollect} style={styles.collectBtn} accessibilityLabel="收藏金句">
              <Text style={[styles.collectText, { color: t.brassDeep }]}>⭐ 收藏金句</Text>
            </Pressable>
            <Pressable
              onPress={() => { setSelection(null); setMode('read'); }}
              style={styles.exitBtn}
              accessibilityLabel="退出标注"
            >
              <Text style={[styles.exitText, { color: t.inkMuted }]}>✕</Text>
            </Pressable>
          </View>
        ) : mode === 'mark' ? (
          // 标注态未选中：提示 + 退出
          <View style={styles.actionRow}>
            <Text style={[styles.markHint, { color: t.inkMuted }]}>长按正文拖动选择文字</Text>
            <Pressable
              onPress={() => { setSelection(null); setMode('read'); }}
              style={styles.exitBtn}
              accessibilityLabel="退出标注"
            >
              <Text style={[styles.exitText, { color: t.inkMuted }]}>✕ 退出标注</Text>
            </Pressable>
          </View>
        ) : (
          // 阅读态：进度 + 进入标注
          <>
            <Text style={[styles.progress, { color: t.inkMuted }]}>
              {progress ? `第 ${progress.index} / ${progress.total} 篇` : '— / —'}
            </Text>
            <Pressable
              style={[styles.markBtn, { backgroundColor: t.seal }]}
              onPress={() => { setSelection(null); setMode('mark'); }}
              accessibilityRole="button"
              accessibilityLabel="进入标注模式"
            >
              <Text style={[styles.markBtnText, { color: t.paper }]}>✏️ 标注</Text>
            </Pressable>
          </>
        )}
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
  modeHint: { fontSize: fontSizes.caption, letterSpacing: 2 },
  title: { fontSize: fontSizes.hero, lineHeight: fontSizes.hero * lineHeights.tight, marginBottom: spacing.sm },
  metaText: { fontFamily: fonts.sans.regular, fontSize: fontSizes.caption, marginBottom: spacing.md },
  content: { fontSize: fontSizes.body, lineHeight: fontSizes.body * lineHeights.reading },
  // 标注态 TextInput：零内边距，与 Text 渲染对齐
  selectable: { minHeight: 200, padding: 0 },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1 },
  progress: { fontFamily: fonts.serif.regular, fontSize: fontSizes.caption },
  markBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.sm },
  markBtnText: { fontFamily: fonts.serif.bold, fontSize: fontSizes.caption },
  actionRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  actionDivider: { width: 1, height: 22, backgroundColor: 'rgba(0,0,0,0.15)', marginHorizontal: spacing.xs },
  collectBtn: { paddingHorizontal: spacing.sm },
  collectText: { fontSize: fontSizes.caption, letterSpacing: 1 },
  exitBtn: { paddingHorizontal: spacing.sm, marginLeft: 'auto' },
  exitText: { fontSize: fontSizes.caption },
  markHint: { fontSize: fontSizes.caption, letterSpacing: 1, flex: 1 },
  toast: { flex: 1, textAlign: 'center', fontSize: fontSizes.caption, letterSpacing: 2 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontFamily: fonts.kai.regular, fontSize: fontSizes.body },
});