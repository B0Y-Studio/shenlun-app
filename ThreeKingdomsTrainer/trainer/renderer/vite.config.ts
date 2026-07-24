import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname),
  base: './', // relative paths so the built index.html works under file://
              // (Electron loads it via loadFile, not via an HTTP server)
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '..', '..', 'dist', 'renderer'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});