// src/screens/PaperScreen.tsx
// 题目 Tab: 真题库列表 + 详情（题干 / 答案 切换）
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable,
  ActivityIndicator, FlatList, TextInput, RefreshControl,
} from 'react-native';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { getPapers, getPaper, getQuestions, type Paper, type PaperDetail, type Question } from '../api/client';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

type Level = 'guokao' | 'shengkao';
type QaTab = 'q' | 'a';

const LEVEL_TABS: { key: Level; label: string }[] = [
  { key: 'guokao', label: '国考' },
  { key: 'shengkao', label: '省考' },
];

export default function PaperScreen() {
  const { theme } = useTheme();
  const t = theme.tokens;
  const nav = useNavigation<NavProp>();

  const [level, setLevel] = useState<Level>('guokao');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [yearFilter, setYearFilter] = useState<string>('');
  const [provinceFilter, setProvinceFilter] = useState<string>('');
  const debouncedYear = useDebouncedValue(yearFilter, 400);
  const debouncedProvince = useDebouncedValue(provinceFilter, 400);
  const [detail, setDetail] = useState<PaperDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [qaTab, setQaTab] = useState<QaTab>('q');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showQuestions, setShowQuestions] = useState(false);
  const [activeQ, setActiveQ] = useState<Question | null>(null);

  // M3: mountedRef guard. Each async load flips it false on unmount so
  // setState after the await never runs against an unmounted tree.
  // (Fixes the q/a switch crash: switching then immediately backing out
  // could call setDetail/setDetailLoading against an unmounted screen.)
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch list
  const loadPapers = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await getPapers({
        level,
        year: debouncedYear ? Number(debouncedYear) : undefined,
        province: level === 'shengkao' && debouncedProvince ? debouncedProvince : undefined,
        pageSize: 50,
      });
      if (mountedRef.current) {
        setPapers(resp.items);
        setTotal(resp.total);
      }
    } catch {
      if (mountedRef.current) {
        setPapers([]);
        setTotal(0);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [level, debouncedYear, debouncedProvince]);

  useEffect(() => { loadPapers(); }, [loadPapers]);

  // Open detail
  const openPaper = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    setActiveQ(null);
    setShowQuestions(false);
    try {
      const d = await getPaper(id);
      if (!mountedRef.current) return;
      setDetail(d);
      setQaTab(d?.qa ?? 'q');
    } catch {
      if (mountedRef.current) setDetail(null);
    } finally {
      if (mountedRef.current) setDetailLoading(false);
    }
  }, []);

  // Back from detail
  const closeDetail = useCallback(() => {
    setDetail(null);
    setQuestions([]);
    setShowQuestions(false);
    setActiveQ(null);
  }, []);

  // Load questions for current detail paper
  const loadQuestions = useCallback(async () => {
    if (!detail) return;
    const resp = await getQuestions(detail.id);
    if (!mountedRef.current) return;
    setQuestions(resp.items);
    setShowQuestions(true);
  }, [detail]);

  // L7: renderItem 抽 useCallback —— PaperScreen 自身加载时 setPapers
  // 会触发整屏渲染，没有 useCallback 会重建所有 Pressable + 内联 style。
  const renderPaper = useCallback(({ item }: { item: Paper }) => (
    <Pressable
      onPress={() => openPaper(item.id)}
      style={({ pressed }) => [
        styles.paperCard,
        { backgroundColor: t.paper, borderColor: t.border },
        pressed && { opacity: 0.85 },
      ]}
      android_ripple={{ color: `${t.brass}22` }}
    >
      <View style={styles.paperHead}>
        <Text style={[styles.paperTitle, { color: t.ink, fontFamily: fonts.serif.bold }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.paperQa, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          {item.qa === 'q' ? '试 题' : '答 案'}
        </Text>
      </View>
      <Text style={[styles.paperMeta, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
        {item.province}  ·  {item.volume || '通用'}{item.joint ? '  ·  联考' : ''}
      </Text>
    </Pressable>
  ), [openPaper, t.paper, t.border, t.ink, t.inkMuted, t.inkFaint, t.brass]);

  // Detail view: single question focused
  if (detail && activeQ) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
          <Pressable onPress={() => setActiveQ(null)} hitSlop={8}>
            <Text style={[styles.backText, { color: t.ink }]}>← 单题列表</Text>
          </Pressable>
          <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]} numberOfLines={1}>
            第{activeQ.question_no}题
          </Text>
          <Pressable
            onPress={() => nav.navigate('Judge', { question: activeQ })}
            style={[styles.aiBtn, { backgroundColor: t.seal, borderColor: t.sealDeep }]}
          >
            <Text style={[styles.aiBtnText, { color: t.paper, fontFamily: fonts.serif.bold }]}>🤖 评卷</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          <View style={[styles.qSourceBox, { backgroundColor: t.paper, borderColor: t.border }]}>
            <Text style={[styles.qSourceLine, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
              来源：{detail.title}
            </Text>
            <Text style={[styles.qSourceLine, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
              分值：{activeQ.score || '—'} 分  ·  题型：申论
            </Text>
          </View>
          <Text style={[styles.body, { color: t.inkSoft, fontFamily: fonts.kai.regular }]}>
            {activeQ.body}
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Detail view: question list under paper
  if (detail && showQuestions) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
          <Pressable onPress={() => setShowQuestions(false)} hitSlop={8}>
            <Text style={[styles.backText, { color: t.ink }]}>← 全文</Text>
          </Pressable>
          <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]} numberOfLines={1}>
            {detail.title} · 单题
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <FlatList
          data={questions}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
              此卷未拆出单题，查看全文。
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setActiveQ(item)}
              style={({ pressed }) => [
                styles.paperCard,
                { backgroundColor: t.paper, borderColor: t.border },
                pressed && { opacity: 0.85 },
              ]}
              android_ripple={{ color: `${t.brass}22` }}
            >
              <View style={styles.paperHead}>
                <Text style={[styles.paperTitle, { color: t.ink, fontFamily: fonts.serif.bold }]} numberOfLines={2}>
                  第{item.question_no}题
                </Text>
                <Text style={[styles.paperQa, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
                  {item.score ? `${item.score} 分` : '—'}
                </Text>
              </View>
              <Text style={[styles.paperMeta, { color: t.inkSoft, fontFamily: fonts.kai.regular }]} numberOfLines={2}>
                {item.title}
              </Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    );
  }

  // Detail view: full paper text
  if (detail) {
    const content = stripFrontmatter(detail.content);
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
          <Pressable onPress={closeDetail} hitSlop={8}>
            <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
          </Pressable>
          <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]} numberOfLines={1}>
            {detail.title}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        {/* 题目 / 答案 tab for the same paper */}
        <View style={styles.qSwitchRow}>
          {(['q', 'a'] as QaTab[]).map(k => (
            <Pressable
              key={k}
              onPress={async () => {
                const other = k === 'q'
                  ? detail.id.replace(/-q-/, '-a-')
                  : detail.id.replace(/-a-/, '-q-');
                setQaTab(k);
                setDetailLoading(true);
                try {
                  const d = await getPaper(other);
                  if (!mountedRef.current) return;
                  setDetail(d ?? detail);
                } finally {
                  if (mountedRef.current) setDetailLoading(false);
                }
              }}
              style={[
                styles.qSwitchTab,
                qaTab === k && { borderBottomColor: t.seal, borderBottomWidth: 3 },
              ]}
            >
              <Text style={[styles.qSwitchText, { color: qaTab === k ? t.seal : t.inkMuted, fontFamily: fonts.kai.bold }]}>
                {k === 'q' ? '试 题' : '答 案'}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={loadQuestions}
            style={[styles.qSwitchTab, { marginLeft: 'auto', borderBottomWidth: 0 }]}
          >
            <Text style={[styles.qSwitchText, { color: t.brassDeep, fontFamily: fonts.kai.bold }]}>单 题</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {detailLoading ? (
            <View style={styles.center}><ActivityIndicator color={t.brass} /></View>
          ) : (
            <Text style={[styles.body, { color: t.inkSoft, fontFamily: fonts.kai.regular }]}>
              {content}
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // List view
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      {/* 顶部筛选 */}
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <View style={styles.levelTabs}>
          {LEVEL_TABS.map(lv => (
            <Pressable
              key={lv.key}
              onPress={() => setLevel(lv.key)}
              style={[styles.levelTab, level === lv.key && { borderBottomColor: t.seal, borderBottomWidth: 3 }]}
            >
              <Text style={[styles.levelText, { color: level === lv.key ? t.seal : t.inkMuted, fontFamily: fonts.kai.bold }]}>
                {lv.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 年份 + 省份筛选 */}
      <View style={[styles.filterBar, { borderBottomColor: t.divider }]}>
        <TextInput
          value={yearFilter}
          onChangeText={setYearFilter}
          placeholder="按年份筛选 (如 2025)"
          placeholderTextColor={t.inkFaint}
          keyboardType="numeric"
          style={[styles.filterInput, { backgroundColor: t.paper, borderColor: t.border, color: t.ink, fontFamily: fonts.serif.regular }]}
        />
        {level === 'shengkao' && (
          <TextInput
            value={provinceFilter}
            onChangeText={setProvinceFilter}
            placeholder="按省份筛选 (如 安徽)"
            placeholderTextColor={t.inkFaint}
            style={[styles.filterInput, { backgroundColor: t.paper, borderColor: t.border, color: t.ink, fontFamily: fonts.serif.regular }]}
          />
        )}
      </View>

      <View style={styles.countRow}>
        <Text style={[styles.countText, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          共 {total} 卷
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={t.brass} /></View>
      ) : (
        <FlatList
          data={papers}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadPapers} colors={[t.seal]} />
          }
          renderItem={renderPaper}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
              暂无匹配真题
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

function stripFrontmatter(s: string): string {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(s);
  return m ? s.slice(m[0].length).trimStart() : s;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 0,
    borderBottomWidth: 1,
  },
  backText: { fontSize: fontSizes.body, paddingVertical: spacing.xs, minWidth: 60 },
  title: { flex: 1, fontSize: fontSizes.subtitle, letterSpacing: 4, textAlign: 'center' },

  levelTabs: { flexDirection: 'row', gap: spacing.xl },
  levelTab: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 1.5, borderBottomColor: 'transparent' },
  levelText: { fontSize: fontSizes.body, letterSpacing: 6 },

  filterBar: {
    flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  filterInput: {
    flex: 1,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderWidth: borders.hair, borderRadius: radii.sm,
    fontSize: fontSizes.caption,
  },

  countRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  countText: { fontSize: fontSizes.caption, letterSpacing: 2 },

  paperCard: {
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: borders.hair, borderRadius: radii.md,
  },
  paperHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  paperTitle: { flex: 1, fontSize: fontSizes.body, marginRight: spacing.sm },
  paperQa: { fontSize: fontSizes.caption, letterSpacing: 2 },
  paperMeta: { fontSize: fontSizes.micro, letterSpacing: 1 },

  qSwitchRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(201,169,98,0.3)' },
  qSwitchTab: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderBottomWidth: 1.5, borderBottomColor: 'transparent' },
  qSwitchText: { fontSize: fontSizes.body, letterSpacing: 6 },

  body: { fontSize: fontSizes.body, lineHeight: 26 },
  center: { padding: spacing.xxxl, alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: spacing.xxxl, fontSize: fontSizes.body, letterSpacing: 4 },

  qSourceBox: {
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: borders.hair, borderRadius: radii.sm,
  },
  qSourceLine: { fontSize: fontSizes.caption, letterSpacing: 1, lineHeight: 20 },

  aiBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.sm },
  aiBtnText: { fontSize: fontSizes.caption },
});