import { Card, StatusChip, Unavailable } from '../app/components';
import { asNumber, asString, formatNumber } from '../app/format';
import { uiDataPackage } from '../data/uiDataPackage';

type Row = Record<string, unknown>;

export const DataScreen = () => {
  const sourceOps = uiDataPackage.screens.sourceOps;
  const validation = (sourceOps.validation ?? {}) as Row;
  const ingestion = (sourceOps.ingestion ?? {}) as Row;
  const errorCount = asNumber(validation.errorCount);
  const warningCount = asNumber(validation.warningCount);
  const audit = sourceOps.sourceFamilyAudit as Array<Record<string, string>>;

  return (
    <div className="page stack">
      <header>
        <h1 className="display" style={{ fontSize: 26, margin: 0 }}>
          Data & trust
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--ink-secondary)', fontSize: 14 }}>
          Every number in BryceCast traces to an official source. This page is the receipts.
        </p>
      </header>

      <Card title="Dataset health">
        <div className="row row--wrap" style={{ gap: 8 }}>
          <StatusChip tone={errorCount === 0 ? 'good' : 'bad'} label={`${formatNumber(errorCount, 0)} validation errors`} />
          <StatusChip tone={warningCount === 0 ? 'good' : 'warn'} label={`${formatNumber(warningCount, 0)} warnings`} />
          {asString(uiDataPackage.asOfDate) ? <StatusChip tone="neutral" label={`data as of ${uiDataPackage.asOfDate}`} /> : null}
        </div>
        {asNumber(ingestion.results) !== null ? (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--ink-secondary)' }}>
            {formatNumber(ingestion.results, 0)} results · {formatNumber(ingestion.lapSamples, 0)} lap samples ·{' '}
            {formatNumber(ingestion.sourceEvidence, 0)} source-evidence rows across {formatNumber(ingestion.series, 0)} series.
          </p>
        ) : null}
      </Card>

      <Card title="Source families" flush>
        {Array.isArray(audit) && audit.length > 0 ? (
          <div className="tower">
            {audit.map((row, index) => (
              <div key={index} className="tower__row" style={{ gridTemplateColumns: '1fr auto' }}>
                <span className="tower__name" style={{ whiteSpace: 'normal' }}>
                  {row.sourceFamily ?? row.family ?? '—'}
                  <span className="tower__team"> {row.auditConclusion ?? row.analysisStatus ?? ''}</span>
                </span>
                <span className="tower__gap">{row.sourceRows ?? ''}</span>
              </div>
            ))}
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
    </div>
  );
};
