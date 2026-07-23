# Three Kingdoms Alias (BLIND삼국) Trainer — Design

- **Status**: Draft awaiting user review
- **Date**: 2026-07-23
- **Owner**: B0Y-Studio
- **Scope**: Single-project trainer for the Steam release
  `F:\STEAM\steamapps\common\Three Kingdoms Alias`

---

## 1. Goal

Build a standalone Windows desktop trainer ("修改器") for the game **BLIND삼국**
v0.5.6 (`ThreeKingdomsAlias.exe`) that lets the user **read and write arbitrary
JavaScript object properties** in the live game's V8 heap **without modifying
the game installation**.

Acceptance bar (agreed with user):

1. Trainer builds and launches as an `.exe` on Windows.
2. Trainer connects to the running game over Chrome DevTools Protocol (CDP) on
   port `9222`.
3. Web GUI exposes an input row for `path` + `value` and an Apply button.
4. Typing a known game state path and a numeric value results in the value
   being observable inside the running game after the next refresh.
5. Failure modes (game not running, debugger port closed, bad path, non-primitive
   value) surface as visible UI messages, not crashes.

Out of scope for this version:

- Live freeze/lock (per-frame re-injection) — explicit user decision.
- Automatic hot-path discovery / heuristic scanning — explicit user decision.
- Built-in hot-path buttons (e.g. "Gold = 99999") — explicit user decision.
- Patching the game's `app.asar` — explicit user decision.
- Touching the Steam install directory at all — explicit user decision.

## 2. Context (what we know about the game)

From inspecting `F:\STEAM\steamapps\common\Three Kingdoms Alias`:

- `package.json` → `name: three-kingdoms-alias`, `description: BLIND삼국`, author `Plotrick`, version `0.5.6`, `main: electron/main.cjs`.
- Application is plain Electron + Chromium. No native renderer, no custom
  executable wrapper.
- Game script bundle lives in `resources/app.asar` (~807 MB) — unpacked surface
  area is JS modules in `dist/assets/index-*.js` and small CSV data files in
  `dist/data/`.
- Strict CSP: `default-src 'self'`. This blocks in-page scripts but **does not**
  affect CDP. CDP is the same protocol DevTools uses and ignores page CSP.
- `resources/app.asar.unpacked/node_modules/steamworks.js` — only unpacked
  module; Steamworks integration only.
- `app-update.yml` points at GitHub repo `kbiny/ThreeKingdoms` — used for
  auto-updates; we do not interact with it.

Implication: once the game is launched with `--remote-debugging-port=9222`, any
local HTTP/WS client can call `Runtime.evaluate` and execute arbitrary JS in
the game's renderer. We will use the Node package `chrome-remote-interface`
(re-exported from `@aduth/chrome-remote-interface`) which is a thin WebSocket
client for CDP.

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Trainer.exe (Electron, packaged)                              │
│                                                              │
│  ┌──────────────────────┐    IPC    ┌──────────────────────┐ │
│  │ Renderer             │ ────────► │ Main Process         │ │
│  │ (React + Vite SPA)   │           │  - CDPClient (WS)    │ │
│  │ - Connection status  │ ◄──────── │  - TrainerService    │ │
│  │ - Path editor        │  events   │    .inspect(path)    │ │
│  │ - Apply + History    │           │    .apply(path,val)  │ │
│  └──────────────────────┘           └──────────┬───────────┘ │
│                                                  │ WS         │
└──────────────────────────────────────────────────────────┘
                                                   │
                                                   │ ws://127.0.0.1:9222
                                                   ▼
┌──────────────────────────────────────────────────────────────┐
│ ThreeKingdomsAlias.exe (user-launched w/ --remote-debug)     │
│  Renderer Process (BLIND삼국)                                  │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 Components

| Path | Role |
|------|------|
| `trainer/main/index.cjs` | Electron main entry. Boots `CDPClient`, wires IPC handlers, manages window lifecycle. |
| `trainer/main/cdpClient.mjs` | Thin wrapper over `chrome-remote-interface`. Knows the list of `/json` targets, picks the page whose URL contains `index.html`, exposes `connect()` / `eval(expr)`. |
| `trainer/main/trainerService.mjs` | Higher-level API used by IPC: `inspectPath(path)`, `applyPath(path, value)`, `runSmoke()`. Parses `a.b.c` style paths into JS expressions and wraps in IIFE for both read and write. |
| `trainer/main/smoke.mjs` | Probe that enumerates `window` keys matching `gameStore|state|app` and prints them. Used both as a built-in tool and as the smoke test driver. |
| `trainer/preload.cjs` | Context-bridge: exposes a minimal, typed-ish API on `window.trainer` (`apply`, `inspect`, `runSmoke`, `subscribe`). Renderer never touches Node. |
| `trainer/renderer/index.html` | Vite entry HTML. |
| `trainer/renderer/src/main.tsx` | React root. |
| `trainer/renderer/src/App.tsx` | Three-pane layout: Connection / Inspector / History. |
| `trainer/renderer/src/components/PathEditor.tsx` | Two inputs (`path`, `value`) + Apply. Calls `window.trainer.apply(...)`. |
| `trainer/renderer/src/components/History.tsx` | Last 20 attempts with timestamp, path, value requested, returned/exception. |
| `trainer/renderer/src/components/StatusBanner.tsx` | Shows current CDP state (connected / reconnecting / not running). |
| `scripts/launch-with-debug.bat` | README-pointer `.bat` users can use as a Steam "launch options" wrapper. **Not** copied into the game directory. |
| `docs/steam-debug-launch.md` | One-page human doc: how to add `--remote-debugging-port=9222` to the Steam launch options. |

### 3.2 IPC surface (preload → renderer)

```ts
interface TrainerBridge {
  apply({ path: string; value: unknown }): Promise<ApplyResult>;
  inspect({ path: string }): Promise<InspectResult>;
  runSmoke(): Promise<SmokeResult>;
  subscribe(channel: 'status', cb: (s: ConnectionStatus) => void): () => void;
}

type ApplyResult =
  | { ok: true; returnedValue: JsonPrimitive | '<object>' | '<undefined>' }
  | { ok: false; error: string };

type InspectResult =
  | { ok: true; value: JsonPrimitive | '<object>' | '<undefined>' }
  | { ok: false; error: string };

type ConnectionStatus = 'connected' | 'reconnecting' | 'game-not-running';
```

### 3.3 CDP usage

All interactions are over the `Page` + `Runtime` CDP domains. We use one
remote object per call (no persistent `Runtime.getProperties` cache):

| Operation | CDP call | Expression shape |
|-----------|----------|------------------|
| Inspect path | `Runtime.evaluate` `awaitPromise:false` `returnByValue:true` | `(() => { try { return window.__trainerSafeRead('a.b.c'); } catch (e) { return { __error: String(e) }; } })()` |
| Apply path | same | `(() => { try { window.__trainerSafeWrite('a.b.c', __VAL__); return window.__trainerSafeRead('a.b.c'); } catch (e) { return { __error: String(e) }; } })()` |
| Smoke | same | `Object.keys(window).filter(k => /^(gameStore|state|app|store|session|root)$/i.test(k))` |

`__trainerSafeRead` / `__trainerSafeWrite` are first injected into the page
via `Page.addScriptToEvaluateOnNewDocument` so they survive game route
changes. Both:

- Parse a dotted path, walking object references.
- Reject paths that contain `__proto__`, `constructor`, `prototype`,
  `Function`, `eval`, `import`, dangerous keywords. Hard allow-list only:
  identifier chars + `.` + `[N]` + `['key']`. This is a coarse guard, not a
  security boundary — it's purely to keep the user from shooting themselves
  in the foot.
- Reject writes whose target object is frozen or whose property descriptor is
  `writable: false`.
- For writes, value is serialized as JSON; only JSON **scalar** values
  (`number`, `string`, `boolean`, `null`) are allowed in this version.
  Arrays, plain objects, and non-JSON values are rejected with
  `{ __error: 'scalar-only' }`.

### 3.4 Path language (formal)

A "path" is one of:

- Dotted identifier chain: `state.player.gold`
- Indexing: `cities[0].name`, `units['cavalry'].count`

Grammar (informal):

```
path     := segment ('.' segment | '[' index ']')*
segment  := /[A-Za-z_$][A-Za-z0-9_$]*/
index    := /[0-9]+/  |  /'[^'\n\r\\]*'/  |  /"[^"\n\r\\]*"/
```

`index` strings may contain any character except newline, carriage return,
backslash, and the matching quote. Anything else (e.g. `a[b]`, `a..b`,
`a.__proto__`, `a.constructor`, `a.$ref`, arithmetic, function calls,
templates, comments) → `TrainerService` returns
`{ ok:false, error:'bad-path' }` **without** touching the page.

The renderer's IPC surface (§3.2) intentionally exposes **no** raw
`eval(expression)` channel. Only `inspect(path)` and `apply(path, value)` are
available. This is by design: the user only needs path-style writes for v1, and
omitting an arbitrary-exec channel keeps the surface small and auditable.

## 4. Data flow (happy path)

1. User starts `ThreeKingdomsAlias.exe` via Steam with the launch option
   `--remote-debugging-port=9222`. (Documented; Trainer does not edit Steam
   config.)
2. User starts `Trainer.exe`. Main process calls
   `http://127.0.0.1:9222/json`; on success selects the page whose URL ends
   in `dist/index.html`.
3. Main process opens a WebSocket to that target's `webSocketDebuggerUrl`,
   calls `Page.enable()`, `Runtime.enable()`, and injects `__trainerSafe*` via
   `Page.addScriptToEvaluateOnNewDocument`.
4. Renderer mounts. Status banner reads `connected`.
5. User types `path = state.player.gold`, `value = 999999`, hits **Apply**.
6. `window.trainer.apply(...)` → IPC `trainer:apply` →
   `TrainerService.applyPath` → `cdpClient.eval(expression)` →
   `Runtime.evaluate` returns `{ result: { value: 999999 } }`.
7. Renderer pushes an entry to History with `{ ts, path, value, ok:true, returned: 999999 }`.
8. User refreshes the relevant screen in-game → sees new value (subject to
   game re-rendering; we do not promise UI auto-refresh).

## 5. Error handling

| Failure | Detection | UI behavior |
|---------|-----------|-------------|
| CDP HTTP `/json` returns 404 or refuses connection | `fetch` throws / non-2xx | Status banner = `game-not-running`. Show copy-paste hint pointing to `docs/steam-debug-launch.md`. |
| `/json` returns targets but none match `dist/index.html` | filter returns empty | Status banner = `reconnecting`, retry with backoff. Log includes actual target list for debugging. |
| WebSocket drops mid-session | `ws.on('close')` | Auto-reconnect with exponential backoff (1s → 2s → 4s → 8s, cap 30s). Banner switches to `reconnecting` then `connected`. |
| Bad path syntax | Pre-eval guard in `trainerService` | Inline form error "Bad path" on the Apply button row. |
| Runtime eval throws | `Runtime.evaluate` returns `exceptionDetails` | History entry marked failed; toaster shows the exception text. |
| Write target is non-writable | `__trainerSafeWrite` returns `{ __error: 'not-writable' }` | Same as above. |
| Value provided is an object/array/non-scalar | `__trainerSafeWrite` returns `{ __error: 'scalar-only' }` | Error: "Only JSON scalar values supported in v1". |

We do not crash the trainer on any of these. Every error path is a `{ ok:false, error }` payload.

## 6. Build / run

- Tooling: Electron 31, Vite 5, React 18, TypeScript 5.
- Package manager: npm. Single `package.json` at `trainer/` (no project-root
  `package.json`; the existing `C:\Users\hecto\ZCodeProject\package.json` is
  unrelated and untouched).
- Pre-implementation cleanup: `C:\Users\hecto\ZCodeProject\ThreeKingdomsTrainer\`
  was used during exploration to extract `app.asar` into an `extracted/`
  folder for inspection. That folder and its `node_modules` have been removed.
  The real `trainer/` scaffold is created from scratch by the implementation
  plan.
- Renderer is built with Vite into `trainer/dist/renderer/`. Main process
  uses `electron-builder` for the final Windows target.
- Scripts:
  - `npm run dev` — Vite dev server + `electron .` pointed at it.
  - `npm run build` — `vite build` + `tsc -p tsconfig.main.json`.
  - `npm run package` — `electron-builder --win --x64` produces a `.exe` in
    `dist/`.
- The Trainer does **not** ship any game file. Total distributable size is
  the Electron runtime (~150 MB compressed) plus Trainer code.

## 7. Testing

There is no test framework for game code; we add a minimal one for Trainer:

- `trainer/test/pathParser.test.mjs` — unit tests for the path grammar
  validator (good paths, bad paths, prototype-pollution attempts).
- `trainer/test/cdpClient.test.mjs` — skipped automatically if
  `SKIP_CDP_TESTS=1` or no game running; otherwise runs against a real
  `Runtime.evaluate('1+1')`.
- `scripts/smoke.mjs` — manual integration script invoked from the Trainer UI
  ("Run smoke" button) and from CLI. It probes `window` for likely game-state
  roots and prints them.

Smoke command output we expect on a working setup:

```
[smoke] window roots: [ 'state' ]   ← user confirms
[smoke] state.player.gold = 1000
[smoke] state.player.gold => 1000
```

If the user reports `window roots: []`, we add a follow-up diagnostic that
recursively walks a few globals looking for objects with numeric fields.

## 8. Risks & unknowns

1. **Global state root**. We assume `state` or `gameStore` is reachable from
   `window`. If the game keeps state in a closure or in a Pinia/Vuex store
   that doesn't attach to window, we may need a one-time code dive to find
   the right path. The smoke diagnostic exists to discover this fast.
2. **Bundle identity**. The Electron app may create multiple debugger targets
   (background page, devtools). We filter to `dist/index.html`. If author
   changes build output name in an update, the filter must be tweaked; we'd
   surface that via the empty-targets error path.
3. **Updater interference**. Steam's auto-update swaps `app.asar` mid-session.
   We are read-only against the install; no risk here.
4. **Steam authentication**. We do not bypass Steam. The game still needs a
   valid Steam run. We just talk to its renderer.
5. **CSP / WebSocket origin**. Some Electron apps lock CDP with
   `--remote-allow-origins` in newer versions. If hitting origin errors,
   we ask the user (docs) to also pass that flag.

## 9. Open questions deferred

These were discussed and explicitly deferred by the user:

- Freeze/lock: not implemented.
- Heuristic memory scanning: not implemented.
- Pre-baked hot paths (gold/hp/etc.): not implemented.
- Modifying game's `app.asar`: not implemented.
- Auto-patching Steam launch options: not implemented (user runs a documented manual step instead).

## 10. Milestones for the implementation plan

(Plan detail comes from the `writing-plans` skill in the next step. Sketches
here so the design is reviewable end-to-end.)

1. Scaffold `trainer/` Electron + Vite/React project, runs empty window.
2. Implement `CDPClient` + `trainerService` with no UI yet; smoke test.
3. Build path editor UI; wire to IPC; happy-path round trip.
4. Error path coverage + reconnect + status banner.
5. Documentation (`docs/steam-debug-launch.md`, README).
6. Package as Windows `.exe`.
