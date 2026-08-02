// src/App.tsx
// V3 定稿壳：5 个 Tab + Stack 推入 Reader/Review/Gold
import React, { useState, useMemo, useCallback } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
import JudgeScreen from './screens/JudgeScreen';
import JudgeHistoryScreen from './screens/JudgeHistoryScreen';
import LlmConfigScreen from './screens/LlmConfigScreen';
import type { Question } from './api/client';
import { SplashScreen } from './components/SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

export type RootStackParamList = {
  Main: undefined;
  Review: undefined;
  Reader: { id: string };
  Gold: undefined;
  Judge: { question: Question | undefined };
  JudgeHistory: undefined;
  LlmConfig: undefined;
};

type MainTabParamList = {
  Home: undefined;
  Source: { filter?: Record<string, unknown> } | undefined;
  Paper: undefined;
  Analysis: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

// M1 + L4 + L5: hoist `MainTabs` to module scope and memoize its
// `tabBar` render-prop with useCallback (depends only on the route name
// capitalize helper, which is itself referentially stable inside the
// closure). Previously the function was redefined on every RootNavigator
// render, which forced React Navigation to remount every screen's tab
// config on theme changes.
const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function MainTabs() {
  const renderTabBar = useCallback(
    ({ navigation, state }: { navigation: any; state: any }) => (
      <TabBar
        activeKey={state.routes[state.index].name.toLowerCase()}
        onChange={(k) => navigation.navigate(capitalizeFirst(k) as never)}
      />
    ),
    [],
  );

  return (
    <MainTab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={renderTabBar}
    >
      <MainTab.Screen name="Home" component={HomeScreen} />
      <MainTab.Screen name="Source" component={SourceScreen} />
      <MainTab.Screen name="Paper" component={PaperScreen} />
      <MainTab.Screen name="Analysis" component={AnalysisScreen} />
      <MainTab.Screen name="Settings" component={SettingsScreen} />
    </MainTab.Navigator>
  );
}

function RootNavigator() {
  const { theme } = useTheme();

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
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="Review" component={ReviewScreen} />
          <Stack.Screen name="Reader" component={ReaderScreen} />
          <Stack.Screen name="Gold" component={GoldScreen} />
          <Stack.Screen name="Judge"         component={JudgeScreen}         options={{ headerShown: false }} />
          <Stack.Screen name="JudgeHistory"  component={JudgeHistoryScreen}  options={{ headerShown: false }} />
          <Stack.Screen name="LlmConfig"     component={LlmConfigScreen}     options={{ headerShown: false }} />
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
