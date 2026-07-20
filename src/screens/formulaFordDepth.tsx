/** Formula Ford, in depth — one quiet module inside the 2020 chapter card.
 *
 *  The only pace signal Formula Ford's archive holds is Bryce's own labeled
 *  lap-analysis blocks (never a full-field trace), so there is exactly one
 *  honest story to tell: the SHAPE of his laps by track condition — how tightly
 *  they sat to his own session best — with the lap and session denominators on
 *  screen. No opponent comparison (the samples are Bryce-only) and no
 *  cross-track pace ranking (absolute times fall at different circuits): the
 *  comparable, track-length-agnostic read is the within-session spread. */

import { useMemo } from 'react';
import { SourcePill } from '../app/components';
import { useFormulaFordLapShape, formulaFordLapShapeRef, type FfConditionShape, type FormulaFordLapShapePack } from '../data/formulaFordLapShape';

const CONDITION_ORDER: Record<string, number> = { dry: 0, damp: 1, drying: 2, wet: 3, unknown: 4 };
const CONDITION_LABEL: Record<string, string> = { dry: 'Dry', damp: 'Damp', drying: 'Drying', wet: 'Wet', unknown: 'Unlabelled' };

const oneDp = (value: number): string => value.toFixed(1);
const twoDp = (value: number): string => value.toFixed(2);

const LapShapeByCondition = ({ pack }: { pack: FormulaFordLapShapePack }) => {
  /* Race sessions only — the richest, most comparable window; heats and
     qualifying carry thinner samples and a different rhythm. */
  const rows = useMemo(
    () =>
      pack.conditionContext
        .filter((row) => row.sessionType === 'race')
        .sort((a, b) => (CONDITION_ORDER[a.wetDry] ?? 9) - (CONDITION_ORDER[b.wetDry] ?? 9)),
    [pack]
  );
  if (rows.length === 0) return null;

  const maxSpread = Math.max(...rows.map((row) => row.medianSessionDeltaToBestSeconds));
  const dry = rows.find((row) => row.wetDry === 'dry');
  const wet = rows.find((row) => row.wetDry === 'wet');
  const totalRaces = rows.reduce((sum, row) => sum + row.sessionCount, 0);
  const totalLaps = rows.reduce((sum, row) => sum + row.validLapCount, 0);

  const barPct = (row: FfConditionShape) => Math.max(6, Math.round((row.medianSessionDeltaToBestSeconds / maxSpread) * 100));

  return (
    <div>
      <h3 className="display" style={{ fontSize: 15, margin: '0 0 2px' }}>
        Lap shape by condition
      </h3>
      <p className="ff-copy">
        Formula Ford’s records keep only Bryce’s own timed laps, so the honest read is his rhythm — how tightly each lap sat to
        his own best that session.{' '}
        {dry ? (
          <>
            In the dry, across <strong>{dry.sessionCount}</strong> races and <strong>{dry.validLapCount}</strong> timed laps, his
            typical lap fell within <strong>{twoDp(dry.medianSessionDeltaToBestSeconds)}s</strong> of his best.{' '}
          </>
        ) : null}
        {wet ? (
          <>
            In the wet he held to within <strong>{twoDp(wet.medianSessionDeltaToBestSeconds)}s</strong> across{' '}
            {wet.sessionCount} races.
          </>
        ) : null}
      </p>
      <div className="ff-shape" role="img" aria-label="Bryce's median lap-to-best gap in Formula Ford races, by track condition">
        {rows.map((row) => (
          <div key={`${row.sessionType}-${row.wetDry}`} className="ff-shape__row">
            <span className="ff-shape__label">{CONDITION_LABEL[row.wetDry] ?? row.wetDry}</span>
            <span className="ff-shape__track">
              <span className="ff-shape__fill" style={{ width: `${barPct(row)}%` }} />
            </span>
            <span className="ff-shape__meta">
              {twoDp(row.medianSessionDeltaToBestSeconds)}s to best
              <small>
                {row.sessionCount} {row.sessionCount === 1 ? 'race' : 'races'} · {row.validLapCount} laps
              </small>
            </span>
          </div>
        ))}
      </div>
      <p className="ff-caption">
        Bars show his median gap from lap to session best — shorter is a tighter, more repeatable rhythm. The dry races show the
        smallest gaps; the single damp race and the two drying races show larger ones, on those small samples. That is the
        observed distribution, not an adaptation claim. These are Bryce’s laps only, not a field comparison, and absolute pace
        isn’t compared across conditions because they fall at different circuits. Read from {totalRaces} races and {totalLaps}
        timed laps.
      </p>
    </div>
  );
};

const FormulaFordSourcePill = ({ pack }: { pack: FormulaFordLapShapePack }) => (
  <SourcePill
    title="Formula Ford lap shape"
    entries={[
      {
        label: 'Formula Ford lap-shape context pack',
        path: formulaFordLapShapeRef()?.path,
        note: `Bryce-only lap-analysis blocks, ${pack.counts.lapObservations ?? 279} timed laps across ${pack.counts.sessionSummaries ?? 24} sessions, rolled up by track condition. Integrity-verified (sha256) against the package source inventory at load.`
      }
    ]}
    caveats={[
      'The imported laps are Bryce-only labeled blocks, so they support his own rhythm, never a comparison against opponents.',
      'The comparable read is the within-session gap to his own best; absolute lap times aren’t compared across conditions because the conditions fall at different circuits.',
      'Damp and drying windows are small (one and two races) — shown with lap-count badges, not broad conclusions.',
      'Continuation lap pages remain held out; there are no section, sector, or field-relative pace rows for Formula Ford.'
    ]}
  />
);

export const FormulaFordDepthLayer = () => {
  const pack = useFormulaFordLapShape();
  if (pack === 'failed') {
    return (
      <p className="ff-caption" style={{ margin: 0 }}>
        The Formula Ford lap records failed their integrity check against the source inventory, so they are not shown.
      </p>
    );
  }
  if (!pack) {
    return <p className="ff-caption" style={{ margin: 0 }}>Opening the Formula Ford lap records…</p>;
  }
  return (
    <div className="ff-depth stack">
      <div className="row row--between row--wrap" style={{ alignItems: 'baseline', gap: 8 }}>
        <p className="ff-copy" style={{ margin: 0, maxWidth: '58ch' }}>
          A year in the UK’s classic school of racecraft. The archive holds his own timed laps but no full-field trace, so the one
          honest pace story is the shape of those laps by condition.
        </p>
        <FormulaFordSourcePill pack={pack} />
      </div>
      <LapShapeByCondition pack={pack} />
    </div>
  );
};
