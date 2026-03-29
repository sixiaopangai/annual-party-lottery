import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        results: resolve(__dirname, 'results.html'),
        sign: resolve(__dirname, 'sign.html'),
        viewer: resolve(__dirname, 'viewer.html'),
        gate: resolve(__dirname, 'gate.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
