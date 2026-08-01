// src/components/ToolBar.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, radii, borders } from '../theme/tokens';

type Tool = 'answer' | 'doodle' | 'blank' | 'edit' | 'settings' | 'toc';

interface Props {
  active?: Tool;
  onChange?: (tool: Tool) => void;
  onSettings?: () => void;
  onToc?: () => void;
}

const TOOLS: { key: Tool; label: string }[] = [
  { key: 'answer',    label: '答案' },
  { key: 'doodle',   label: '涂鸦' },
  { key: 'blank',     label: '挖空' },
  { key: 'edit',      label: '编辑' },
  { key: 'settings',  label: '设置' },
  { key: 'toc',       label: '目录' },
];

export const ToolBar: React.FC<Props> = ({ active = 'answer', onChange, onSettings, onToc }) => {
  const { theme } = useTheme();
  const t = theme.tokens;

  const handlePress = (key: Tool) => {
    if (key === 'settings') { onSettings?.(); return; }
    if (key === 'toc') { onToc?.(); return; }
    onChange?.(key);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: t.paper, borderColor: t.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {TOOLS.map(tool => {
          const isActive = active === tool.key;
          return (
            <Pressable
              key={tool.key}
              onPress={() => handlePress(tool.key)}
              style={({ pressed }) => [
                styles.btn,
                isActive && { backgroundColor: `${t.seal}14` },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={[
                styles.iconBox,
                { backgroundColor: t.bgAlt, borderColor: t.border },
                isActive && { backgroundColor: t.seal, borderColor: t.seal },
              ]}>
                <Text style={[
                  styles.icon,
                  { color: isActive ? t.paper : t.inkSoft },
                ]}>{tool.label.charAt(0)}</Text>
              </View>
              <Text style={[styles.label, { color: isActive ? t.seal : t.inkMuted }]}>
                {tool.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    borderWidth: borders.hair,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
  },
  row: { paddingHorizontal: spacing.sm, justifyContent: 'space-around', minWidth: '100%' },
  btn: { alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.sm },
  iconBox: { width: 28, height: 28, borderWidth: borders.hair, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  icon: { fontFamily: fonts.kai.bold, fontSize: fontSizes.caption },
  label: { fontFamily: fonts.serif.regular, fontSize: fontSizes.micro },
});
