import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
  build: {
    // The manifest is a build-time artifact only (not referenced by
    // index.html or fetched by the client) — useful for auditing which
    // chunks a route pulls in; see scripts in scratch for the route-cost walk.
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // uiDataPackage.ts statically imports this ~1.5 MB JSON at module
          // scope (many screens read `uiDataPackage.screens…` synchronously,
          // so making that import async is a separate, larger refactor — see
          // AGENTS.md/PR notes). Giving it its own chunk means it hashes and
          // caches independently of app code: a code-only deploy no longer
          // invalidates the data, and vice versa, and it decompresses/parses
          // as one dedicated chunk instead of being interleaved with index.js.
          if (id.includes('/analysis/ui-data-package/ui-data-package.json')) return 'ui-data-package';
        }
      }
    }
  },
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
