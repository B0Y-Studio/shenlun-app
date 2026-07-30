// ShenlunApp/src/screens/JudgeScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { runJudge, type JudgeResult, safeParseJudgeResult } from '../llm/client';
import { addLocalRecord } from '../llm/judgeStore';
import { fetchLlmConfig } from '../api/llmConfig';
import { getDeviceId } from '../storage/mmkv';
import type { Question } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'Judge'>;

export default function JudgeScreen({ route, navigation }: Props) {
  const { theme } = useTheme();
  const t = theme.tokens;
  const passedQuestion: Question | undefined = route.params?.question;

  const [question, setQuestion] = useState<Question | undefined>(passedQuestion);
  const [answer, setAnswer] = useState('');
  const [running, setRunning] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [raw, setRaw] = useState('');
  const [hasConfig, setHasConfig] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      const cfg = await fetchLlmConfig();
      setHasConfig(cfg.configured);
    })();
  }, []);

  const onStart = useCallback(async () => {
    if (!question) { Alert.alert('未选题目'); return; }
    if (answer.trim().length < 50) { Alert.alert('答案太短', '至少 50 字'); return; }
    if (!hasConfig) {
      Alert.alert('未配置 LLM', '请到设置 → AI 评卷配置 Key', [
        { text: '去配置', onPress: () => navigation.navigate('LlmConfig' as never) },
        { text: '取消', style: 'cancel' },
      ]);
      return;
    }
    setRunning(true);
    setStreamText('');
    setResult(null);
    setRaw('');
    const ac = new AbortController();
    abortRef.current = ac;
    const gen = runJudge(question, answer, getDeviceId(), { signal: ac.signal });
    let collected = '';
    try {
      for await (const evt of gen) {
        if (evt.type === 'delta') {
          collected += evt.text;
          setStreamText(collected);
        } else if (evt.type === 'result') {
          setResult(evt.result);
          setRaw(evt.raw);
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
          Alert.alert('评卷失败', `${evt.code}: ${evt.message}`);
        }
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [question, answer, hasConfig, navigation]);

  const onCancel = () => abortRef.current?.abort();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>AI 评卷</Text>
        <Pressable onPress={() => navigation.navigate('JudgeHistory' as never)} hitSlop={8}>
          <Text style={[styles.historyText, { color: t.brassDeep, fontFamily: fonts.kai.bold }]}>历史</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {question ? (
          <View style={[styles.qCard, { backgroundColor: t.paper, borderColor: t.border }]}>
            <Text style={[styles.qTitle, { color: t.ink, fontFamily: fonts.serif.bold }]}>
              第{question.question_no}题  ·  {question.score} 分
            </Text>
            <Text style={[styles.qBody, { color: t.inkSoft, fontFamily: fonts.kai.regular }]} numberOfLines={6}>
              {question.body}
            </Text>
            <Text style={[styles.qFull, { color: t.brassDeep, fontFamily: fonts.kai.regular }]}>（跳自题详情，仅显示前 6 行）</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => navigation.navigate('Main' as never)}
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
        <Text style={[styles.countText, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>字数：{answer.length}</Text>

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

        {(running || streamText) && (
          <View style={[styles.streamCard, { backgroundColor: t.paper, borderColor: t.border }]}>
            <View style={styles.streamHead}>
              <ActivityIndicator color={t.seal} />
              <Text style={[styles.streamHeadText, { color: t.seal, fontFamily: fonts.kai.bold }]}>
                {running ? '正在评卷...' : '评语（流式）'}
              </Text>
            </View>
            <Text style={[styles.streamBody, { color: t.ink, fontFamily: fonts.kai.regular }]}>
              {streamText || '等待响应...'}
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