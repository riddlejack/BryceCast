/* ============================================================================
 * The site's own start-to-flag marks (career round 3, November 18, 2026).
 *
 * Jack on round 2's Qualifying to the flag: "The lines coming off of the graph
 * are too thick. The dots are different than the dots everywhere else on the
 * site." These are the marks the Restarts dive draws (deepDives/restarts.tsx,
 * which he called "very clean visually"), shared here so Qualifying and
 * Biggest climbs speak the same language:
 *   gained  a gold dot rimmed in amber
 *   held    a paper ring
 *   lost    an ink dot
 *   start   a paper ring (where he lined up)
 * and a 1.2 px run between two marks, amber at 60 % or ink at 42 %.
 * ==========================================================================*/

export type FlagKind = 'gained' | 'held' | 'lost';

export const FLAG_EASE = 'cubic-bezier(0.22, 0.9, 0.3, 1)';
export const RUN_W = 1.2;

export const flagFill = (kind: FlagKind) => (kind === 'gained' ? 'var(--bryce)' : kind === 'lost' ? 'var(--ink)' : 'var(--paper)');
export const flagStroke = (kind: FlagKind) => (kind === 'gained' ? 'var(--amber)' : kind === 'lost' ? 'var(--ink)' : 'var(--grey-ink2)');
export const runColour = (kind: FlagKind) => (kind === 'gained' ? 'var(--amber)' : 'var(--ink)');
export const runOpacity = (kind: FlagKind) => (kind === 'gained' ? 0.6 : 0.42);

/** One mark at (0, 0): place it with a transform on a parent. `lit` is the
 *  hovered mark: a size up and an ink rim, as the climb's dots do. */
export const FlagDot = ({ kind, r, lit = false }: { kind: FlagKind; r: number; lit?: boolean }) => (
  <circle
    r={lit ? r + 1.6 : r}
    fill={flagFill(kind)}
    stroke={lit ? 'var(--ink)' : flagStroke(kind)}
    strokeWidth={lit ? 1.5 : kind === 'held' ? 1.25 : 1}
    style={{ transition: 'r 140ms ease' }}
  />
);

/** Where he lined up: the paper ring. */
export const StartRing = ({ r }: { r: number }) => <circle r={r} fill="var(--paper)" stroke="var(--grey-ink2)" strokeWidth={1.1} />;

/** Word plus figure, as the Restarts lanes print them ("gained 15"). */
export const countColour = (kind: FlagKind) => (kind === 'gained' ? 'var(--link)' : 'var(--ink)');
