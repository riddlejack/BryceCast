/* The 3D track model's loads, shared by the model itself (TrackModel3D.tsx)
 * and by pages that know which venue they will draw before the model mounts
 * (prefetchTrackModel). Kept apart from TrackModel3D so a page can start them
 * without pulling the component, three.js or the model into its own chunk:
 * this module is a few hundred bytes and imports nothing.
 *
 * Every load is cached by URL here, so a prefetch and the model's own effects
 * share one request each; nothing is fetched twice. */

export interface ModelIndexEntry {
  file: string;
  kind: string;
  bytes: number;
  gzipBytes: number;
  poster: Record<string, string> | null;
  attribution: string;
}

let indexPromise: Promise<Record<string, ModelIndexEntry> | null> | null = null;
export const loadIndex = () => {
  indexPromise ??= fetch('/tracks-3d/models/index.json')
    .then((response) => (response.ok ? response.json() : null))
    .then((json) => (json?.venues as Record<string, ModelIndexEntry>) ?? null)
    .catch(() => null);
  return indexPromise;
};

/* The build writes a gzip copy of each model beside it (scripts/gzip-track-
 * models.mjs): a quarter of the bytes, and a file Cloudflare caches at its edge
 * (it caches .gz, never .json). It is served as plain bytes, not as an encoded
 * response, so it is unpacked here; the result is the model's exact JSON. Any
 * trouble (no DecompressionStream, no copy, a server that encoded it again)
 * returns null and the caller fetches the .json as before. */
const loadPacked = async (file: string): Promise<unknown> => {
  if (typeof DecompressionStream === 'undefined') return null;
  const response = await fetch(`${file}.gz`);
  if (!response.ok || /text\/html/.test(response.headers.get('content-type') ?? '')) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  // A server that sends the copy with Content-Encoding: gzip (vite preview does) has the browser unpack it already:
  // what arrives is the JSON itself, so read it rather than fetching the .json a second time.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
};

const modelPromises = new Map<string, Promise<unknown>>();
export const loadModel = <T>(file: string): Promise<T> => {
  let promise = modelPromises.get(file);
  if (!promise) {
    promise = loadPacked(file)
      .catch(() => null)
      .then(
        (packed) =>
          packed ??
          fetch(file).then((response) => {
            if (!response.ok) throw new Error(`model ${response.status}`);
            return response.json() as Promise<T>;
          })
      );
    promise.catch(() => modelPromises.delete(file));
    modelPromises.set(file, promise);
  }
  return promise as Promise<T>;
};

let webgl: boolean | null = null;
export const hasWebgl = () => {
  if (webgl === null) {
    try {
      const canvas = document.createElement('canvas');
      webgl = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
      webgl = false;
    }
  }
  return webgl;
};

/* The poster is drawn by TrackModel3D with exactly this srcset and sizes; a
 * preload with the same pair resolves to the same file, so the <img> finds it
 * already loaded instead of starting its own request. */
export const posterSrcSet = (poster: Record<string, string> | null | undefined) =>
  [poster?.['1200'] ? `${poster['1200']} 1200w` : null, poster?.['2400'] ? `${poster['2400']} 2400w` : null].filter(Boolean).join(', ');
export const POSTER_SIZES = '100vw';

const preloadedPosters = new Set<string>();
const preloadPoster = (poster: Record<string, string> | null) => {
  const href = poster?.['1200'];
  if (!href || preloadedPosters.has(href) || typeof document === 'undefined') return;
  preloadedPosters.add(href);
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = href;
  link.setAttribute('imagesrcset', posterSrcSet(poster));
  link.setAttribute('imagesizes', POSTER_SIZES);
  document.head.appendChild(link);
};

const prefetched = new Set<string>();
/** Start everything the model for `slug` will need, now: the component's own
 *  chunk, the renderer (three.js), the model index, the venue's model and its
 *  poster. A page calls this as soon as it knows the venue, so these load
 *  alongside the page's own data instead of after it. A no-op without WebGL
 *  (the model is never drawn there) and on a repeat call for the same venue. */
export const prefetchTrackModel = (slug: string): void => {
  if (prefetched.has(slug) || !hasWebgl()) return;
  prefetched.add(slug);
  const swallow = () => {};
  import('./TrackModel3D').catch(swallow);
  import('./trackScene.js').catch(swallow);
  void loadIndex().then((index) => {
    const entry = index?.[slug];
    if (!entry) return;
    preloadPoster(entry.poster);
    loadModel(entry.file).catch(swallow);
  });
};
