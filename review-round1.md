# Code Review Round 1: APK Startup & Build Issues

Project: C:\Users\hecto\ZCodeProject\ShenlunApp
Date: 2026-07-12
Symptom: Built APK cannot be opened on phone — crashes / fails to render.

This report lists only **definitive defects** that will prevent the app from running on a real device. Each item has a concrete fix.

---

## BLOCKER #1 — `index.js` registers the wrong component (default RN template, not the real app)

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\index.js` (lines 6, 9)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\App.tsx` (entire file — still the stock `react-native init` template)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\App.tsx` (the actual app — never imported)

**Problem:** `index.js` does:
```js
import App from './App';
AppRegistry.registerComponent(appName, () => App);
```
This imports `./App` which resolves to the **root `App.tsx`** — that file is still the unmodified React Native starter template (the `Section`/`Step One`/`See Your Changes` boilerplate). The real application — with `ThemeProvider`, `NavigationContainer`, the `HomeScreen`/`ReaderScreen`/`GoldScreen` stack, and the `SplashScreen` — lives in `src/App.tsx` and is never reached. On launch the user will see the default RN demo screen, not the 申论积累 app.

This is the root cause of "app does not render anything meaningful" / "wrong screen".

**Fix (pick one, do both for safety):**

Option A — Re-root the real app at the project root. Move `src/App.tsx` to overwrite the root `App.tsx`, and delete the existing root `App.tsx`:

```bash
# From the project root
mv src/App.tsx App.tsx
```

Then make sure App.tsx's default export is the one with `ThemeProvider`/`NavigationContainer`/`SplashScreen`. If `src/App.tsx` has any sibling imports that would break when moved, also move the accompanying `src/index.js` style bootstrap if needed.

Option B — Minimal-change fix: change `index.js` to import the real app:

```js
// index.js
import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
```

Either way, you also need to make sure `src/` is reachable by Metro. Verify `metro.config.js` (currently uses the default config) — it should already resolve `src/*` automatically, but if the bundle still can't find `./src/App`, add the path to `metro.config.js`:

```js
const path = require('path');
const config = {
  resolver: {
    extraNodeModules: { ... },
    // or watchFolders:
    watchFolders: [path.resolve(__dirname, 'src')],
  },
};
```

---

## BLOCKER #2 — `react-native-mmkv` v3 is incompatible with `newArchEnabled=false`

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\gradle.properties` (line 37: `newArchEnabled=false`)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\package.json` (line 17: `"react-native-mmkv": "^3.3.3"`)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\node_modules\react-native-mmkv\package.json` (`codegenConfig.name = "RNMmkvSpec"`)
- **Supporting evidence:** `android\app\build\generated\rncli\src\main\java\com\facebook\react\PackageList.java` does **not** contain any `com.mrousavy.mmkv` / `MmkvPackage` import — i.e. the previous APK was built with MMKV code stripped out (see `task9-report.md`).

**Problem:** `react-native-mmkv` v3 is a **TurboModule-only** library. It declares:
```json
"codegenConfig": { "name": "RNMmkvSpec", "type": "modules", "jsSrcsDir": "src" }
```
Its native module is registered exclusively through the New Architecture codegen + TurboModule loader. With `newArchEnabled=false` (current `gradle.properties`), the autolinker will not register the MMKV native module. At runtime, `import { MMKV } from 'react-native-mmkv'` in `src\storage\mmkv.ts` (executed at module load time by `new MMKV({ id: 'shenlun-storage' })` on line 4) will throw `Invariant Violation: Module MMKV is not a registered callable module` — that's the crash that occurs *before any UI renders*.

This is consistent with `task9-report.md`, which noted the library had to be temporarily uninstalled to ship a working APK.

**Fix:** Enable New Architecture in `android\gradle.properties`:
```properties
newArchEnabled=true
```
Then rebuild. If MMKV still produces C++ errors in this RN 0.74.5 environment per the earlier report, the more robust fix is to downgrade MMKV to v2 (last v2 is `2.12.2`), which works on the old architecture:
```json
"react-native-mmkv": "2.12.2"
```
and `npm install`. v2 ships a classic `MmkvPackage` that the old-arch autolinker registers.

---

## HIGH #3 — `App.tsx` never wraps the tree in `SafeAreaProvider`

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\App.tsx` (lines 41–51)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\HomeScreen.tsx`, `ReaderScreen.tsx`, `GoldScreen.tsx` (all use `SafeAreaView` from `react-native`, not the `react-native-safe-area-context` version)

**Problem:** Every screen uses `SafeAreaView` from `react-native` (the legacy one). That's actually OK on Android in isolation — it won't crash. But the project also depends on `react-native-safe-area-context` and `react-native-screens` (both TurboModule-aware libraries). With New Arch disabled, `react-native-screens` in particular requires explicit setup:
- `@react-navigation/native-stack` (used in `src\App.tsx`) **needs** `react-native-screens` to be enabled. Without `enableScreens()` it falls back, but more importantly, native-stack calls into the JNI bridge which crashes silently if autolinking skipped it.

This was working in the prior run (PackageList shows `RNScreensPackage` and `SafeAreaContextPackage` are registered), so the autolinking side is fine. The remaining issue is just that there is **no `SafeAreaProvider`** even though the package is installed. Not a blocker on its own (legacy `SafeAreaView` is used), but flagged because the next dev who types `useSafeAreaInsets()` will get a hard crash.

**Fix (recommended, not strictly required):** wrap children in `SafeAreaProvider`:

```tsx
// src/App.tsx
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {showSplash
          ? <SplashScreen onComplete={() => setShowSplash(false)} />
          : <RootNavigator />
        }
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```
Make sure the version installed (`react-native-safe-area-context@^4.14.1`) is compatible with RN 0.74 — 4.14.x is fine on old architecture but if you enable new arch (recommended in fix #2) you'll need ≥4.11.

---

## HIGH #4 — `ReactHost` getter is misnamed in `MainApplication.kt`

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\src\main\java\com\shenlunapp\MainApplication.kt` (line 33)

**Problem:** Not strictly a crash, but `getDefaultReactHost(applicationContext, reactNativeHost)` is the **old-arch** bridge-host factory. The `ReactHost` API is used **only** when the New Architecture is enabled. With `newArchEnabled=false` (current setting), this getter is dead code that the OS still calls in some lifecycle paths — but more dangerously, if you flip `newArchEnabled=true` to fix #2, you must verify this signature matches your RN version. In RN 0.74.5, the call is `getDefaultReactHost(applicationContext, reactNativeHost, /* jsMainModulePath */)` — but only required when using `ReactHost`. Under the default arch (`ReactNativeHost`), this property is fine but unnecessary.

**Fix:** Either keep it as-is (correct for old arch), or if you enable new arch, also override `getJSMainModuleName()` consistently. Given the current setting (`newArchEnabled=false`), this is **not** a blocker today — flagged HIGH only because fixing #2 changes the meaning of this file. If `newArchEnabled=false` stays, you can additionally delete the `reactHost` override to avoid ambiguity:

```kotlin
// Remove these three imports and the override when on old arch:
import com.facebook.react.ReactHost
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
// and
override val reactHost: ReactHost
  get() = getDefaultReactHost(applicationContext, reactNativeHost)
```

---

## MEDIUM #5 — Release builds ship with debug signing key

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\build.gradle` (lines 97–103)

**Problem:** The release block uses `signingConfig signingConfigs.debug`, so any release APK is signed with the well-known debug key. Two issues: (a) Google Play will reject it; (b) any device with the previously-installed debug build (signed with the same key) won't be cleanly upgradeable to a release build that is signed with a different key. Not a startup crash — won't prevent opening the APK — so MEDIUM.

**Fix (when you go to production):** generate your own keystore and replace lines 97–100:
```gradle
release {
    signingConfig signingConfigs.release   // declare a 'release' signingConfig with your keystore
    minifyEnabled true
    proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
}
```

---

## MEDIUM #6 — ThemeProvider is missing in the root `App.tsx` even after fix #1 if you don't pick Option A

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\App.tsx` (lines 58–97)

**Problem:** If you only fix BLOCKER #1 by editing `index.js` to import `./src/App`, then the root `App.tsx` is dead code and can stay as-is. But if you do Option A (move `src/App.tsx` over `App.tsx`), make sure the new root `App.tsx` actually exports the component that the rest of the app expects (a single default export — `export default function App()` — with `ThemeProvider` and `NavigationContainer` wrapping the screen tree). Otherwise, switching only the import will not result in anything being registered. This is more of a verification step than a separate defect.

**Fix:** As part of the move in #1, delete the existing root `App.tsx` first, then `mv src/App.tsx App.tsx`, then run `npx tsc --noEmit` to ensure it still imports cleanly.

---

## LOW #7 — `package.json` devDependency declares `@types/react-native-vector-icons` but the runtime import is the JS package

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\package.json` (line 21, line 32)
- **Files using icons:** none currently — `ToolBar.tsx` uses Unicode `label.charAt(0)` from Chinese labels. No `import` from `react-native-vector-icons` was found anywhere in `src\`.

**Problem:** No crash. Just dead config. The vector-icons gradle script (`apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")` in `app\build.gradle`) is included even though icons aren't used at runtime. That's fine because copying fonts to assets is harmless.

**Fix:** none required for startup. If you later decide to drop the package, remove both line 21 (`dependencies`) and line 32 (`devDependencies`) and the `apply from: ".../fonts.gradle"` line from `app\build.gradle`.

---

## Items verified as CORRECT (no action needed)

- `MainActivity.kt` extends `ReactActivity`, returns `mainComponentName = "ShenlunApp"` which matches `app.json` `"name": "ShenlunApp"`.
- `AndroidManifest.xml` declares `MainActivity` with the launcher intent filter and `android:exported="true"` (correct for Android 12+). `INTERNET` permission is declared.
- `applicationId "com.shenlunapp"` in `app\build.gradle` matches the Kotlin package directory `java/com/shenlunapp/` and `namespace` setting.
- Hermes is enabled (`hermesEnabled=true` in `gradle.properties`) — consistent with RN 0.74.5 default.
- Java 17 toolchain configured; compileSdk 34, targetSdk 34, minSdk 23 — all valid for RN 0.74.
- `index.js` uses `import` (ESM), `AppRegistry.registerComponent` is called once with `appName` from `app.json`. Correct pattern.
- `App.tsx` (root) does `export default App;` correctly.
- `ThemeContext.tsx` provider correctly wraps `children`; the `useTheme` guard throws if used outside provider.
- `NavigationContainer` is used inside `RootNavigator`, which is inside `ThemeProvider`.

---

## Summary

| # | Severity | What | Where |
|---|----------|------|-------|
| 1 | BLOCKER | `index.js` registers the RN template `App` instead of `src/App` | `index.js:6`, `App.tsx` (root), `src/App.tsx` (real app) |
| 2 | BLOCKER | `react-native-mmkv` v3 requires New Arch but `newArchEnabled=false` | `gradle.properties:37`, `package.json:17` |
| 3 | HIGH | `SafeAreaProvider` not wrapping the app | `src/App.tsx:41` |
| 4 | HIGH | `reactHost` getter unnecessary on old arch (cleanup) | `MainApplication.kt:33` |
| 5 | MEDIUM | Release builds use debug signing key | `app/build.gradle:97-100` |
| 6 | MEDIUM | Verify `App.tsx` swap is correct after BLOCKER #1 fix | root `App.tsx` |
| 7 | LOW | Unused vector-icons dependency | `package.json:21,32`, `app/build.gradle:125` |

**The two BLOCKERs (#1 and #2) account for "APK won't open / won't render anything / crashes at first launch".** Fix them in order — first make `index.js` register the correct component (#1), then resolve the MMKV/Native-Arch mismatch (#2), then rebuild the APK.
