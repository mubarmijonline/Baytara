import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Admin Portal (Material Design 3 look, brand navy/gold palette).
// Dev proxies /api -> Flask backend so the SPA and API share an origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
});
