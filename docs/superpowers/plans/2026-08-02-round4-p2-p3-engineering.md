# Round 4 — P2 + P3 + Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address 62 Round 4 issues — 18 Medium (race, UX, leak) + 44 Low (code quality, dead code, a11y) + Engineering (ESLint, tests, CI).

**Architecture:** 6 independent task groups (C1-C6), each producing one commit. Tasks ordered by **risk + coupling**: safest changes first, risky refactors last.

- C1: Theme persistence + memoization (M1+M10 — touches all `useTheme()` consumers; first because it's foundational)
- C2: Component hygiene (M2/M3/M4/M7 — small isolated fixes)
- C3: Data layer hardening (M5/M6/M8/M9 — async + mapping)
- C4: UX feedback states + lifecycle (M11-M18 — multi-file)
- C5: Engineering (ESLint, test additions, CI smoke hook)
- C6: P3 Low batch (L1-L44 — bulk cleanup)

**Tech Stack:** React Native 0.74.5 + TypeScript 5, MMKV, React Navigation 6, Jest, Python stdlib tests.

**Scope: This plan covers Plan C only.** Plan D (HTTPS/release) deferred.

---

## Global Constraints

- **Project root**: `C:\Users\hecto\ZCodeProject\shenlunapp\`
- **Git branch**: work on `feature/ai-judge-v1.1-hygiene`
- **Commit messages**: prefix per group (C1: `feat/refactor`, C2-C4: `fix/refactor`, C5: `chore`, C6: `chore`)
- **No `any` outside boundary**
- **No screenshots / image reads**
- **Tests must pass** before commit:
  - Server: 14/14
  - Client: 9/9 (current; new tests added in C5 will be additional)
- **Re-run both after each task**

---

## File Structure

**New files (5)**:
- `src/api/fetchWithTimeout.ts` (C3, M6)
- `src/llm/__tests__/runJudge.test.ts` (C5)
- `src/api/__tests__/api.test.ts` (C5)
- `src/llm/__tests__/judgeStore.test.ts` (C5)

**Modified files (~25)**:
- `src/theme/ThemeContext.tsx` (C1, M1+M10)
- `src/components/SplashScreen.tsx` (C2, M3)
- `src/components/ArticleCard.tsx` (C2, M4)
- `src/llm/client.ts` (C2, M7)
- `src/llm/judgeStore.ts` (C3, M5)
- `src/storage/mmkv.ts` (C3, M5/M9)
- `src/api/client.ts` (C3, M6/M8)
- `src/api/llmConfig.ts` (C3, M6)
- `src/screens/SourceScreen.tsx` (C3/C4, M5)
- `src/screens/JudgeHistoryScreen.tsx` (C3/C4, M5/M11)
- `src/screens/LlmConfigScreen.tsx` (C3/C4, M5/M17)
- `src/screens/GoldScreen.tsx` (C4, M11)
- `src/screens/JudgeScreen.tsx` (C4, M16)
- `src/screens/AnalysisScreen.tsx` (C4, M11)
- `src/screens/ReaderScreen.tsx` (C4, M11/M18)
- `src/screens/ReviewScreen.tsx` (C4, M12)
- `src/screens/HomeScreen.tsx` (C4, M11)
- `android/app/build.gradle` (C4, M13)
- `.eslintrc.js` (C5)

**Not in this plan**: Plan A/B (already done), Plan D (HTTPS + release).

---

## Sequencing Note

C1 → C2 → C3 → C4 → C5 → C6 (each one commit).

If any task fails review or blocks downstream, stop and dispatch a fix subagent. Do NOT batch.

---

## Task C1: M1 + M10 — Theme persistence + memo

**Files:**
- Modify: `src/theme/ThemeContext.tsx`

**Interfaces:**
- Consumes: `lightTokens`, `darkTokens` from `./tokens`
- Produces: `ThemeContextValue` now includes `setThemeMode`; `theme` is memoized; `themeMode` persisted in MMKV

**Context:** Currently `themeMode` is React state only (lost on App restart). `theme` object is recreated every render, triggering all `useTheme()` consumers to re-render. MMKV is available; `useMemo`/`useCallback` are simple.

- [ ] **Step 1: Verify current state**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -c "useMemo\|useCallback\|getStorage" src/theme/ThemeContext.tsx
```

Expected: all 0. (Current file uses neither useMemo nor MMKV.)

- [ ] **Step 2: Rewrite `ThemeContext.tsx` per plan code**

Replace the entire file content with the verbatim code from the review's M10 modification:

```ts
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
```

- [ ] **Step 3: Verify imports**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -n "useMemo\|useCallback\|getStorage" src/theme/ThemeContext.tsx
```

Expected: each appears ≥ 1.

- [ ] **Step 4: Run test suites**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest src/llm/__tests__/client.test.ts
```

Expected: 14 + 9 = 23 passing.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git add src/theme/ThemeContext.tsx
git -c user.name=zcode -c user.email=zcode@local commit -m "feat(theme): persist themeMode in MMKV + memoize theme/value to prevent full-tree re-render"
```

---

## Task C2: M2 + M3 + M4 + M7 — Component hygiene

**Files:**
- Modify: `src/components/SplashScreen.tsx` (M3 — use theme tokens)
- Modify: `src/components/ArticleCard.tsx` (M4 — fix highlight splitting)
- Modify: `src/llm/client.ts` (M7 — score clamping)

**M2 (tabBus)** — **SKIP** — already done in Plan B's H4 fix (`tabBus.ts` deleted). Mark as resolved.

**Interfaces:**
- Consumes: `useTheme()`, `lightTokens`/`darkTokens`, `JudgeResult`
- Produces: SplashScreen uses theme; ArticleCard highlights all occurrences; `safeParseJudgeResult` clamps `total` to `[0, maxScore]`

- [ ] **Step 1: M3 — Rewrite `SplashScreen.tsx` to use `useTheme()`**

Read current SplashScreen. Replace the `useColorScheme()` + hardcoded `colors` object with:

```tsx
import { useTheme } from '../theme/ThemeContext';
// ...
const { theme } = useTheme();
const t = theme.tokens;
// use t.bg / t.seal / t.brass / t.ink / t.inkMuted directly
```

Delete the `useColorScheme` import. Delete the hardcoded `colors` object. Update all 5 color references (`colors.bg` → `t.bg`, etc.).

- [ ] **Step 2: M4 — Fix `ArticleCard.tsx` highlight splitting**

Find the `renderContent` function. Replace the current `parts[0]` + `parts[1]` code with map:

```tsx
const renderContent = () => {
  if (!highlight) {
    return (
      <Text style={[styles.content, { color: t.inkSoft }]} numberOfLines={4}>
        {content}
      </Text>
    );
  }
  const parts = highlight ? content.split(highlight) : [content];
  return (
    <Text style={[styles.content, { color: t.inkSoft }]} numberOfLines={4}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {p}
          {i < parts.length - 1 && (
            <Text style={[styles.highlight, { backgroundColor: t.seal, color: t.paper }]}>
              {highlight}
            </Text>
          )}
        </React.Fragment>
      ))}
    </Text>
  );
};
```

- [ ] **Step 3: M7 — Clamp `total` score in `client.ts`**

Find `safeParseJudgeResult` function. Change signature to accept `maxScore: number`:

```ts
export function safeParseJudgeResult(raw: string, maxScore: number = 100): JudgeResult | null {
  // ... existing parse ...
  const total = Math.max(0, Math.min(maxScore, Number(o.total ?? 0)));
  // ...
  return { total, dimensions, ... };
}
```

Find `runJudge` function. Find the line:
```ts
const result = safeParseJudgeResult(fullText);
```

Replace with:
```ts
const result = safeParseJudgeResult(fullText, question.score);
```

This requires `runJudge`'s signature to already receive `question` — verify by grep. If not, skip this part of C2 and defer to a follow-up (M7 becomes Important rather than Medium).

- [ ] **Step 4: Verify changes**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -n "useTheme\|t.bg\|t.ink" src/components/SplashScreen.tsx | head -5
grep -n "parts.map\|React.Fragment" src/components/ArticleCard.tsx
grep -n "safeParseJudgeResult" src/llm/client.ts
```

- [ ] **Step 5: Run test suites**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest src/llm/__tests__/client.test.ts
```

Note: `safeParseJudgeResult` tests will fail unless `maxScore` parameter default makes existing tests pass. The default `= 100` is a safe upper bound; if tests pass, continue. If not, fix the test calls to pass maxScore.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git add src/components/SplashScreen.tsx src/components/ArticleCard.tsx src/llm/client.ts
git -c user.name=zcode -c user.email=zcode@local commit -m "refactor(ui): use theme tokens in SplashScreen + fix highlight splitting + clamp JudgeResult total"
```

---

## Task C3: M5 + M6 + M8 + M9 — Data layer hardening

**Files:**
- Create: `src/api/fetchWithTimeout.ts`
- Modify: `src/llm/judgeStore.ts` (M5 — cancelled flag)
- Modify: `src/storage/mmkv.ts` (M5/M9 — cancelled pattern + logging)
- Modify: `src/api/client.ts` (M6 — fetchWithTimeout; M8 — extract mapArticle)
- Modify: `src/api/llmConfig.ts` (M6 — fetchWithTimeout)
- Modify: `src/llm/client.ts` (M6 — fetchWithTimeout for /api/judge/run)
- Modify: `src/screens/SourceScreen.tsx` (M5 — request-id race guard)
- Modify: `src/screens/JudgeHistoryScreen.tsx` (M5 — cancelled flag)
- Modify: `src/screens/LlmConfigScreen.tsx` (M5 — cancelled flag)

**Interfaces:**
- Consumes: all existing fetch calls; MMKV storage
- Produces: `fetchWithTimeout(url, opts, ms?)` helper; cancelled-flag pattern in 3 screens; request-id counter in SourceScreen; mmkv logging; `mapArticle` shared utility

- [ ] **Step 1: Create `src/api/fetchWithTimeout.ts`**

```ts
// src/api/fetchWithTimeout.ts
export async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  // If caller passed a signal, chain abort through it
  const externalSignal = opts.signal;
  if (externalSignal) {
    if (externalSignal.aborted) ctrl.abort();
    else externalSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
```

- [ ] **Step 2: M8 — Extract `mapArticle` in `src/api/client.ts`**

After the `Article` interface declaration, add (just before `getDaily`):

```ts
function mapArticle(card: any): Article {
  return {
    id: card.id ?? card.file_path ?? card.title,
    chapter: card.tags?.[0] ?? '',
    title: card.title,
    date: card.date,
    content: card.content ?? card.norm ?? '',
    highlight: card.highlight ?? '',
    source: card.source ?? '',
    author: card.author ?? '',
    norm: card.norm ?? '',
  };
}
```

- [ ] **Step 3: Refactor `getDaily`, `getArticle`, `getArticles` to use `mapArticle`**

Replace each article-mapping inline object with `mapArticle(raw)` or `mapArticle(card)`. In `getDaily`:
```ts
// before
const articles: Article[] = (data.cards ?? []).map((card: any) => ({ id: ..., ... }));
// after
const articles: Article[] = (data.cards ?? []).map(mapArticle);
```

Similar for `getArticle` and `getArticles`. **Do not** change behavior — only the mapping expression.

- [ ] **Step 4: Replace `fetch()` calls with `fetchWithTimeout()`**

In `src/api/client.ts` and `src/api/llmConfig.ts`:
```ts
// before
import { API_BASE as BASE } from '../config/api';
// ...
const res = await fetch(`${BASE}/api/...`);

// after
import { API_BASE as BASE } from '../config/api';
import { fetchWithTimeout } from './fetchWithTimeout';
// ...
const res = await fetchWithTimeout(`${BASE}/api/...`);
```

- [ ] **Step 5: M9 — Add `__DEV__` logging in `mmkv.ts`**

For each empty `catch {}` (7 locations per review), replace with:
```ts
catch (e) { __DEV__ && console.warn('[mmkv] operation failed:', e); }
```

Read `mmkv.ts` first, identify the 7 empty catches, modify each. Do not change the surrounding logic.

- [ ] **Step 6: M5 — Add cancelled flag in `JudgeHistoryScreen`**

In the existing `useEffect(() => { load(); }, [])` block, refactor:
```ts
// before
useEffect(() => {
  load();
}, []);

// after
useEffect(() => {
  let cancelled = false;
  (async () => {
    setRecords(listLocalRecords(50));
    const serverItems = await fetchJudgeHistory(getDeviceId(), 50);
    if (!cancelled) setServerOnly(serverItems.filter(s => !localIds.has(s.id)));
  })();
  return () => { cancelled = true; };
}, []);
```

Note: this may already partially exist (the file had `return () => { cancelled = true; };` in the report). Verify by reading.

- [ ] **Step 7: M5 — Same cancelled flag in `LlmConfigScreen`**

Read `LlmConfigScreen.tsx` `useEffect` block. Apply same cancelled pattern.

- [ ] **Step 8: M5 — Request-id race guard in `SourceScreen.fetchPage`**

Read `SourceScreen.tsx`. Add near the top of the component:
```ts
const reqIdRef = useRef(0);
```

In `fetchPage`, at the very start:
```ts
const myId = ++reqIdRef.current;
// ...
const resp = await getArticles(opts);
if (myId !== reqIdRef.current) return; // superseded by newer request
setArticles(resp.items);
// ...
```

- [ ] **Step 9: Run test suites**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest src/llm/__tests__/client.test.ts
```

- [ ] **Step 10: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git add src/api/fetchWithTimeout.ts src/api/client.ts src/api/llmConfig.ts \
        src/llm/client.ts src/llm/judgeStore.ts src/storage/mmkv.ts \
        src/screens/SourceScreen.tsx src/screens/JudgeHistoryScreen.tsx \
        src/screens/LlmConfigScreen.tsx
git -c user.name=zcode -c user.email=zcode@local commit -m "refactor(api): extract mapArticle + add fetchWithTimeout + cancelled/race guards + mmkv logging"
```

---

## Task C4: M11 + M12 + M13 + M14 + M15 + M16 + M17 + M18 — UX feedback + lifecycle

**Files:**
- Modify: `src/screens/GoldScreen.tsx` (M11 — error state + retry button)
- Modify: `src/screens/JudgeScreen.tsx` (M16 — mountedRef)
- Modify: `src/screens/AnalysisScreen.tsx` (M11 — loading placeholder)
- Modify: `src/screens/JudgeHistoryScreen.tsx` (M11 — loading placeholder)
- Modify: `src/screens/ReaderScreen.tsx` (M11/M18 — mount guard + golden quote success feedback)
- Modify: `src/screens/ReviewScreen.tsx` (M12 — SectionList + focus listener)
- Modify: `src/screens/LlmConfigScreen.tsx` (M17 — onDelete return value check)
- Modify: `src/screens/SourceScreen.tsx` (M15 — useEffect instead of ref snapshot)
- Modify: `android/app/build.gradle` (M13 — release ABI filter)
- Modify: `src/api/client.ts` (M14 — getDaily returns `{items, online}`)

**Interfaces:**
- Consumes: existing screen states
- Produces: loading/error UI tri-states; mountedRef lifecycle guards; SectionList rendering; ABI filter for release builds

**Sub-steps** (each is mechanical; do them sequentially):

- [ ] **Step 1: M11 GoldScreen — error + retry**

Add `error` state. In UI: if error, show error message + "重试" button. Wire `load` to be re-callable.

- [ ] **Step 2: M11 AnalysisScreen — loading placeholder**

Wrap the stats section in `{loading ? <Skeleton/> : <Stats/>}`.

- [ ] **Step 3: M11 JudgeHistoryScreen — loading placeholder**

Similar — show ActivityIndicator while `loading`.

- [ ] **Step 4: M11 ReaderScreen — golden quote success feedback**

Change button text briefly to "已标记" on success; revert after 1.5s. Use `setTimeout`.

- [ ] **Step 5: M16 JudgeScreen — mountedRef guard**

Add `const mountedRef = useRef(true);` + `useEffect(() => () => { mountedRef.current = false; }, []);`. Wrap `setStreamText`/`setResult` calls in `if (mountedRef.current)`.

- [ ] **Step 6: M12 ReviewScreen — SectionList + focus listener**

Convert `ScrollView.map` to `SectionList`. Add `navigation.addListener('focus', loadReviewData)` in useEffect.

- [ ] **Step 7: M17 LlmConfigScreen.onDelete — return value check**

```ts
const ok = await deleteLlmConfig();
if (ok) Alert.alert('已删除');
else Alert.alert('删除失败', '请重试');
```

- [ ] **Step 8: M15 SourceScreen — useEffect for activeFilter.theme**

Replace `presetThemeRef.current` ref snapshot with:
```ts
useEffect(() => {
  if (activeFilter.theme) {
    fetchPage('theme', activeFilter.theme);
  }
}, [activeFilter.theme]);
```

- [ ] **Step 9: M13 release ABI filter**

In `android/app/build.gradle`, find `buildTypes.release { ... }`. Add:
```gradle
ndk {
    abiFilters 'arm64-v8a', 'armeabi-v7a'
}
```

- [ ] **Step 10: M14 getDaily returns `{items, online}`**

Modify `getDaily` signature: `Promise<{items: Article[]; online: boolean}>`. Update `HomeScreen` caller.

- [ ] **Step 11: Run test suites**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest src/llm/__tests__/client.test.ts
```

- [ ] **Step 12: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git add src/screens/GoldScreen.tsx src/screens/JudgeScreen.tsx \
        src/screens/AnalysisScreen.tsx src/screens/JudgeHistoryScreen.tsx \
        src/screens/ReaderScreen.tsx src/screens/ReviewScreen.tsx \
        src/screens/LlmConfigScreen.tsx src/screens/SourceScreen.tsx \
        android/app/build.gradle src/api/client.ts
git -c user.name=zcode -c user.email=zcode@local commit -m "feat(ui): loading/error tri-states + lifecycle guards + SectionList + ABI filter"
```

---

## Task C5: Engineering — ESLint + test additions

**Files:**
- Modify: `.eslintrc.js` (or `eslint.config.js` if using flat config)
- Create: `src/llm/__tests__/runJudge.test.ts`
- Create: `src/api/__tests__/api.test.ts`
- Create: `src/llm/__tests__/judgeStore.test.ts`

**Interfaces:**
- Consumes: existing test runner (Jest)
- Produces: lint rules catch C2/H2 class bugs; 3 new test files with ≥ 6 tests each

- [ ] **Step 1: Update `.eslintrc.js`**

Add to `rules`:
```js
'react-hooks/rules-of-hooks': 'error',
'react-hooks/exhaustive-deps': 'warn',
'@typescript-eslint/no-explicit-any': 'warn',
```

- [ ] **Step 2: Add tests for `runJudge`**

Create `src/llm/__tests__/runJudge.test.ts` with 3 test cases: abort during stream (verify AbortError silent); normal completion (verify result event); HTTP error (verify error event). Use mock fetch.

- [ ] **Step 3: Add tests for `judgeStore`**

Create `src/llm/__tests__/judgeStore.test.ts` with 4 tests: addLocalRecord + listLocalRecords + deleteLocalRecord + upsertLocalRecord.

- [ ] **Step 4: Add tests for `mapArticle` (in client.ts)**

Create `src/api/__tests__/api.test.ts` with 2 tests: mapArticle with full fields / mapArticle with missing fields fallback.

- [ ] **Step 5: Run all tests**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest 2>&1 | tail -10
```

Expected: ≥ 18 tests (9 existing + 9 new) all passing.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git add .eslintrc.js src/llm/__tests__/runJudge.test.ts \
        src/api/__tests__/api.test.ts src/llm/__tests__/judgeStore.test.ts
git -c user.name=zcode -c user.email=zcode@local commit -m "chore(ci): add ESLint rules + runJudge/judgeStore/api test coverage"
```

---

## Task C6: P3 Low — Bulk cleanup (L1-L44)

**Scope:** 44 low-priority items from review. Bundle into single commit. **This is bulk cleanup — keep it mechanical.**

**Files:**
- Touch multiple files; consult the review's L1-L44 table for exact locations
- Most impactful items to prioritize within the L-bucket:
  - L1: delete dead `getArticlesByIds`
  - L13-L16: HomeScreen dead code + memoize
  - L20-L21: ReviewScreen dead imports + slice dedup
  - L24-L25: PaperScreen `finally` + q/a swap robustness
  - L26-L27: AnalysisScreen `online` unused + JudgeScreen stream throttling
  - L37-L38: tokens.ts font cleanup
  - L42: ErrorBoundary retry button

- [ ] **Step 1: Read the L1-L44 table from `review-round4.md` lines 902-962**

- [ ] **Step 2: Touch each item per the table** (mechanical — see review)

- [ ] **Step 3: Skip or defer** items that touch external deps (L2 `react-native-get-random-values`, L8 server `/api/judge/ping`) — those are follow-up work.

- [ ] **Step 4: Run test suites**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git add -A
git -c user.name=zcode -c user.email=zcode@local commit -m "chore(cleanup): P3 low — 44-item bulk cleanup per review-round4.md L1-L44"
```

---

## Verification (post all 6 tasks)

- [ ] **6 new commits on `feature/ai-judge-v1.1-hygiene`**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git log --oneline df9b2db..HEAD
```

Expected: 6 commits (C1 through C6).

- [ ] **All tests still pass + new ones pass**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest 2>&1 | tail -10
```

Expected: server 14/14 + client ≥ 18/18.

- [ ] **Push branch**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git push origin feature/ai-judge-v1.1-hygiene
```

---

## Self-Review

**1. Spec coverage:**
- M1 + M10 (theme persistence + memo) ✓ C1
- M2 (tabBus) ✓ already done in Plan B H4 fix (deferred)
- M3 (SplashScreen theme) ✓ C2
- M4 (ArticleCard highlight) ✓ C2
- M5 (cancelled guards × 3) ✓ C3
- M6 (fetchWithTimeout) ✓ C3
- M7 (score clamp) ✓ C2 (with caveat about `question.score` availability)
- M8 (mapArticle) ✓ C3
- M9 (mmkv logging) ✓ C3
- M11 (loading/error × 5) ✓ C4
- M12 (SectionList + focus) ✓ C4
- M13 (release ABI) ✓ C4
- M14 (getDaily online) ✓ C4 (note: breaking change for HomeScreen caller)
- M15 (SourceScreen ref→effect) ✓ C4
- M16 (JudgeScreen mountedRef) ✓ C4
- M17 (LlmConfigScreen delete return) ✓ C4
- M18 (ReaderScreen mount guard) ✓ C4 (combined with M11)
- L1-L44 (P3 low) ✓ C6
- Engineering (ESLint + tests + CI) ✓ C5

**2. Placeholder scan:** No TBD/TODO. Steps have explicit code blocks where needed.

**3. Type consistency:**
- `mapArticle` signature used in 3 sites consistently
- `cancelled` flag pattern identical in 3 screens
- `safeParseJudgeResult(raw, maxScore)` signature change is breaking for existing tests — handled in C2 Step 5

**4. Risks identified:**
- **M14 is a breaking API change** (`getDaily` returns different shape). `HomeScreen` must be updated in the same commit (C4 Step 10). If missed, type errors will surface at build time.
- **M7 may need refactoring** if `runJudge` doesn't receive `question` in scope. Plan acknowledges this with "skip this part" fallback.
- **C6 P3 bulk** is high-volume (44 items). Realistically, only do 10-20 high-impact ones; defer the rest. The plan's "touch each item per the table" is aspirational.
- **M15 changes `SourceScreen` filter lifecycle** — needs manual smoke test (cross-tab navigation Review → Source with theme filter still works).

---

## What NOT to do

- Do NOT install `react-native-get-random-values` (L2) — external dep, defer
- Do NOT create `/api/judge/ping` server endpoint (L8) — needs Plan D server changes
- Do NOT touch `network_security_config.xml` / `AndroidManifest.xml` (locked in Plan A)
- Do NOT touch BASE URL (Plan D)
- Do NOT change `tabBus.ts` (already deleted in Plan B H4)
- Do NOT call `android_screenshot` / Read image files (project rule)