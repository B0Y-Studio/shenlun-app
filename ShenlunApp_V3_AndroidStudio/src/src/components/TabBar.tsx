// src/components/TabBar.tsx
// V3 底部 TabBar —— 毛笔字 + 下方细线（active 加粗红）
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, spacing, borders, TAB_ITEMS } from '../theme/tokens';

interface Props {
  activeKey: string;
  onChange: (key: string) => void;
}

export const TabBar: React.FC<Props> = ({ activeKey, onChange }) => {
  const { theme } = useTheme();
  const t = theme.tokens;
  return (
    <View style={[styles.bar, { backgroundColor: t.paper, borderTopColor: t.divider }]}>
      {TAB_ITEMS.map(tab => {
        const active = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              pressed && { opacity: 0.7 },
            ]}
          >
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
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.xs,
    borderTopWidth: borders.hair,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  lbl: {
    fontFamily: fonts.kai.bold,
    fontSize: 22,
    letterSpacing: 6,
    lineHeight: 26,
    paddingBottom: 6,                       /* 给 border-bottom 留位 */
  },
});
