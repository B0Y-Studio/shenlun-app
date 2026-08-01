// src/components/MenuList.tsx
// V3 首页主菜单 5 行 —— 大数字序号继承印章配色
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii, MENU_ITEMS, type MenuItem } from '../theme/tokens';

interface Props {
  onItemPress?: (key: string) => void;
}

function indexColor(key: MenuItem['indexColor'], t: ReturnType<typeof useTheme>['theme']['tokens']) {
  switch (key) {
    case 'brass':    return t.brassDeep;
    case 'jade':     return t.jade;
    case 'sealDeep': return t.sealDeep;
    case 'ink':      return t.inkSoft;
    case 'seal':
    default:         return t.seal;
  }
}

export const MenuList: React.FC<Props> = ({ onItemPress }) => {
  const { theme } = useTheme();
  const t = theme.tokens;
  return (
    <View style={[styles.wrap, { borderColor: t.divider }]}>
      {MENU_ITEMS.map((item, i) => (
        <Pressable
          key={item.key}
          onPress={() => onItemPress?.(item.key)}
          style={({ pressed }) => [
            styles.row,
            i === 0 && { borderTopWidth: borders.hair, borderTopColor: t.divider },
            i < MENU_ITEMS.length - 1 && { borderBottomWidth: borders.hair, borderBottomColor: t.divider },
            pressed && { backgroundColor: `${t.brass}10` },
          ]}
          android_ripple={{ color: `${t.brass}22` }}
        >
          {/* 序号（毛笔大字，继承印章色） */}
          <Text style={[styles.index, { color: indexColor(item.indexColor, t) }]}>{item.index}</Text>

          {/* 标题 + 副标题 */}
          <View style={styles.body}>
            <Text style={[styles.title, { color: t.ink }]}>{item.title}</Text>
            <Text style={[styles.sub, { color: t.inkMuted }]}>{item.subtitle}</Text>
          </View>

          {/* 右箭头 */}
          <Text style={[styles.arrow, { color: t.brassDeep }]}>›</Text>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 0, marginTop: spacing.xs, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    gap: 14,
  },
  index: {
    fontFamily: fonts.serif.bold, fontSize: 22, fontStyle: 'italic',
    width: 30, textAlign: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.serif.bold, fontSize: 15, letterSpacing: 3 },
  sub: { fontFamily: fonts.kai.regular, fontSize: 10.5, letterSpacing: 1, marginTop: 1 },
  arrow: { fontSize: 16, paddingHorizontal: spacing.xs },
});
