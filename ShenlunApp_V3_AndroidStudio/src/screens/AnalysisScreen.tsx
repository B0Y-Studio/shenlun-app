// src/screens/AnalysisScreen.tsx
// 占位屏 —— 分析建议（薄弱题型/AI 评卷/高频考点）
import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing } from '../theme/tokens';

export default function AnalysisScreen() {
  const { theme } = useTheme();
  const t = theme.tokens;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>分 析 建 议</Text>
        <Text style={[styles.sub, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          薄弱题型 · 高频考点 · AI 评卷
        </Text>
        <Text style={[styles.empty, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>（即将上线）</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  title: { fontSize: fontSizes.hero, letterSpacing: 6, marginBottom: spacing.md },
  sub: { fontSize: fontSizes.body, letterSpacing: 2, textAlign: 'center' },
  empty: { marginTop: spacing.xxl, fontSize: fontSizes.body, letterSpacing: 4 },
});
