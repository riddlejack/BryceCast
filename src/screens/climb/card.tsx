import { useRef } from 'react';
import { useCoarsePointer } from '../../app/charts';
import { TAP_CARD, TapAction, useTouchPlacement, type TapPreview } from '../../app/tapPreview';
import { CardStill, useVenuePicture } from '../../app/venuePeek';
import { chapterTint } from '../careerExplorer';
import { beatLine, placeLine } from '../../app/raceFacts';
import { wetPhraseFor } from '../../app/wetDry';
import { clamp, statusWords, type ClimbRace } from './model';

/* The climb's race card: the explorer's mouse card (its track's 3D still on
 * top where the venue is modelled, then series, race, numbers) and, on a
 * touch screen, the same card placed by the tap-to-read rules with its
 * "Open the race →" row. A race with no page (the 8 unclassified) says so. */

const Body = ({ race }: { race: ClimbRace }) => {
  const classified = race.finish !== null;
  const notes = [
    classified && race.status !== 'running' ? statusWords[race.status] ?? race.status : null,
    // the track in the source's words, with who called it (app/wetDry.ts): "damp track (series report)"
    wetPhraseFor(race.sessionId, race.wetDry),
    race.oneOff ? 'a one-off, during his INDY NXT years' : null
  ].filter(Boolean);
  return (
    <>
      <span className="climb-card__meta">
        <i style={{ background: chapterTint(race.seriesName) }} />
        {race.seriesShort} · {race.seasonYear ?? '—'}
      </span>
      <strong className="climb-card__title">{race.title}</strong>
      {classified ? (
        <span className="climb-card__nums">
          {race.start !== null ? `P${race.start} → ` : ''}
          <b>{placeLine(race.finish, race.field) ?? `P${race.finish}`}</b>
          {beatLine(race.finish, race.field) ? ` · ${beatLine(race.finish, race.field)}` : ''}
        </span>
      ) : (
        <span className="climb-card__nums">
          <b>{sentence(statusWords[race.status] ?? race.status)}</b>
          {race.start !== null ? ` · started P${race.start}` : ''}
          {race.field ? ` · ${race.field} cars` : ''}
        </span>
      )}
      {notes.length ? <span className="climb-card__note">{notes.join(' · ')}</span> : null}
    </>
  );
};

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const ClimbCard = ({
  race,
  x,
  y,
  under,
  width,
  tap
}: {
  race: ClimbRace;
  /** The mark's centre, and its top (`y`) and bottom (`under`), in the stage's coordinates. */
  x: number;
  y: number;
  under: number;
  width: number;
  tap: TapPreview;
}) => {
  const coarse = useCoarsePointer();
  const picture = useVenuePicture({ sessionId: race.sessionId, trackName: race.trackName });
  if (coarse || tap.armed !== null) return <TouchCard race={race} x={x} y={y} under={under} tap={tap} still={picture ?? null} />;
  const cardW = picture ? 264 : 240;
  const cardH = picture ? Math.round((cardW * picture.height) / picture.width) + 98 : 98;
  const below = y - 12 < cardH;
  return (
    <div
      className={`climb-card${below ? ' climb-card--below' : ''}`}
      style={{ left: clamp(x, cardW / 2 + 2, Math.max(width - cardW / 2 - 2, cardW / 2 + 2)), top: below ? under + 10 : y - 10, width: cardW }}
      aria-hidden
    >
      {picture ? <CardStill className="climb-card__still" venue={{ sessionId: race.sessionId, trackName: race.trackName }} picture={picture} /> : null}
      <div className="climb-card__body">
        <Body race={race} />
        <span className="climb-card__action">{race.hasPage ? 'Click to open the race' : 'No race page'}</span>
      </div>
    </div>
  );
};

const TouchCard = ({
  race,
  x,
  y,
  under,
  tap,
  still
}: {
  race: ClimbRace;
  x: number;
  y: number;
  under: number;
  tap: TapPreview;
  still: { src600: string; width: number; height: number } | null;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const place = useTouchPlacement(ref, x, y, under, `${race.sessionId}|${tap.openArmed ? 1 : 0}|${still ? 1 : 0}`);
  return (
    <div ref={ref} className="climb-card climb-card--touch" style={place} {...{ [TAP_CARD]: '' }} role="status">
      {still ? <img className="climb-card__still" src={still.src600} width={still.width} height={still.height} alt="" decoding="async" /> : null}
      <div className="climb-card__body">
        <Body race={race} />
        {race.hasPage ? <TapAction tap={tap} label="open the race" /> : <span className="climb-card__note">No race page</span>}
      </div>
    </div>
  );
};
