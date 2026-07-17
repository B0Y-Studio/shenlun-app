// src/components/TabBar.tsx
// V3 底部 TabBar —— 毛笔字 + 下方细线（active 加粗红）
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts, spacing, borders, TAB_ITEMS } from '../theme/tokens';

interface Props {
  activeKey: string;
  onChange: (key: string) => void;
}

export const TabBar: React.FC<Props> = ({ activeKey, onChange }) => {
  const { theme } = useTheme();
  const t = theme.tokens;
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: t.paper,
          borderTopColor: t.divider,
          paddingBottom: 10 + insets.bottom,
        },
      ]}
    >
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
              <View style={[styles.lblWrap, active && styles.lblWrapActive]}>
                <Text
                  style={[
                    styles.lbl,
                    {
                      color: active ? t.seal : t.inkSoft,
                      textShadowColor: active ? t.sealDeep : 'transparent',
                      textShadowRadius: active ? 1 : 0,
                      textShadowOffset: active ? { width: 0, height: 1 } : { width: 0, height: 0 },
                    },
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
                <View
                  style={[
                    styles.underline,
                    { backgroundColor: active ? t.seal : t.divider, height: active ? 3 : 1.5 },
                  ]}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingTop: 6,
    paddingHorizontal: 6,
    borderTopWidth: borders.hair,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lblWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  lblWrapActive: {
    // 与非激活态保持等高，避免 active 切换时跳动
  },
  lbl: {
    fontFamily: fonts.kai.bold,
    fontSize: 22,
    letterSpacing: 6,
    lineHeight: 24,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  underline: {
    width: '100%',
    marginTop: 3,
  },
});
