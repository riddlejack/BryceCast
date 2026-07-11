import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // dev-only: forward /api to a locally running `npm run serve:api`
      '/api': {
        target: 'http://127.0.0.1:8787',
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
