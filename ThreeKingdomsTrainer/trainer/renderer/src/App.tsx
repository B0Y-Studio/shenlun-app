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