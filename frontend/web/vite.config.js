import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Baytara Main Website — React SPA (Phase 1)
// base is '/' for local dev/preview, and '/Baytara/' for the GitHub Pages build
// (set via `BUILD_BASE=/Baytara/ npm run build`).
export default defineConfig({
  base: process.env.BUILD_BASE || '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
  test: {
    setupFiles: ['./vitest.setup.js'],
    // The per-test budget, above the async helper deadline in the setup file so a slow
    // assertion reports its own failure rather than being cut off by the runner.
    testTimeout: 15000,
  },
});
