// Rebuild portfolio headlines from the included, dated generated reports.
// Does not infer live freshness or acquire source data.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sources = {};
const read = async path => {
  const bytes = await readFile(path);
  sources[path] = { sha256: createHash('sha256').update(bytes).digest('hex') };
  return JSON.parse(bytes);
};
const career = await read('data/career/reports/ingestion-summary.json');
const validation = await read('data/career/reports/validation-report.json');
const lake = await read('data/historical-data-lake/catalog/coverage-summary.json');
const timing = await read('data/historical-data-lake/catalog/timing-coverage-ledger.json');
const loops = await read('analysis/semantic-layer/output/loop-crossings-summary.json');
const quali = await read('analysis/quali-lab/output/coverage-census.json');
const classification = await read('analysis/semantic-layer/output/validation/finishing-order.json');
const sections = await read('analysis/semantic-layer/output/validation/section-time-residuals.json');
const crosswalk = await read('analysis/semantic-layer/output/crosswalk/crosswalk-validation.json');
const weather = await read('data/career/reports/indy-nxt-weather-backfill-report.json');
const result = {
  schemaVersion: 'brycecast-portfolio-evidence.v1',
  evidenceBasis: 'Recomputed from included generated reports. Underlying acquisition and full-corpus validations were not rerun by this command.',
  originalSourceCommit: '94afeda3ef4ebbaff964c833cd970360efeab32c',
  career: { generatedAt: career.generatedAt, counts: career.counts, validation: { checkedAt: validation.checkedAt, ok: validation.ok, errors: validation.errorCount, warnings: validation.warningCount, warningDetails: validation.warnings } },
  archive: { throughDate: lake.throughDate, sourceObjects: lake.acquisition.uniqueObjects, uniqueBytes: lake.acquisition.uniqueBytes, scope: 'Broader INDYCAR/INDY NXT research archive, not only Bryce career data; source objects are withheld pending redistribution clearance.', catalogEntries: lake.catalog.sessions, catalogEntryCaveat: 'Source/session candidates, not a deduplicated count of official races.' },
  timing: { asOfDate: timing.asOfDate, ...timing.counts, caveat: 'Observed coverage is not an uninterrupted 1 Hz guarantee. Qualifying counts are race links, not unique physical qualifying sessions.' },
  loopCrossings: { generatedAt: loops.generatedAt, sourceSessions: loops.sessionCount, rows: loops.crossingTotal, grain: 'One normalized timing-loop crossing record; not GPS telemetry or independent training examples.' },
  qualifyingLab: { generatedAt: quali.generatedAt, coveredPhysicalSessions: quali.covered.length, exclusions: quali.excluded.length },
  historicalWeather: { generatedAt: weather.generatedAt, source: weather.source, cutoffDate: weather.archiveCutoffDate, eligibleExactWindowSessions: weather.eligibleExactWindowSessions, joinedSessions: weather.joinedSessions, joinedBySessionType: weather.joinedBySessionType, skippedDateOnlySessions: weather.skippedDateOnlySessions, skippedFutureSessions: weather.skippedFutureSessions, caveat: 'Modeled hourly joins for eligible INDY NXT sessions, not measured weather for every career series or every race through September.' },
  storedValidation: {
    classification: { generatedAt: classification.generatedAt, races: classification.raceCount, winnersMatched: classification.winnerMatchCount, podiumsMatched: classification.podiumMatchCount, fullOrderExact: classification.fullOrderExactCount, lapCarsExact: classification.lapCarsExact, lapCarsChecked: classification.lapCarsChecked },
    sectionTiming: { generatedAt: sections.generatedAt, ...sections.summary },
    identityCrosswalk: { generatedAt: crosswalk.generatedAt, go: crosswalk.goCount, conditional: crosswalk.conditionalCount, noGo: crosswalk.noGoCount, hardFailures: crosswalk.hardFailures.length }
  },
  sources
};
const text = JSON.stringify(result, null, 2) + '\n';
if (process.argv.includes('--write')) await writeFile('docs/evidence/portfolio-stats.json', text);
else process.stdout.write(text);
