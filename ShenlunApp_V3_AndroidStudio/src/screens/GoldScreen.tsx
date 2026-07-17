// src/screens/GoldScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { getNotes, type Note } from '../api/client';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, radii, borders } from '../theme/tokens';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Gold'>;

export default function GoldScreen(props: Props) {
  const { navigation } = props;
  const { theme } = useTheme();
  const t = theme.tokens;
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getNotes();
        if (cancelled) return;
        setNotes(data);
      } catch {
        if (!cancelled) setNotes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      {/* 顶部导航 */}
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: t.ink }]}>金句库</Text>
        <Text style={[styles.total, { color: t.inkMuted }]}>共 {notes.length} 条</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={t.brass} />
        </View>
      ) : (
      <FlatList
        data={notes}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: t.paper, borderColor: t.brass }]}>
            <Text style={[styles.sentence, { color: t.ink, fontFamily: fonts.serif.bold }]}>
              "{item.sentence}"
            </Text>
            <View style={styles.cardMeta}>
              <Text style={[styles.source, { color: t.inkMuted }]}>—《{item.article_title}》</Text>
              <View style={[styles.themeTag, { backgroundColor: `${t.seal}15` }]}>
                <Text style={[styles.themeText, { color: t.seal }]}>{item.theme}</Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: t.inkMuted }]}>暂无金句，长按文章文字标记</Text>
        }
      />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  backBtn: { width: 50 },
  backText: { fontSize: fontSizes.body },
  topTitle: { fontFamily: fonts.serif.bold, fontSize: fontSizes.subtitle },
  total: { fontFamily: fonts.sans.regular, fontSize: fontSizes.caption },
  list: { padding: spacing.lg },
  card: { padding: spacing.lg, borderWidth: borders.hair, borderRadius: radii.md, marginBottom: spacing.md },
  sentence: { fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.6, marginBottom: spacing.sm },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  source: { fontFamily: fonts.kai.regular, fontSize: fontSizes.caption },
  themeTag: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill },
  themeText: { fontFamily: fonts.sans.medium, fontSize: fontSizes.micro },
  empty: { fontFamily: fonts.kai.regular, fontSize: fontSizes.body, textAlign: 'center', marginTop: spacing.xxxl },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
