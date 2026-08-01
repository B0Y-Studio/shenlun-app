# Round 4 — Follow-up Plans (P1 / P2 / P3 / HTTPS) — INDEX

> Companion to `2026-08-01-round4-p0-critical.md`. After P0 lands, these three follow-up plans execute in order.

## Plan B: Round 4 — P1 High Fixes (6 项)

**File**: `docs/superpowers/plans/2026-08-01-round4-p1-high.md` *(to be written)*

**Scope:** H1–H6 from `review-round4.md` lines 142-340.

**Tasks (TBD when plan written)**:
- H1: `runJudge` cancel handler + `reader.releaseLock` + try/catch in JudgeScreen.onStart
- H2: Remove `useState` cache of `question` in JudgeScreen
- H3: `useDebouncedValue` hook for PaperScreen year/province inputs
- H4: Switch `MainTabs` from conditional render to `createBottomTabNavigator` (biggest refactor)
- H5: ProGuard keep rules + remove dead `enableProguardInReleaseBuilds` var
- H6: Centralize BASE URL in `src/config/api.ts` (3 hardcoded sites → 1)

**Estimated**: 2-3 days. H4 is the highest-risk (changes navigation structure + ActiveFilterContext usage in SourceScreen). Smoke-test all Tab switching paths after H4.

**External deps**: none.

## Plan C: Round 4 — P2 + P3 + Engineering (62 项)

**File**: `docs/superpowers/plans/2026-08-01-round4-p2-p3-engineering.md` *(to be written)*

**Scope:** M1–M18 (Medium, 18 items) + L1–L44 (Low, 44 items) + ESLint rules + test additions.

**Recommended sub-breakdown** (to avoid one giant plan):
- **C1**: M1+M10 (theme persistence + memoization) + M2 (tabBus Set) + M3 (SplashScreen theme) + M4 (ArticleCard highlight) — 5 items, ~1 day
- **C2**: M5 (race guards × 3) + M6 (fetchWithTimeout) + M7 (score clamp) + M8 (mapArticle) — 4 items, ~1 day
- **C3**: M9 (mmkv logging) + M11 (loading/error states × 5) + M12 (SectionList + focus) + M13 (release ABI) + M14 (getDaily online) + M15 (SourceScreen ref) + M16 (mountedRef) + M17 (delete feedback) + M18 (Reader mountedRef) — 9 items, ~2 days
- **C4**: L1–L44 batched by file — 1-2 days
- **C5**: Engineering (ESLint + test additions + CI smoke) — 1 day

**Estimated**: 5-7 days total, broken into 5 PRs (C1, C2, C3, C4, C5).

## Plan D: Round 4 — HTTPS Switch + Release Signing (C3 steps 2 & 3)

**File**: `docs/superpowers/plans/2026-08-01-round4-https-release.md` *(to be written)*

**Scope:** Server HTTPS cert provisioning + 3 client BASE URL switches + LlmConfigScreen wording + release keystore generation + build.gradle wiring.

**External deps (BLOCKER)**: server `124.223.5.144` needs a domain name + Let's Encrypt cert + nginx config. **Cannot start this plan until server-side HTTPS is live**.

**Estimated**: 1 day (assuming server cert is ready; otherwise server setup time dominates).

---

## Sequencing Recommendation

```
[Now]      Plan A: P0 Critical (3 items, ~1 hour)         ← ship today
+1 day     Plan B: P1 High (6 items, ~2-3 days)            ← review touches navigation, needs manual verification
+3 days    Plan C: P2 Medium C1-C3 (18 items, ~4 days)      ← split into 3 PRs
+7 days    Plan C: P3 Low + Engineering (44 + 3 items, ~3 days)
[blocked]  Plan D: HTTPS + Release (waits on server cert)
```

---

## Carry-Forward Notes (from review)

- **M14** (getDaily returns `{items, online}`) is a **breaking API change** — `HomeScreen` caller must be updated in the same PR
- **H4** (bottom-tabs) changes navigation event flow — `tabBus` API may be replaced entirely; check whether SourceScreen + AnalysisScreen callers still work
- **M10 + M1** (ThemeContext memo + persistence) is a single change but touches every `useTheme()` consumer (most screens); verify no stale closures after change
- **L37 + L38** (fonts: `sans` is iOS-only, `kai` not packaged) — defer to a UI polish PR, not blocking
- **L44** (a11y labels everywhere) — bulk addition, lowest risk to defer to last

---

## When NOT to start these plans

- Plan B: Don't start until Plan A's 3 commits are on `feature/ai-judge-v1.1-hygiene` and pushed
- Plan C: Don't start until Plan B is merged to master (so the navigation changes are stable)
- Plan D: Don't start until server-side HTTPS cert is provisioned and tested