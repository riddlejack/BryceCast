import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: { env: Record<string, string | undefined> };

// Where `/api/*` goes. Unset: a locally running `npm run serve:api` (dev only,
// as before; `vite preview` has no API proxy). Set, e.g.
// `BRYCECAST_API_PROXY=https://brycecast.com`, it forwards both the dev server
// and `vite preview` there, so a local build can play the production replay
// archive. A remote (non-loopback) target is read-only: anything but GET/HEAD
// is answered 404 locally and never forwarded.
const apiProxyTarget = process.env.BRYCECAST_API_PROXY;
const apiProxyIsRemote = (() => {
  if (!apiProxyTarget) return false;
  try {
    return !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(new URL(apiProxyTarget).hostname);
  } catch {
    return false;
  }
})();
const apiProxy = {
  target: apiProxyTarget ?? 'http://127.0.0.1:8787',
  changeOrigin: true,
  bypass: (req: { method?: string }) =>
    apiProxyIsRemote && req.method !== 'GET' && req.method !== 'HEAD' ? false : undefined
};

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
      // forward /api to a locally running `npm run serve:api`, or to
      // BRYCECAST_API_PROXY when set (see apiProxy above)
      '/api': apiProxy,
      '/racecontrol': {
        target: 'https://indycar.blob.core.windows.net',
        changeOrigin: true
      },
      '/ntt-data': {
        target: 'https://indycar.blob.core.windows.net',
        changeOrigin: true
      }
    }
  },
  // `vite preview` proxies /api only when BRYCECAST_API_PROXY is set, so the
  // default preview of a build is unchanged.
  ...(apiProxyTarget ? { preview: { proxy: { '/api': apiProxy } } } : {})
});
