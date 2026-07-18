#!/usr/bin/env node

import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

const FIXTURES = {
  "2024-barber": {
    mode: "nested-range",
    event: "2024 INDY NXT Grand Prix of Alabama race",
    date: "2024-04-28",
    outerUrl: "https://racetools.com/logfiles/IndyCar/IndyCar_2024.zip",
    entryName:
      "2024/04 - Barber Motorsports Park/INDY NXT by Firestone Grand Prix of Alabama(Barber Motorsports Park)-Race_(R.L)_2024-04-28.zip",
    expectedSha256: "e3f1d12a41e77c11edfb99811a46953a438762eac05fda1d6fab20d0c0d2e4fa",
  },
  "2025-barber": {
    mode: "direct",
    event: "2025 INDY NXT Grand Prix of Alabama race",
    date: "2025-05-04",
    url:
      "https://racetools.com/logfiles/IndyCar/2025/04%20-%20Barber%20Motorsports%20Park/INDY%20NXT%20by%20Firestone%20GP%20of%20Alabama(Barber%20Motorsports%20Park)-Race_(R.L)_2025-05-04.zip",
    expectedSha256: "db594424e5cc9b6dbb48d68c3a4f22913ff5e67b8b699020432dd46327f94c64",
  },
};

const MAX_DIRECT_BYTES = 5 * 1024 * 1024;
const CENTRAL_TAIL_BYTES = 2 * 1024 * 1024;

function usage() {
  return `Usage: node probe-racetools.mjs [all|2024-barber|2025-barber]

Downloads only two fixed, small proof fixtures. The 2024 fixture uses HTTP ranges
to extract one stored inner ZIP from the 188 MB season archive; it does not download
the season. Payloads stay in memory and are not written to the repository.`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fetchBytes(url, { range, maxBytes = MAX_DIRECT_BYTES } = {}) {
  const headers = {
    "user-agent": "BryceCast-historical-data-audit/1.0",
    accept: "*/*",
  };
  if (range) headers.range = range;

  const response = await fetch(url, { headers, redirect: "follow" });
  const allowed = range ? [206] : [200];
  if (!allowed.includes(response.status)) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    throw new Error(`bounded probe refused ${bytes.length} bytes (limit ${maxBytes})`);
  }

  return {
    bytes,
    status: response.status,
    contentRange: response.headers.get("content-range"),
    contentLength: response.headers.get("content-length"),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}

function centralEntries(bytes) {
  const entries = [];
  for (let offset = 0; offset + 46 <= bytes.length; offset += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) continue;
    const fileNameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const end = offset + 46 + fileNameLength + extraLength + commentLength;
    if (end > bytes.length) continue;

    entries.push({
      name: bytes.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8"),
      method: bytes.readUInt16LE(offset + 10),
      crc32: bytes.readUInt32LE(offset + 16),
      compressedSize: bytes.readUInt32LE(offset + 20),
      uncompressedSize: bytes.readUInt32LE(offset + 24),
      localOffset: bytes.readUInt32LE(offset + 42),
    });
    offset = end - 1;
  }
  return entries;
}

function localEntryData(zipBytes, entry) {
  const offset = entry.localOffset;
  if (zipBytes.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`invalid local ZIP header for ${entry.name}`);
  }
  const fileNameLength = zipBytes.readUInt16LE(offset + 26);
  const extraLength = zipBytes.readUInt16LE(offset + 28);
  const start = offset + 30 + fileNameLength + extraLength;
  const compressed = zipBytes.subarray(start, start + entry.compressedSize);
  if (compressed.length !== entry.compressedSize) {
    throw new Error(`truncated ZIP entry ${entry.name}`);
  }
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new Error(`unsupported ZIP method ${entry.method} for ${entry.name}`);
}

async function fetchStoredNestedZip(fixture) {
  const tail = await fetchBytes(fixture.outerUrl, {
    range: `bytes=-${CENTRAL_TAIL_BYTES}`,
    maxBytes: CENTRAL_TAIL_BYTES + 1024,
  });
  const entry = centralEntries(tail.bytes).find((candidate) => candidate.name === fixture.entryName);
  if (!entry) throw new Error(`fixture entry not found: ${fixture.entryName}`);
  if (entry.method !== 0) {
    throw new Error(`outer entry is compressed with method ${entry.method}; bounded extraction stopped`);
  }
  if (entry.compressedSize > MAX_DIRECT_BYTES) {
    throw new Error(`nested fixture exceeds ${MAX_DIRECT_BYTES} bytes`);
  }

  const headerEnd = entry.localOffset + 1023;
  const header = await fetchBytes(fixture.outerUrl, {
    range: `bytes=${entry.localOffset}-${headerEnd}`,
    maxBytes: 2048,
  });
  if (header.bytes.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("invalid remote local ZIP header");
  }
  const fileNameLength = header.bytes.readUInt16LE(26);
  const extraLength = header.bytes.readUInt16LE(28);
  const dataStart = entry.localOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize - 1;
  const payload = await fetchBytes(fixture.outerUrl, {
    range: `bytes=${dataStart}-${dataEnd}`,
    maxBytes: MAX_DIRECT_BYTES,
  });
  if (payload.bytes.length !== entry.compressedSize) {
    throw new Error(`remote entry size mismatch: ${payload.bytes.length} != ${entry.compressedSize}`);
  }

  return {
    bytes: payload.bytes,
    retrieval: {
      method: "HTTP range extraction of one stored inner ZIP",
      url: fixture.outerUrl,
      outerEntry: fixture.entryName,
      responseStatus: payload.status,
      bytesDownloadedForPayload: payload.bytes.length,
      centralDirectoryProbeBytes: tail.bytes.length,
      etag: tail.etag,
      lastModified: tail.lastModified,
    },
  };
}

function analyzeReplayZip(zipBytes) {
  const entries = centralEntries(zipBytes);
  const logEntry = entries.find((entry) => entry.name.toLowerCase().endsWith(".log"));
  const csvEntry = entries.find((entry) => entry.name.toLowerCase().endsWith(".csv"));
  if (!logEntry || !csvEntry) throw new Error("expected .log and .csv entries were not found");

  const logBytes = localEntryData(zipBytes, logEntry);
  const csvBytes = localEntryData(zipBytes, csvEntry);
  const logText = logBytes.toString("latin1");
  const lines = logText.split(/\r?\n/).filter(Boolean);
  const delimiter = "¦";
  const heartbeats = [];
  const messageTypes = {};
  const flagReasonMessages = new Set();
  let bryceIdentity = null;
  let trackDefinition = null;

  for (const line of lines) {
    const type = line.startsWith("$") ? line.slice(0, 2) : "other";
    messageTypes[type] = (messageTypes[type] ?? 0) + 1;
    const fields = line.split(delimiter);
    if (type === "$H") {
      heartbeats.push({ counterHex: fields[2], epochHex: fields[5] });
    }
    if ((type === "$A" || type === "$M") && line.includes("Yellow Flag at:")) {
      flagReasonMessages.add(fields.at(-1));
    }
    if (!bryceIdentity && line.includes(`${delimiter}Bryce${delimiter}Aron${delimiter}`)) {
      bryceIdentity = {
        carNumber: fields[29] ?? null,
        firstName: "Bryce",
        lastName: "Aron",
        feedDriverId: fields.at(-2) ?? null,
      };
    }
    if (!trackDefinition && type === "$U" && fields[1] === "N") {
      const labels = [];
      for (let index = 0; index < fields.length; index += 1) {
        if (/^(SF\*|SFT|I\d+[A-Z]*|RS|PIC|PI|SFP\*|PO)$/.test(fields[index])) {
          labels.push(fields[index]);
        }
      }
      trackDefinition = {
        trackName: fields[4] ?? null,
        trackType: fields[5] ?? null,
        lengthMiles: Number(fields[6]) || null,
        timingPointLabels: labels,
      };
    }
  }

  const firstHeartbeat = heartbeats.at(0);
  const lastHeartbeat = heartbeats.at(-1);
  const firstEpoch = firstHeartbeat ? Number.parseInt(firstHeartbeat.epochHex, 16) : null;
  const lastEpoch = lastHeartbeat ? Number.parseInt(lastHeartbeat.epochHex, 16) : null;
  const firstCounter = firstHeartbeat ? Number.parseInt(firstHeartbeat.counterHex, 16) : null;
  const lastCounter = lastHeartbeat ? Number.parseInt(lastHeartbeat.counterHex, 16) : null;
  const sortedTypes = Object.fromEntries(
    Object.entries(messageTypes).sort((left, right) => right[1] - left[1]),
  );
  const csvLines = csvBytes.toString("utf8").split(/\r?\n/).filter(Boolean);

  return {
    archiveEntries: entries.map(({ name, compressedSize, uncompressedSize, method }) => ({
      name,
      compressedSize,
      uncompressedSize,
      method,
    })),
    replayLog: {
      bytes: logBytes.length,
      lineCount: lines.length,
      messageTypeCounts: sortedTypes,
      heartbeatCount: heartbeats.length,
      firstHeartbeatUtc: firstEpoch === null ? null : new Date(firstEpoch * 1000).toISOString(),
      lastHeartbeatUtc: lastEpoch === null ? null : new Date(lastEpoch * 1000).toISOString(),
      heartbeatEpochSpanSeconds: firstEpoch === null ? null : lastEpoch - firstEpoch,
      heartbeatCounterSpan: firstCounter === null ? null : lastCounter - firstCounter,
      exactConsecutiveOneSecondHeartbeat:
        heartbeats.length > 1 &&
        lastEpoch - firstEpoch === heartbeats.length - 1 &&
        lastCounter - firstCounter === heartbeats.length - 1,
      bryceIdentity,
      trackDefinition,
      flagReasonMessages: [...flagReasonMessages].slice(0, 10),
    },
    derivedCsv: {
      bytes: csvBytes.length,
      rowCountExcludingHeader: Math.max(0, csvLines.length - 1),
      header: csvLines[0] ?? null,
    },
  };
}

async function probe(name) {
  const fixture = FIXTURES[name];
  let acquired;
  if (fixture.mode === "nested-range") {
    acquired = await fetchStoredNestedZip(fixture);
  } else {
    const response = await fetchBytes(fixture.url);
    acquired = {
      bytes: response.bytes,
      retrieval: {
        method: "direct HTTP GET",
        url: fixture.url,
        responseStatus: response.status,
        bytesDownloadedForPayload: response.bytes.length,
        etag: response.etag,
        lastModified: response.lastModified,
      },
    };
  }

  const digest = sha256(acquired.bytes);
  return {
    fixture: name,
    event: fixture.event,
    date: fixture.date,
    sourceClass: "publicly downloadable third-party replay archive; reuse rights unverified",
    retrieval: acquired.retrieval,
    sha256: digest,
    expectedSha256: fixture.expectedSha256,
    checksumMatchesAudit: digest === fixture.expectedSha256,
    ...analyzeReplayZip(acquired.bytes),
  };
}

const requested = process.argv[2] ?? "all";
if (["-h", "--help"].includes(requested)) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}
if (requested !== "all" && !FIXTURES[requested]) {
  process.stderr.write(`${usage()}\n`);
  process.exit(2);
}

const names = requested === "all" ? Object.keys(FIXTURES) : [requested];
const results = [];
for (const name of names) results.push(await probe(name));

process.stdout.write(
  `${JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      legalNote:
        "This is a technical access test only. Public downloadability does not establish permission to bulk acquire, decode, model, publish, or redistribute INDYCAR data.",
      results,
    },
    null,
    2,
  )}\n`,
);
