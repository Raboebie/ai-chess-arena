/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const apiPort = process.env.VITE_API_PORT ?? '3001';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true },
      '/ws': { target: `ws://localhost:${apiPort}`, ws: true },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/setupTests.ts' },
});
