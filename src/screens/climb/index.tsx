import { Card, SourcePill } from '../../app/components';
import { PointerOpen, useInViewOnce, useMeasuredWidth, useReducedMotion } from '../../app/charts';
import { uiDataPackage } from '../../data/uiDataPackage';
import { switchValue } from '../../review/switches';
import { FieldView } from './field';
import { useClimbModel, usePlayClock } from './model';
import { OldClimb } from './old';
import { Staircase } from './ladder';
import './climb.css';

/* ============================================================================
 * The climb, race by race (career round 2, November 17, 2026).
 *
 * Jack: "redo the climb race by race… I think it's a little bit outdated at
 * this point. There's probably a more clever visualization", with "fun
 * population behavior… where the chart loads the same way that when you click
 * on before the record, there's the fun animation that plays now."
 *
 *   default         the staircase: a step per series, every race a dot on it
 *   ?climb=field    the field: every race's field as a bar, his place notched
 *   ?climb=old      the chart live before round 2
 * ==========================================================================*/

type Version = 'stairs' | 'field' | 'old';

const versionOf = (): Version => {
  const value = switchValue('climb');
  return value === 'field' || value === 'old' ? value : 'stairs';
};

const CLOCK_MS: Record<Exclude<Version, 'old'>, number> = { stairs: 3600, field: 3000 };

export const TheClimb = () => {
  const version = versionOf();
  if (version === 'old') return <OldClimb />;
  return <NewClimb version={version} />;
};

const NewClimb = ({ version }: { version: Exclude<Version, 'old'> }) => {
  const model = useClimbModel();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const p = usePlayClock(inView && width > 0, reduced, CLOCK_MS[version]);
  if (!model) return null;
  const classified = model.races.filter((race) => race.finish !== null).length;
  const unclassified = model.races.length - classified;

  return (
    <Card
      className="climb-section"
      title="The climb, race by race"
      action={
        <SourcePill
          title="The climb"
          entries={[
            {
              label: 'Career result conversion · all series',
              path: 'analysis/career-parity/output/tables/career_result_conversion.csv',
              note: `${classified} races with a classified finish: start, finish and field size (the canonical result row's count of cars in the result). How high a dot sits is the share of the other cars he finished ahead of: (field − place) ÷ (field − 1), so a win is at the top of its step and a last place at the bottom. It stays fair as field sizes change between series.`
            },
            {
              label: 'Canonical career results · no classified finish',
              path: 'data/career/career.dataset.json',
              note: `${unclassified} races with no finishing position in the source (a DNF, DNS or DSQ): drawn as a cross under its step, each with its own race page. Together, ${model.races.length} races, the record's count.`
            },
            {
              label: 'How the chart is drawn',
              path: 'src/screens/climb/model.ts',
              note: 'A step per series in the order he first raced it; the three 2019 series (SCCA Super Tour, F1600 and RCFFS) share one step, as they share a car class and their meetings interleave; each dot keeps its own series’ colour. USF Pro 2000 and the Rolex 24 ran during his INDY NXT years and sit on that step as one-offs. The line on each step is a seven-race trimmed mean of that share (the middle 60% of the window). Named moments use the package’s deterministic rules.'
            }
          ]}
          caveats={uiDataPackage.screens.careerLab.caveats}
        />
      }
    >
      <p className="caption caption--secondary climb-caption">
        {version === 'stairs' ? (
          <>
            One step per series, in the order he raced them · the higher the dot, the more of the other cars he finished ahead of · ✕ no classified finish ·{' '}
            <PointerOpen what="any dot" then="to open its race" />
          </>
        ) : (
          <>
            Every race’s field, front at the top · his place is the notch · <PointerOpen what="any race" then="to open it" />
          </>
        )}
      </p>
      <div ref={viewRef}>
        <div ref={ref} className="climb">
          {width > 0 ? version === 'field' ? <FieldView model={model} width={width} p={p} /> : <Staircase model={model} width={width} p={p} /> : null}
        </div>
      </div>
    </Card>
  );
};
