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
