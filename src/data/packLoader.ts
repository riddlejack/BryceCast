/** Shared fetch + parse + hash cache for context-pack JSON assets registered
 *  in `packModules.ts` (`packUrls` / `manifestUrls`).
 *
 *  Packs used to be double-shipped as JS modules: one chunk holding the
 *  parsed object literal, and a second `?raw` chunk holding the same JSON as
 *  an escaped JS string, fetched purely to recompute a sha256 for the
 *  integrity check against the ui-data-package source inventory. That is two
 *  downloads and two JS parses of the same bytes.
 *
 *  Now a pack is a plain `.json` asset. One `fetch` gets the exact raw bytes
 *  (for the sha256/byte-length checks the callers already did) and
 *  `JSON.parse` — which is materially faster than V8 evaluating an equivalent
 *  object-literal chunk — produces the data. Every loader in src/data/ that
 *  used to import `packModules`/`packRawModules` in tandem now calls
 *  `loadContextPack`/`loadFirstContextPack` instead; the integrity
 *  comparisons themselves (sha256, byte length, id/type/sessionId fields)
 *  are unchanged. */

interface LoadedPack {
  text: string;
  sha256: string;
  bytes: number;
  json: unknown;
}

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

// Cached by resolved URL (not by repo-path key) so the manifest and a pack
// referenced from two different loaders each fetch/parse/hash exactly once.
const cache = new Map<string, Promise<LoadedPack>>();

const loadByUrl = (url: string, priority?: RequestPriority): Promise<LoadedPack> => {
  let promise = cache.get(url);
  if (!promise) {
    promise = fetch(url, priority ? { priority } : undefined)
      .then((response) => {
        if (!response.ok) throw new Error(`Context pack fetch failed (${response.status}): ${url}`);
        return response.text();
      })
      .then(async (text) => ({
        text,
        sha256: await sha256Hex(text),
        bytes: new TextEncoder().encode(text).byteLength,
        json: JSON.parse(text) as unknown
      }));
    // A failed fetch/parse/hash must not poison later attempts.
    promise.catch(() => cache.delete(url));
    cache.set(url, promise);
  }
  return promise;
};

export interface LoadedContextPack<T> {
  data: T;
  sha256: string;
  bytes: number;
}

/** Resolve a glob-registered pack by its module key (the same
 *  `../../analysis/...json` key `packUrls`/`manifestUrls` are indexed by),
 *  fetch+parse it once, and return the parsed data plus the raw-byte sha256
 *  and byte length for integrity checks. Returns null when the key isn't
 *  registered — mirrors the old `packModules[key]` lookup miss.
 *
 *  `priority` forwards to `fetch`'s Priority Hints (`{ priority: 'low' }`):
 *  a pack a screen loads speculatively/unconditionally on mount but the
 *  person may never look at (e.g. the Quali Lab pack, fetched alongside a
 *  race/venue's — usually wanted — race-section pack) shouldn't contend with
 *  that more-likely-needed request on a slow connection. Chromium honors it;
 *  other engines ignore the unknown RequestInit member harmlessly. */
export const loadContextPack = async <T>(
  urlLoaders: Record<string, () => Promise<string>>,
  key: string,
  priority?: RequestPriority
): Promise<LoadedContextPack<T> | null> => {
  const urlLoader = urlLoaders[key];
  if (!urlLoader) return null;
  const url = await urlLoader();
  const { json, sha256, bytes } = await loadByUrl(url, priority);
  return { data: json as T, sha256, bytes };
};

/** Same as `loadContextPack`, for a glob registry expected to hold exactly
 *  one entry (the context-pack manifest). */
export const loadFirstContextPack = async <T>(
  urlLoaders: Record<string, () => Promise<string>>,
  priority?: RequestPriority
): Promise<LoadedContextPack<T> | null> => {
  const [urlLoader] = Object.values(urlLoaders);
  if (!urlLoader) return null;
  const url = await urlLoader();
  const { json, sha256, bytes } = await loadByUrl(url, priority);
  return { data: json as T, sha256, bytes };
};
