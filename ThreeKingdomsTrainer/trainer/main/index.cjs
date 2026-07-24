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