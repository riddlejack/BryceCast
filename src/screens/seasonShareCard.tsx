import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { trackOutlineFor } from '../assets/tracks';
import { loadStillIndex, stillPictureFor } from '../app/trackStill';
import { displayRaceLabelText } from '../data/debriefArchive';
import type { SeasonReview } from '../data/seasonPhase';

/* ---------- the season, as one image ----------
 * A 1080×1350 card (the portrait size every phone shares well) drawn as SVG
 * from the same season review the page reads, rasterized in the browser and
 * handed to the share sheet — or saved, where there is no share sheet. Nothing
 * leaves the device until the reader sends it. Round 6: the season best's
 * track is the 3D still of that race (as the landing's standouts show it),
 * drawn into the canvas after the SVG (an SVG drawn as an image cannot load
 * pictures of its own); the line drawing stays where there is no still. */

const W = 1080;
const H = 1350;
const GOLD = '#f5b63f';
const INK = '#1d1d1f';
const MUTED = '#6e6e73';

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sparkline = (review: SeasonReview, x: number, y: number, width: number, height: number): string => {
  const points = review.rows
    .map((row) => ({ finish: row.finishPosition, clean: row.officialStatus === 'running' }))
    .filter((point): point is { finish: number; clean: boolean } => point.finish !== null);
  if (points.length < 2) return '';
  const finishes = points.map((point) => point.finish);
  const min = Math.max(1, Math.min(...finishes) - 1);
  const max = Math.max(...finishes) + 1;
  const xAt = (index: number) => x + (width * index) / (points.length - 1);
  const yAt = (finish: number) => y + (height * (finish - min)) / (max - min || 1);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(1)} ${yAt(point.finish).toFixed(1)}`).join(' ');
  const cleanBest = Math.min(...points.filter((point) => point.clean).map((point) => point.finish));
  const bestIndex = points.findIndex((point) => point.clean && point.finish === cleanBest);
  const dots = points
    .map((point, index) =>
      index === bestIndex
        ? `<circle cx="${xAt(index)}" cy="${yAt(point.finish)}" r="13" fill="${GOLD}"/>`
        : point.clean
          ? `<circle cx="${xAt(index)}" cy="${yAt(point.finish)}" r="7" fill="${INK}"/>`
          : `<circle cx="${xAt(index)}" cy="${yAt(point.finish)}" r="8" fill="#ffffff" stroke="${MUTED}" stroke-width="4"/>`
    )
    .join('');
  return `<path d="${path}" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
};

/** Where the season best's track sits on the card. */
const TRACK_BOX = { x: 80, y: 1060, width: 330, height: 200 };

const buildSvg = (review: SeasonReview, drawOutline = true): string => {
  const best = review.standouts[0]?.row ?? null;
  const outline = best ? trackOutlineFor(best.trackName) : null;
  const bestLabel = best
    ? displayRaceLabelText(best.raceLabel).replace(/^\d{4}\s+/, '').replace(/\s+R[12]$/, '')
    : null;
  const stat = (x: number, label: string, value: string) =>
    `<text x="${x}" y="560" font-size="34" fill="${MUTED}" font-weight="500">${esc(label)}</text>
     <text x="${x}" y="660" font-size="104" fill="${INK}" font-weight="700" letter-spacing="-3">${esc(value)}</text>`;
  const closing =
    review.closingTop10Run >= 2 ? `Closed the year with ${review.closingTop10Run} straight top-10 finishes` : `${review.races} races at ${review.venues.length} tracks`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, 'Segoe UI', Roboto, sans-serif">
  <defs>
    <radialGradient id="wash" cx="100%" cy="0%" r="95%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.34"/>
      <stop offset="62%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f5f5f7"/>
  <rect width="${W}" height="${H}" fill="url(#wash)"/>
  <rect x="80" y="84" width="96" height="96" rx="22" fill="${GOLD}"/>
  <text x="128" y="154" font-size="64" font-weight="800" fill="#241a02" text-anchor="middle">9</text>
  <text x="204" y="126" font-size="34" fill="${MUTED}" font-weight="500">INDY NXT by Firestone · ${review.seasonYear}</text>
  <text x="204" y="172" font-size="40" fill="${INK}" font-weight="650">Bryce Aron</text>
  <text x="80" y="330" font-size="96" fill="${INK}" font-weight="700" letter-spacing="-3">The ${review.seasonYear} season,</text>
  <text x="80" y="432" font-size="96" fill="${INK}" font-weight="700" letter-spacing="-3">in the books.</text>
  ${stat(80, 'Championship', review.finalRank !== null ? `P${review.finalRank}` : '—')}
  ${stat(390, 'Points', review.points !== null ? String(review.points) : '—')}
  ${stat(640, 'Top 10s', String(review.top10s))}
  ${stat(850, 'Best', review.bestFinish !== null ? `P${review.bestFinish}` : '—')}
  <text x="80" y="770" font-size="32" fill="${MUTED}" font-weight="500">Every finish, race by race · gold marks the season best</text>
  ${sparkline(review, 92, 820, W - 184, 170)}
  ${
    outline && drawOutline
      ? `<svg x="${TRACK_BOX.x}" y="${TRACK_BOX.y}" width="${TRACK_BOX.width}" height="${TRACK_BOX.height}" viewBox="${outline.viewBox}" preserveAspectRatio="xMinYMid meet">
           <path d="${outline.mainPath}" fill="none" stroke="${INK}" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
         </svg>`
      : ''
  }
  ${
    best && bestLabel
      ? `<text x="450" y="1096" font-size="30" fill="${MUTED}" font-weight="500">Season best · P${best.finishPosition}</text>
         <text x="450" y="1150" font-size="38" fill="${INK}" font-weight="680">${esc(bestLabel)}</text>
         <text x="450" y="1214" font-size="28" fill="${MUTED}" font-weight="500">${esc(closing)}</text>`
      : `<text x="80" y="1176" font-size="34" fill="${MUTED}" font-weight="500">${esc(closing)}</text>`
  }
  <text x="${W - 80}" y="${H - 56}" font-size="30" fill="${MUTED}" font-weight="560" text-anchor="end">brycecast.com</text>
</svg>`;
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image failed to load'));
    image.src = src;
  });

/** The season best's 3D still (its own shaded still, else the venue's plain
 *  model), or null where the venue has no model. */
const trackStillFor = async (review: SeasonReview): Promise<HTMLImageElement | null> => {
  const best = review.standouts[0]?.row ?? null;
  const outline = best ? trackOutlineFor(best.trackName) : null;
  if (!best || !outline) return null;
  const picture = stillPictureFor(await loadStillIndex(), outline.slug, best.sessionId);
  if (!picture) return null;
  return loadImage(picture.src1200).catch(() => null);
};

const rasterize = (svg: string, still: HTMLImageElement | null = null): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error('no canvas'));
        return;
      }
      context.drawImage(image, 0, 0, W, H);
      if (still) {
        /* Fitted to the box, left-aligned and centred down it (the outline's
         * own xMinYMid), on its own paper with rounded corners, a picture
         * set on the card. */
        const scale = Math.min(TRACK_BOX.width / still.naturalWidth, TRACK_BOX.height / still.naturalHeight);
        const width = still.naturalWidth * scale;
        const height = still.naturalHeight * scale;
        const top = TRACK_BOX.y + (TRACK_BOX.height - height) / 2;
        context.save();
        context.beginPath();
        context.roundRect(TRACK_BOX.x, top, width, height, 18);
        context.clip();
        context.drawImage(still, TRACK_BOX.x, top, width, height);
        context.restore();
      }
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no blob'))), 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('svg failed to load'));
    };
    image.src = url;
  });

export const SeasonShareButton = ({ review }: { review: SeasonReview }) => {
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');
  const share = async () => {
    setState('working');
    try {
      const still = await trackStillFor(review).catch(() => null);
      const blob = await rasterize(buildSvg(review, still === null), still);
      const fileName = `bryce-aron-${review.seasonYear}-season.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Bryce Aron · ${review.seasonYear} season` });
          setState('idle');
          return;
        } catch (error) {
          /* A dismissed share sheet is not a failure; anything else falls through to a save. */
          if ((error as DOMException)?.name === 'AbortError') {
            setState('idle');
            return;
          }
        }
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setState('idle');
    } catch {
      setState('failed');
    }
  };
  return (
    <button type="button" className="share-button" onClick={share} disabled={state === 'working'}>
      <Share2 size={13} aria-hidden />
      {state === 'working' ? 'Drawing the card…' : state === 'failed' ? 'Couldn’t draw the card — try again' : `Share the ${review.seasonYear} season card`}
    </button>
  );
};

/** Exposed for the visual check in development only. */
export const seasonCardSvg = buildSvg;
/** The card as the share button draws it (PNG), for the visual check. */
export const seasonCardBlob = async (review: SeasonReview): Promise<Blob> => {
  const still = await trackStillFor(review).catch(() => null);
  return rasterize(buildSvg(review, still === null), still);
};
