import { chartFont, useInViewOnce, useMeasuredWidth, useReducedMotion } from '../../app/charts';
import './pipeline.css';

/* How it works, as the real flow: four kinds of input, the one capture
 * process that only the live feed passes through, the archive, the analysis,
 * the one data package, and the site. Live pages also read the capture
 * directly (dashed). On a wide screen it is drawn left to right with a small
 * mark travelling each path; on a phone it is the same chain top to bottom. */

type Node = { key: string; label: string; note: string[]; kind?: 'source' | 'step' | 'site' };

const SOURCES: Array<Node & { to: string; row: number; tag: string }> = [
  { key: 'live', label: 'Live timing', note: ['INDY NXT Race Control,', 'every second'], kind: 'source', to: 'capture', row: 0, tag: 'into the capture' },
  { key: 'sheets', label: 'Official results', note: ['and timing sheets,', '10 series, 2019 to 2026'], kind: 'source', to: 'archive', row: 1, tag: 'into the archive' },
  { key: 'captures', label: 'Permissioned captures', note: ['RaceTools track shapes,', 'Timing71 for 2026 replays'], kind: 'source', to: 'archive', row: 2, tag: 'into the archive' },
  { key: 'weather', label: 'Race weather', note: ['Open-Meteo reanalysis,', 'checked by NOAA stations'], kind: 'source', to: 'analysis', row: 3, tag: 'joined in the analysis' }
];

const CHAIN: Node[] = [
  { key: 'capture', label: 'One capture process', note: ['sleeps between sessions,', 'records every second'] },
  { key: 'archive', label: 'Archive', note: ['each payload stored once,', 'under its content hash'] },
  { key: 'analysis', label: 'Analysis', note: ['laps, sections, places,', 'checked against the sheets'] },
  { key: 'package', label: 'Data package', note: ['one versioned file the', 'whole site reads'] },
  { key: 'site', label: 'BryceCast', note: ['this site'], kind: 'site' }
];

const NodeText = ({ node, x, y, w, k = 1 }: { node: Node; x: number; y: number; w: number; k?: number }) => (
  <g>
    <line x1={x} x2={x + w} y1={y} y2={y} stroke={node.kind === 'site' ? 'var(--bryce)' : 'var(--ink)'} strokeWidth={node.kind === 'site' ? 3 : 1} />
    <text x={x} y={y + 22 * k} fontFamily={chartFont} fontSize={15 * k} fontWeight={600} fill="var(--ink)">
      {node.label}
    </text>
    {node.note.map((line, index) => (
      <text key={line} x={x} y={y + (41 + index * 17) * k} fontFamily={chartFont} fontSize={13 * k} fill="var(--ink-secondary)">
        {line}
      </text>
    ))}
  </g>
);

const WideDiagram = ({ width, moving }: { width: number; moving: boolean }) => {
  const k = width > 1500 ? 1.15 : 1;
  const cols = 6;
  const nw = Math.min(230 * k, Math.max(160, (width - 5 * 40) / cols));
  const gap = (width - cols * nw) / (cols - 1);
  const colX = (col: number) => col * (nw + gap);
  const rowH = 80 * k;
  const top = 24;
  const rowY = (row: number) => top + row * rowH;
  const H = top + 4 * rowH - 6;
  const anchorY = (row: number) => rowY(row) + 17 * k;
  const colOf: Record<string, number> = { capture: 1, archive: 2, analysis: 3, package: 4, site: 5 };
  const rowOf: Record<string, number> = { capture: 0, archive: 1, analysis: 1, package: 1, site: 1 };

  /* An elbow from the right edge of one node to the left edge of another. */
  const elbow = (fromCol: number, fromRow: number, toCol: number, toRow: number): string => {
    const x1 = colX(fromCol) + nw + 8;
    const y1 = anchorY(fromRow);
    const x2 = colX(toCol) - 10;
    const y2 = anchorY(toRow);
    if (y1 === y2) return `M${x1},${y1} H${x2}`;
    const bend = colX(toCol) - gap / 2;
    const r = Math.min(10, Math.abs(y2 - y1) / 2);
    const dir = y2 > y1 ? 1 : -1;
    return `M${x1},${y1} H${bend - r} Q${bend},${y1} ${bend},${y1 + dir * r} V${y2 - dir * r} Q${bend},${y2} ${bend + r},${y2} H${x2}`;
  };

  const paths: Array<{ id: string; d: string; strong?: boolean }> = [
    ...SOURCES.map((source) => ({ id: `p-${source.key}`, d: elbow(0, source.row, colOf[source.to], rowOf[source.to]) })),
    { id: 'p-capture', d: elbow(1, 0, 2, 1) },
    { id: 'p-archive', d: elbow(2, 1, 3, 1), strong: true },
    { id: 'p-analysis', d: elbow(3, 1, 4, 1), strong: true },
    { id: 'p-package', d: elbow(4, 1, 5, 1), strong: true }
  ];
  /* Live pages read the capture directly: along the top row, then down into the site. */
  const liveX1 = colX(1) + nw + 8;
  const liveBend = colX(5) + nw / 2;
  const liveY = anchorY(0);
  const liveRead = `M${liveX1},${liveY} H${liveBend - 10} Q${liveBend},${liveY} ${liveBend},${liveY + 10} V${rowY(1) - 10}`;

  return (
    <svg width={width} height={H} role="img" aria-label="How BryceCast works, as a diagram." style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <marker id="pl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M0,0.5 L7.5,4 L0,7.5" fill="none" stroke="var(--grey-ink3)" strokeWidth="1.3" />
        </marker>
      </defs>
      {paths.map((path) => (
        <path
          key={path.id}
          id={path.id}
          d={path.d}
          fill="none"
          stroke={path.strong ? 'var(--ink-faint)' : 'var(--grey-line)'}
          strokeWidth={path.strong ? 1.4 : 1.2}
          markerEnd="url(#pl-arrow)"
        />
      ))}
      <path id="p-liveread" d={liveRead} fill="none" stroke="var(--grey-line)" strokeWidth={1.2} strokeDasharray="3 4" markerEnd="url(#pl-arrow)" />
      <text x={(liveX1 + liveBend) / 2} y={liveY - 7} textAnchor="middle" fontFamily={chartFont} fontSize={12 * k} fill="var(--ink-muted)">
        live pages read the capture as it runs
      </text>
      {moving
        ? [...paths, { id: 'p-liveread' }].map((path, index) => (
            <circle key={`dot-${path.id}`} r={2.6} fill="var(--amber)">
              <animateMotion dur={path.id === 'p-live' || path.id === 'p-liveread' ? '1s' : '3.2s'} begin={`${(index * 0.37) % 2}s`} repeatCount="indefinite">
                <mpath href={`#${path.id}`} />
              </animateMotion>
            </circle>
          ))
        : null}
      {SOURCES.map((source) => (
        <NodeText key={source.key} node={source} x={colX(0)} y={rowY(source.row)} w={nw} k={k} />
      ))}
      {CHAIN.map((node) => (
        <NodeText key={node.key} node={node} x={colX(colOf[node.key])} y={rowY(rowOf[node.key])} w={nw} k={k} />
      ))}
    </svg>
  );
};

/* Phone: the four inputs, each saying where it goes in, then the chain. */
const TallDiagram = () => (
  <div className="pl-tall">
    <ul className="pl-tall__sources">
      {SOURCES.map((source) => (
        <li key={source.key}>
          <strong>{source.label}</strong>
          <span>{source.note.join(' ')}</span>
          <em>{source.tag}</em>
        </li>
      ))}
    </ul>
    <ol className="pl-tall__chain">
      {CHAIN.map((node) => (
        <li key={node.key} className={node.kind === 'site' ? 'pl-tall__site' : undefined}>
          <strong>{node.label}</strong>
          <span>{node.note.join(' ')}</span>
        </li>
      ))}
    </ol>
    <p className="pl-tall__foot">Live pages read the capture as it runs.</p>
  </div>
);

export const Pipeline = () => {
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.2);
  const reduced = useReducedMotion();
  return (
    <div ref={viewRef}>
      <div ref={wrapRef} className="pl">
        {width === 0 ? null : width >= 1180 ? <WideDiagram width={width} moving={inView && !reduced} /> : <TallDiagram />}
      </div>
    </div>
  );
};
