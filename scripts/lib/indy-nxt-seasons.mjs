/**
 * Season discovery for the INDY NXT lane.
 *
 * The importer used to carry `const years = [2024, 2025, 2026]`. That list is a
 * yearly manual edit, and the failure mode is silent: a 2027 race would simply
 * never be imported, and the unattended post-race pipeline would report success
 * having done nothing. Seasons are now read from the same official
 * `SeasonDropDown` feed the importer already fetches for event/session
 * discovery, so a new season enters the import the moment the series publishes
 * it — and a season the feed has not published yet is absent, which is a clean
 * no-op rather than an error.
 */

/** Bryce's first INDY NXT season. The floor only — never an upper bound. Earlier
 *  INDY NXT / Indy Lights history is not Bryce's career and stays out of this
 *  lane (his pre-2024 seasons come from the other series importers). */
export const FIRST_INDY_NXT_SEASON = 2024;

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

/**
 * Every season the official drop-down lists at or after the floor, ascending.
 * Tolerates the feed's string years, duplicate rows, and junk rows.
 *
 * @param {unknown} seasonDropDown Parsed `SeasonDropDown?id=<series>` payload.
 * @param {{floor?: number}} [options]
 * @returns {number[]}
 */
export const discoverSeasons = (seasonDropDown, { floor = FIRST_INDY_NXT_SEASON } = {}) =>
  Array.from(
    new Set(
      asArray(seasonDropDown)
        .map((row) => Number(row?.Year))
        .filter((year) => Number.isInteger(year) && year >= floor)
    )
  ).sort((left, right) => left - right);

/** Regex matching canonical ids for the discovered seasons, e.g.
 *  `^event_indy_nxt_(?:2024|2025|2026)_`. Replaces hardcoded year alternations
 *  so an added season is covered without another manual edit. */
export const seasonIdPrefixPattern = (years, prefix) =>
  new RegExp(`^${prefix}(?:${years.map((year) => String(year)).join('|')})_`);
