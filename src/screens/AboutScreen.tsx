import { ArrowRight } from 'lucide-react';
import { SourcePill } from '../app/components';
import { Link } from '../app/router';
import { switchValue } from '../review/switches';
import { DeepDive } from './deepDives/frame';
import { careerRecord, countWord } from './aboutData/career';
import { RaceStrip, SeriesBar } from './aboutData/RaceStrip';
import { HardParts } from './aboutData/HardParts';
import { Pipeline } from './aboutData/Pipeline';
import './about.css';

/**
 * The source repository is a portfolio candidate still under private review —
 * historical paths, third-party assets, and raw archives are pending
 * permission before any public release. Set this once that repo is public;
 * the "Source on GitHub" credit only renders when it is non-null.
 */
export const REPO_URL: string | null = null;

/* About (final pass, November 17, 2026): what the site is and the career it
 * covers first, with the Career page's own figures (173 races, 10 series, 38
 * tracks, 9 countries) in place of the README's stat tiles; then the hard
 * parts, each with a drawing; the flow as a diagram; credits. The "what it
 * won't show" list lives once, on Data & sources.
 *
 * Review switch `ddabout`: unset = every race on one line (default);
 * `bar` = the same races as one bar by series. */

const linkStyle = { padding: 0, fontSize: 'inherit', color: 'var(--link)' } as const;

const TheRecord = () => {
  if (!careerRecord) return null;
  const r = careerRecord;
  const bar = switchValue('ddabout') === 'bar';
  return (
    <DeepDive
      className="about-record"
      figure={r.races}
      unit="races"
      lede={
        <>
          in <strong>{countWord(r.series)} series</strong>, at {r.venues} tracks in {countWord(Number(r.countries))} countries, from his first car
          race in {r.from} to {r.to}
          {r.wins && r.podiums ? `: ${r.wins} wins and ${r.podiums} podiums.` : '.'}
        </>
      }
      sources={
        <SourcePill
          title="The career record"
          entries={r.sourceRefs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note }))}
          caveats={r.caveats}
        />
      }
      foot={
        <Link to="/career" className="navlink about-inline-link">
          The whole career, race by race, on Career <ArrowRight size={12} aria-hidden />
        </Link>
      }
    >
      {bar ? <SeriesBar /> : <RaceStrip />}
    </DeepDive>
  );
};

export const AboutScreen = () => (
  <div className="page stack about">
    <header className="about-head">
      <span className="kicker">About BryceCast</span>
      <h1 className="screen-head__title">Bryce Aron’s racing, on the record</h1>
      <p className="screen-head__sub">
        BryceCast follows Bryce Aron, driver of the No. 9 car in INDY NXT, live through his race weekends, and keeps the record of every
        car race he has run. A friend built it from the series’ own results and timing.
      </p>
    </header>

    <TheRecord />

    <section aria-labelledby="about-hard" className="about-section">
      <h2 id="about-hard" className="section-title">
        The hard parts
      </h2>
      <HardParts />
    </section>

    <section aria-labelledby="about-how" className="about-section">
      <h2 id="about-how" className="section-title">
        How it works
      </h2>
      <Pipeline />
      <p className="about-after">
        <Link to="/data#wont-show" className="navlink about-inline-link">
          What the site will not show, and why, on Data &amp; sources <ArrowRight size={12} aria-hidden />
        </Link>
      </p>
    </section>

    <section aria-labelledby="about-credits" className="about-section">
      <h2 id="about-credits" className="section-title">
        Credits
      </h2>
      <div className="about-credits">
        <div className="about-credit">
          <span className="about-credit__label">Built by</span>
          <p className="about-credit__detail">Jack Riddle.</p>
        </div>
        <div className="about-credit">
          <span className="about-credit__label">Data sources</span>
          <p className="about-credit__detail">
            Official series timing, results, lap charts, and section reports; modeled near-track NWS weather; and permissioned third-party
            captures: RaceTools race-weekend geometry and Timing71 timing for 2026 replays.{' '}
            <Link to="/data" className="navlink" style={linkStyle}>
              Data &amp; sources
            </Link>{' '}
            names each source behind every number on the site.
          </p>
        </div>
        <div className="about-credit">
          <span className="about-credit__label">AI use</span>
          <p className="about-credit__detail">
            Some of the implementation used AI coding tools, primarily OpenAI Codex with additional Claude Code work, directed throughout by
            Jack.
          </p>
        </div>
        {REPO_URL ? (
          <div className="about-credit">
            <span className="about-credit__label">Source</span>
            <p className="about-credit__detail">
              <a href={REPO_URL} className="navlink" style={linkStyle}>
                Source on GitHub
              </a>
            </p>
          </div>
        ) : null}
      </div>
    </section>
  </div>
);
