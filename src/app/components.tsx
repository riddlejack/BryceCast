import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, Database, Info, X } from 'lucide-react';

/* ---------- status chips (icon + label always; never color alone) ---------- */

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const toneIcon: Record<Tone, typeof CheckCircle2> = {
  good: CheckCircle2,
  warn: CircleAlert,
  bad: AlertTriangle,
  neutral: Info
};

export const StatusChip = ({ tone, label, live }: { tone: Tone; label: string; live?: boolean }) => {
  const Icon = toneIcon[tone];
  return (
    <span className={`chip chip--${tone}`}>
      {live ? <span className="live-dot" aria-hidden /> : <Icon size={12} aria-hidden />}
      {label}
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
  const Icon = toneIcon[copy.tone];
  return (
    <div className={`trust ${toneClass}`} role="status">
      {state === 'ready' || state === 'degraded' ? <span className="live-dot" aria-hidden /> : <Icon size={16} aria-hidden />}
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
  hero
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: { text: string; direction: 'up' | 'down' | 'flat' } | null;
  hero?: boolean;
}) => (
  <div className="stat">
    <span className="caption">{label}</span>
    <span className={`stat__value${hero ? ' stat__value--hero' : ''}`}>
      {value}
      {unit ? <span className="stat__unit">{unit}</span> : null}
    </span>
    {delta ? <span className={`stat__delta ${delta.direction === 'up' ? 'stat__delta--up' : 'stat__delta--down'}`}>{delta.text}</span> : null}
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

/* ---------- unavailable state ---------- */

export const Unavailable = ({ children }: { children: ReactNode }) => (
  <div className="unavailable">
    <Info size={15} aria-hidden />
    <span>{children}</span>
  </div>
);

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
            <div key={index} style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: 10 }}>
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
