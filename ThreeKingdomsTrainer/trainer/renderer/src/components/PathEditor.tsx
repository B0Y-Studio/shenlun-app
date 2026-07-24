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
