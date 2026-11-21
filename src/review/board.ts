// Jack's review switchboard for BryceCast (November 16, 2026, his words: "a little toggle in the bottom lefthand corner
// ... navigate to the section where there's a new change and see it, plus toggle on/off any given change. same
// navigation/toggle we have on the personal site"). A port of the personal site's site/src/review/board.ts, without
// the islands. Review copy only: main.tsx loads this chunk where switches.ts REVIEW_HOST is on, never on brycecast.com.
// A corner button (and the ` key) opens a panel with two tabs:
//   Changes  every page (registry.ts PAGES); a green dot where a change waits that he hasn't ticked as seen; a click
//            goes there (with the change's own address, e.g. the replay at the right lap) and scrolls to it.
//   Toggle   this page's switches: a click on a choice remembers it (switches.ts, so it holds across pages) and
//            reloads into the same place, the panel left open.
// Hidden under automation (navigator.webdriver) unless ?board=1, so no headless check shows it; ?board=0 hides it.
import { ENTRIES, PAGES, entriesFor, isNew, isWide, onPage, pageKey, pagesOf, scopeOf, type Entry, type SitePage } from './registry';
import { rememberSwitch, switchValue } from './switches';

const SEEN_KEY = 'bc-review-seen';
const OPEN_KEY = 'bc-board-open';
const TAB_KEY = 'bc-board-tab';
const FOLD_KEY = 'bc-board-older';
const RESTORE_KEY = 'bc-board-restore';
/** a page with more new entries than this lists them as one line each, opened one at a time */
const SHORT = 4;
const GREEN = '#3f9a5c';

type Tab = 'changes' | 'toggle';
interface Restore {
  path: string;
  y?: number;
  entry?: string;
  go?: boolean;
  t: number;
}

const store = {
  get(s: Storage, k: string): string | null {
    try {
      return s.getItem(k);
    } catch {
      return null;
    }
  },
  set(s: Storage, k: string, v: string | null): void {
    try {
      if (v === null) s.removeItem(k);
      else s.setItem(k, v);
    } catch {
      /* private window: the panel forgets */
    }
  }
};

const seenSet = (): Set<string> => {
  try {
    return new Set(JSON.parse(store.get(localStorage, SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};
const seenId = (e: Entry): string => `${e.id}@${e.added}`;
/** a change he hasn't looked at yet: new and not ticked as seen */
const waiting = (e: Entry, seen: Set<string>): boolean => isNew(e) && !seen.has(seenId(e));

function scrollToAnchor(anchor: string, smooth: boolean): boolean {
  let el: Element | null = null;
  try {
    el = anchor.startsWith('#') ? document.getElementById(decodeURIComponent(anchor.slice(1))) : document.querySelector(anchor);
  } catch {
    el = null;
  }
  if (!el) return false;
  el.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'center' } as ScrollIntoViewOptions);
  return true;
}

/** Scroll back to y once the page is tall enough (its data loads after the first paint), until it has stayed there a
 *  moment or ten seconds have gone; stops the moment he scrolls himself. */
function restoreScroll(y: number): void {
  let mine = true;
  const stop = (): void => {
    mine = false;
  };
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) addEventListener(ev, stop, { once: true, passive: true, capture: true });
  const t0 = performance.now();
  let heldSince = -1;
  const tick = (): void => {
    if (!mine) return;
    const now = performance.now();
    const el = document.scrollingElement ?? document.documentElement;
    const reach = el.scrollHeight - innerHeight;
    if (Math.abs(scrollY - y) <= 2) {
      if (heldSince < 0) heldSince = now;
      if (now - heldSince > 1200) return;
    } else {
      heldSince = -1;
      if (reach >= y - 2 || now - t0 > 6000) scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
    }
    if (now - t0 < 10_000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap { position: fixed; left: 16px; bottom: 16px; z-index: 2147483000; font: 400 13px/20px var(--font-ui, ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', sans-serif);
  color: #1e1c1a; -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; text-align: left; }
button:focus-visible { outline: 2px solid #a36200; outline-offset: 2px; }
.knob { position: relative; width: 32px; height: 32px; border-radius: 999px; background: #fdfcfa; border: 1px solid #dfdad6;
  display: grid; place-items: center; color: #6b6560; opacity: .82; transition: opacity 150ms, background-color 150ms; }
.knob:hover { opacity: 1; }
.knob.set { border: 2px solid #a36200; color: #a36200; opacity: 1; }
.knob svg { width: 16px; height: 16px; }
.knob .dot { position: absolute; top: -2px; right: -2px; width: 9px; height: 9px; border-radius: 999px; background: ${GREEN}; border: 1.5px solid #fdfcfa; }
.panel { position: absolute; left: 0; bottom: 44px; width: 384px; max-width: calc(100vw - 32px); max-height: min(72vh, 680px); display: flex; flex-direction: column;
  background: #fdfcfa; border: 1px solid #dfdad6; border-radius: 8px; overflow: hidden; box-shadow: 0 6px 24px rgba(30, 28, 26, .08); }
.panel[hidden] { display: none; }
.head { display: flex; align-items: baseline; gap: 20px; padding: 10px 14px 0; border-bottom: 1px solid #e5e1dd; }
.tab { padding: 4px 0 9px; color: #7d7772; border-bottom: 1px solid transparent; margin-bottom: -1px; }
.tab[aria-selected="true"] { color: #1e1c1a; border-bottom-color: #a36200; }
.tab .n { font: 400 12px/16px ui-monospace, 'SF Mono', Menlo, monospace; color: #7d7772; margin-left: 4px; }
.close { margin-left: auto; color: #7d7772; padding: 2px 4px; font-size: 16px; line-height: 16px; }
.body { overflow: auto; padding: 6px 0 10px; overscroll-behavior: contain; }
.group { padding: 10px 14px 2px; font: 400 12px/16px ui-monospace, 'SF Mono', Menlo, monospace; color: #86807b; letter-spacing: .04em; text-transform: uppercase; }
.row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 14px; border-left: 2px solid transparent; }
.row:hover { background: #f5f3f0; }
.row.here { border-left-color: #a36200; }
.row .name { flex: 1; }
.row .count { font: 400 12px/16px ui-monospace, 'SF Mono', Menlo, monospace; color: #7d7772; }
.row .g { width: 7px; height: 7px; border-radius: 999px; background: ${GREEN}; flex: none; }
.row .g.off { background: transparent; }
.more { color: #7d7772; padding: 2px 8px; margin: -2px -8px -2px 0; font-size: 14px; }
.more:hover { color: #1e1c1a; }
.sub { display: block; width: 100%; padding: 3px 14px 3px 31px; color: #6b6560; font-size: 12px; line-height: 17px; }
.sub:hover { background: #f5f3f0; color: #1e1c1a; }
.page { padding: 10px 14px 4px; display: flex; align-items: baseline; gap: 8px; }
.page .t { font-size: 15px; line-height: 22px; font-weight: 600; }
.page .m { font: 400 12px/16px ui-monospace, 'SF Mono', Menlo, monospace; color: #7d7772; }
.entry { padding: 10px 14px 12px; border-top: 1px solid #ebe7e4; }
.entry.hi { background: #faf8f6; }
.entry .title { display: flex; align-items: baseline; gap: 8px; }
.entry .title b { font-weight: 500; flex: 1; }
.new { width: 7px; height: 7px; border-radius: 999px; background: ${GREEN}; flex: none; transform: translateY(-1px); }
.look { color: #6b6560; font-size: 13px; line-height: 18px; margin: 3px 0 8px; }
.choices { display: grid; gap: 2px; }
.choice { display: flex; gap: 8px; align-items: flex-start; width: 100%; padding: 5px 8px; border-radius: 4px; border: 1px solid #e5e1dd; line-height: 18px; }
.choice:hover { background: #f5f3f0; }
.choice .r { flex: none; width: 12px; height: 12px; margin-top: 3px; border-radius: 999px; border: 1px solid #86807b; }
.choice[aria-pressed="true"] { background: #f5f3f0; border-color: #ccc6c1; }
.choice[aria-pressed="true"] .r { border: 4px solid #a36200; }
.choice .v { font: 400 12px/18px ui-monospace, 'SF Mono', Menlo, monospace; color: #7d7772; margin-left: auto; padding-left: 8px; white-space: nowrap; }
.noswitch { color: #7d7772; font-size: 12px; line-height: 17px; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font: 400 12px/16px ui-monospace, 'SF Mono', Menlo, monospace; color: #7d7772; }
.meta button { color: #a36200; }
.meta button:hover { text-decoration: underline; text-underline-offset: .22em; }
.meta label { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; margin-left: auto; }
.meta input { margin: 0; accent-color: ${GREEN}; }
.ruling { color: #7d7772; font-size: 12px; line-height: 17px; margin-top: 6px; }
.fold { display: flex; width: 100%; gap: 6px; padding: 10px 14px 8px; color: #7d7772; font-size: 12px; border-top: 1px solid #ebe7e4; }
.fold:hover { color: #1e1c1a; }
.tag { font: 400 12px/16px ui-monospace, 'SF Mono', Menlo, monospace; color: #86807b; }
.entry.old .title b { color: #6b6560; }
.erow { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 7px 14px; border-top: 1px solid #ebe7e4; }
.erow:hover { background: #f5f3f0; }
.erow b { font-weight: 500; flex: 1; min-width: 0; }
.erow.old b { color: #6b6560; }
.erow .now { font: 400 12px/16px ui-monospace, 'SF Mono', Menlo, monospace; color: #a36200; white-space: nowrap; max-width: 40%; overflow: hidden; text-overflow: ellipsis; }
.entry .shut { color: #86807b; padding: 0 2px; }
.lead { padding: 2px 14px 6px; color: #7d7772; font-size: 12px; line-height: 17px; }
.lead button { color: #a36200; }
.lead button:hover { text-decoration: underline; text-underline-offset: .22em; }
.row .name.quiet { color: #7d7772; }
.empty { padding: 14px; color: #7d7772; }
.status { padding: 8px 14px; border-top: 1px solid #e5e1dd; font: 400 12px/16px ui-monospace, 'SF Mono', Menlo, monospace; color: #7d7772; }
.status:empty { display: none; }
@media (max-width: 480px) { .wrap { left: 12px; bottom: 12px; } }
@media (max-width: 899px) { .wrap { bottom: calc(76px + env(safe-area-inset-bottom)); } }
@media (prefers-reduced-motion: reduce) { .knob { transition: none; } }
`;

const ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="3" width="13" height="4" rx="2"/><circle cx="10.5" cy="5" r=".9" fill="currentColor"/><rect x="1.5" y="9" width="13" height="4" rx="2"/><circle cx="5.5" cy="11" r=".9" fill="currentColor"/></svg>`;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const cssEscape = (s: string): string => (window.CSS?.escape ? window.CSS.escape(s) : s.replace(/"/g, '\\"'));

/** The choice in force: the address's, else the remembered one (switches.ts), else the default (the first). */
const currentValue = (e: Entry): string | null => (e.switch ? (switchValue(e.switch) ?? e.values?.[0]?.value ?? null) : null);
const isDefault = (e: Entry): boolean => !e.switch || currentValue(e) === (e.values?.[0]?.value ?? null);
/** Switch names set away from their default, counted once each. */
const setAway = (): string[] => [...new Set(ENTRIES.filter((e) => e.switch && !isDefault(e)).map((e) => e.switch!))];

export function start(): void {
  const q0 = new URLSearchParams(location.search);
  if (q0.get('board') === '0') return;
  // under automation only when asked, and then for the rest of the tab's visit
  if (q0.get('board') === '1') store.set(sessionStorage, 'bc-board-show', '1');
  if (navigator.webdriver && store.get(sessionStorage, 'bc-board-show') !== '1') return;
  if (document.getElementById('bc-review-board')) return;

  const host = document.createElement('div');
  host.id = 'bc-review-board';
  host.setAttribute('data-review-board', '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style><div class="wrap"><div class="panel" role="dialog" aria-label="Review switchboard" hidden></div><button class="knob" type="button" aria-label="Review switchboard (\`)" aria-expanded="false">${ICON}<span class="dot" hidden></span></button></div>`;
  const panel = root.querySelector<HTMLElement>('.panel')!;
  const knob = root.querySelector<HTMLButtonElement>('.knob')!;
  const dot = root.querySelector<HTMLElement>('.dot')!;
  // his clicks, wheel and keys in the panel are the panel's: none reaches the 3D track's camera or the replay's keys
  for (const ev of ['pointerdown', 'pointerup', 'click', 'wheel', 'keydown', 'keyup', 'touchstart', 'touchmove', 'dblclick', 'contextmenu'] as const) {
    host.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev === 'wheel' || ev.startsWith('touch') });
  }

  let open = store.get(sessionStorage, OPEN_KEY) === '1';
  let tab: Tab = store.get(sessionStorage, TAB_KEY) === 'toggle' ? 'toggle' : 'changes';
  const expanded = new Set<string>();
  let older = store.get(sessionStorage, FOLD_KEY) === '1';
  let opened: string | null = null;
  let highlight: string | null = null;
  let status = '';
  let lastKey: string | null = null;

  // after a reload the panel made, or a "go there" from another page
  let restore: Restore | null = null;
  try {
    restore = JSON.parse(store.get(sessionStorage, RESTORE_KEY) ?? 'null') as Restore | null;
  } catch {
    restore = null;
  }
  store.set(sessionStorage, RESTORE_KEY, null);
  if (restore && (restore.path !== location.pathname || Date.now() - restore.t > 60_000)) restore = null;

  const key = (): string | null => pageKey(location.pathname);
  const pageOf = (k: string | null): SitePage | undefined => PAGES.find((p) => p.key === k);
  /** where an entry is seen: this page when it is one of its pages, else its first */
  const homeOf = (e: Entry): SitePage | undefined => (onPage(e, key()) ? pageOf(key()) : pagesOf(e)[0]);

  const save = (): void => {
    store.set(sessionStorage, OPEN_KEY, open ? '1' : null);
    store.set(sessionStorage, TAB_KEY, tab);
  };

  const setOpen = (v: boolean): void => {
    open = v;
    panel.hidden = !open;
    knob.setAttribute('aria-expanded', String(open));
    save();
    render();
  };

  /** The address of a page with a change's own parameters (a replay, a venue) and place. */
  function hrefFor(page: SitePage, e?: Entry): string {
    const u = new URL(page.href, location.origin);
    if (e?.with) for (const [k, v] of Object.entries(e.with)) u.searchParams.set(k, v);
    if (e?.anchor?.startsWith('#')) u.hash = e.anchor;
    return u.pathname + u.search + u.hash;
  }

  /** True when the address already carries everything the change needs. */
  const hasWith = (e: Entry): boolean => {
    const q = new URLSearchParams(location.search);
    return !e.with || Object.entries(e.with).every(([k, v]) => k === 'lap' || q.get(k) === v);
  };

  function go(page: SitePage, e?: Entry): void {
    if (e && page.key === key() && hasWith(e)) {
      highlight = e.id;
      tab = 'toggle';
      save();
      if (e.anchor) scrollToAnchor(e.anchor, true);
      render();
      return;
    }
    store.set(sessionStorage, RESTORE_KEY, JSON.stringify({ path: new URL(page.href, location.origin).pathname, entry: e?.id, go: true, t: Date.now() } satisfies Restore));
    tab = e || entriesFor(page.key).length ? 'toggle' : tab;
    open = true;
    save();
    location.href = hrefFor(page, e);
  }

  /** Reload into the same place: the address as it stands (a replay keeps its lap), the scroll kept, the panel open. */
  function reloadHere(entry?: string): void {
    store.set(sessionStorage, RESTORE_KEY, JSON.stringify({ path: location.pathname, y: scrollY, entry, t: Date.now() } satisfies Restore));
    open = true;
    tab = 'toggle';
    save();
    status = 'Reloading into this view…';
    render();
    location.reload();
  }

  /** Apply a choice: remembered across pages, put in the address, and the page reloaded into the same place. */
  function apply(e: Entry, value: string | null): void {
    if (!e.switch) return;
    const isDefaultChoice = value === (e.values?.[0]?.value ?? null);
    rememberSwitch(e.switch, isDefaultChoice ? null : value);
    const u = new URL(location.href);
    if (isDefaultChoice) u.searchParams.delete(e.switch);
    else u.searchParams.set(e.switch, value ?? '');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    reloadHere(e.id);
  }

  function resetAll(): void {
    const u = new URL(location.href);
    for (const name of setAway()) {
      rememberSwitch(name, null);
      u.searchParams.delete(name);
    }
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    reloadHere();
  }

  function markSeen(e: Entry, v: boolean): void {
    const s = seenSet();
    if (v) s.add(seenId(e));
    else s.delete(seenId(e));
    store.set(localStorage, SEEN_KEY, JSON.stringify([...s]));
    render();
  }

  function awayLine(): string {
    const away = setAway();
    if (!away.length) return '';
    return `<div class="lead">${away.length} switch${away.length === 1 ? '' : 'es'} away from the new default, on every page: ${away.map((n) => `${esc(n)}=${esc(switchValue(n) ?? '')}`).join(', ')}. <button data-reset>Reset all</button></div>`;
  }

  function renderChanges(seen: Set<string>): string {
    const here = key();
    const all = ENTRIES.filter((e) => waiting(e, seen));
    let html = `<div class="lead">${all.length ? `${all.length} change${all.length === 1 ? '' : 's'} you haven’t seen. A green dot marks a page with one: ▸ lists them, a click takes you there.` : 'Nothing new: every change is seen or ruled on.'}</div>${awayLine()}`;
    let group = '';
    for (const p of PAGES) {
      if (p.group !== group) {
        group = p.group;
        html += `<div class="group">${group}</div>`;
      }
      const wait = all.filter((e) => !isWide(e) && onPage(e, p.key));
      html += `<div><div class="row${p.key === here ? ' here' : ''}"><span class="g${wait.length ? '' : ' off'}"></span><button class="name${wait.length ? '' : ' quiet'}" data-go="${esc(p.key)}">${esc(p.name)}</button><span class="count">${wait.length ? `${wait.length} new` : ''}</span>${wait.length ? `<button class="more" data-more="${esc(p.key)}" aria-label="List ${esc(p.name)}'s changes" aria-expanded="${expanded.has(p.key)}">${expanded.has(p.key) ? '▾' : '▸'}</button>` : ''}</div>`;
      if (expanded.has(p.key)) for (const e of wait) html += `<button class="sub" data-go="${esc(p.key)}" data-entry="${esc(e.id)}">${esc(e.title)}</button>`;
      html += `</div>`;
    }
    const wide = all.filter((e) => isWide(e));
    if (wide.length) html += `<div class="group">On every page</div>` + wide.map((e) => `<button class="sub" data-there="${esc(e.id)}">${esc(e.title)} <span class="tag">${esc(scopeOf(e))}</span></button>`).join('');
    return html;
  }

  /** An entry as one line (its title and the choice in force); a click opens it. */
  function renderRow(e: Entry, seen: Set<string>): string {
    const now = !e.switch ? 'no switch' : isDefault(e) ? '' : `${e.switch}=${currentValue(e)}`;
    return `<button class="erow${isNew(e) ? '' : ' old'}" data-open="${esc(e.id)}" aria-expanded="false">${waiting(e, seen) ? '<span class="new" title="Not seen yet"></span>' : ''}<b>${esc(e.title)}</b><span class="now">${esc(now)}</span></button>`;
  }

  function renderEntry(e: Entry, seen: Set<string>, long = false): string {
    if (long && e.id !== opened && e.id !== highlight) return renderRow(e, seen);
    const cur = currentValue(e);
    const known = e.values?.some((c) => c.value === cur);
    let control = '';
    if (e.switch && e.values?.length) {
      control = `<div class="choices">${e.values
        .map(
          (c, i) =>
            `<button class="choice" data-entry="${esc(e.id)}" data-i="${i}" aria-pressed="${c.value === cur}"><span class="r"></span><span>${esc(c.label)}</span><span class="v">${c.value === null ? 'default' : `${esc(e.switch!)}=${esc(c.value)}`}</span></button>`
        )
        .join('')}${known ? '' : `<div class="noswitch">In force now: ${esc(e.switch)}=${esc(cur ?? '')}</div>`}</div>`;
    } else control = `<div class="noswitch">No switch: ${esc(e.noswitch ?? 'none built')}</div>`;
    const there = e.anchor || e.with ? `<button data-there="${esc(e.id)}">${e.with && !hasWith(e) ? 'Go there' : 'Scroll there'}</button>` : '';
    const tag = e.replacedBy ? `replaced by “${e.replacedBy}”` : e.knob ? 'takes a part away' : e.reviewed ? (e.ruling ? 'ruled' : 'seen before') : '';
    return `<div class="entry${highlight === e.id ? ' hi' : ''}${isNew(e) ? '' : ' old'}" data-id="${esc(e.id)}"><div class="title">${waiting(e, seen) ? '<span class="new" title="Not seen yet"></span>' : ''}<b>${esc(e.title)}</b>${tag ? `<span class="tag">${esc(tag)}</span>` : ''}${isWide(e) ? `<span class="tag">${esc(scopeOf(e))}</span>` : ''}${long ? `<button class="shut" data-open="${esc(e.id)}" aria-expanded="true" aria-label="Close">▴</button>` : ''}</div><div class="look">${esc(e.look)}</div>${control}${e.ruling ? `<div class="ruling">Ruled: ${esc(e.ruling)}</div>` : ''}<div class="meta">${there}<span>${esc(e.lane)} · ${esc(e.added.replace('T', ' '))}</span>${isNew(e) ? `<label><input type="checkbox" data-seen="${esc(e.id)}"${!waiting(e, seen) ? ' checked' : ''}/>Seen</label>` : ''}</div></div>`;
  }

  function renderToggle(seen: Set<string>): string {
    const k = key();
    const page = pageOf(k);
    if (!page) return `<div class="empty">This address isn't one of the site's pages in the list (review/registry.ts PAGES).</div>`;
    const list = entriesFor(k);
    const fresh = list.filter(isNew);
    const rest = list.filter((e) => !isNew(e));
    const wait = fresh.filter((e) => waiting(e, seen)).length;
    let html = `<div class="page"><span class="t">${esc(page.name)}</span><span class="m">${fresh.length ? `${fresh.length} change${fresh.length === 1 ? '' : 's'}${wait ? `, ${wait} not seen` : ''}` : 'nothing new'}</span></div>${awayLine()}`;
    const long = fresh.length > SHORT;
    const toggles = fresh.filter((e) => e.switch);
    const asks = fresh.filter((e) => !e.switch);
    html += toggles.map((e) => renderEntry(e, seen, long)).join('');
    if (asks.length) html += `<div class="group">New, nothing to switch</div>` + asks.map((e) => renderEntry(e, seen, long)).join('');
    if (!fresh.length) html += `<div class="empty">Nothing new on this page.${rest.length ? ' Its older switches are below.' : ''}</div>`;
    if (rest.length) {
      html += `<button class="fold" data-fold aria-expanded="${older}">${older ? '▾' : '▸'} Older switches, ruled and knobs (${rest.length})</button>`;
      if (older) html += rest.map((e) => renderEntry(e, seen, true)).join('');
    }
    return html;
  }

  function render(): void {
    const seen = seenSet();
    const k = key();
    lastKey = k;
    const hereWaiting = entriesFor(k).filter((e) => waiting(e, seen)).length;
    const allWaiting = ENTRIES.filter((e) => waiting(e, seen)).length;
    const away = setAway();
    dot.hidden = allWaiting === 0;
    knob.classList.toggle('set', away.length > 0);
    knob.title = `Review switchboard (\`): ${hereWaiting} new here, ${allWaiting} across the site${away.length ? `; set away from the default: ${away.join(', ')}` : ''}`;
    if (!open) return;
    const scrollKeep = panel.querySelector('.body')?.scrollTop ?? 0;
    panel.innerHTML = `<div class="head" role="tablist"><button class="tab" role="tab" data-tab="changes" aria-selected="${tab === 'changes'}">Changes<span class="n">${allWaiting}</span></button><button class="tab" role="tab" data-tab="toggle" aria-selected="${tab === 'toggle'}">Toggle<span class="n">${hereWaiting}</span></button><button class="close" aria-label="Close">×</button></div><div class="body">${tab === 'changes' ? renderChanges(seen) : renderToggle(seen)}</div><div class="status">${esc(status)}</div>`;
    const body = panel.querySelector<HTMLElement>('.body')!;
    body.scrollTop = scrollKeep;
    if (highlight && tab === 'toggle') {
      const el = body.querySelector<HTMLElement>(`[data-id="${cssEscape(highlight)}"]`);
      if (el && scrollKeep === 0) el.scrollIntoView({ block: 'nearest' });
    }
  }

  panel.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>('button, input');
    if (!t) return;
    if (t.classList.contains('close')) return setOpen(false);
    if (t.dataset.tab) {
      tab = t.dataset.tab as Tab;
      save();
      return render();
    }
    if (t.dataset.reset !== undefined) return resetAll();
    if (t.dataset.open) {
      const id = t.dataset.open;
      const was = opened === id || highlight === id;
      opened = was ? null : id;
      if (was && highlight === id) highlight = null;
      render();
      if (!was) panel.querySelector<HTMLElement>(`[data-id="${cssEscape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (t.dataset.fold !== undefined) {
      older = !older;
      store.set(sessionStorage, FOLD_KEY, older ? '1' : null);
      return render();
    }
    if (t.dataset.more) {
      const k = t.dataset.more;
      if (expanded.has(k)) expanded.delete(k);
      else expanded.add(k);
      return render();
    }
    if (t.dataset.go) {
      const page = pageOf(t.dataset.go);
      if (!page) return;
      const seen = seenSet();
      const list = ENTRIES.filter((e) => !isWide(e) && onPage(e, page.key) && waiting(e, seen));
      const e = t.dataset.entry ? ENTRIES.find((x) => x.id === t.dataset.entry) : list.length === 1 ? list[0] : undefined;
      return go(page, e);
    }
    if (t.dataset.there) {
      const e = ENTRIES.find((x) => x.id === t.dataset.there);
      const page = e ? homeOf(e) : undefined;
      if (e && page) go(page, e);
      return;
    }
    if (t.dataset.seen && t instanceof HTMLInputElement) {
      const e = ENTRIES.find((x) => x.id === t.dataset.seen);
      if (e) markSeen(e, t.checked);
      return;
    }
    if (t.classList.contains('choice')) {
      const e = ENTRIES.find((x) => x.id === t.dataset.entry);
      const c = e?.values?.[Number(t.dataset.i)];
      if (e && c && c.value !== currentValue(e)) apply(e, c.value);
    }
  });

  knob.addEventListener('click', () => setOpen(!open));
  addEventListener(
    'keydown',
    (ev) => {
      if (ev.key !== '`' && !(ev.key === 'Escape' && open)) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && ev.key === '`') return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      setOpen(ev.key === 'Escape' ? false : !open);
    },
    { capture: true }
  );

  (document.body ?? document.documentElement).appendChild(host);
  panel.hidden = !open;
  knob.setAttribute('aria-expanded', String(open));

  if (restore) {
    highlight = restore.entry ?? null;
    if (restore.y !== undefined) restoreScroll(restore.y);
    if (restore.go && restore.entry) {
      const e = ENTRIES.find((x) => x.id === restore!.entry);
      if (e?.anchor) {
        // found once the page has it (its data loads after the first paint), and put again a moment later in case the
        // page grew above it; never after he scrolls
        let mine = true;
        addEventListener('wheel', () => (mine = false), { once: true, passive: true });
        addEventListener('touchstart', () => (mine = false), { once: true, passive: true });
        const t0 = performance.now();
        const find = (): void => {
          if (!mine) return;
          if (!scrollToAnchor(e.anchor!, false) && performance.now() - t0 < 8000) setTimeout(find, 200);
        };
        setTimeout(find, 300);
        setTimeout(find, 1800);
      }
    }
  }
  render();
  // the site moves between pages without a reload: the panel follows the page in view
  setInterval(() => {
    if (key() !== lastKey) {
      highlight = null;
      status = '';
      render();
    }
  }, 600);
  // for the checks: choose(id, i) applies an entry's i-th choice as a click does
  const choose = (id: string, i: number): boolean => {
    const e = ENTRIES.find((x) => x.id === id);
    const c = e?.values?.[i];
    if (!e || !c) return false;
    apply(e, c.value);
    return true;
  };
  (window as unknown as { __reviewBoard?: unknown }).__reviewBoard = { open: () => setOpen(true), close: () => setOpen(false), key, entries: ENTRIES, render, choose };
}
