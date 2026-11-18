import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { chapterTint } from '../careerExplorer';
import './seasonCharts.css';

/* ============================================================================
 * 2023 and earlier, behind one disclosure (career round 3, Nov 18 2026).
 *
 * Jack: the 2019-2023 seasons "should probably be hidden behind a drop-down
 * menu for 2023 and earlier". One button under the INDY NXT seasons, closed by
 * default: the years, the series he raced in them, the count. It opens in
 * place (nothing above it moves), keyboard and touch alike; its seasons mount
 * the first time it opens, so a closed drawer costs the page nothing. A year
 * link at the top of the page, or an address ending #season-2019, opens it
 * straight to that year.
 * ==========================================================================*/

export interface EarlierSummary {
  first: number;
  last: number;
  races: number;
  series: Array<{ name: string; short: string }>;
}

export const EarlierDrawer = ({
  open,
  instant,
  onToggle,
  summary,
  children
}: {
  open: boolean;
  /** Opened by a jump link: no growing, so the scroll lands on the year. */
  instant: boolean;
  onToggle: () => void;
  summary: EarlierSummary;
  children: () => ReactNode;
}) => {
  const [mounted, setMounted] = useState(open);
  const [settled, setSettled] = useState(open);
  const body = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) setMounted(true);
    if (!open || instant) setSettled(open);
  }, [open, instant]);

  return (
    <section className="races-earlier" data-open={open ? '' : undefined} data-settled={open && settled ? '' : undefined} aria-label="2023 and earlier">
      <button type="button" className="races-earlier__toggle" aria-expanded={open} aria-controls="races-earlier-body" onClick={onToggle}>
        <span className="races-earlier__head">
          <span className="races-earlier__title">
            {summary.last} and earlier
          </span>
          <span className="races-earlier__sub">
            <span>
              {summary.first} to {summary.last}, before INDY NXT
              <span className="races-earlier__count"> · {summary.races} races</span>
            </span>
            <span className="races-earlier__series" aria-hidden>
              {summary.series.map((series) => (
                <span key={series.name}>
                  <i style={{ background: chapterTint(series.name) }} />
                  {series.short}
                </span>
              ))}
            </span>
          </span>
        </span>
        <span className="races-earlier__cue">
          <span>{open ? 'Hide these seasons' : 'Show these seasons'}</span>
          <ChevronDown size={18} aria-hidden />
        </span>
      </button>
      <div
        id="races-earlier-body"
        ref={body}
        className="races-earlier__body"
        style={instant ? { transition: 'none' } : undefined}
        onTransitionEnd={(event) => {
          if (event.target === body.current && event.propertyName === 'grid-template-rows') setSettled(open);
        }}
      >
        <div className="races-earlier__inner" inert={!open}>
          {mounted ? <div className="races-earlier__seasons">{children()}</div> : null}
        </div>
      </div>
    </section>
  );
};
