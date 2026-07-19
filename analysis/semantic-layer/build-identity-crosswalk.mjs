#!/usr/bin/env node
// THE IDENTITY CROSSWALK — the correctness gate for any 2026 lake data
// reaching the UI (permissions-ledger obligation; audit Task 6).
//
// For every 2026 Timing71 session: map (car number, source name string) ->
// canonical driverId, EVENT-SCOPED (car numbers are reused across seasons and
// can be shared across an event only by mid-season swaps). The number join
// proposes candidates; the NAME check disposes:
//   - one candidate + name match (exact or variant rule) -> mapped
//   - several candidates (same car, different drivers across the season):
//     the unique name-matching candidate wins -> mapped (swap-resolved)
//   - no candidate, or name irreconcilable -> unmapped / ambiguous (HARD:
//     these fail the validator; nothing silently passes)
// Every mapping carries its evidence (rule fired, canonical name, scope used).

import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCanonicalIdentityContext, matchDriverName, normVenue} from './lib/canonical.mjs';

const LANE_DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(LANE_DIR, 'output', 'crosswalk');

const t71 = JSON.parse(await readFile(join(LANE_DIR, 'output', 'timing71-2026-summary.json'), 'utf8'));
const {gunzipSync} = await import('node:zlib');
async function loadRoster(pack) {
  const text = gunzipSync(await readFile(join(LANE_DIR, 'output', pack))).toString('utf8');
  for (const line of text.split('\n')) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (row.record === 'roster') return row.cars;
  }
  return [];
}

const ctx = await loadCanonicalIdentityContext();

// Official event rosters from BryceCast's own capture (committed extract of the
// official Race Control feed). For an event whose canonical results have not
// landed yet (the pre-race Nashville 2026 weekend), this roster IS event-scoped
// ground truth: car number -> official name (+ a feed DriverID used as a
// stability check; it is a Race Control id-space, not canonical's).
const capture = JSON.parse(await readFile(join(LANE_DIR, 'output', 'cross-check', 'capture-final-states.json'), 'utf8'));
const officialToCanonical = new Map(ctx.sessions.filter((s) => s.officialSessionId).map((s) => [String(s.officialSessionId), s]));
const captureRosterByEvent = new Map(); // eventId -> Map(car -> {name, officialDriverIds:Set, sessions:[], conflict})
for (const cap of capture.sessions) {
  if (!cap.officialEventSessionId) continue;
  const canS = officialToCanonical.get(String(cap.officialEventSessionId));
  if (!canS) continue;
  let roster = captureRosterByEvent.get(canS.eventId);
  if (!roster) {
    roster = new Map();
    captureRosterByEvent.set(canS.eventId, roster);
  }
  for (const row of cap.finalField) {
    const name = `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim();
    if (!row.car || !name) continue;
    const cur = roster.get(row.car);
    if (!cur) roster.set(row.car, {name, officialDriverIds: new Set([row.officialDriverId]), sessions: [cap.sessionKey], conflict: false});
    else {
      cur.officialDriverIds.add(row.officialDriverId);
      cur.sessions.push(cap.sessionKey);
      if (cur.name !== name) cur.conflict = true; // same car, different official names within the event
    }
  }
}

function pseudoDriverFromName(name) {
  const parts = String(name).trim().split(/\s+/);
  return {displayName: name, givenName: parts.slice(0, -1).join(' '), familyName: parts.slice(-1).join(' ')};
}

// Match each T71 session to its canonical event (entrant scope) and, for races,
// its canonical session (results scope). Doubleheaders pair by race number.
function raceNumberOf(session) {
  return Number(/Race (\d)/i.exec(session.event)?.[1] ?? /Race (\d)/i.exec(session.sessionLabel)?.[1]) || null;
}
function matchCanonicalSession(session) {
  const vk = normVenue(session.venue);
  const cands = ctx.sessions.filter((c) => c.year === 2026 && c.venueKey === vk);
  const rn = raceNumberOf(session);
  if (session.sessionType === 'race') {
    const races = cands.filter((c) => c.sessionType === 'race');
    if (rn !== null) return races.find((c) => c.raceNumber === rn) ?? null;
    if (races.length === 1) return races[0];
    return races.find((c) => c.date === session.date) ?? null;
  }
  // Non-race: nearest same-type by date, else any session of the event.
  const sameType = cands.filter((c) => c.sessionType === session.sessionType);
  const pool = sameType.length ? sameType : cands;
  pool.sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(session.date)) - Math.abs(Date.parse(b.date) - Date.parse(session.date)));
  return pool[0] ?? null;
}

const sessionsOut = [];
for (const session of t71.sessions) {
  const can = matchCanonicalSession(session);
  const eventEntrants = can ? ctx.entrantsByEvent.get(can.eventId) : null;
  // A future/current event with no canonical results yet (e.g. Nashville 2026
  // pre-race) has an empty event scope. If our OWN capture holds the event's
  // official roster, that roster is the event-scoped authority
  // ('event_capture'): a Timing71 identity maps only when the capture's
  // official name for the same car confirms it. Only when neither canonical
  // results nor a capture roster exist does the labelled season fallback apply
  // (never a strict UI GO).
  const eventScopeAvailable = !!eventEntrants && eventEntrants.size > 0;
  const captureRoster = can ? captureRosterByEvent.get(can.eventId) : null;
  const captureScopeAvailable = !eventScopeAvailable && !!captureRoster && captureRoster.size > 0;
  const seasonEntrants = ctx.entrantsByYear.get(2026) ?? new Map();
  const scopeUsed = eventScopeAvailable ? 'event' : captureScopeAvailable ? 'event_capture' : 'season_fallback';
  const roster = await loadRoster(session.pack);
  const mappings = [];
  for (const entry of roster) {
    const candidates = [...((eventScopeAvailable ? eventEntrants : seasonEntrants).get(entry.car) ?? [])];
    let status;
    let driverId = null;
    let rule = null;
    let evidence = null;
    if (candidates.length === 0) {
      status = 'unmapped';
      evidence = 'no canonical entrant with this car number in event scope';
    } else if (scopeUsed === 'event_capture') {
      // Authority = the capture's official event roster. The chain must close
      // three ways for the same car: Timing71 name ~ capture official name,
      // capture official name ~ canonical driver, Timing71 name ~ canonical
      // driver. Anything less is ambiguous (a hard failure downstream).
      const capEntry = captureRoster.get(entry.car);
      if (!capEntry) {
        status = 'ambiguous';
        evidence = `car #${entry.car} not present in the capture's official event roster`;
      } else if (capEntry.conflict) {
        status = 'ambiguous';
        evidence = `capture roster holds conflicting official names for car #${entry.car}`;
      } else {
        const t71VsCapture = matchDriverName(entry.driver, pseudoDriverFromName(capEntry.name));
        const matches = candidates
          .map((id) => ({id, drv: ctx.drivers.get(id) ?? {}}))
          .filter((m) => matchDriverName(capEntry.name, m.drv).match && matchDriverName(entry.driver, m.drv).match);
        if (t71VsCapture.match && matches.length === 1) {
          driverId = matches[0].id;
          rule = t71VsCapture.rule;
          status = 'mapped_event_capture_confirmed';
          evidence = `${entry.driver} ~ official "${capEntry.name}" (capture ${capEntry.sessions.join('+')}, feedDriverId ${[...capEntry.officialDriverIds].join('/')}) ~ ${ctx.drivers.get(driverId)?.displayName}`;
        } else {
          status = 'ambiguous';
          evidence = `capture official name "${capEntry.name}" does not close the chain for "${entry.driver}" (canonical matches: ${matches.map((m) => m.drv.displayName).join(', ') || 'none'})`;
        }
      }
    } else {
      const matches = candidates
        .map((id) => ({id, res: matchDriverName(entry.driver, ctx.drivers.get(id) ?? {})}))
        .filter((m) => m.res.match);
      if (matches.length === 1) {
        driverId = matches[0].id;
        rule = matches[0].res.rule;
        status =
          scopeUsed === 'season_fallback'
            ? 'mapped_season_scope'
            : candidates.length > 1
              ? 'mapped_swap_resolved'
              : rule === 'exact'
                ? 'mapped_exact'
                : 'mapped_name_variant';
        evidence = `${entry.driver} ~ ${ctx.drivers.get(driverId)?.displayName} (${rule}${scopeUsed === 'season_fallback' ? '; season scope' : ''})`;
      } else if (matches.length === 0) {
        status = 'ambiguous';
        evidence = `name "${entry.driver}" matches none of: ${candidates.map((id) => ctx.drivers.get(id)?.displayName).join(', ')}`;
      } else {
        status = 'ambiguous';
        evidence = `name "${entry.driver}" matches multiple: ${matches.map((m) => ctx.drivers.get(m.id)?.displayName).join(', ')}`;
      }
    }
    mappings.push({car: entry.car, sourceName: entry.driver, sourceTeam: entry.team, driverId, status, rule, evidence});
  }
  const counts = {
    mapped: mappings.filter((m) => m.status.startsWith('mapped')).length,
    exact: mappings.filter((m) => m.status === 'mapped_exact').length,
    nameVariant: mappings.filter((m) => m.status === 'mapped_name_variant').length,
    swapResolved: mappings.filter((m) => m.status === 'mapped_swap_resolved').length,
    eventCaptureConfirmed: mappings.filter((m) => m.status === 'mapped_event_capture_confirmed').length,
    seasonScope: mappings.filter((m) => m.status === 'mapped_season_scope').length,
    ambiguous: mappings.filter((m) => m.status === 'ambiguous').length,
    unmapped: mappings.filter((m) => m.status === 'unmapped').length,
  };
  sessionsOut.push({
    t71SessionId: session.id,
    sessionType: session.sessionType,
    date: session.date,
    venue: session.venue,
    canonicalEventId: can?.eventId ?? null,
    canonicalSessionId: can?.sessionId ?? null,
    canonicalOfficialSessionId: can?.officialSessionId ?? null,
    rosterSize: mappings.length,
    scopeUsed,
    eventAuthority:
      scopeUsed === 'event'
        ? 'canonical_results'
        : scopeUsed === 'event_capture'
          ? 'brycecast_capture_official_roster'
          : 'season_index_only',
    counts,
    complete: counts.ambiguous === 0 && counts.unmapped === 0 && mappings.length > 0,
    strictEventScope: scopeUsed === 'event',
    eventScoped: scopeUsed === 'event' || scopeUsed === 'event_capture',
    mappings,
  });
}

const out = {
  artifact: 'identity-crosswalk-2026',
  generatedAt: new Date().toISOString(),
  scope: 'INDY_NXT 2026, Timing71 replays -> canonical driverIds (event-scoped)',
  law: 'No 2026 lake-derived identity reaches the UI except through this crosswalk; ambiguous/unmapped entries are hard failures, never silent fallbacks.',
  sessionCount: sessionsOut.length,
  completeSessions: sessionsOut.filter((s) => s.complete).length,
  sessions: sessionsOut,
};
await mkdir(OUT, {recursive: true});
await writeFile(join(OUT, 'identity-crosswalk-2026.json'), `${JSON.stringify(out, null, 2)}\n`);

console.log(`Crosswalk: ${out.completeSessions}/${out.sessionCount} sessions fully mapped.`);
for (const s of sessionsOut) {
  const flag = s.complete ? 'OK ' : 'FAIL';
  console.log(`  ${flag} ${s.t71SessionId} roster=${s.rosterSize} exact=${s.counts.exact} variant=${s.counts.nameVariant} swap=${s.counts.swapResolved} evcap=${s.counts.eventCaptureConfirmed} season=${s.counts.seasonScope} ambiguous=${s.counts.ambiguous} unmapped=${s.counts.unmapped}`);
  for (const m of s.mappings.filter((m) => m.status === 'ambiguous' || m.status === 'unmapped')) {
    console.log(`       ${m.status}: #${m.car} "${m.sourceName}" — ${m.evidence}`);
  }
}
