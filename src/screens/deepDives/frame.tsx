import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChartTipCard, useCoarsePointer, type ChartTip } from '../../app/charts';
import type { TapPreview } from '../../app/tapPreview';
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

/**
 * The deep dives' race card. On a mouse it is measured and clamped inside the
 * chart so a mark near either edge never pushes it off the page; on touch, or
 * once a tap has armed a race, it is the site's ChartTipCard with "Open the race".
 */
export const DeepTip = ({ tip, width, tap }: { tip: ChartTip; width: number; tap?: TapPreview }) => {
  const coarse = useCoarsePointer();
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(300);
  useEffect(() => {
    if (ref.current) setW(ref.current.offsetWidth);
  }, [tip.title, tip.detail]);
  if (coarse || (tap && tap.armed !== null)) return <ChartTipCard tip={tip} width={width} tap={tap} />;
  const left = Math.min(Math.max(tip.x - w / 2, 0), Math.max(0, width - w));
  return (
    <div ref={ref} className="dd-card" style={{ left, top: tip.y }} role="status">
      <strong>{tip.title}</strong>
      {tip.detail ? <span>{tip.detail}</span> : null}
      {tip.action ? <em>Click to {tip.action}</em> : null}
    </div>
  );
};
