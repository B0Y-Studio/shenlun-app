// src/App.tsx
// V3 定稿壳：5 个 Tab + Stack 推入 Reader/Review/Gold
import React, { useState, useMemo } from 'react';
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

function MainTabs() {
  const { theme } = useTheme();
  return (
    <MainTab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={({ navigation, state }) => (
        <TabBar
          activeKey={state.routes[state.index].name.toLowerCase()}
          onChange={(k) => navigation.navigate(k.charAt(0).toUpperCase() + k.slice(1) as never)}
        />
      )}
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
