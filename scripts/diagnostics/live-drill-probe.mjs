#!/usr/bin/env node

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const strict = process.env.LIVE_DRILL_STRICT === "1";
const timeoutMs = Number(process.env.LIVE_DRILL_TIMEOUT_MS || 12000);
const args = new Set(process.argv.slice(2));
const watch = args.has("--watch") || process.env.LIVE_DRILL_WATCH === "1";
const intervalMs = Number(process.env.LIVE_DRILL_INTERVAL_MS || 30000);
const outDir = process.env.LIVE_DRILL_OUT_DIR || "analysis/live-drill-2026-06-21";

const sources = [
  {
    id: "indynxt_event_race2",
    tier: "required",
    url: "https://www.indynxt.com/Schedule/2026/Road-America-Race2",
    expects: [
      "Grand Prix at Road America Race 2",
      "Sunday, Jun 21",
      "12:00PM ET",
      "INDY NXT - Race 2",
      "18 Laps",
    ],
  },
  {
    id: "weekend_schedule_pdf_text",
    tier: "required",
    url: "https://www.indynxt.com/-/media/Files/2026/NICS/10-RA/indycar-weekendschedule-RA26.pdf",
    expects: [],
    contentTypeIncludes: "application/pdf",
  },
  {
    id: "indynxt_qualification_groups_pdf_text",
    tier: "important",
    url: "https://www.indynxt.com/-/media/Files/2026/INXT/09-10-RA/indynxt-qualgroups-RA26.pdf",
    expects: [],
    contentTypeIncludes: "application/pdf",
  },
  {
    id: "indynxt_pit_assignments_pdf_text",
    tier: "important",
    url: "https://www.indynxt.com/-/media/Files/2026/INXT/09-10-RA/indynxt-pitassignments-RA26.pdf",
    expects: [],
    contentTypeIncludes: "application/pdf",
  },
  {
    id: "indynxt_starting_grid_race2",
    tier: "required",
    url: "https://www.indynxt.com/Schedule/2026/Road-America-Race2/starting-grid",
    expects: [
      "Bryce",
      "Aron",
      "Chip Ganassi Racing",
      "452.7000",
    ],
  },
  {
    id: "fox_race2_event",
    tier: "important",
    url: "https://www.foxsports.com/motor/grand-prix-at-road-america-race-2-indy-nxt-jun-21-2026-racetrax-6072",
    expects: [
      "Grand Prix at Road America Race 2",
      "Road America",
      "18 laps",
      "STARTING LINEUP",
    ],
  },
  {
    id: "fox_race2_leaderboard_tab",
    tier: "dynamic",
    url: "https://www.foxsports.com/motor/grand-prix-at-road-america-race-2-indy-nxt-jun-21-2026-racetrax-6072?tab=leaderboard",
    expects: [
      "Grand Prix at Road America Race 2",
      "LEADERBOARD",
    ],
    dynamic: true,
  },
  {
    id: "indynxt_qualifying_race2_results",
    tier: "postsession",
    url: "https://www.indynxt.com/results/indy-nxt/2026/grand-prix-at-road-america-race-2/combined-qualifying---race-2",
    expects: [
      "INDY NXT by Firestone",
      "Combined Results",
      "Bryce Aron",
    ],
    optional: true,
  },
  {
    id: "indynxt_leaderboard_shell",
    tier: "dynamic",
    url: "https://www.indynxt.com/leaderboard",
    expects: ["INDYCAR Leaderboard"],
    dynamic: true,
  },
  {
    id: "leaderboard_direct_shell",
    tier: "dynamic",
    url: "https://leaderboard.indycar.com/",
    expects: ["INDYCAR"],
    dynamic: true,
  },
  {
    id: "indycar_leaderboard_shell",
    tier: "dynamic",
    url: "https://www.indycar.com/leaderboard",
    expects: ["INDYCAR Leaderboard"],
    dynamic: true,
  },
  {
    id: "indycar_leaderboard_nxt_hint",
    tier: "dynamic",
    url: "https://www.indycar.com/leaderboard?type=false",
    expects: ["INDYCAR Leaderboard"],
    dynamic: true,
  },
  {
    id: "racecontrol_redirect",
    tier: "important",
    url: "https://racecontrol.indycar.com/",
    expects: ["INDYCAR Leaderboard"],
    allowRedirect: true,
  },
  {
    id: "indycar_radio_home",
    tier: "optional",
    url: "https://www.indycarradio.com/",
    expects: [],
    optional: true,
  },
  {
    id: "indycar_how_to_follow",
    tier: "important",
    url: "https://www.indycar.com/how-to-follow",
    expects: [
      "INDYCAR Radio Network",
      "Live Race Leaderboard",
      "lap times",
      "pit stops",
    ],
  },
  {
    id: "indycar_event_road_america",
    tier: "required",
    url: "https://www.indycar.com/Schedule/2026/Road-America",
    expects: [
      "XPEL Grand Prix at Road America",
      "Sunday, Jun 21",
      "2:00PM ET",
      "NTT INDYCAR SERIES - Race",
      "55 Laps",
    ],
  },
  {
    id: "firestone_tire_tracker_index",
    tier: "optional",
    url: "https://livetiming.net/firestone/",
    expects: ["Archive"],
    optional: true,
  },
  {
    id: "nws_track_forecast",
    tier: "important",
    url: "https://forecast.weather.gov/MapClick.php?lat=43.7975&lon=-87.9999",
    expects: ["National Weather Service"],
  },
];

const firestoneCandidates = [
  "https://livetiming.net/firestone/XPEL-Grand-Prix-at-Road-America_Race.png",
  "https://livetiming.net/firestone/XPEL%20Grand%20Prix%20at%20Road%20America_Race.png",
  "https://livetiming.net/firestone/Road-America_Race.png",
  "https://livetiming.net/firestone/Road%20America_Race.png",
];

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

function statusFor(source, httpOk, missing) {
  if (!httpOk) {
    return source.tier === "required" ? "fail" : "warn";
  }
  if (missing.length === 0) {
    return source.dynamic ? "warn" : "pass";
  }
  if (source.tier !== "required") {
    return "warn";
  }
  return "fail";
}

async function fetchWithTimeout(url, method = "GET") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "BryceCastLiveDrill/2026-06-21",
        accept: method === "HEAD" ? "*/*" : "text/html,application/xhtml+xml,application/json,*/*",
      },
    });
    const elapsedMs = Math.round(performance.now() - t0);
    const body = method === "HEAD" ? "" : await response.text();
    return {
      ok: true,
      status: response.status,
      finalUrl: response.url,
      elapsedMs,
      contentType: response.headers.get("content-type") || "",
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      elapsedMs: Math.round(performance.now() - t0),
      contentType: "",
      body: "",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeSource(source) {
  const result = await fetchWithTimeout(source.url);
  const compact = normalize(result.body);
  const missing = result.ok
    ? source.expects.filter((needle) => !compact.includes(needle))
    : [...source.expects];
  if (
    result.ok
    && source.contentTypeIncludes
    && !result.contentType.toLowerCase().includes(source.contentTypeIncludes)
  ) {
    missing.push(`content-type includes ${source.contentTypeIncludes}`);
  }
  const status = statusFor(source, result.ok && result.status >= 200 && result.status < 400, missing);
  const notes = [];

    if (source.dynamic && status === "warn") {
    notes.push("Reachable shell; capture browser network traffic during live session for payload endpoint.");
  }
  if (source.tier === "postsession" && status === "warn") {
    notes.push("Post-session report page may be unpopulated or transformed by client code until official results publish.");
  }
  if (source.id === "racecontrol_redirect" && result.finalUrl.includes("indycar.com/leaderboard")) {
    notes.push("Legacy RaceControl entrypoint redirects to official leaderboard.");
  }

  return {
    id: source.id,
    tier: source.tier,
    status,
    httpStatus: result.status,
    elapsedMs: result.elapsedMs,
    url: source.url,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    missing,
    notes,
    error: result.error,
  };
}

async function probeFirestoneCandidates() {
  const checks = [];
  for (const url of firestoneCandidates) {
    const result = await fetchWithTimeout(url, "HEAD");
    checks.push({
      url,
      status: result.ok && result.status >= 200 && result.status < 400 ? "pass" : "warn",
      httpStatus: result.status,
      elapsedMs: result.elapsedMs,
      contentType: result.contentType,
      finalUrl: result.finalUrl,
      error: result.error,
    });
  }
  return checks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileSafeTimestamp(iso) {
  return iso.replace(/[:.]/g, "-");
}

async function runProbe() {
  const sourceResults = [];
  for (const source of sources) {
    sourceResults.push(await probeSource(source));
  }

  const firestoneCurrentImageCandidates = await probeFirestoneCandidates();

  const failed = sourceResults.filter((item) => item.status === "fail");
  const warned = [
    ...sourceResults.filter((item) => item.status === "warn"),
    ...firestoneCurrentImageCandidates.filter((item) => item.status === "warn"),
  ];

  const generatedAt = new Date().toISOString();
  return {
    drill: "BryceCast live backend capability probe",
    generatedAt,
    localDate: new Date().toString(),
    strict,
    timeoutMs,
    watch,
    intervalMs,
    outDir,
    schedule: {
      indynxtRace2: {
        officialStart: "2026-06-21T12:00:00-04:00",
        centralStart: "2026-06-21T11:00:00-05:00",
        approximateGreenCentral: "2026-06-21T11:06:00-05:00",
        distance: "18 laps / 72.25 miles",
        bryce: {
          car: "9",
          team: "Chip Ganassi Racing",
          start: 15,
          radioFrequency: "452.7000",
        },
      },
      indycarRace: {
        officialStart: "2026-06-21T14:00:00-04:00",
        centralStart: "2026-06-21T13:00:00-05:00",
        approximateGreenCentral: "2026-06-21T13:27:00-05:00",
        distance: "55 laps / 220.77 miles",
      },
    },
    summary: {
      pass: sourceResults.filter((item) => item.status === "pass").length
        + firestoneCurrentImageCandidates.filter((item) => item.status === "pass").length,
      warn: warned.length,
      fail: failed.length,
    },
    sources: sourceResults,
    firestoneCurrentImageCandidates,
    exitPolicy: strict
      ? "strict mode exits non-zero on fail or warn"
      : "default mode exits non-zero only on fail",
  };
}

async function persistReport(report) {
  await mkdir(outDir, { recursive: true });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const oneLine = `${JSON.stringify(report)}\n`;
  const snapshotPath = path.join(outDir, `${fileSafeTimestamp(report.generatedAt)}.json`);
  await writeFile(snapshotPath, json);
  await writeFile(path.join(outDir, "latest.json"), json);
  await appendFile(path.join(outDir, "snapshots.jsonl"), oneLine);
  return snapshotPath;
}

if (watch) {
  console.error(`live drill watch starting: interval=${intervalMs}ms outDir=${outDir}`);
  while (true) {
    const report = await runProbe();
    const snapshotPath = await persistReport(report);
    console.error(
      `${report.generatedAt} pass=${report.summary.pass} warn=${report.summary.warn} fail=${report.summary.fail} snapshot=${snapshotPath}`,
    );
    await sleep(intervalMs);
  }
} else {
  const report = await runProbe();
  console.log(JSON.stringify(report, null, 2));

  if (report.summary.fail > 0 || (strict && report.summary.warn > 0)) {
    process.exit(1);
  }
}
