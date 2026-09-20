/** Prefetch-on-intent registry for the lazy routes defined in AppV3.tsx.
 *
 *  Each entry's `load` is the exact same dynamic `import()` specifier that
 *  `lazy()` wraps for that screen, so calling it early — on a `Link` hover,
 *  focus, or touchstart (see `router.tsx`), or once idle after Home renders
 *  — populates the module cache the browser already has by the time React
 *  actually renders the lazy component. Rollup/Vite resolve the identical
 *  specifier to the identical chunk, so this doesn't create a second copy of
 *  any screen; it just starts that chunk's request sooner. */

type RoutePrefetcher = { test: (path: string) => boolean; load: () => Promise<unknown> };

const prefetchers: RoutePrefetcher[] = [
  { test: (path) => path === '/live', load: () => import('../screens/LiveScreen') },
  { test: (path) => path === '/race-week', load: () => import('../screens/RaceWeekScreen') },
  { test: (path) => path === '/races', load: () => import('../screens/RacesScreen') },
  { test: (path) => /^\/races\/[^/]+\/?$/.test(path), load: () => import('../screens/RaceScreen') },
  { test: (path) => path === '/career', load: () => import('../screens/CareerScreen') },
  { test: (path) => /^\/career\/race\/[^/]+\/?$/.test(path), load: () => import('../screens/CareerRaceScreen') },
  { test: (path) => path === '/tracks' || path.startsWith('/tracks/'), load: () => import('../screens/TracksScreen') },
  { test: (path) => path === '/data', load: () => import('../screens/DataScreen') },
  { test: (path) => path === '/about', load: () => import('../screens/AboutScreen') }
];

type NetworkInformationLike = { saveData?: boolean; effectiveType?: string };

const connectionInfo = (): NetworkInformationLike | undefined =>
  (navigator as unknown as { connection?: NetworkInformationLike }).connection;

/** A person on Data Saver, or on a connection Chrome itself classifies as
 *  slow-2g/2g, asked (explicitly or effectively) not to spend their data on
 *  guesses — only fetch what they actually click. */
const shouldSkipSpeculativeLoad = (): boolean => {
  const connection = connectionInfo();
  if (connection?.saveData) return true;
  if (connection?.effectiveType && /(^|-)2g$/.test(connection.effectiveType)) return true;
  return false;
};

const attempted = new Set<string>();

/** Start loading the chunk for `to` (an href, e.g. "/tracks?venue=...") right
 *  now. Safe to call repeatedly — de-duped per href, and a failed prefetch
 *  (offline, flaky network) is forgotten so a later real navigation still
 *  tries the normal way rather than being permanently skipped. */
export const prefetchRoute = (to: string): void => {
  if (attempted.has(to) || shouldSkipSpeculativeLoad()) return;
  const path = to.split(/[?#]/)[0] || '/';
  const entry = prefetchers.find((candidate) => candidate.test(path));
  if (!entry) return;
  attempted.add(to);
  entry.load().catch(() => {
    attempted.delete(to);
  });
};

let idlePrefetchScheduled = false;

/** Speculatively warm the chunks for the routes most people go to right after
 *  Home: Race Week (what's next) and Tracks (the venue cards — the owner's
 *  own "it's slow to open" report). Runs once, in idle time, and is a no-op
 *  on Data Saver / 2G. */
export const idlePrefetchLikelyNextRoutes = (): void => {
  if (idlePrefetchScheduled || shouldSkipSpeculativeLoad()) return;
  idlePrefetchScheduled = true;
  const run = () => {
    prefetchRoute('/race-week');
    prefetchRoute('/tracks');
  };
  const requestIdle = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  if (requestIdle) requestIdle(run, { timeout: 4000 });
  else setTimeout(run, 2000);
};
