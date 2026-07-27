// src/App.tsx
// V3 定稿壳：5 个 Tab + Stack 推入 Reader/Review/Gold
import React, { useState, useMemo, useEffect, createContext, useContext } from 'react';
import { StatusBar, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import { TabBar } from './components/TabBar';
import HomeScreen from './screens/HomeScreen';
import ReaderScreen from './screens/ReaderScreen';
import GoldScreen from './screens/GoldScreen';
import ReviewScreen from './screens/ReviewScreen';
import SourceScreen from './screens/SourceScreen';
import PaperScreen from './screens/PaperScreen';
import AnalysisScreen from './screens/AnalysisScreen';
import SettingsScreen from './screens/SettingsScreen';
import { SplashScreen } from './components/SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { tabBus } from './navigation/tabBus';

export type RootStackParamList = {
  Main: undefined;
  Review: undefined;
  Reader: { id: string };
  Gold: undefined;
};

/** 主屏内可由 tabBus 带过来的过滤项（如 source 主题过滤） */
const ActiveFilterContext = createContext<Record<string, any>>({});
/** 暴露给 SourceScreen 等需要读 filter 的屏 */
export const useActiveFilter = () => useContext(ActiveFilterContext);

const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs({ activeKey, setActiveKey }: { activeKey: string; setActiveKey: (k: string) => void }) {
  return (
    <View style={styles.fill}>
      {activeKey === 'home'     && <HomeScreen />}
      {activeKey === 'source'   && <SourceScreen />}
      {activeKey === 'paper'    && <PaperScreen />}
      {activeKey === 'analysis' && <AnalysisScreen />}
      {activeKey === 'settings' && <SettingsScreen />}
      <TabBar activeKey={activeKey} onChange={setActiveKey} />
    </View>
  );
}

function RootNavigator() {
  const { theme } = useTheme();
  const [activeKey, setActiveKey] = useState<string>('home');
  const [activeFilter, setActiveFilter] = useState<Record<string, any>>({});

  // 注册 tabBus 监听：setActiveKey + 同步 activeFilter
  useEffect(() => {
    return tabBus.bind((k, payload) => {
      setActiveKey(k);
      if (payload?.filter) setActiveFilter(payload.filter);
    });
  }, []);

  const stackScreenOptions = useMemo(() => ({
    headerShown: false,
    contentStyle: { backgroundColor: theme.tokens.bg },
    animation: 'slide_from_right' as const,
  }), [theme.tokens.bg]);

  return (
    <>
      <StatusBar
        barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.tokens.bg}
      />
      <NavigationContainer>
        <Stack.Navigator screenOptions={stackScreenOptions}>
          <Stack.Screen name="Main">
            {() => (
              <ActiveFilterContext.Provider value={activeFilter}>
                <MainTabs activeKey={activeKey} setActiveKey={setActiveKey} />
              </ActiveFilterContext.Provider>
            )}
          </Stack.Screen>
          <Stack.Screen name="Review" component={ReviewScreen} />
          <Stack.Screen name="Reader" component={ReaderScreen} />
          <Stack.Screen name="Gold" component={GoldScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {showSplash
          ? <SplashScreen onComplete={() => setShowSplash(false)} />
          : (
            <ErrorBoundary>
              <RootNavigator />
            </ErrorBoundary>
          )
        }
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
