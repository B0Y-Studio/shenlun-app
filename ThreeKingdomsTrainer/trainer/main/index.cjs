// Electron main: wires window, IPC handlers, manages CdpClient lifecycle,
// and runs the reconnect loop when the game is not yet running.
//
// This file is CommonJS because Electron's main entry is .cjs (package.json
// has no "type":"module"). All service modules are .mjs and we load them via
// dynamic import — no .cjs shims required.

const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

const STATUS = {
  NOT_RUNNING: 'game-not-running',
  RECONNECTING: 'reconnecting',
  CONNECTED: 'connected',
};

let mainWindow = /** @type {BrowserWindow | null} */ (null);
let cdp = /** @type {CdpClient | null} */ (null);
let service = /** @type {any} */ (null);
let reconnectCancel = { stopped: false };

async function loadServiceModules() {
  const serviceMod = await import('./trainerService.mjs');
  const smokeMod = await import('./smoke.mjs');
  return { TrainerService: serviceMod.TrainerService, runSmoke: smokeMod.runSmoke };
}

async function ensureCdpAndService(rendererStatusCb) {
  if (service) return service;
  const { CdpClient } = await import('./cdpClient.mjs');
  cdp = new CdpClient({ host: '127.0.0.1', port: 9222 });
  cdp.on('connected', () => rendererStatusCb(STATUS.CONNECTED));
  cdp.on('disconnected', () => {
    rendererStatusCb(STATUS.RECONNECTING);
    startReconnect(rendererStatusCb);
  });
  const { TrainerService } = await loadServiceModules();
  try {
    await cdp.connect();
    service = new TrainerService(cdp);
    await service.ensureHelpersInjected();
    rendererStatusCb(STATUS.CONNECTED);
    return service;
  } catch (e) {
    rendererStatusCb(STATUS.NOT_RUNNING);
    startReconnect(rendererStatusCb);
    return null;
  }
}

async function startReconnect(rendererStatusCb) {
  const { CdpClient, reconnectLoop } = await import('./cdpClient.mjs');
  reconnectCancel.stopped = false;
  reconnectLoop(async () => {
    if (reconnectCancel.stopped) throw new Error('reconnect-cancelled');
    if (!cdp) cdp = new CdpClient({ host: '127.0.0.1', port: 9222 });
    await cdp.connect();
    const { TrainerService } = await loadServiceModules();
    service = new TrainerService(cdp);
    await service.ensureHelpersInjected();
  }, { shouldGiveUp: () => reconnectCancel.stopped })
    .then(() => rendererStatusCb(STATUS.CONNECTED))
    .catch((e) => {
      if (e?.message !== 'reconnect-cancelled') {
        rendererStatusCb(STATUS.NOT_RUNNING);
      }
    });
}

function sendStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('trainer:status', status);
  }
}

async function createWindow() {
  // Vite dev server URL is provided via env var VITE_DEV_SERVER_URL.
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  mainWindow = new BrowserWindow({
    width: 720,
    height: 640,
    title: 'Three Kingdoms Alias Trainer',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload uses require() which is fine without sandbox
    },
  });

  // Forward renderer console + errors to main's terminal so we can see
  // exactly what's happening in the bundled React app.
  mainWindow.webContents.on('console-message', (_e, level, message, line, source) => {
    const tag = ['log', 'warn', 'error', 'info'][level] ?? 'log';
    console.log(`[renderer:${tag}] ${message} (${source}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[renderer:load-fail] ${code} ${desc} url=${url}`);
  });

  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerIpc() {
  ipcMain.handle('trainer:apply', async (_e, { path, value }) => {
    const svc = await ensureCdpAndService(sendStatus);
    if (!svc) return { ok: false, error: 'game-not-running' };
    return svc.apply(path, value);
  });

  ipcMain.handle('trainer:inspect', async (_e, { path }) => {
    const svc = await ensureCdpAndService(sendStatus);
    if (!svc) return { ok: false, error: 'game-not-running' };
    return svc.inspect(path);
  });

  ipcMain.handle('trainer:smoke', async () => {
    if (!service) return { ok: false, error: 'game-not-running' };
    try {
      const { runSmoke } = await loadServiceModules();
      const out = await runSmoke(cdp);
      return { ok: true, ...out };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle('trainer:scanCities', async () => {
    if (!service) return { ok: false, error: 'game-not-running' };
    try {
      const value = await cdp.eval(`(()=>{
        var EE = EconomyEngine.getInstance();
        var cs = EE.world.cities;
        var ids = Array.from(cs.keys());
        var out = [];
        for (var i=0;i<ids.length;i++){
          var c = cs.get(ids[i]);
          out.push({
            id: ids[i],
            owner: c.owner,
            soldiers: c.soldiers,
            economy: c.economy,
            agriculture: c.agriculture,
            population: c.population,
            publicOrder: c.publicOrder,
            infantry: (c.troops && c.troops.infantry) || 0,
            archer: (c.troops && c.troops.archer) || 0,
            cavalry: (c.troops && c.troops.cavalry) || 0,
          });
        }
        return JSON.stringify(out);
      })()`);
      return { ok: true, cities: JSON.parse(value) };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle('trainer:scanFactions', async () => {
    if (!service) return { ok: false, error: 'game-not-running' };
    try {
      const value = await cdp.eval(`(()=>{
        var EE = EconomyEngine.getInstance();
        var fs = EE.world.factions;
        var ids = Array.from(fs.keys());
        var out = [];
        for (var i=0;i<ids.length;i++){
          var f = fs.get(ids[i]);
          out.push({
            id: String(ids[i]),
            leaderId: f.leaderId,
            gold: f.gold,
            food: f.food,
            reputation: f.reputation || 0,
          });
        }
        return JSON.stringify(out);
      })()`);
      return { ok: true, factions: JSON.parse(value) };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle('trainer:setAllOfficerRep', async (_e, { factionId, value }) => {
    if (!service) return { ok: false, error: 'game-not-running' };
    try {
      // Direct raw-set: officer.reputation = X bypasses the game's
      // reputationHistory bookkeeping entirely, so we don't flood the
      // log with one entry per officer. The faction's aggregate
      // reputation (which is a derived value) still reflects the change.
      //
      // After the mass raw-set we append ONE summary entry to
      // reputationHistory with source=trainer so the in-game log shows
      // a single audit-trail line for the operation.
      const result = await cdp.eval(`(function(){
        var w = EconomyEngine.getInstance().world;
        var officers = Array.from(w.officers.entries()).filter(function(e){return e[1].faction==="${factionId}";});
        var beforeFac = w.factions.get("${factionId}").reputation || 0;
        var repSumBefore = 0;
        for (var i=0;i<officers.length;i++) repSumBefore += (officers[i][1].reputation||0);
        for (var j=0;j<officers.length;j++) { officers[j][1].reputation = ${value}; }
        var repSumAfter = officers.length * ${value};
        var afterFac = w.factions.get("${factionId}").reputation || 0;
        // Append single summary history entry.
        var h = w.reputationHistory;
        var keys = Array.from(h.keys());
        var nextKey = keys.length === 0 ? 0 : keys.reduce(function(a,b){return Math.max(a,b);}) + 1;
        var gameDate = w.gameDate || {};
        var entry = {
          id: "rep_trainer_" + nextKey,
          turn: gameDate.turn || 0,
          year: gameDate.year || 0,
          month: gameDate.month || 0,
          officerId: null,
          factionId: "${factionId}",
          before: beforeFac,
          after: afterFac,
          delta: afterFac - beforeFac,
          reason: "trainer_mass_set_to_" + ${value},
          source: "trainer",
          meta: { source: "trainer", affectedOfficers: officers.length, value: ${value} }
        };
        h.set(nextKey, entry);
        return JSON.stringify({total: officers.length, repSumBefore: repSumBefore, repSumAfter: repSumAfter, beforeFac: beforeFac, afterFac: afterFac, historyKey: nextKey});
      })()`);
      const parsed = JSON.parse(result);
      return { ok: true, total: parsed.total, newFacRep: parsed.afterFac, historyKey: parsed.historyKey };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle('trainer:quit', async () => {
    if (cdp) await cdp.close();
    app.quit();
  });
}

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();
  // Kick off a connection attempt right after launch; this also surfaces
  // 'game-not-running' so the user sees guidance.
  ensureCdpAndService(sendStatus).catch(() => { /* handled inside */ });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (cdp) await cdp.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  if (cdp) await cdp.close();
});