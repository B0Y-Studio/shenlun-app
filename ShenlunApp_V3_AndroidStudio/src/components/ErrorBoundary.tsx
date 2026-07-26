// src/components/ErrorBoundary.tsx
// 顶层 ErrorBoundary，捕获 JS 渲染错误并展示，避免白屏
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

interface Props {
  children: React.ReactNode;
}

/**
 * React 顶层错误边界。
 * - 捕获子组件渲染时抛出的 JS 错误
 * - 控制台打印完整 stack（dev=debug 时 logcat 可见；prod 时也会 console.error）
 * - UI 显示错误消息 + 部分 stack 让用户和 reviewer 有线索
 *
 * 设计取舍：prod 模式不显示 RedBox，所以这里手动渲染一个 fallback
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // console.error 会被 Hermes 写到 logcat（ReactNativeJS tag）
    // dev 模式弹 RedBox；prod 模式也至少能 grep
    console.error('[ErrorBoundary]', error.message);
    console.error('[ErrorBoundary stack]', error.stack);
    console.error('[ErrorBoundary componentStack]', info.componentStack ?? '');
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }
    return <ErrorScreen error={this.state.error} componentStack={this.state.componentStack} />;
  }
}

// ErrorScreen 用 hooks 拿主题，必须拆成函数组件
function ErrorScreen({ error, componentStack }: { error: Error; componentStack: string | null }) {
  const { theme } = useTheme();
  const t = theme.tokens;
  return (
    <View style={[s.root, { backgroundColor: t.bg }]}>
      <Text style={[s.title, { color: t.seal, fontFamily: fonts.serif.bold }]}>
        App 异常
      </Text>
      <ScrollView style={s.scroll}>
        <Text style={[s.label, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          错误信息
        </Text>
        <Text style={[s.msg, { color: t.ink, fontFamily: fonts.serif.regular }]}>
          {error.message}
        </Text>
        <Text style={[s.label, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          堆栈
        </Text>
        <Text style={[s.stack, { color: t.inkSoft, fontFamily: fonts.sans.regular }]}>
          {error.stack}
        </Text>
        {componentStack ? (
          <>
            <Text style={[s.label, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
              组件堆栈
            </Text>
            <Text style={[s.stack, { color: t.inkSoft, fontFamily: fonts.sans.regular }]}>
              {componentStack}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontSize: fontSizes.title,
    letterSpacing: 4,
    marginBottom: spacing.lg,
  },
  scroll: { flex: 1 },
  label: {
    fontSize: fontSizes.caption,
    letterSpacing: 2,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  msg: { fontSize: fontSizes.body, lineHeight: 22 },
  stack: { fontSize: fontSizes.micro, lineHeight: 16 },
});
