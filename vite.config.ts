import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
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
