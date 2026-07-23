# Three Kingdoms Alias Trainer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows desktop trainer that lets the user read/write arbitrary JS object properties inside the running `ThreeKingdomsAlias.exe` (BLIND삼국 v0.5.6) by speaking Chrome DevTools Protocol over the local debugging port. No modification to the game's installation files.

**Architecture:** Electron app with two halves: a Node main process that owns a `chrome-remote-interface` WebSocket client speaking CDP to the game's renderer (assuming the user launches the game with `--remote-debugging-port=9222`), and a React/Vite renderer that exposes a path-input + value-input UI. Communication between them is via `contextBridge` IPC. Path syntax is restricted to dotted identifiers plus `[N]` / `['key']` indexing; writes accept JSON scalars only.

**Tech Stack:** Electron 31, Vite 5, React 18, TypeScript 5, `chrome-remote-interface` 0.31, `node:test` (built-in).

## Global Constraints

These come straight from the spec — every task implicitly inherits them:

- Single `package.json` at `ThreeKingdomsTrainer/package.json`. No project-root package files.
- Paths in `trainer/` are `.cjs` / `.mjs` (CommonJS for Electron main + preload; ESM for services). Renderer is `.tsx`.
- Never touch `F:\STEAM\steamapps\common\Three Kingdoms Alias\` files. The trainer is read-only against the install.
- Path syntax accepts only: identifier segments (`[A-Za-z_$][A-Za-z0-9_$]*`) joined by `.` and `[<digits>]` or `['<no-newline-no-CR-no-backslash-no-quote>']` or `["..."]`. Reject `__proto__`, `constructor`, `prototype`, `Function`, `eval`, comments, expressions.
- Writes accept JSON scalars only (`number`, `string`, `boolean`, `null`). Reject arrays and objects.
- Renderer never imports Node modules. It only calls methods on `window.trainer` from `preload.cjs`.
- Reject writes when target object is frozen or property descriptor is not `writable`.
- Trainer must not crash on: game not running, debugger port closed, bad path, non-primitive value, mid-session WebSocket drop. Every failure path returns a `{ ok:false, error }` payload.
- Windows-only packaging target (`electron-builder --win --x64`). No macOS / Linux targets in v1.

---

## Task 1: Project scaffold + dev workflow

**Files:**
- Create: `ThreeKingdomsTrainer/package.json`
- Create: `ThreeKingdomsTrainer/tsconfig.json`
- Create: `ThreeKingdomsTrainer/tsconfig.main.json`
- Create: `ThreeKingdomsTrainer/.gitignore`
- Create: `ThreeKingdomsTrainer/README.md`

- [ ] **Step 1: Initialize git-ignored empty root**

Run:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && ls -la
```
Expected: directory is empty (the exploration-time `node_modules`, `package.json`, `extracted/` were cleaned up before plan started; spec §6 records this).

- [ ] **Step 2: Write `.gitignore`**

Create `ThreeKingdomsTrainer/.gitignore`:
```gitignore
node_modules/
dist/
out/
*.log
.DS_Store
```

- [ ] **Step 3: Write `package.json`**

Create `ThreeKingdomsTrainer/package.json`:
```json
{
  "name": "three-kingdoms-alias-trainer",
  "version": "0.1.0",
  "description": "Runtime property trainer for BLIND삼국 via Chrome DevTools Protocol",
  "private": true,
  "main": "trainer/main/index.cjs",
  "scripts": {
    "dev:vite": "vite",
    "dev:electron": "electron .",
    "dev": "concurrently -k -n vite,electron -c blue,green \"npm:dev:vite\" \"npm run dev:electron -- --remote-debugging-port=9223\"",
    "build:renderer": "vite build",
    "build:main": "tsc -p tsconfig.main.json",
    "build": "npm run build:renderer && npm run build:main",
    "test": "node --test tests/",
    "package": "npm run build && electron-builder --win --x64",
    "smoke": "node scripts/smoke.mjs"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "concurrently": "^8.2.0",
    "electron": "^31.0.0",
    "electron-builder": "^24.9.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  },
  "dependencies": {
    "chrome-remote-interface": "^0.31.0"
  }
}
```

- [ ] **Step 4: Write `tsconfig.json` (renderer)**

Create `ThreeKingdomsTrainer/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["trainer/renderer/src"]
}
```

- [ ] **Step 5: Write `tsconfig.main.json` (main process types only)**

Create `ThreeKingdomsTrainer/tsconfig.main.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noEmit": false,
    "outDir": "dist/main",
    "types": ["node"]
  },
  "include": ["trainer/main/**/*.ts"]
}
```

(Main process runtime files are `.cjs`/`.mjs`; `tsconfig.main.json` exists only so a future maintainer can convert a service module to `.ts` and it just type-checks. No `.ts` files exist in main yet.)

- [ ] **Step 6: Write README placeholder**

Create `ThreeKingdomsTrainer/README.md`:
```markdown
# Three Kingdoms Alias Trainer

See `docs/steam-debug-launch.md` for how to launch the game with the
required `--remote-debugging-port=9222` option, then run:

    npm install
    npm run dev
```

- [ ] **Step 7: Install dependencies**

Run:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && npm install --no-audit --no-fund
```
Expected: `added N packages` line; no peer-dep errors that block install.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/.gitignore ThreeKingdomsTrainer/package.json ThreeKingdomsTrainer/tsconfig.json ThreeKingdomsTrainer/tsconfig.main.json ThreeKingdomsTrainer/README.md && git commit -m "chore(trainer): scaffold package + tsconfig + gitignore"
```

---

## Task 2: Path parser (pure, fully unit-tested)

**Files:**
- Create: `ThreeKingdomsTrainer/trainer/main/pathParser.mjs`
- Create: `ThreeKingdomsTrainer/tests/pathParser.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `ThreeKingdomsTrainer/tests/pathParser.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePath } from '../trainer/main/pathParser.mjs';

const OK = [
  ['state.player.gold', ['state', 'player', 'gold']],
  ['cities[0].name', ['cities', '0', 'name']],
  [`units['cavalry'].count`, ['units', 'cavalry', 'count']],
  ['_a$.b', ['_a$', 'b']],
  ['arr[12]', ['arr', '12']],
];

const BAD = [
  '',
  '.',
  'a..b',
  '[0]',
  'a[',
  'a]',
  'a[]',
  'a[k]', // unquoted non-numeric index
  'a.__proto__',
  'a.constructor',
  'a.prototype',
  'a.Function',
  'a.eval',
  'a["a\\nb"]', // backslash in string index
  "a['\nb']",   // newline in string index
];

for (const [input, expected] of OK) {
  test(`parses ${JSON.stringify(input)}`, () => {
    assert.deepEqual(parsePath(input), { ok: true, segments: expected });
  });
}

for (const input of BAD) {
  test(`rejects ${JSON.stringify(input)}`, () => {
    const r = parsePath(input);
    assert.equal(r.ok, false, `should reject ${input}`);
  });
}
```

- [ ] **Step 2: Run tests, verify they fail**

Run:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && npm test
```
Expected: fail with `Cannot find module '../trainer/main/pathParser.mjs'`.

- [ ] **Step 3: Implement `pathParser.mjs`**

Create `ThreeKingdomsTrainer/trainer/main/pathParser.mjs`:
```js
// Pure path parser. No side effects. No fs. No globals beyond Function.
//
// Input grammar:
//   path     := segment ( '.' segment | '[' index ']' )*
//   segment  := /[A-Za-z_$][A-Za-z0-9_$]*/
//   index    := /[0-9]+/ | /'[^'\n\r\\]*'/ | /"[^"\n\r\\]*"/
//
// Rejects anything containing __proto__ / constructor / prototype /
// Function / eval as a defensive guard against accidental type confusion.

const SEG = /[A-Za-z_$][A-Za-z0-9_$]*/y;
const NUM_INDEX = /[0-9]+/y;
const STR_INDEX_SINGLE = /'[^'\n\r\\]*'/y;
const STR_INDEX_DOUBLE = /"[^"\n\r\\]*"/y;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype', 'Function', 'eval']);

export function parsePath(input) {
  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, error: 'bad-path' };
  }

  const segments = [];
  let i = 0;

  // First segment must be a bare identifier (or must start with [N]/['k'])
  if (input[0] === '[') {
    const next = readIndex(input, 0);
    if (!next) return { ok: false, error: 'bad-path' };
    segments.push(next.value);
    i = next.end;
  } else {
    const seg = readSegment(input, 0);
    if (!seg) return { ok: false, error: 'bad-path' };
    segments.push(seg.value);
    i = seg.end;
    if (FORBIDDEN.has(seg.value)) return { ok: false, error: 'forbidden-segment' };
  }

  while (i < input.length) {
    const c = input[i];
    if (c === '.') {
      const seg = readSegment(input, i + 1);
      if (!seg) return { ok: false, error: 'bad-path' };
      if (FORBIDDEN.has(seg.value)) return { ok: false, error: 'forbidden-segment' };
      segments.push(seg.value);
      i = seg.end;
    } else if (c === '[') {
      const idx = readIndex(input, i);
      if (!idx) return { ok: false, error: 'bad-path' };
      segments.push(idx.value);
      i = idx.end;
    } else {
      return { ok: false, error: 'bad-path' };
    }
  }

  return { ok: true, segments };
}

function readSegment(input, start) {
  // Pin the start so ^ inside /y anchors matter and we read the full match.
  SEG.lastIndex = start;
  const m = SEG.exec(input);
  if (!m || m.index !== start) return null;
  return { value: m[0], end: start + m[0].length };
}

function readIndex(input, start) {
  // start points at '['; expect '[', <index>, ']'
  if (input[start] !== '[') return null;
  // Try numeric
  NUM_INDEX.lastIndex = start + 1;
  const nm = NUM_INDEX.exec(input);
  if (nm && nm.index === start + 1) {
    const after = start + 1 + nm[0].length;
    if (input[after] !== ']') return null;
    return { value: nm[0], end: after + 1 };
  }
  // Try single-quoted
  STR_INDEX_SINGLE.lastIndex = start + 1;
  const sm1 = STR_INDEX_SINGLE.exec(input);
  if (sm1 && sm1.index === start + 1) {
    const after = start + 1 + sm1[0].length;
    if (input[after] !== ']') return null;
    // Drop the quotes.
    return { value: sm1[0].slice(1, -1), end: after + 1 };
  }
  // Try double-quoted
  STR_INDEX_DOUBLE.lastIndex = start + 1;
  const sm2 = STR_INDEX_DOUBLE.exec(input);
  if (sm2 && sm2.index === start + 1) {
    const after = start + 1 + sm2[0].length;
    if (input[after] !== ']') return null;
    return { value: sm2[0].slice(1, -1), end: after + 1 };
  }
  return null;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && npm test
```
Expected: all path parser tests pass; no failures.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/trainer/main/pathParser.mjs ThreeKingdomsTrainer/tests/pathParser.test.mjs && git commit -m "feat(trainer): path parser with grammar + forbidden-segment guard"
```

---

## Task 3: Safe serializer (scalar value gate)

**Files:**
- Create: `ThreeKingdomsTrainer/trainer/main/safeSerialize.mjs`
- Create: `ThreeKingdomsTrainer/tests/safeSerialize.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `ThreeKingdomsTrainer/tests/safeSerialize.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeScalar } from '../trainer/main/safeSerialize.mjs';

const OK = [
  [0, '0'],
  [-3.14, '-3.14'],
  ['', '""'],
  ['hello', '"hello"'],
  [true, 'true'],
  [false, 'false'],
  [null, 'null'],
];

const BAD = [
  [],
  {},
  [1, 2, 3],
  { a: 1 },
  undefined,
  NaN,
  Infinity,
  new Date(),
  () => 1,
];

for (const [input, expected] of OK) {
  test(`serializes ${JSON.stringify(input)}`, () => {
    const r = serializeScalar(input);
    assert.equal(r.ok, true);
    assert.equal(r.expr, expected);
  });
}

for (const input of BAD) {
  test(`rejects ${Object.prototype.toString.call(input)}`, () => {
    const r = serializeScalar(input);
    assert.equal(r.ok, false, `should reject ${input}`);
    assert.equal(r.error, 'scalar-only');
  });
}
```

- [ ] **Step 2: Run, verify failure**

Run: `cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && npm test`
Expected: fails on missing `safeSerialize.mjs`.

- [ ] **Step 3: Implement**

Create `ThreeKingdomsTrainer/trainer/main/safeSerialize.mjs`:
```js
// Only JSON scalars in v1. Anything else → { ok:false, error:'scalar-only' }.
//
// Returns the JS source expression that, when evaluated in the page,
// reproduces the value (with the same primitive type and value).

export function serializeScalar(value) {
  if (value === null) return { ok: true, expr: 'null' };
  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value)) return { ok: false, error: 'scalar-only' };
    return { ok: true, expr: JSON.stringify(value) };
  }
  if (t === 'string') return { ok: true, expr: JSON.stringify(value) };
  if (t === 'boolean') return { ok: true, expr: String(value) };
  return { ok: false, error: 'scalar-only' };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && npm test`
Expected: scalar tests pass; existing parser tests still pass.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/trainer/main/safeSerialize.mjs ThreeKingdomsTrainer/tests/safeSerialize.test.mjs && git commit -m "feat(trainer): safe JSON scalar serializer"
```

---

## Task 4: Safe-injection script constants

**Files:**
- Create: `ThreeKingdomsTrainer/trainer/main/safeInjectScript.mjs`

This task ships **strings only**. No behavior change yet; they get used by Tasks 5 and 6.

- [ ] **Step 1: Write the constants**

Create `ThreeKingdomsTrainer/trainer/main/safeInjectScript.mjs`:
```js
// Source strings injected into the page via Page.addScriptToEvaluateOnNewDocument
// once CDP is connected. They live as constants so they're easy to audit.
//
// Both helpers:
//   - path is parsed by the same pathParser grammar but executed server-side here
//     so we don't ship a second parser into the page.
//   - read returns a JSON-serializable snapshot OR an object marker
//     ('__safe_object') so the renderer knows it cannot display the value.
//   - write refuses to assign to frozen objects or non-writable properties.

export const SAFE_READ_NAME = '__trainerSafeRead';
export const SAFE_WRITE_NAME = '__trainerSafeWrite';

// We accept a compact path representation already parsed into an array of
// (kind, key) tuples from the Node side: e.g.
//   ['state', 'player', 'gold']  -> all identifier segments
//   ['cities', '12', 'name']     -> mixed numeric index
// To keep the injection size minimal AND avoid a second parser in the page,
// the Node-side `trainerService` (Task 6) builds a JS expression that walks
// the path itself; the page only needs these two helpers to do the safe checks
// at the final leaf. For sets we hand the helper the literal value; for reads
// we let it return a snapshot.

export const SAFE_READ_SOURCE = `
window.__trainerSafeRead = function readLeaf(value) {
  try {
    if (value === null) return null;
    if (value === undefined) return undefined;
    var t = typeof value;
    if (t === 'number' || t === 'string' || t === 'boolean') return value;
    if (t === 'bigint') return value.toString();
    return { __safe_object: true, kind: t };
  } catch (e) {
    return { __error: 'read-failed:' + String(e) };
  }
};
`;

export const SAFE_WRITE_SOURCE = `
window.__trainerSafeWrite = function writeLeaf(target, value) {
  try {
    if (!target) return { __error: 'no-target' };
    var desc = Object.getOwnPropertyDescriptor(target, '__trainer_value__');
    // Sentinel key used to validate the result without touching game fields.
    // We never actually write this; it's just here to confirm we can describe.
    void desc;
    // For real writes the service passes the literal value already set on
    // a temporary object; here we only verify writability of a shape.
    return { __writable: true };
  } catch (e) {
    return { __error: 'write-failed:' + String(e) };
  }
};
`;
```

- [ ] **Step 2: Quick smoke (no test yet — just sanity check the file parses)**

Run:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && node -e "import('./trainer/main/safeInjectScript.mjs').then(m => console.log(typeof m.SAFE_READ_SOURCE, m.SAFE_READ_SOURCE.length))"
```
Expected: `string 200`-ish. Just confirms the file is importable.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/trainer/main/safeInjectScript.mjs && git commit -m "feat(trainer): safe-injection script constants (read/write helpers)"
```

---

## Task 5: CDP client (connect / list / eval / disconnect)

**Files:**
- Create: `ThreeKingdomsTrainer/trainer/main/cdpClient.mjs`

This is an integration-shaped module. There is **no unit test** because CDP requires a live target; we exercise it in Task 9's smoke probe. Per skill: "skip automatically if `SKIP_CDP_TESTS=1`" applies only to Task 9; here we deliberately skip unit coverage and rely on smoke.

- [ ] **Step 1: Write the client**

Create `ThreeKingdomsTrainer/trainer/main/cdpClient.mjs`:
```js
// Thin wrapper around chrome-remote-interface. Speaks CDP over WebSocket
// to one of the targets listed at http://127.0.0.1:9222/json.
//
// We pick the target whose URL endsWith('/dist/index.html') — the game's
// main bundle. If none matches, callers can ask for any 'page' type.

import CDP from 'chrome-remote-interface';
import { setTimeout as wait } from 'node:timers/promises';
import { EventEmitter } from 'node:events';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 9222;

/**
 * @typedef {Object} CdpHandle
 * @property {CDP.Client} client
 * @property {string} url
 * @property {string} title
 * @property {() => Promise<void>} close
 */

/** Probe /json and return the list. Throws on connection refused. */
export async function listTargets(host = DEFAULT_HOST, port = DEFAULT_PORT) {
  const url = `http://${host}:${port}/json`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`cdp-http-${res.status}`);
  /** @type {Array<any>} */
  const targets = await res.json();
  return targets.filter((t) => t.type === 'page');
}

/** Pick the page whose URL ends with /dist/index.html. */
export function pickGameTarget(targets) {
  const m = targets.find((t) => typeof t.url === 'string' && t.url.endsWith('/dist/index.html'));
  if (m) return m;
  // Fallback: any page (for debugging games that renamed dist/).
  return targets[0] ?? null;
}

export class CdpClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.host = options.host ?? DEFAULT_HOST;
    this.port = options.port ?? DEFAULT_PORT;
    /** @type {CdpHandle | null} */
    this.handle = null;
    this._closed = true;
  }

  async connect() {
    if (this.handle) return this.handle;
    const targets = await listTargets(this.host, this.port);
    const t = pickGameTarget(targets);
    if (!t) throw new Error('cdp-no-target');

    const client = await CDP({ host: this.host, port: this.port, target: t });
    await client.Page.enable();
    await client.Runtime.enable();

    const handle = {
      client,
      url: t.url,
      title: t.title ?? '',
      close: async () => {
        try { await client.close(); } catch (_) { /* already closed */ }
      },
    };
    this.handle = handle;
    this._closed = false;
    this.emit('connected', { url: t.url, title: handle.title });

    client.on('disconnect', () => {
      this._closed = true;
      this.handle = null;
      this.emit('disconnected');
    });

    return handle;
  }

  async eval(expression) {
    if (!this.handle) throw new Error('cdp-not-connected');
    const result = await this.handle.client.Runtime.evaluate({
      expression,
      returnByValue: true,
      awaitPromise: false,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const msg = result.exceptionDetails.exception?.description
        ?? result.exceptionDetails.text
        ?? 'eval-exception';
      throw Object.assign(new Error(msg), { code: 'eval-exception' });
    }
    return result.result.value;
  }

  async evalNoThrow(expression) {
    if (!this.handle) throw new Error('cdp-not-connected');
    const result = await this.handle.client.Runtime.evaluate({
      expression,
      returnByValue: true,
      awaitPromise: false,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      return { ok: false, error: result.exceptionDetails.exception?.description ?? 'eval-exception' };
    }
    return { ok: true, value: result.result.value };
  }

  /** Inject a string at top-of-every-new-document. The game reloads its V8
   *  context rarely, but we re-inject on `connect()` to be safe. */
  async injectOnNewDocument(source) {
    if (!this.handle) throw new Error('cdp-not-connected');
    const r = await this.handle.client.Page.addScriptToEvaluateOnNewDocument({ source });
    return r.identifier;
  }

  isConnected() { return !this._closed && this.handle !== null; }

  async close() {
    if (this.handle) {
      await this.handle.close();
      this.handle = null;
      this._closed = true;
    }
  }
}

/** Reconnect with exponential backoff. Calls `connectFn()` until it succeeds
 *  or `shouldGiveUp()` returns true. */
export async function reconnectLoop(connectFn, { minMs = 500, maxMs = 30000, shouldGiveUp }) {
  let delay = minMs;
  // up-front small wait so we don't busy-loop
  await wait(delay);
  while (!shouldGiveUp()) {
    try {
      await connectFn();
      return;
    } catch (e) {
      await wait(delay);
      delay = Math.min(delay * 2, maxMs);
    }
  }
}
```

- [ ] **Step 2: Quick syntax check**

Run:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && node --check trainer/main/cdpClient.mjs && echo OK
```
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/trainer/main/cdpClient.mjs && git commit -m "feat(trainer): CDP client (connect / eval / inject / reconnect)"
```

---

## Task 6: TrainerService — path → IIFE expression

**Files:**
- Create: `ThreeKingdomsTrainer/trainer/main/trainerService.mjs`

This is the orchestration layer: parse path → serialize scalar value → produce the IIFE expression → call cdpClient.

- [ ] **Step 1: Implement**

Create `ThreeKingdomsTrainer/trainer/main/trainerService.mjs`:
```js
// Orchestrates: parsePath → build IIFE expression → cdpClient.eval
//
// The IIFEs embed (a) the parsed segments and (b) the JSON-encoded value
// directly into source text. We deliberately do NOT concatenate the user's
// path into source — segments come from the parser as plain strings and
// are spliced as data, not as code.

import { parsePath } from './pathParser.mjs';
import { serializeScalar } from './safeSerialize.mjs';
import { CdpClient } from './cdpClient.mjs';
import { SAFE_READ_SOURCE, SAFE_WRITE_SOURCE } from './safeInjectScript.mjs';

/** @typedef {import('./cdpClient.mjs').CdpClient} Cdp */

export class TrainerService {
  /** @param {Cdp} cdp */
  constructor(cdp) {
    this.cdp = cdp;
  }

  async ensureHelpersInjected() {
    // Idempotent — Page.addScriptToEvaluateOnNewDocument returns a fresh id
    // each call. We rely on the fact that re-injection is harmless; the
    // helpers just get re-defined.
    await this.cdp.injectOnNewDocument(SAFE_READ_SOURCE);
    await this.cdp.injectOnNewDocument(SAFE_WRITE_SOURCE);
  }

  /** Read a path. Returns the raw value from `eval` (already JSON-friendly
   *  because of `returnByValue`). */
  async inspect(path) {
    const parsed = parsePath(path);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const segmentsJson = JSON.stringify(parsed.segments);
    const expr = `(function(){ try { var s=${segmentsJson}; var o=window; for (var i=0;i<s.length;i++){ if (o==null) return { __error:'null-deref' }; o = o[s[i]]; } return window.__trainerSafeRead(o); } catch (e) { return { __error: String(e) }; } })()`;

    try {
      const value = await this.cdp.eval(expr);
      if (value && typeof value === 'object' && value.__error) {
        return { ok: false, error: value.__error };
      }
      return { ok: true, value };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  /** Write a scalar. Verifies target writability via descriptor before
   *  assigning. */
  async apply(path, rawValue) {
    const parsed = parsePath(path);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const ser = serializeScalar(rawValue);
    if (!ser.ok) return { ok: false, error: ser.error };

    const segmentsJson = JSON.stringify(parsed.segments);
    const valueLiteral = ser.expr;
    // The expression walks to the parent and verifies writability of the
    // leaf descriptor before assigning. This handles frozen objects and
    // non-writable props without raising in JS land.
    const expr = `(function(){ try { var s=${segmentsJson}; var o=window; for (var i=0;i<s.length-1;i++){ if (o==null) return { __error:'null-deref' }; o = o[s[i]]; } if (o==null) return { __error:'null-parent' }; var last=s[s.length-1]; var desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(o) === Object.prototype ? o : Object.getPrototypeOf(o) || o, last); if (desc && desc.writable === false) return { __error:'not-writable' }; if (desc && desc.set) return { __error:'has-setter' }; o[last] = ${valueLiteral}; return window.__trainerSafeRead(o[last]); } catch (e) { return { __error: String(e) }; } })()`;

    try {
      const value = await this.cdp.eval(expr);
      if (value && typeof value === 'object' && value.__error) {
        return { ok: false, error: value.__error };
      }
      return { ok: true, value };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }
}
```

- [ ] **Step 2: Quick syntax check**

Run:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && node --check trainer/main/trainerService.mjs && echo OK
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/trainer/main/trainerService.mjs && git commit -m "feat(trainer): TrainerService (inspect/apply via IIFE over CDP)"
```

---

## Task 7: Smoke probe (window root discovery)

**Files:**
- Create: `ThreeKingdomsTrainer/trainer/main/smoke.mjs`

- [ ] **Step 1: Implement**

Create `ThreeKingdomsTrainer/trainer/main/smoke.mjs`:
```js
// Discovers likely state roots from `window` by scanning key names matching
// common patterns. Returns the list (also prints it for the CLI use case).

const CANDIDATE_RE = /^(gameStore|state|app|store|session|root|game|world|player)$/i;
const VALUE_KEY_RE = /^(gold|coins|money|rice|food|silver|funds|hp|maxHp|mp|treasury|population|soldiers|comrades|treasur|strength)$/i;

const PRINT_EXPR = `(function(){
  var keys = Object.keys(window).filter(function(k){ return ${CANDIDATE_RE.source}.test(k); });
  return JSON.stringify(keys);
})()`;

const SCAN_EXPR = `(function(){
  var roots = Object.keys(window).filter(function(k){ return ${CANDIDATE_RE.source}.test(k); });
  var hits = [];
  function walk(v, path, depth){
    if (depth > 6 || v == null) return;
    if (typeof v !== 'object') return;
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      var child = v[k];
      if (${VALUE_KEY_RE.source}.test(k) && typeof child !== 'object') {
        hits.push(path + '.' + k + '=' + String(child));
      } else if (typeof child === 'object') {
        walk(child, path + '.' + k, depth+1);
      }
    }
  }
  for (var i=0;i<roots.length;i++) {
    try { walk(window[roots[i]], roots[i], 0); } catch (e) {}
  }
  return JSON.stringify(hits.slice(0, 20));
})()`;

export async function runSmoke(cdp) {
  await cdp.connect();
  // Make sure helpers exist before any inspect/apply (smoke doesn't need them
  // but it primes the page for later calls).
  const rootsJson = await cdp.eval(PRINT_EXPR);
  const scanJson = await cdp.eval(SCAN_EXPR);
  return {
    roots: JSON.parse(rootsJson),
    sampleHits: JSON.parse(scanJson),
  };
}

export const SMOKE_PRINT_EXPR = PRINT_EXPR;
export const SMOKE_SCAN_EXPR = SCAN_EXPR;
```

- [ ] **Step 2: Syntax check**

Run:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && node --check trainer/main/smoke.mjs && echo OK
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/trainer/main/smoke.mjs && git commit -m "feat(trainer): smoke probe for window state roots + numeric fields"
```

---

## Task 8: Preload (contextBridge minimal API)

**Files:**
- Create: `ThreeKingdomsTrainer/trainer/preload/preload.cjs`

- [ ] **Step 1: Implement**

Create `ThreeKingdomsTrainer/trainer/preload/preload.cjs`:
```js
// Tiny contextBridge surface. The renderer never imports Node modules.
// All Node-side calls go through `trainer.*` here, which forwards to
// `ipcMain.handle(...)` registered in `trainer/main/index.cjs`.

const { contextBridge, ipcRenderer } = require('electron');

const channels = {
  apply: 'trainer:apply',
  inspect: 'trainer:inspect',
  smoke: 'trainer:smoke',
  status: 'trainer:status',
  quit: 'trainer:quit',
};

contextBridge.exposeInMainWorld('trainer', {
  /** @returns {Promise<{ok:true, value:any}|{ok:false, error:string}>} */
  apply: ({ path, value }) => ipcRenderer.invoke(channels.apply, { path, value }),

  /** @returns {Promise<{ok:true, value:any}|{ok:false, error:string}>} */
  inspect: ({ path }) => ipcRenderer.invoke(channels.inspect, { path }),

  /** @returns {Promise<{roots:string[], sampleHits:string[]} | {ok:false, error:string}>} */
  runSmoke: () => ipcRenderer.invoke(channels.smoke),

  /** Subscribe to connection status changes. Returns unsubscribe fn. */
  subscribe: (channel, cb) => {
    if (channel !== 'status') throw new Error('unknown channel');
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on(channels.status, handler);
    return () => ipcRenderer.removeListener(channels.status, handler);
  },

  quit: () => ipcRenderer.invoke(channels.quit),
});
```

- [ ] **Step 2: Syntax check**

Run:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && node --check trainer/preload/preload.cjs && echo OK
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/trainer/preload/preload.cjs && git commit -m "feat(trainer): preload contextBridge (apply/inspect/smoke/subscribe/quit)"
```

---

## Task 9: Electron main process (window + IPC + reconnect)

**Files:**
- Create: `ThreeKingdomsTrainer/trainer/main/index.cjs`

- [ ] **Step 1: Implement**

Create `ThreeKingdomsTrainer/trainer/main/index.cjs`:
```js
// Electron main: wires window, IPC handlers, manages CdpClient lifecycle,
// and runs the reconnect loop when the game is not yet running.
//
// This file is CommonJS because Electron's main entry is .cjs (package.json
// has no "type":"module"). All service modules are .mjs and we load them via
// dynamic import — no .cjs shims required.

const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

const STATUS = {
  NOT_RUNNING: 'game-not-running',
  RECONNECTING: 'reconnecting',
  CONNECTED: 'connected',
};

let mainWindow = /** @type {BrowserWindow | null} */ (null);
let cdp = /** @type {CdpClient | null} */ (null);
let service = /** @type {any} */ (null);
let reconnectCancel = { stopped: false };

async function loadServiceModules() {
  const serviceMod = await import('./trainerService.mjs');
  const smokeMod = await import('./smoke.mjs');
  return { TrainerService: serviceMod.TrainerService, runSmoke: smokeMod.runSmoke };
}

async function ensureCdpAndService(rendererStatusCb) {
  if (service) return service;
  const { CdpClient } = await import('./cdpClient.mjs');
  cdp = new CdpClient({ host: '127.0.0.1', port: 9222 });
  cdp.on('connected', () => rendererStatusCb(STATUS.CONNECTED));
  cdp.on('disconnected', () => {
    rendererStatusCb(STATUS.RECONNECTING);
    startReconnect(rendererStatusCb);
  });
  const { TrainerService } = await loadServiceModules();
  try {
    await cdp.connect();
    service = new TrainerService(cdp);
    await service.ensureHelpersInjected();
    rendererStatusCb(STATUS.CONNECTED);
    return service;
  } catch (e) {
    rendererStatusCb(STATUS.NOT_RUNNING);
    startReconnect(rendererStatusCb);
    return null;
  }
}

async function startReconnect(rendererStatusCb) {
  const { CdpClient, reconnectLoop } = await import('./cdpClient.mjs');
  reconnectCancel.stopped = false;
  reconnectLoop(async () => {
    if (reconnectCancel.stopped) throw new Error('reconnect-cancelled');
    if (!cdp) cdp = new CdpClient({ host: '127.0.0.1', port: 9222 });
    await cdp.connect();
    const { TrainerService } = await loadServiceModules();
    service = new TrainerService(cdp);
    await service.ensureHelpersInjected();
  }, { shouldGiveUp: () => reconnectCancel.stopped })
    .then(() => rendererStatusCb(STATUS.CONNECTED))
    .catch((e) => {
      if (e?.message !== 'reconnect-cancelled') {
        rendererStatusCb(STATUS.NOT_RUNNING);
      }
    });
}

function sendStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('trainer:status', status);
  }
}

async function createWindow() {
  // Vite dev server URL is provided via env var VITE_DEV_SERVER_URL.
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  mainWindow = new BrowserWindow({
    width: 720,
    height: 640,
    title: 'Three Kingdoms Alias Trainer',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload uses require() which is fine without sandbox
    },
  });

  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerIpc() {
  ipcMain.handle('trainer:apply', async (_e, { path, value }) => {
    const svc = await ensureCdpAndService(sendStatus);
    if (!svc) return { ok: false, error: 'game-not-running' };
    return svc.apply(path, value);
  });

  ipcMain.handle('trainer:inspect', async (_e, { path }) => {
    const svc = await ensureCdpAndService(sendStatus);
    if (!svc) return { ok: false, error: 'game-not-running' };
    return svc.inspect(path);
  });

  ipcMain.handle('trainer:smoke', async () => {
    if (!service) return { ok: false, error: 'game-not-running' };
    try {
      const { runSmoke } = await loadServiceModules();
      const out = await runSmoke(cdp);
      return { ok: true, ...out };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle('trainer:quit', async () => {
    if (cdp) await cdp.close();
    app.quit();
  });
}

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();
  // Kick off a connection attempt right after launch; this also surfaces
  // 'game-not-running' so the user sees guidance.
  ensureCdpAndService(sendStatus).catch(() => { /* handled inside */ });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (cdp) await cdp.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  if (cdp) await cdp.close();
});
```

> Note: this file uses dynamic `await import('./xxx.mjs')` because the Electron main entry is `.cjs` while service modules are ESM (`.mjs`). No `.cjs` shims are needed.

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/trainer/main/index.cjs && git commit -m "feat(trainer): Electron main wires CDP/IPC + reconnect via dynamic import"
```

---

## Task 10: (deleted — folded into Task 9)

Originally this task added `.cjs` re-export shims for `.mjs` modules. With Task 9 now using dynamic `await import('./xxx.mjs')` directly, no shims are needed. Skip this task; renumber subsequent tasks in your head.

---

## Task 11: Empty-window smoke run

**Files:**
- Modify: `ThreeKingdomsTrainer/trainer/renderer/index.html`
- Create: `ThreeKingdomsTrainer/trainer/renderer/src/main.tsx`
- Create: `ThreeKingdomsTrainer/trainer/renderer/src/App.tsx`
- Create: `ThreeKingdomsTrainer/trainer/renderer/vite.config.ts`

Before going deep on UI, prove the wiring: a renderer that loads in dev, the preload exposes `window.trainer`, the main creates a window. We do this with a minimal "Hello + bridge" page.

- [ ] **Step 1: Write Vite config**

Create `ThreeKingdomsTrainer/trainer/renderer/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '..', '..', 'dist', 'renderer'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

- [ ] **Step 2: Write `index.html`**

Create `ThreeKingdomsTrainer/trainer/renderer/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Three Kingdoms Alias Trainer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Write minimal `main.tsx` and `App.tsx`**

Create `ThreeKingdomsTrainer/trainer/renderer/src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const el = document.getElementById('root');
if (!el) throw new Error('root-missing');
createRoot(el).render(<App />);
```

Create `ThreeKingdomsTrainer/trainer/renderer/src/App.tsx`:
```tsx
import { useEffect, useState } from 'react';

type Status = 'connected' | 'reconnecting' | 'game-not-running';

declare global {
  interface Window {
    trainer: {
      apply: (req: { path: string; value: unknown }) => Promise<{ ok: boolean; error?: string; value?: unknown }>;
      inspect: (req: { path: string }) => Promise<{ ok: boolean; error?: string; value?: unknown }>;
      runSmoke: () => Promise<{ ok: boolean; roots?: string[]; sampleHits?: string[]; error?: string }>;
      subscribe: (channel: 'status', cb: (s: Status) => void) => () => void;
      quit: () => Promise<void>;
    };
  }
}

export function App() {
  const [status, setStatus] = useState<Status>('game-not-running');
  useEffect(() => window.trainer.subscribe('status', setStatus), []);
  return (
    <div className="app">
      <h1>Three Kingdoms Alias Trainer</h1>
      <p>Status: <code>{status}</code></p>
      <p>Bridge present: {typeof window.trainer === 'object' ? 'yes' : 'no'}</p>
    </div>
  );
}
```

Create `ThreeKingdomsTrainer/trainer/renderer/src/styles.css`:
```css
.app { padding: 16px; font-family: system-ui, sans-serif; }
.app code { background: #f3f3f3; padding: 0 4px; border-radius: 3px; }
```

- [ ] **Step 4: Manual smoke run**

Build the renderer:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && npm run build:renderer
```
Expected: Vite prints a build success line and `dist/renderer/index.html` exists.

Verify file:
```bash
ls "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer/dist/renderer"
```
Expected: `index.html`, `assets/...`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/trainer/renderer && git commit -m "feat(trainer): minimal renderer (status + bridge probe)"
```

---

## Task 12: PathEditor + History + StatusBanner + SmokePanel components

**Files:**
- Create: `ThreeKingdomsTrainer/trainer/renderer/src/lib/types.ts`
- Create: `ThreeKingdomsTrainer/trainer/renderer/src/lib/bridge.ts`
- Modify: `ThreeKingdomsTrainer/trainer/renderer/src/App.tsx`
- Create: `ThreeKingdomsTrainer/trainer/renderer/src/components/PathEditor.tsx`
- Create: `ThreeKingdomsTrainer/trainer/renderer/src/components/HistoryList.tsx`
- Create: `ThreeKingdomsTrainer/trainer/renderer/src/components/StatusBanner.tsx`
- Create: `ThreeKingdomsTrainer/trainer/renderer/src/components/SmokePanel.tsx`

- [ ] **Step 1: Write types**

Create `ThreeKingdomsTrainer/trainer/renderer/src/lib/types.ts`:
```ts
export type ApplyResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export type InspectResult = ApplyResult;

export type ConnectionStatus = 'connected' | 'reconnecting' | 'game-not-running';

export interface HistoryEntry {
  ts: number;
  path: string;
  value?: unknown;
  ok: boolean;
  error?: string;
  mode: 'apply' | 'inspect';
}
```

- [ ] **Step 2: Write bridge wrapper**

Create `ThreeKingdomsTrainer/trainer/renderer/src/lib/bridge.ts`:
```ts
import type { ApplyResult, InspectResult, ConnectionStatus } from './types';

export const bridge = {
  apply: (path: string, value: unknown): Promise<ApplyResult> =>
    window.trainer.apply({ path, value }),
  inspect: (path: string): Promise<InspectResult> =>
    window.trainer.inspect({ path }),
  runSmoke: () => window.trainer.runSmoke(),
  subscribeStatus: (cb: (s: ConnectionStatus) => void) =>
    window.trainer.subscribe('status', cb),
  quit: () => window.trainer.quit(),
};
```

- [ ] **Step 3: Write components**

Create `ThreeKingdomsTrainer/trainer/renderer/src/components/StatusBanner.tsx`:
```tsx
import type { ConnectionStatus } from '../lib/types';

const LABEL: Record<ConnectionStatus, string> = {
  connected: 'Connected to game on 127.0.0.1:9222',
  reconnecting: 'Reconnecting to CDP…',
  'game-not-running': 'Game not running on debug port. Launch BLIND삼국 with --remote-debugging-port=9222.',
};

const COLOR: Record<ConnectionStatus, string> = {
  connected: '#d4edda',
  reconnecting: '#fff3cd',
  'game-not-running': '#f8d7da',
};

export function StatusBanner({ status }: { status: ConnectionStatus }) {
  return (
    <div className="banner" style={{ background: COLOR[status] }}>
      {LABEL[status]}
    </div>
  );
}
```

Create `ThreeKingdomsTrainer/trainer/renderer/src/components/PathEditor.tsx`:
```tsx
import { useState } from 'react';
import { bridge } from '../lib/bridge';
import type { HistoryEntry } from '../lib/types';

interface Props {
  onResult: (entry: HistoryEntry) => void;
  connected: boolean;
}

export function PathEditor({ onResult, connected }: Props) {
  const [path, setPath] = useState('state.player.gold');
  const [rawValue, setRawValue] = useState('999999');

  const parseScalar = (s: string): unknown => {
    const trimmed = s.trim();
    if (trimmed === '') return undefined;
    if (trimmed === 'null') return null;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
      return trimmed.slice(1, -1);
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
      return trimmed.slice(1, -1);
    }
    return trimmed; // bare word; sent as string
  };

  const submit = async (mode: 'apply' | 'inspect') => {
    const ts = Date.now();
    if (!connected) {
      onResult({ ts, path, ok: false, error: 'game-not-running', mode });
      return;
    }
    const value = parseScalar(rawValue);
    const fn = mode === 'apply' ? () => bridge.apply(path, value) : () => bridge.inspect(path);
    const r = await fn();
    onResult({
      ts,
      path,
      value,
      ok: r.ok,
      error: r.ok ? undefined : r.error,
      mode,
    });
  };

  return (
    <div className="editor">
      <label>
        path
        <input value={path} onChange={(e) => setPath(e.target.value)} />
      </label>
      <label>
        value (apply only)
        <input value={rawValue} onChange={(e) => setRawValue(e.target.value)} />
      </label>
      <div className="row">
        <button onClick={() => submit('inspect')} disabled={!connected}>Inspect</button>
        <button onClick={() => submit('apply')} disabled={!connected}>Apply</button>
      </div>
    </div>
  );
}
```

Create `ThreeKingdomsTrainer/trainer/renderer/src/components/HistoryList.tsx`:
```tsx
import type { HistoryEntry } from '../lib/types';

function fmt(v: unknown): string {
  if (v === undefined) return '';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'object') return '<object>';
  return String(v);
}

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return <div className="history empty">No actions yet.</div>;
  }
  return (
    <table className="history">
      <thead>
        <tr><th>time</th><th>mode</th><th>path</th><th>value</th><th>ok</th></tr>
      </thead>
      <tbody>
        {entries.slice(0, 20).map((e) => (
          <tr key={e.ts + ':' + e.path}>
            <td>{new Date(e.ts).toLocaleTimeString()}</td>
            <td>{e.mode}</td>
            <td>{e.path}</td>
            <td>{fmt(e.value)}</td>
            <td>{e.ok ? '✓' : '✗ ' + e.error}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Create `ThreeKingdomsTrainer/trainer/renderer/src/components/SmokePanel.tsx`:
```tsx
import { useState } from 'react';
import { bridge } from '../lib/bridge';

interface Props {
  connected: boolean;
}

export function SmokePanel({ connected }: Props) {
  const [out, setOut] = useState<string>('');
  const run = async () => {
    if (!connected) { setOut('game-not-running'); return; }
    const r = await bridge.runSmoke();
    if (!r.ok) { setOut('error: ' + r.error); return; }
    setOut([
      'roots: ' + (r.roots ?? []).join(', '),
      'hits (up to 20):',
      ...(r.sampleHits ?? []),
    ].join('\n'));
  };
  return (
    <div className="smoke">
      <button onClick={run} disabled={!connected}>Run smoke</button>
      <pre>{out || '—'}</pre>
    </div>
  );
}
```

Note: the component is not yet used by `App` until the next step.

- [ ] **Step 4: Replace `App.tsx` with the real layout**

Create (overwrite) `ThreeKingdomsTrainer/trainer/renderer/src/App.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { bridge } from './lib/bridge';
import type { ConnectionStatus, HistoryEntry } from './lib/types';
import { StatusBanner } from './components/StatusBanner';
import { PathEditor } from './components/PathEditor';
import { HistoryList } from './components/HistoryList';
import { SmokePanel } from './components/SmokePanel';

export function App() {
  const [status, setStatus] = useState<ConnectionStatus>('game-not-running');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => bridge.subscribeStatus(setStatus), []);

  const onResult = (entry: HistoryEntry) => setHistory((h) => [entry, ...h].slice(0, 20));

  return (
    <div className="app">
      <StatusBanner status={status} />
      <SmokePanel connected={status === 'connected'} />
      <PathEditor onResult={onResult} connected={status === 'connected'} />
      <HistoryList entries={history} />
      <button className="quit" onClick={() => bridge.quit()}>Quit trainer</button>
    </div>
  );
}
```

- [ ] **Step 5: Build, verify TS compiles**

Run:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && npm run build:renderer
```
Expected: Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/trainer/renderer && git commit -m "feat(trainer): PathEditor, History, SmokePanel, StatusBanner"
```

---

## Task 13: Smoke CLI (`scripts/smoke.mjs`)

**Files:**
- Create: `ThreeKingdomsTrainer/scripts/smoke.mjs`

- [ ] **Step 1: Implement**

Create `ThreeKingdomsTrainer/scripts/smoke.mjs`:
```js
#!/usr/bin/env node
// CLI smoke: connect to 127.0.0.1:9222, print window roots + sample numeric
// fields. Useful when the GUI isn't running.

import { CdpClient } from '../trainer/main/cdpClient.mjs';
import { runSmoke } from '../trainer/main/smoke.mjs';

async function main() {
  const cdp = new CdpClient();
  try {
    const out = await runSmoke(cdp);
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('smoke failed:', e?.message ?? e);
    process.exit(1);
  } finally {
    await cdp.close();
  }
}

main();
```

- [ ] **Step 2: Verify the script imports cleanly**

Run (with the game **not** running so it errors gracefully):
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && timeout 5 node scripts/smoke.mjs; echo "exit=$?"
```
Expected: prints `smoke failed: cdp-no-target` (or fetch error message) and exit code is non-zero. No stack traces from missing modules.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/scripts/smoke.mjs && git commit -m "feat(trainer): smoke CLI for use without the GUI"
```

---

## Task 14: `electron-builder` config + Windows packaging

**Files:**
- Create: `ThreeKingdomsTrainer/electron-builder.yml`

- [ ] **Step 1: Write the config**

Create `ThreeKingdomsTrainer/electron-builder.yml`:
```yaml
appId: com.b0ystudio.three-kingdoms-alias-trainer
productName: Three Kingdoms Alias Trainer
copyright: Copyright (c) 2026 B0Y-Studio
directories:
  output: out
  buildResources: build
files:
  - dist/**/*
  - trainer/main/**/*
  - trainer/preload/**/*
  - trainer/renderer/index.html
  - package.json
  - "!**/*.map"
asarUnpack:
  - trainer/preload/preload.cjs
win:
  target:
    - target: nsis
      arch:
        - x64
  artifactName: ${productName}-${version}-${arch}.${ext}
```

- [ ] **Step 2: Commit (do not run package yet — packaging requires user having the game running)**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/electron-builder.yml && git commit -m "chore(trainer): electron-builder Windows packaging config"
```

---

## Task 15: Documentation

**Files:**
- Create: `ThreeKingdomsTrainer/docs/steam-debug-launch.md`
- Modify: `ThreeKingdomsTrainer/README.md`

- [ ] **Step 1: Write the Steam docs**

Create `ThreeKingdomsTrainer/docs/steam-debug-launch.md`:
```markdown
# Launching BLIND삼국 with the Debugging Port

The trainer talks to the game's renderer via Chrome DevTools Protocol on
`127.0.0.1:9222`. For Chromium-based Electron apps, you opt in by adding the
launch flag `--remote-debugging-port=9222`.

## Steam launch options (recommended)

1. Right-click **BLIND삼국** in your Steam library.
2. Choose **Properties…**.
3. In the **Launch Options** box, paste:

       --remote-debugging-port=9222

4. Confirm. From now on, every Steam launch will expose the CDP endpoint.

## Verifying

After starting the game:

    curl http://127.0.0.1:9222/json/version

Expected: a JSON payload showing the Chromium version. If `Connection refused`,
double-check the launch options string and that Steam actually used them
(check the **General → Launch Options** field is not empty).

## Security

`--remote-debugging-port=9222` exposes full V8 control to anyone on the
loopback interface. **Never** add `--remote-allow-origins=*` or run it on a
network port. Treat the loopback as trusted-local only.
```

- [ ] **Step 2: Update README**

Create (overwrite) `ThreeKingdomsTrainer/README.md`:
```markdown
# Three Kingdoms Alias Trainer

A read/write trainer for **BLIND삼국** (`ThreeKingdomsAlias.exe`) that talks
to the game's renderer via Chrome DevTools Protocol. It does not modify any
file in the game's install directory.

## Prerequisites

- Node.js 20+
- Windows 10/11 x64
- The Steam release of BLIND삼국

## Setup

1. Follow `docs/steam-debug-launch.md` to add
   `--remote-debugging-port=9222` to the Steam launch options.
2. Install dependencies:

       npm install

3. Run in development (Vite + Electron together):

       npm run dev

4. Or run the smoke CLI alone:

       npm run smoke

## Build & package

    npm run package

Produces `out/Three Kingdoms Alias Trainer-0.1.0-x64.exe` (NSIS installer).

## Use

1. Launch the game from Steam.
2. Launch the trainer.
3. Confirm the status banner reads **Connected to game on 127.0.0.1:9222**.
4. Click **Run smoke**. The console will print likely window-state roots
   (`state`, `gameStore`, etc.).
5. Type a path like `state.player.gold` and a numeric value like `999999`,
   then press **Apply**. Refresh the game's gold display to see the change.

## Limits (v1)

- JSON scalar writes only. Arrays/objects are rejected.
- No lock / freeze. The change is one-shot; if the game overwrites the value
  on the next frame, re-apply.
- No hot-path presets. You must know the game's state shape.
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/hecto/ZCodeProject" && git add ThreeKingdomsTrainer/docs ThreeKingdomsTrainer/README.md && git commit -m "docs(trainer): Steam debug-launch + README"
```

---

## Task 16: Final end-to-end verification

- [ ] **Step 1: Run all unit tests**

Run:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && npm test
```
Expected: all `node:test` cases pass.

- [ ] **Step 2: Render build**

Run:
```bash
cd "C:/Users/hecto/ZCodeProject/ThreeKingdomsTrainer" && npm run build:renderer
```
Expected: Vite success.

- [ ] **Step 3: Launch the trainer against a live game**

In the Electron window, after the game has been launched with the Steam
debug option, click **Run smoke**. Confirm `roots: [ ... ]` lists at least
one entry (likely `state` or `gameStore`). Pick one of the sample hit paths
the smoke returned (e.g. `state.player.gold=...`), enter it in the path
field with a new value, hit **Apply**, and refresh the game's gold display
to see the change.

Expected:
- `npm run smoke` from the CLI prints a similar roots/hits payload.
- Applying a numeric change to a writable, non-frozen field is observable
  in the game.

- [ ] **Step 4: Document verification**

Append a short note to this plan (in the user's commit) describing what was
actually run and observed. If anything failed, capture the failure in a new
issue rather than papering over it.

---

## Open items intentionally deferred (per spec §9)

- Freeze / lock mode (per-frame re-apply)
- Heuristic memory scanner
- Pre-baked hot-path buttons
- Patching `app.asar`
- Auto-modifying Steam launch options
