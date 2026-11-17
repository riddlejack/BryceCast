import type { ReactNode } from 'react';
import { switchValue } from '../../review/switches';
import './deepDives.css';

/**
 * The career deep dives' shared frame (Jack, November 17, 2026: "There's text
 * everywhere. The chart itself isn't to the same standard as the rest of the
 * site."). One big figure and one sentence, the Sources disclosure, then the
 * chart as the hero, then at most one short line. Method and caveats live
 * behind Sources, never above the chart.
 */
export const DeepDive = ({
  figure,
  unit,
  lede,
  sources,
  controls,
  foot,
  children,
  className
}: {
  /** The section's one headline number, already formatted ("39 of 77"). */
  figure?: ReactNode;
  /** What the figure counts, a few words under it. */
  unit?: ReactNode;
  /** One sentence beside the figure. */
  lede?: ReactNode;
  /** The section's SourcePill: method, denominators and caveats go here. */
  sources?: ReactNode;
  /** Filters or a view toggle, one quiet row above the stage. */
  controls?: ReactNode;
  /** One short line under the stage, if any. */
  foot?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={`dd${className ? ` ${className}` : ''}`}>
    {figure != null || lede || sources ? (
      <div className="dd__head">
        {figure != null ? (
          <div className="dd__figure">
            <span className="dd__num">{figure}</span>
            {unit ? <span className="dd__unit">{unit}</span> : null}
          </div>
        ) : null}
        <div className="dd__words">
          {lede ? <p className="dd__lede">{lede}</p> : null}
          {sources ? <div className="dd__sources">{sources}</div> : null}
        </div>
      </div>
    ) : null}
    {controls ? <div className="dd__controls">{controls}</div> : null}
    <div className="dd__stage">{children}</div>
    {foot ? <p className="dd__foot">{foot}</p> : null}
  </section>
);

/** Review switch: `?deepdive=old` shows the live site's versions of all six sections. */
export const useOldDeepDives = (): boolean => switchValue('deepdive') === 'old';
