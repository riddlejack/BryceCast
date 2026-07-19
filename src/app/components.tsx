import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Database, Info, X } from 'lucide-react';

/* ---------- status chips (dot + label always; never color alone) ---------- */

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const toneDot: Record<Tone, string> = {
  good: 'var(--status-good-dot)',
  warn: 'var(--status-warn-dot)',
  bad: 'var(--status-bad-dot)',
  neutral: 'var(--ink-muted)'
};

export const StatusChip = ({ tone, label, live }: { tone: Tone; label: string; live?: boolean }) => (
  <span className={`chip chip--${tone}`}>
    {live ? (
      <span className="live-dot" aria-hidden />
    ) : (
      <span
        aria-hidden
        style={{ width: 7, height: 7, borderRadius: '50%', background: toneDot[tone], flex: 'none' }}
      />
    )}
    {label}
  </span>
);

/** A compact, layout-stable value swap for live numerals. The outgoing value
 * moves 8px and fades; reduced-motion collapses this to an instant update. */
export const TickerValue = ({ value, valueKey, className = '' }: { value: ReactNode; valueKey: string | number; className?: string }) => {
  const current = useRef({ key: valueKey, value });
  const [departing, setDeparting] = useState<ReactNode | null>(null);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (current.current.key === valueKey) {
      current.current.value = value;
      return;
    }
    setDeparting(current.current.value);
    current.current = { key: valueKey, value };
    setAnimating(true);
    const timer = window.setTimeout(() => {
      setAnimating(false);
      setDeparting(null);
    }, 170);
    return () => window.clearTimeout(timer);
  }, [value, valueKey]);

  return (
    <span className={`ticker-value${animating ? ' ticker-value--animating' : ''}${className ? ` ${className}` : ''}`}>
      {departing !== null ? <span className="ticker-value__old" aria-hidden>{departing}</span> : null}
      <span className="ticker-value__new">{value}</span>
    </span>
  );
};

/** Family-readable translations of product readiness states. */
export const readinessCopy: Record<string, { tone: Tone; label: string; detail: string }> = {
  ready: { tone: 'good', label: 'Live', detail: 'Race Control timing is live for Bryce’s session.' },
  degraded: { tone: 'warn', label: 'Live · partial', detail: 'Live timing is good; some extras are catching up.' },
  pre_session: { tone: 'neutral', label: 'Pre-session', detail: 'The session hasn’t gone green yet.' },
  wrong_series: { tone: 'warn', label: 'Other series on track', detail: 'Race Control is showing a different series right now — Bryce’s session hasn’t started.' },
  stale: { tone: 'warn', label: 'Paused', detail: 'Live timing stopped updating; showing the last good data.' },
  blocked: { tone: 'bad', label: 'No data', detail: 'Race data isn’t reachable right now.' }
};

export const TrustBanner = ({ state, reason }: { state: string; reason?: string }) => {
  const copy = readinessCopy[state] ?? { tone: 'neutral' as Tone, label: state, detail: reason ?? '' };
  const toneClass = copy.tone === 'good' ? 'trust--good' : copy.tone === 'bad' ? 'trust--bad' : 'trust--warn';
  return (
    <div className={`trust ${toneClass}`} role="status">
      {state === 'ready' || state === 'degraded' ? <span className="live-dot" aria-hidden /> : <span className="trust__dot" aria-hidden />}
      <strong>{copy.label}</strong>
      <span className="trust__detail">{copy.detail}</span>
    </div>
  );
};

/* ---------- stat tiles ---------- */

export const Stat = ({
  label,
  value,
  unit,
  delta,
  hero,
  note
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: { text: string; direction: 'up' | 'down' | 'flat' } | null;
  hero?: boolean;
  note?: ReactNode;
}) => (
  <div className="stat">
    <span className="caption">{label}</span>
    <span className={`stat__value${hero ? ' stat__value--hero' : ''}`}>
      {value}
      {unit ? <span className="stat__unit">{unit}</span> : null}
    </span>
    {delta ? <span className={`stat__delta ${delta.direction === 'up' ? 'stat__delta--up' : delta.direction === 'down' ? 'stat__delta--down' : 'stat__delta--flat'}`}>{delta.text}</span> : null}
    {note ? <span className="stat__note">{note}</span> : null}
  </div>
);

/* ---------- cards ---------- */

export const Card = ({
  title,
  action,
  children,
  flush,
  className
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) => (
  <section className={`card${flush ? ' card--flush' : ''}${className ? ` ${className}` : ''}`}>
    {title ? (
      <header className="card__header" style={flush ? { padding: '16px 18px 0' } : undefined}>
        <h2 className="card__title">{title}</h2>
        {action}
      </header>
    ) : null}
    {children}
  </section>
);

/* ---------- hero panel: flagship moments with atmosphere ---------- */

export const HeroPanel = ({
  tint,
  children,
  className,
  style
}: {
  tint?: 'bryce' | 'live';
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) => (
  <section
    className={`panel panel--hero${tint ? ` panel--hero--${tint}` : ''}${className ? ` ${className}` : ''}`}
    style={style}
  >
    {children}
  </section>
);

/* ---------- screen header ---------- */

export const ScreenHead = ({ kicker, title, sub }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode }) => (
  <header className="screen-head">
    {kicker ? <span className="kicker">{kicker}</span> : null}
    <h1 className="screen-head__title">{title}</h1>
    {sub ? <p className="screen-head__sub">{sub}</p> : null}
  </header>
);

/* ---------- number plate ---------- */

export const Plate = ({ size = 'nav' }: { size?: 'nav' | 'hero' | 'row' }) => (
  <span className={`plate plate--${size}`} aria-hidden>
    <span>9</span>
  </span>
);

/* ---------- countdown (ticks every 30s; days/hours/minutes) ---------- */

const countdownParts = (target: Date): Array<{ num: number; label: string }> | null => {
  const remaining = target.getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const minutes = Math.floor(remaining / 60_000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes - days * 60 * 24) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return [
      { num: days, label: days === 1 ? 'day' : 'days' },
      { num: hours, label: hours === 1 ? 'hour' : 'hours' }
    ];
  }
  return [
    { num: hours, label: hours === 1 ? 'hour' : 'hours' },
    { num: mins, label: 'min' }
  ];
};

export const Countdown = ({ to }: { to: string }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const target = new Date(to);
  if (Number.isNaN(target.getTime())) return null;
  const parts = countdownParts(target);
  if (!parts) return null;
  return (
    <div className="countdown" role="timer" aria-label="Time to green flag">
      {parts.map((part) => (
        <div key={part.label} className="countdown__cell">
          <span className="countdown__num">{part.num}</span>
          <span className="countdown__label">{part.label}</span>
        </div>
      ))}
    </div>
  );
};

/* ---------- ghost expand/collapse button ---------- */

export const GhostButton = ({
  expanded,
  onClick,
  children
}: {
  expanded?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button type="button" className="btn-ghost" onClick={onClick}>
    {expanded === undefined ? null : expanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
    {children}
  </button>
);

/* ---------- unavailable state ---------- */

export const Unavailable = ({ children }: { children: ReactNode }) => (
  <div className="unavailable">
    <Info size={15} aria-hidden />
    <span>{children}</span>
  </div>
);

/* ---------- the car: No. 9 side profile, black with red trim ---------- */

/** Bryce's 2026 machine as a quiet mark — black body, red trim, white 9,
 *  matching the Jaguar Land Rover Chesterfield CGR livery language. */
export const CarMark = ({ height = 18 }: { height?: number }) => (
  <svg
    width={height * (100 / 24)}
    height={height}
    viewBox="0 0 100 24"
    role="img"
    aria-label="Bryce Aron's No. 9 car"
    style={{ flex: 'none' }}
  >
    {/* rear wing */}
    <rect x={5} y={5} width={12} height={2.4} rx={1.2} fill="var(--ink-primary)" />
    <rect x={15.6} y={3.8} width={1.8} height={8.4} rx={0.9} fill="var(--ink-primary)" />
    <rect x={10.4} y={7.4} width={1.8} height={4.4} fill="var(--ink-primary)" />
    {/* engine cover with red trim line */}
    <rect x={22} y={8.2} width={14} height={3} rx={1.5} fill="var(--ink-primary)" />
    <rect x={22} y={9.1} width={14} height={1} rx={0.5} fill="#c8102e" />
    {/* halo over the cockpit */}
    <path d="M39 11 Q 45 4.6 51 11" fill="none" stroke="var(--ink-primary)" strokeWidth={1.8} />
    {/* sidepod + floor */}
    <rect x={28} y={11} width={30} height={5.2} rx={2.4} fill="var(--ink-primary)" />
    <rect x={6} y={14.6} width={84} height={2.2} rx={1.1} fill="var(--ink-primary)" />
    {/* nose, tipped in red */}
    <path d="M56 11 L92 13.6 Q94 14.4 92 15.4 L56 16.2 Z" fill="var(--ink-primary)" />
    <path d="M85 13.1 L92 13.6 Q94 14.4 92 15.4 L85 15.8 Z" fill="#c8102e" />
    {/* the 9, in white on the sidepod */}
    <text x={43} y={15.4} textAnchor="middle" fontSize={5.4} fontWeight={700} fill="#ffffff" fontFamily="-apple-system, system-ui, sans-serif">
      9
    </text>
    {/* wheels last, so they sit over the floor line */}
    <circle cx={22} cy={17} r={5.4} fill="var(--ink-primary)" />
    <circle cx={22} cy={17} r={1.9} fill="var(--surface-0)" opacity={0.92} />
    <circle cx={74} cy={17.4} r={4.9} fill="var(--ink-primary)" />
    <circle cx={74} cy={17.4} r={1.7} fill="var(--surface-0)" opacity={0.92} />
  </svg>
);

/* ---------- scroll-in reveal: one soft settle per element, once ---------- */

export const Reveal = ({ children, delay = 0 }: { children: ReactNode; delay?: number }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -36px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`reveal${shown ? ' reveal--in' : ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
};

/* ---------- source drawer ---------- */

export interface SourceEntry {
  label: string;
  path?: string;
  note?: string;
}

export const SourceDrawer = ({
  title,
  entries,
  caveats,
  onClose
}: {
  title: string;
  entries: SourceEntry[];
  caveats?: string[];
  onClose: () => void;
}) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden />
      <aside className="drawer" role="dialog" aria-label={`Sources for ${title}`}>
        <div className="row row--between" style={{ marginBottom: 14 }}>
          <div className="row">
            <Database size={16} aria-hidden style={{ color: 'var(--ink-secondary)' }} />
            <h3 className="display" style={{ margin: 0, fontSize: 16 }}>
              Where this comes from
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sources"
            style={{ background: 'none', border: 'none', color: 'var(--ink-secondary)', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ color: 'var(--ink-secondary)', fontSize: 13, marginTop: 0 }}>{title}</p>
        <div className="stack" style={{ gap: 10 }}>
          {entries.map((entry, index) => (
            <div key={index} style={{ borderTop: '1px solid var(--divider)', paddingTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{entry.label}</div>
              {entry.path ? (
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'var(--ink-muted)', wordBreak: 'break-all' }}>{entry.path}</div>
              ) : null}
              {entry.note ? <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginTop: 2 }}>{entry.note}</div> : null}
            </div>
          ))}
        </div>
        {caveats && caveats.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <span className="caption">Honest limits</span>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--ink-secondary)', fontSize: 12.5, display: 'grid', gap: 6 }}>
              {caveats.map((caveat, index) => (
                <li key={index}>{caveat}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>
    </>
  );
};

export const SourcePill = ({ title, entries, caveats }: { title: string; entries: SourceEntry[]; caveats?: string[] }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="source-pill" onClick={() => setOpen(true)}>
        <Database size={11} aria-hidden />
        source
      </button>
      {open ? <SourceDrawer title={title} entries={entries} caveats={caveats} onClose={() => setOpen(false)} /> : null}
    </>
  );
};
