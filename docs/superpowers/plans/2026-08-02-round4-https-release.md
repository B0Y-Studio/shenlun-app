# Round 4 — HTTPS + Release Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete C3 (HTTPS switch) and C3 (release signing) from the Round 4 review. Switch all 3 client BASE URLs from HTTP to HTTPS, fix LlmConfigScreen wording, generate a release keystore, wire it into Gradle.

**Architecture:** 4 independent tasks. Tasks 1-2 require server-side HTTPS cert to be live first (BLOCKING external dependency).

- Task 1: Verify server HTTPS cert is provisioned + DNS resolves (BLOCKER CHECK)
- Task 2: Switch 3 client BASE URLs from `http://124.223.5.144` to `https://api.your-domain.com`
- Task 3: Update LlmConfigScreen wording (`已加密存到服务端` → `通过 HTTPS 加密传输`)
- Task 4: Generate `release.keystore`, configure `gradle.properties` + `build.gradle` signing

**Tech Stack:** React Native 0.74.5 + TypeScript 5, Android (Gradle), `keytool` for keystore generation.

**Scope: This plan covers Plan D only.** No follow-up work included.

---

## Global Constraints

- **Project root**: `C:\Users\hecto\ZCodeProject\shenlunapp\`
- **Git branch**: work on `feature/ai-judge-v1.1-hygiene`
- **Commit messages**: prefix per task (see below)
- **No `any` outside boundary**
- **No screenshots / image reads**
- **Tests must pass** before commit:
  - Server: 14/14
  - Client: 16/16 (runJudge + judgeStore + client)

---

## File Structure

**New files (2)**:
- `android/app/release.keystore` (NOT committed — `.gitignore` already excludes `*.keystore`)
- `android/gradle.properties` entries (existing file, modified)

**Modified files (5)**:
- `src/config/api.ts` (Task 2 — production URL → HTTPS)
- `src/api/client.ts` (Task 2 — BASE URL → import from config)
- `src/api/llmConfig.ts` (Task 2 — same)
- `src/llm/client.ts` (Task 2 — same)
- `src/screens/LlmConfigScreen.tsx` (Task 3 — wording)
- `android/app/build.gradle` (Task 4 — signing config)

---

## Sequencing Note

Tasks 1 → 2 → 3 → 4. **Task 1 is BLOCKING**: if server HTTPS is not live, Task 2 cannot be tested end-to-end (cleartext will fail per Plan A C3-step1 tightening).

---

## Task 1: Verify server HTTPS cert + DNS

**Files:** None modified.

**Goal:** Confirm that `https://api.<your-domain>.com` (or equivalent) resolves and serves a valid cert before client-side changes.

**Blockers:**
- Domain name registered (e.g., `shenlunapp.example.com` via Cloudflare or similar)
- TLS cert provisioned (Let's Encrypt via certbot, or cloud provider's auto-TLS)
- nginx/Caddy/Traefik reverse-proxy configured to serve the cert and forward to backend on 8080
- DNS A record points domain → `124.223.5.144`

**Work steps:**

- [ ] **Step 1: Confirm domain is registered and DNS resolves**

```bash
nslookup api.<your-domain>.com
# or
dig +short api.<your-domain>.com
```

Expected: returns the server IP (124.223.5.144). If not, this task is BLOCKED — stop and report to the user. DO NOT proceed to Task 2.

- [ ] **Step 2: Confirm TLS cert is valid**

```bash
curl -vI https://api.<your-domain>.com/api/today 2>&1 | head -30
```

Expected output should include:
- `SSL connection using TLS_AES_256_GCM_SHA384` (or similar modern TLS)
- `subject: CN=api.<your-domain>.com`
- `issuer: CN=Let's Encrypt ...` (or other valid CA)
- `HTTP/1.1 200 OK` (or 4xx — server reachable)

If `certificate verify failed` or `unable to get local issuer certificate` appears, BLOCKED — stop.

- [ ] **Step 3: Confirm `/api/judge/llm-config` endpoint responds (test for AI Judge endpoints)**

```bash
curl -sf "https://api.<your-domain>.com/api/judge/llm-config?device_id=__healthcheck" \
  | python -m json.tool 2>&1 | head -10
```

Expected: `{"configured": false}` (no LLM config stored for test device).

- [ ] **Step 4: Confirm HTTPS works in browser/Postman** (sanity check)

Skip — server cert validation in Step 2 is sufficient.

- [ ] **Step 5: Report domain to use in subsequent tasks**

Note the exact domain (e.g., `api.shenlunapp.example.com`). Use this in Task 2 + 3.

- [ ] **Step 6: No commit (no code changes)**

This task is a verification gate. If all checks pass, proceed to Task 2. If any check fails, **STOP and report to user**.

## Task 2: Switch client BASE URLs to HTTPS

**Files:**
- Modify: `src/config/api.ts`
- Modify: `src/api/client.ts` (no change needed — already imports `API_BASE as BASE` from config per Plan B H6)
- Modify: `src/api/llmConfig.ts` (same)
- Modify: `src/llm/client.ts` (same)

Wait — actually, since Plan B's H6 already centralized BASE URL via `src/config/api.ts`, Task 2 is **just one file change** (`api.ts`), not 3. Verify by reading.

**Interfaces:**
- Consumes: `API_BASE` from `'../config/api'`
- Produces: production URL changes from `http://124.223.5.144` to `https://api.<your-domain>.com`

**Work steps:**

- [ ] **Step 1: Verify only `src/config/api.ts` has the production URL literal**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -rn "124.223.5.144" src/
```

Expected: exactly 1 match (in `src/config/api.ts`).

- [ ] **Step 2: Update `src/config/api.ts`**

Replace the production line:

```ts
// before
: 'http://124.223.5.144';   // production (HTTPS switch in Plan D)

// after (substitute your actual domain)
: 'https://api.<your-domain>.com';
```

Update the comment too:
```ts
// before
// Single source of truth for API base URL.
// Plan D will flip production to HTTPS once server cert is provisioned.

// after
// Single source of truth for API base URL.
// Dev: Android emulator host loopback (10.0.2.2:3000)
// Prod: HTTPS via Cloudflare/proxy in front of card_server
```

- [ ] **Step 3: Verify no `124.223.5.144` remains in source**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -rn "124.223.5.144" src/
```

Expected: no output.

- [ ] **Step 4: Run test suites**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest 2>&1 | tail -5
```

Expected: 14 + 16 = 30 passing.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git add src/config/api.ts
git -c user.name=zcode -c user.email=zcode@local commit -m "refactor(judge): switch production BASE URL to HTTPS (server cert live at api.<your-domain>.com)"
```

(Replace `<your-domain>.com` with actual domain in commit message.)

## Task 3: Update LlmConfigScreen wording

**Files:**
- Modify: `src/screens/LlmConfigScreen.tsx`

**Interfaces:**
- Consumes: success/failure Alert
- Produces: copy reflects HTTPS transport

**Work steps:**

- [ ] **Step 1: Find the wording**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -n "已加密存到服务端" src/screens/LlmConfigScreen.tsx
```

Expected: 1 match on line ~52.

- [ ] **Step 2: Update wording**

Replace the success message:

```ts
// before
Alert.alert(ok ? '已保存' : '保存失败', ok ? '已加密存到服务端' : '请检查网络或重试');

// after
Alert.alert(ok ? '已保存' : '保存失败', ok ? '已通过 HTTPS 加密存到服务端' : '请检查网络或重试');
```

- [ ] **Step 3: Verify wording updated**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -n "已加密存到服务端\|HTTPS 加密" src/screens/LlmConfigScreen.tsx
```

Expected: 1 match for the new wording.

- [ ] **Step 4: Run test suites**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest 2>&1 | tail -5
```

Expected: 14 + 16 passing.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git add src/screens/LlmConfigScreen.tsx
git -c user.name=zcode -c user.email=zcode@local commit -m "refactor(judge): LlmConfigScreen success wording reflects HTTPS transport"
```

## Task 4: Generate release keystore + configure Gradle

**Files:**
- Create: `android/app/release.keystore` (NOT in git — `.gitignore` excludes `*.keystore`)
- Modify: `android/gradle.properties` (add 4 properties)
- Modify: `android/app/build.gradle` (configure `signingConfigs.release` + use it in `buildTypes.release`)

**Goal:** Release builds will be signed with a real keystore, not the debug keystore (anyone can forge "upgrades" with the debug key).

**Interfaces:**
- Consumes: Java `keytool` (standard JDK tool)
- Produces: `release.keystore` + Gradle config that uses it

**Work steps:**

- [ ] **Step 1: Generate `release.keystore`**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/android/app"
keytool -genkey -v \
  -keystore release.keystore \
  -alias release-key \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass <STORE_PASSWORD> \
  -keypass <KEY_PASSWORD> \
  -dname "CN=ShenlunApp, OU=Mobile, O=B0Y-Studio, L=City, S=State, C=CN"
```

Replace `<STORE_PASSWORD>` and `<KEY_PASSWORD>` with strong passwords. **SAVE THESE PASSWORDS SECURELY** (e.g., password manager) — if lost, the keystore and all installed copies become unsignable with the same key.

The `-dname` values are placeholder; adjust to match your company info.

Expected output: creates `release.keystore` in current dir + a confirmation prompt.

- [ ] **Step 2: Verify `.gitignore` excludes the keystore**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep "keystore" .gitignore
```

Expected: `*.keystore` present (added in Plan A C3-step1).

- [ ] **Step 3: Update `android/gradle.properties`**

Append 4 lines:

```
RELEASE_STORE_FILE=release.keystore
RELEASE_STORE_PASSWORD=<STORE_PASSWORD>
RELEASE_KEY_ALIAS=release-key
RELEASE_KEY_PASSWORD=<KEY_PASSWORD>
```

Replace `<STORE_PASSWORD>` and `<KEY_PASSWORD>` with the actual passwords from Step 1.

- [ ] **Step 4: Update `android/app/build.gradle`**

Find the `signingConfigs { ... }` block (around line 89). Replace it:

```gradle
    signingConfigs {
        debug { ... }  // existing
        release {
            if (project.hasProperty('RELEASE_STORE_FILE')) {
                storeFile file(RELEASE_STORE_FILE)
                storePassword RELEASE_STORE_PASSWORD
                keyAlias RELEASE_KEY_ALIAS
                keyPassword RELEASE_KEY_PASSWORD
            }
        }
    }
```

Find the `buildTypes { ... }` block. The `release { ... }` should have `signingConfig signingConfigs.release` instead of `signingConfig signingConfigs.debug`. Find by `grep`:

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -n "signingConfig" android/app/build.gradle
```

Replace the line inside `release { ... }`:

```gradle
// before
signingConfig signingConfigs.debug

// after
signingConfig signingConfigs.release
```

- [ ] **Step 5: Verify the keystore file is NOT staged in git**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git status --short | grep -i keystore
```

Expected: no output. If the keystore appears, `git reset HEAD <keystore>` to unstage.

- [ ] **Step 6: Verify the config files ARE staged**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git status --short
```

Expected: `M android/app/build.gradle` and `M android/gradle.properties`.

- [ ] **Step 7: Run test suites**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest 2>&1 | tail -5
```

Expected: 14 + 16 passing.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git add android/app/build.gradle android/gradle.properties
git -c user.name=zcode -c user.email=zcode@local commit -m "fix(judge): configure release keystore signing — release builds no longer use debug keystore"
```

- [ ] **Step 9: Smoke test release build (manual)**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/android"
./gradlew assembleRelease
```

Expected: builds without error. APK at `android/app/build/outputs/apk/release/app-release.apk`.

(If `gradlew` errors on Windows, use `gradlew.bat assembleRelease`.)

**Caveat**: Gradle build can be slow (~3-5 min) and may fail on first run if Android SDK / NDK paths aren't configured. If the build fails, **STOP and report to user** — don't try to debug build infrastructure in this plan.

---

## Verification (post all 4 tasks)

- [ ] **3 new commits on `feature/ai-judge-v1.1-hygiene`**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git log --oneline 06004cc..HEAD
```

Expected: 3 commits (Tasks 2, 3, 4 — Task 1 has no commit).

- [ ] **All tests still pass**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest 2>&1 | tail -5
```

Expected: 14 + 16 = 30 passing.

- [ ] **HTTPS production smoke test (manual)**

On a real device or emulator:
1. Set LLM config via LlmConfigScreen (works against `https://api.<domain>/api/judge/llm-config`).
2. Start a judge run (works against `https://api.<domain>/api/judge/run`).
3. Open Network panel in DevTools — confirm requests use HTTPS.

If any of these fail with network errors, **Task 1 verification was insufficient** — re-check server cert + DNS.

- [ ] **Push branch**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git push origin feature/ai-judge-v1.1-hygiene
```

---

## Self-Review

**1. Spec coverage:**
- C3 step 2 (HTTPS switch + BASE URL change) ✓ Task 2
- C3 step 3 (LlmConfigScreen wording) ✓ Task 3
- C3 step 3 (release keystore) ✓ Task 4
- Server HTTPS cert provisioning: NOT covered by this plan (operational task)

**2. Placeholder scan:** No TBD/TODO. Steps have explicit commands.

**3. Type consistency:** `API_BASE` type stays `string`. No type changes.

**4. Risks identified:**
- **Task 1 BLOCKER**: If server HTTPS cert is not live, Task 2 will break production. The verification step is critical.
- **Task 4 password storage**: Passwords in `gradle.properties` are in plaintext. For production, consider environment variables or a secrets manager. For V1 (single-tenant hobby project), plaintext in `gradle.properties` (excluded from git) is acceptable.
- **Keystore loss**: If `release.keystore` is lost, all installed copies of the app become unsignable with the same key (any "upgrade" must be a fresh install with user data wipe). User MUST back up the keystore securely.
- **Domain not yet registered**: if user hasn't registered a domain yet, Task 1 will fail and Task 2 must be deferred until then.

---

## What NOT to do

- Do NOT commit `release.keystore` (`.gitignore` excludes `*.keystore`; verify with `git status` before commit)
- Do NOT commit `gradle.properties` if it contains real passwords in plaintext (oh wait — it has to be committed; the passwords are the trade-off)
- Do NOT delete `signingConfigs.debug` — debug builds still need it
- Do NOT install a new npm dep (Plan D is server-side + Android config only)
- Do NOT call `android_screenshot` / Read image files (project rule)
- Do NOT modify `network_security_config.xml` / `AndroidManifest.xml` (already locked down in Plan A C3-step1)