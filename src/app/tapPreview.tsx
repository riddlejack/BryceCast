import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import { switchValue } from '../review/switches';
import './tapPreview.css';

/* ---------- one tap to read, a second to open (round 9) ----------
 * Jack's phone review (November 17, 2026): "a mobile tap on one of the dots
 * on any of the charts, instead of it linking directly to the Grand Prix, the
 * first tap should just pop up the hover behavior for that dot ... we need to
 * come up with an elegant solution for the replacement of any hover behavior
 * on the site."
 *
 * One hook for every chart mark whose hover reveals something. With a mouse
 * nothing changes: hover shows, click opens. With a finger:
 *   - the first tap on a mark shows exactly what hover shows (the tooltip,
 *     the highlight, the cross-highlight) and stays on the page;
 *   - a second tap on the same mark opens it, as does the tooltip's own
 *     "Open the race →" (the default; ?tap=plain drops the button and keeps
 *     the second tap);
 *   - a tap on another mark moves the preview; a tap anywhere else lets go.
 *
 * A browser follows a tap with compatibility mouse events (mouseover,
 * mousemove, click). The hook tells them from a real mouse by the last
 * pointer that touched the page, so the finger's taps never run the hover
 * handlers twice and a mouse on a touch-screen laptop still hovers. */

export type TapKey = string | number;

/** How far apart (px) two taps can land and still be one mark tapped twice,
 *  where the chart draws no shape to tell its marks apart. */
const SAME_SPOT = 12;

/** The drawn mark nearest a tap: the smallest unit a reader can point at,
 *  whatever key the chart gives it (the restarts key every dot by its race). */
const markNear = (scope: Element, x: number, y: number): { x: number; y: number } | null => {
  let best: { x: number; y: number } | null = null;
  let bestD = 30;
  const shapes = scope.matches('circle, ellipse, rect, path, polygon, [data-mark]') ? [scope] : [...scope.querySelectorAll('circle, ellipse, rect, path, polygon, [data-mark]')];
  for (const el of shapes) {
    if (el.closest('[data-tap-card]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.width > 28 || r.height > 28) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(cx - x, cy - y);
    if (d < bestD) {
      best = { x: cx, y: cy };
      bestD = d;
    }
  }
  return best;
};

let lastPointer = 'mouse';
let listening = false;
const listen = () => {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  const note = (event: globalThis.PointerEvent) => {
    lastPointer = event.pointerType || 'mouse';
  };
  document.addEventListener('pointerdown', note, { capture: true, passive: true });
  document.addEventListener('pointermove', note, { capture: true, passive: true });
};

/** True while the page is being touched rather than pointed at: the mouse events now are a tap's echo. */
const touching = () => lastPointer === 'touch';

/** The touch card: a tap on it (its button) belongs to the card, never to the chart under it. */
export const TAP_CARD = 'data-tap-card';
const inCard = (event: { target: EventTarget | null }) =>
  event.target instanceof Element && event.target.closest(`[${TAP_CARD}]`) !== null;

/* Marks on the native event: which hooks a press belongs to, and whether a
 * mark already answered it (a mark inside a surface answers first). */
const CLAIMS = Symbol('tapClaims');
const ANSWERED = Symbol('tapAnswered');
type Marked = Event & { [CLAIMS]?: Set<symbol>; [ANSWERED]?: boolean };
const claim = (event: Event, id: symbol) => {
  const marked = event as Marked;
  (marked[CLAIMS] ??= new Set()).add(id);
};
const answered = (event: Event) => (event as Marked)[ANSWERED] === true;
const answer = (event: Event) => {
  (event as Marked)[ANSWERED] = true;
};

/** The review switch: `?tap=plain` keeps the second tap and drops the tooltip's button. */
export const tapMode = (): 'button' | 'plain' => (switchValue('tap') === 'plain' ? 'plain' : 'button');

interface Armed {
  key: TapKey;
  clear: () => void;
  open: (() => void) | null;
}

export interface TapTargetHandlers {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onPointerDown: (event: PointerEvent<Element>) => void;
  onPointerUp: (event: PointerEvent<Element>) => void;
  onClick: (event: MouseEvent<Element>) => void;
}

export interface TapSurfaceHandlers {
  onMouseMove: (event: MouseEvent<Element>) => void;
  onMouseLeave: () => void;
  onPointerDown: (event: PointerEvent<Element>) => void;
  onPointerUp: (event: PointerEvent<Element>) => void;
  onClick: (event: MouseEvent<Element>) => void;
}

export interface TapPreview {
  /** The mark a finger's tap is previewing; null with a mouse, or when nothing is held. */
  armed: TapKey | null;
  /** ?tap=plain: no button on the card, the second tap opens. */
  plain: boolean;
  /** Opens the previewed mark (the card's action); null when it opens nothing. */
  openArmed: (() => void) | null;
  /** Lets go of the preview, as a tap elsewhere does. */
  dismiss: () => void;
  /** Handlers for one mark: `show` and `hide` are its hover, `open` its click. */
  target: (key: TapKey, handlers: { show: () => void; hide: () => void; open?: (() => void) | null }) => TapTargetHandlers;
  /** Handlers for a chart that finds the mark under the pointer: `find` is its
   *  mouse-move (shows the mark and returns its key, or clears and returns
   *  null), `clear` its mouse-leave, `open` what a click on that mark does. */
  surface: (handlers: {
    find(event: MouseEvent<Element>): TapKey | null;
    clear(): void;
    open?(key: TapKey): (() => void) | null;
  }) => TapSurfaceHandlers;
  /** For a chart with its own gestures (the globe): call on pointer down... */
  press: (event: PointerEvent<Element>) => void;
  /** ...on a finger's pointer up, once the chart has shown `key` (null: nothing there)... */
  settle: (event: PointerEvent<Element>, key: TapKey | null, clear: () => void, open: (() => void) | null) => void;
  /** ...and on click: a tap's click opens only when it earned it; a mouse's runs `mouse`. */
  click: (event: MouseEvent<Element>, mouse: () => void) => void;
}

export const useTapPreview = (): TapPreview => {
  const [armed, setArmed] = useState<TapKey | null>(null);
  const [plain] = useState(() => tapMode() === 'plain');
  const armedRef = useRef<Armed | null>(null);
  /* The mark held when this finger went down (undefined: no finger down), and
   * the open a second tap on it earned. */
  const heldAtDown = useRef<TapKey | null | undefined>(undefined);
  const earned = useRef<(() => void) | null>(null);
  /* Where the finger read the held mark, and where it was at this press: a
   * chart that keys several dots by one race (the restarts) must not open
   * that race when the finger moves to the next dot of it. */
  const heldAt = useRef<{ x: number; y: number; mark: { x: number; y: number } | null } | null>(null);
  const heldAtDownPoint = useRef<{ x: number; y: number; mark: { x: number; y: number } | null } | null>(null);
  const id = useRef<symbol>(Symbol('tap'));

  useEffect(listen, []);

  const dismiss = useCallback(() => {
    const held = armedRef.current;
    armedRef.current = null;
    earned.current = null;
    heldAt.current = null;
    setArmed(null);
    held?.clear();
  }, []);

  /* A tap anywhere else lets go: anything this hook's marks did not claim, and not the card. */
  useEffect(() => {
    if (armed === null) return undefined;
    const away = (event: globalThis.PointerEvent) => {
      if ((event as Marked)[CLAIMS]?.has(id.current)) return;
      if (inCard(event)) return;
      dismiss();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [armed, dismiss]);

  const press = (event: PointerEvent<Element>) => {
    if (event.pointerType !== 'touch' || inCard(event)) return;
    claim(event.nativeEvent, id.current);
    heldAtDown.current = armedRef.current?.key ?? null;
    heldAtDownPoint.current = armedRef.current ? heldAt.current : null;
  };

  /** Let go of the mark held before this tap, so the next one shows clean. */
  const letGo = () => {
    const held = armedRef.current;
    armedRef.current = null;
    held?.clear();
  };

  const settle = (event: PointerEvent<Element>, key: TapKey | null, clear: () => void, open: (() => void) | null) => {
    if (event.pointerType !== 'touch') return;
    const before = heldAtDown.current;
    const beforeAt = heldAtDownPoint.current;
    heldAtDown.current = undefined;
    heldAtDownPoint.current = null;
    if (key === null) {
      armedRef.current = null;
      earned.current = null;
      heldAt.current = null;
      setArmed(null);
      return;
    }
    const here = { x: event.clientX, y: event.clientY, mark: event.currentTarget instanceof Element ? markNear(event.currentTarget, event.clientX, event.clientY) : null };
    /* A second tap opens only on the same mark: the same drawn dot where the
     * chart draws one, else the same spot. A neighbouring dot that shares the
     * mark's key reads instead. */
    const same =
      before === key &&
      beforeAt !== null &&
      (here.mark && beforeAt.mark ? Math.hypot(here.mark.x - beforeAt.mark.x, here.mark.y - beforeAt.mark.y) <= 3 : Math.hypot(here.x - beforeAt.x, here.y - beforeAt.y) <= SAME_SPOT);
    earned.current = same && open ? open : null;
    armedRef.current = { key, clear, open };
    heldAt.current = here;
    setArmed(key);
  };

  const click = (event: MouseEvent<Element>, mouse: () => void) => {
    /* detail 0 is a keyboard's click (Enter on a focused mark): it opens, as before. */
    if (event.detail !== 0 && touching()) {
      const go = earned.current;
      earned.current = null;
      if (go) go();
      else event.preventDefault();
      return;
    }
    mouse();
  };

  const target: TapPreview['target'] = (key, { show, hide, open = null }) => ({
    onMouseEnter: () => {
      if (!touching()) show();
    },
    onMouseLeave: () => {
      if (!touching()) hide();
    },
    onPointerDown: press,
    onPointerUp: (event) => {
      if (event.pointerType !== 'touch' || inCard(event)) return;
      answer(event.nativeEvent);
      letGo();
      show();
      settle(event, key, hide, open);
    },
    onClick: (event) => {
      if (answered(event.nativeEvent)) return;
      answer(event.nativeEvent);
      click(event, () => open?.());
    }
  });

  const surface: TapPreview['surface'] = ({ find, clear, open }) => ({
    onMouseMove: (event) => {
      if (!touching()) find(event);
    },
    onMouseLeave: () => {
      if (!touching()) clear();
    },
    onPointerDown: press,
    onPointerUp: (event) => {
      if (event.pointerType !== 'touch' || inCard(event) || answered(event.nativeEvent)) return;
      letGo();
      const key = find(event);
      settle(event, key, clear, key === null ? null : open?.(key) ?? null);
    },
    onClick: (event) => {
      if (answered(event.nativeEvent)) return;
      click(event, () => {
        const key = find(event);
        if (key !== null) open?.(key)?.();
      });
    }
  });

  const held = armedRef.current;
  const openArmed = armed !== null && held && held.key === armed && held.open ? held.open : null;

  return { armed, plain, openArmed, dismiss, target, surface, press, settle, click };
};

/* ---------- the card a tap opens: inside the screen, off the marks ---------- *
 * Proxy review 3 (Nov 18): with a card open, a tap on a neighbouring mark at
 * 393 often landed on the card and opened the card's race. Three rules now:
 *   - the card goes where it covers the fewest of the chart's marks: any spot
 *     on the screen, above the tab bar, that leaves the tapped mark clear and
 *     hides least (the button's band counts triple, since a tap there opens);
 *     ties go to the spot nearest the mark;
 *   - a second tap opens only on the same drawn mark (same centre), not on
 *     another dot the chart keys by the same race;
 *   - the card's body lets a tap through to the chart under it (CSS:
 *     [data-tap-card] is pointer-events none, its button and links auto), so a
 *     mark under the card's words still reads;
 *   - only the button opens, and not in the first moment after the card
 *     appears or changes (TapAction). */

const GUTTER = 8;
const GAP = 10;
const BUTTON_BAND = 48;
const MARK_MAX = 28;

/** The chart's marks in screen space: its small SVG shapes and tagged marks. */
const marksIn = (parent: HTMLElement, card: HTMLElement): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  for (const el of parent.querySelectorAll('svg circle, svg ellipse, svg rect, svg path, svg polygon, [data-mark]')) {
    if (card.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.width > MARK_MAX || r.height > MARK_MAX) continue;
    out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  return out;
};

/** Places a touch card off the chart's marks where it can, centred on its
 *  mark and kept inside the screen and above the tab bar. `x`, `y` are the
 *  mark's top in the card's positioned parent; `under` is the y below it. */
export const useTouchPlacement = (
  ref: RefObject<HTMLElement | null>,
  x: number,
  y: number,
  under: number,
  content: unknown
): CSSProperties => {
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const card = ref.current;
    const parent = card?.offsetParent;
    if (!card || !(parent instanceof HTMLElement)) return;
    const box = parent.getBoundingClientRect();
    const originX = box.left + parent.clientLeft;
    const originY = box.top + parent.clientTop;
    const screenW = document.documentElement.clientWidth || window.innerWidth;
    const tabbar = document.querySelector('.tabbar');
    const tabTop = tabbar ? tabbar.getBoundingClientRect().top : window.innerHeight;
    const floor = Math.min(window.innerHeight, tabTop > 0 ? tabTop : window.innerHeight);
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const left = Math.max(GUTTER, Math.min(originX + x - w / 2, screenW - GUTTER - w));
    const markTop = originY + y;
    const markBottom = originY + under;

    /* Every top that fits on screen, 4 px apart, scored by the marks the card
     * would hide (those under its button count three times) and then by how
     * far it sits from the tapped mark. Tall charts (the explorer, Rain, the
     * climb) have marks everywhere, so the four classic spots (above or below
     * the mark, above or below the chart) are often all on top of other marks. */
    const fits = (top: number) => top >= GUTTER && top + h <= floor - GUTTER;
    const marks = marksIn(parent, card);
    const covers = (top: number) => {
      let n = 0;
      for (const m of marks) {
        if (m.x < left - 4 || m.x > left + w + 4 || m.y < top - 4 || m.y > top + h + 4) continue;
        n += m.y >= top + h - BUTTON_BAND ? 3 : 1;
      }
      return n;
    };
    const away = (top: number) => {
      if (top + h <= markTop - GAP) return markTop - GAP - (top + h);
      if (top >= markBottom + GAP) return top - (markBottom + GAP);
      return Infinity; // on the tapped mark itself
    };
    const tops = [markTop - GAP - h, markBottom + GAP, box.top - GAP - h, box.bottom + GAP];
    for (let top = GUTTER; top + h <= floor - GUTTER; top += 4) tops.push(top);
    let best: number | null = null;
    let bestCost = Infinity;
    for (const top of tops) {
      if (!fits(top)) continue;
      const gap = away(top);
      if (!Number.isFinite(gap)) continue;
      const c = covers(top) * 10000 + gap;
      if (c < bestCost) {
        best = top;
        bestCost = c;
      }
    }
    if (best === null) {
      /* nowhere fits whole: the side of the mark with more room, as before */
      const above = markTop - GAP - h;
      const below = markBottom + GAP;
      const goBelow = !(above >= GUTTER) && (below + h <= floor - GUTTER || floor - markBottom > markTop);
      best = goBelow ? below : above;
    }
    const next = { left: left - originX, top: best - originY };
    setPlace((current) => (current && Math.abs(current.left - next.left) < 0.5 && Math.abs(current.top - next.top) < 0.5 ? current : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, under, content]);
  return place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: 'hidden' };
};

const BUTTON_SETTLE_MS = 350;

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** The card's action on a touch screen: a thumb-sized "Open the race →"
 *  (the default), or with ?tap=plain the line "tap again to open the race".
 *  A note that is not an action (the pass marks' "placed between timing
 *  loops") reads as it does under a mouse. */
export const TapAction = ({ tap, label, fallback = 'open the race' }: { tap?: TapPreview; label?: string | null; fallback?: string }) => {
  const open = tap?.openArmed ?? null;
  /* The moment a card appears or changes mark, its button holds still: a
   * finger already on its way down to the next dot cannot open this race. */
  const shownAt = useRef(0);
  const armedKey = tap?.armed ?? null;
  useEffect(() => {
    shownAt.current = performance.now();
  }, [armedKey]);
  if (open) {
    const words = label ?? fallback;
    if (tap?.plain) return <div className="tap-card__again">Tap again to {lower(words)}</div>;
    return (
      <button
        type="button"
        className="tap-card__open"
        onClick={(event) => {
          event.stopPropagation();
          if (performance.now() - shownAt.current < BUTTON_SETTLE_MS) return;
          open();
        }}
      >
        <span>{capitalise(words)}</span>
        <span aria-hidden>→</span>
      </button>
    );
  }
  return label ? <div className="tap-card__note">{label}</div> : null;
};
