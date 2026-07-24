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
