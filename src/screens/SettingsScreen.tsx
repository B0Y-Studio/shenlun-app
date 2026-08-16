// src/screens/SettingsScreen.tsx
// 主题模式 + 数据源模式切换 + LLM 配置入口
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { getDataMode, setDataMode, type DataMode } from '../config/dataMode';
import { getLocalDataVersion } from '../data/localData';

type Mode = 'light' | 'dark' | 'system';
type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

const MODES: { key: Mode; label: string }[] = [
  { key: 'light',  label: '日间' },
  { key: 'dark',   label: '夜间' },
  { key: 'system', label: '跟随' },
];

const DATA_MODES: { key: DataMode; label: string; hint: string }[] = [
  { key: 'local',  label: '本地', hint: '内容打包在 App 内，离线可用' },
  { key: 'server', label: '服务器', hint: '连接远程服务端（需服务器在线）' },
];

export default function SettingsScreen() {
  const { theme, themeMode, setThemeMode } = useTheme();
  const t = theme.tokens;
  const navigation = useNavigation<NavProp>();

  const [dataMode, setDataModeState] = useState<DataMode>(() => getDataMode());
  const onDataModePress = useCallback((key: DataMode) => {
    setDataMode(key);
    setDataModeState(key);
  }, []);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: t.bg }]}>
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

        {/* 数据源模式：独立模式 ⇄ 服务器模式（网络代码保留，随时切回） */}
        <View style={[styles.section, { backgroundColor: t.paper, borderColor: t.border }]}>
          <Text style={[styles.sectionHead, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            数 据 源
          </Text>
          <View style={styles.row}>
            {DATA_MODES.map(m => {
              const active = dataMode === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => onDataModePress(m.key)}
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
          <Text style={[styles.dataVersion, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
            {dataMode === 'local'
              ? `本地数据包：${getLocalDataVersion()}`
              : '服务器模式：AI 评卷可用；其余内容来自服务端'}
          </Text>
        </View>

        <Pressable
          onPress={() => navigation.navigate('LlmConfig')}
          style={({ pressed }) => [
            styles.settingRow,
            { backgroundColor: t.paper, borderColor: t.border },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={[styles.settingTitle, { color: t.ink, fontFamily: fonts.kai.bold }]}>
            AI 评卷 · LLM 配置
          </Text>
          <Text style={[styles.settingSub, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            {dataMode === 'local' ? '需要服务器模式才能使用' : '配置 Key、切换服务商'}
          </Text>
          <Text style={[styles.arrow, { color: t.brassDeep }]}>›</Text>
        </Pressable>
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
  dataVersion: { fontSize: fontSizes.caption, letterSpacing: 1, marginTop: spacing.md, textAlign: 'center' },

  settingRow: {
    padding: spacing.lg,
    borderWidth: borders.hair,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  settingTitle: { fontSize: fontSizes.body, letterSpacing: 3, marginBottom: spacing.xs },
  settingSub:   { fontSize: fontSizes.caption, letterSpacing: 1 },
  arrow:        { position: 'absolute', right: spacing.lg, top: spacing.lg, fontSize: 24 },
});