import { Fragment } from 'react';
import { ArrowRight } from 'lucide-react';
import { Card, HeroPanel, Reveal, Stat } from '../app/components';
import { Link } from '../app/router';
import './about.css';

/**
 * The source repository is a portfolio candidate still under private review —
 * historical paths, third-party assets, and raw archives are pending
 * permission before any public release. Set this once that repo is public;
 * the "Source on GitHub" credit only renders when it is non-null.
 */
export const REPO_URL: string | null = null;

/* ---------- by the numbers: the README's sourced headline stats, verified
 * line by line against docs/README.md's "What went into it" table ---------- */

const stats: Array<{ label: string; value: string; note: string }> = [
  { label: 'Series', value: '7', note: '2019–2026 · 87 events, 493 sessions' },
  { label: 'Lap samples', value: '75,589', note: '8,943 session-result records' },
  { label: 'Timing-loop crossings', value: '2,613,292', note: '143 source captures — not GPS telemetry' },
  { label: 'INDY NXT races', value: '45 of 45', note: 'observed timing and replay coverage, 2024–2026' },
  { label: 'Weather joins', value: '115', note: 'exact-window sessions, modeled near-track weather' },
  { label: 'Historical archive', value: '7.62 GB', note: '1,136 source objects indexed, not shipped in this build' }
];

/* ---------- the hard parts: one card per engineering case study, in the
 * README's own order, each pointed at where the result actually shows up ---------- */

type HardPart = { title: string; body: string; href: string; label: string };

const hardParts: HardPart[] = [
  {
    title: 'Heat maps without GPS',
    body: 'The timing feed reports when a car crosses fixed physical loops around a track, not GPS coordinates. BryceCast decodes those crossings, reconciles official section distances against a traced outline of the circuit, and colors each named stretch by how the car performed there. Checked against official lap times, the reconstruction reproduced 21 of 25 races to the exact timing tick.',
    href: '/tracks',
    label: 'Pace maps'
  },
  {
    title: 'Pass placement between timing loops',
    body: "A lap chart only updates running order once per lap, and the raw position field in the timing feed is just the starting grid, not live order. BryceCast rebuilds the field's order at every timing loop and, when two cars swap places, brackets the change to the interval between those two loops rather than inventing an exact spot on track.",
    href: '/races',
    label: 'Race replays'
  },
  {
    title: 'One qualifying model, many formats',
    body: "Bryce's career mixes group qualifying, combined grids, reverse-grid races, oval two-lap averages, and a couple of canceled sessions — formats that don't collapse into one clean qualifying-position number. BryceCast keeps each format's own source record intact, links a qualifying result to a race only when the grid position actually matches it, and shows a canceled session as canceled instead of guessing a rank.",
    href: '/races',
    label: 'Race replays'
  },
  {
    title: 'Weather and wind, honestly joined',
    body: "Official series sources don't publish session weather at all, so BryceCast only backfills modeled near-track weather for sessions with a confirmed start-time window, skipping the rest rather than guessing an hour. And because meteorological wind direction is reported as where the wind comes from, the live wind arrow on the track map is rotated so it actually shows which way the air is moving.",
    href: '/live',
    label: 'Live'
  },
  {
    title: 'Models that retain their failures',
    body: "Race history is short, and a model that peeks at information only available after the finish can look great while being useless before a race even starts. BryceCast's prediction workbench keeps every candidate on the record — including its best-scoring model, which is flagged and rejected for exactly that kind of after-the-fact leakage — instead of only publishing the winner.",
    href: '/career',
    label: 'Career Lab'
  },
  {
    title: 'One process, after a drill went wrong',
    body: "During a live-race drill at Road America, several overlapping monitoring processes exhausted the machine's process budget and the capture stopped recording mid-session. BryceCast's live system now runs through one supervised, long-running process that owns polling, storage, and health checks, while every other screen on the site simply reads what that process has already captured.",
    href: '/live',
    label: 'Live'
  },
  {
    title: 'A career across unequal sources',
    body: "Bryce's seven series carry very different depth of timing — some have lap-by-lap and section data, others only official classification. BryceCast keeps each series' native evidence intact rather than filling gaps with zeros, and uses one shared, descriptive scale — finish percentile — to make the whole career comparable without pretending a thin season has the same evidence as a rich one.",
    href: '/career',
    label: 'Career Lab'
  },
  {
    title: 'An archive that stores each byte once',
    body: "Early live captures re-saved a full copy of slow-changing data — driver bios, schedules, track info — inside every one-second timing snapshot, which multiplied storage for content that hadn't actually changed. The current archive stores each unique payload once, keyed by a content hash, and every observation just points back to it, so exact timestamps are kept without repeating the same bytes.",
    href: '/data',
    label: 'Data & trust'
  }
];

/* ---------- how it works: sources through to the app, text and boxes only ---------- */

const pipeline: Array<{ label: string; note: string }> = [
  { label: 'Sources', note: 'official timing, results, and near-track weather' },
  { label: 'Single ingestor / capture', note: 'one long-running process owns polling and writes' },
  { label: 'SQLite + archives', note: 'content-addressed — one payload per hash' },
  { label: 'Analysis pipeline', note: 'reconciliation, validation, derived reports' },
  { label: 'Typed UI data package', note: 'a compact, versioned data contract' },
  { label: 'React app', note: 'this site — TypeScript, Vite, typed adapters' }
];

/* ---------- honest limits: verbatim from the Data page's own list ---------- */

const limits: string[] = [
  'Live GPS or a moving car dot — no validated position feed exists.',
  'Win or finish predictions — history gets shown as ranges and paths, never as a forecast.',
  'Official series weather — near-track NWS weather is labeled for what it is.',
  'Pit, tire, or fuel strategy claims — the official feeds don’t carry them.'
];

const HardPartCard = ({ part }: { part: HardPart }) => (
  <Card title={part.title} className="about-hardpart">
    <p className="about-hardpart__body">{part.body}</p>
    <Link to={part.href} className="navlink about-hardpart__link">
      {part.label} <ArrowRight size={12} aria-hidden />
    </Link>
  </Card>
);

export const AboutScreen = () => (
  <div className="page stack">
    <HeroPanel tint="bryce">
      <span className="kicker">About</span>
      <h1 className="screen-head__title" style={{ marginTop: 6 }}>
        How BryceCast is built
      </h1>
      <p className="screen-head__sub" style={{ maxWidth: '62ch' }}>
        BryceCast is a family-built race companion and career-analytics site for Bryce Aron, driver of the No. 9 car
        in INDY NXT. It turns raw timing feeds, official results, and near-track weather into a companion for race
        weekends and a navigable record of his career — and this page is the tour of how that's built, section by
        section, and what it deliberately won't claim.
      </p>
    </HeroPanel>

    <Reveal>
      <section aria-label="By the numbers">
        <h2 className="section-title">By the numbers</h2>
        <Card>
          <div className="row row--wrap" style={{ gap: 28, rowGap: 20 }}>
            {stats.map((stat) => (
              <Stat key={stat.label} label={stat.label} value={stat.value} note={stat.note} />
            ))}
          </div>
        </Card>
      </section>
    </Reveal>

    <Reveal delay={40}>
      <section aria-label="The hard parts">
        <h2 className="section-title">The hard parts</h2>
        <div className="grid grid--2">
          {hardParts.map((part) => (
            <HardPartCard key={part.title} part={part} />
          ))}
        </div>
      </section>
    </Reveal>

    <Reveal delay={60}>
      <section aria-label="How it works">
        <h2 className="section-title">How it works</h2>
        <Card>
          <div className="about-pipeline">
            {pipeline.map((step, index) => (
              <Fragment key={step.label}>
                <div className="about-pipeline__step">
                  <span className="about-pipeline__step-label">{step.label}</span>
                  <span className="about-pipeline__step-note">{step.note}</span>
                </div>
                {index < pipeline.length - 1 ? (
                  <ArrowRight size={14} className="about-pipeline__arrow" aria-hidden />
                ) : null}
              </Fragment>
            ))}
          </div>
        </Card>
      </section>
    </Reveal>

    <Reveal delay={80}>
      <section aria-label="Honest limits">
        <h2 className="section-title">Honest limits</h2>
        <Card>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-secondary)', fontSize: 13.5, display: 'grid', gap: 8 }}>
            {limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </Card>
      </section>
    </Reveal>

    <Reveal delay={100}>
      <section aria-label="Credits">
        <h2 className="section-title">Credits</h2>
        <Card>
          <div className="stack" style={{ gap: 12 }}>
            <div className="about-credit">
              <span className="about-credit__label">Built by</span>
              <p className="about-credit__detail">Jack Riddle, with family.</p>
            </div>
            <div className="about-credit">
              <span className="about-credit__label">Data sources</span>
              <p className="about-credit__detail">
                Official series timing, results, lap charts, and section reports; modeled near-track NWS weather;
                and permissioned third-party captures — RaceTools race-weekend geometry and Timing71 timing for
                2026 replays. The <Link to="/data" className="navlink" style={{ padding: 0, fontSize: 13 }}>data
                page</Link> names each source behind every number on the site.
              </p>
            </div>
            <div className="about-credit">
              <span className="about-credit__label">AI use</span>
              <p className="about-credit__detail">
                Some of the implementation used AI coding tools — primarily OpenAI Codex, with additional Claude
                Code work — directed throughout by Jack.
              </p>
            </div>
            {REPO_URL ? (
              <div className="about-credit">
                <span className="about-credit__label">Source</span>
                <p className="about-credit__detail">
                  <a href={REPO_URL} className="navlink" style={{ padding: 0, fontSize: 13 }}>
                    Source on GitHub
                  </a>
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      </section>
    </Reveal>
  </div>
);
