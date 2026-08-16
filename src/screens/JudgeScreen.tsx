// ShenlunApp/src/screens/JudgeScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { runJudge, type JudgeResult } from '../llm/client';
import { addLocalRecord } from '../llm/judgeStore';
import { fetchLlmConfig } from '../api/llmConfig';
import { getDeviceId } from '../storage/mmkv';
import { isLocalMode } from '../config/dataMode';
import type { Question } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'Judge'>;

export default function JudgeScreen({ route, navigation }: Props) {
  const { theme } = useTheme();
  const t = theme.tokens;
  const question: Question | undefined = route.params?.question;
  const [answer, setAnswer] = useState('');
  const [running, setRunning] = useState(false);
  // C1: 流式文本不再每次 delta setState。完整文本存 streamRef，
  // displayTick 作为"重渲染触发器"；delta 只更新 ref，每累计 5 个或 80ms
  // 通过 requestAnimationFrame 触发一次 setDisplayTick。1000 字流式过去
  // 每次都全屏重渲染（JS 线程被占满、滚动卡顿、取消按钮响应延迟）的问题
  // 直接消除。
  const streamRef = useRef('');
  const [displayTick, setDisplayTick] = useState(0);
  const pendingRef = useRef(0);
  const flushRef = useRef<number | null>(null);
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [raw, setRaw] = useState('');
  const [hasConfig, setHasConfig] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // M16: 屏卸载守卫，避免异步流的 setState 落到已 unmount 组件
  const mountedRef = useRef(true);

  const scheduleFlush = useCallback(() => {
    if (flushRef.current != null) return;
    flushRef.current = requestAnimationFrame(() => {
      flushRef.current = null;
      if (mountedRef.current) setDisplayTick(t => t + 1);
    });
  }, []);

  useEffect(() => {
    (async () => {
      const cfg = await fetchLlmConfig();
      if (mountedRef.current) setHasConfig(cfg.configured);
    })();
  }, []);

  // Cleanup: abort any in-flight SSE stream if the screen unmounts mid-run
  // (e.g. user backs out). Without this the upstream connection leaks.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (flushRef.current != null) {
        cancelAnimationFrame(flushRef.current);
        flushRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, []);

  const onStart = useCallback(async () => {
    if (!question) { Alert.alert('未选题目'); return; }
    if (answer.trim().length < 50) { Alert.alert('答案太短', '至少 50 字'); return; }
    if (!hasConfig) {
      if (isLocalMode()) {
        Alert.alert('独立模式下暂不可用', 'AI 评卷需要连接服务器。\n新服务器就绪后，到 设置 → 数据源 切换为"服务器"模式即可使用。', [
          { text: '知道了', style: 'cancel' },
        ]);
        return;
      }
      Alert.alert('未配置 LLM', '请到设置 → AI 评卷配置 Key', [
        { text: '去配置', onPress: () => navigation.navigate('LlmConfig') },
        { text: '取消', style: 'cancel' },
      ]);
      return;
    }
    setRunning(true);
    // C1: 初始化 streamRef + displayTick；displayTick 用于强制刷新 UI
    streamRef.current = '';
    pendingRef.current = 0;
    if (flushRef.current != null) {
      cancelAnimationFrame(flushRef.current);
      flushRef.current = null;
    }
    setDisplayTick(0);
    setResult(null);
    setRaw('');
    const ac = new AbortController();
    abortRef.current = ac;
    const gen = runJudge(question, answer, getDeviceId(), { signal: ac.signal });
    try {
      for await (const evt of gen) {
        if (!mountedRef.current) break;
        if (evt.type === 'delta') {
          // C1: 不再每 delta setState —— 写入 ref，累计 5 个或
          // raf 已调度则复用。displayTick 是唯一 UI 触发器。
          streamRef.current += evt.text;
          pendingRef.current += 1;
          if (pendingRef.current >= 5) {
            pendingRef.current = 0;
            scheduleFlush();
          } else {
            scheduleFlush();
          }
        } else if (evt.type === 'result') {
          // C1: 结果前先把所有 delta 提交到 UI（cancel 任何挂起 raf）
          if (flushRef.current != null) {
            cancelAnimationFrame(flushRef.current);
            flushRef.current = null;
          }
          pendingRef.current = 0;
          if (mountedRef.current) {
            setDisplayTick(t => t + 1);
            setResult(evt.result);
            setRaw(evt.raw);
          }
          if (evt.result) {
            addLocalRecord({
              questionId: question.id,
              questionNo: String(question.question_no ?? ''),
              questionTitle: question.title,
              questionScore: question.score ?? 0,
              totalScore: evt.result.total,
              raw: evt.raw,
              result: evt.result,
            });
          }
        } else if (evt.type === 'error') {
          if (mountedRef.current) Alert.alert('评卷失败', `${evt.code}: ${evt.message}`);
        }
      }
    } catch (e: unknown) {
      // AbortError 是用户主动取消，静默；其它错误提示。
      // 在 RN 中 AbortController.abort() 抛的是 DOMException，不继承自 Error，
      // 因此必须用 `.name` 判定，不能用 `instanceof Error`。
      if (mountedRef.current && (!e || (e as { name?: string })?.name !== 'AbortError')) {
        Alert.alert('评卷中断', e instanceof Error ? e.message : String(e));
      }
    } finally {
      // C1: 强制最后一帧确保最终文本可见
      if (flushRef.current != null) {
        cancelAnimationFrame(flushRef.current);
        flushRef.current = null;
      }
      if (mountedRef.current) {
        setDisplayTick(t => t + 1);
        setRunning(false);
        abortRef.current = null;
      }
    }
  }, [question, answer, hasConfig, navigation, scheduleFlush]);

  const onCancel = useCallback(() => abortRef.current?.abort(), []);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>AI 评卷</Text>
        <Pressable onPress={() => navigation.navigate('JudgeHistory')} hitSlop={8}>
          <Text style={[styles.historyText, { color: t.brassDeep, fontFamily: fonts.kai.bold }]}>历史</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {question ? (
          <View style={[styles.qCard, { backgroundColor: t.paper, borderColor: t.border }]}>
            <Text style={[styles.qTitle, { color: t.ink, fontFamily: fonts.serif.bold }]}>
              第{question.question_no}题  ·  {question.score ?? 0} 分
            </Text>
            <Text style={[styles.qBody, { color: t.inkSoft, fontFamily: fonts.kai.regular }]} numberOfLines={6}>
              {question.body}
            </Text>
            <Text style={[styles.qFull, { color: t.brassDeep, fontFamily: fonts.kai.regular }]}>（跳自题详情，仅显示前 6 行）</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => navigation.navigate('Main')}
            style={[styles.qCard, { backgroundColor: t.paper, borderColor: t.border }]}
          >
            <Text style={[styles.qTitle, { color: t.ink, fontFamily: fonts.serif.bold }]}>暂未选题目</Text>
            <Text style={[styles.qBody, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
              从"真题" Tab 进入任一题详情页，点右上角 🤖 AI 评卷 按钮直接带题过来。
            </Text>
          </Pressable>
        )}

        <Text style={[styles.label, { color: t.ink, fontFamily: fonts.kai.bold }]}>我的答案（至少 50 字）</Text>
        <TextInput
          value={answer}
          onChangeText={setAnswer}
          multiline
          textAlignVertical="top"
          placeholder="在此粘贴或手打你的申论答案..."
          placeholderTextColor={t.inkFaint}
          style={[styles.input, { backgroundColor: t.paper, borderColor: t.border, color: t.ink, fontFamily: fonts.kai.regular }]}
        />
        <Text style={[styles.countText, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>字数：{answer.trim().length}</Text>

        {!running ? (
          <Pressable
            onPress={onStart}
            style={[styles.btn, { backgroundColor: t.seal, borderColor: t.sealDeep }]}
          >
            <Text style={[styles.btnText, { color: t.paper, fontFamily: fonts.serif.bold }]}>开始评卷 →</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onCancel}
            style={[styles.btn, { backgroundColor: t.bg, borderColor: t.seal }]}
          >
            <Text style={[styles.btnText, { color: t.seal, fontFamily: fonts.serif.bold }]}>取消</Text>
          </Pressable>
        )}

        {(running || streamRef.current) && (
          <View style={[styles.streamCard, { backgroundColor: t.paper, borderColor: t.border }]}>
            <View style={styles.streamHead}>
              <ActivityIndicator color={t.seal} />
              <Text style={[styles.streamHeadText, { color: t.seal, fontFamily: fonts.kai.bold }]}>
                {running ? '正在评卷...' : '评语（流式）'}
              </Text>
            </View>
            {/* C1: 渲染读取 streamRef；displayTick 触发整树重渲染但 ref
                已是完整文本，单组件重渲染不会再让整屏重建任何非依赖组件。 */}
            <Text style={[styles.streamBody, { color: t.ink, fontFamily: fonts.kai.regular }]}>
              {streamRef.current || '等待响应...'}
            </Text>
          </View>
        )}

        {result && (
          <View style={[styles.resultCard, { backgroundColor: t.paper, borderColor: t.brass }]}>
            <View style={styles.resultHead}>
              <Text style={[styles.totalLabel, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>总 分</Text>
              <Text style={[styles.totalScore, { color: t.seal, fontFamily: fonts.serif.bold }]}>
                {result.total} <Text style={[styles.totalMax, { color: t.inkMuted, fontFamily: fonts.serif.regular }]}>/ {question?.score ?? 0}</Text>
              </Text>
            </View>

            <View style={styles.dimList}>
              {result.dimensions.map(d => (
                <View key={d.key} style={[styles.dimRow, { borderBottomColor: t.divider }]}>
                  <Text style={[styles.dimKey, { color: t.ink, fontFamily: fonts.kai.bold }]}>{labelOfKey(d.key)}</Text>
                  <Text style={[styles.dimScore, { color: t.brassDeep, fontFamily: fonts.serif.bold }]}>{d.score}</Text>
                  <Text style={[styles.dimComment, { color: t.inkSoft, fontFamily: fonts.kai.regular }]} numberOfLines={2}>{d.comment}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.section, { color: t.jade, fontFamily: fonts.kai.bold }]}>亮 点</Text>
            {result.highlights.map((h, i) => (
              <Text key={i} style={[styles.bullet, { color: t.ink, fontFamily: fonts.kai.regular }]}>· {h}</Text>
            ))}

            <Text style={[styles.section, { color: t.seal, fontFamily: fonts.kai.bold }]}>不 足</Text>
            {result.weaknesses.map((w, i) => (
              <Text key={i} style={[styles.bullet, { color: t.ink, fontFamily: fonts.kai.regular }]}>· {w}</Text>
            ))}

            <Text style={[styles.section, { color: t.brassDeep, fontFamily: fonts.kai.bold }]}>重写建议</Text>
            <Text style={[styles.bullet, { color: t.inkSoft, fontFamily: fonts.kai.regular }]}>{result.rewrite_hint}</Text>
          </View>
        )}

        {!result && raw && !running && (
          <View style={[styles.streamCard, { backgroundColor: t.paper, borderColor: t.seal }]}>
            <Text style={[styles.streamHeadText, { color: t.seal, fontFamily: fonts.kai.bold }]}>评分维度解析失败</Text>
            <Text style={[styles.streamBody, { color: t.ink, fontFamily: fonts.kai.regular }]}>{raw}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function labelOfKey(k: string): string {
  switch (k) {
    case 'theme': return '立 意';
    case 'structure': return '结 构';
    case 'argument': return '论 据';
    case 'language': return '语 言';
    case 'wordcount': return '字 数';
    default: return k;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs,
    borderBottomWidth: 1,
  },
  backText: { fontSize: fontSizes.body, minWidth: 60 },
  title: { fontSize: fontSizes.subtitle, letterSpacing: 4, flex: 1, textAlign: 'center' },
  historyText: { fontSize: fontSizes.caption, minWidth: 60, textAlign: 'right' },
  qCard: { padding: spacing.md, borderWidth: borders.hair, borderRadius: radii.md, marginBottom: spacing.md },
  qTitle: { fontSize: fontSizes.body, marginBottom: spacing.xs },
  qBody: { fontSize: fontSizes.caption, lineHeight: 20 },
  qFull: { fontSize: fontSizes.micro, marginTop: spacing.xs },
  label: { fontSize: fontSizes.caption, letterSpacing: 2, marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    minHeight: 200, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: borders.hair, borderRadius: radii.md,
    fontSize: fontSizes.body, lineHeight: 22,
  },
  countText: { fontSize: fontSizes.micro, textAlign: 'right', marginTop: 4 },
  btn: { marginTop: spacing.lg, paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1, alignItems: 'center' },
  btnText: { fontSize: fontSizes.body, letterSpacing: 4 },
  streamCard: { marginTop: spacing.lg, padding: spacing.md, borderWidth: borders.hair, borderRadius: radii.md },
  streamHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  streamHeadText: { fontSize: fontSizes.caption, letterSpacing: 2 },
  streamBody: { fontSize: fontSizes.body, lineHeight: 22 },
  resultCard: { marginTop: spacing.lg, padding: spacing.md, borderWidth: 1, borderRadius: radii.md },
  resultHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: spacing.md },
  totalLabel: { fontSize: fontSizes.caption, letterSpacing: 2 },
  totalScore: { fontSize: 32 },
  totalMax: { fontSize: fontSizes.body },
  dimList: { marginBottom: spacing.md },
  dimRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderBottomWidth: 1 },
  dimKey: { width: 50, fontSize: fontSizes.caption, letterSpacing: 2 },
  dimScore: { width: 40, fontSize: fontSizes.body, textAlign: 'right' },
  dimComment: { flex: 1, fontSize: fontSizes.caption, marginLeft: spacing.sm },
  section: { fontSize: fontSizes.caption, letterSpacing: 4, marginTop: spacing.sm, marginBottom: 4 },
  bullet: { fontSize: fontSizes.caption, lineHeight: 22, marginLeft: spacing.sm },
});