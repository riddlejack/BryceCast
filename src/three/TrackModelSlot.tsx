import { Suspense, lazy, type ComponentProps } from 'react';

/* The 3D track model behind a lazy boundary: neither the component nor
 * three.js joins the bundle of a page that does not draw it. While the
 * component's own chunk loads, an empty stage of the same shape holds its place. */
const TrackModel3D = lazy(() => import('./TrackModel3D'));

export const TrackModelSlot = (props: ComponentProps<typeof TrackModel3D>) => (
  <Suspense fallback={<div className="track3d-wait" aria-hidden style={{ aspectRatio: '16 / 9', maxHeight: 'min(82vh, 1040px)', minHeight: 300 }} />}>
    <TrackModel3D {...props} />
  </Suspense>
);
