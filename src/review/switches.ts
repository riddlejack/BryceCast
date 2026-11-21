/**
 * Review switches (Jack's switchboard, November 16, 2026): a change's other
 * versions, chosen by an address parameter (`?icons=line`) or, on the review
 * host only, kept from the switchboard across pages (localStorage), so a
 * switch he flips stays flipped as he clicks around the site.
 *
 * The address always wins. On brycecast.com only the address counts, exactly
 * as before; nothing is remembered.
 */

const host = typeof window === 'undefined' ? '' : window.location.hostname;

/** The review copy: Jack's :4830 and any other local preview. Never production. */
export const REVIEW_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.local)$/.test(host);

const KEY = (name: string) => `bc-switch-${name}`;

/** The choice in force for a switch: the address's, else the remembered one, else null (the default). */
export const switchValue = (name: string, search?: URLSearchParams): string | null => {
  if (typeof window === 'undefined') return null;
  const params = search ?? new URLSearchParams(window.location.search);
  if (params.has(name)) return params.get(name);
  if (!REVIEW_HOST) return null;
  try {
    const kept = window.localStorage.getItem(KEY(name));
    // a remembered choice that has since become the default is forgotten, so the board doesn't call it "away"
    if (kept !== null && NOW_DEFAULT[name] === kept) {
      window.localStorage.removeItem(KEY(name));
      return null;
    }
    return kept;
  } catch {
    return null;
  }
};

/** Choices Jack picked that became the default (the bare address now means them). */
const NOW_DEFAULT: Record<string, string> = { field: 'all' };

/** Remember a choice on the review host (null forgets it, back to the default). */
export const rememberSwitch = (name: string, value: string | null): void => {
  if (!REVIEW_HOST) return;
  try {
    if (value === null) window.localStorage.removeItem(KEY(name));
    else window.localStorage.setItem(KEY(name), value);
  } catch {
    /* private window: the switch lasts for this address only */
  }
};

/** Switches whose look lives in CSS: written to <html data-…> once at start (a change reloads the page). */
export const CSS_SWITCHES = ['yoy', 'palette'] as const;

export const applyCssSwitches = (): void => {
  if (typeof document === 'undefined') return;
  for (const name of CSS_SWITCHES) {
    const value = switchValue(name);
    if (value === null || value === '') document.documentElement.removeAttribute(`data-${name}`);
    else document.documentElement.setAttribute(`data-${name}`, value);
  }
};
