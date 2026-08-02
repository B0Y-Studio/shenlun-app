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