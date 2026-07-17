# 申论积累 App · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Goal:** 从零创建"申论积累" React Native App，实现选卡阅读功能（首页/阅读页/金句库），亮暗主题，墨韵新中式 UI，连接云端 API。
>
> **Architecture:** React Native 0.74 + TypeScript，采用 React Context 管理主题，用 React Navigation Stack 实现页面导航，云端 API 获取数据，MMKV 做本地缓存。
>
> **Tech Stack:** React Native 0.74, TypeScript, React Navigation 6, react-native-mmkv, react-native-vector-icons, react-native-splash-screen

---

## 全局约束

| 约束 | 值 |
|---|---|
| App 名称 | 申论积累 |
| 框架版本 | React Native 0.74 + TypeScript |
| 云端 Base URL | `http://124.223.5.144/` |
| 主题 | 亮色（#F0EAD6）/ 暗色（#1C1714）墨韵新中式 |
| 字体 | 思源宋体（需打包到 assets/fonts） |

---

## 文件结构

```
shenlun-app/
├── src/
│   ├── theme/
│   │   ├── tokens.ts          # 设计 token（颜色/字体/间距）
│   │   └── ThemeContext.tsx   # 亮/暗主题 Context
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── ReaderScreen.tsx
│   │   └── GoldScreen.tsx
│   ├── components/
│   │   ├── ArticleCard.tsx
│   │   ├── ToolBar.tsx
│   │   ├── Divider.tsx
│   │   ├── GoldCard.tsx
│   │   └── SplashScreen.tsx
│   ├── api/
│   │   └── client.ts          # 云端 API 封装
│   ├── storage/
│   │   └── mmkv.ts            # MMKV 本地存储封装
│   └── App.tsx                # 根组件
├── android/                    # Android 原生配置
│   └── app/src/main/assets/fonts/  # 思源宋体字体
└── package.json
```

---

## 任务清单

---

### 任务 1：初始化 React Native 项目

**Files:**
- Create: `shenlun-app/`（整个项目目录）

**Goal:** 创建可运行的 React Native 0.74 项目，安装所有依赖，验证 Gradle 编译通过。

- [ ] **Step 1: 创建 React Native 项目**

```bash
cd C:\Users\hecto\ZCodeProject
npx react-native@0.74.5 init ShenlunApp --version 0.74.5
```

Expected: 项目创建在 `shenlun-app/` 目录

- [ ] **Step 2: 安装核心依赖**

```bash
cd shenlun-app
npm install @react-navigation/native@^6.1.0 @react-navigation/native-stack@^6.9.0 react-native-screens@^3.29.0 react-native-safe-area-context@^4.8.0 react-native-mmkv@^3.0.0 react-native-splash-screen@^3.3.0 react-native-vector-icons@^10.0.0
npm install --save-dev @types/react-native-vector-icons
```

- [ ] **Step 3: 验证 Android 编译**

```bash
cd android && .\gradlew assembleDebug
```

Expected: 生成 `app/build/outputs/apk/debug/app-debug.apk`

- [ ] **Step 4: 安装思源宋体字体**

从 https://github.com/adobe-fonts/source-han-serif/releases 下载 `OTF/SimplifiedChinese/SourceHanSerifSC-Regular.otf`，改名为 `SourceHanSerifSC-Regular.otf`，放到 `android/app/src/main/assets/fonts/` 目录（如目录不存在则创建）。

- [ ] **Step 5: 配置 react-native-vector-icons**

在 `android/app/build.gradle` 的 `apply from:` 末尾添加：

```
apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")
```

- [ ] **Step 6: 提交**

```bash
git init && git add . && git commit -m "init: React Native 0.74.5 project with dependencies"
```

---

### 任务 2：主题系统（Token + Context）

**Files:**
- Create: `src/theme/tokens.ts`
- Create: `src/theme/ThemeContext.tsx`
- Modify: `src/App.tsx`（用 ThemeProvider 包裹）

**Interfaces:**
- Consumes: 无外部依赖
- Produces:
  - `tokens.ts` 导出 `lightTokens`, `darkTokens`
  - `ThemeContext.tsx` 导出 `ThemeContext`, `useTheme()` hook, `ThemeProvider`

- [ ] **Step 1: 写 tokens.ts**

```typescript
// src/theme/tokens.ts

export const lightTokens = {
  bg:          '#F0EAD6',
  bgAlt:       '#E8DFC4',
  paper:       '#FFFBF0',
  paperDeep:   '#F5EBD0',
  ink:         '#1C1714',
  inkSoft:     '#3D332B',
  inkMuted:    '#8B7355',
  inkFaint:    '#B8A88A',
  brass:       '#C9A962',
  brassDeep:   '#A88B45',
  seal:        '#C04851',
  sealDeep:    '#8B2635',
  jade:        '#5A6B5C',
  border:      '#D4C49A',
  divider:     'rgba(201,169,98,0.3)',
};

export const darkTokens = {
  bg:          '#1C1714',
  bgAlt:       '#251E19',
  paper:       '#2A221C',
  paperDeep:   '#1C1714',
  ink:         '#E8DFD4',
  inkSoft:     '#B8A88A',
  inkMuted:    '#8B7355',
  inkFaint:    '#5A4A3A',
  brass:       '#C9A962',
  brassDeep:   '#A88B45',
  seal:        '#C04851',
  sealDeep:    '#8B2635',
  jade:        '#5A6B5C',
  border:      '#3D332B',
  divider:     'rgba(201,169,98,0.2)',
};

export const fonts = {
  serif: {
    regular: 'SourceHanSerifSC-Regular',
    medium:  'SourceHanSerifSC-Medium',
    bold:    'SourceHanSerifSC-Bold',
    heavy:   'SourceHanSerifSC-Heavy',
  },
  kai: {
    regular: 'KaiTi',
    bold:    'KaiTi-Bold',
  },
  sans: {
    regular: 'PingFangSC-Regular',
    medium:  'PingFangSC-Medium',
  },
};

export const fontSizes = {
  hero: 32, title: 24, subtitle: 18,
  body: 16, bodyLg: 17, caption: 13,
  label: 11, micro: 10, seal: 12,
};

export const lineHeights = {
  tight: 1.2, normal: 1.5, prose: 1.85, loose: 2.0,
};

export const letterSpacings = {
  tight: -0.5, normal: 0, wide: 2, wider: 4,
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
};

export const radii = {
  none: 0, sm: 2, md: 4, pill: 999,
};

export const shadows = {
  paper: {
    shadowColor: '#3D332B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  seal: {
    shadowColor: '#8B2635',
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
};

export const motion = {
  duration: { fast: 150, normal: 250, slow: 400, slowest: 600 },
};
```

- [ ] **Step 2: 写 ThemeContext.tsx**

```typescript
// src/theme/ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { lightTokens, darkTokens } from './tokens';

export type ThemeMode = 'light' | 'dark' | 'system';

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
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');

  const mode: 'light' | 'dark' =
    themeMode === 'system' ? (systemScheme ?? 'light') : themeMode;

  const theme: Theme = {
    mode,
    tokens: mode === 'dark' ? darkTokens : lightTokens,
  };

  return (
    <ThemeContext.Provider value={{ theme, themeMode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

- [ ] **Step 3: 修改 App.tsx**

```typescript
// src/App.tsx
import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import HomeScreen from './screens/HomeScreen';

function RootNavigator() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar
        barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.tokens.bg}
      />
      <NavigationContainer>
        {/* Stack Navigator goes here */}
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: 提交**

```bash
git add src/theme/tokens.ts src/theme/ThemeContext.tsx src/App.tsx
git commit -m "feat: theme system with light/dark tokens and ThemeContext"
```

---

### 任务 3：通用组件（ArticleCard / ToolBar / Divider）

**Files:**
- Create: `src/components/ArticleCard.tsx`
- Create: `src/components/ToolBar.tsx`
- Create: `src/components/Divider.tsx`

**Interfaces:**
- Consumes: `useTheme()` hook, `tokens.ts`
- Produces: `ArticleCard`, `ToolBar`, `Divider` 组件

- [ ] **Step 1: 写 ArticleCard.tsx**

完整实现（含首字下沉、印章标签、铜金分隔线、金句高亮），使用 `useTheme()` 获取当前主题颜色。

```typescript
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

export const ArticleCard: React.FC<Props> = ({
  chapter, title, content, highlight,
  index, total, isRead = false, onPress,
}) => {
  const { theme } = useTheme();
  const t = theme.tokens;

  const renderContent = () => {
    if (!highlight) {
      return (
        <Text style={[styles.content, { color: t.inkSoft }]}
          numberOfLines={4}>
          <Text style={[styles.dropcap, { color: t.seal }]}>{content.charAt(0)}</Text>
          {content.slice(1)}
        </Text>
      );
    }
    const parts = content.split(highlight);
    return (
      <Text style={[styles.content, { color: t.inkSoft }]} numberOfLines={4}>
        <Text style={[styles.dropcap, { color: t.seal }]}>{content.charAt(0)}</Text>
        {parts[0]}
        <Text style={[styles.highlight, { backgroundColor: t.seal, color: t.paper }]}>{highlight}</Text>
        {parts[1]}
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
};

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
  dropcap: { fontFamily: fonts.serif.heavy, fontSize: fontSizes.title, lineHeight: fontSizes.title * 1.1, marginRight: 2 },
  highlight: { fontFamily: fonts.serif.bold, paddingHorizontal: spacing.xs },
  footer: { fontFamily: fonts.serif.regular, fontSize: fontSizes.label, textAlign: 'center', marginTop: spacing.md, letterSpacing: letterSpacings.wide },
});
```

- [ ] **Step 2: 写 ToolBar.tsx**

6 格胶囊工具栏，激活态印章红。

```typescript
// src/components/ToolBar.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, radii, borders } from '../theme/tokens';

type Tool = 'answer' | 'doodle' | 'blank' | 'edit' | 'settings' | 'toc';

interface Props {
  active?: Tool;
  onChange?: (tool: Tool) => void;
  onSettings?: () => void;
  onToc?: () => void;
}

const TOOLS: { key: Tool; label: string }[] = [
  { key: 'answer',   label: '答案' },
  { key: 'doodle',  label: '涂鸦' },
  { key: 'blank',    label: '挖空' },
  { key: 'edit',     label: '编辑' },
  { key: 'settings', label: '设置' },
  { key: 'toc',      label: '目录' },
];

export const ToolBar: React.FC<Props> = ({ active = 'answer', onChange, onSettings, onToc }) => {
  const { theme } = useTheme();
  const t = theme.tokens;

  const handlePress = (key: Tool) => {
    if (key === 'settings') { onSettings?.(); return; }
    if (key === 'toc') { onToc?.(); return; }
    onChange?.(key);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: t.paper, borderColor: t.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {TOOLS.map(tool => {
          const isActive = active === tool.key;
          return (
            <Pressable
              key={tool.key}
              onPress={() => handlePress(tool.key)}
              style={({ pressed }) => [
                styles.btn,
                isActive && { backgroundColor: `${t.seal}14` },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={[
                styles.iconBox,
                { backgroundColor: t.bgAlt, borderColor: t.border },
                isActive && { backgroundColor: t.seal, borderColor: t.seal },
              ]}>
                <Text style={[
                  styles.icon,
                  { color: isActive ? t.paper : t.inkSoft },
                ]}>{tool.label.charAt(0)}</Text>
              </View>
              <Text style={[styles.label, { color: isActive ? t.seal : t.inkMuted }]}>
                {tool.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    borderWidth: borders.hair,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
  },
  row: { paddingHorizontal: spacing.sm, justifyContent: 'space-around', minWidth: '100%' },
  btn: { alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.sm },
  iconBox: { width: 28, height: 28, borderWidth: borders.hair, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  icon: { fontFamily: fonts.kai.bold, fontSize: fontSizes.caption },
  label: { fontFamily: fonts.serif.regular, fontSize: fontSizes.micro },
});
```

- [ ] **Step 3: 写 Divider.tsx**

```typescript
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
```

- [ ] **Step 4: 提交**

```bash
git add src/components/ArticleCard.tsx src/components/ToolBar.tsx src/components/Divider.tsx
git commit -m "feat: ArticleCard, ToolBar, Divider components"
```

---

### 任务 4：导航与屏幕框架

**Files:**
- Modify: `src/App.tsx`（加入 Stack Navigator）
- Create: `src/screens/HomeScreen.tsx`（骨架）
- Create: `src/screens/ReaderScreen.tsx`（骨架）
- Create: `src/screens/GoldScreen.tsx`（骨架）

**Interfaces:**
- Consumes: `ThemeProvider`, `ArticleCard`, `ToolBar`, `Divider`
- Produces: 完整页面导航，3 个屏幕骨架

- [ ] **Step 1: 安装 react-native-screens 依赖（在任务 1 中已装）确认配置**

在 `android/app/build.gradle` 确保有：
```
implementation "androidx.core:core-splashscreen:1.0.1"
```

- [ ] **Step 2: 写完整 App.tsx（带导航）**

```typescript
// src/App.tsx
import React from 'react';
import { StatusBar, Modal, Pressable, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import HomeScreen from './screens/HomeScreen';
import ReaderScreen from './screens/ReaderScreen';
import GoldScreen from './screens/GoldScreen';
import { lightTokens, darkTokens } from './theme/tokens';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar
        barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.tokens.bg}
      />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.tokens.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Reader" component={ReaderScreen} />
        <Stack.Screen name="Gold" component={GoldScreen} />
      </Stack.Navigator>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: 写 HomeScreen.tsx（首页骨架 + 静态数据）**

```typescript
// src/screens/HomeScreen.tsx
import React, { useState } from 'react';
import { ScrollView, StyleSheet, SafeAreaView, Switch } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { ArticleCard } from '../components/ArticleCard';
import { ToolBar } from '../components/ToolBar';
import { Divider } from '../components/Divider';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing } from '../theme/tokens';
import { Text, View } from 'react-native';

const SAMPLE = [
  {
    id: '1',
    chapter: '复 兴 之 路',
    title: '中国式现代化',
    content: '中国式现代化是人口规模巨大的现代化，是全体人民共同富裕的现代化，是物质文明和精神文明相协调的现代化，是人与自然和谐共生的现代化，是走和平发展道路的现代化。',
    highlight: '全体人民共同富裕',
  },
  {
    id: '2',
    chapter: '人 才 强 国',
    title: '聚天下英才而用之',
    content: '功以才成，业由才广。人才是实现民族振兴、赢得国际竞争主动的战略资源。要不唯地域引进人才，不求所有开发人才，不拘一格用好人才。',
    highlight: '人才',
  },
  {
    id: '3',
    chapter: '乡 村 振 兴',
    title: '产业兴旺是第一要务',
    content: '产业兴旺是解决农村一切问题的前提。要因地制宜发展特色产业，让农民腰包鼓起来，让广袤乡村焕发新的生机活力。',
    highlight: '产业兴旺',
  },
];

type RootStackParamList = { Home: undefined; Reader: { id: string }; Gold: undefined };
type NavProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { theme, themeMode, setThemeMode } = useTheme();
  const t = theme.tokens;
  const [tool, setTool] = useState<'answer'|'doodle'|'blank'|'edit'|'settings'|'toc'>('answer');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 顶部日期 */}
        <View style={styles.topBar}>
          <Text style={[styles.topTitle, { color: t.ink, fontFamily: fonts.serif.bold }]}>
            今日 · 申论精读
          </Text>
          <View style={[styles.dateSeal, { backgroundColor: t.seal }]}>
            <Text style={[styles.dateText, { color: t.paper, fontFamily: fonts.kai.bold }]}>
              七月{'\n'}十二
            </Text>
          </View>
        </View>

        <Divider />

        {/* Hero 文案 */}
        <View style={styles.heroBlock}>
          <Text style={[styles.heroEyebrow, { color: t.inkMuted }]}>JUL · 12 · 2026</Text>
          <Text style={[styles.heroTitle, { color: t.ink, fontFamily: fonts.serif.heavy }]}>
            晨起三篇{'\n'}养浩然之气
          </Text>
          <Text style={[styles.heroSub, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            ⸺ 今日已读 0 / 3 ⸺
          </Text>
        </View>

        {/* 工具栏 */}
        <ToolBar
          active={tool}
          onChange={setTool}
          onSettings={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
          onToc={() => navigation.navigate('Gold')}
        />

        {/* 文章卡片 */}
        {SAMPLE.map((article, i) => (
          <ArticleCard
            key={article.id}
            chapter={article.chapter}
            title={article.title}
            content={article.content}
            highlight={article.highlight}
            index={i + 1}
            total={SAMPLE.length}
            onPress={() => navigation.navigate('Reader', { id: article.id })}
          />
        ))}

        <Divider withCenter />
        <Text style={[styles.footer, { color: t.inkFaint, fontFamily: fonts.kai.regular }]}>
          ⸺ 案牍劳形，不废研读 ⸺
        </Text>
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingTop: spacing.md },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  topTitle: { fontSize: fontSizes.subtitle },
  dateSeal: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 2, transform: [{ rotate: '-3deg' }], alignItems: 'center' },
  dateText: { fontSize: 10, textAlign: 'center', lineHeight: 12 },
  heroBlock: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  heroEyebrow: { fontSize: fontSizes.label, letterSpacing: 2, marginBottom: spacing.sm },
  heroTitle: { fontSize: fontSizes.hero, lineHeight: fontSizes.hero * 1.2, marginBottom: spacing.sm },
  heroSub: { fontSize: fontSizes.caption, letterSpacing: 2 },
  footer: { fontSize: fontSizes.label, textAlign: 'center', marginTop: spacing.md, letterSpacing: 4 },
});
```

- [ ] **Step 4: 写 ReaderScreen.tsx（阅读页骨架）**

```typescript
// src/screens/ReaderScreen.tsx
import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { Divider } from '../components/Divider';
import { fonts, fontSizes, lineHeights, letterSpacings, spacing, radii } from '../theme/tokens';

type RootStackParamList = { Home: undefined; Reader: { id: string }; Gold: undefined };
type Props = NativeStackScreenProps<RootStackParamList, 'Reader'>;

const SAMPLE_ARTICLE = {
  id: '1',
  chapter: '复 兴 之 路',
  title: '中国式现代化',
  content: `中国式现代化是人口规模巨大的现代化，是全体人民共同富裕的现代化，是物质文明和精神文明相协调的现代化，是人与自然和谐共生的现代化，是走和平发展道路的现代化。

中国式现代化，摒弃了西方现代化老路，体现了社会主义建设规律，体现了人类社会发展规律。我们要坚定历史自信、文化自信，坚持古为今用、推陈出新，把马克思主义思想精髓同中华优秀传统文化精华贯通起来。

实践充分证明，中国式现代化走得通、行得稳，是强国建设、民族复兴的康庄大道。`,
  highlight: '全体人民共同富裕',
  source: '学习强国',
  date: '2026-07-10',
};

export default function ReaderScreen({ route, navigation }: Props) {
  const { theme } = useTheme();
  const t = theme.tokens;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      {/* 顶部导航 */}
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: t.inkMuted }]}>{SAMPLE_ARTICLE.chapter}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 标题 */}
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>
          {SAMPLE_ARTICLE.title}
        </Text>

        {/* 元数据 */}
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: t.inkMuted }]}>{SAMPLE_ARTICLE.source}</Text>
          <Text style={[styles.metaText, { color: t.inkMuted }]}>·</Text>
          <Text style={[styles.metaText, { color: t.inkMuted }]}>{SAMPLE_ARTICLE.date}</Text>
        </View>

        <Divider />

        {/* 正文（首字下沉） */}
        <Text style={[styles.content, { color: t.inkSoft, fontFamily: fonts.serif.regular }]}>
          <Text style={[styles.dropcap, { color: t.seal }]}>{SAMPLE_ARTICLE.content.charAt(0)}</Text>
          {SAMPLE_ARTICLE.content.slice(1)}
        </Text>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      {/* 底部工具栏 */}
      <View style={[styles.bottomBar, { backgroundColor: t.paper, borderTopColor: t.border }]}>
        <Text style={[styles.progress, { color: t.inkMuted }]}>第 1 / 3 篇</Text>
        <Pressable style={[styles.markBtn, { backgroundColor: t.seal }]}>
          <Text style={[styles.markBtnText, { color: t.paper }]}>标记金句</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.lg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  backBtn: { width: 50 },
  backText: { fontSize: fontSizes.body },
  topTitle: { fontFamily: fonts.kai.regular, fontSize: fontSizes.label, letterSpacing: letterSpacings.wide },
  title: { fontSize: fontSizes.hero, lineHeight: fontSizes.hero * lineHeights.tight, marginBottom: spacing.sm },
  meta: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  metaText: { fontSize: fontSizes.caption },
  content: { fontSize: fontSizes.body, lineHeight: fontSizes.body * lineHeights.prose },
  dropcap: { fontFamily: fonts.serif.heavy, fontSize: fontSizes.title, lineHeight: fontSizes.title * 1.1, marginRight: 2 },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1 },
  progress: { fontFamily: fonts.serif.regular, fontSize: fontSizes.caption },
  markBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.sm },
  markBtnText: { fontFamily: fonts.serif.bold, fontSize: fontSizes.caption },
});
```

- [ ] **Step 5: 写 GoldScreen.tsx（金句库骨架）**

```typescript
// src/screens/GoldScreen.tsx
import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, radii, borders } from '../theme/tokens';

type RootStackParamList = { Home: undefined; Reader: { id: string }; Gold: undefined };
type Props = NativeStackScreenProps<RootStackParamList, 'Gold'>;

const SAMPLE_NOTES = [
  { id: '1', sentence: '全体人民共同富裕的现代化', article_title: '中国式现代化', theme: '政治', created_at: '2026-07-12' },
  { id: '2', sentence: '功以才成，业由才广', article_title: '聚天下英才而用之', theme: '政治', created_at: '2026-07-12' },
];

export default function GoldScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const t = theme.tokens;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      {/* 顶部导航 */}
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: t.ink }]}>金句库</Text>
        <Text style={[styles.total, { color: t.inkMuted }]}>共 {SAMPLE_NOTES.length} 条</Text>
      </View>

      <FlatList
        data={SAMPLE_NOTES}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: t.paper, borderColor: t.brass }]}>
            <Text style={[styles.sentence, { color: t.ink, fontFamily: fonts.serif.bold }]}>
              "{item.sentence}"
            </Text>
            <View style={styles.cardMeta}>
              <Text style={[styles.source, { color: t.inkMuted }]}>—《{item.article_title}》</Text>
              <View style={[styles.themeTag, { backgroundColor: `${t.seal}15` }]}>
                <Text style={[styles.themeText, { color: t.seal }]}>{item.theme}</Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: t.inkMuted }]}>暂无金句，长按文章文字标记</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  backBtn: { width: 50 },
  backText: { fontSize: fontSizes.body },
  topTitle: { fontFamily: fonts.serif.bold, fontSize: fontSizes.subtitle },
  total: { fontFamily: fonts.sans.regular, fontSize: fontSizes.caption },
  list: { padding: spacing.lg },
  card: { padding: spacing.lg, borderWidth: borders.hair, borderRadius: radii.md, marginBottom: spacing.md },
  sentence: { fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.6, marginBottom: spacing.sm },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  source: { fontFamily: fonts.kai.regular, fontSize: fontSizes.caption },
  themeTag: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill },
  themeText: { fontFamily: fonts.sans.medium, fontSize: fontSizes.micro },
  empty: { fontFamily: fonts.kai.regular, fontSize: fontSizes.body, textAlign: 'center', marginTop: spacing.xxxl },
});
```

- [ ] **Step 6: 提交**

```bash
git add src/App.tsx src/screens/HomeScreen.tsx src/screens/ReaderScreen.tsx src/screens/GoldScreen.tsx
git commit -m "feat: navigation and 3 screen skeletons"
```

---

### 任务 5：数据层（API Client + MMKV Storage）

**Files:**
- Create: `src/api/client.ts`
- Create: `src/storage/mmkv.ts`

**Interfaces:**
- Consumes: `react-native-mmkv`, 云端 API URL
- Produces: `api.getDaily()`, `api.getArticle()`, `api.getNotes()`, `api.postNote()`
- Produces: `storage.getDeviceId()`, `storage.getNotes()`, `storage.setNotes()`

- [ ] **Step 1: 写 MMKV storage.ts**

```typescript
// src/storage/mmkv.ts
import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV({ id: 'shenlun-storage' });

export function getDeviceId(): string {
  let id = storage.getString('device_id');
  if (!id) {
    id = generateUUID();
    storage.set('device_id', id);
  }
  return id;
}

export function getCachedArticles(): Article[] {
  const raw = storage.getString('cached_articles');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function setCachedArticles(articles: Article[]): void {
  storage.set('cached_articles', JSON.stringify(articles));
}

export function getLocalNotes(): Note[] {
  const raw = storage.getString('local_notes');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function addLocalNote(note: Note): void {
  const notes = getLocalNotes();
  notes.unshift(note);
  storage.set('local_notes', JSON.stringify(notes));
}

export function deleteLocalNote(noteId: string): void {
  const notes = getLocalNotes().filter(n => n.id !== noteId);
  storage.set('local_notes', JSON.stringify(notes));
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export interface Article {
  id: string; chapter: string; title: string; content: string;
  highlight?: string; source: string; theme: string;
}
export interface Note {
  id: string; article_id: string; sentence: string;
  article_title: string; theme: string; created_at: string;
}
```

- [ ] **Step 2: 写 API client.ts**

```typescript
// src/api/client.ts
import { getDeviceId, getCachedArticles, setCachedArticles, type Article, type Note } from '../storage/mmkv';

const BASE = 'http://124.223.5.144';

function deviceId() { return getDeviceId(); }

export async function getDaily(): Promise<Article[]> {
  try {
    const res = await fetch(`${BASE}/api/daily?device_id=${deviceId()}`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const articles: Article[] = data.articles ?? [];
    setCachedArticles(articles);
    return articles;
  } catch {
    return getCachedArticles();
  }
}

export async function getArticle(id: string): Promise<Article | null> {
  try {
    const res = await fetch(`${BASE}/api/article/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getNotes(): Promise<Note[]> {
  try {
    const res = await fetch(`${BASE}/api/notes?device_id=${deviceId()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.notes ?? [];
  } catch {
    return [];
  }
}

export async function postNote(note: Omit<Note, 'id'>): Promise<Note | null> {
  try {
    const res = await fetch(`${BASE}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...note, device_id: deviceId() }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/storage/mmkv.ts src/api/client.ts
git commit -m "feat: MMKV storage and API client"
```

---

### 任务 6：启动页（SplashScreen）

**Files:**
- Create: `src/components/SplashScreen.tsx`
- Modify: `src/App.tsx`（条件渲染启动页）

**Goal:** 显示 1.5s 印章 Logo 动画后自动跳转首页。

- [ ] **Step 1: 写 SplashScreen.tsx**

```typescript
// src/components/SplashScreen.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { fonts, spacing } from '../theme/tokens';

interface Props {
  onComplete: () => void;
}

export const SplashScreen: React.FC<Props> = ({ onComplete }) => {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

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
  }, []);

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.logoBox,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        {/* 印章外形 */}
        <View style={styles.sealOuter}>
          <View style={styles.sealInner}>
            <Text style={styles.sealChar}>申</Text>
          </View>
        </View>
        <Text style={styles.appName}>申论积累</Text>
        <Text style={styles.slogan}>日积月累，厚积薄发</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#F0EAD6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBox: {
    alignItems: 'center',
  },
  sealOuter: {
    width: 100,
    height: 100,
    borderWidth: 3,
    borderColor: '#C04851',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sealInner: {
    width: 80,
    height: 80,
    borderWidth: 2,
    borderColor: '#C9A962',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sealChar: {
    fontFamily: fonts.serif.heavy,
    fontSize: 48,
    color: '#C04851',
  },
  appName: {
    fontFamily: fonts.serif.bold,
    fontSize: 28,
    color: '#1C1714',
    marginBottom: spacing.sm,
  },
  slogan: {
    fontFamily: fonts.kai.regular,
    fontSize: 14,
    color: '#8B7355',
    letterSpacing: 4,
  },
});
```

- [ ] **Step 2: 修改 App.tsx 加入启动页逻辑**

在 `RootNavigator` 中添加 `const [showSplash, setShowSplash] = useState(true)`，为 true 时渲染 SplashScreen，为 false 时渲染 Stack.Navigator。

- [ ] **Step 3: 提交**

```bash
git add src/components/SplashScreen.tsx src/App.tsx
git commit -m "feat: SplashScreen with seal logo animation"
```

---

### 任务 7：集成数据（HomeScreen 接 API + 阅读页接 Reader）

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/screens/ReaderScreen.tsx`
- Modify: `src/screens/GoldScreen.tsx`

**Goal:** 首页从 `/api/daily` 获取数据，阅读页支持翻页，金句库从 `/api/notes` 获取。

- [ ] **Step 1: 修改 HomeScreen.tsx 加入 API 调用**

在 `useEffect` 中调用 `getDaily()`，加载状态显示铜金色 spinner。

- [ ] **Step 2: 修改 ReaderScreen.tsx 加入翻页逻辑**

传入 `articles` 数组和当前 `index`，显示左右箭头翻页。

- [ ] **Step 3: 修改 GoldScreen.tsx 加入 API 调用**

调用 `getNotes()` 获取金句列表。

- [ ] **Step 4: 提交**

```bash
git add src/screens/HomeScreen.tsx src/screens/ReaderScreen.tsx src/screens/GoldScreen.tsx
git commit -m "feat: connect API to all screens"
```

---

### 任务 8：云端改动（card_server.py）

**Files:**
- Modify: `/opt/xuexi/09_选卡阅读/card_server.py`
- Modify: `/opt/xuexi/09_选卡阅读/config.json`（如需要）

**Goal:** 新增 `POST /api/notes` 和 `GET /api/notes` 接口，SQLite 新增 `notes` 表，所有接口支持 `device_id` 参数。

- [ ] **Step 1: SSH 连接到云端**

```bash
ssh -i C:\Users\hecto\.ssh\xuexi_tencent -p 2222 ubuntu@124.223.5.144
```

- [ ] **Step 2: 查看现有 card_server.py 的 SQLite 初始化代码**

在 `/opt/xuexi/09_选卡阅读/` 目录下，找到 `init_db()` 函数，添加 `notes` 表：

```python
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS reads
        (id TEXT PRIMARY KEY, device_id TEXT, article_id TEXT,
         read_at TEXT DEFAULT CURRENT_TIMESTAMP)''')
    c.execute('''CREATE TABLE IF NOT EXISTS notes
        (id TEXT PRIMARY KEY, device_id TEXT, article_id TEXT,
         sentence TEXT, article_title TEXT, theme TEXT,
         created_at TEXT DEFAULT CURRENT_TIMESTAMP)''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_notes_device ON notes(device_id)')
    conn.commit()
    conn.close()
```

- [ ] **Step 3: 添加 Notes API 端点**

在 `do_GET` 中找到 `/api/notes` 路由，返回 `SELECT * FROM notes WHERE device_id=? ORDER BY created_at DESC`。

在 `do_POST` 中添加 `/api/notes` 路由，接收 JSON body，插入 `notes` 表。

- [ ] **Step 4: 重启服务**

```bash
cd /opt/xuexi/09_选卡阅读
pkill -f card_server.py
nohup python card_server.py > server.log 2>&1 &
sleep 2
curl "http://127.0.0.1:8080/api/notes?device_id=test"  # 测试
```

- [ ] **Step 5: 提交云端改动**

在服务器上 `git add` + `git commit -m "feat: add notes API"`（如果已有 git）或记录改动日志。

---

### 任务 9：打包 APK

**Goal:** 生成可在手机上安装的 debug APK。

- [ ] **Step 1: Bundle JS 到 APK 内**

```bash
cd shenlun-app
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/
```

- [ ] **Step 2: 编译 Release APK**

```bash
cd android
.\gradlew assembleRelease
```

APK 输出在：`app/build/outputs/apk/release/app-release.apk`

（首次打包需配置签名，可先用 `assembleDebug` 生成 `app-debug.apk`）

- [ ] **Step 3: 提交**

```bash
git add android/app/build/outputs 2>/dev/null || true
git commit -m "build: generate APK"
```

---

## 自检清单

完成所有任务后，确认：

- [ ] 所有页面导航正常（Home → Reader → Gold）
- [ ] 亮/暗模式切换正常
- [ ] 启动页 1.5s 后自动跳转
- [ ] 首页从云端 API 获取数据（离线时显示缓存）
- [ ] 金句标记按钮可见（功能可后期完善）
- [ ] 云端 `/api/notes` 接口可正常读写
- [ ] APK 大小 < 50MB
- [ ] 思源宋体字体正确加载

---

## 执行方式

**Plan complete and saved to `docs/superpowers/plans/2026-07-12-shenlun-app-plan.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
