// Semantic-layer slice 1: RaceTools log -> canonical timing tables.
//
// Source tier for every row emitted here is "racetools_capture" (a third-party
// capture of the sanctioning series' pit-lane timing feed) per the permissions
// ledger's labelling law. Nothing here is an official BryceCast fact; these are
// derived analytics over immutable raw captures.
//
// Verified field semantics (see analysis/semantic-layer/SCHEMA.md for the full
// record dictionary and the Wave-0 audit's tick-scale finding):
//   Records are '¦'-delimited. Numeric ids/times are hex.
//   $H heartbeat:  [5]=feed epoch (hex seconds; timezone UNVALIDATED).
//   $S section:    [4]=car, [5]=feedPos, [6]=sectionLabel,
//                  [7]=timeOfDay ticks (÷10000 => local seconds-of-day at the
//                       section END loop crossing),
//                  [8]=section duration ticks (÷10000 => seconds to traverse).
//   $L loop:       [4]=car, [6]=loopLabel  (raw per-loop crossing; no tick).
//   $T geometry:   [7]=N sections, then repeating (name, lengthUnits, start, end).
//   $U geometry:   loop cumulative distances around the lap (decimal units).
//   $O order:      [7]/[8]=classified position, [13]=laps, [14]=total time ticks,
//                  [26]=status (4=classified/finished, 0=not classified/DNF),
//                  [29]=car, [30]/[31]=first/last name, [35]=team.
//   $C competitor: [4]=position, [5]=car, [7]=laps (all hex).
//   $A / $M flag:  free text "Green|Yellow|Red|Checkered Flag at: HH:MM:SS.mmm [reason]".
//   $X session:    [3]=series, [4]=event, [5]=track.
//
// Tick scale (0.0001 s) and the local-clock reading of the time-of-day field are
// the Wave-0 audit's verified inference (99.4% of $S align to within 1 s of the
// adjacent one-second heartbeat). The encoded timezone is not validated, so the
// authoritative crossing clock here is LOCAL seconds-of-day; the heartbeat epoch
// is retained only as a coarse date anchor.

const DELIM = '¦';
const TICKS_PER_SECOND = 10_000;

export const SOURCE_TIER = 'racetools_capture';

function hex(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!/^[0-9a-fA-F]+$/.test(value)) return null;
  const n = Number.parseInt(value, 16);
  return Number.isFinite(n) ? n : null;
}

function todFromClockString(text) {
  const m = /(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(`0.${m[4]}`) : 0);
}

// Parse the section geometry ($T) into (name -> {startLoop, endLoop, lengthUnits})
// and identify the section whose END loop is the start/finish line (lap boundary).
function parseGeometry(lines) {
  const sections = new Map();
  const loopDistances = new Map();
  let lapLengthUnits = null;
  let venue = null;
  let trackType = null;

  for (const line of lines) {
    const f = line.split(DELIM);
    if (line.startsWith('$T') && f.length > 8) {
      venue = f[4] || venue;
      trackType = f[5] || trackType;
      // Section-count field is HEX (e.g. 1E=30, 1F=31), like all feed ids.
      const n = hex(f[7]) ?? Number(f[7]);
      let i = 8;
      for (let s = 0; s < n && i + 3 < f.length; s += 1) {
        const name = f[i];
        const length = Number(f[i + 1]);
        const startLoop = f[i + 2];
        const endLoop = f[i + 3];
        if (name && !sections.has(name)) {
          sections.set(name, {name, startLoop, endLoop, lengthUnits: Number.isFinite(length) ? length : null});
        }
        i += 4;
      }
    }
    if (line.startsWith('$U') && f.length > 8) {
      venue = f[4] || venue;
      trackType = f[5] || trackType;
      lapLengthUnits = null;
      // $U repeating: loopName, T/P flag, cumulativeDistance
      for (let i = 8; i + 2 < f.length; i += 3) {
        const loop = f[i];
        const dist = Number(f[i + 2]);
        if (loop && Number.isFinite(dist)) loopDistances.set(loop, dist);
      }
    }
  }

  // Lap-boundary sections: every non-pit MAINLINE section whose END loop is the
  // S/F line. Some venues expose an alternate S/F loop (e.g. St Petersburg emits
  // both S8: I7->SF and I3: I6->SF), so a car can complete a lap through either;
  // treating all of them as boundaries (with de-duplication downstream) keeps the
  // per-car lap count correct. The S/F loop is "SF"/"SF*"; pit paths use P/L.
  const isPitLoop = (loop) => /^(P|SFP|PI|PO|PIC)/i.test(loop || '');
  const lapBoundarySections = [];
  for (const sec of sections.values()) {
    if (/^SF\*?$/i.test(sec.endLoop) && !isPitLoop(sec.startLoop) && !/^(P|L)/i.test(sec.name)) {
      lapBoundarySections.push(sec.name);
    }
  }
  // Fallback: whichever mainline section ends at a loop distance of ~0 (== S/F).
  if (lapBoundarySections.length === 0) {
    for (const sec of sections.values()) {
      if (loopDistances.get(sec.endLoop) === 0 && !/^(P|L)/i.test(sec.name)) lapBoundarySections.push(sec.name);
    }
  }
  const lapBoundarySection = lapBoundarySections[0] ?? null; // primary, for display

  // PIT-LANE lap-boundary sections (the lap-numbering alignment). A car that
  // completes a lap THROUGH the pit lane crosses the pit start/finish line
  // ("SFP" — a loop at cumulative distance 0, the pit-lane twin of the main S/F)
  // instead of the mainline S/F loop. The official timing system counts that
  // crossing as a completed lap; if we count only mainline S/F crossings, every
  // pit stop drops the car's lap number by one from that lap onward, so its
  // running order runs a lap behind the official lap chart for the rest of the
  // race (see analysis/track-position accuracy: this is the sole cause of the
  // Iowa/Portland pass-placement CONDITIONAL verdicts). These sections feed the
  // lap COUNTER only — they are NOT flagged isLapBoundary on the emitted crossing
  // rows, so finishing-order derivation (which reads mainline-S/F crossings and
  // relies on the winner pulling off before its cool-down lap) is untouched.
  const distOf = (loop) => loopDistances.get(loop) ?? loopDistances.get(`${loop}*`) ?? null;
  const isPitSfLoop = (loop) => /^SFP\*?$/i.test(loop || '') && distOf(loop) === 0;
  const pitLapBoundarySections = [];
  for (const sec of sections.values()) {
    if (isPitSfLoop(sec.endLoop)) pitLapBoundarySections.push(sec.name);
  }

  return {
    venue,
    trackType,
    sections,
    loopDistances,
    lapLengthUnits,
    lapBoundarySection,
    lapBoundarySections,
    pitLapBoundarySections,
  };
}

// Ordered flag transitions from $A/$M free text (precise local clock + reason).
// $F state records (field[4] in G/Y/R/K/U) are a complementary signal used only
// to confirm that a checkered was shown when no "Checkered Flag at:" text exists.
function parseFlags(lines) {
  const seen = new Set();
  const events = [];
  let hasCheckeredState = false;
  for (const line of lines) {
    if (line.startsWith('$F')) {
      const state = line.split(DELIM)[4];
      if (state === 'K') hasCheckeredState = true;
      continue;
    }
    if (!line.startsWith('$A') && !line.startsWith('$M')) continue;
    if (/\bcheckered\b|\bchequered\b/i.test(line)) hasCheckeredState = true;
    const m = /\b(Green|Yellow|Red|Checkered|Chequered|White)\s+Flag\s+at:\s*([0-9:.]+)([^¦]*)/i.exec(line);
    if (!m) continue;
    const state = m[1].toLowerCase().replace('chequered', 'checkered');
    const tod = todFromClockString(m[2]);
    if (tod === null) continue;
    const reason = (m[3] || '').trim();
    const key = `${state}|${m[2]}|${reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({state, timeOfDaySeconds: tod, reason: reason || null});
  }
  events.sort((a, b) => a.timeOfDaySeconds - b.timeOfDaySeconds);

  // Collapse into contiguous intervals: each transition opens an interval that
  // closes at the next transition (checkered closes the session).
  const intervals = [];
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i];
    const next = events[i + 1];
    intervals.push({
      state: e.state,
      startTimeOfDaySeconds: e.timeOfDaySeconds,
      endTimeOfDaySeconds: next ? next.timeOfDaySeconds : null,
      reason: e.reason,
    });
  }
  const greenTod = events.find((e) => e.state === 'green')?.timeOfDaySeconds ?? null;
  const checkeredTod = events.find((e) => e.state === 'checkered')?.timeOfDaySeconds ?? null;
  return {events, intervals, greenTod, checkeredTod, hasCheckered: hasCheckeredState || checkeredTod !== null};
}

// Final feed classification from the last $O (preferred) / $C per car.
function parseClassification(lines) {
  const byCar = new Map();
  const identities = new Map();
  for (const line of lines) {
    const f = line.split(DELIM);
    if (line.startsWith('$O') && f.length >= 36) {
      const car = f[29];
      if (!car) continue;
      byCar.set(car, {
        car,
        position: hex(f[7]),
        laps: hex(f[13]),
        totalTimeSeconds: hex(f[14]) === null ? null : hex(f[14]) / TICKS_PER_SECOND,
        statusCode: f[26] ?? null,
        classified: f[26] === '4',
        firstName: f[30] || null,
        lastName: f[31] || null,
        team: f[35] || null,
        source: '$O',
      });
      const name = `${f[30] || ''} ${f[31] || ''}`.trim();
      if (car && !identities.has(car)) identities.set(car, {car, driver: name || null, team: f[35] || null});
    }
  }
  // $C fallback for cars without a usable $O.
  const cPos = new Map();
  for (const line of lines) {
    if (!line.startsWith('$C')) continue;
    const f = line.split(DELIM);
    const car = f[5];
    if (!car) continue;
    cPos.set(car, {position: hex(f[4]), laps: hex(f[7])});
  }
  for (const [car, c] of cPos) {
    if (!byCar.has(car)) byCar.set(car, {car, position: c.position, laps: c.laps, source: '$C', classified: null});
  }
  return {byCar, identities};
}

// Per-car, per-lap loop crossings and the derived laps table.
function parseCrossingsAndLaps(lines, geometry, flags) {
  const boundarySet = new Set(geometry.lapBoundarySections ?? [geometry.lapBoundarySection].filter(Boolean));
  // Pit-lane S/F sections: a lap completed through the pit lane (crossing SFP,
  // distance 0) instead of the mainline S/F. Counted for lap NUMBERING only.
  const pitBoundarySet = new Set(geometry.pitLapBoundarySections ?? []);
  const crossings = []; // one row per $S section-end loop crossing
  const perCar = new Map(); // car -> {lapCounter, lastSfTod, laps:[]}
  const identities = new Map();
  let heartbeatEpoch = null;
  let firstTod = null;
  let lastTod = null;

  // Build an identity map from $E records (car -> driver/team) for row context.
  for (const line of lines) {
    if (!line.startsWith('$E')) continue;
    const f = line.split(DELIM);
    if (f.length < 7) continue;
    const car = f[4];
    if (car && !identities.has(car)) identities.set(car, {car, driver: f[6] || null, team: f[14] || null});
  }

  for (const line of lines) {
    if (line.startsWith('$H')) {
      const f = line.split(DELIM);
      heartbeatEpoch = hex(f[5]);
      continue;
    }
    if (!line.startsWith('$S')) continue;
    const f = line.split(DELIM);
    if (f.length < 10) continue;
    const car = f[4] || null;
    const label = f[6] || null;
    const todTicks = hex(f[7]);
    const durTicks = hex(f[8]);
    if (!car || !label || todTicks === null) continue;
    const tod = todTicks / TICKS_PER_SECOND;
    firstTod = firstTod === null ? tod : Math.min(firstTod, tod);
    lastTod = lastTod === null ? tod : Math.max(lastTod, tod);

    const section = geometry.sections.get(label) || null;
    const endLoop = section ? section.endLoop : null;

    // Maintain a per-car lap index that increments on each S/F-line crossing —
    // the MAINLINE S/F line, or the PIT-LANE S/F line (SFP) when the car
    // completes its lap through the pit. Both sit at cumulative distance 0 (the
    // same start/finish plane) and a car crosses exactly one of them per lap, so
    // the shared 3 s de-duplication below prevents any double count.
    const car_ = ensureCar(perCar, car);
    const isBoundary = boundarySet.has(label); // mainline S/F (flagged on the row)
    const isPitLapCompletion = pitBoundarySet.has(label); // pit-lane S/F (counter only)
    if (isBoundary || isPitLapCompletion) {
      // De-duplicate a second S/F-plane crossing that lands within 3 s of another
      // (an alternate mainline S/F loop, or a pit S/F crossing that coincides
      // with a mainline one — same physical lap completion via a different loop).
      const last = car_.sfCrossings[car_.sfCrossings.length - 1];
      if (!last || Math.abs(tod - last.tod) > 3) car_.sfCrossings.push({tod, durTicks, position: hex(f[5])});
    }
    const lapIndex = car_.sfCrossings.length + 1; // crossings observed BEFORE this one + 1

    crossings.push({
      car,
      lapIndex,
      sectionLabel: label,
      endLoop,
      startLoop: section ? section.startLoop : null,
      timeOfDaySeconds: round(tod, 4),
      sectionSeconds: durTicks === null ? null : round(durTicks / TICKS_PER_SECOND, 4),
      feedPosition: hex(f[5]),
      isLapBoundary: isBoundary,
      dateAnchorEpoch: heartbeatEpoch,
    });
  }

  // Derive the laps table from S/F crossings. Lap counting from raw crossings
  // has to separate three non-racing crossings: the formation/pace lap (before
  // green), the START-LINE crossing (the field crosses S/F together to begin
  // lap 1), and any cool-down crossing after the checkered. The reliable signal
  // for the start is that the whole field bunches through S/F within a few
  // seconds; a completed racing lap only exists AFTER that start bunch.
  // Lap counting from raw S/F crossings must strip three non-racing crossings:
  //   1. formation/pace crossings (before the field takes the start),
  //   2. the START-LINE crossing (field crosses S/F together to begin lap 1),
  //   3. the COOL-DOWN crossing after the checkered (non-winners cross the line
  //      once more; the winner usually pulls off, which otherwise ranks the
  //      winner BELOW its cool-down rivals).
  // The start is anchored to the field-bunch (detectStartReference); crossings
  // strictly after it are candidate racing laps. The checkered lap L is the
  // last lap the full field completes together: past L the count falls off a
  // cliff (only stragglers do a cool-down lap). Completed laps are capped at L.
  const greenTod = flags.greenTod;
  const lapEst = estimateLapSeconds(perCar);
  const startReferenceTod = detectStartReference(perCar, greenTod, lapEst);
  const anchor = startReferenceTod ?? greenTod;

  // Racing laps per car = S/F crossings AFTER that car's own start-line crossing
  // (its crossing nearest the field-start bunch). Using each car's own start
  // crossing — rather than one shared time threshold — keeps the count correct
  // for front-runners whose start crossing precedes the bunch centre and back-
  // markers whose start crossing follows it.
  const racingByCar = new Map();
  for (const [car, state] of perCar) {
    const sf = state.sfCrossings.slice().sort((a, b) => a.tod - b.tod);
    racingByCar.set(car, racingAfterStart(sf, anchor, lapEst));
  }
  const checkeredLap = detectCheckeredLap(racingByCar);

  const laps = [];
  const lapCountByCar = new Map();
  for (const [car, racing0] of racingByCar) {
    const racing = checkeredLap === null ? racing0 : racing0.slice(0, checkeredLap);
    lapCountByCar.set(car, racing.length);
    let prevTod = anchor !== null ? anchor : racing.length ? racing[0].tod : null;
    racing.forEach((c, i) => {
      laps.push({
        car,
        lap: i + 1,
        startTimeOfDaySeconds: prevTod === null ? null : round(prevTod, 4),
        endTimeOfDaySeconds: round(c.tod, 4),
        // Full lap time = S/F-to-S/F crossing delta (what the official "Lap"
        // section reports). Lap 1 is measured from the start-line instant.
        lapSeconds: prevTod === null ? null : round(c.tod - prevTod, 4),
        // The feed's own duration for the final S/F section, kept for auditing.
        sfSectionSeconds: c.durTicks === null ? null : round(c.durTicks / TICKS_PER_SECOND, 4),
        positionAtSF: c.position ?? null,
        isFirstRacingLap: i === 0,
      });
      prevTod = c.tod;
    });
  }

  return {
    crossings,
    laps,
    lapCountByCar,
    identities,
    startReferenceTod,
    crossingWindow: {firstTimeOfDaySeconds: firstTod, lastTimeOfDaySeconds: lastTod},
  };
}

// Median green-flag lap time, estimated from the tightest cluster of consecutive
// S/F gaps (robust to the long gaps around pits, cautions and red flags).
function estimateLapSeconds(perCar) {
  const gaps = [];
  for (const state of perCar.values()) {
    const sf = state.sfCrossings.slice().sort((a, b) => a.tod - b.tod);
    for (let i = 1; i < sf.length; i += 1) {
      const g = sf[i].tod - sf[i - 1].tod;
      if (g > 5 && g < 400) gaps.push(g);
    }
  }
  if (gaps.length === 0) return 60;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length * 0.25)]; // lower quartile ~ green-flag pace
}

// The race start is the bunch of S/F crossings where the field crosses the line
// together to take the green. Returns the CENTRE tod of the first such bunch at
// or after (green - one lap). Null if no green flag.
function detectStartReference(perCar, greenTod, lapEst) {
  if (greenTod === null) return null;
  const all = [];
  for (const state of perCar.values()) {
    for (const c of state.sfCrossings) {
      if (c.tod >= greenTod - Math.max(15, lapEst) && c.tod <= greenTod + 2 * lapEst) all.push(c.tod);
    }
  }
  if (all.length === 0) return null;
  all.sort((a, b) => a - b);
  const WINDOW = 8;
  // First 8 s window (scanning forward from the earliest) covering >= 5 crossings
  // is the start bunch; its centre is the shared start-line instant.
  for (let i = 0; i < all.length; i += 1) {
    let j = i;
    while (j < all.length && all[j] - all[i] <= WINDOW) j += 1;
    if (j - i >= 5) return (all[i] + all[j - 1]) / 2;
  }
  return greenTod;
}

// Crossings that are genuine completed racing laps: everything strictly after
// the car's own start-line crossing (its crossing nearest the start bunch,
// within one lap of it). Falls back to "after anchor" when no start crossing is
// near the bunch (e.g. a car that pitted through the start).
function racingAfterStart(sfSorted, anchor, lapEst) {
  if (anchor === null) return sfSorted;
  let startIdx = -1;
  let best = Infinity;
  for (let i = 0; i < sfSorted.length; i += 1) {
    const d = Math.abs(sfSorted[i].tod - anchor);
    if (d <= 1.1 * lapEst && d < best) {
      best = d;
      startIdx = i;
    }
  }
  if (startIdx === -1) return sfSorted.filter((c) => c.tod > anchor);
  return sfSorted.slice(startIdx + 1);
}

// The checkered is thrown when the leader completes the final lap; the whole
// lead-lap field takes it together. The very next lap only a small minority do
// a cool-down crossing, so participation falls off a CLIFF at L -> L+1. We cap
// only on a genuine cliff (>=60% drop from a still-substantial field), so that
// gradual attrition / timed-race in-laps are NOT mistaken for the checkered.
// Returns the checkered lap L, or null (no cap) when no clear cliff exists.
function detectCheckeredLap(racingByCar) {
  const counts = []; // counts[k-1] = cars completing lap k
  for (const racing of racingByCar.values()) {
    for (let k = 1; k <= racing.length; k += 1) counts[k - 1] = (counts[k - 1] || 0) + 1;
  }
  if (counts.length < 2) return null;
  const fieldSize = counts[0];
  for (let k = counts.length - 1; k >= 2; k -= 1) {
    const here = counts[k - 1];
    const next = counts[k] || 0;
    if (here >= Math.max(3, fieldSize * 0.35) && next <= 0.4 * here) return k;
  }
  return null;
}

function ensureCar(map, car) {
  let s = map.get(car);
  if (!s) {
    s = {sfCrossings: []};
    map.set(car, s);
  }
  return s;
}

// Heartbeat health with the audit's Condition-3 sanitation: drop implausible
// epochs (line-collision corruption produced epoch 0x39-scale absurd gaps).
function analyzeHeartbeats(lines) {
  const epochs = [];
  let headerCount = 0;
  const seriesSet = new Set();
  for (const line of lines) {
    if (line.startsWith('*** New Session')) headerCount += 1;
    if (!line.startsWith('$H')) continue;
    const f = line.split(DELIM);
    const e = hex(f[5]);
    if (f[3]) seriesSet.add(f[3]);
    // Plausible feed epoch window: 2007-01-01 .. 2035-01-01.
    if (e !== null && e > 1_167_609_600 && e < 2_051_222_400) epochs.push(e);
  }
  epochs.sort((a, b) => a - b);
  let maxGap = null;
  const gaps = [];
  for (let i = 1; i < epochs.length; i += 1) {
    const g = epochs[i] - epochs[i - 1];
    gaps.push(g);
    maxGap = maxGap === null ? g : Math.max(maxGap, g);
  }
  const span = epochs.length ? epochs[epochs.length - 1] - epochs[0] : null;
  return {
    count: epochs.length,
    sanitizedHeaderCount: headerCount,
    firstEpoch: epochs[0] ?? null,
    lastEpoch: epochs[epochs.length - 1] ?? null,
    spanSeconds: span,
    maxGapSeconds: maxGap,
    seriesCodes: [...seriesSet],
  };
}

// Quality masks per the Wave-0 audit's known-defect vocabulary. We annotate,
// never hide: a masked session is still emitted with its rows plus a reason.
function deriveQualityMasks({heartbeats, crossingCount, sessionType, flags}) {
  const masks = [];
  if (heartbeats.count === 0 && crossingCount === 0) masks.push('log_header_only');
  if (heartbeats.sanitizedHeaderCount > 1) masks.push('mixed_session_requires_segmentation');
  if (heartbeats.spanSeconds !== null && heartbeats.spanSeconds > 6 * 3600) masks.push('full_day_capture');
  if (heartbeats.maxGapSeconds !== null && heartbeats.maxGapSeconds >= 120) masks.push('heartbeat_gap');
  if (sessionType === 'race' && flags.greenTod === null) masks.push('no_green_flag_detected');
  if (sessionType === 'race' && !flags.hasCheckered) masks.push('no_checkered_flag_detected');
  return masks;
}

export function parseRaceToolsSession(logText, session) {
  const lines = logText.split(/\r?\n/).filter(Boolean);
  const geometry = parseGeometry(lines);
  const flags = parseFlags(lines);
  const classification = parseClassification(lines);
  const {crossings, laps, lapCountByCar, identities, crossingWindow, startReferenceTod} = parseCrossingsAndLaps(
    lines,
    geometry,
    flags,
  );
  const heartbeats = analyzeHeartbeats(lines);

  // Merge identities: $E preferred, $O fallback.
  const cars = new Map(identities);
  for (const [car, ident] of classification.identities) {
    if (!cars.has(car)) cars.set(car, ident);
  }

  const loopLabels = [...new Set(crossings.map((c) => c.sectionLabel))].sort();
  const loopsCrossed = [...new Set(crossings.map((c) => c.endLoop).filter(Boolean))].sort();
  const masks = deriveQualityMasks({
    heartbeats,
    crossingCount: crossings.length,
    sessionType: session?.sessionType,
    flags,
  });

  return {
    session,
    sourceTier: SOURCE_TIER,
    geometry: {
      venue: geometry.venue,
      trackType: geometry.trackType,
      lapBoundarySection: geometry.lapBoundarySection,
      lapBoundarySections: geometry.lapBoundarySections,
      pitLapBoundarySections: geometry.pitLapBoundarySections,
      sectionCount: geometry.sections.size,
      sections: [...geometry.sections.values()],
      loopDistances: Object.fromEntries(geometry.loopDistances),
    },
    flags,
    heartbeats,
    classification: {byCar: [...classification.byCar.values()]},
    cars: [...cars.values()],
    crossings,
    laps,
    lapCountByCar: Object.fromEntries(lapCountByCar),
    startReferenceTod,
    loopLabels,
    loopsCrossed,
    crossingWindow,
    qualityMasks: masks,
  };
}

function round(n, d) {
  if (n === null || n === undefined || !Number.isFinite(n)) return n;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
