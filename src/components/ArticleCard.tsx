// src/components/ArticleCard.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, lineHeights, letterSpacings, spacing, radii, borders, shadows } from '../theme/tokens';

interface Props {
  chapter: string;
  title: string;
  content: string;
  highlight?: string;
  index: number;
  total: number;
  isRead?: boolean;
  onPress?: () => void;
}

// M1: React.memo so parent re-renders (theme mode change, scroll state,
// etc.) don't rebuild every visible card in the FlatList. ArticleCard
// only re-renders when one of its props actually changes (chapter, title,
// content, highlight, index, total, isRead, onPress).
export const ArticleCard = React.memo<Props>(({
  chapter, title, content, highlight,
  index, total, isRead = false, onPress,
}) => {
  const { theme } = useTheme();
  const t = theme.tokens;

  const renderContent = () => {
    if (!highlight) {
      return (
        <Text style={[styles.content, { color: t.inkSoft }]} numberOfLines={4}>
          {content}
        </Text>
      );
    }
    const parts = content.split(highlight);
    return (
      <Text style={[styles.content, { color: t.inkSoft }]} numberOfLines={4}>
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            {p}
            {i < parts.length - 1 && (
              <Text style={[styles.highlight, { backgroundColor: t.seal, color: t.paper }]}>
                {highlight}
              </Text>
            )}
          </React.Fragment>
        ))}
      </Text>
    );
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: t.paper, borderColor: t.border },
        pressed && { opacity: 0.8, transform: [{ scale: 0.99 }] },
        isRead && { opacity: 0.6 },
      ]}
      android_ripple={{ color: `${t.brass}33` }}
    >
      <View style={styles.header}>
        <Text style={[styles.chapter, { color: t.inkMuted }]}>{chapter}</Text>
        <View style={[styles.seal, { backgroundColor: index === 1 ? t.seal : t.brass }]}>
          <Text style={[styles.sealText, { color: t.paper }]}>{index === 1 ? '精' : '荐'}</Text>
        </View>
      </View>

      <Text style={[styles.title, { color: t.ink }, isRead && { color: t.inkMuted }]}>{title}</Text>

      <View style={[styles.divider, { backgroundColor: t.divider }]} />

      {renderContent()}

      <Text style={[styles.footer, { color: t.inkMuted }]}>⸺ 第 {index} / {total} 篇 ⸺</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderWidth: borders.hair,
    borderRadius: radii.md,
    ...shadows.paper,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  chapter: { fontFamily: fonts.kai.regular, fontSize: fontSizes.seal, letterSpacing: letterSpacings.wider },
  seal: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.sm, transform: [{ rotate: '-3deg' }] },
  sealText: { fontFamily: fonts.kai.bold, fontSize: fontSizes.seal, fontWeight: '700' },
  title: { fontFamily: fonts.serif.bold, fontSize: fontSizes.title, lineHeight: fontSizes.title * lineHeights.tight, marginBottom: spacing.sm },
  divider: { height: borders.hair, marginVertical: spacing.sm },
  content: { fontFamily: fonts.serif.regular, fontSize: fontSizes.body, lineHeight: fontSizes.body * lineHeights.prose },
  highlight: { fontFamily: fonts.serif.bold, paddingHorizontal: spacing.xs },
  footer: { fontFamily: fonts.serif.regular, fontSize: fontSizes.label, textAlign: 'center', marginTop: spacing.md, letterSpacing: letterSpacings.wide },
});
