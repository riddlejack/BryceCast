import { useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Card, SourcePill } from '../app/components';
import { chartFont, useMeasuredWidth, PointerOpen } from '../app/charts';
import { formatDate, formatGain } from '../app/format';
import { Link, useRouter } from '../app/router';
import { useTapPreview } from '../app/tapPreview';
import { switchValue } from '../review/switches';
import { chapterTint } from './careerExplorer';
import { statusShort, statusWords, type ArchiveRace } from './careerRaceList';
import { RaceStillCard, RowPicture } from './racesPeek';
import { useStillIndex } from '../app/trackStill';
import { venuePictureFor } from '../app/venuePeek';
import { trackOutlineFor } from '../assets/tracks';
import { beatLine, placeLine } from '../app/raceFacts';

/* ============================================================================
 * The seasons before INDY NXT on the Races page (career round 2, Nov 17 2026).
 *
 * Jack: "Can we have all of his seasons listed, not just 2024 through 2026?"
 * Each year 2019-2023 gets a card in the INDY NXT seasons' grammar, with what
 * the sources can honestly carry: the date, the venue, the series, his finish
 * and the field. No points table or standing line (most of these years have
 * no sourced championship progression). The year's shape leads: one dot per
 * race in date order, coloured by series (chapterTint), height his finish,
 * a ring where he had no classified finish. The rows sit folded under it, so
 * eight seasons scan as eight pictures, not 175 lines. `?racesyears=open`
 * shows every row unfolded.
 * ==========================================================================*/

export const yearsOpen = (): boolean => switchValue('racesyears') === 'open';

const ordinalPos = (finish: number | null, status: string) => (finish !== null ? `P${finish}` : statusShort(status));

/* One finish grammar site-wide (raceFacts): "P8 of 23 · ahead of 15 of the
 * other 22", the place alone where the field isn't known. */
const numsFor = (race: ArchiveRace): string => {
  if (race.finish === null) return statusWords(race.status) || 'No classified finish';
  return [placeLine(race.finish, race.field), beatLine(race.finish, race.field)].filter(Boolean).join(' · ');
};

const noteFor = (race: ArchiveRace): string | null => {
  const ended = race.finish !== null && race.status !== 'running' ? statusWords(race.status) : '';
  return [
    race.start !== null && race.finish !== null && race.start !== race.finish ? `started P${race.start}` : null,
    ended ? `ended early: ${ended.toLowerCase()}` : null,
    race.wetDry && race.wetDry !== 'dry' ? `${race.wetDry} track` : null
  ]
    .filter(Boolean)
    .join(' · ') || null;
};

/** "Feb 9", or "Weekend of Feb 8" where only the meeting's first day is known. */
export const dayWords = (race: ArchiveRace, year = false): string => {
  const date = formatDate(race.day, year ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
  return race.dayIsMeeting ? `Weekend of ${date}` : date;
};

/* ---------- the year's shape ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const YearSpine = ({ races, year }: { races: ArchiveRace[]; year: number }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { navigate } = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);
  const tap = useTapPreview();
  const n = races.length;
  if (n < 2) return null;

  const narrow = width < 560;
  const margin = { top: 14, right: 18, bottom: 30, left: 68 };
  const finishes = races.map((race) => race.finish).filter((value): value is number => value !== null);
  const worst = Math.max(...finishes, 5);
  const hasUnclassified = races.some((race) => race.finish === null);
  const plotH = narrow ? 150 : 176;
  const lane = hasUnclassified ? 30 : 0;
  const height = margin.top + plotH + lane + margin.bottom;
  const plotW = Math.max(width - margin.left - margin.right, 80);
  const x = (index: number) => margin.left + (index / (n - 1)) * plotW;
  const yFinish = (finish: number) => margin.top + ((finish - 1) / Math.max(worst - 1, 1)) * plotH;
  const yLane = margin.top + plotH + lane - 6;
  const yOf = (race: ArchiveRace) => (race.finish !== null ? yFinish(race.finish) : yLane);
  const r = narrow ? 4.4 : 5;

  const ticks = [1, 5, 10, 15, 20, 25, 30, 35].filter((tick) => tick <= worst);
  /* One month label where the month turns, skipped when it would crowd the last. */
  const months: Array<{ x: number; label: string }> = [];
  races.forEach((race, index) => {
    const month = Number(race.day.slice(5, 7)) - 1;
    const prev = index > 0 ? Number(races[index - 1].day.slice(5, 7)) - 1 : -1;
    if (month !== prev) {
      const at = x(index);
      if (!months.length || at - months[months.length - 1].x > (narrow ? 34 : 40)) months.push({ x: at, label: MONTHS[month] });
    }
  });

  /* His form through the year: each series its own line, through that
   * series' races only, so two series in one year never join up. */
  const bySeries = new Map<string, string[]>();
  races.forEach((race, index) => {
    if (race.finish === null) return;
    const list = bySeries.get(race.seriesName) ?? [];
    list.push(`${x(index)},${yFinish(race.finish)}`);
    bySeries.set(race.seriesName, list);
  });
  const runs = [...bySeries.entries()]
    .filter(([, pts]) => pts.length > 1)
    .map(([series, pts]) => ({ tint: chapterTint(series), points: pts.join(' ') }));

  const find = (event: React.MouseEvent<Element>): number | null => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const mouseX = event.clientX - bounds.left;
    if (mouseX < margin.left - 14 || mouseX > width - margin.right + 14) {
      setHovered(null);
      return null;
    }
    const index = Math.min(n - 1, Math.max(0, Math.round(((mouseX - margin.left) / plotW) * (n - 1))));
    setHovered(index);
    return index;
  };

  const hoveredRace = hovered !== null ? races[hovered] : null;

  return (
    <div ref={ref} className="year-spine" style={{ width: '100%', position: 'relative' }}>
      {width > 0 ? (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          role="img"
          aria-label={`${year}: ${n} races in date order, each his finishing position, coloured by series`}
          {...tap.surface({
            find,
            clear: () => setHovered(null),
            open: (index) => () => navigate(races[index as number].href)
          })}
          style={{ cursor: hovered !== null ? 'pointer' : 'default' }}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={yFinish(tick)} y2={yFinish(tick)} stroke="var(--grid-hairline)" />
              <text
                x={margin.left - 8}
                y={yFinish(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--ink-muted)"
                fontFamily={chartFont}
                fontSize={14}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                P{tick}
              </text>
            </g>
          ))}
          {hasUnclassified ? (
            <text x={margin.left - 8} y={yLane} textAnchor="end" dominantBaseline="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={13}>
              no finish
            </text>
          ) : null}
          {hovered !== null ? (
            <line x1={x(hovered)} x2={x(hovered)} y1={margin.top - 6} y2={height - margin.bottom + 2} stroke="var(--axis-baseline)" strokeDasharray="3 3" />
          ) : null}
          {runs.map((run, index) => (
            <polyline key={index} points={run.points} fill="none" stroke={run.tint} strokeOpacity={0.5} strokeWidth={1.6} strokeLinejoin="round" />
          ))}
          {races.map((race, index) => {
            const tint = chapterTint(race.seriesName);
            const on = hovered === index;
            const dim = hovered !== null && !on;
            if (race.finish === null) {
              return (
                <circle
                  key={race.sessionId}
                  cx={x(index)}
                  cy={yLane}
                  r={on ? r + 1.4 : r}
                  fill="var(--surface-1)"
                  stroke={tint}
                  strokeWidth={1.8}
                  opacity={dim ? 0.45 : 1}
                />
              );
            }
            const win = race.finish === 1;
            return (
              <g key={race.sessionId} opacity={dim ? 0.45 : 1}>
                {win ? <circle cx={x(index)} cy={yOf(race)} r={(on ? r + 1.4 : r) + 3.2} fill="none" stroke="var(--ink-primary)" strokeWidth={1.6} /> : null}
                <circle cx={x(index)} cy={yOf(race)} r={on ? r + 1.4 : r} fill={tint} stroke="var(--surface-0)" strokeWidth={1.2} />
              </g>
            );
          })}
          {months.map((month) => (
            <text
              key={`${month.label}-${month.x}`}
              x={month.x}
              y={height - 8}
              textAnchor="middle"
              fill="var(--ink-muted)"
              fontFamily={chartFont}
              fontSize={14}
            >
              {month.label}
            </text>
          ))}
        </svg>
      ) : null}
      {hoveredRace && hovered !== null ? (
        <RaceStillCard
          venue={{ sessionId: hoveredRace.sessionId, trackName: hoveredRace.trackName, trackId: hoveredRace.trackId }}
          x={x(hovered)}
          y={yOf(hoveredRace)}
          r={r + 2}
          width={width}
          swatch={chapterTint(hoveredRace.seriesName)}
          meta={`${hoveredRace.seriesShort} · ${dayWords(hoveredRace, true)}`}
          title={hoveredRace.title}
          nums={numsFor(hoveredRace)}
          note={noteFor(hoveredRace) ?? hoveredRace.trackName}
          tap={tap}
        />
      ) : null}
    </div>
  );
};

/* ---------- one row ---------- */

/* The row's "of 23", read from the place line (raceFacts) so a row and its
 * card always agree: the figure column carries the "P8". */
const ofField = (race: ArchiveRace): string => {
  const line = placeLine(race.finish, race.field);
  const at = line ? line.indexOf(' of ') : -1;
  return line && at > 0 ? line.slice(at + 1) : '';
};

export const ArchiveRow = ({ race }: { race: ArchiveRace }) => {
  const gain = race.start !== null && race.finish !== null ? formatGain(race.start - race.finish) : null;
  const ended = race.finish === null ? statusWords(race.status) : race.status !== 'running' ? statusWords(race.status) : '';
  return (
    <Link to={race.href} className="tower__row race-row race-row--archive">
      <span className={`figure row race-row__pos${race.finish === null ? ' race-row__pos--none' : ''}`}>
        {ordinalPos(race.finish, race.status)}
        {race.finish === 1 ? <span aria-label="a win" className="race-row__win" /> : null}
      </span>
      <RowPicture venue={{ sessionId: race.sessionId, trackName: race.trackName, trackId: race.trackId }} />
      <span className="tower__name race-row__name">
        <span>{race.title.replace(' · ', ' · ')}</span>
        <span className="tower__team race-row__series">
          <i style={{ background: chapterTint(race.seriesName) }} aria-hidden />
          {[race.seriesShort, ended || null].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className={`stat__delta ${gain?.direction === 'up' ? 'stat__delta--up' : 'stat__delta--down'}`} style={{ textAlign: 'right' }}>
        {gain ? gain.text : ''}
      </span>
      <span className="tower__gap tnum race-row__field">{ofField(race)}</span>
      <span className="tower__gap race-row__date">
        {race.dayIsMeeting ? <span className="race-row__weekend">Weekend of</span> : null}
        {formatDate(race.day, { month: 'short', day: 'numeric' })}
      </span>
      <ArrowRight size={16} style={{ color: 'var(--ink-muted)' }} aria-hidden />
    </Link>
  );
};

/* A list where no venue has a picture yet (no 3D model, no drawing) drops the
 * picture column rather than show a column of empty slots; it comes back as
 * the 3D venue lane's models land. */
const useAnyPicture = (races: ArchiveRace[]): boolean => {
  const index = useStillIndex();
  if (index === undefined) return true;
  return races.some(
    (race) => venuePictureFor(index, { sessionId: race.sessionId, trackName: race.trackName, trackId: race.trackId }) !== null || trackOutlineFor(race.trackName) !== null
  );
};

/* ---------- the series a year holds, as a key ---------- */

interface SeriesCount {
  seriesName: string;
  seriesShort: string;
  count: number;
}

const seriesIn = (races: ArchiveRace[]): SeriesCount[] => {
  const map = new Map<string, SeriesCount>();
  for (const race of races) {
    const entry = map.get(race.seriesName) ?? { seriesName: race.seriesName, seriesShort: race.seriesShort, count: 0 };
    entry.count += 1;
    map.set(race.seriesName, entry);
  }
  return [...map.values()];
};

export const SeriesKey = ({ races }: { races: ArchiveRace[] }) => (
  <span className="races-key">
    {seriesIn(races).map((series) => (
      <span key={series.seriesName} className="races-key__item">
        <i style={{ background: chapterTint(series.seriesName) }} aria-hidden />
        {series.seriesShort}
        <span className="races-key__n">{series.count}</span>
      </span>
    ))}
  </span>
);

export const archiveSummary = (races: ArchiveRace[]): string => {
  const finishes = races.map((race) => race.finish).filter((value): value is number => value !== null);
  const parts = [`${races.length} race${races.length === 1 ? '' : 's'}`];
  if (finishes.length) {
    const wins = finishes.filter((finish) => finish === 1).length;
    parts.push(wins > 0 ? `${wins} win${wins === 1 ? '' : 's'}` : `best P${Math.min(...finishes)}`);
    const podiums = finishes.filter((finish) => finish <= 3).length;
    if (podiums > 0) parts.push(`${podiums} podium${podiums === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
};

const archiveSources = (races: ArchiveRace[]) => {
  const anyUnclassified = races.some((race) => race.finish === null);
  return [
    {
      label: 'Career result conversion table',
      path: 'analysis/career-parity/output/tables/career_result_conversion.csv',
      note: 'Official or source-backed result rows for every series: grid, finish, finishing percentile, status and conditions.'
    },
    ...(anyUnclassified
      ? [
          {
            label: 'Races with no classified finish',
            path: 'analysis/career-life-stats/output/tables/miles_raced.csv',
            note: 'The A2 ledger of every canonical race row: date, venue, series and the result status (did not start, did not finish, disqualified).'
          }
        ]
      : []),
    {
      label: 'Field size',
      note: 'The conversion table’s field size: the cars classified. “Ahead of 15 of the other 22” counts the cars that finished behind him, never himself.'
    },
    {
      label: 'Dates',
      note: 'The race day where the season record gives it, or the day the race’s own record names (the SCCA’s Saturday and Sunday races). Otherwise “Weekend of” the meeting’s first day.'
    },
    {
      label: 'Track pictures',
      note: 'The 3D model of the venue with the lap drawn bold on its centreline; a venue not modelled yet shows a quiet blank tile.'
    }
  ];
};

/* ---------- a season before INDY NXT ---------- */

export const EarlierSeason = ({ year, races }: { year: number; races: ArchiveRace[] }) => {
  const [open, setOpen] = useState(yearsOpen);
  const pictures = useAnyPicture(races);
  const newestFirst = useMemo(() => [...races].reverse(), [races]);
  return (
    <div id={`season-${year}`} className="races-season">
      <Card
        className="races-season--earlier"
        title={`${year} season`}
        action={
          <span className="row" style={{ gap: 12 }}>
            <span className="caption caption--secondary">{archiveSummary(races)}</span>
            <SourcePill title={`${year} season index`} entries={archiveSources(races)} caveats={[]} />
          </span>
        }
      >
        <p className="caption caption--secondary races-index__legend">
          <SeriesKey races={races} /> <span className="races-key__how">Each dot a race, by date · a ring marks a win · <PointerOpen what="any race" /></span>
        </p>
        <YearSpine races={races} year={year} />
        <button type="button" className="races-fold" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span>{open ? `Hide the ${races.length} races` : `Show the ${races.length} races`}</span>
          <ChevronDown size={16} aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
        {open ? (
          <div className={`tower${pictures ? '' : ' races-nopic'}`} style={{ margin: '4px -12px 0' }}>
            {newestFirst.map((race) => (
              <ArchiveRow key={race.sessionId} race={race} />
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
};

/* ---------- the other series in an INDY NXT year ---------- */

/* QoL 3: each series in an INDY NXT year on its own line, newest series first. */
export const AlsoInYear = ({ year, races }: { year: number; races: ArchiveRace[] }) => {
  const pictures = useAnyPicture(races);
  const groups = useMemo(() => {
    const map = new Map<string, { seriesName: string; seriesShort: string; races: ArchiveRace[] }>();
    for (const race of races) {
      const entry = map.get(race.seriesName) ?? { seriesName: race.seriesName, seriesShort: race.seriesShort, races: [] };
      entry.races.push(race);
      map.set(race.seriesName, entry);
    }
    return [...map.values()].reverse();
  }, [races]);
  return (
  <div className="races-also">
    <div className="races-also__head">
      <h3 className="races-also__title">Also in {year}</h3>
      <SeriesKey races={races} />
      <SourcePill title={`${year}: the other series`} entries={archiveSources(races)} caveats={[]} />
    </div>
    {races.length >= 3 ? <YearSpine races={races} year={year} /> : null}
    {groups.map((group) => (
      <div key={group.seriesName} className="races-also__series">
        {groups.length > 1 ? (
          <h4 className="races-also__sub">
            <i style={{ background: chapterTint(group.seriesName) }} aria-hidden />
            {group.seriesShort}
            <span className="races-key__n">{group.races.length}</span>
          </h4>
        ) : null}
        <div className={`tower${pictures ? '' : ' races-nopic'}`} style={{ margin: '4px -12px 0' }}>
          {[...group.races].reverse().map((race) => (
            <ArchiveRow key={race.sessionId} race={race} />
          ))}
        </div>
      </div>
    ))}
  </div>
  );
};
