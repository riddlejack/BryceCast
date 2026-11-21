import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { inkGoldDiverging, useReducedMotion } from '../app/charts';
import { Link } from '../app/router';
import { trackSectionsFor } from '../assets/tracks/sections';
import { loadSectionLaps } from '../data/sectionLaps';
import { anchorsForPack, resolveHeatSections, sectionObservationsFromLaps } from '../data/sectionObservations';

/* ============================================================
 * The landing hero's 3D still, answering the hand (site refresh, Nov 14 2026).
 *
 * The still is a picture, so the page cannot ask it where the track is. The
 * stills tools render a matching ID map from the film rig: the same camera,
 * no lighting, no antialiasing, each timing section of the shaded band one
 * flat colour, everything else black (public/tracks-3d/…-ids.png, with its
 * legend …-ids.json; Portfolio/…/site-refresh/stills-tools, "run.sh ids").
 * A pixel of the ID map is a section exactly where that section shows in the
 * still. The page reads the pixel under the pointer (or the tap), lights that
 * section from the same map, and reads out his median time there against the
 * field median, from the same section pack the shading came from (the Tracks
 * page's resolveHeatSections over sectionObservationsFromLaps, full race,
 * clean green-flag laps, basis 'field_times': the share of the other cars his
 * time beat, as the stills are shaded since round 6). At rest the strongest
 * section is lit and named. The lit section keeps its own colour, ringed in
 * ink (Jack's review of Nov 16: a fixed orange made every stretch look gold).
 * ============================================================ */

export interface HeroStillSpec {
  sessionId: string;
  src: string;
  src1200: string;
  ids: string;
  legend: string;
  width: number;
  height: number;
  alt: string;
}

interface LegendSection {
  k: number;
  familyId: string;
  sectionName: string;
  label: string;
  kind: 'measured' | 'derived_remainder';
  pixels: number;
  box: [number, number, number, number] | null;
}

interface Legend {
  width: number;
  height: number;
  sections: LegendSection[];
}

/** One section as the readout needs it: the legend's place in the picture,
 *  joined to the race's section pace by familyId. */
interface HeroSection extends LegendSection {
  percentile: number;
  bryceSeconds: number | null;
  fieldSeconds: number | null;
}

/* The ID map's colour code (finish_ids.py): black is not track; otherwise
 * k = round((R - 8) / 16) + 16 * round((G - 8) / 16), with B = 128. */
const decodeIds = (rgba: Uint8ClampedArray, count: number): Uint8Array => {
  const ids = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    if (rgba[o + 2] < 64) continue;
    ids[i] = Math.round((rgba[o] - 8) / 16) + 16 * Math.round((rgba[o + 1] - 8) / 16);
  }
  return ids;
};

/** "rgb(222, 158, 61)" or "#de9e3d" to [r, g, b]; amber if unreadable. */
const rgbOf = (colour: string): [number, number, number] => {
  const rgb = colour.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = colour.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [parseInt(hex[1].slice(0, 2), 16), parseInt(hex[1].slice(2, 4), 16), parseInt(hex[1].slice(4, 6), 16)];
  return [0xcc, 0x7e, 0x16];
};

/** The lit look of one section, drawn once into its own small canvas (its box
 *  plus a margin): the section in its own heat colour (the colour the still
 *  shades it with), ringed in ink two pixels wide (about one CSS pixel at the
 *  hero's size), so it reads on gold and grey alike. */
const RING = 2;
const litCanvasFor = (ids: Uint8Array, width: number, height: number, section: LegendSection, colour: string): HTMLCanvasElement | null => {
  if (!section.box) return null;
  const [red, green, blue] = rgbOf(colour);
  const pad = RING + 1;
  const x0 = Math.max(0, section.box[0] - pad);
  const y0 = Math.max(0, section.box[1] - pad);
  const x1 = Math.min(width - 1, section.box[2] + pad);
  const y1 = Math.min(height - 1, section.box[3] + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(w, h);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && ids[y * width + x] === section.k;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const gx = x + x0;
      const gy = y + y0;
      const o = (y * w + x) * 4;
      if (inside(gx, gy)) {
        image.data[o] = red;
        image.data[o + 1] = green;
        image.data[o + 2] = blue;
        image.data[o + 3] = 255;
        continue;
      }
      let near = false;
      for (let dy = -RING; dy <= RING && !near; dy += 1)
        for (let dx = -RING; dx <= RING && !near; dx += 1)
          if (dx * dx + dy * dy <= RING * RING + 1) near = inside(gx + dx, gy + dy);
      if (near) {
        /* --ink #1E1C1A */
        image.data[o] = 0x1e;
        image.data[o + 1] = 0x1c;
        image.data[o + 2] = 0x1a;
        image.data[o + 3] = 235;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  canvas.dataset.x = String(x0);
  canvas.dataset.y = String(y0);
  return canvas;
};

const fmtSeconds = (value: number): string => `${value.toFixed(3)} s`;

/** "0.081 s quicker than the field", "0.034 s slower than the field". */
const deltaPhrase = (section: HeroSection): string | null => {
  if (section.bryceSeconds === null || section.fieldSeconds === null) return null;
  const delta = section.fieldSeconds - section.bryceSeconds;
  if (Math.abs(delta) < 0.0005) return 'level with the field';
  return `${fmtSeconds(Math.abs(delta))} ${delta > 0 ? 'quicker' : 'slower'} than the field`;
};

/** The short form for the label on the picture, in words (his rule of Nov 15:
 *  signed seconds only in dense charts with a legend): "0.081 s quicker". */
const deltaShort = (section: HeroSection): string | null => {
  if (section.bryceSeconds === null || section.fieldSeconds === null) return null;
  const delta = section.fieldSeconds - section.bryceSeconds;
  if (Math.abs(delta) < 0.0005) return 'level';
  return `${fmtSeconds(Math.abs(delta))} ${delta > 0 ? 'quicker' : 'slower'}`;
};

/* Round 4 (Jack's review, Nov 15): the hero is one grid. The words, and under
 * them the readout as the map's legend, share the page's left edge; the still
 * sits right with its caption directly under it, aligned to it. The readout
 * lives here (not under the picture) so the hand on the map and the words it
 * changes stay one component; on a phone the readout and caption drop under
 * the picture (home.css). */
export const HeroStill = ({ spec, lead, caption }: { spec: HeroStillSpec; lead: ReactNode; caption: ReactNode }) => {
  const reduced = useReducedMotion();
  const [legend, setLegend] = useState<Legend | null>(null);
  const [ids, setIds] = useState<Uint8Array | null>(null);
  const [pace, setPace] = useState<Map<string, { percentile: number; bryce: number | null; field: number | null }> | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pointing, setPointing] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const litCache = useRef(new Map<number, HTMLCanvasElement | null>());
  const lastPointerType = useRef<string>('mouse');
  const frame = useRef<number | null>(null);

  /* The ID map and its legend: small files, fetched after the still. */
  useEffect(() => {
    let cancelled = false;
    fetch(spec.legend)
      .then((response) => (response.ok ? (response.json() as Promise<Legend>) : null))
      .then((value) => {
        if (!cancelled && value) setLegend(value);
      })
      .catch(() => {});
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      setIds(decodeIds(data, canvas.width * canvas.height));
    };
    image.src = spec.ids;
    return () => {
      cancelled = true;
    };
  }, [spec.ids, spec.legend]);

  /* The race's section pace: the pack the shading came from, resolved the way
   * the race page resolves it. */
  useEffect(() => {
    let cancelled = false;
    loadSectionLaps(spec.sessionId)
      .then((pack) => {
        if (cancelled || !pack) return;
        const fallback = trackSectionsFor(pack.venueName);
        if (!fallback) return;
        const set = sectionObservationsFromLaps(pack);
        const resolved = resolveHeatSections(anchorsForPack(pack, fallback), set, { basis: 'field_times' });
        const byName = new Map(set.sections.map((observation) => [observation.sectionName, observation]));
        const map = new Map<string, { percentile: number; bryce: number | null; field: number | null }>();
        for (const section of resolved) {
          const observation = byName.get(section.sectionName);
          map.set(section.familyId, {
            percentile: section.percentile,
            bryce: observation?.bryceMedianSeconds ?? null,
            field: observation?.fieldMedianSeconds ?? null
          });
        }
        setPace(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [spec.sessionId]);

  /* Sections in lap order, joined by familyId; a legend section with no pace
   * in this race (none today) is left out rather than read as zero. */
  const sections = useMemo<HeroSection[]>(() => {
    if (!legend || !pace) return [];
    return legend.sections.flatMap((section) => {
      const entry = pace.get(section.familyId);
      if (!entry || !section.box) return [];
      return [
        {
          ...section,
          percentile: entry.percentile,
          bryceSeconds: entry.bryce,
          fieldSeconds: entry.field
        }
      ];
    });
  }, [legend, pace]);
  const byK = useMemo(() => new Map(sections.map((section) => [section.k, section])), [sections]);

  /* The default: his strongest measured section, by the same percentile the
   * shading uses (the most gold stretch in the picture). */
  const strongest = useMemo(() => {
    const measured = sections.filter((section) => section.kind === 'measured');
    return measured.length > 0
      ? measured.reduce((best, section) => (section.percentile > best.percentile ? section : best))
      : null;
  }, [sections]);

  const shownK = active ?? strongest?.k ?? null;
  const shown = shownK !== null ? (byK.get(shownK) ?? null) : null;
  const isDefault = active === null || active === strongest?.k;

  /* Paint the overlay: the lit section, and a paper veil over the rest of the
   * picture while the hand is on it. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !legend) return;
    if (canvas.width !== legend.width) canvas.width = legend.width;
    if (canvas.height !== legend.height) canvas.height = legend.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!ids || !shown) return;
    let lit = litCache.current.get(shown.k);
    if (lit === undefined) {
      lit = litCanvasFor(ids, legend.width, legend.height, shown, inkGoldDiverging(shown.percentile));
      litCache.current.set(shown.k, lit);
    }
    if (!lit) return;
    ctx.drawImage(lit, Number(lit.dataset.x), Number(lit.dataset.y));
  }, [ids, legend, shown]);

  /* The section under a point (client px), or the nearest within ~12 CSS px:
   * the band is a few pixels wide, so the hand gets a little slack. */
  const hitAt = useCallback(
    (clientX: number, clientY: number): number | null => {
      const wrap = wrapRef.current;
      if (!wrap || !ids || !legend) return null;
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const scale = legend.width / rect.width;
      const x = Math.round((clientX - rect.left) * scale);
      const y = Math.round((clientY - rect.top) * scale);
      const at = (px: number, py: number) =>
        px >= 0 && py >= 0 && px < legend.width && py < legend.height ? ids[py * legend.width + px] : 0;
      const direct = at(x, y);
      if (direct && byK.has(direct)) return direct;
      const radius = Math.ceil(12 * scale);
      let best: number | null = null;
      let bestDist = Infinity;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const dist = dx * dx + dy * dy;
          if (dist >= bestDist || dist > radius * radius) continue;
          const k = at(x + dx, y + dy);
          if (k && byK.has(k)) {
            best = k;
            bestDist = dist;
          }
        }
      }
      return best;
    },
    [ids, legend, byK]
  );

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    lastPointerType.current = event.pointerType;
    if (event.pointerType === 'touch') return;
    const { clientX, clientY } = event;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const k = hitAt(clientX, clientY);
      setPointing(true);
      /* Off the track the last section stays lit, so the readout doesn't
       * flicker back and forth as the hand crosses the infield. */
      if (k !== null) setActive(k);
    });
  };
  const onPointerLeave = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (lastPointerType.current === 'touch') return;
    setPointing(false);
    setActive(null);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    lastPointerType.current = event.pointerType;
  };
  /* A tap (or click) picks the section under it; a tap off the track goes
   * back to the strongest section. */
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const k = hitAt(event.clientX, event.clientY);
    if (lastPointerType.current === 'touch') {
      setActive(k);
      setPointing(k !== null);
      return;
    }
    if (k !== null) setActive(k);
  };
  /* Keys: arrows step through the sections in lap order; Escape goes back to
   * the strongest. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (sections.length === 0) return;
    const index = sections.findIndex((section) => section.k === shownK);
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(sections[(index + 1 + sections.length) % sections.length].k);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(sections[(index - 1 + sections.length) % sections.length].k);
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  };

  const delta = shown ? deltaPhrase(shown) : null;
  const short = shown ? deltaShort(shown) : null;
  const ready = sections.length > 0 && ids !== null;

  /* The label on the picture sits above the lit section's box (below it near
   * the top edge), in the still's own percentages, so it moves with the image
   * at every width. */
  const tag =
    shown && shown.box && legend
      ? (() => {
          const [x0, y0, x1, y1] = shown.box;
          const cx = ((x0 + x1) / 2 / legend.width) * 100;
          const below = y0 / legend.height < 0.14;
          const y = ((below ? y1 : y0) / legend.height) * 100;
          return { left: Math.min(88, Math.max(12, cx)), top: y, below };
        })()
      : null;

  return (
    <section className="home-hero">
      <div className="home-hero__text">
        {lead}
        <div className="home-hero__read" aria-live="polite">
          {ready && shown ? (
            <>
              <p className="home-hero__read-line">
                <b>{shown.label}</b>
                {delta ? <> · {delta}</> : null}
              </p>
              <p className="home-hero__read-how">
                {shown.bryceSeconds !== null && shown.fieldSeconds !== null
                  ? `His median ${fmtSeconds(shown.bryceSeconds)}, the field’s ${fmtSeconds(shown.fieldSeconds)}, on clean green-flag laps. `
                  : ''}
                {isDefault ? 'His strongest section. ' : ''}
                <span className="home-hero__hint">Point at the track, or tap it, for the others.</span>
              </p>
            </>
          ) : (
            <p className="home-hero__read-line home-hero__read-line--wait" aria-hidden>
              &nbsp;
            </p>
          )}
          <Link to={`/races/${encodeURIComponent(spec.sessionId)}`} className="home-textlink home-hero__race">
            Every section on the race page →
          </Link>
        </div>
      </div>
      <figure className="home-hero__figure">
        <div
          ref={wrapRef}
          className={`home-hero__still${pointing ? ' is-pointing' : ''}${reduced ? ' is-still' : ''}`}
          role="group"
          tabIndex={ready ? 0 : -1}
          aria-label={`${spec.alt} Point at the track, tap it, or use the arrow keys to read each section.`}
          onPointerMove={ready ? onPointerMove : undefined}
          onPointerLeave={ready ? onPointerLeave : undefined}
          onPointerDown={ready ? onPointerDown : undefined}
          onClick={ready ? onClick : undefined}
          onKeyDown={ready ? onKeyDown : undefined}
          onBlur={() => setActive(null)}
        >
          <img
            src={spec.src}
            srcSet={`${spec.src1200} 1200w, ${spec.src} 2400w`}
            sizes="(max-width: 760px) 100vw, 66vw"
            width={spec.width}
            height={spec.height}
            alt={spec.alt}
            fetchPriority="high"
            decoding="async"
            draggable={false}
          />
          <span className="home-hero__veil" aria-hidden />
          <canvas ref={canvasRef} className="home-hero__lit" aria-hidden width={spec.width} height={spec.height} />
          {ready && shown && tag ? (
            <span
              className={`home-hero__tag${tag.below ? ' is-below' : ''}`}
              style={{ left: `${tag.left}%`, top: `${tag.top}%` }}
              aria-hidden
            >
              <b>{shown.label}</b>
              {short ? <span>{short}</span> : null}
            </span>
          ) : null}
        </div>
        <figcaption className="home-hero__cap">{caption}</figcaption>
      </figure>
    </section>
  );
};
