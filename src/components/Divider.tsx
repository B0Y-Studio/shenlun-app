// src/components/Divider.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders } from '../theme/tokens';

interface Props {
  withCenter?: boolean;
  withText?: string;
}

export const Divider: React.FC<Props> = ({ withCenter = false, withText }) => {
  const { theme } = useTheme();
  const t = theme.tokens;

  if (withText) {
    return (
      <View style={styles.row}>
        <View style={[styles.line, { backgroundColor: t.divider }]} />
        <Text style={[styles.text, { color: t.inkMuted }]}>{withText}</Text>
        <View style={[styles.line, { backgroundColor: t.divider }]} />
      </View>
    );
  }
  if (withCenter) {
    return (
      <View style={styles.row}>
        <View style={[styles.line, { backgroundColor: t.divider }]} />
        <View style={[styles.dot, { backgroundColor: t.brass }]} />
        <View style={[styles.line, { backgroundColor: t.divider }]} />
      </View>
    );
  }
  return <View style={[styles.single, { backgroundColor: t.divider }]} />;
};

const styles = StyleSheet.create({
  single: { height: borders.hair, marginVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md },
  line: { flex: 1, height: borders.hair },
  dot: { width: 6, height: 6, borderRadius: 999, marginHorizontal: spacing.sm },
  text: { fontFamily: fonts.kai.regular, fontSize: fontSizes.label, marginHorizontal: spacing.md, letterSpacing: 4 },
});
