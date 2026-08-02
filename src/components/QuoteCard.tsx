// src/components/QuoteCard.tsx
// V3 首页"锦言"卡 + 换一句按钮
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii, QUOTES } from '../theme/tokens';

export const QuoteCard: React.FC = () => {
  const { theme } = useTheme();
  const t = theme.tokens;
  // 顺序展示，换一句推进
  // L3: useMemo was wrapping a single array index — pure overhead.
  // Just compute inline; the work is one modulo + one array lookup.
  const [idx, setIdx] = useState(0);
  const quote = QUOTES[idx % QUOTES.length];

  return (
    <View style={[styles.card, { backgroundColor: t.paper, borderColor: t.border, shadowColor: t.ink }]}>
      <View style={styles.head}>
        {/* 大字"锦言" */}
        <Text style={[styles.stamp, { color: t.ink }]}>锦言</Text>
        {/* 红色"换一句" */}
        <Pressable onPress={() => setIdx(i => (i + 1) % QUOTES.length)} hitSlop={8}>
          <Text style={[styles.refresh, { color: t.seal }]}>换一句</Text>
        </Pressable>
      </View>
      <Text style={[styles.body, { color: t.inkSoft }]}>
        <Text style={[styles.quoteMark, { color: t.seal }]}>“</Text>
        {quote.text}
        <Text style={[styles.quoteMark, { color: t.seal }]}>”</Text>
      </Text>
      <Text style={[styles.src, { color: t.inkMuted }]}>{quote.src}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 0,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: borders.hair,
    borderRadius: radii.md,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  stamp: { fontFamily: fonts.kai.bold, fontSize: 18, letterSpacing: 6 },
  refresh: { fontFamily: fonts.kai.regular, fontSize: 11, letterSpacing: 2 },
  body: { fontFamily: fonts.kai.regular, fontStyle: 'italic', fontSize: 13.5, lineHeight: 22, marginTop: 6 },
  quoteMark: { fontSize: 18 },
  src: { textAlign: 'right', fontFamily: fonts.kai.regular, fontSize: 10.5, letterSpacing: 2, marginTop: 2 },
});
