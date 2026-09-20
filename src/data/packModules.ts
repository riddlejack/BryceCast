/** Vite glob registry for context packs. Any pack referenced by the UI data
 *  package or manifest resolves by repo path — new venues/debriefs need no
 *  code change.
 *
 *  Packs are registered as `?url` assets, not as JS modules: the JSON ships as
 *  its own hashed `dist/assets/*.json` file (independently cacheable, and
 *  JSON compresses better than the same data escaped into a JS string or
 *  re-serialized as an object literal) and is fetched + `JSON.parse`d at
 *  runtime by `./packLoader`. Previously each pack was bundled TWICE as JS
 *  modules — a parsed object-literal chunk and a `?raw` string-literal chunk
 *  used only to recompute its integrity hash — which doubled both the bytes
 *  shipped and the JS-eval cost. `packLoader.ts` now does one fetch and gets
 *  both the parsed data and the exact bytes to hash. The test harness
 *  substitutes a Node fs-backed shim for this module (see
 *  scripts/test-ui-context-adapter.mjs). */

export type PackUrlLoader = () => Promise<string>;

export const packUrls: Record<string, PackUrlLoader> = import.meta.glob<string>('../../analysis/**/output/context-packs/**/*.json', {
  query: '?url',
  import: 'default'
});

export const manifestUrls: Record<string, PackUrlLoader> = import.meta.glob<string>(
  '../../analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json',
  { query: '?url', import: 'default' }
);
