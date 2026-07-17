// src/components/YesterdayCard.tsx
// V3 首页"昨日总结"卡 —— 横排三数 + 居中表头
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';

interface Stat {
  num: string;
  label: string;
  accent?: boolean;
}

interface Props {
  /** "已读"、"标记"、"分钟" 三组 */
  stats?: Stat[];
}

const DEFAULT_STATS: Stat[] = [
  { num: '3',  label: '已 读', accent: false },
  { num: '5',  label: '标 记', accent: true  },
  { num: '28', label: '分 钟', accent: false },
];

export const YesterdayCard: React.FC<Props> = ({ stats = DEFAULT_STATS }) => {
  const { theme } = useTheme();
  const t = theme.tokens;
  return (
    <View style={[styles.card, { backgroundColor: t.paper, borderColor: t.border, shadowColor: t.ink }]}>
      <Text style={[styles.head, { color: t.inkMuted }]}>昨 日 总 结</Text>
      <View style={styles.row}>
        {stats.map((s, i) => (
          <View
            key={i}
            style={[
              styles.item,
              i < stats.length - 1 && { borderRightWidth: 1, borderRightColor: t.divider },
            ]}
          >
            <Text
              style={[
                styles.num,
                { color: s.accent ? t.seal : t.ink },
              ]}
            >
              {s.num}
            </Text>
            <Text style={[styles.lbl, { color: t.inkMuted }]}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: borders.hair,
    borderRadius: radii.md,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  head: {
    fontFamily: fonts.kai.regular, fontSize: 13, letterSpacing: 4,
    textAlign: 'center', marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  item: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  num: { fontFamily: fonts.serif.bold, fontSize: 26, lineHeight: 26, letterSpacing: 0 },
  lbl: { fontFamily: fonts.kai.regular, fontSize: 11, letterSpacing: 3, marginTop: 6 },
});
