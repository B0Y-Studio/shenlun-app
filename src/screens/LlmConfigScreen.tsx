// ShenlunApp/src/screens/LlmConfigScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { PRESETS, findPreset, type Provider, type LlmConfig } from '../llm/provider';
import { fetchLlmConfig, saveLlmConfig, deleteLlmConfig, testLlmConnection } from '../api/llmConfig';
import { getDeviceId } from '../storage/mmkv';
import { isLocalMode } from '../config/dataMode';
import type { RootStackParamList } from '../App';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'LlmConfig'>;

export default function LlmConfigScreen() {
  const { theme } = useTheme();
  const t = theme.tokens;
  const navigation = useNavigation<NavProp>();
  const [provider, setProvider] = useState<Provider>('deepseek');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-chat');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await fetchLlmConfig();
      if (cancelled) return;
      if (cfg.configured) {
        const p = (cfg.provider as Provider) || 'custom';
        setProvider(p);
        setBaseUrl(cfg.baseUrl || '');
        setModel(cfg.model || '');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const onPickProvider = (p: Provider) => {
    setProvider(p);
    const preset = findPreset(p);
    if (preset && p !== 'custom') {
      setBaseUrl(preset.baseUrl);
      setModel(preset.model);
    }
  };

  const onSave = useCallback(async () => {
    if (!apiKey.trim()) { Alert.alert('请填 API Key'); return; }
    if (!baseUrl.trim() || !model.trim()) { Alert.alert('请填 base_url 和 model'); return; }
    setSaving(true);
    const ok = await saveLlmConfig(getDeviceId(), { provider, baseUrl, model, apiKey });
    setSaving(false);
    Alert.alert(ok ? '已保存' : '保存失败', ok ? '已加密存到服务端' : '请检查网络或重试');
  }, [provider, baseUrl, model, apiKey]);

  const onTest = useCallback(async () => {
    setTesting(true);
    try {
      const { ok, status } = await testLlmConnection();
      Alert.alert(ok ? '连接成功' : '连接失败', ok ? '请前往分析 Tab 试评' : `HTTP ${status}`);
    } catch (e: unknown) {
      Alert.alert('连接失败', e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }, []);

  const onDelete = useCallback(() => {
    Alert.alert('删除配置', '确定要删除 LLM 配置吗？删除后评卷功能将不可用。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive', onPress: async () => {
          // M17: 依服务端返回判定 success / failure，分别提示
          const ok = await deleteLlmConfig();
          if (ok) {
            setApiKey('');
            Alert.alert('已删除');
          } else {
            Alert.alert('删除失败', '请重试');
          }
        },
      },
    ]);
  }, []);

  if (loading) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
          </Pressable>
          <Text style={[styles.topTitle, { color: t.ink, fontFamily: fonts.serif.bold }]}>LLM 配置</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={t.brass} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: t.ink, fontFamily: fonts.serif.bold }]}>LLM 配置</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Text style={[styles.h1, { color: t.ink, fontFamily: fonts.serif.bold }]}>AI 评卷 · LLM 配置</Text>
        <Text style={[styles.h2, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          {isLocalMode()
            ? '填入你自己的 Key，App 直连 LLM 厂商。Key 仅保存在本机（不经过任何服务器）。'
            : '填入你自己的 Key，App → Server → LLM 厂商。Key 在服务端用 Fernet 加密存储。'}
        </Text>

        <Text style={[styles.label, { color: t.ink, fontFamily: fonts.kai.bold }]}>服务商</Text>
        {PRESETS.map(p => (
          <Pressable
            key={p.provider}
            onPress={() => onPickProvider(p.provider)}
            style={[styles.radio, { borderColor: t.border, backgroundColor: t.paper }, provider === p.provider && { borderColor: t.seal, borderWidth: 2 }]}
          >
            <Text style={[styles.radioText, { color: t.ink, fontFamily: fonts.kai.regular }]}>{p.label}</Text>
            {provider === p.provider && <Text style={{ color: t.seal }}>●</Text>}
          </Pressable>
        ))}

        <Text style={[styles.label, { color: t.ink, fontFamily: fonts.kai.bold }]}>Base URL</Text>
        <TextInput
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://api.deepseek.com"
          placeholderTextColor={t.inkFaint}
          style={[styles.input, { backgroundColor: t.paper, borderColor: t.border, color: t.ink, fontFamily: fonts.serif.regular }]}
        />

        <Text style={[styles.label, { color: t.ink, fontFamily: fonts.kai.bold }]}>Model</Text>
        <TextInput
          value={model}
          onChangeText={setModel}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="deepseek-chat"
          placeholderTextColor={t.inkFaint}
          style={[styles.input, { backgroundColor: t.paper, borderColor: t.border, color: t.ink, fontFamily: fonts.serif.regular }]}
        />

        <Text style={[styles.label, { color: t.ink, fontFamily: fonts.kai.bold }]}>API Key</Text>
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="sk-..."
          placeholderTextColor={t.inkFaint}
          style={[styles.input, { backgroundColor: t.paper, borderColor: t.border, color: t.ink, fontFamily: fonts.serif.regular }]}
        />

        <Pressable
          onPress={onSave}
          disabled={saving}
          style={[styles.btn, { backgroundColor: t.seal, borderColor: t.sealDeep }, saving && { opacity: 0.5 }]}
        >
          <Text style={[styles.btnText, { color: t.paper, fontFamily: fonts.serif.bold }]}>
            {saving ? '保存中...' : '保存配置'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onTest}
          disabled={testing}
          style={[styles.btnGhost, { borderColor: t.brassDeep }, testing && { opacity: 0.5 }]}
        >
          <Text style={[styles.btnGhostText, { color: t.brassDeep, fontFamily: fonts.kai.bold }]}>
            {testing ? '测试中...' : '测试连接（会扣 1 次 LLM 调用费）'}
          </Text>
        </Pressable>

        <Pressable onPress={onDelete} style={[styles.btnDanger]}>
          <Text style={[styles.btnDangerText, { color: t.sealDeep, fontFamily: fonts.kai.bold }]}>删除配置</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs,
    borderBottomWidth: 1,
  },
  backText: { fontSize: fontSizes.body, minWidth: 60 },
  topTitle: { fontSize: fontSizes.subtitle, letterSpacing: 4, flex: 1, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: fontSizes.subtitle, letterSpacing: 4, marginBottom: spacing.sm },
  h2: { fontSize: fontSizes.caption, lineHeight: 20, marginBottom: spacing.lg },
  label: { fontSize: fontSizes.caption, letterSpacing: 2, marginTop: spacing.md, marginBottom: spacing.xs },
  radio: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: borders.hair, borderRadius: radii.sm,
  },
  radioText: { fontSize: fontSizes.body },
  input: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: borders.hair, borderRadius: radii.sm,
    fontSize: fontSizes.body,
  },
  btn: {
    marginTop: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radii.md, borderWidth: 1,
    alignItems: 'center',
  },
  btnText: { fontSize: fontSizes.body, letterSpacing: 4 },
  btnGhost: {
    marginTop: spacing.md, paddingVertical: spacing.md,
    borderRadius: radii.md, borderWidth: 1,
    alignItems: 'center', backgroundColor: 'transparent',
  },
  btnGhostText: { fontSize: fontSizes.caption, letterSpacing: 2 },
  btnDanger: { marginTop: spacing.xl, alignItems: 'center', paddingVertical: spacing.sm },
  btnDangerText: { fontSize: fontSizes.caption, letterSpacing: 2 },
});
