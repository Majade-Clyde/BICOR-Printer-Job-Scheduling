import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || (process.env.GITHUB_ACTIONS ? '/BICOR-Printer-Job-Scheduling/' : '/'),
  server: {
    port: 5173,
    open: false
  }
});
