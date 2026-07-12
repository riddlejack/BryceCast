import { useState } from 'react';
import type { TrackOutline } from '../assets/tracks';
import { ChartTipCard, chartFont, useMeasuredWidth, type ChartTip } from './charts';

/** Outline-only track line art (OSM tracing, docs/CREATIVE_DIRECTION.md
 *  locked decision 5): thin ink line, gold start/finish tick, optional quiet
 *  corner labels, optional gold section-note dot with hover tooltip. */
export const TrackArt = ({
  outline,
  annotation,
  showCornerLabels = true,
  maxHeight,
  progress
}: {
  outline: TrackOutline;
  annotation?: { corner: string; note: string } | null;
  showCornerLabels?: boolean;
  /** Cap the rendered height so differently-shaped circuits occupy one
   *  consistent box (the art letterboxes inside it, centered). */
  maxHeight?: number;
  /** Optional sourced lap progress. Draws a second ink stroke over a quiet
   * outline; it is race completion, never a car/GPS position. */
  progress?: number;
}) => {
  const [ref, measuredWidth] = useMeasuredWidth<HTMLDivElement>();
  const [tip, setTip] = useState<ChartTip | null>(null);
  const [, , viewWidth, viewHeight] = outline.viewBox.split(' ').map(Number);
  const aspect = viewHeight / viewWidth;
  const width = maxHeight !== undefined ? Math.min(measuredWidth, maxHeight / aspect) : measuredWidth;
  const scale = width > 0 ? width / viewWidth : 1;
  const px = (visual: number) => visual / scale;
  const center = { x: viewWidth / 2, y: viewHeight / 2 };

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative', display: 'flex', justifyContent: 'center' }}>
      {width > 0 ? (
        <svg
          viewBox={outline.viewBox}
          width={width}
          height={width * (viewHeight / viewWidth)}
          role="img"
          aria-label={`${outline.name} track outline`}
          style={{ overflow: 'visible', display: 'block' }}
        >
          {progress === undefined ? (
            <path
              d={outline.mainPath}
              fill="none"
              stroke="var(--ink-primary)"
              strokeWidth={px(2)}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : (
            <>
              <path
                d={outline.mainPath}
                fill="none"
                stroke="var(--grid-hairline)"
                strokeWidth={px(2)}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={outline.mainPath}
                fill="none"
                stroke="var(--ink-primary)"
                strokeWidth={px(2.4)}
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - Math.max(0, Math.min(1, progress))}
                className="track-art__progress"
              />
            </>
          )}
          {outline.startFinish ? (
            <g
              transform={`translate(${outline.startFinish.x} ${outline.startFinish.y}) rotate(${outline.startFinish.angleDeg + 90})`}
            >
              <line x1={-px(8)} x2={px(8)} stroke="var(--bryce)" strokeWidth={px(3.5)} strokeLinecap="round" />
            </g>
          ) : null}
          {outline.cornerArcs
            .filter((arc) => arc.label)
            .map((arc) => {
              const away = Math.hypot(arc.apex.x - center.x, arc.apex.y - center.y) || 1;
              const offsetX = ((arc.apex.x - center.x) / away) * px(20);
              const offsetY = ((arc.apex.y - center.y) / away) * px(20);
              const annotated = annotation != null && arc.label === annotation.corner;
              return (
                <g key={arc.label}>
                  {annotated ? (
                    <>
                      <circle cx={arc.apex.x} cy={arc.apex.y} r={px(4)} fill="var(--bryce)" />
                      <circle
                        cx={arc.apex.x}
                        cy={arc.apex.y}
                        r={px(13)}
                        fill="transparent"
                        style={{ cursor: 'default' }}
                        onMouseEnter={() =>
                          setTip({
                            x: arc.apex.x * scale + Math.max(0, (measuredWidth - width) / 2),
                            y: arc.apex.y * scale,
                            title: `Turn ${annotation.corner}`,
                            detail: annotation.note
                          })
                        }
                        onMouseLeave={() => setTip(null)}
                      />
                    </>
                  ) : null}
                  {showCornerLabels ? (
                    <text
                      x={arc.apex.x + offsetX}
                      y={arc.apex.y + offsetY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--ink-muted)"
                      fontFamily={chartFont}
                      fontSize={px(11.5)}
                      fontWeight={500}
                      style={{ pointerEvents: 'none' }}
                    >
                      {arc.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
        </svg>
      ) : null}
      {tip ? <ChartTipCard tip={tip} width={measuredWidth} /> : null}
    </div>
  );
};
