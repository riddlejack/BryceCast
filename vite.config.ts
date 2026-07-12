import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // dev-only: forward /api to a locally running `npm run serve:api`
      '/api': {
        target: process.env.BRYCECAST_API_PROXY ?? 'http://127.0.0.1:8787',
        changeOrigin: true
      },
      '/racecontrol': {
        target: 'https://indycar.blob.core.windows.net',
        changeOrigin: true
      },
      '/ntt-data': {
        target: 'https://indycar.blob.core.windows.net',
        changeOrigin: true
      }
    }
  }
});
