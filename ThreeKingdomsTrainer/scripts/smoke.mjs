#!/usr/bin/env node
// CLI smoke: connect to 127.0.0.1:9222, print window roots + sample numeric
// fields. Useful when the GUI isn't running.

import { CdpClient } from '../trainer/main/cdpClient.mjs';
import { runSmoke } from '../trainer/main/smoke.mjs';

async function main() {
  const cdp = new CdpClient();
  try {
    const out = await runSmoke(cdp);
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('smoke failed:', e?.message ?? e);
    process.exit(1);
  } finally {
    await cdp.close();
  }
}

main();
