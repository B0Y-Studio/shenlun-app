// src/components/TodayTaskBanner.tsx
// V3 首页"今日待做"横条：标题 + 居中进度段（无右下数字）
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';

interface Props {
  /** 已读 / 总数。超出部分以"待办"灰段呈现 */
  doneCount: number;
  totalCount: number;
  /** 标题，默认 "晨起三篇，养浩然之气" */
  title?: string;
  /** 副标签，默认 "今 日 待 做" */
  eyebrow?: string;
  /** 整块点击 → 进阅读列表 */
  onPress?: () => void;
}

export const TodayTaskBanner: React.FC<Props> = ({
  doneCount, totalCount,
  title = '晨起三篇，养浩然之气',
  eyebrow = '今 日 待 做',
  onPress,
}) => {
  const { theme } = useTheme();
  const t = theme.tokens;
  const total = Math.max(totalCount, 1);
  const done = Math.max(0, Math.min(doneCount, total));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: t.paper, borderColor: t.border, shadowColor: t.ink },
        pressed && { opacity: 0.85 },
      ]}
    >
      {/* 右上角虚线圆装饰（mockup .top-banner::after） */}
      <View
        style={[
          styles.dashedCircle,
          { borderColor: t.brass },
        ]}
        pointerEvents="none"
      />
      <Text style={[styles.eyebrow, { color: t.inkMuted }]}>{eyebrow}</Text>
      <Text style={[styles.title, { color: t.ink }]}>{title}</Text>
      <View style={styles.progressRow}>
        {Array.from({ length: total }).map((_, i) => {
          const isDone = i < done;
          // 当前正在做的那一格（如有且未全部完成）
          const isCurrent = i === done && done < total;
          return (
            <View
              key={i}
              style={[
                styles.seg,
                { borderColor: isDone ? t.seal : t.divider },
                isDone   && { backgroundColor: t.seal },
                isCurrent&& { backgroundColor: t.brass, borderColor: t.brass, opacity: 0.85 },  // 进行中：实心黄铜
                !isDone && !isCurrent && { backgroundColor: t.bg },
              ]}
            />
          );
        })}
      </View>
    </Pressable>
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
    overflow: 'hidden',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  dashedCircle: {
    position: 'absolute',
    right: -12,
    top: -12,
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    opacity: 0.5,
  },
  eyebrow: {
    fontFamily: fonts.kai.regular, fontSize: 12, letterSpacing: 6,
    textAlign: 'center',
  },
  title: {
    fontFamily: fonts.serif.bold, fontSize: 22, letterSpacing: 4, marginTop: 6,
    textAlign: 'center',
  },
  progressRow: { marginTop: spacing.sm, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 3 },
  seg: { width: 40, height: 7, borderRadius: 1, borderWidth: 1 },
});
