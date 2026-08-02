// src/components/SplashScreen.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, spacing } from '../theme/tokens';

interface Props {
  onComplete: () => void;
}

export const SplashScreen: React.FC<Props> = ({ onComplete }) => {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const { theme } = useTheme();
  const t = theme.tokens;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(onComplete, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Animated.View
        style={[
          styles.logoBox,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <View style={[styles.sealOuter, { borderColor: t.seal }]}>
          <View style={[styles.sealInner, { borderColor: t.brass }]}>
            <Text style={[styles.sealChar, { color: t.seal }]}>申</Text>
          </View>
        </View>
        <Text style={[styles.appName, { color: t.ink }]}>申论积累</Text>
        <Text style={[styles.slogan, { color: t.inkMuted }]}>日积月累，厚积薄发</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBox: { alignItems: 'center' },
  sealOuter: {
    width: 100,
    height: 100,
    borderWidth: 3,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sealInner: {
    width: 80,
    height: 80,
    borderWidth: 2,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sealChar: { fontFamily: fonts.serif.heavy, fontSize: 48 },
  appName: { fontFamily: fonts.serif.bold, fontSize: 28, marginBottom: spacing.sm },
  slogan: { fontFamily: fonts.kai.regular, fontSize: 14, letterSpacing: 4 },
});