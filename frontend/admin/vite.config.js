import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Admin Portal (Material Design 3 look, brand navy/gold palette).
// Dev proxies /api -> Flask backend so the SPA and API share an origin.
export default defineConfig({
  // served under https://baytara.app/admin/ in prod
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  // As in the website's config: a deadline above the async helpers' so a slow assertion
  // reports itself, and one file at a time, because these suites render the whole admin
  // into jsdom and running them together on two cores is what made them time out.
  test: {
    setupFiles: ['./vitest.setup.js'],
    testTimeout: 15000,
    fileParallelism: false,
  },
});
