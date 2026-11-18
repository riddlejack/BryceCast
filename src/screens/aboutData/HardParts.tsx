import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { chartFont } from '../../app/charts';
import { Link } from '../../app/router';
import { TrackStill } from '../../app/trackStill';
import { SeriesCoverage } from './SeriesCoverage';
import './hardParts.css';

/* The hard parts, each a headline, one or two sentences, a small drawing of
 * the idea and the page where it shows. Retired November 17: "Models that
 * retain their failures" (the prediction workbench is no longer on the site). */

const font = { fontFamily: chartFont };

/* Two cars at five timing loops: the order is known at each loop, so the
 * pass is placed between the two loops where it changed, not at a spot. */
const PassMini = () => {
  const loops = [24, 74, 124, 174, 224];
  const yA = [30, 30, 54, 54, 54];
  const yB = [54, 54, 30, 30, 30];
  const line = (ys: number[]) => loops.map((x, i) => `${i ? 'L' : 'M'}${x},${ys[i]}`).join(' ');
  return (
    <svg viewBox="0 0 248 104" className="hp-mini" aria-hidden>
      <rect x={74} y={16} width={50} height={52} fill="var(--accent-wash)" />
      {loops.map((x, i) => (
        <g key={x}>
          <line x1={x} x2={x} y1={20} y2={66} stroke="var(--grey-line)" />
          <text x={x} y={84} textAnchor="middle" fontSize={12} fill="var(--ink-muted)" {...font}>
            {`L${i + 1}`}
          </text>
        </g>
      ))}
      <path d={line(yB)} fill="none" stroke="var(--grey-ink3)" strokeWidth={1.6} />
      <path d={line(yA)} fill="none" stroke="var(--bryce)" strokeWidth={2.2} />
      {loops.map((x, i) => (
        <g key={`m${x}`}>
          <circle cx={x} cy={yB[i]} r={3.4} fill="var(--paper)" stroke="var(--grey-ink3)" strokeWidth={1.4} />
          <circle cx={x} cy={yA[i]} r={3.6} fill="var(--bryce)" />
        </g>
      ))}
      <text x={99} y={100} textAnchor="middle" fontSize={12} fill="var(--link)" {...font}>
        passed in here
      </text>
    </svg>
  );
};

const QualiMini = () => (
  <ul className="hp-chips" aria-hidden>
    <li>Group</li>
    <li>Combined</li>
    <li>Reverse grid</li>
    <li>Two-lap average</li>
    <li className="hp-chips__off">Canceled</li>
  </ul>
);

/* Reports give wind as where it comes from; the map's arrow shows where the air goes. */
const WindMini = () => (
  <svg viewBox="0 0 248 104" className="hp-mini" aria-hidden>
    <circle cx={124} cy={48} r={34} fill="none" stroke="var(--grey-hair)" strokeWidth={1.2} />
    <text x={124} y={10} textAnchor="middle" fontSize={12} fill="var(--ink-muted)" {...font}>
      N
    </text>
    <line x1={84} x2={160} y1={48} y2={48} stroke="var(--ink)" strokeWidth={2} />
    <path d="M152,41 L162,48 L152,55" fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
    <text x={78} y={52} textAnchor="end" fontSize={12} fill="var(--ink-muted)" {...font}>
      from the west
    </text>
    <text x={168} y={52} fontSize={12} fill="var(--ink)" {...font}>
      blows east
    </text>
    <text x={124} y={100} textAnchor="middle" fontSize={12} fill="var(--ink-muted)" {...font}>
      the arrow shows where the air goes
    </text>
  </svg>
);

/* Several overlapping monitors, then one supervised process with a heartbeat. */
const ProcessMini = () => (
  <svg viewBox="0 0 248 104" className="hp-mini" aria-hidden>
    {[0, 1, 2].map((k) => (
      <rect key={k} x={14 + k * 12} y={22 + k * 10} width={54} height={30} rx={3} fill="var(--paper)" stroke="var(--grey-line)" strokeWidth={1.2} />
    ))}
    <line x1={14} x2={92} y1={22} y2={82} stroke="var(--grey-ink3)" strokeWidth={1.2} />
    <text x={52} y={100} textAnchor="middle" fontSize={12} fill="var(--ink-muted)" {...font}>
      before
    </text>
    <path d="M110,47 H136" stroke="var(--grey-ink3)" strokeWidth={1.2} />
    <path d="M131,43 L137,47 L131,51" fill="none" stroke="var(--grey-ink3)" strokeWidth={1.2} />
    <rect x={152} y={30} width={76} height={34} rx={3} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.4} />
    <circle cx={166} cy={47} r={3.6} fill="var(--bryce)">
      <animate attributeName="opacity" values="1;0.25;1" dur="1s" repeatCount="indefinite" />
    </circle>
    <path d="M176,47 h8 l4,-8 l5,15 l4,-7 h18" fill="none" stroke="var(--ink)" strokeWidth={1.2} />
    <text x={190} y={100} textAnchor="middle" fontSize={12} fill="var(--ink-muted)" {...font}>
      one process
    </text>
  </svg>
);

/* Six one-second snapshots that each repeated the same driver bio, then one stored copy they all point to. */
const DedupeMini = () => {
  const xs = [14, 50, 86, 122, 158, 194];
  return (
    <svg viewBox="0 0 248 104" className="hp-mini" aria-hidden>
      {xs.map((x) => (
        <g key={x}>
          <rect x={x} y={10} width={30} height={26} rx={2.5} fill="var(--paper)" stroke="var(--grey-line)" strokeWidth={1.1} />
          <rect x={x + 5} y={16} width={9} height={6} rx={1} fill="var(--ink)" />
          <rect x={x + 5} y={26} width={20} height={4} rx={1} fill="var(--grey-hair)" />
          <path d={`M${x + 20},36 L124,66`} stroke="var(--grey-line)" strokeWidth={1} />
        </g>
      ))}
      <rect x={104} y={66} width={40} height={16} rx={2.5} fill="var(--grey-wash)" stroke="var(--ink-faint)" strokeWidth={1} />
      <text x={124} y={100} textAnchor="middle" fontSize={12} fill="var(--ink-muted)" {...font}>
        stored once, pointed to every second
      </text>
    </svg>
  );
};

type Part = { title: string; body: ReactNode; to: string; label: string; visual: ReactNode };

const PARTS: Part[] = [
  {
    title: 'Passes placed between two loops',
    body: 'The feed’s position field is only the starting grid. BryceCast rebuilds the running order at every timing loop, and puts a pass between the two loops where the order changed, never at an invented spot.',
    to: '/races',
    label: 'Races',
    visual: <PassMini />
  },
  {
    title: 'Every qualifying format, kept as it ran',
    body: 'Group sessions, combined grids, reverse grids, oval two-lap averages. A qualifying result is tied to a race only when the grid matches it, and a canceled session stays canceled.',
    to: '/career',
    label: 'Career',
    visual: <QualiMini />
  },
  {
    title: 'Wind that points the right way',
    body: 'Weather reports give wind as where it comes from, so the live map turns the arrow round to show where the air is going. The live weather is the National Weather Service’s nearest station.',
    to: '/live',
    label: 'Live',
    visual: <WindMini />
  },
  {
    title: 'One recorder, after a drill went wrong',
    body: 'In a live drill at Road America, overlapping monitors ran the machine out of processes and the capture stopped mid-session. Now one supervised process polls, stores and checks itself, and every page reads what it recorded.',
    to: '/data',
    label: 'Data & sources',
    visual: <ProcessMini />
  },
  {
    title: 'A career on unequal sources',
    body: 'Some series kept lap or section timing, others only the final result. Each keeps its own evidence, gaps stay gaps, and one shared scale, the share of the field he beat, lines the whole career up.',
    to: '/data',
    label: 'Data & sources',
    visual: (
      <figure className="hp-cov">
        <SeriesCoverage mini />
        <figcaption>races, then what each series kept</figcaption>
      </figure>
    )
  },
  {
    title: 'An archive that keeps each byte once',
    body: 'Early captures re-saved driver bios and schedules inside every one-second snapshot. The archive now stores each payload once under its content hash, and each second points back to it.',
    to: '/data',
    label: 'Data & sources',
    visual: <DedupeMini />
  }
];

const PartLink = ({ to, label }: { to: string; label: string }) => (
  <Link to={to} className="navlink hp__link">
    {label} <ArrowRight size={12} aria-hidden />
  </Link>
);

/* The 3D model still of a real race, shaded by section the way the Tracks page shades it. */
const HEAT_SESSION = 'session_indy_nxt_2025_6442';
const HEAT_SLUG = 'weathertech-raceway-laguna-seca';

export const HardParts = () => (
  <div className="hp">
    <article className="hp__feature">
      <Link to={`/races/${HEAT_SESSION}`} className="hp__still" aria-label="Open the 2025 Laguna Seca race">
        <TrackStill slug={HEAT_SLUG} sessionId={HEAT_SESSION} alt="Laguna Seca, 2025, shaded by section" sizes="(max-width: 760px) 100vw, 720px" />
      </Link>
      <div className="hp__words">
        <h3 className="hp__title">Pace maps without GPS</h3>
        <p className="hp__body">
          The timing feed says when a car crossed a loop in the track, never where it is. BryceCast turns those crossings into
          section times and paints them on the track: gold where Bryce was stronger than the field, ink where it was tougher.
        </p>
        <p className="hp__proof">
          <strong className="tnum">1,098 of 1,101</strong> of his laps rebuilt from the feed, across 24 races, match the official section results.
        </p>
        <p className="hp__where">Laguna Seca, 2025.</p>
        <PartLink to="/tracks" label="Tracks" />
      </div>
    </article>
    <div className="hp__grid">
      {PARTS.map((part) => (
        <article key={part.title} className="hp__part">
          <div className="hp__visual">{part.visual}</div>
          <h3 className="hp__title">{part.title}</h3>
          <p className="hp__body">{part.body}</p>
          <PartLink to={part.to} label={part.label} />
        </article>
      ))}
    </div>
  </div>
);
