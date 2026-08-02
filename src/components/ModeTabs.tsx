// src/components/ModeTabs.tsx
// 复盘屏用的"按月 | 按主题" 模式切换条 (V3 风格)
//
// M1: React.memo + inner `ModeTab` is React.memo'd with stable handler so
// parent re-renders (ReviewScreen theme change, navigation, etc.) don't
// rebuild every visible tab Pressable.
import React, { useCallback } from 'react';
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

interface ModeTabProps<K extends string> {
  opt: ModeOption<K>;
  active: boolean;
  onChange: (key: K) => void;
}

function ModeTab<K extends string>({ opt, active, onChange }: ModeTabProps<K>) {
  const { theme } = useTheme();
  const t = theme.tokens;
  const handlePress = useCallback(() => onChange(opt.key), [onChange, opt.key]);
  return (
    <Pressable onPress={handlePress} style={styles.tab} hitSlop={6}>
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
}

const MemoModeTab = React.memo(ModeTab) as typeof ModeTab;

export const ModeTabs = React.memo(function ModeTabsImpl<K extends string>({
  value, options, onChange,
}: Props<K>) {
  const { theme } = useTheme();
  const t = theme.tokens;
  return (
    <View style={[styles.bar, { borderBottomColor: t.divider }]}>
      {options.map(opt => (
        <MemoModeTab
          key={opt.key}
          opt={opt}
          active={opt.key === value}
          onChange={onChange}
        />
      ))}
    </View>
  );
}) as <K extends string>(p: Props<K>) => React.ReactElement;

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