import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const dataDir = join(root, 'data/live');
const publicDataDir = join(root, 'public/data');
const jsonlPath = join(dataDir, 'onboard-catalog.jsonl');
const latestPath = join(dataDir, 'onboard-catalog.json');
const publicLatestPath = join(publicDataDir, 'onboard-catalog.json');

const platformUrl = 'https://api.staylive.tv/platforms/by-domain/www.indycarlive.com';
const feedUrl = 'https://api.staylive.tv/livestreams/feed?limit=100&page=1';
const channelTargets = [
  { key: 'onboards', fallbackId: 6368, match: /^onboards?$/i },
  { key: 'indy_nxt', fallbackId: 4173, match: /^indy nxt$/i }
];

const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const watch = process.argv.includes('--watch');
const once = process.argv.includes('--once') || !watch;
const intervalMs = Number(argValue('interval-ms', argValue('interval', '15000')));
const iterations = once ? 1 : Number(argValue('iterations', '0'));

const readJson = async (url, headers = {}) => {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      ...headers
    }
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type'),
    bytes: Buffer.byteLength(text),
    json
  };
};

const normalizeItem = (item) => ({
  id: Number(item.id),
  channelId: Number(item.channelid),
  channelName: item.channelName ?? '',
  channelPath: item.channelPath ?? '',
  name: item.name ?? '',
  start: item.start ?? '',
  end: item.end ?? '',
  status: item.status ?? '',
  private: Number(item.private ?? 0) === 1,
  seoString: item.seo_string ?? '',
  url: item.seo_string ? `https://www.indycarlive.com/video/${item.seo_string}` : '',
  thumbnail: item.thumbnail ?? ''
});

const textBlob = (item) => `${item.name} ${item.channelName} ${item.channelPath} ${item.seoString}`.toLowerCase();

const hasBryceMatch = (item) => /\bbryce\b|\baron\b/.test(textBlob(item));

const hasWeakNineMatch = (item) => {
  const text = textBlob(item);
  return /(^|[^a-z0-9])#?9([^a-z0-9]|$)|\bno\.?\s*9\b|\bcar\s*9\b/.test(text);
};

const isDriverLevel = (item) => /in-car|onboard|driver cam|camera/.test(textBlob(item));

const fetchChannelItems = async (channelId) => {
  const result = await readJson(feedUrl, { 'X-STAYLIVE-CHANNELS': String(channelId) });
  const message = Array.isArray(result.json?.message) ? result.json.message : [];
  return {
    ok: result.ok,
    status: result.status,
    bytes: result.bytes,
    items: message.map(normalizeItem)
  };
};

const probeOnce = async () => {
  const checkedAt = new Date().toISOString();
  const platform = await readJson(platformUrl);
  const channels = Array.isArray(platform.json?.message?.channels) ? platform.json.message.channels : [];
  const channelMap = Object.fromEntries(
    channelTargets.map((target) => {
      const found = channels.find((channel) => target.match.test(channel.name ?? ''));
      return [
        target.key,
        {
          id: Number(found?.id ?? target.fallbackId),
          name: found?.name ?? target.key,
          path: found?.path ?? ''
        }
      ];
    })
  );

  const feeds = {};
  for (const [key, channel] of Object.entries(channelMap)) {
    feeds[key] = await fetchChannelItems(channel.id);
  }

  const onboardItems = feeds.onboards?.items ?? [];
  const nxtItems = feeds.indy_nxt?.items ?? [];
  const strictBryceMatches = [...onboardItems, ...nxtItems].filter(hasBryceMatch);
  const weakNineMatches = [...onboardItems, ...nxtItems].filter((item) => hasWeakNineMatch(item) && !hasBryceMatch(item));
  const nxtDriverLevelItems = nxtItems.filter(isDriverLevel);
  const status =
    strictBryceMatches.length > 0
      ? 'candidate_found'
      : nxtDriverLevelItems.length > 0
        ? 'nxt_driver_level_no_bryce'
        : onboardItems.length > 0
          ? 'series_onboards_only'
          : 'no_onboard_catalog';

  const summary = {
    schemaVersion: 1,
    checkedAt,
    platform: {
      url: platformUrl,
      ok: platform.ok,
      status: platform.status,
      bytes: platform.bytes
    },
    channels: channelMap,
    status,
    passGate: strictBryceMatches.length > 0,
    note:
      strictBryceMatches.length > 0
        ? 'Official catalog includes a Bryce/Aron onboard candidate. Verify it live during the race before marking POV available.'
        : 'No Bryce/Aron live onboard catalog object found. Generic #9 matches are unsafe because the top series also has a #9 CGR entry.',
    counts: {
      onboardItems: onboardItems.length,
      indyNxtItems: nxtItems.length,
      indyNxtDriverLevelItems: nxtDriverLevelItems.length,
      strictBryceMatches: strictBryceMatches.length,
      weakNineMatches: weakNineMatches.length
    },
    strictBryceMatches,
    weakNineMatches: weakNineMatches.slice(0, 8),
    onboardSample: onboardItems.slice(0, 12),
    indyNxtSample: nxtItems.slice(0, 12),
    storage: {
      jsonl: relative(root, jsonlPath),
      latest: relative(root, latestPath),
      publicLatest: relative(root, publicLatestPath)
    }
  };

  await mkdir(dataDir, { recursive: true });
  await mkdir(publicDataDir, { recursive: true });
  await appendFile(jsonlPath, `${JSON.stringify(summary)}\n`);
  await writeFile(latestPath, JSON.stringify(summary, null, 2));
  await writeFile(publicLatestPath, JSON.stringify(summary, null, 2));

  console.log(
    JSON.stringify(
      {
        checkedAt,
        status,
        passGate: summary.passGate,
        counts: summary.counts,
        strictBryceMatches: summary.strictBryceMatches.map((item) => ({ name: item.name, status: item.status, url: item.url })),
        storage: summary.storage
      },
      null,
      2
    )
  );
};

let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
});

await probeOnce();

if (!once) {
  let count = 1;
  while (!stopped && (iterations === 0 || count < iterations)) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (!stopped) {
      await probeOnce();
      count += 1;
    }
  }
}
