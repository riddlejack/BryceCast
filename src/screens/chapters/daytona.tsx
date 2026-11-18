/* Daytona, 2025: one race that lasted a day. Four drivers shared the No. 85
 * Porsche 963 for 24 hours; Bryce drove three spells, in the evening after
 * dark, in the small hours and in the morning. The visual is the race as a
 * 24-hour dial, start at the top and turning clockwise, the night shaded
 * from sunset to sunrise, and the car's 16 driver spells around the rim:
 * his three in colour, his co-drivers' as hairlines. */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import type { VenueTip } from '../../app/venueCard';
import { useImsaDaytonaStint } from '../../data/imsaDaytonaStint';
import { useCareerRows } from '../careerExplorer';
import { clockLabel, countWord, lab, minutesOf, openOf, Signature, tintOf, useEntrance, useRaceCard, EASE } from './common';
import { CAR85_SPELLS as FALLBACK_SPELLS, type CarSpell } from './daytonaSpells';

const SERIES = 'series_imsa_weathertech';
const DAY = 86_400;
const BRYCE = 'driver_bryce_aron';

/* Sunrise and sunset, minutes past local midnight: the NOAA general solar
 * position equations (good to a few minutes), at the circuit's atlas
 * coordinates. Used only to shade the night; no time is printed from it. */
const sunEvents = (lat: number, lon: number, iso: string, utcOffsetHours: number) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const n = (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86_400_000;
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const r = Math.PI / 180;
  const ha = Math.acos(Math.cos(90.833 * r) / (Math.cos(lat * r) * Math.cos(decl)) - Math.tan(lat * r) * Math.tan(decl)) / r;
  return { sunrise: 720 - 4 * (lon + ha) - eq + utcOffsetHours * 60, sunset: 720 - 4 * (lon - ha) - eq + utcOffsetHours * 60 };
};

const partOfDay = (localMinutes: number): string => {
  const h = (((localMinutes / 60) % 24) + 24) % 24;
  if (h < 5) return 'the small hours';
  if (h < 12) return 'the morning';
  if (h < 17) return 'the afternoon';
  return 'the evening';
};

export const DaytonaSignature = () => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();
  const pack = useImsaDaytonaStint();
  /* The pack's own `car85Spells` (r2-data, ae1fe12) once that branch is in
   * this base; until then the same derivation, kept as a constant. */
  const packSpells = pack && pack !== 'failed' ? (pack as { car85Spells?: CarSpell[] }).car85Spells : undefined;
  const CAR85_SPELLS: CarSpell[] = packSpells && packSpells.length > 0 ? packSpells : FALLBACK_SPELLS;
  const rows = useCareerRows();
  const race = rows.find((row) => row.seriesId === SERIES) ?? null;
  const tint = tintOf(SERIES);

  const model = useMemo(() => {
    if (!race) return null;
    const clock = lab.raceWeather?.[race.sessionId]?.window.start ?? null;
    if (!clock) return null;
    const startLocal = minutesOf(clock);
    const venue = lab.atlas.venues.find((v) => v.trackName === race.trackName);
    /* Daytona in late January keeps Eastern Standard Time, UTC−5. */
    const day1 = venue ? sunEvents(venue.lat, venue.lon, clock, -5) : null;
    const day2 = venue ? sunEvents(venue.lat, venue.lon, nextDay(clock), -5) : null;
    const night = day1 && day2 ? { from: (day1.sunset - startLocal) * 60, to: (day2.sunrise + 1440 - startLocal) * 60 } : null;
    const total = CAR85_SPELLS[CAR85_SPELLS.length - 1].endElapsedSeconds;
    const bryce = CAR85_SPELLS.filter((spell) => spell.driverId === BRYCE);
    return { clock, startLocal, night, total, bryce };
  }, [race, CAR85_SPELLS]);

  if (!race || !model) return null;
  const { startLocal, night, total, bryce } = model;
  const result = pack && pack !== 'failed' ? pack.car85Result : null;
  const brycelaps = bryce.reduce((sum, spell) => sum + spell.laps, 0);
  const drivers = new Set(CAR85_SPELLS.map((spell) => spell.driverId)).size;
  const local = (seconds: number) => startLocal + seconds / 60;
  const range = (spell: CarSpell) => `${clockLabel(local(spell.startElapsedSeconds))}–${clockLabel(local(spell.endElapsedSeconds))}`;
  const parts = bryce.map((spell) => partOfDay(local(spell.startElapsedSeconds)));

  const phone = width > 0 && width < 600;
  const size = phone ? Math.min(width, 380) : Math.min(380, width * 0.5);
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - (phone ? 50 : 44);
  const angle = (seconds: number) => -Math.PI / 2 + (Math.min(seconds, DAY) / DAY) * Math.PI * 2;
  const point = (seconds: number, radius: number) => [cx + Math.cos(angle(seconds)) * radius, cy + Math.sin(angle(seconds)) * radius] as const;
  const arc = (from: number, to: number, radius: number) => {
    const [x0, y0] = point(from, radius);
    const [x1, y1] = point(to, radius);
    const large = (Math.min(to, DAY) - from) / DAY > 0.5 ? 1 : 0;
    return `M${x0},${y0} A${radius},${radius} 0 ${large} 1 ${x1},${y1}`;
  };
  const wedge = (from: number, to: number, radius: number) => {
    const [x0, y0] = point(from, radius);
    const [x1, y1] = point(to, radius);
    const large = (to - from) / DAY > 0.5 ? 1 : 0;
    return `M${cx},${cy} L${x0},${y0} A${radius},${radius} 0 ${large} 1 ${x1},${y1} Z`;
  };
  /* Clock labels at local 6 pm, midnight, 6 am and noon, where they fall on the race's dial. */
  const marks = [18, 24, 30, 36].map((hour) => ({ hour, seconds: (hour * 60 - startLocal) * 60 }));
  const gap = 520; // seconds of rim left blank between spells, so each reads as its own stroke

  const tipFor = (spell: CarSpell): VenueTip => {
    const mid = (spell.startElapsedSeconds + spell.endElapsedSeconds) / 2;
    const [tx, ty] = point(mid, R);
    const own = spell.driverId === BRYCE;
    return {
      x: tx,
      y: ty - 10,
      under: ty + 10,
      venue: own ? { sessionId: race.sessionId, trackName: race.trackName } : null,
      meta: own ? `Daytona 24 · spell ${bryce.indexOf(spell) + 1} of ${bryce.length}` : 'No. 85 · co-driver',
      tint: own ? tint : null,
      title: spell.driverName,
      detail: `${range(spell)} · laps ${spell.startLap}–${spell.endLap} · ${spell.laps} laps`,
      note: `hours ${(spell.startElapsedSeconds / 3600).toFixed(1)}–${(spell.endElapsedSeconds / 3600).toFixed(1)} of the race`,
      action: own ? 'open the race' : null
    };
  };

  const list = (
    <ol className="chs-day__list">
      {bryce.map((spell, i) => (
        <li
          key={spell.startLap}
          className={`chs-day__row${card.hot === `s${spell.startLap}` ? ' chs-day__row--hot' : ''}`}
          {...card.bind(`s${spell.startLap}`, () => tipFor(spell), openOf(race))}
        >
          <span className="chs-day__when">{sentenceCase(parts[i].replace('the ', ''))}</span>
          <span className="chs-day__time">{range(spell)}</span>
          <span className="chs-day__laps">{spell.laps} laps</span>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <p className="chapter-panel__narrative">
        One race that lasted a day: the Rolex 24 at Daytona, {countWord(drivers)} drivers sharing the No. 85 {result?.vehicle ?? 'GTP car'} through the night.
        Bryce drove {countWord(bryce.length)} spells, in {parts[0]} after dark, in {parts[1]} and in {parts[2]}: {brycelaps} of the car’s{' '}
        {CAR85_SPELLS[CAR85_SPELLS.length - 1].endLap} laps{result?.classFinishPosition ? <>, to P{result.classFinishPosition} in GTP</> : null}.
      </p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-day"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => [{ sessionId: race.sessionId, trackName: race.trackName }]}
            foot={
              <>
                The race as a clock, the start at the top, turning once in 24 hours; the shade is the night. His spells in colour, his co-drivers’ as thin
                lines. <PointerWord mouse="Hover" touch="Tap" /> a spell for who and when.
              </>
            }
          >
            {width > 0 ? (
              <div className="chs-day__layout">
                <svg width={size} height={size} role="img" aria-label={`The 24 hours of car 85 as a dial: ${CAR85_SPELLS.length} driver spells, Bryce's ${bryce.length} in colour, the night shaded`}>
                  {night ? (
                    <path d={wedge(night.from, night.to, R + 12)} className="chs-band" style={{ opacity: settled ? 1 : 0, transition: 'opacity 600ms ease' }} />
                  ) : null}
                  <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--ink)" strokeOpacity={0.08} strokeWidth={1} />
                  {Array.from({ length: 24 }, (_, h) => {
                    const [x0, y0] = point(h * 3600, R + 5);
                    const [x1, y1] = point(h * 3600, R + (h % 6 === 0 ? 11 : 8));
                    return <line key={h} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--ink)" strokeOpacity={0.3} strokeWidth={1} />;
                  })}
                  {marks.map(({ hour, seconds }) => {
                    const [lx, ly] = point(seconds, R + 24);
                    return (
                      <text key={hour} x={lx} y={ly + 4} textAnchor={lx > cx + 4 ? 'start' : lx < cx - 4 ? 'end' : 'middle'} className="chs-axis">
                        {hour === 24 ? 'midnight' : hour === 36 ? 'noon' : hour === 18 ? '6 pm' : '6 am'}
                      </text>
                    );
                  })}
                  <text x={cx} y={cy - R - 18} textAnchor="middle" className="chs-axis">
                    start {clockLabel(startLocal)}
                  </text>
                  {night ? (
                    (() => {
                      const [nx, ny] = point((night.from + night.to) / 2, R * 0.6);
                      return (
                        <text x={nx} y={ny} textAnchor="middle" className="chs-axis">
                          night
                        </text>
                      );
                    })()
                  ) : null}
                  {/* A short inward tick at every driver change, so the co-drivers' spells count off one by one. */}
                  {CAR85_SPELLS.slice(1).map((spell) => {
                    const [x0, y0] = point(spell.startElapsedSeconds, R - 4);
                    const [x1, y1] = point(spell.startElapsedSeconds, R - 9);
                    return (
                      <line
                        key={`h${spell.startLap}`}
                        x1={x0}
                        y1={y0}
                        x2={x1}
                        y2={y1}
                        stroke="var(--ink)"
                        strokeOpacity={0.4}
                        strokeWidth={1}
                        style={{ opacity: settled ? 1 : 0, transition: `opacity 200ms ease ${reduced ? 0 : 200 + (spell.startElapsedSeconds / DAY) * 2200}ms` }}
                      />
                    );
                  })}
                  {CAR85_SPELLS.map((spell, i) => {
                    const own = spell.driverId === BRYCE;
                    const key = own ? `s${spell.startLap}` : `c${spell.startLap}`;
                    const hot = card.hot === key;
                    const from = spell.startElapsedSeconds + (i === 0 ? 0 : gap / 2);
                    const to = Math.min(spell.endElapsedSeconds, total) - gap / 2;
                    const length = ((Math.min(to, DAY) - from) / DAY) * Math.PI * 2 * R;
                    const delay = reduced ? 0 : 200 + (spell.startElapsedSeconds / DAY) * 2200;
                    const duration = reduced ? 0 : Math.max(120, ((to - from) / DAY) * 2200);
                    return (
                      <g key={key}>
                        <path
                          d={arc(from, to, R)}
                          fill="none"
                          stroke={own ? tint : 'var(--ink)'}
                          strokeOpacity={own ? 1 : hot ? 0.7 : 0.38}
                          strokeWidth={own ? (hot ? 9 : 7) : hot ? 2.4 : 1.5}
                          strokeDasharray={length}
                          strokeDashoffset={settled ? 0 : length}
                          style={{ transition: `stroke-dashoffset ${duration}ms linear ${delay}ms` }}
                        />
                        <path
                          d={arc(spell.startElapsedSeconds, Math.min(spell.endElapsedSeconds, DAY), R)}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={24}
                          style={{ cursor: own ? 'pointer' : 'default' }}
                          {...card.bind(key, () => tipFor(spell), own ? openOf(race) : null)}
                        />
                      </g>
                    );
                  })}
                  <text x={cx} y={cy - 4} textAnchor="middle" className="chs-day__big">
                    {brycelaps}
                  </text>
                  <text x={cx} y={cy + 16} textAnchor="middle" className="chs-axis">
                    of {CAR85_SPELLS[CAR85_SPELLS.length - 1].endLap} laps
                  </text>
                  <g style={{ opacity: settled ? 1 : 0, transition: `opacity 400ms ${EASE} ${reduced ? 0 : 2400}ms` }}>
                    {result?.classFinishPosition ? (
                      <text x={cx} y={cy + 34} textAnchor="middle" className="chs-note">
                        P{result.classFinishPosition} in GTP
                      </text>
                    ) : null}
                  </g>
                </svg>
                {list}
              </div>
            ) : null}
          </Signature>
        </div>
      </div>
    </>
  );
};

const nextDay = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
