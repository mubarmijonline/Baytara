import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Instructor Portal — served under /instructor/ in prod.
export default defineConfig({
  base: '/instructor/',
  plugins: [react()],
  server: { port: 5175, proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } } },
});
