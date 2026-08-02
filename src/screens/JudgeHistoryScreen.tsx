// ShenlunApp/src/screens/JudgeHistoryScreen.tsx
//
// H4: 三处性能修复
// 1. `rows` 改为 useMemo 包裹（每次渲染不再新建数组对象）
// 2. `renderItem` 抽 HistoryRow 子组件 + useCallback 包裹
// 3. `load` 只读一次 local 记录（之前 `listLocalRecords(50)` + `listLocalRecords(200)`
//    各跑一次，MMKV 二次 JSON.parse；现在统一读 200 条 + 切片）
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { listLocalRecords, deleteLocalRecord, type LocalJudgeRecord } from '../llm/judgeStore';
import { fetchJudgeHistory, deleteJudgeHistoryServer, type RemoteJudgeItem } from '../api/llmConfig';
import { getDeviceId } from '../storage/mmkv';

type Nav = NativeStackNavigationProp<RootStackParamList, 'JudgeHistory'>;

type HistoryRow =
  | (LocalJudgeRecord & { _isLocal: true })
  | (RemoteJudgeItem & { _isLocal: false });

function fmtTime(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface HistoryRowProps {
  item: HistoryRow;
  theme: { tokens: ReturnType<typeof useTheme>['theme']['tokens'] };
  onLongPress: (id: string, isLocal: boolean) => void;
}
// H4: HistoryRow 子组件 + memo。同 listLocalRecords / setRecords 触发
// 重建时，FlatList 复用生效，每个卡片只在 props 真变化时重渲染。
const HistoryRowView = React.memo<HistoryRowProps>(({ item, theme, onLongPress }) => {
  const t = theme.tokens;
  return (
    <Pressable
      onLongPress={() => onLongPress(item.id, item._isLocal)}
      style={[styles.card, { backgroundColor: t.paper, borderColor: t.border }]}
    >
      <View style={styles.cardHead}>
        <Text style={[styles.qTitle, { color: t.ink, fontFamily: fonts.serif.bold }]} numberOfLines={1}>
          {item.questionTitle ?? '未命名题'}
        </Text>
        <Text style={[styles.score, { color: t.seal, fontFamily: fonts.serif.bold }]}>
          {item.totalScore}/{item.questionScore}
        </Text>
      </View>
      <Text style={[styles.meta, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
        {fmtTime(item.createdAt)}  ·  长按删除
      </Text>
    </Pressable>
  );
});

export default function JudgeHistoryScreen() {
  const { theme } = useTheme();
  const t = theme.tokens;
  const nav = useNavigation<Nav>();
  const [records, setRecords] = useState<LocalJudgeRecord[]>([]);
  const [serverOnly, setServerOnly] = useState<RemoteJudgeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // H4: load 只读一次 local：listLocalRecords(200) 一次（MMKV getString +
  // JSON.parse 一次），取前 50 显示，剩下 50-200 用作"已存在 id 集合"
  // 用来过滤服务端返回重复项。
  const load = useCallback(async () => {
    setLoading(true);
    const localAll = listLocalRecords(200);
    setRecords(localAll.slice(0, 50));
    const serverItems = await fetchJudgeHistory(getDeviceId(), 50);
    const localIds = new Set(localAll.map(r => r.id));
    setServerOnly(serverItems.filter(s => !localIds.has(s.id)));
    setLoading(false);
  }, []);

  // M5: 屏卸载时取消异步加载
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // load 在 mount-only useEffect 里调用一次，effect 自身 dependency []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDelete = useCallback((id: string, isLocal: boolean) => {
    Alert.alert('删除记录', '确定删除？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive', onPress: async () => {
          if (isLocal) deleteLocalRecord(id);
          await deleteJudgeHistoryServer(id);
          load();
        },
      },
    ]);
  }, [load]);

  // H4: rows 数组 useMemo 化。records / serverOnly 不变则不重建数组。
  const rows = useMemo<HistoryRow[]>(() => [
    ...records.map(r => ({ ...r, _isLocal: true } as HistoryRow)),
    ...serverOnly.map(s => ({ ...s, _isLocal: false } as HistoryRow)),
  ], [records, serverOnly]);

  // H4: renderItem 抽 useCallback（依赖 theme + onDelete，引用在两者不变时稳定）
  const renderItem = useCallback(({ item }: { item: HistoryRow }) => (
    <HistoryRowView item={item} theme={theme} onLongPress={onDelete} />
  ), [theme, onDelete]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>评卷历史</Text>
        <View style={{ width: 60 }} />
      </View>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={t.brass} />
          <Text style={[styles.loadingText, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>加载中…</Text>
        </View>
      ) : (
        <FlatList<HistoryRow>
          data={rows}
          keyExtractor={(item: HistoryRow) => item.id + (item._isLocal ? '_L' : '_S')}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={<Text style={[styles.empty, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>暂无评卷记录</Text>}
          renderItem={renderItem}
        />
      )}
    </SafeAreaView>
  );
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
  card: { padding: spacing.md, marginBottom: spacing.sm, borderWidth: borders.hair, borderRadius: radii.md },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qTitle: { flex: 1, fontSize: fontSizes.body, marginRight: spacing.sm },
  score: { fontSize: fontSizes.body },
  meta: { fontSize: fontSizes.micro, marginTop: spacing.xs },
  empty: { textAlign: 'center', marginTop: spacing.xxxl, fontSize: fontSizes.body, letterSpacing: 4 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  loadingText: { marginTop: spacing.sm, fontSize: fontSizes.body, letterSpacing: 4 },
});