// src/components/TabBar.tsx
// V3 底部 TabBar —— 毛笔字 + 下方细线（active 加粗红）
//
// M1: React.memo + render-prop child component `TabItem` wrapped with
// React.memo. The parent (MainTabs) re-renders on every navigation state
// change; without this, every TabBar Pressable gets a brand-new onPress
// closure each render and re-renders unnecessarily.
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts, spacing, borders, TAB_ITEMS } from '../theme/tokens';

interface Props {
  activeKey: string;
  onChange: (key: string) => void;
}

interface TabItemProps {
  tabKey: string;
  label: string;
  active: boolean;
  onPress: (key: string) => void;
}

const TabItem = React.memo<TabItemProps>(({ tabKey, label, active, onPress }) => {
  const { theme } = useTheme();
  const t = theme.tokens;
  const handlePress = useCallback(() => onPress(tabKey), [onPress, tabKey]);
  return (
    <Pressable
      onPress={handlePress}
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
          {label}
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
});

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
        {TAB_ITEMS.map(tab => (
          <TabItem
            key={tab.key}
            tabKey={tab.key}
            label={tab.label}
            active={tab.key === activeKey}
            onPress={onChange}
          />
        ))}
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