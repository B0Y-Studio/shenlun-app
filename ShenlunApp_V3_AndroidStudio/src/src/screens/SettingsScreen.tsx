// src/screens/SettingsScreen.tsx
// 主题模式切换 + 通用设置（占位）
import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';

type Mode = 'light' | 'dark' | 'system';

const MODES: { key: Mode; label: string }[] = [
  { key: 'light',  label: '日间' },
  { key: 'dark',   label: '夜间' },
  { key: 'system', label: '跟随' },
];

export default function SettingsScreen() {
  const { theme, themeMode, setThemeMode } = useTheme();
  const t = theme.tokens;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>设 置</Text>

        <View style={[styles.section, { backgroundColor: t.paper, borderColor: t.border }]}>
          <Text style={[styles.sectionHead, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            主 题 模 式
          </Text>
          <View style={styles.row}>
            {MODES.map(m => {
              const active = themeMode === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setThemeMode(m.key)}
                  style={({ pressed }) => [
                    styles.opt,
                    { borderColor: t.border },
                    active && { backgroundColor: t.seal, borderColor: t.seal },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={[
                    styles.optLbl,
                    { color: active ? t.paper : t.inkSoft, fontFamily: fonts.serif.bold },
                  ]}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={[styles.empty, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
          更多设置即将上线
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  title: { fontSize: fontSizes.hero, letterSpacing: 6, marginBottom: spacing.lg, textAlign: 'center' },
  section: {
    padding: spacing.lg,
    borderWidth: borders.hair,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
  },
  sectionHead: { fontSize: fontSizes.body, letterSpacing: 3, marginBottom: spacing.md, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  opt: {
    flex: 1, paddingVertical: spacing.md, borderWidth: borders.hair, borderRadius: radii.sm,
    alignItems: 'center',
  },
  optLbl: { fontSize: fontSizes.body, letterSpacing: 4 },
  empty: { textAlign: 'center', fontSize: fontSizes.body, letterSpacing: 4, marginTop: spacing.xxxl },
});
