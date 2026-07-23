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
