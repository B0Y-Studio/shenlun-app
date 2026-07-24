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
