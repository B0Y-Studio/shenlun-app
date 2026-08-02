// src/theme/ThemeContext.tsx
import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { lightTokens, darkTokens } from './tokens';
import { getStorage } from '../storage/mmkv';

export type ThemeMode = 'light' | 'dark' | 'system';
const THEME_KEY = 'theme_mode';

interface Theme {
  mode: 'light' | 'dark';
  tokens: typeof lightTokens;
}
interface ThemeContextValue {
  theme: Theme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const s = getStorage();
    return (s?.getString(THEME_KEY) as ThemeMode) || 'system';
  });

  const setThemeMode = useCallback((m: ThemeMode) => {
    setThemeModeState(m);
    getStorage()?.set(THEME_KEY, m);
  }, []);

  const mode: 'light' | 'dark' =
    themeMode === 'system' ? (systemScheme ?? 'light') : themeMode;

  const theme = useMemo<Theme>(
    () => ({ mode, tokens: mode === 'dark' ? darkTokens : lightTokens }),
    [mode]
  );

  const value = useMemo(
    () => ({ theme, themeMode, setThemeMode }),
    [theme, themeMode, setThemeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
