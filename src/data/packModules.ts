/** Vite glob registry for context packs. Any pack referenced by the UI data
 *  package or manifest resolves by repo path — new venues/debriefs need no
 *  code change. The test harness substitutes a Node fs-backed shim for this
 *  module (see scripts/test-ui-context-adapter.mjs). */

export type JsonModuleLoader = () => Promise<unknown>;
export type RawModuleLoader = () => Promise<unknown>;

export const packModules: Record<string, JsonModuleLoader> = import.meta.glob('../../analysis/**/output/context-packs/**/*.json');

export const packRawModules: Record<string, RawModuleLoader> = import.meta.glob('../../analysis/**/output/context-packs/**/*.json', {
  query: '?raw',
  import: 'default'
});

export const manifestModules: Record<string, JsonModuleLoader> = import.meta.glob(
  '../../analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json'
);

export const manifestRawModules: Record<string, RawModuleLoader> = import.meta.glob(
  '../../analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json',
  { query: '?raw', import: 'default' }
);
