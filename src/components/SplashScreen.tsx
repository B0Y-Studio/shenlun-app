// src/components/SplashScreen.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, useColorScheme } from 'react-native';
import { fonts, spacing } from '../theme/tokens';

interface Props {
  onComplete: () => void;
}

export const SplashScreen: React.FC<Props> = ({ onComplete }) => {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // 颜色按系统主题动态选择
  const colors = isDark
    ? { bg: '#1C1714', seal: '#C04851', brass: '#C9A962', title: '#E8DFD4', slogan: '#8B7355' }
    : { bg: '#F0EAD6', seal: '#C04851', brass: '#C9A962', title: '#1C1714', slogan: '#8B7355' };

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
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <Animated.View
        style={[
          styles.logoBox,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <View style={[styles.sealOuter, { borderColor: colors.seal }]}>
          <View style={[styles.sealInner, { borderColor: colors.brass }]}>
            <Text style={[styles.sealChar, { color: colors.seal }]}>申</Text>
          </View>
        </View>
        <Text style={[styles.appName, { color: colors.title }]}>申论积累</Text>
        <Text style={[styles.slogan, { color: colors.slogan }]}>日积月累，厚积薄发</Text>
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