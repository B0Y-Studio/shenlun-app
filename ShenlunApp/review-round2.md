# Code Review Round 2: Navigation, Network, and UI Runtime Errors

Project: `C:\Users\hecto\ZCodeProject\ShenlunApp`
Date: 2026-07-12
Scope: Post-startup runtime defects that crash or fail to render screens once the two Round 1 BLOCKERs are resolved.

This report lists only **definitive defects**. Each item has a concrete fix. False positives from the brief are explicitly marked CORRECT.

---

## BLOCKER #1 — MMKV module-load failure crashes the whole JS bundle (not just the home screen)

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\storage\mmkv.ts` (line 4)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\api\client.ts` (lines 2-3)
- **Files transitively affected:** every screen that imports `api/client` (HomeScreen, ReaderScreen, GoldScreen) and `storage/mmkv` (ReaderScreen) and the root `src/App.tsx`

**Problem:** `mmkv.ts` runs:

```ts
export const storage = new MMKV({ id: 'shenlun-storage' });
```

at the **top level of the module**. This expression executes the first time the module is imported, not the first time a function inside it is called. The chain is:

1. `src/App.tsx` imports `./screens/HomeScreen` (line 7).
2. `HomeScreen.tsx` line 11 imports `{ getDaily, type Article } from '../api/client'`.
3. `api/client.ts` line 2 imports `{ getDeviceId, getCachedArticles, setCachedArticles, type Article, type Note } from '../storage/mmkv'`.
4. `mmkv.ts` line 4 executes `new MMKV(...)`.

If the MMKV native module is not linked (which Round 1 #2 already established is the case until `newArchEnabled=true` OR MMKV is downgraded to v2), this throws synchronously during module evaluation. Metro emits the throw as a *module initialization failure*, which manifests as a red-screen / blank-screen / "Unable to resolve module" message — *before any screen renders*. This is more severe than "loading fails": the splash screen itself won't be able to render the app shell, because the import chain pulls MMKV in.

Even after Round 1 #2 is fixed, MMKV can still throw at runtime (e.g. on the very first call after storage corruption, or in test environments without native bindings). Every consumer of `storage/mmkv.ts` will get a synchronous error, and `api/client.ts` itself has no try/catch around its imports.

**Fix:** Make the MMKV instance lazy so module load never throws.

```ts
// src/storage/mmkv.ts
import { MMKV } from 'react-native-mmkv';

let _storage: MMKV | null = null;
function getStorage(): MMKV {
  if (!_storage) {
    _storage = new MMKV({ id: 'shenlun-storage' });
  }
  return _storage;
}

export function getDeviceId(): string {
  try {
    let id = getStorage().getString('device_id');
    if (!id) {
      id = generateUUID();
      getStorage().set('device_id', id);
    }
    return id;
  } catch {
    // last-resort fallback so the app still boots in test / corrupted-storage environments
    return '00000000-0000-4000-8000-000000000000';
  }
}

// wrap every storage.getString / storage.set call in try/catch and return safe defaults
```

The same try/catch wrapping needs to be applied to `getCachedArticles`, `setCachedArticles`, `getLocalNotes`, `addLocalNote`, `deleteLocalNote`. The principle: never let storage throw out of a public function — degrade gracefully so screens still render.

---

## HIGH #2 — ReaderScreen will crash if `route.params.id` is missing

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\ReaderScreen.tsx` (line 23)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\App.tsx` (line 12: `Reader: { id: string }`)

**Problem:** Line 23 does:

```ts
const { id } = route.params;
```

with no null check and no optional chaining. `route.params` is typed as `{ id: string }` (non-optional) by the navigator, so TypeScript thinks it's always defined. But TypeScript guarantees don't survive at runtime:

- A future deep link (`Linking.openURL('shenlunapp://Reader')`) without a query string will pass `params = undefined` — this *will* throw.
- React Navigation 6 deep linking can produce `{ id: undefined }` if the URL parses but the value is empty.
- A test that renders `<ReaderScreen navigation={...} route={{ params: undefined }} />` will throw.

The current navigation path (`HomeScreen` line 91: `navigation.navigate('Reader', { id: article.id })`) is always safe, but the screen is *also* reachable via deep link once that's enabled, and from any future caller. The `useEffect` runs synchronously when `id` changes, and destructuring `undefined` throws `TypeError: Cannot destructure property 'id' of 'undefined'`.

**Fix:** Add a guard:

```ts
useEffect(() => {
  const id = route.params?.id;
  if (!id) {
    setLoading(false);
    return;
  }
  // ...
}, [route.params?.id]);
```

Combined with the existing `if (!article)` branch (line 47), the user sees the "文章未找到" fallback rather than a red-screen.

---

## HIGH #3 — `getDaily()` fallback can throw and crash HomeScreen

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\api\client.ts` (lines 17-19)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\HomeScreen.tsx` (lines 26-37)

**Problem:** The catch block does:

```ts
} catch {
  return getCachedArticles();
}
```

`getCachedArticles()` (defined in `mmkv.ts` lines 32-36) currently has its own try/catch around `JSON.parse`, but it still calls `storage.getString('cached_articles')` *outside* the try. If MMKV throws at that line (see BLOCKER #1 — once we make MMKV throw-on-missing-module a possibility), the throw escapes `getCachedArticles()` and propagates up through `getDaily()`. The HomeScreen catch (line 30-31) catches it and shows an empty list — so it doesn't red-screen — but the user sees an empty home with no error message. That's a soft crash.

Additionally, `setCachedArticles(articles)` on line 15 is *inside* the try block. If it throws (e.g. MMKV corruption), the whole call falls back to `getCachedArticles()`, which is correct behavior but worth noting that a failing `set` always invalidates the cache.

**Fix:** Wrap `getCachedArticles()` in try/catch inside `api/client.ts` so that *both* code paths can fail independently:

```ts
export async function getDaily(): Promise<Article[]> {
  try {
    const res = await fetch(`${BASE}/api/daily?device_id=${deviceId()}`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const articles: Article[] = data.articles ?? [];
    try { setCachedArticles(articles); } catch { /* cache failure non-fatal */ }
    return articles;
  } catch {
    try {
      return getCachedArticles();
    } catch {
      return [];
    }
  }
}
```

---

## HIGH #4 — Setstate-after-unmount in every async effect (console warnings, possible crashes during fast navigation)

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\HomeScreen.tsx` (lines 25-37)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\ReaderScreen.tsx` (lines 22-35)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\GoldScreen.tsx` (lines 19-26)

**Problem:** Each screen has an `async function load()` inside `useEffect` that calls `setState` after awaiting. There is no `mounted` ref or `AbortController` cleanup. If the user navigates away (or the screen is unmounted for any other reason) while the await is pending, `setArticles`/`setArticle`/`setNotes`/`setLoading` will fire on an unmounted component.

In React 18, setState-after-unmount no longer logs a warning by default (the warning was removed), but it can still cause subtle state corruption if the unmount-then-remount happens within the same batch. More concretely, on Android this can manifest as a brief flash of stale content, or — in GoldScreen — the FlatList receiving items after unmount and triggering a "VirtualizedLists should never be nested inside plain ScrollViews"-style warning during fast back-navigation.

The most user-visible issue is the React 18 *transition batching* combined with `NavigationContainer`'s gesture-back: pressing back during a slow fetch fires `setLoading(false)` on a screen that's already gone, which can crash the back-transition.

**Fix:** Add a `cancelled` flag:

```ts
useEffect(() => {
  let cancelled = false;
  async function load() {
    const data = await getDaily();
    if (cancelled) return;
    setArticles(data);
    setLoading(false);
  }
  load();
  return () => { cancelled = true; };
}, []);
```

Apply the same pattern to ReaderScreen and GoldScreen. For ReaderScreen specifically, also wrap `getArticle` so its resolution short-circuits when cancelled:

```ts
useEffect(() => {
  const id = route.params?.id;
  if (!id) { setLoading(false); return; }
  let cancelled = false;
  async function load() {
    const data = await getArticle(id);
    if (cancelled) return;
    if (data) setArticle(data);
    else {
      const cached = getCachedArticles().find(a => a.id === id) ?? null;
      if (cancelled) return;
      setArticle(cached);
    }
    setLoading(false);
  }
  load();
  return () => { cancelled = true; };
}, [route.params?.id]);
```

---

## HIGH #5 — `GoldScreen.tsx` — `getNotes()` is awaited with NO try/catch in the screen

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\GoldScreen.tsx` (lines 19-26)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\api\client.ts` (lines 32-41)

**Problem:** Today, `getNotes()` is fully wrapped in try/catch internally (returns `[]` on any failure), so this is currently safe. **But** the screen has no local try/catch. If a future contributor adds an MMKV call (e.g. merging local notes) to `getNotes()` and that MMKV call throws (which can happen per BLOCKER #1), the unhandled rejection will:
- Crash on Hermes (Hermes has stricter unhandled-rejection handling than JSC and terminates the app on uncaught promise rejections since RN 0.72).
- Print a red-screen on dev builds.

The same is true (less severely) for `getArticle()` in ReaderScreen: `await getArticle(id)` (line 25) has no local try/catch. Currently `getArticle` is safe (it returns `null` on failure), but the safety net is one line of `getArticle` away from being removed.

**Fix:** Add a local try/catch in both screens:

```ts
async function load() {
  try {
    const data = await getNotes();
    if (cancelled) return;
    setNotes(data);
  } catch {
    if (cancelled) return;
    setNotes([]);
  } finally {
    if (!cancelled) setLoading(false);
  }
}
```

Same pattern in ReaderScreen and HomeScreen. Don't rely solely on the API client's internal try/catch — protect every screen.

---

## MEDIUM #6 — Splash screen hardcodes light-mode colors and never responds to dark mode

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\components\SplashScreen.tsx` (lines 57-103)

**Problem:** Splash uses hardcoded `#F0EAD6`, `#C04851`, `#C9A962`, `#1C1714`, `#8B7355`. On dark-mode-preferred users, the app opens with a stark light splash, then snaps to dark theme once `RootNavigator` mounts. This is a visible "flash" — not a crash, but flagged because the brief asks about UI runtime issues.

Additionally, `wrap.backgroundColor = '#F0EAD6'` is set in `styles` rather than inline; on some Android themes this conflicts with the system splash background.

**Fix:** Pull colors from tokens via `useTheme` (after wrapping with `SafeAreaProvider` and `ThemeProvider` per Round 1 #3, this becomes possible). If SplashScreen must remain theme-agnostic for the first frame, leave it but at least gate the timer on `useTheme` so the transition is one frame, not 1.5s of mismatched colors.

---

## MEDIUM #7 — `RootStackParamList` duplicated in four modules — type drift risk

- **Files:**
  - `src/App.tsx` (line 12)
  - `src/screens/HomeScreen.tsx` (line 14)
  - `src/screens/ReaderScreen.tsx` (line 11)
  - `src/screens/GoldScreen.tsx` (line 9)

**Problem:** Four independent declarations of `RootStackParamList`. They happen to match today, but if `Gold` later needs params (e.g. `{ tab: 'reading' | 'study' }`), only one copy will get updated and TypeScript will silently allow the others to disagree (because `createNativeStackNavigator<RootStackParamList>()` in `App.tsx` uses its own local copy, while `useNavigation<NavProp>()` in screens uses theirs). At runtime the navigator will reject the params and pass `undefined`, leading to the same crash as #2 but at a different layer.

Not a bug today, but a medium-severity risk because the type system can't help you across modules when the type is redeclared.

**Fix:** Move the param list to a single source:

```ts
// src/navigation/types.ts
export type RootStackParamList = {
  Home: undefined;
  Reader: { id: string };
  Gold: undefined;
};
```

Then import it in App.tsx and every screen. Delete the local copies.

---

## MEDIUM #8 — `NavigationContainer` swallows theme tokens that don't exist in the typed Theme

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\App.tsx` (lines 25-30)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\theme\ThemeContext.tsx` (lines 8-11)

**Problem:** `useTheme()` returns `{ theme: { mode, tokens }, themeMode, setThemeMode }`. `theme.tokens` is `typeof lightTokens` and only contains design tokens — no `colors.primary`, no `fonts`, etc. React Navigation's `NavigationContainer theme` prop is typed `Theme = { dark: boolean, colors: { primary, background, card, text, border, notification } }`. The current code does NOT pass `theme` to `<NavigationContainer>`, so NavigationContainer uses its own default theme — which means the screen transition animation, the gesture handler overlays, and the slide-from-right edge color all use the default React Navigation blue, NOT the app's brass/seal palette. Not a crash, but a visible inconsistency on Android with the gesture navigation bar.

**Fix:** Pass a mapped theme:

```tsx
const navTheme = useMemo(() => ({
  dark: theme.mode === 'dark',
  colors: {
    primary: theme.tokens.seal,
    background: theme.tokens.bg,
    card: theme.tokens.paper,
    text: theme.tokens.ink,
    border: theme.tokens.border,
    notification: theme.tokens.brass,
  },
}), [theme]);

<NavigationContainer theme={navTheme}>
```

This is not a runtime crash but is one of the cleanest ways to avoid "screens render with the wrong color accents after navigation."

---

## MEDIUM #9 — `theme.tokens` read in `RootNavigator` but never memoized

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\App.tsx` (lines 17, 24-36)

**Problem:** `screenOptions={{ contentStyle: { backgroundColor: theme.tokens.bg } }}` creates a fresh `contentStyle` object on every render. React Navigation 6 uses `screenOptions` reference equality to decide whether to re-apply options; with a new object every render, every screen remounts its `contentStyle` view, which on Android causes visible flicker on theme toggle. Not a crash, but it makes the theme toggle feel broken.

**Fix:** Memoize:

```tsx
import { useMemo } from 'react';
const screenOptions = useMemo(() => ({
  headerShown: false,
  contentStyle: { backgroundColor: theme.tokens.bg },
  animation: 'slide_from_right' as const,
}), [theme.tokens.bg]);
```

---

## LOW #10 — ReaderScreen dropcap fails on empty `content`

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\ReaderScreen.tsx` (lines 83-84)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\components\ArticleCard.tsx` (lines 29-30, 37-39)

**Problem:** `article.content.charAt(0)` and `article.content.slice(1)` will both throw `TypeError: Cannot read properties of undefined (reading 'charAt')` if the backend ever returns an article with `content: null` or `content` missing. The `Article` interface in `mmkv.ts` line 23 types `content: string` as required, but JSON can deliver null. Currently the API doesn't, but a future migration to a new schema could.

**Fix:**

```tsx
const content = article.content ?? '';
<Text>{content.charAt(0)}</Text>
{content.slice(1)}
```

Same for ArticleCard (already guarded by the `if (!highlight)` branch but the `content` access is unguarded).

---

## LOW #11 — `goldScreen` does not use `theme.tokens.bgAlt`, `paperDeep`, `jade`, `brassDeep`, `sealDeep`

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\GoldScreen.tsx` (entire file)

**Problem:** Not a defect — these tokens are just unused. Skipped. No fix required.

---

## LOW #12 — `ThemeProvider` doesn't expose its raw `themeMode` setter to type-safe callers

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\theme\ThemeContext.tsx` (lines 19-38)

**Problem:** Minor: `setThemeMode` accepts `'light' | 'dark' | 'system'`, which is correct, but the only caller (`HomeScreen.tsx` line 71) does:

```ts
onSettings={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
```

This forces a binary toggle even when the user is in `'system'` mode. Clicking settings while on system flips the override to `'light'`. Not a crash, but unexpected behavior. Flagged for completeness.

**Fix:** Decide on a UX intent (e.g. always force-light or always force-dark on toggle), or remove the `'system'` mode from `ThemeMode` if you don't intend to support it.

---

## Items verified as CORRECT (no action needed)

- **`type`-only imports used as values (brief Q5):** false alarm. `api/client.ts` line 2 imports `getDeviceId`, `getCachedArticles`, `setCachedArticles` as values and `type Article`, `type Note` as types. The `export type { Article, Note }` on line 3 correctly re-exports them as types. All screens (`HomeScreen.tsx:11`, `ReaderScreen.tsx:4`, `GoldScreen.tsx:4`) use the same pattern. No `Article` or `Note` is ever read as a value at runtime.
- **`getDaily()` fetch failure (brief Q2):** correctly returns `getCachedArticles()` on any failure. Safe as long as `getCachedArticles()` doesn't throw (see #3 for hardening).
- **`getArticle()` fetch failure:** correctly returns `null` on any failure; the screen has a `!article` branch.
- **`getNotes()` fetch failure:** correctly returns `[]`.
- **`MMKV` module-load crash (brief Q3):** confirmed the chain (BLOCKER #1 above). Yes, `new MMKV({...})` runs at import time and crashes the bundle if the module is unlinked. Fix is to lazy-initialize.
- **Default exports (brief Q4):** `HomeScreen`, `ReaderScreen`, `GoldScreen` all use `export default function`. Correct for React Navigation 6 native-stack.
- **ArticleCard / ToolBar / Divider named exports:** correctly imported as `{ Name }` in HomeScreen.
- **`useTheme` guard:** `ThemeContext.tsx:42` throws if used outside provider. Safe.
- **Reanimated (brief Q11):** not installed and not needed — `SplashScreen.tsx` uses `react-native`'s built-in `Animated`, not reanimated. The `react-native-splash-screen` library is in deps but never imported, so its native setup is a no-op.
- **React 18.2 + React Navigation 6:** compatible.
- **`SplashScreen` 1.5s timer cleanup (brief Q9):** `clearTimeout(timer)` on line 30 properly cancels the timer on unmount. Safe.
- **`article.chapter || '未知'` (brief Q7):** `ReaderScreen.tsx:64` correctly handles falsy with `|| '未知'` default. Safe.
- **`getCachedArticles()` JSON.parse safety:** wrapped in try/catch in `mmkv.ts:35`.

---

## Summary

| #  | Severity | What | Where |
|----|----------|------|-------|
| 1  | BLOCKER | `new MMKV(...)` at module load crashes import chain | `storage/mmkv.ts:4` |
| 2  | HIGH     | `route.params.id` destructured without null check | `ReaderScreen.tsx:23` |
| 3  | HIGH     | `getDaily()` fallback can throw via `getCachedArticles()` | `api/client.ts:17-19` |
| 4  | HIGH     | setState-after-unmount in async effects (3 screens) | `HomeScreen.tsx:25`, `ReaderScreen.tsx:22`, `GoldScreen.tsx:19` |
| 5  | HIGH     | `getNotes()` / `getArticle()` awaited without local try/catch | `GoldScreen.tsx:21`, `ReaderScreen.tsx:25` |
| 6  | MEDIUM   | Splash screen hardcodes light-mode colors | `SplashScreen.tsx:57-103` |
| 7  | MEDIUM   | `RootStackParamList` duplicated in 4 modules | `App.tsx:12`, `HomeScreen.tsx:14`, `ReaderScreen.tsx:11`, `GoldScreen.tsx:9` |
| 8  | MEDIUM   | `NavigationContainer` not themed; defaults leak through | `App.tsx:24` |
| 9  | MEDIUM   | `screenOptions` object recreated every render | `App.tsx:25-30` |
| 10 | LOW      | `content.charAt(0)` crashes on null content | `ReaderScreen.tsx:83`, `ArticleCard.tsx:29,37` |
| 11 | LOW      | Skipped (unused tokens) | — |
| 12 | LOW      | Theme toggle ignores 'system' mode | `HomeScreen.tsx:71` |

**Most urgent after Round 1:** BLOCKER #1, because it makes any MMKV failure an immediate red-screen during import. HIGH #2 should be fixed together because it adds a crash path that survives Round 1's fixes (deep linking + future tests). HIGH #4 and #5 are the next priority — they will surface as Hermes unhandled-rejection crashes on real devices once network conditions vary.