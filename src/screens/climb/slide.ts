import { useRef, type MouseEvent, type PointerEvent } from 'react';
import type { TapKey, TapPreview, TapSurfaceHandlers } from '../../app/tapPreview';

/* Every dot in reach of a finger (proxy review 2, November 18, 2026).
 *
 * On a phone the climb's 175 dots share about 340 px, two pixels a race, so
 * no dot can own a 24 px target of its own. Two things give every one of them
 * one without changing a drawn dot:
 *   - a tap takes the nearest dot within at least 24 px every way (the
 *     chart's own `find`, with its touch reach);
 *   - a finger that slides sideways after the tap walks the preview race by
 *     race under it, nearest by x only, so a dot two pixels from its
 *     neighbour is a short slide away. Lifting keeps the race it reached;
 *     the card's "Open the race" (or a second tap on it) opens it.
 * Vertical movement is left to the page, so the chart never traps a scroll. */

const SLIDE_PX = 8;

export interface Slide {
  /** True while a finger is sliding across the chart: `find` should go by x only. */
  sliding: () => boolean;
  /** The surface's handlers with the slide folded in. */
  handlers: TapSurfaceHandlers & { onPointerMove: (event: PointerEvent<Element>) => void; onPointerCancel: () => void };
}

export const useSlide = (
  tap: TapPreview,
  find: (event: MouseEvent<Element>) => TapKey | null,
  clear: () => void,
  open: (key: TapKey) => (() => void) | null
): Slide => {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const sliding = useRef(false);
  const surface = tap.surface({ find, clear, open });
  const end = () => {
    start.current = null;
    sliding.current = false;
  };
  return {
    sliding: () => sliding.current,
    handlers: {
      ...surface,
      onPointerDown: (event) => {
        surface.onPointerDown(event);
        if (event.pointerType === 'touch') {
          start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
          sliding.current = false;
        }
      },
      onPointerMove: (event) => {
        const s = start.current;
        if (!s || event.pointerType !== 'touch' || event.pointerId !== s.id) return;
        if (!sliding.current) {
          const dx = Math.abs(event.clientX - s.x);
          if (dx < SLIDE_PX || dx < Math.abs(event.clientY - s.y)) return;
          sliding.current = true;
        }
        const key = find(event);
        tap.settle(event, key, clear, key === null ? null : open(key));
      },
      onPointerUp: (event) => {
        surface.onPointerUp(event);
        end();
      },
      onPointerCancel: end
    }
  };
};
