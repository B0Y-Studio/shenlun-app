// ShenlunApp/src/screens/JudgeHistoryScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, Pressable, Alert } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { listLocalRecords, deleteLocalRecord, type LocalJudgeRecord } from '../llm/judgeStore';
import { fetchJudgeHistory, deleteJudgeHistoryServer } from '../api/llmConfig';

type Nav = NativeStackNavigationProp<RootStackParamList, 'JudgeHistory'>;

export default function JudgeHistoryScreen() {
  const { theme } = useTheme();
  const t = theme.tokens;
  const nav = useNavigation<Nav>();
  const [records, setRecords] = useState<LocalJudgeRecord[]>([]);
  const [serverOnly, setServerOnly] = useState<Array<{ id: string; questionTitle: string; questionScore: number; totalScore: number; createdAt: number }>>([]);

  const load = useCallback(async () => {
    setRecords(listLocalRecords(50));
    const serverItems = await fetchJudgeHistory(undefined, 50);
    const localIds = new Set(listLocalRecords(200).map(r => r.id));
    setServerOnly(serverItems.filter(s => !localIds.has(s.id)));
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const fmtTime = (ms: number) => {
    const d = new Date(ms);
    return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const renderItem = ({ item, isLocal }: { item: any; isLocal: boolean }) => (
    <Pressable
      onLongPress={() => onDelete(item.id, isLocal)}
      style={[styles.card, { backgroundColor: t.paper, borderColor: t.border }]}
    >
      <View style={styles.cardHead}>
        <Text style={[styles.qTitle, { color: t.ink, fontFamily: fonts.serif.bold }]} numberOfLines={1}>
          {item.questionTitle || item.question_title || '未命名题'}
        </Text>
        <Text style={[styles.score, { color: t.seal, fontFamily: fonts.serif.bold }]}>
          {item.totalScore}/{item.questionScore ?? item.question_score}
        </Text>
      </View>
      <Text style={[styles.meta, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
        {fmtTime(item.createdAt)}  ·  长按删除
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>评卷历史</Text>
        <View style={{ width: 60 }} />
      </View>
      <FlatList
        data={[
          ...records.map(r => ({ ...r, _isLocal: true })),
          ...serverOnly.map(s => ({ ...s, _isLocal: false })),
        ]}
        keyExtractor={(it: any) => it.id + (it._isLocal ? '_L' : '_S')}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={<Text style={[styles.empty, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>暂无评卷记录</Text>}
        renderItem={({ item }: any) => renderItem({ item, isLocal: item._isLocal })}
      />
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
});