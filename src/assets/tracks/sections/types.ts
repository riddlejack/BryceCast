/** Curated oval section anchors (Brief E / Brief H — Section Intelligence).
 *
 *  Each anchor maps ONE official timing-loop section family onto a fractional
 *  range of the venue outline's `mainPath` (the same [0,1] arc-length
 *  parameterisation the app samples for nearest-point hover and draws with
 *  stroke-dasharray). Curated by hand from the corner-arc geometry in the
 *  outline asset and VERIFIED VISUALLY against the venue debug overlay
 *  (scripts/build-section-debug.mjs → reports/brief-h/*-section-debug.html) —
 *  never trusted from math alone.
 *
 *  IMPORTANT (adapter-contract law, docs/PHASE3_EXECUTION_CHARTER §Addendum 3):
 *  these fractional anchors are a v1 curation. When measured timing-loop
 *  locations arrive through the data lake's 39 timing-map archives (Addendum 2),
 *  they SUPERSEDE these curated spans — the UI consumes the resolved section
 *  geometry the same way, so that swap is data-only, no UI rework.
 */

export interface TrackSectionAnchor {
  /** Stable id for the geometry↔data join and React keys. */
  familyId: string;
  /** EXACT official section-family string from the section packs — the join
   *  key against `SectionObservation.sectionName`. Never invented. */
  sectionName: string;
  /** Humanized short label for the map, faithfully compressed from the official
   *  station code / family name (never an invented corner name). When a section
   *  has only a station code, the code IS the label. */
  label: string;
  /** Fractional start along mainPath, [0,1). */
  startT: number;
  /** Fractional end along mainPath, [0,1). If endT < startT the span wraps
   *  through t=0 (crosses the path's M point). */
  endT: number;
  /** MEASURED physical length of this timing section in miles — official section
   *  time × average speed (constant per family; from the section packs). Present
   *  on venues whose retraced outline arc-length is NOT proportional to real
   *  track distance (distorted ovals, road courses), where the drawn span's
   *  t-length would misreport coverage. `timedShareOf` sums these against the
   *  set's `lapLengthMi` so the coverage stat speaks real distance; absent on
   *  venues whose t-span length is already faithful, which fall back to t-share.
   *  On a concatenated-name family drawn at a fingerprinted sub-span, this is the
   *  FULL official family length (what the loops actually measure of the lap). */
  measuredLengthMi?: number;
  /** Render kind. Default (undefined) = 'measured', a real timing-loop section
   *  drawn as a solid coloured span. 'derived_remainder' = the untimed
   *  stretch(es), shaded from lap time minus the timed sections and drawn in a
   *  visually distinct (dotted) treatment that can never be mistaken for a
   *  measured loop. A derived anchor never earns a gold top-section dot. */
  kind?: 'measured' | 'derived_remainder';
  /** Extra disjoint spans a derived_remainder covers beyond [startT,endT]
   *  (e.g. Nashville's front AND back straights). All spans render the SAME
   *  combined value — the loops can't yet separate the two stretches, so the
   *  tooltip says "combined untimed stretches". True per-stretch separation
   *  arrives with the data lake's loop-crossing extraction, at which point each
   *  stretch becomes its own measured anchor and this field retires. */
  additionalSpans?: Array<{ startT: number; endT: number }>;
  /** The physical timing loops this span runs between, from the semantic
   *  layer's decoded loop inventory (measured lake anchors only). This is the
   *  join key for pass placement: a pass bracketed to `[startLoop → endLoop]`
   *  renders its quiet mark at this span. Absent on curated-PDF anchors. */
  startLoop?: string;
  endLoop?: string;
}

export interface TrackSectionAnchorSet {
  slug: string;
  venueName: string;
  drivingDirection: 'clockwise' | 'counterclockwise';
  /** Official lap length in miles used as the coverage denominator. Present only
   *  alongside per-section `measuredLengthMi` (the numerator basis must match the
   *  denominator's basis — e.g. the timing-map lap, not the outline draw length).
   *  When present, `timedShareOf` reports Σ(measuredLengthMi)/lapLengthMi. */
  lapLengthMi?: number;
  /** Curation confidence — the debug overlay is the acceptance gate. */
  confidence: 'anchored' | 'approximate';
  /** Human-readable curation note (shown in the report / source drawer later). */
  note: string;
  sections: TrackSectionAnchor[];
}
