import { useEffect } from 'react';
import { ScreenHead, SourcePill, Unavailable } from '../app/components';
import { trackOutlineAttribution } from '../assets/tracks';
import { asNumber, asString } from '../app/format';
import { useApiJson } from '../app/useApiJson';
import { uiDataPackage } from '../data/uiDataPackage';
import { switchValue } from '../review/switches';
import { DeepDive } from './deepDives/frame';
import { careerRecord, countWord, longDate } from './aboutData/career';
import { SeriesCoverage } from './aboutData/SeriesCoverage';
import './aboutData/data.css';

/* Data & sources (final pass, November 17, 2026). Named as the footer names
 * it. What the record holds first: the 173-race career record and what each
 * series' record carries, then the INDY NXT 2024–2026 dataset (the source
 * families below count only that dataset: their audit is
 * indy_nxt_source_family_audit.csv), the three kinds of source, the checks
 * and the recorder, and the one list of what the site will not show (About
 * links here for it).
 *
 * Review switch `dddata`: unset = the INDY NXT sources in four groups
 * (default); `list` = the same sources as one list. */

type Row = Record<string, unknown>;

const sourceKinds: Array<{ name: string; detail: string }> = [
  { name: 'Official', detail: 'Series timing, results, lap charts and section reports: almost every number on the site.' },
  { name: 'Modeled', detail: 'Labeled estimates where no official feed exists: near-track NWS weather, and the untimed stretch of a lap (lap time minus the timed sections).' },
  { name: 'Permissioned third-party', detail: 'Shared with permission and named where used: RaceTools track shapes for street circuits, Timing71 timing for 2026 replays.' }
];

/* The INDY NXT source families, in plain words. The audit's own conclusion
 * (a note for the analysts) is the fallback for a family not listed here. */
const FAMILY: Record<string, { name: string; note: string }> = {
  race_results: { name: 'Race results', note: 'His result in each race.' },
  full_field_results: { name: 'Full-field results', note: 'Where every car finished.' },
  qualifying_results: { name: 'Qualifying', note: 'Every qualifying session, in its own format.' },
  practice_results: { name: 'Practice', note: 'Used as a ranking only, never as pace.' },
  lap_samples: { name: 'Lap charts', note: 'The running order, lap by lap.' },
  section_results: { name: 'Section times', note: 'Time through each named stretch, lap by lap.' },
  top_section_times: { name: 'Best section times', note: 'Each driver’s best through each stretch.' },
  leader_lap_summary: { name: 'Laps led', note: 'Who led, and for how long.' },
  event_summary_stats: { name: 'Race summaries', note: 'Cautions, passes and lead changes.' },
  incidents: { name: 'Incidents', note: 'From the official reports.' },
  penalties: { name: 'Penalties', note: 'Official penalties and decisions.' },
  racecraft_events: { name: 'Places gained', note: 'The series’ own most-improved awards. No pass is guessed.' },
  pit_stop_counts: { name: 'Pit stops', note: 'How many each car made; nothing on tires or service.' },
  weather_observations: { name: 'Weather', note: 'Near-track, for sessions with a known start time.' },
  future_schedule: { name: 'Schedule', note: 'Sessions still to come.' }
};

const GROUPS: Array<{ title: string; families: string[] }> = [
  { title: 'Results', families: ['race_results', 'full_field_results', 'qualifying_results', 'practice_results'] },
  { title: 'Timing', families: ['lap_samples', 'section_results', 'top_section_times', 'leader_lap_summary'] },
  { title: 'In the race', families: ['event_summary_stats', 'incidents', 'penalties', 'racecraft_events', 'pit_stop_counts'] },
  { title: 'Around it', families: ['weather_observations', 'future_schedule'] }
];

/* Families with nothing in them belong in "will not show", not in a count of zero. */
const familyRows = (audit: Array<Record<string, string>>) =>
  audit
    .map((row) => {
      const id = row.sourceFamily ?? row.family ?? '';
      const conclusion = row.auditConclusion ?? row.analysisStatus ?? '';
      const plain = FAMILY[id];
      return {
        id,
        name: plain?.name ?? id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
        note: plain?.note ?? conclusion,
        modeled: /modeled/i.test(conclusion),
        records: asNumber(row.sourceRows)
      };
    })
    .filter((row) => row.records !== null && row.records > 0);

type Family = ReturnType<typeof familyRows>[number];

const FamilyLine = ({ family }: { family: Family }) => (
  <li className="dfam">
    <span className="dfam__n tnum">{(family.records ?? 0).toLocaleString('en-US')}</span>
    <span className="dfam__words">
      <span className="dfam__name">
        {family.name}
        {family.modeled ? <span className="dfam__tag">modeled</span> : null}
      </span>
      <span className="dfam__note">{family.note}</span>
    </span>
  </li>
);

const Families = ({ families }: { families: Family[] }) => {
  if (switchValue('dddata') === 'list') {
    return (
      <ul className="dfam-list">
        {families.map((family) => (
          <FamilyLine key={family.id} family={family} />
        ))}
      </ul>
    );
  }
  const placed = new Set(GROUPS.flatMap((group) => group.families));
  const groups = [...GROUPS.map((group) => ({ ...group, rows: group.families.map((id) => families.find((f) => f.id === id)).filter((f): f is Family => Boolean(f)) }))];
  const rest = families.filter((family) => !placed.has(family.id));
  if (rest.length) groups[groups.length - 1].rows.push(...rest);
  return (
    <div className="dfam-groups">
      {groups
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <section key={group.title} className="dfam-group">
            <h3 className="dfam-group__title">{group.title}</h3>
            <ul>
              {group.rows.map((family) => (
                <FamilyLine key={family.id} family={family} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
};

/** The validation's one known warning, in plain words; any other message as written. */
const plainIssue = (message: string): string => {
  const match = message.match(/^(\d+) physical sessions? do(?:es)? not yet have scheduledStart or actualStart/i);
  if (match) {
    const n = Number(match[1]);
    return `${countWord(n).replace(/^./, (c) => c.toUpperCase())} ${n === 1 ? 'session has' : 'sessions have'} no start time on record yet, so no weather is joined to ${n === 1 ? 'it' : 'them'}.`;
  }
  return message;
};

const Checks = () => {
  const validation = (uiDataPackage.screens.sourceOps.validation ?? {}) as Row;
  const errors = asNumber(validation.errorCount);
  const issues = Array.isArray(validation.issues) ? (validation.issues as Row[]) : [];
  const warnings = issues.filter((issue) => asString(issue.severity) === 'warn');
  const asOf = asString(uiDataPackage.asOfDate);
  return (
    <div className="dstat">
      <h3 className="dstat__title">Checks</h3>
      <p className="dstat__line">
        {errors === 0 ? 'No errors' : `${errors ?? '—'} ${errors === 1 ? 'error' : 'errors'}`} in the last full check
        {asOf ? `, on the data as of ${longDate(asOf)}` : ''}.
      </p>
      {warnings.length ? (
        <p className="dstat__note">
          {warnings.length === 1 ? 'One open note: ' : `${countWord(warnings.length)} open notes: `}
          {warnings.map((issue) => plainIssue(asString(issue.message) ?? '')).join(' ')}
        </p>
      ) : null}
    </div>
  );
};

/** The live recorder's own status, via the API. Absent in the demo build. */
const Recorder = () => {
  const status = useApiJson<Row>('/api/next-session', 60_000);
  if (!status.data || status.data.available !== true) return null;
  const phase = (asString(status.data.phase) ?? '—').toLowerCase();
  const ageSeconds = asNumber(status.data.statusAgeSeconds);
  const next = (status.data.nextSession as Row) ?? {};
  const fresh = ageSeconds !== null && ageSeconds < 15 * 60;
  const nextName = asString(next.eventName);
  return (
    <div className="dstat">
      <h3 className="dstat__title">Live recorder</h3>
      <p className="dstat__line">
        {phase.charAt(0).toUpperCase() + phase.slice(1)}
        {ageSeconds !== null ? (fresh ? ', heartbeat fresh' : `, last heartbeat ${Math.round(ageSeconds / 60)} min ago`) : ''}.
        {nextName ? (
          <>
            {' '}
            Next: <strong>{nextName}</strong>
            {asString(next.sessionName) ? `, ${asString(next.sessionName)?.toLowerCase()}` : ''}.
          </>
        ) : null}
      </p>
      <p className="dstat__note">One process records every lap each second. It sleeps between sessions and wakes before Bryce runs.</p>
    </div>
  );
};

const WONT_SHOW: Array<{ head: string; why: string }> = [
  { head: 'A live car dot or GPS', why: 'No validated position feed exists.' },
  { head: 'Car telemetry', why: 'Throttle, brake and speed traces are in none of the sources.' },
  { head: 'In-car video or team radio', why: 'Not available to this project.' },
  { head: 'Win or finish predictions', why: 'History is shown as ranges and paths, never as a forecast.' },
  { head: 'Official series weather', why: 'The series don’t publish it. Near-track NWS weather is labeled for what it is.' },
  { head: 'Pit, tire or fuel strategy calls', why: 'The official feeds don’t carry them. The Career page’s fuel figure is a modelled range, and says how.' }
];

export const DataScreen = () => {
  const sourceOps = uiDataPackage.screens.sourceOps;
  const audit = (sourceOps.sourceFamilyAudit ?? []) as Array<Record<string, string>>;
  const families = Array.isArray(audit) ? familyRows(audit) : [];
  const nxt = (sourceOps.coverage as { indyNxt?: { years?: number[]; categories?: Row[] } } | null)?.indyNxt;
  const category = (id: string) => nxt?.categories?.find((row) => row.id === id);
  const nxtRaces = asNumber(category('race_results')?.covered);
  const nxtSessions = asNumber(category('events_sessions')?.covered);
  const years = nxt?.years ?? [];
  const yearSpan = years.length ? `${Math.min(...years)} to ${Math.max(...years)}` : null;

  /* The router scrolls to the top on every move; honour a #section from a link (About → #wont-show). */
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="page stack data">
      <ScreenHead
        title="Data & sources"
        sub="Every number on BryceCast comes from a named source you can check. Here is what the record holds, where it comes from, and what it leaves out."
      />

      <section aria-labelledby="data-career" className="data-section">
        <h2 id="data-career" className="section-title">
          The career record
        </h2>
        {careerRecord ? (
          <DeepDive
            figure={careerRecord.races}
            unit="races"
            lede={
              <>
                in <strong>{countWord(careerRecord.series)} series</strong>, {careerRecord.from} to {careerRecord.to}, each from the series’ official
                results and timing sheets. Every race has its official result; the dots show what else its series kept.
              </>
            }
            sources={
              <SourcePill
                title="The career record"
                entries={careerRecord.sourceRefs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note }))}
                caveats={careerRecord.caveats}
              />
            }
          >
            <div id="coverage">
              <SeriesCoverage />
            </div>
          </DeepDive>
        ) : (
          <Unavailable>The career record is unavailable in this build.</Unavailable>
        )}
      </section>

      <section aria-labelledby="data-nxt" className="data-section">
        <h2 id="data-nxt" className="section-title">
          INDY NXT{yearSpan ? `, ${yearSpan}` : ''}, in full depth
        </h2>
        {families.length > 0 ? (
          <DeepDive
            figure={nxtRaces ?? '—'}
            unit="INDY NXT races"
            lede={
              <>
                {nxtSessions !== null ? (
                  <>
                    and <strong>{nxtSessions} sessions</strong> in all,{' '}
                  </>
                ) : null}
                read from the series’ live timing, lap charts and section reports. Each number below is how many records one source holds for this
                dataset.
              </>
            }
            sources={
              <SourcePill
                title="INDY NXT sources"
                entries={audit.map((row) => ({
                  label: FAMILY[row.sourceFamily ?? '']?.name ?? row.sourceFamily ?? '—',
                  path: row.sourceFamily ?? undefined,
                  note: [row.primaryArtifacts, row.auditConclusion].filter(Boolean).join(' · ') || undefined
                }))}
              />
            }
          >
            <Families families={families} />
          </DeepDive>
        ) : (
          <Unavailable>The INDY NXT source audit is unavailable in this build.</Unavailable>
        )}
      </section>

      <section aria-labelledby="data-kinds" className="data-section">
        <h2 id="data-kinds" className="section-title">
          Three kinds of source
        </h2>
        <ul className="dkinds">
          {sourceKinds.map((kind) => (
            <li key={kind.name}>
              <strong>{kind.name}</strong>
              <span>{kind.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Checks and the live recorder" className="dstats">
        <Checks />
        <Recorder />
      </section>

      <section id="wont-show" aria-labelledby="data-wont" className="data-section">
        <h2 id="data-wont" className="section-title">
          What BryceCast will not show
        </h2>
        <ul className="dwont">
          {WONT_SHOW.map((item) => (
            <li key={item.head}>
              <strong>{item.head}</strong>
              <span>{item.why}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="data-attribution">{trackOutlineAttribution}</p>
    </div>
  );
};
