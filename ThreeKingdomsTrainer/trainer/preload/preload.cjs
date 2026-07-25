// Tiny contextBridge surface. The renderer never imports Node modules.
// All Node-side calls go through `trainer.*` here, which forwards to
// `ipcMain.handle(...)` registered in `trainer/main/index.cjs`.

const { contextBridge, ipcRenderer } = require('electron');

const channels = {
  apply: 'trainer:apply',
  inspect: 'trainer:inspect',
  smoke: 'trainer:smoke',
  status: 'trainer:status',
  quit: 'trainer:quit',
};

contextBridge.exposeInMainWorld('trainer', {
  /** @returns {Promise<{ok:true, value:any}|{ok:false, error:string}>} */
  apply: ({ path, value }) => ipcRenderer.invoke(channels.apply, { path, value }),

  /** @returns {Promise<{ok:true, value:any}|{ok:false, error:string}>} */
  inspect: ({ path }) => ipcRenderer.invoke(channels.inspect, { path }),

  /** @returns {Promise<{roots:string[], sampleHits:string[]} | {ok:false, error:string}>} */
  runSmoke: () => ipcRenderer.invoke(channels.smoke),

  /** Subscribe to connection status changes. Returns unsubscribe fn. */
  subscribe: (channel, cb) => {
    if (channel !== 'status') throw new Error('unknown channel');
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on(channels.status, handler);
    return () => ipcRenderer.removeListener(channels.status, handler);
  },

  scanCities: () => ipcRenderer.invoke('trainer:scanCities'),
  scanFactions: () => ipcRenderer.invoke('trainer:scanFactions'),
  quit: () => ipcRenderer.invoke(channels.quit),
});
