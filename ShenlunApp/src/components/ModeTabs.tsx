// src/components/ModeTabs.tsx
// 复盘屏用的"按月 | 按主题" 模式切换条 (V3 风格)
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, spacing } from '../theme/tokens';

export interface ModeOption<K extends string = string> {
  key: K;
  label: string;
}

interface Props<K extends string> {
  value: K;
  options: ModeOption<K>[];
  onChange: (key: K) => void;
}

export function ModeTabs<K extends string>({ value, options, onChange }: Props<K>) {
  const { theme } = useTheme();
  const t = theme.tokens;
  return (
    <View style={[styles.bar, { borderBottomColor: t.divider }]}>
      {options.map(opt => {
        const active = opt.key === value;
        return (
          <Pressable key={opt.key} onPress={() => onChange(opt.key)} style={styles.tab} hitSlop={6}>
            <Text
              style={[
                styles.lbl,
                {
                  color: active ? t.seal : t.inkSoft,
                  borderBottomWidth: active ? 3 : 1.5,
                  borderBottomColor: active ? t.seal : t.divider,
                  textShadowColor: active ? t.sealDeep : 'transparent',
                  textShadowRadius: active ? 1 : 0,
                  textShadowOffset: active ? { width: 0, height: 1 } : { width: 0, height: 0 },
                },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xl,
  },
  tab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  lbl: {
    fontFamily: fonts.kai.bold,
    fontSize: 18,
    letterSpacing: 4,
    lineHeight: 22,
    paddingBottom: 6,
  },
});
