import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The client lives in ./client and builds into dist/public, which the Express
// server serves. In development, /api is proxied to the Node server.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
});
