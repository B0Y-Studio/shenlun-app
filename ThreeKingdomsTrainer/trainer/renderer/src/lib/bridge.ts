import type { ApplyResult, InspectResult, ConnectionStatus } from './types';

export const bridge = {
  apply: (path: string, value: unknown): Promise<ApplyResult> =>
    window.trainer.apply({ path, value }),
  inspect: (path: string): Promise<InspectResult> =>
    window.trainer.inspect({ path }),
  runSmoke: () => window.trainer.runSmoke(),
  scanCities: () => window.trainer.scanCities(),
  subscribeStatus: (cb: (s: ConnectionStatus) => void) =>
    window.trainer.subscribe('status', cb),
  quit: () => window.trainer.quit(),
};
