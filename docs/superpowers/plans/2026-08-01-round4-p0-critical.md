# Round 4 — P0 Critical Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 Critical issues from Round 4 review (`review-round4.md`) that block compilation, cause guaranteed crashes, or expose critical security holes.

**Architecture:** Three independent fixes:
- C1: One-line `export` keyword addition in `mmkv.ts`
- C2: Delete dead `useMemo` block in `PaperScreen.tsx` + remove unused `useMemo` import
- C3 (step 1 only): Tighten Android network security config + flip `usesCleartextTraffic` to false; defer HTTPS switch (C3 step 2) and release keystore (C3 step 3) to Plan D (server-side dependency)

**Tech Stack:** React Native 0.74.5 + TypeScript 5, Android (Gradle, network_security_config), Python stdlib tests, Jest for client.

**Scope: This plan covers P0 only.** P1 (6 High), P2 (18 Medium), P3 (44 Low), and C3 step 2/3 are deferred to follow-up plans. Do NOT start any P1+ work in this plan.

---

## Global Constraints

- **Project root**: `C:\Users\hecto\ZCodeProject\shenlunapp\`
- **Git branch**: work directly on `feature/ai-judge-v1.1-hygiene` (the active integration branch) — P0 fixes are bug fixes that should land before the hygiene PR merges
- **Commit messages**: prefix `fix(judge):` (per project convention)
- **Each task = one commit** (per review's request: "便于回滚")
- **No `any` outside boundary** (per AGENTS.md)
- **No screenshots / image reads** (per project rule)
- **Tests must pass** before commit:
  - Server: `cd docs/server && python -m pytest tests/ -v` (currently 14/14 passing)
  - Client: `npx jest src/llm/__tests__/client.test.ts` (currently 9/9 passing)
- **Re-run both test suites after each task** to catch regressions early

---

## File Structure

**Files to modify (3 files)**:
- `src/storage/mmkv.ts` — add `export` to `getStorage` (C1)
- `src/screens/PaperScreen.tsx` — remove dead `useMemo` block + `useMemo` import (C2)
- `android/app/src/main/res/xml/network_security_config.xml` — flip `cleartextTrafficPermitted` defaults (C3.1a)
- `android/app/src/main/AndroidManifest.xml` — flip `usesCleartextTraffic="false"` (C3.1b)
- `.gitignore` — add `*.keystore` (C3.1c, anticipatory for Plan D)

**Files NOT to touch in this plan**:
- Any P1/P2/P3 items
- `docs/server/card_server.py` (server-side, Plan D)
- `android/app/build.gradle` keystore config (Plan D)
- `src/api/client.ts` / `src/api/llmConfig.ts` / `src/llm/client.ts` (Plan D, BASE URL switch)
- `src/screens/LlmConfigScreen.tsx` wording (Plan D, depends on HTTPS)

---

## Task 1: C1 — Export `getStorage` from `mmkv.ts`

**Files:**
- Modify: `src/storage/mmkv.ts:8`

**Interfaces:**
- Consumes: none (standalone)
- Produces: `getStorage(): MMKV | null` becomes a public export; existing callers (`src/llm/judgeStore.ts:2`, `src/theme/ThemeContext.tsx` if used later) gain correct import resolution

**Context for implementer:** `mmkv.ts` is the low-level MMKV wrapper. It exposes `getDeviceId`, `getCachedArticles`, `setCachedArticles`, `getReadIds`, `markRead`, `getReadHistory`, `countReadInList`, `countReadsInWindow`, `getLocalNotes`, `addLocalNote`, `deleteLocalNote` — all `export`ed. `getStorage` was the only helper left internal. The bug: `judgeStore.ts:2` imports `{ getStorage }` from this module. Without `export`, TypeScript compile fails AND runtime gets `undefined`. Currently `tsc` is not in our test loop, so the bug manifests only at runtime when judge history is read/written — making the local judge history feature completely broken.

- [ ] **Step 1: Verify the bug exists**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -n "getStorage" src/storage/mmkv.ts src/llm/judgeStore.ts
```

Expected output:
- `src/storage/mmkv.ts:8: function getStorage(): MMKV | null {`  (no `export`)
- `src/llm/judgeStore.ts:2: import { getStorage } from '../storage/mmkv';`

If `export` is already present in `mmkv.ts:8`, this task is already done — abort and move to Task 2.

- [ ] **Step 2: Add `export` keyword to `getStorage` declaration**

Edit `src/storage/mmkv.ts:8`:

```ts
// before
function getStorage(): MMKV | null {

// after
export function getStorage(): MMKV | null {
```

The function body (lines 9-13) is unchanged. Only the declaration line is modified.

- [ ] **Step 3: Verify the fix**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -n "export function getStorage\|^function getStorage" src/storage/mmkv.ts
```

Expected: `export function getStorage(): MMKV | null {`

- [ ] **Step 4: Run test suites (regression check)**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest src/llm/__tests__/client.test.ts
```

Expected:
- Server: `14 passed`
- Client: `Tests: 9 passed`

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git add src/storage/mmkv.ts
git -c user.name=zcode -c user.email=zcode@local commit -m "fix(judge): export getStorage from mmkv.ts — judgeStore import was failing silently"
```

---

## Task 2: C2 — Delete dead `useMemo` block in `PaperScreen.tsx`

**Files:**
- Modify: `src/screens/PaperScreen.tsx` (remove `useMemo` block at lines 242-246, plus unused `useMemo` import from React line 6)

**Interfaces:**
- Consumes: none
- Produces: `years` variable gone (was dead code); Hooks are now called in the same order in both list view and detail view → no Rules-of-Hooks violation

**Context for implementer:** `PaperScreen` is a 3-mode component: list view (no `detail`) → detail view (paper text) → question-detail view (`activeQ`). The question-detail view returns early at line 94 (`return <...>`), which means any code after that point in the function body, including the `useMemo` at line 242, **never executes in question-detail view**. But Hooks must be called in the same order every render — so React detects the inconsistency and crashes with `"Rendered fewer hooks than expected"`. Verified: `years` is computed but never referenced in any JSX (dead code), so deletion is safe.

**Caveat**: Verify before deleting that `years` is truly unused by checking all JSX in the file.

- [ ] **Step 1: Verify `years` is unused in JSX**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -n "years" src/screens/PaperScreen.tsx
```

Expected: only line 242 (declaration) and possibly line 6 (if it was destructured/imported). NO occurrences in JSX `{years...}` blocks.

If `years` IS used somewhere, abort this task and escalate — the fix is non-trivial.

- [ ] **Step 2: Delete the `useMemo` block**

Edit `src/screens/PaperScreen.tsx`, remove lines 242-246 (the entire block):

```ts
// DELETE THIS BLOCK:
const years = useMemo(() => {
  const set = new Set<number>();
  papers.forEach(p => set.add(p.year));
  return Array.from(set).sort((a, b) => b - a);
}, [papers]);
```

- [ ] **Step 3: Check if `useMemo` is still imported and still used**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -n "useMemo" src/screens/PaperScreen.tsx
```

If `useMemo` appears ONLY in the import line (line ~6), it's now unused — remove it from the import. Format:

```ts
// before
import React, { useState, useEffect, useMemo, useCallback } from 'react';

// after (remove useMemo)
import React, { useState, useEffect, useCallback } from 'react';
```

If `useMemo` is still used elsewhere in the file (e.g., for `papers` filtering), keep the import.

- [ ] **Step 4: Verify no syntax errors**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/screens/PaperScreen.tsx','utf8'), {plugins:['typescript'], sourceType:'module'})" && echo "syntax OK" || echo "syntax FAILED"
```

Expected: `syntax OK`

(Note: Babel parser available transitively via react-native preset. If not installed, fall back to `npx tsc --noEmit --skipLibCheck src/screens/PaperScreen.tsx`.)

- [ ] **Step 5: Run test suites**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest src/llm/__tests__/client.test.ts
```

Expected: 14 + 9 = 23 passing.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git add src/screens/PaperScreen.tsx
git -c user.name=zcode -c user.email=zcode@local commit -m "fix(judge): remove dead useMemo in PaperScreen — Rules of Hooks violation causing paper-detail crash"
```

---

## Task 3: C3-step1 — Tighten Android network security config

**Files:**
- Modify: `android/app/src/main/res/xml/network_security_config.xml`
- Modify: `android/app/src/main/AndroidManifest.xml` (single attribute change on line 11)
- Modify: `.gitignore` (add `*.keystore`, anticipatory for Plan D)

**Interfaces:**
- Consumes: existing Android manifest config + network security config XML
- Produces: cleartext HTTP blocked except for localhost (emulator host) + 10.0.2.2 (Android emulator's loopback alias); APK ready for HTTPS-only production traffic

**Context for implementer:** Currently the Android manifest declares `android:usesCleartextTraffic="true"` which allows ALL cleartext HTTP from any domain. Combined with `network_security_config.xml` that has `cleartextTrafficPermitted="true"` in `base-config`, this means API keys + device IDs + answer content are sent in plaintext over the network. We tighten: `base-config` blocks cleartext globally, then `domain-config` re-allows it ONLY for localhost + emulator loopback (for dev convenience). This step is independent of server-side HTTPS — the dev workflow keeps working with cleartext to localhost, while production traffic will use HTTPS (BASE URL switch happens in Plan D after server cert is set up).

- [ ] **Step 1: Read current `network_security_config.xml`**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
cat android/app/src/main/res/xml/network_security_config.xml
```

Expected: a file with `<base-config cleartextTrafficPermitted="true">` and possibly a `<domain-config>` block.

- [ ] **Step 2: Rewrite `network_security_config.xml`**

Edit `android/app/src/main/res/xml/network_security_config.xml`, replace its entire contents with:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
    </domain-config>
</network-security-config>
```

- [ ] **Step 3: Flip `usesCleartextTraffic` to false in AndroidManifest.xml**

Edit `android/app/src/main/AndroidManifest.xml` line 11:

```xml
<!-- before -->
android:usesCleartextTraffic="true"

<!-- after -->
android:usesCleartextTraffic="false"
```

Leave everything else in the file unchanged.

- [ ] **Step 4: Add `*.keystore` to `.gitignore` (anticipatory for Plan D)**

Edit `.gitignore`, add this line at the end:

```
# Release keystore (Plan D will generate)
*.keystore
```

- [ ] **Step 5: Verify the changes**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
grep -n "usesCleartextTraffic" android/app/src/main/AndroidManifest.xml
grep -n "cleartextTrafficPermitted" android/app/src/main/res/xml/network_security_config.xml
grep -n "^\*.keystore$" .gitignore
```

Expected:
- AndroidManifest: `android:usesCleartextTraffic="false"`
- network_security_config: `cleartextTrafficPermitted="false"` appears in base-config; `cleartextTrafficPermitted="true"` appears once in domain-config
- .gitignore: `*.keystore` line present

- [ ] **Step 6: Run test suites (no JS-side impact, but verify no regression)**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest src/llm/__tests__/client.test.ts
```

Expected: 14 + 9 = 23 passing.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git add android/app/src/main/res/xml/network_security_config.xml \
        android/app/src/main/AndroidManifest.xml \
        .gitignore
git -c user.name=zcode -c user.email=zcode@local commit -m "fix(judge): block cleartext HTTP globally; allow only localhost + emulator loopback (Plan D will switch BASE URL to HTTPS)"
```

---

## Verification (post all 3 tasks)

- [ ] **All 3 commits present on `feature/ai-judge-v1.1-hygiene`**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git log --oneline -3
```

Expected: 3 new commits on top of `8ef989a chore: npm install...`, all prefixed `fix(judge):`.

- [ ] **All tests still pass**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp/docs/server"
python -m pytest tests/ -v
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
npx jest src/llm/__tests__/client.test.ts
```

Expected: 14 server + 9 client = 23 passing.

- [ ] **Push branch**

```bash
cd "C:/Users/hecto/ZCodeProject/shenlunapp"
git push origin feature/ai-judge-v1.1-hygiene
```

---

## Self-Review

**1. Spec coverage:**
- C1 ✓ Task 1
- C2 ✓ Task 2 (includes both the dead code deletion and the unused-import cleanup)
- C3 step 1 ✓ Task 3 (network_security_config + AndroidManifest + .gitignore)
- C3 step 2 ✗ deferred to Plan D (server HTTPS dependency)
- C3 step 3 ✗ deferred to Plan D (release keystore generation)
- LlmConfigScreen wording ✗ deferred to Plan D (depends on HTTPS)

**2. Placeholder scan:** No TBD / TODO / "implement later" / "add appropriate" phrases. Every step has explicit commands and expected output.

**3. Type consistency:**
- `getStorage(): MMKV | null` signature preserved across Task 1
- `useMemo` import removal in Task 2 conditionally handled (only if no other usage)
- No type renames or signature changes that would propagate

**4. Risks identified:**
- **Task 1 risk**: If someone else is editing `mmkv.ts` concurrently — low (single-machine, single user)
- **Task 2 risk**: If `years` IS used somewhere we missed, app would break. Mitigation: Step 1 grep verification before deletion
- **Task 3 risk**: If server-side BASE URL still points to HTTP IP after this change, **all client→server traffic will break in production builds**. Mitigation: defer production BASE URL switch to Plan D which includes server-side HTTPS cert provisioning. Until Plan D ships, dev builds still work via localhost/10.0.2.2 allowlist.

---

## What NOT to do

- Do NOT touch `src/api/client.ts`, `src/api/llmConfig.ts`, or `src/llm/client.ts` — BASE URL switch belongs to Plan D
- Do NOT generate a release keystore — Plan D
- Do NOT modify `android/app/build.gradle` — keystore config belongs to Plan D
- Do NOT touch P1/P2/P3 items
- Do NOT install `@react-navigation/bottom-tabs` — H4 belongs to P1 plan
- Do NOT call `android_screenshot` / Read image files — project rule