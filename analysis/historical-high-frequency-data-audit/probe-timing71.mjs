#!/usr/bin/env node

import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const API = 'https://archive.timing71.org/replays';
const SAMPLE_ID = '5aa5070d-23ff-495d-887c-6f83717b2cc9';
const EXPECTED_RACE_IDS = new Set([
  'a3fdd8d2-ac20-4398-ba8b-6e78fa1c1b1a',
  'a1cfa8d9-ce92-4424-95b9-e1cec62a7bc3',
  '1522fa4d-cb20-46fa-8e97-3769480327b8',
  'd364ad8e-831f-493e-8549-30e6a05231cb',
  '323a79f6-8cba-4cd6-bbc0-e1ed1650ae64',
  'e17a3b10-889c-40d5-aba7-3c5648d13216',
  '4b5590b2-499f-424d-9898-e250a0c1a129',
  'd8efcb85-3eed-4410-b514-714b64f3eb85',
  '089a8c49-ab69-4f6e-a4e4-c01793d07075',
  SAMPLE_ID,
  '88bfc2e9-33d3-44f5-b3ca-98900e65d95e',
  'ed6dcdbd-befc-4136-95c6-e300f761f0ac',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchJson(url) {
  const response = await fetch(url, {headers: {'user-agent': 'BryceCast-Timing71-audit/1.0'}});
  assert(response.ok, `${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function fetchSeasonMetadata() {
  const filter = {
    where: {
      and: [
        {series: 'IndyCar'},
        {startTime: {gte: 1767225600}},
        {startTime: {lt: 1798761600}},
      ],
    },
    order: ['startTime ASC'],
    limit: 5000,
  };
  const url = new URL(API);
  url.searchParams.set('filter', JSON.stringify(filter));
  return fetchJson(url);
}

async function validateSample(replaysById) {
  const replay = replaysById.get(SAMPLE_ID);
  assert(replay?.filename, `sample replay ${SAMPLE_ID} has no direct filename URL`);

  const response = await fetch(encodeURI(replay.filename), {
    headers: {'user-agent': 'BryceCast-Timing71-audit/1.0'},
  });
  assert(response.ok, `${response.status} ${response.statusText}: ${replay.filename}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length === 2710311, `unexpected sample size: ${bytes.length}`);

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'brycecast-timing71-'));
  const temporaryZip = join(temporaryDirectory, 'road-america-race-2.zip');
  try {
    await writeFile(temporaryZip, bytes);
    const result = spawnSync('unzip', ['-tq', temporaryZip], {encoding: 'utf8'});
    assert(result.status === 0, result.stderr || result.stdout || 'unzip integrity test failed');
  } finally {
    await rm(temporaryDirectory, {recursive: true, force: true});
  }

  return {id: SAMPLE_ID, bytes: bytes.length, zipIntegrity: 'pass'};
}

const replays = await fetchSeasonMetadata();
assert(Array.isArray(replays), 'Timing71 response was not an array');
const replaysById = new Map(replays.map((replay) => [replay.id, replay]));
const missingRaceIds = [...EXPECTED_RACE_IDS].filter((id) => !replaysById.has(id));
assert(missingRaceIds.length === 0, `missing expected race replay IDs: ${missingRaceIds.join(', ')}`);

const nxtLabelled = replays.filter((replay) => /INDY\s*NXT/i.test(replay.description));
const output = {
  api: API,
  seasonReplayMetadataCount: replays.length,
  nxtLabelledCount: nxtLabelled.length,
  expectedRaceIdsPresent: EXPECTED_RACE_IDS.size,
  note: 'Three expected races are intentionally not NXT-labelled; see timing71-2026-coverage.json.',
};

if (process.argv.includes('--sample')) {
  output.sample = await validateSample(replaysById);
}

console.log(JSON.stringify(output, null, 2));
