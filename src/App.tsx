import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Database, FileText, Gauge, RadioTower, RefreshCw, ShieldCheck } from 'lucide-react';
import { loadApiJson } from './data/api';
import { analyticsSurfaceMetricIds, analyticsSurfaceOrder, buildAnalyticsViewModels } from './data/analyticsViewModels';
import type { AnalyticsSurface, LiveReadinessPayload, UiMetricManifest } from './data/analyticsContracts';
import uiMetricManifestJson from '../analysis/ui-contract/ui-metric-manifest.json';

const uiMetricManifest = uiMetricManifestJson as UiMetricManifest;

const surfaceLabels: Record<AnalyticsSurface, string> = {
  race_weekend_prep: 'Race Weekend Prep',
  live_race_companion: 'Live Race Companion',
  race_debrief: 'Race Debrief',
  career_lab: 'Career Lab',
  source_ops: 'Source Ops'
};

const surfaceCopy: Record<AnalyticsSurface, string> = {
  race_weekend_prep: 'Upcoming event context, schedule, venue facts, track history, and NWS weather context.',
  live_race_companion: 'Readiness-gated timing, Bryce status, timing tower, guarded points, replay, and weather strip.',
  race_debrief: 'Official result framing, qualifying conversion, lap-position story, incidents, and source drawer.',
  career_lab: 'Series-level performance, metric parity, result conversion, and explicit source limits.',
  source_ops: 'Validation, live-source health, replay archive state, and operational readiness.'
};

const formatState = (value: string | null | undefined) => (value ? value.replaceAll('_', ' ') : 'unavailable');

const stateTone = (state: string | null | undefined) => {
  if (state === 'ready') return 'good';
  if (state === 'wrong_series' || state === 'blocked') return 'bad';
  if (state === 'degraded' || state === 'stale' || state === 'pre_session') return 'warn';
  return 'muted';
};

function App() {
  const [readiness, setReadiness] = useState<LiveReadinessPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const viewModels = useMemo(() => buildAnalyticsViewModels({ uiMetricManifest, liveReadiness: readiness }), [readiness]);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = await loadApiJson<LiveReadinessPayload>('/api/readiness');
      setReadiness(payload);
      setCheckedAt(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const liveState = viewModels.liveRaceCompanion.productState;
  const points = viewModels.liveRaceCompanion.pointsProjection as
    | {
        mode?: string;
        source?: string;
        label?: string;
        bryce?: { runningDriverPoints?: number | null; totalDriverPoints?: number | null; historicalDriverPoints?: number | null; historicalRank?: number | null };
        fieldCoverage?: { rows?: number; runningDriverPointsRows?: number; totalDriverPointsRows?: number; totalEntrantPointsRows?: number };
      }
    | null;

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">BryceCast product baseline</p>
          <h1>Analytics-first race weekend platform</h1>
          <p className="dek">
            Active frontend work should start from the readiness contract, UI metric manifest, and source-state rules. Legacy POV/radio research is archived evidence,
            not the product direction.
          </p>
        </div>
        <button type="button" className="refresh-button" onClick={refresh} disabled={loading}>
          <RefreshCw size={17} />
          {loading ? 'Checking' : 'Refresh'}
        </button>
      </header>

      <section className="status-grid" aria-label="Current backend contract status">
        <article className={`status-card ${stateTone(liveState)}`}>
          <div className="card-kicker">
            <RadioTower size={18} />
            Live Readiness
          </div>
          <strong>{formatState(liveState)}</strong>
          <p>{readiness?.reason ?? 'Run the API service to inspect current race-day readiness.'}</p>
        </article>

        <article className="status-card">
          <div className="card-kicker">
            <Gauge size={18} />
            Points Contract
          </div>
          <strong>{formatState(points?.mode)}</strong>
          <p>{points?.label ?? 'The UI must render /api/readiness.points and must not recompute live points from raw timing rows.'}</p>
        </article>

        <article className="status-card">
          <div className="card-kicker">
            <ShieldCheck size={18} />
            Source Policy
          </div>
          <strong>guarded</strong>
          <p>Top-series car #9, stale timing, pending enrichment, and missing Bryce rows are explicit readiness states.</p>
        </article>

        <article className="status-card">
          <div className="card-kicker">
            <Database size={18} />
            Contract Surfaces
          </div>
          <strong>{uiMetricManifest.items.length}</strong>
          <p>Metric slots across prep, live, debrief, career lab, and source ops.</p>
        </article>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">Frontend build map</p>
          <h2>Start here, then design the final visual system</h2>
        </div>
        <span>{checkedAt ? `Last checked ${new Date(checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'API not checked yet'}</span>
      </section>

      <section className="surface-grid" aria-label="UI contract surfaces">
        {analyticsSurfaceOrder.map((surface) => {
          const ids = analyticsSurfaceMetricIds[surface];
          return (
            <article className="surface-card" key={surface}>
              <div className="surface-icon">{surface === 'live_race_companion' ? <Activity size={18} /> : surface === 'source_ops' ? <AlertTriangle size={18} /> : <FileText size={18} />}</div>
              <div>
                <h3>{surfaceLabels[surface]}</h3>
                <p>{surfaceCopy[surface]}</p>
                <ul>
                  {ids.map((id) => (
                    <li key={id}>
                      <CheckCircle2 size={15} />
                      {id.replaceAll('_', ' ')}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </section>

      <section className="handoff-panel">
        <h2>Hard boundaries for the next UI lane</h2>
        <div className="handoff-grid">
          <p>Use <code>/api/readiness</code> as the live product gate. Raw timing routes are detail/provenance, not the source of UI truth.</p>
          <p>Render unavailable, partial, stale, wrong-series, and non-official weather states explicitly. Do not hide missing data.</p>
          <p>Build visual polish around the analysis contract. Do not copy the archived POV/radio dashboard or its dark neon visual language.</p>
        </div>
      </section>
    </main>
  );
}

export default App;
