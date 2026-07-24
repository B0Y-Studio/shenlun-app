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
