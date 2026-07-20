import { Card, ScreenHead, StatusChip, Unavailable } from '../app/components';
import { trackOutlineAttribution } from '../assets/tracks';
import { asNumber, asString, formatNumber } from '../app/format';
import { useApiJson } from '../app/useApiJson';
import { uiDataPackage } from '../data/uiDataPackage';

type Row = Record<string, unknown>;

/* The honest source taxonomy behind "a named, checkable source" — official
 * timing is the core, but modeled context and permissioned third-party captures
 * carry a share of the numbers and must be told apart from official fact. */
const sourceClasses: Array<{ name: string; detail: string }> = [
  {
    name: 'Official',
    detail:
      'Series timing, results, lap charts, and section reports. The core of almost every number on the site — the finishing positions, the gaps, the percentiles.'
  },
  {
    name: 'Modeled',
    detail:
      'Clearly labeled estimates where no official feed exists: near-track NWS weather, and the untimed stretch of a lap derived as lap time minus the timed sections. Shown as context, never as official fact.'
  },
  {
    name: 'Permissioned third-party',
    detail:
      'Outside captures used with permission and normalized to our schema: RaceTools race-weekend geometry for street-circuit shapes, and Timing71 timing for 2026 replays. Named wherever they appear.'
  }
];

/** Live recorder console: the single-ingestor's own status file, via the API. */
const RecorderConsole = () => {
  const status = useApiJson<Row>('/api/next-session', 60_000);
  if (!status.data || status.data.available !== true) return null;
  const phase = asString(status.data.phase) ?? '—';
  const ageSeconds = asNumber(status.data.statusAgeSeconds);
  const next = (status.data.nextSession as Row) ?? {};
  const fresh = ageSeconds !== null && ageSeconds < 15 * 60;
  const phaseTone = phase === 'LIVE' ? 'good' : fresh ? 'neutral' : 'warn';
  return (
    <Card title="Live recorder">
      <div className="row row--wrap" style={{ gap: 8 }}>
        <StatusChip tone={phaseTone} label={`recorder ${phase.toLowerCase()}`} live={phase === 'LIVE'} />
        {ageSeconds !== null ? (
          <StatusChip
            tone={fresh ? 'good' : 'warn'}
            label={fresh ? 'heartbeat fresh' : `heartbeat ${Math.round(ageSeconds / 60)} min old`}
          />
        ) : null}
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--ink-secondary)' }}>
        One quiet capture process owns Race Control polling — it sleeps between sessions, arms itself before Bryce runs,
        and records every lap at one-second cadence.
        {asString(next.eventName) ? (
          <>
            {' '}
            Next on its calendar: <strong style={{ color: 'var(--ink-primary)' }}>{asString(next.eventName)}</strong>
            {asString(next.sessionName) ? ` · ${asString(next.sessionName)}` : ''}.
          </>
        ) : null}
      </p>
    </Card>
  );
};

export const DataScreen = () => {
  const sourceOps = uiDataPackage.screens.sourceOps;
  const validation = (sourceOps.validation ?? {}) as Row;
  const ingestion = (sourceOps.ingestion ?? {}) as Row;
  const errorCount = asNumber(validation.errorCount);
  const warningCount = asNumber(validation.warningCount);
  const audit = sourceOps.sourceFamilyAudit as Array<Record<string, string>>;

  return (
    <div className="page stack">
      <ScreenHead
        kicker="Source ops"
        title="Data & trust"
        sub="Every number in BryceCast traces to a named, checkable source. This page is the receipts."
      />

      <div className="grid grid--2">
        <Card title="Dataset health">
          <div className="row row--wrap" style={{ gap: 8 }}>
            <StatusChip
              tone={errorCount === 0 ? 'good' : 'bad'}
              label={`${formatNumber(errorCount, 0)} validation ${errorCount === 1 ? 'error' : 'errors'}`}
            />
            <StatusChip
              tone={warningCount === 0 ? 'good' : 'warn'}
              label={`${formatNumber(warningCount, 0)} ${warningCount === 1 ? 'warning' : 'warnings'}`}
            />
            {asString(uiDataPackage.asOfDate) ? <StatusChip tone="neutral" label={`data as of ${uiDataPackage.asOfDate}`} /> : null}
          </div>
          {asNumber(ingestion.results) !== null ? (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--ink-secondary)' }} className="tnum">
              {formatNumber(ingestion.results, 0)} results · {formatNumber(ingestion.lapSamples, 0)} lap samples ·{' '}
              {formatNumber(ingestion.sourceEvidence, 0)} source-evidence rows across {formatNumber(ingestion.series, 0)} series.
            </p>
          ) : null}
        </Card>
        <RecorderConsole />
      </div>

      <Card title="Three kinds of source">
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--ink-secondary)', maxWidth: '64ch' }}>
          Named and checkable doesn’t mean everything is official series timing. Each number on the site comes from one of
          three kinds of source, and the kind is labeled wherever the number appears.
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          {sourceClasses.map((entry) => (
            <div key={entry.name} style={{ borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-primary)' }}>{entry.name}</span>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-secondary)', maxWidth: '64ch' }}>{entry.detail}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Source families" flush>
        {Array.isArray(audit) && audit.length > 0 ? (
          <div className="tower">
            {audit.map((row, index) => {
              const conclusion = row.auditConclusion ?? row.analysisStatus ?? '';
              /* Read the class straight from the family's own conclusion so the
               * table can't drift from the data: the modeled family says so in
               * its own words ("Modeled non-official weather…"). */
              const sourceClass = /modeled/i.test(conclusion) ? 'modeled' : 'official';
              return (
                <div key={index} className="tower__row" style={{ gridTemplateColumns: '1fr auto' }}>
                  <span className="tower__name" style={{ whiteSpace: 'normal' }}>
                    {row.sourceFamily ?? row.family ?? '—'}
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 500,
                        color: sourceClass === 'modeled' ? 'var(--ink-secondary)' : 'var(--ink-muted)'
                      }}
                    >
                      {sourceClass}
                    </span>
                    <span className="tower__team"> {conclusion}</span>
                  </span>
                  <span className="tower__gap mono" style={{ fontSize: 12 }}>{row.sourceRows ?? ''}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: 18 }}>
            <Unavailable>Source family audit unavailable.</Unavailable>
          </div>
        )}
      </Card>

      <Card title="What BryceCast will not show">
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-secondary)', fontSize: 13.5, display: 'grid', gap: 8 }}>
          <li>Live GPS or a moving car dot — no validated position feed exists.</li>
          <li>In-car video or team radio audio — not available to this project.</li>
          <li>Win or finish predictions — history gets shown as ranges and paths, never as a forecast.</li>
          <li>Official series weather — near-track NWS weather is labeled for what it is.</li>
          <li>Pit, tire, or fuel strategy claims — the official feeds don’t carry them.</li>
        </ul>
      </Card>

      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>{trackOutlineAttribution}</p>
    </div>
  );
};
