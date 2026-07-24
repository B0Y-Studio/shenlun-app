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
