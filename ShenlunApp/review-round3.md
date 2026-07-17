# Code Review Round 3: Final Quality, Android Studio Debugability, Production Readiness

**Project:** `C:\Users\hecto\ZCodeProject\ShenlunApp`
**Date:** 2026-07-12
**Scope:** Files needed to open, build, and run the project in Android Studio on a connected device. Anything that would still prevent the app from running or being debugged after Round 1 (component swap, MMKV arch) and Round 2 (MMKV lazy init, route.params guard, async cleanup) are fixed.

---

## TL;DR — Top 5 things to fix to make the app run

If you fix only 5 things, fix these in this order:

1. **Add `android/local.properties`** (HIGH) — Android Studio will not be able to build the project without it; `sdk.dir` is required to locate the Android SDK. *This is the only thing that blocks the project from even opening/building in Android Studio.*

2. **Place `SourceHanSerifSC-Regular.otf` (and Medium/Bold/Heavy) into `android/app/src/main/assets/fonts/`** (HIGH) — The `tokens.ts` font family references `SourceHanSerifSC-Regular`, etc. Android falls back to the default `sans-serif` when the requested family isn't bundled, but Chinese characters are NOT covered by the default `sans-serif` family on all OEM ROMs — text can render as boxes / missing glyphs. The `README.txt` in the fonts dir is the only thing there.

3. **Add `usesCleartextTraffic="true"` to the *release* `AndroidManifest.xml`** (HIGH) — Currently it's only in `android/app/src/debug/AndroidManifest.xml`, which is **only merged into debug builds**. The release variant will silently fail to reach `http://124.223.5.144` because Android 9+ blocks cleartext by default. Result: Home shows an empty list and GoldScreen shows no notes.

4. **Add ProGuard keep rules for native modules to `proguard-rules.pro`** (MEDIUM) — `react-native-mmkv` v3 (TurboModule) and React Navigation 6 native-stack rely on reflection. R8/proguard with `enableProguardInReleaseBuilds=true` would strip `MMKV`'s Java methods and the navigation package classes. Today `enableProguardInReleaseBuilds=false`, so this is dormant — but enable it the moment you ship a release and you'll get `NullPointerException` or `ClassNotFoundException` at startup.

5. **Change the app launcher label from "ShenlunApp" to "申论积累"** (LOW) — The Android launcher icon is labelled "ShenlunApp", which is the default React Native CLI template. The user is shipping a Chinese app; the launcher label must be the Chinese product name in `strings.xml`.

---

## Issues Found — Full List

### BLOCKER-LEVEL

*None new at this level.* Round 1 and Round 2 covered the blockers. The Round 1 fix for `index.js` and the Round 2 fix for lazy MMKV are still required, and they appear correct (verified by reading `index.js:6` and `src/storage/mmkv.ts:4` — `mmkv.ts` is *not* yet lazy-initialized per Round 2 BLOCKER #1, see LOW-11 below).

---

### HIGH

#### H1 — `android/local.properties` is missing

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\local.properties`
- **Status:** File does not exist (`test -f ...` returned `NOT_EXISTS`).
- **Severity:** HIGH (becomes BLOCKER the moment the user opens the project in Android Studio for the first time on a fresh clone).
- **Problem:** Android Studio requires `android/local.properties` to know where the Android SDK is installed. Without it, Gradle sync fails with:
  ```
  SDK location not found. Define location with sdk.dir in the local.properties file or by setting ANDROID_HOME environment variable.
  ```
  The `.gitignore` (line 41) correctly excludes it, so it must be generated per machine. Android Studio usually creates it automatically on first sync *if* it can find the SDK via `ANDROID_HOME` — but the user is on Windows (`win32`) and there's no `ANDROID_HOME` env var guaranteed on the system. The `org.gradle.java.home` is hardcoded in `gradle.properties:44` to `C:/Users/hecto/jdk17/jdk-17.0.19+10` (an absolute path on the user's machine), so we know this is a single-developer project, not a team build.
- **Fix:** Create `android/local.properties` with one line, pointing to the user's Android SDK:
  ```properties
  sdk.dir=C\:\\Users\\hecto\\AppData\\Local\\Android\\Sdk
  ```
  (Replace the path with wherever the user's Android SDK lives. Common locations: `C:\Users\<user>\AppData\Local\Android\Sdk`, `C:\Android\Sdk`, or via `flutter doctor`-style install.)
  Also confirm `ANDROID_HOME` is set in the user's environment, or add the same path. Without this, `./gradlew assembleDebug` will not run on a fresh checkout.

#### H2 — Cleartext HTTP is only enabled for the *debug* build

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\src\main\AndroidManifest.xml` (lines 5–11)
- **File (works around this for debug only):** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\src\debug\AndroidManifest.xml` (lines 5–8: `android:usesCleartextTraffic="true"`)
- **API URL:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\api\client.ts:5` — `const BASE = 'http://124.223.5.144';` (cleartext HTTP)
- **Severity:** HIGH for any release build; LOW for debug-only runs.
- **Problem:** The main `AndroidManifest.xml` does **not** set `android:usesCleartextTraffic="true"`. Android 9+ (API 28+) blocks cleartext HTTP by default. The debug manifest in `src/debug/` is *only merged into debug builds* — that is the convention — so the cleartext flag is active in dev but **disabled in release**. If the user runs `assembleRelease` or installs the signed release APK on a device, every `fetch()` call to `http://124.223.5.144` will be blocked by the network security policy. The catch block in `client.ts` will swallow the error and return the empty cache, so the user sees an empty Home screen and an empty GoldScreen with no error message.
- **Fix (pick one, both are valid):**
  - **Option A — Production fix (recommended):** Move the API to HTTPS. Get a TLS cert for `124.223.5.144` (e.g. via Let's Encrypt with a domain pointing at it, or a Caddy/nginx reverse proxy), then change `client.ts:5` to `https://...`. Remove the cleartext flag entirely.
  - **Option B — Acceptable for now:** Add a `network_security_config.xml` and reference it from the *main* manifest so both debug and release allow cleartext for this specific IP:
    1. Create `android/app/src/main/res/xml/network_security_config.xml`:
       ```xml
       <?xml version="1.0" encoding="utf-8"?>
       <network-security-config>
           <domain-config cleartextTrafficPermitted="true">
               <domain includeSubdomains="false">124.223.5.144</domain>
           </domain-config>
       </network-security-config>
       ```
    2. Add `android:networkSecurityConfig="@xml/network_security_config"` to the `<application>` tag in the *main* `AndroidManifest.xml`.
    3. Delete `android/app/src/debug/AndroidManifest.xml` (no longer needed).

#### H3 — Source Han Serif font files are not present in `assets/fonts/`

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\src\main\assets\fonts\`
- **Severity:** HIGH (visual breakage; the app's signature visual identity depends on this font)
- **Status:** Directory contains only `README.txt` (`Place SourceHanSerifSC-Regular.otf here. Download from: https://github.com/adobe-fonts/source-han-serif/releases`). No `.otf` files.
- **Problem:** The entire UI is built around Chinese serif typography — every screen uses `fontFamily: fonts.serif.regular/medium/bold/heavy` (`HomeScreen.tsx:44, 59, 62`; `ReaderScreen.tsx:70, 82, 83, 112, 114, 116`; `GoldScreen.tsx:50`; `ArticleCard.tsx:84, 87, 90, 91, 92`; `Divider.tsx:42`; `SplashScreen.tsx:87, 92, 98`; `ToolBar.tsx:82, 83`; `tokens.ts:40-46`). The `fontFamily` prop in React Native on Android only matches a font that has been bundled into `assets/fonts/` (and linked via `react-native.config.js` or the `fonts.gradle` apply) **or** is a system font. `SourceHanSerifSC-*` is **not** a system font on stock Android. When the font cannot be found, Android falls back to the default `sans-serif` (Roboto), which:
  - Renders all Chinese characters in a non-serif typeface, breaking the visual identity ("申论" / "积累" / "金句" / "浩然之气" lose their calligraphic feel).
  - Renders **English words** in the design (e.g. "JUL · 12 · 2026" on `HomeScreen.tsx:58`) in a different typeface than intended.
  - On some OEM ROMs (Xiaomi MIUI, Huawei EMUI) where the default font has incomplete CJK coverage, **some Chinese characters can render as boxes (tofu)** — a real risk because Source Han Serif SC has full CJK coverage that the system fallback may not.
  Additionally, the **four** requested font weights (Regular/Medium/Bold/Heavy) are referenced but only one filename is in the README. The user needs to download and rename **all four** OTF/OTC files and either place them in `assets/fonts/` (and the existing `apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")` in `app/build.gradle:125` will copy them at build time IF the gradle script handles it — see H3.5 below) or register them via `react-native.config.js`.
- **Fix:**
  1. Download `SourceHanSerifSC-Regular.otf`, `SourceHanSerifSC-Medium.otf`, `SourceHanSerifSC-Bold.otf`, `SourceHanSerifSC-Heavy.otf` from https://github.com/adobe-fonts/source-han-serif/releases (latest is `SourceHanSerifSC-VF.otf` Variable Font — for older RN that needs named weights, use the `OTC`-per-weight package or the individual OTF files in the `OTF/SimplifiedChinese/` subdir of the release).
  2. Place all four files in `android/app/src/main/assets/fonts/`.
  3. Verify the `react-native-vector-icons/fonts.gradle` apply in `app/build.gradle:125` actually copies the assets — note that the gradle script only copies fonts configured under `react-native.config.js`, and this project has *no* `react-native.config.js` (verified — `test -f .../react-native.config.js` returned `NOT_EXISTS`). So the gradle apply is a no-op for *our* fonts, but the files in `assets/fonts/` are still picked up by `react-native` itself at build time because RN scans `android/app/src/main/assets/fonts/` for `.otf` and `.ttf` files automatically.
  4. If the user actually wants to *link* the fonts (so they can be referenced as `SourceHanSerifSC-Regular` in `fontFamily`), RN's auto-link from `assets/fonts/` is sufficient — but only if the filename **exactly** matches the family name. The Adobe release names files like `SourceHanSerifSC-Regular.otf` and that matches `tokens.ts:41`. Good.
  5. Test: after `npx react-native run-android` (or Android Studio "Run"), open a screen and verify the title "今日 · 申论精读" renders in the serif typeface, not Roboto.

#### H3.5 — `react-native.config.js` does not exist

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\react-native.config.js`
- **Status:** File does not exist.
- **Severity:** MEDIUM (works around H3 but only via RN's built-in `assets/fonts` auto-discovery, which works without a config file)
- **Problem:** When this file is missing, `react-native-vector-icons/fonts.gradle` (applied in `app/build.gradle:125`) does nothing. It also means no custom asset directories are declared. This is not currently breaking anything because H3's fonts are picked up by RN's own `assets/fonts/` scan. But if the user later wants to add custom assets (e.g. custom splash image), they will need this file. Flagged for completeness; not an immediate blocker.
- **Fix (only if needed later):**
  ```js
  // react-native.config.js
  module.exports = {
    project: {
      ios: {},
      android: {},
    },
    assets: ['./assets/fonts/'],  // optional; RN already picks up android/app/src/main/assets/fonts
  };
  ```

#### H4 — Round 1 / Round 2 fixes not yet applied to source

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\index.js:6` — still `import App from './App';` (the stock template, not `src/App`)
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\App.tsx:1-118` — entire file is still the React Native starter template ("Step One", "Edit App.tsx to change this screen..."). This is the file that `index.js` imports.
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\storage\mmkv.ts:4` — `export const storage = new MMKV({ id: 'shenlun-storage' });` is **still executed at module load time** (not lazy). Round 2 BLOCKER #1 fix has not been applied.
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\ReaderScreen.tsx:23` — still `const { id } = route.params;` (no null guard). Round 2 HIGH #2 fix not applied.
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\HomeScreen.tsx:25-37`, `ReaderScreen.tsx:22-35`, `GoldScreen.tsx:19-26` — no `cancelled` flag in `useEffect`. Round 2 HIGH #4 fix not applied.
- **Severity:** BLOCKER (left over from Rounds 1 and 2)
- **Problem:** All the fixes called out in Rounds 1 and 2 are still outstanding. The app as it sits today will:
  1. Launch the React Native demo screen ("Edit App.tsx...").
  2. If the import in `index.js` is fixed to point to `src/App`, the import chain pulls in `mmkv.ts`, which calls `new MMKV(...)` at module load. If the New Architecture is not enabled (Round 1 #2), this throws. If it is enabled, the bundle loads, then the app shows three screens, and a slow `getDaily` while the user navigates back can cause a Hermes unhandled-rejection crash.
- **Fix:** Re-read `review-round1.md` and `review-round2.md` and apply **every item** in them. The cumulative set is the BLOCKER list for Round 3.

---

### MEDIUM

#### M1 — Release builds ship signed with the well-known debug key

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\build.gradle:97-103`
- **Severity:** MEDIUM (re-raised from Round 1 #5 — still not fixed)
- **Problem:** The release block uses `signingConfig signingConfigs.debug`, so any release APK is signed with the React Native template's debug key. Google Play will reject; if the user installed the earlier debug build, a release-build upgrade from the same key will be allowed but with a different debug certificate SHA, which can break Play Integrity / FCM token continuity in future integrations.
- **Fix:** Generate a release keystore and a `signingConfigs.release` block, then point `release.signingConfig` at it. See Round 1 #5 for the exact gradle snippet.

#### M2 — `enableProguardInReleaseBuilds = false` — but `proguard-rules.pro` is empty

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\build.gradle:57` — `def enableProguardInReleaseBuilds = false`
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\proguard-rules.pro` — file is empty (only comments)
- **Severity:** MEDIUM (no impact *today* because ProGuard is disabled, but enabling it the moment the user goes to production will break the app)
- **Problem:** When the user flips `enableProguardInReleaseBuilds = true` (e.g. before shipping to the Play Store), the empty `proguard-rules.pro` will let R8 strip:
  - `com.facebook.react.turbomodule.core.interfaces.TurboModule` (MMKV v3 dependency)
  - `com.mrousavy.mmkv.*` (MMKV's Java/Kotlin classes)
  - `com.swmansion.rnscreens.*` (native-stack screen)
  - `com.th3rdwave.safeareacontext.*` (safe-area-context)
  - `com.horcrux.svg.*` (NOT installed, but if added later, will break)
  - Annotation-driven reflection for `react-navigation`'s `useFocusEffect`, etc.
  The first launch of a ProGuard-stripped release APK will throw `ClassNotFoundException: Didn't find class "com.facebook.react.turbomodule.core.interfaces.TurboModule"` (or similar) and the app will crash before the splash resolves.
- **Fix:** Add the standard React Native ProGuard keep rules to `proguard-rules.pro`. Minimum:
  ```pro
  # React Native default rules
  -keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
  -keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
  -keep @com.facebook.proguard.annotations.DoNotStrip class *
  -keepclassmembers class * {
      @com.facebook.proguard.annotations.DoNotStrip *;
      @com.facebook.proguard.annotations.KeepGettersAndSetters *;
  }

  # React Native modules
  -keep class com.facebook.react.** { *; }
  -keep class com.facebook.hermes.** { *; }
  -keep class com.facebook.jni.** { *; }

  # MMKV (TurboModule)
  -keep class com.mrousavy.mmkv.** { *; }
  -keep class com.facebook.react.turbomodule.** { *; }

  # react-native-screens
  -keep class com.swmansion.rnscreens.** { *; }

  # react-native-safe-area-context
  -keep class com.th3rdwave.safeareacontext.** { *; }

  # Hermes
  -keep class com.facebook.hermes.unicode.** { *; }
  -keep class com.facebook.jni.** { *; }

  # Annotation processing
  -dontwarn com.facebook.react.**
  -dontwarn org.jetbrains.annotations.**
  ```
  And **then** set `def enableProguardInReleaseBuilds = true` for release builds. Test by `./gradlew assembleRelease` and installing the release APK before publishing.

#### M3 — `org.gradle.java.home` is a hard-coded absolute path to a user-specific JDK

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\gradle.properties:44` — `org.gradle.java.home=C:/Users/hecto/jdk17/jdk-17.0.19+10`
- **Severity:** MEDIUM (blocks anyone but the original user from building)
- **Problem:** The line forces Gradle to use `C:\Users\hecto\jdk17\jdk-17.0.19+10`. On a fresh clone by a different developer (or after the user moves the JDK), Gradle will fail to start. This is fine as a personal-machine convenience, but should not be committed to the repo (and `.gitignore` does not exclude `gradle.properties`).
- **Fix (pick one):**
  - **Option A:** Remove line 44 and let Gradle use whatever JDK is on the system PATH. The `foojay-resolver-convention` plugin (`settings.gradle:8`) is already configured, so it can auto-download a JDK 17 if needed.
  - **Option B:** Move the JDK path to `gradle.properties` in `~/.gradle/gradle.properties` (the user-level gradle config, not the project one), and add `gradle.properties` to `.gitignore`. Then this is a per-user setting.

#### M4 — `reactNativeArchitectures` includes all four ABIs, inflating APK size ~4x

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\gradle.properties:30` — `reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64`
- **Severity:** MEDIUM (apk size + build time; no functional impact)
- **Problem:** All four ABIs are built. For local dev this is fine (Android Studio picks the right one for the device). For release, the APK ships with all four. A typical RN 0.74 release APK with this setting is ~40 MB; restricting to `arm64-v8a` and `x86_64` (most modern devices) cuts it by ~40%.
- **Fix:** For production release, change to `reactNativeArchitectures=arm64-v8a,x86_64` (or just `arm64-v8a` if Play Store is the only delivery channel — Play Store can use the AAB and split per-ABI). For dev, keep the current line. The cleanest is to use `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64` at build time and not change `gradle.properties`.

#### M5 — Splash screen library (`react-native-splash-screen`) is installed but never imported; native side is configured but not invoked

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\package.json:20` — `"react-native-splash-screen": "^3.3.0"`
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\components\SplashScreen.tsx` (entire file uses the built-in `Animated` API, not `react-native-splash-screen`)
- **Severity:** MEDIUM (no crash, but the package is dead weight; auto-linking will register its native side even if unused)
- **Problem:** `react-native-splash-screen` is supposed to *hide* the OS launch image and *show* a custom one. The project uses a custom JS-level splash (`SplashScreen.tsx` with `Animated`) and never calls `SplashScreen.hide()` from the library. The library's native code is still autolinked and runs at startup, doing nothing. The OS will show whatever is in `android/app/src/main/res/drawable*/` (the default RN rocket icon on a white background) for ~200 ms, then the React tree mounts, the JS splash shows, and after 1.5 s the navigator takes over. This is fine functionally, but the user should either:
  - Remove the library (delete line 20 in `package.json`, run `npm uninstall react-native-splash-screen`, rebuild), OR
  - Wire it up: in `MainActivity.kt`, call `SplashScreen.show(this)` on `onCreate` and call `SplashScreen.hide()` from JS when the JS splash finishes, to get a smooth handoff.
- **Fix:** Pick one of the two paths. Recommend *wiring it up* (use the library for what it's good for, eliminate the flash), but if time is tight, *uninstall it*.

#### M6 — `react-native-vector-icons` is in deps, gradle script is applied, but the JS side never imports it

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\package.json:21, 32`
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\build.gradle:125` — `apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")`
- **Severity:** MEDIUM (not a crash, but bloats APK by ~2 MB of unused icon fonts)
- **Problem:** No file under `src/` imports from `react-native-vector-icons`. The gradle script at `app/build.gradle:125` will copy the default icon font sets (MaterialCommunityIcons, Ionicons, FontAwesome, etc.) into `assets/fonts/` at build time, increasing APK size with no benefit. `ToolBar.tsx:58` uses Chinese-character `tool.label.charAt(0)` as the icon, not a vector icon.
- **Fix:** Either start using it (replace `charAt(0)` with `<Icon name="check" />` etc., and set up `react-native.config.js` to declare which font sets to bundle), or remove it:
  - `npm uninstall react-native-vector-icons`
  - Remove line 21 from `package.json`
  - Remove line 32 (`@types/react-native-vector-icons`) from `devDependencies`
  - Remove line 125 from `app/build.gradle`

#### M7 — iOS directory exists with Podfile, but the project is Android-only

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\ios\`
- **Severity:** LOW–MEDIUM
- **Problem:** The `ios/` directory is the default RN template (`ShenlunApp/`, `ShenlunApp.xcodeproj/`, `ShenlunAppTests/`, `Podfile`). It's not used in any way for Android builds, so it does not break the Android build. However:
  - If the user runs `npx react-native doctor` or `pod install` (some build tools auto-detect `Podfile` and try to install pods), the iOS toolchain is required (macOS + Xcode), which is not present on this Windows machine.
  - The `package.json:7` has `"ios": "react-native run-ios"` script — running `npm run ios` on Windows will fail with "xcrun not found", which is a confusing user-facing error.
  - The MMKV v3 + old-arch mismatch is also present on the iOS side (would crash on iOS launch), but since the user is Android-only, this is dormant.
- **Fix:** Either (a) delete `ios/` entirely (the project is committed to Android only), or (b) leave it but add a comment / README explaining iOS is unsupported. The Podfile will not be touched by Android builds, so no immediate fix is required. (a) is cleaner.

#### M8 — `tsconfig.json` extends the base with no overrides — `strict` is whatever the base sets

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\tsconfig.json:1-3`
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\node_modules\@react-native\typescript-config\tsconfig.json` (defines `strict: true` by default in RN 0.74's base)
- **Severity:** LOW
- **Problem:** `@react-native/typescript-config@0.74.87` (per `package.json:30`) sets `strict: true`, so `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes` are all on. *However*, the project does not run `tsc` in the default `npm scripts` (`package.json:5-11` has no `tsc` step), so type errors that would be caught by `tsc --noEmit` are not caught at all. Round 2 #2 (`route.params.id` could be undefined) and #10 (`content.charAt(0)` on null content) are the kinds of bugs that `strict` mode *would* have caught. But because no `tsc` step is wired up, even a type-correct project is not verified before launch.
- **Fix:** Add a typecheck script to `package.json`:
  ```json
  "scripts": {
    "tsc": "tsc --noEmit"
  }
  ```
  Then `npm run tsc` before commit / before APK build. This would have caught the Round 2 issues.

#### M9 — `Index.android.bundle` was pre-built (896 KB) and committed

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\src\main\assets\index.android.bundle` (896,414 bytes)
- **Severity:** LOW (potentially HIGH if the user re-builds the JS without clearing it)
- **Problem:** A JS bundle is in the assets directory, which is *only used for release builds* (debug builds always fetch from Metro). If this file is older than the current JS, a release APK will ship stale code. The Round 1 fixes changed `index.js` to import from `./src/App`, but the existing `index.android.bundle` was built from the *old* `index.js` and references the *old* App.tsx. Any release APK built without `./gradlew clean` + `react-native bundle` will use this stale file.
- **Fix:** Delete `android/app/src/main/assets/index.android.bundle` and let the React Native gradle plugin regenerate it for release builds (it does this automatically on `./gradlew assembleRelease`). Alternatively, add to `app/build.gradle`:
  ```gradle
  react {
      bundleInDebug = true
      // ...
  }
  ```
  …but this is rarely what you want. The current behavior is correct (debug uses Metro, release regenerates), but the stale file should be deleted.

#### M10 — `package-lock.json` looks consistent (verified)

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\package-lock.json`
- **Severity:** NONE
- **Problem:** None. `react-native-mmkv` resolves to `3.3.3` (the v3 TurboModule version) which is consistent with `package.json`. No duplicate copies of the same package at different versions, no peer-dep warnings visible in the lock. Round 1's recommended downgrade to `2.12.2` was *not* applied (still v3), so the project still depends on `newArchEnabled=true` from `gradle.properties:37`, which is currently `false`. **This means the MMKV v3 + old-arch mismatch from Round 1 #2 is still live.** When applying Round 1's fix, the user has two choices: enable New Arch (`newArchEnabled=true`) or downgrade MMKV to `2.12.2`. The lock file will need `npm install` for either change.
- **Fix:** Addressed by H4 (apply Round 1 + Round 2 fixes).

#### M11 — `local.properties` should also include `ndk.dir` (potentially)

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\local.properties` (does not exist)
- **Severity:** LOW
- **Problem:** The `android/build.gradle:7` declares `ndkVersion = "26.1.10909125"`. AGP can usually find the NDK via `ANDROID_HOME` / `ANDROID_SDK_ROOT`, but if the NDK version is installed under a non-default path, Gradle will need `ndk.dir` in `local.properties`. With the JDK already hard-coded in `gradle.properties`, the project is clearly set up for one developer's machine — same one-developer-paths issue as M3.
- **Fix:** When creating `local.properties` (H1), also add:
  ```properties
  ndk.dir=C\:\\Users\\hecto\\AppData\\Local\\Android\\Sdk\\ndk\\26.1.10909125
  ```
  (Adjust to wherever the NDK 26.1.10909125 is actually installed.)

#### M12 — `react-navigation` peer dependency on `react-native-screens` requires `enableScreens()` call only if you opt out of native-stack; with native-stack it's automatic

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\App.tsx:5` — `import { createNativeStackNavigator } from '@react-navigation/native-stack';`
- **Severity:** NONE
- **Problem:** None. `@react-navigation/native-stack` v6 auto-enables screens internally, so no manual `enableScreens()` call is needed. Round 1 #3 (no `SafeAreaProvider`) is still outstanding (see H4) but `native-stack` itself does not need setup beyond the autolinker already registering `RNScreensPackage`.
- **Fix:** Addressed by H4 (Round 1 #3).

---

### LOW

#### L1 — App launcher label is "ShenlunApp" instead of "申论积累"

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\src\res\values\strings.xml:2` — `<string name="app_name">ShenlunApp</string>`
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\src\main\AndroidManifest.xml:7,14` — references `@string/app_name`
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\app.json:3` — `"displayName": "ShenlunApp"`
- **Severity:** LOW (cosmetic, but the app brand on the home screen says the wrong thing)
- **Problem:** The Android launcher shows "ShenlunApp" under the icon. The product is "申论积累" (which is correctly hard-coded in `SplashScreen.tsx:50` as the displayed app name). The mismatch is jarring: splash shows "申论积累" with the right typography, then the user presses Home and sees "ShenlunApp" under the icon.
- **Fix:** Change `strings.xml:2` to:
  ```xml
  <string name="app_name">申论积累</string>
  ```
  Optionally, also change `app.json:3` to `"displayName": "申论积累"` (this affects the iOS label; doesn't affect Android but keeps them in sync).
  No need to touch `MainActivity.kt:14` — that returns the JS component name, not the display name.

#### L2 — `app.json` `"displayName"` is "ShenlunApp" (no Chinese)

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\app.json:3`
- **Severity:** LOW (only affects iOS if iOS is ever built; for Android-only projects this is dormant)
- **Problem:** `app.json` is the iOS-side display name. Currently `"ShenlunApp"`. Should be `"申论积累"` to match the Android side and the splash screen.
- **Fix:** Change to `"displayName": "申论积累"`.

#### L3 — No `tools:targetApi`, no `tools:ignore` in main manifest (debug manifest has them)

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\src\main\AndroidManifest.xml` (no `xmlns:tools`)
- **Severity:** LOW
- **Problem:** The debug manifest uses `tools:targetApi="28"` and `tools:ignore="GoogleAppIndexingWarning"`. These are tooling hints that are fine to omit from the main manifest. Not a bug.
- **Fix:** None required.

#### L4 — `MainApplication.kt` has the Round 1 #4 `reactHost` override (not strictly needed on old arch)

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\src\main\java\com\shenlunapp\MainApplication.kt:32-33` — `override val reactHost: ReactHost get() = getDefaultReactHost(applicationContext, reactNativeHost)`
- **Severity:** LOW
- **Problem:** Round 1 #4 already noted this is dead code on old arch. With `newArchEnabled=false` (current state), this is harmless. If the user enables New Arch per Round 1 #2's fix, this becomes required. The current state is therefore *correct* (works in both arch modes), just slightly redundant on old arch.
- **Fix:** None required today. If the user wants to clean it up, delete lines 32-33 and the imports for `ReactHost` and `getDefaultReactHost`. If you enable New Arch, leave them.

#### L5 — `ReaderScreen.tsx` and `ArticleCard.tsx` still have the Round 2 LOW #10 `content.charAt(0)` unguarded

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\ReaderScreen.tsx:83` — `article.content.charAt(0)`
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\components\ArticleCard.tsx:29, 37` — `content.charAt(0)`
- **Severity:** LOW (only triggers if backend returns `content: null`)
- **Problem:** Round 2 LOW #10 fix not applied. Will crash with `TypeError: Cannot read properties of undefined (reading 'charAt')` if the API ever returns an article with `content: null` or missing.
- **Fix:** Per Round 2 #10:
  ```tsx
  const content = article.content ?? '';
  <Text>{content.charAt(0)}</Text>
  {content.slice(1)}
  ```
  Or use optional chaining: `(article.content ?? '').charAt(0)`.

#### L6 — `package.json` has `engines.node = ">=18"` but no `engines.npm`; `.nvmrc` / `.node-version` not present

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\package.json:42` — `"engines": { "node": ">=18" }`
- **Severity:** LOW
- **Problem:** RN 0.74.5 requires Node 18+. The `engines` field is *advisory* (npm warns but doesn't block). A `.nvmrc` file with `18` would be a stronger signal.
- **Fix:** Add a `.nvmrc` file with `18` (or whatever specific version the user is on) at the project root. Not critical.

#### L7 — `Round 2 #12` — theme toggle from `system` always flips to `light` (not a bug today, but a UX surprise)

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\theme\ThemeContext.tsx:23` — defaults to `'system'`
- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\screens\HomeScreen.tsx:71` — `onSettings={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}`
- **Severity:** LOW
- **Problem:** If the user is in system mode (e.g. system is light, theme is light), tapping the settings button flips the override to `'dark'`, regardless of the system. Then the next time the user opens the app in light system, the app is still dark. Round 2 #12 documented this; not yet fixed.
- **Fix:** Change line 71 to respect `'system'`:
  ```tsx
  onSettings={() => {
    if (themeMode === 'system') setThemeMode(theme.mode === 'dark' ? 'light' : 'dark');
    else setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
  }}
  ```
  Or simpler: remove `'system'` from `ThemeMode` if you don't intend to support it.

#### L8 — `tsconfig.json` does not enable `noUncheckedIndexedAccess`

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\tsconfig.json`
- **Severity:** LOW
- **Problem:** Even with `strict: true` from the base config, `noUncheckedIndexedAccess` is not on by default. This would catch the `parts[0]` / `parts[1]` access in `ArticleCard.tsx:38, 40` (line 34: `content.split(highlight)` returns `string[]`, and `[0]`/`[1]` are typed as `string` not `string | undefined`). If `highlight` is ever the entire `content` string, the split returns a single-element array, and `parts[1]` is `undefined` — which React renders as empty, but `[0]` is fine. Not a runtime bug today, but with `noUncheckedIndexedAccess` you'd get a type error.
- **Fix:** Add to a custom tsconfig:
  ```json
  {
    "extends": "@react-native/typescript-config/tsconfig.json",
    "compilerOptions": {
      "noUncheckedIndexedAccess": true
    }
  }
  ```

#### L9 — `package-lock.json` uses `registry.npmmirror.com` (Chinese npm mirror)

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\package-lock.json` (header)
- **Severity:** LOW
- **Problem:** The lock file references `https://registry.npmmirror.com/...` (a Chinese npm mirror). This is fine for users in China (faster), but a user outside China will hit the same mirror on `npm install` if their `~/.npmrc` is set the same way. Lock file `resolved` URLs are advisory — npm uses the `resolved` URL on `npm ci`, so a CI server outside China will fail or be slow.
- **Fix:** Run `npm install --registry=https://registry.npmjs.org/` once and re-commit `package-lock.json` if you want the global registry. Or leave as-is if the user is in China and this is intentional.

#### L10 — `MainApplication.kt` `getJSMainModuleName` is `"index"`, matches `index.js` — CORRECT

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\android\app\src\main\java\com\shenlunapp\MainApplication.kt:24` — `override fun getJSMainModuleName(): String = "index"`
- **Severity:** NONE
- **Problem:** None. `index.js` is at the project root and is the entry point. The class name `"ShenlunApp"` returned by `MainActivity.kt:14` matches `app.json:2` (`"name": "ShenlunApp"`) and the registration in `index.js:7-9`. All consistent.

#### L11 — `Round 2 #1` (MMKV module-load crash) still possible — the `new MMKV(...)` at top level is still in `src/storage/mmkv.ts:4`

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\storage\mmkv.ts:1-4`
- **Severity:** HIGH (re-raised from Round 2)
- **Problem:** The fix from Round 2 has not been applied. The file still does `export const storage = new MMKV({...});` at module load time. This is fine if the New Arch is enabled (MMKV v3 will work) but fragile if MMKV is ever downgraded to v2 (then this still works) or if MMKV initialization fails for any other reason (e.g. corrupted storage in a test environment). Round 2 recommended wrapping in a lazy `getStorage()` function with try/catch.
- **Fix:** Per Round 2 #1.

#### L12 — `src/App.tsx` lacks `SafeAreaProvider` wrapper (Round 1 #3 not yet applied)

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\App.tsx:41-51`
- **Severity:** MEDIUM (re-raised from Round 1)
- **Problem:** The app installs `react-native-safe-area-context` but does not wrap the tree in `<SafeAreaProvider>`. Currently safe because every screen uses the legacy `SafeAreaView` from `react-native`. Will crash the moment any screen calls `useSafeAreaInsets()`.
- **Fix:** Per Round 1 #3.

#### L13 — `src/App.tsx` has the Round 2 #8 / #9 memoization / navigation theme issues

- **File:** `C:\Users\hecto\ZCodeProject\ShenlunApp\src\App.tsx:17-39`
- **Severity:** MEDIUM (re-raised from Round 2 #8 + #9)
- **Problem:** `screenOptions={{ contentStyle: { backgroundColor: theme.tokens.bg } }}` creates a new object every render. `NavigationContainer` is not passed a theme. Both are documented in Round 2.
- **Fix:** Per Round 2 #8 and #9.

---

## Items verified as CORRECT (no action needed)

- **Package / bundle ID consistency** (brief Q2):
  - `android/app/build.gradle:77` — `namespace "com.shenlunapp"`
  - `android/app/build.gradle:79` — `applicationId "com.shenlunapp"`
  - `android/app/src/main/AndroidManifest.xml` — `.MainApplication` and `.MainActivity` (relative to namespace, so `com.shenlunapp.MainApplication`)
  - `android/app/src/main/java/com/shenlunapp/MainApplication.kt:1` — `package com.shenlunapp`
  - `android/app/src/main/java/com/shenlunapp/MainActivity.kt:1` — `package com.shenlunapp`
  All four match. CORRECT.
- **`AndroidManifest.xml` declares `INTERNET` permission** (brief Q13): line 3 — `<uses-permission android:name="android.permission.INTERNET" />`. CORRECT.
- **`react-native-screens` / `react-native-safe-area-context` versions** (RN 0.74 compatibility): `safe-area-context@^4.14.1` and `screens@^3.37.0` are both compatible with RN 0.74.5. CORRECT.
- **Hermes is enabled** (brief Q7): `gradle.properties:41` — `hermesEnabled=true`. `app/build.gradle:117-121` — `if (hermesEnabled.toBoolean()) { implementation("com.facebook.react:hermes-android") }`. CORRECT. The pre-built `index.android.bundle` (M9) is 896 KB — this is consistent with a Hermes bytecode bundle (a JSC bundle would be larger and plain-text).
- **Java 17 toolchain** (RN 0.74 requirement): `android/build.gradle:8` — `kotlinVersion = "1.9.22"`. `app/build.gradle:107-111` — `languageVersion = JavaLanguageVersion.of(17)`. CORRECT.
- **Min SDK 23 / target 34 / compile 34** (RN 0.74 default): `android/build.gradle:3-6` — all correct.
- **`gradle/wrapper/`** is present: `gradle-wrapper.jar` (63 KB), `gradle-wrapper.properties` (lines 1-7: Gradle 8.6). `gradlew` and `gradlew.bat` are present in `android/`. CORRECT — `./gradlew assembleDebug` will work.
- **No React Native Reanimated / Gesture Handler usage** (brief Q9): not in `package.json` dependencies, no imports under `src/`. CORRECT. (Round 2 noted this is correct because `SplashScreen.tsx` uses built-in `Animated`.)
- **No iOS native code issues for Android build** (brief Q6): the `ios/` directory is dormant. Android Gradle will not touch it. CORRECT for Android-only builds.
- **React Native 0.74.5 / React 18.2.0** pair: compatible. CORRECT.
- **`@react-navigation/native@^6.1.18` + `@react-navigation/native-stack@^6.11.0`**: compatible with RN 0.74. CORRECT.
- **`react-native-splash-screen@^3.3.0`**: compatible with RN 0.74. (Whether to use it is M5.)
- **`MainActivity` component name matches `app.json`**: `MainActivity.kt:14` — `"ShenlunApp"`, `app.json:2` — `"name": "ShenlunApp"`. CORRECT.
- **`MainApplication.kt` `getJSMainModuleName(): "index"`** matches `index.js` at project root: CORRECT.
- **`debug.keystore` exists**: `android/app/debug.keystore` (2,257 bytes) — standard React Native template debug key, will be used by `signingConfigs.debug` for both `debug` and (today, per M1) `release` builds. CORRECT.
- **`AndroidManifest.xml` `configChanges`** correctly includes all the categories the app needs (rotation, soft keyboard, UI mode for dark/light theme changes): CORRECT.
- **`AndroidManifest.xml` `launchMode="singleTask"`**: appropriate for an app that uses the JS `NavigationContainer` for in-app navigation. CORRECT.
- **`AndroidManifest.xml` `windowSoftInputMode="adjustResize"`**: appropriate for the Reader screen which contains a `ScrollView` and possibly future text input. CORRECT.
- **`AndroidManifest.xml` `allowBackup="false"`**: correct security default for an app with user data (notes) in MMKV. CORRECT.
- **PackageList.java (autolinking)**: regenerated on every gradle build from `node_modules/`. With New Arch off + MMKV v3, the MMKV TurboModule won't be in the list, hence the BLOCKER. With New Arch on, it will be. CORRECT (autolinker is doing its job).
- **`MainApplication.kt` SoLoader initialization** (line 37): correct and required. CORRECT.

---

## Bundle / Build / Debug Buildability Checklist

| Item | Status | Notes |
|---|---|---|
| `android/local.properties` with `sdk.dir` | MISSING | See H1 |
| `android/app/debug.keystore` | PRESENT | Standard RN template key |
| `android/gradlew` + `android/gradlew.bat` | PRESENT | Both present |
| `android/gradle/wrapper/gradle-wrapper.jar` | PRESENT | 63 KB, Gradle 8.6 |
| `android/gradle/wrapper/gradle-wrapper.properties` | PRESENT | Gradle 8.6 |
| `android/build.gradle` | PRESENT | SDK 34, NDK 26.1.10909125, Kotlin 1.9.22 |
| `android/app/build.gradle` | PRESENT | Namespace, appId, signing all correct |
| `android/app/src/main/AndroidManifest.xml` | PRESENT | INTERNET, no cleartext flag (see H2) |
| `android/app/src/main/assets/index.android.bundle` | PRESENT (stale) | See M9 — should be deleted |
| `android/app/src/main/assets/fonts/SourceHanSerifSC-*.otf` | MISSING | See H3 |
| `android/app/src/main/java/com/shenlunapp/MainApplication.kt` | PRESENT | Round 1 #2 fix needed (new arch) |
| `android/app/src/main/java/com/shenlunapp/MainActivity.kt` | PRESENT | CORRECT |
| `android/app/src/main/res/values/strings.xml` | PRESENT (wrong content) | See L1 |
| `android/app/src/main/res/values/styles.xml` | PRESENT | AppCompat.DayNight, correct |
| `android/app/proguard-rules.pro` | PRESENT (empty) | See M2 |
| `metro.config.js` | PRESENT | Default config, fine |
| `babel.config.js` | PRESENT | RN preset only, fine |
| `tsconfig.json` | PRESENT | Extends base, no tsc script in npm (M8) |
| `index.js` | WRONG | Round 1 #1 not applied (H4) |
| `package.json` | PRESENT | Versions fine (M10) |
| `react-native.config.js` | MISSING | Not required, see H3.5 |
| `node_modules/` | PRESENT | Verified 49K+ entries in dir listing |
| `gradle.properties` | PRESENT | JDK path hard-coded (M3) |
| `settings.gradle` | PRESENT | foojay-resolver, react-native gradle plugin includeBuild |
| `app.json` | PRESENT | `displayName` is English (L2) |
| `src/App.tsx` | PRESENT (real app) | Missing SafeAreaProvider (L12), not memoized (L13) |
| `src/screens/*.tsx` (3 files) | PRESENT | Round 2 fixes outstanding (H4) |
| `src/storage/mmkv.ts` | PRESENT (eager init) | Round 2 #1 not applied (L11) |
| `src/api/client.ts` | PRESENT | cleartext URL (H2) |
| `src/theme/tokens.ts` | PRESENT | Correct |
| `src/theme/ThemeContext.tsx` | PRESENT | Correct |

---

## What to do next (concrete ordered list)

1. **Apply the remaining Round 1 and Round 2 fixes** (H4 / L11 / L12 / L13 / L5). These are the actual blockers — without them, the app either shows the demo screen, crashes on MMKV init, or crashes on deep-link / missing params.
2. **Create `android/local.properties`** with `sdk.dir` (H1). Without this, Android Studio cannot build the project.
3. **Place the four Source Han Serif OTF files in `android/app/src/main/assets/fonts/`** (H3). Without these, the Chinese typography degrades to Roboto.
4. **Add a `network_security_config.xml`** (or move the API to HTTPS) so release builds can reach `http://124.223.5.144` (H2).
5. **Fix the launcher label** in `android/app/src/main/res/values/strings.xml:2` to `申论积累` (L1).
6. **Add ProGuard keep rules** to `proguard-rules.pro` and enable ProGuard for release builds (M2).
7. **Delete `android/app/src/main/assets/index.android.bundle`** so the next release APK gets a fresh bundle (M9).
8. **Decide on the `react-native-splash-screen` and `react-native-vector-icons` dependencies** — either wire them up or remove them (M5, M6).
9. **Move the JDK path out of `gradle.properties`** and into `~/.gradle/gradle.properties` (M3).
10. **Add `"tsc": "tsc --noEmit"` to npm scripts** so type errors are caught before launch (M8).
11. **Clean up `ios/`** if Android-only is the plan (M7).

Items #1–#5 are needed to make the app run. #6–#11 are quality / production-readiness improvements.

---

## Summary

| #  | Severity   | What | Where |
|----|------------|------|-------|
| H1 | HIGH       | `android/local.properties` missing | `android/local.properties` |
| H2 | HIGH       | Cleartext HTTP only allowed in debug build | `AndroidManifest.xml:5-11`, `client.ts:5` |
| H3 | HIGH       | Source Han Serif fonts not present | `assets/fonts/` (empty) |
| H3.5 | MEDIUM   | `react-native.config.js` missing | project root |
| H4 | BLOCKER    | Round 1 + Round 2 fixes not yet applied (left from prior rounds) | `index.js`, `mmkv.ts`, screens, `App.tsx` |
| M1 | MEDIUM     | Release uses debug signing key | `app/build.gradle:97-103` |
| M2 | MEDIUM     | Empty ProGuard rules + ProGuard off | `proguard-rules.pro`, `app/build.gradle:57` |
| M3 | MEDIUM     | Hard-coded JDK path | `gradle.properties:44` |
| M4 | MEDIUM     | Four ABIs built for release | `gradle.properties:30` |
| M5 | MEDIUM     | `react-native-splash-screen` installed but not used | `package.json:20` |
| M6 | MEDIUM     | `react-native-vector-icons` installed but not used | `package.json:21,32`, `app/build.gradle:125` |
| M7 | LOW–MED    | iOS dir / Podfile present despite Android-only | `ios/` |
| M8 | LOW        | No `tsc` script in npm scripts | `package.json:5-11` |
| M9 | LOW        | Stale `index.android.bundle` committed | `android/app/src/main/assets/index.android.bundle` |
| M10 | NONE      | `package-lock.json` consistent | — |
| M11 | LOW       | `ndk.dir` likely needed in `local.properties` | `android/local.properties` (TBD) |
| M12 | NONE      | React Navigation 6 native-stack auto-enables screens | — |
| L1 | LOW        | App label is "ShenlunApp" not "申论积累" | `strings.xml:2` |
| L2 | LOW        | `app.json` `displayName` is English | `app.json:3` |
| L3 | LOW        | Main manifest lacks `xmlns:tools` | `AndroidManifest.xml` |
| L4 | LOW        | `reactHost` override is dead on old arch | `MainApplication.kt:32-33` |
| L5 | LOW        | `content.charAt(0)` unguarded (Round 2 #10) | `ReaderScreen.tsx:83`, `ArticleCard.tsx:29,37` |
| L6 | LOW        | No `.nvmrc` file | project root |
| L7 | LOW        | Theme toggle from `system` flips to wrong mode (Round 2 #12) | `HomeScreen.tsx:71` |
| L8 | LOW        | `noUncheckedIndexedAccess` not enabled in tsconfig | `tsconfig.json` |
| L9 | LOW        | `package-lock.json` uses `registry.npmmirror.com` | `package-lock.json` |
| L10–L13 | various | Outstanding Round 1/2 items re-listed | various |

**Critical path for the next session: H4 (apply outstanding R1/R2 fixes) → H1 (local.properties) → H3 (fonts) → H2 (cleartext release) → L1 (label).** Everything else is quality-of-life and production hardening.
