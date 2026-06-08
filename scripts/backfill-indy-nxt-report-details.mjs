import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/indy-nxt');
const reportDetailsDir = join(rawDir, 'report-details');
const reportPath = join(root, 'data/career/reports/indy-nxt-report-details-backfill-report.json');
const refresh = process.argv.includes('--refresh');

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const readJsonIfExists = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const slug = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

const reportUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `http://www.imscdn.com/${String(url).replace(/^\/+/, '')}`;
};

const sourceEvidence = ({ id, sourceName, url, retrievedAt, coverage, rawArtifactPath, notes, parser = 'pdftotext -raw plus lap-header row-position inversion' }) => ({
  id,
  sourceType: 'official_pdf',
  sourceName,
  url,
  linkedUrls: [url],
  retrievedAt,
  publishedAt: null,
  accessedBy: 'scripts/backfill-indy-nxt-report-details.mjs',
  licenseNotes: 'Public official INDY NXT report PDF; store extracted facts and source URL.',
  confidenceTier: 'official',
  coverage,
  parser,
  rawArtifactPath,
  notes
});

const fetchBinaryCached = async (url, path) => {
  if (!refresh) {
    try {
      const cached = await readFile(path);
      return { buffer: cached, fromCache: true };
    } catch {
      // Fetch below.
    }
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(path, buffer);
  return { buffer, fromCache: false };
};

const classifyEmptyOfficialPdf = (buffer, text) => {
  if (String(text ?? '').trim()) return 'official_report_has_no_section_rows';
  const content = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : '';
  const startXrefMatch = content.match(/startxref\s+(\d+)/);
  const hasPdfHeader = content.includes('%PDF-');
  const startXref = startXrefMatch ? Number(startXrefMatch[1]) : null;
  if (!hasPdfHeader || (Number.isFinite(startXref) && startXref >= buffer.length)) {
    return 'official_pdf_corrupt_or_truncated';
  }
  return 'official_pdf_has_no_extractable_text';
};

const extractTextCached = async (pdfPath, textPath) => {
  if (!refresh) {
    try {
      return { text: await readFile(textPath, 'utf8'), fromCache: true };
    } catch {
      // Extract below.
    }
  }

  await execFileAsync('pdftotext', ['-raw', pdfPath, textPath], { maxBuffer: 16 * 1024 * 1024 });
  return { text: await readFile(textPath, 'utf8'), fromCache: false };
};

const extractLayoutTextCached = async (pdfPath, textPath) => {
  if (!refresh) {
    try {
      return { text: await readFile(textPath, 'utf8'), fromCache: true };
    } catch {
      // Extract below.
    }
  }

  await execFileAsync('pdftotext', ['-layout', pdfPath, textPath], { maxBuffer: 32 * 1024 * 1024 });
  return { text: await readFile(textPath, 'utf8'), fromCache: false };
};

const extractXmlCached = async (pdfPath, xmlPath) => {
  if (!refresh) {
    try {
      return { text: await readFile(xmlPath, 'utf8'), fromCache: true };
    } catch {
      // Extract below.
    }
  }

  const { stdout } = await execFileAsync('pdftohtml', ['-i', '-xml', '-stdout', pdfPath], { maxBuffer: 32 * 1024 * 1024 });
  await writeFile(xmlPath, stdout);
  return { text: stdout, fromCache: false };
};

const parseLapChartText = (text) => {
  const rows = [];
  let currentLapNumbers = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    const headerMatch = line.match(/Lap->\s+(.+)$/);
    if (headerMatch) {
      currentLapNumbers = (headerMatch[1].match(/\d+/g) ?? []).map((value) => Number(value));
      continue;
    }

    const match = line.match(/^(\d+)\s+-\s+(.+?)\s+\((\d+)\)\s+(\d+)\s+(.+)$/);
    if (!match) continue;

    const [, labelCarNumber, driverName, parentheticalPosition, position, cellsRaw] = match;
    const cells = cellsRaw
      .trim()
      .split(/\s+/)
      .filter((token) => /^\d+$/.test(token));
    if (!cells.length) continue;
    rows.push({
      labelCarNumber,
      driverName,
      parentheticalPosition: Number(parentheticalPosition),
      position: Number(position),
      lapNumbers: currentLapNumbers.slice(0, cells.length),
      leadingLapOneCarNumber: currentLapNumbers[0] === 2 ? labelCarNumber : null,
      cells
    });
  }

  const samples = [];
  for (const row of rows) {
    if (row.leadingLapOneCarNumber) {
      samples.push({
        carNumber: row.leadingLapOneCarNumber,
        lapNumber: 1,
        position: row.position
      });
    }
    for (const [index, carNumber] of row.cells.entries()) {
      samples.push({
        carNumber,
        lapNumber: row.lapNumbers[index] ?? index + 1,
        position: row.position
      });
    }
  }

  return { rows, samples };
};

const decodeXmlText = (value) =>
  String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();

const xmlAttribute = (attributes, name) => {
  const match = String(attributes ?? '').match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : null;
};

const nearestColumnIndex = (columns, left) => {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const [index, column] of columns.entries()) {
    const distance = Math.abs(column.left - left);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
};

const parseLapChartXml = (xml) => {
  const rows = [];
  const samples = [];
  const pageMatches = String(xml ?? '').matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g);
  for (const pageMatch of pageMatches) {
    const [, pageAttributes, pageBody] = pageMatch;
    const pageNumber = Number(xmlAttribute(pageAttributes, 'number') ?? 0);
    const elements = [];
    for (const textMatch of pageBody.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      const [, attributes, rawText] = textMatch;
      const text = decodeXmlText(rawText);
      if (!text) continue;
      const top = Number(xmlAttribute(attributes, 'top'));
      const left = Number(xmlAttribute(attributes, 'left'));
      const width = Number(xmlAttribute(attributes, 'width'));
      if (!Number.isFinite(top) || !Number.isFinite(left)) continue;
      elements.push({ pageNumber, top, left, width: Number.isFinite(width) ? width : null, text });
    }

    const header = elements.find((element) => /Lap->/.test(element.text));
    if (!header) continue;
    const headerTop = header.top + 1;
    const columns = elements
      .filter((element) => element.left >= 300 && Math.abs(element.top - headerTop) <= 4 && /^\d+$/.test(element.text))
      .map((element) => ({ lapNumber: Number(element.text), left: element.left }))
      .filter((column) => Number.isFinite(column.lapNumber))
      .sort((a, b) => a.left - b.left);
    if (!columns.length) continue;

    const rowLabels = elements
      .filter((element) => element.left < 260 && /^\d+\s+-\s+.+\(\d+\)$/.test(element.text))
      .sort((a, b) => a.top - b.top || a.left - b.left);
    for (const label of rowLabels) {
      const rowElements = elements.filter((element) => Math.abs(element.top - label.top) <= 2);
      const positionElement = rowElements
        .filter((element) => element.left >= 260 && element.left < 300 && /^\d+$/.test(element.text))
        .sort((a, b) => a.left - b.left)[0];
      if (!positionElement) continue;

      const labelMatch = label.text.match(/^(\d+)\s+-\s+(.+?)\s+\((\d+)\)$/);
      const row = {
        labelCarNumber: labelMatch?.[1] ?? null,
        driverName: labelMatch?.[2]?.trim() ?? null,
        parentheticalPosition: labelMatch?.[3] ? Number(labelMatch[3]) : null,
        position: Number(positionElement.text),
        pageNumber,
        leadingLapOneCarNumber: columns[0]?.lapNumber === 2 ? labelMatch?.[1] ?? null : null,
        cells: []
      };
      if (row.leadingLapOneCarNumber) {
        samples.push({
          carNumber: row.leadingLapOneCarNumber,
          lapNumber: 1,
          position: row.position
        });
      }

      const dataElements = rowElements
        .filter((element) => element.left >= 300 && /^[\d\s]+$/.test(element.text))
        .sort((a, b) => a.left - b.left);
      for (const dataElement of dataElements) {
        const tokens = dataElement.text.match(/\d+/g) ?? [];
        if (!tokens.length) continue;
        const startIndex = nearestColumnIndex(columns, dataElement.left);
        for (const [offset, carNumber] of tokens.entries()) {
          const column = columns[startIndex + offset];
          if (!column) continue;
          row.cells.push({ carNumber, lapNumber: column.lapNumber });
          samples.push({
            carNumber,
            lapNumber: column.lapNumber,
            position: row.position
          });
        }
      }

      if (row.cells.length) rows.push(row);
    }
  }

  return { rows, samples };
};

const validateLapChartParsed = ({ parsed, canonicalSessionId, expectedByCar, url }) => {
  if (!parsed.rows.length || !parsed.samples.length) {
    return { ok: false, failure: { sessionId: canonicalSessionId, reason: 'no_lap_chart_rows_parsed', url } };
  }

  const parsedByCar = new Map();
  const duplicateSampleKeys = new Set();
  const sampleKeys = new Set();
  const carsMissingResultRows = new Set();
  for (const sample of parsed.samples) {
    const sampleKey = `${sample.carNumber}|${sample.lapNumber}`;
    if (sampleKeys.has(sampleKey)) duplicateSampleKeys.add(sampleKey);
    sampleKeys.add(sampleKey);
    parsedByCar.set(sample.carNumber, (parsedByCar.get(sample.carNumber) ?? 0) + 1);
    if (!expectedByCar.has(sample.carNumber)) carsMissingResultRows.add(sample.carNumber);
  }
  if (duplicateSampleKeys.size) {
    return {
      ok: false,
      failure: {
        sessionId: canonicalSessionId,
        reason: 'duplicate_car_lap_samples_in_parsed_pdf_text',
        duplicateSampleKeys: [...duplicateSampleKeys].slice(0, 25),
        duplicateSampleKeyCount: duplicateSampleKeys.size,
        url
      }
    };
  }

  if (carsMissingResultRows.size) {
    return {
      ok: false,
      failure: {
        sessionId: canonicalSessionId,
        reason: 'sample_cars_missing_result_rows',
        carNumbers: [...carsMissingResultRows].sort((a, b) => Number(a) - Number(b)),
        url
      }
    };
  }

  const mismatches = [...expectedByCar]
    .filter(([, lapsCompleted]) => lapsCompleted > 0)
    .filter(([carNumber, lapsCompleted]) => (parsedByCar.get(carNumber) ?? 0) !== lapsCompleted)
    .map(([carNumber, lapsCompleted]) => ({ carNumber, expected: lapsCompleted, parsed: parsedByCar.get(carNumber) ?? 0 }));
  if (mismatches.length) {
    return { ok: false, failure: { sessionId: canonicalSessionId, reason: 'parsed_lap_counts_do_not_match_official_results', mismatches, url } };
  }

  return { ok: true };
};

const validateLapChartPartial = ({ parsed, canonicalSessionId, expectedByCar, resultMetaByCar = new Map(), url }) => {
  if (!parsed.rows.length || !parsed.samples.length) {
    return { ok: false, failure: { sessionId: canonicalSessionId, reason: 'no_lap_chart_rows_parsed', url } };
  }

  const parsedByCar = new Map();
  const duplicateSampleKeys = new Set();
  const sampleKeys = new Set();
  const carsMissingResultRows = new Set();
  const samplesMissingLapNumber = [];
  for (const sample of parsed.samples) {
    if (!Number.isFinite(Number(sample.lapNumber))) {
      samplesMissingLapNumber.push({ carNumber: sample.carNumber, position: sample.position });
      continue;
    }
    const sampleKey = `${sample.carNumber}|${sample.lapNumber}`;
    if (sampleKeys.has(sampleKey)) duplicateSampleKeys.add(sampleKey);
    sampleKeys.add(sampleKey);
    parsedByCar.set(sample.carNumber, (parsedByCar.get(sample.carNumber) ?? 0) + 1);
    if (!expectedByCar.has(sample.carNumber)) carsMissingResultRows.add(sample.carNumber);
  }
  if (samplesMissingLapNumber.length) {
    return {
      ok: false,
      failure: {
        sessionId: canonicalSessionId,
        reason: 'parsed_samples_missing_lap_number',
        samples: samplesMissingLapNumber.slice(0, 25),
        sampleCount: samplesMissingLapNumber.length,
        url
      }
    };
  }
  if (duplicateSampleKeys.size) {
    return {
      ok: false,
      failure: {
        sessionId: canonicalSessionId,
        reason: 'duplicate_car_lap_samples_in_parsed_pdf_text',
        duplicateSampleKeys: [...duplicateSampleKeys].slice(0, 25),
        duplicateSampleKeyCount: duplicateSampleKeys.size,
        url
      }
    };
  }

  if (carsMissingResultRows.size) {
    return {
      ok: false,
      failure: {
        sessionId: canonicalSessionId,
        reason: 'sample_cars_missing_result_rows',
        carNumbers: [...carsMissingResultRows].sort((a, b) => Number(a) - Number(b)),
        url
      }
    };
  }

  const overages = [...parsedByCar]
    .map(([carNumber, parsedCount]) => ({
      carNumber,
      expected: expectedByCar.get(carNumber) ?? 0,
      parsed: parsedCount,
      status: resultMetaByCar.get(carNumber)?.status ?? null
    }))
    .filter((row) => row.parsed > row.expected);
  const hardOverages = overages.filter((row) => row.expected > 0);
  if (hardOverages.length) {
    return {
      ok: false,
      failure: {
        sessionId: canonicalSessionId,
        reason: 'parsed_lap_counts_exceed_official_results',
        overages: hardOverages,
        url
      }
    };
  }
  const resultLapConflicts = overages
    .filter((row) => row.expected === 0)
    .map((row) => ({
      carNumber: row.carNumber,
      expected: row.expected,
      parsed: row.parsed,
      status: row.status,
      reason: 'official_result_zero_laps_with_source_visible_lap_chart_samples'
    }));

  const missingByCar = [...expectedByCar]
    .filter(([, lapsCompleted]) => lapsCompleted > 0)
    .map(([carNumber, lapsCompleted]) => ({
      carNumber,
      expected: lapsCompleted,
      parsed: parsedByCar.get(carNumber) ?? 0,
      missing: lapsCompleted - (parsedByCar.get(carNumber) ?? 0)
    }))
    .filter((row) => row.missing > 0);

  return {
    ok: true,
    complete: missingByCar.length === 0 && resultLapConflicts.length === 0,
    missingByCar,
    missingSamples: missingByCar.reduce((total, row) => total + row.missing, 0),
    resultLapConflicts
  };
};

const sampleKey = (sample) => `${sample.carNumber}|${sample.lapNumber}`;

const supplementPartialLapChart = ({ baseCandidate, candidates, canonicalSessionId, expectedByCar, resultMetaByCar, url }) => {
  const baseValidation = baseCandidate.partialValidation;
  if (!baseValidation?.ok || !baseValidation.missingSamples) {
    return { ...baseCandidate, supplementalSamples: [] };
  }

  const baseSampleKeys = new Set(baseCandidate.parsed.samples.map(sampleKey));
  const missingKeys = new Set();
  for (const row of baseValidation.missingByCar ?? []) {
    const expected = expectedByCar.get(row.carNumber) ?? 0;
    for (let lapNumber = 1; lapNumber <= expected; lapNumber += 1) {
      const key = `${row.carNumber}|${lapNumber}`;
      if (!baseSampleKeys.has(key)) missingKeys.add(key);
    }
  }
  if (!missingKeys.size) return { ...baseCandidate, supplementalSamples: [] };

  const supplementByKey = new Map();
  for (const candidate of candidates) {
    if (candidate === baseCandidate) continue;
    for (const sample of candidate.parsed.samples) {
      const key = sampleKey(sample);
      if (!missingKeys.has(key)) continue;
      if (!expectedByCar.has(sample.carNumber)) continue;
      if (!Number.isFinite(Number(sample.lapNumber))) continue;
      const existing = supplementByKey.get(key) ?? [];
      existing.push({ ...sample, supplementedFromParser: candidate.parsedWith });
      supplementByKey.set(key, existing);
    }
  }

  const supplementalSamples = [];
  for (const key of missingKeys) {
    const samples = supplementByKey.get(key) ?? [];
    const uniqueSamples = [
      ...new Map(samples.map((sample) => [`${sample.carNumber}|${sample.lapNumber}|${sample.position}`, sample])).values()
    ];
    if (uniqueSamples.length === 1) supplementalSamples.push(uniqueSamples[0]);
  }
  if (!supplementalSamples.length) return { ...baseCandidate, supplementalSamples: [] };

  const parsed = {
    rows: baseCandidate.parsed.rows,
    samples: [...baseCandidate.parsed.samples, ...supplementalSamples]
  };
  const partialValidation = validateLapChartPartial({ parsed, canonicalSessionId, expectedByCar, resultMetaByCar, url });
  if (
    !partialValidation.ok
    || partialValidation.missingSamples >= baseValidation.missingSamples
    || (partialValidation.resultLapConflicts?.length ?? 0) !== (baseValidation.resultLapConflicts?.length ?? 0)
  ) {
    return { ...baseCandidate, supplementalSamples: [] };
  }

  return {
    ...baseCandidate,
    parsed,
    parsedWith: `${baseCandidate.parsedWith} plus ${supplementalSamples.length} supplemental source-visible sample${supplementalSamples.length === 1 ? '' : 's'}`,
    partialValidation,
    supplementalSamples
  };
};

const parseEventSummaryText = (text) => {
  const normalized = String(text ?? '').replace(/\r/g, '');
  const lapStats = normalized.match(/Total Laps:\s*(\d+)\s+Green Laps:\s*(\d+)\s+Caution Laps:\s*(\d+)/i);
  const leadChanges = normalized.match(/Lead Changes:[\s\S]*?(\d+)\s+among\s+(\d+)\s+drivers/i);
  const racePasses = normalized.match(/Total Passes:\s*(\d+)\s+Position Passes:\s*(\d+)/i);
  const mostImprovedBlock = normalized.match(/Most Improved:([\s\S]*?)Race Passes:/i)?.[1] ?? '';
  const mostImproved = mostImprovedBlock.match(/(\d+)\s+-\s+([^\n]+?)\s+Improved\s+(\d+)\s+positions\s+\(Started\s+(\d+)\s*\/\s*Finished\s+(\d+)\)/i);

  const metrics = {
    totalLaps: lapStats ? Number(lapStats[1]) : null,
    greenLaps: lapStats ? Number(lapStats[2]) : null,
    cautionLaps: lapStats ? Number(lapStats[3]) : null,
    leadChanges: leadChanges ? Number(leadChanges[1]) : null,
    leadChangeDrivers: leadChanges ? Number(leadChanges[2]) : null,
    totalPasses: racePasses ? Number(racePasses[1]) : null,
    positionPasses: racePasses ? Number(racePasses[2]) : null
  };

  return {
    metrics,
    hasRaceStats: Object.values(metrics).some((value) => value !== null),
    mostImproved: mostImproved
      ? {
          carNumber: mostImproved[1],
          driverName: mostImproved[2].replace(/\s+/g, ' ').trim(),
          positionsImproved: Number(mostImproved[3]),
          started: Number(mostImproved[4]),
          finished: Number(mostImproved[5])
        }
      : null
  };
};

const parseLeaderLapSummaryText = (text) => {
  const blocks = [];
  let current = null;
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^\d+\s+\d+\s+/.test(line)) {
      if (current) blocks.push(current);
      current = line;
    } else if (/^(?:\(C\)hassis:|Page\s+|INDY NXT|Event:|Track:|Report:|Session:|Round\s+|Leader Lap Summary|\d+(?:\.\d+)?\s+mile\(s\)|[A-Za-z]+\s+\d{1,2},\s+\d{4})/i.test(line)) {
      if (current) blocks.push(current);
      current = null;
    } else if (current) {
      current = `${current} ${line}`;
    }
  }
  if (current) blocks.push(current);

  const laps = [];
  for (const block of blocks) {
    const line = block.replace(/\s+\(R\)\s+/i, ' ').replace(/\s+/g, ' ').trim();
    const match = line.match(/^(\d+)\s+(\d+)\s+(.+?)\s+([A-Z])\/\s*\/([A-Z])\s+(\d{2}:\d{2}\.\d{4})\s+([\d.]+)\s+(\d{2}:\d{2}\.\d{4})\s+([A-Za-z]+)$/);
    if (!match) continue;
    laps.push({
      lapNumber: Number(match[1]),
      carNumber: match[2],
      driverName: match[3].trim(),
      chassis: match[4],
      tire: match[5],
      lapTime: match[6],
      speedMph: Number(match[7]),
      gapToSecond: match[8],
      flagState: match[9]
    });
  }

  return { laps };
};

const parseTopSectionTimesText = (text) => {
  const sections = [];
  const chunks = String(text ?? '').split(/Rank\s+Car\s+Driver\s+C\/E\/T\s+Time\s+Speed\s+Lap/i).slice(1);
  for (const chunk of chunks) {
    const sectionMatch = chunk.match(/Section:\s+(.+?)\s+Length:\s+([\d.]+)\s+mile\(s\)/i);
    if (!sectionMatch) continue;

    const sectionName = sectionMatch[1].replace(/\s+/g, ' ').trim();
    const rowsText = chunk.slice(0, sectionMatch.index);
    const blocks = [];
    let current = null;
    for (const rawLine of rowsText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^\d+\s+\d+\s+/.test(line)) {
        if (current) blocks.push(current);
        current = line;
      } else if (current) {
        current = `${current} ${line}`;
      }
    }
    if (current) blocks.push(current);

    const rows = [];
    for (const block of blocks) {
      const normalized = block.replace(/\s+/g, ' ').trim();
      const match = normalized.match(/^(\d+)\s+(\d+)\s+(.+?)\s+([A-Z])\/\s*\/([A-Z])\s+(\d{2}:\d{2}\.\d{4})\s+([\d.]+)\s+(\d+)$/);
      if (!match) continue;
      rows.push({
        rank: Number(match[1]),
        carNumber: match[2],
        driverName: match[3].replace(/\s+\(R\)$/i, '').trim(),
        rookieFlag: /\(R\)\s*$/.test(match[3]),
        chassis: match[4],
        tire: match[5],
        time: match[6],
        speedMph: Number(match[7]),
        lapNumber: Number(match[8])
      });
    }

    if (rows.length) {
      sections.push({
        name: sectionName,
        lengthMi: Number(sectionMatch[2]),
        rows
      });
    }
  }

  return { sections };
};

const sectionColumnsFromHeader = (line) => {
  const markerIndex = line.indexOf('T/S');
  if (markerIndex < 0) return [];
  const sectionText = line.slice(markerIndex + 3).trim();
  const names = sectionText.split(/\s{2,}/).map((value) => value.trim()).filter(Boolean);
  const columns = [];
  let cursor = markerIndex + 3;
  for (const name of names) {
    const start = line.indexOf(name, cursor);
    if (start < 0) continue;
    columns.push({ name: name.replace(/\s+/g, ' '), start });
    cursor = start + name.length;
  }
  return columns;
};

const sectionIndexForToken = (columns, tokenIndex) => {
  if (!columns.length) return -1;
  for (let index = 0; index < columns.length; index += 1) {
    const previous = columns[index - 1];
    const current = columns[index];
    const next = columns[index + 1];
    const leftBoundary = previous ? Math.floor((previous.start + current.start) / 2) : Number.NEGATIVE_INFINITY;
    const rightBoundary = next ? Math.floor((current.start + next.start) / 2) : Number.POSITIVE_INFINITY;
    if (tokenIndex >= leftBoundary && tokenIndex < rightBoundary) return index;
  }
  return -1;
};

const sectionEntriesFromLine = (line, columns) => {
  const entries = new Map();
  for (const match of line.matchAll(/\d+\.\d+/g)) {
    const sectionIndex = sectionIndexForToken(columns, match.index ?? 0);
    if (sectionIndex < 0) continue;
    entries.set(columns[sectionIndex].name, Number(match[0]));
  }
  return entries;
};

const parseSectionResultsLayoutText = (text) => {
  const cars = [];
  const sectionNames = new Set();
  const pages = String(text ?? '').split('\f');

  for (const page of pages) {
    const lines = page.split(/\r?\n/);
    const carLine = lines.find((line) => /Section Data for Car\s+\d+\s+-\s+/.test(line));
    const carMatch = carLine?.match(/Section Data for Car\s+(\d+)\s+-\s+(.+?)\s*$/);
    if (!carMatch) continue;

    const headerIndex = lines.findIndex((line) => /\bLap\s+T\/S\b/.test(line));
    if (headerIndex < 0) continue;
    const columns = sectionColumnsFromHeader(lines[headerIndex]);
    if (!columns.length) continue;
    for (const column of columns) sectionNames.add(column.name);

    const driverLabel = carMatch[2].replace(/\s+/g, ' ').trim();
    const car = {
      carNumber: carMatch[1],
      driverName: driverLabel.replace(/\s+\(R\)$/i, '').trim(),
      rookieFlag: /\(R\)\s*$/i.test(driverLabel),
      laps: []
    };

    let pendingTimeEntries = null;
    let pendingLapNumber = null;
    for (const rawLine of lines.slice(headerIndex + 1)) {
      const line = rawLine.trim();
      if (!line || /^Information provided by/i.test(line)) continue;
      if (/^Section Data for Car\b/i.test(line) || /^Report Support Information\b/i.test(line)) break;

      if (/^T\s+/.test(line)) {
        pendingTimeEntries = sectionEntriesFromLine(rawLine, columns);
        pendingLapNumber = null;
        continue;
      }
      if (/^\d+$/.test(line)) {
        pendingLapNumber = Number(line);
        continue;
      }
      if (/^S\s+/.test(line) && pendingTimeEntries && Number.isFinite(pendingLapNumber)) {
        const speedEntries = sectionEntriesFromLine(rawLine, columns);
        const sectionValues = [];
        for (const column of columns) {
          const timeSeconds = pendingTimeEntries.get(column.name);
          const speedMph = speedEntries.get(column.name);
          if (timeSeconds === undefined && speedMph === undefined) continue;
          sectionValues.push({
            name: column.name,
            timeSeconds: timeSeconds ?? null,
            speedMph: speedMph ?? null
          });
        }
        if (sectionValues.length) {
          car.laps.push({
            lapNumber: pendingLapNumber,
            sections: sectionValues
          });
        }
        pendingTimeEntries = null;
        pendingLapNumber = null;
      }
    }

    if (car.laps.length) {
      car.laps.sort((a, b) => a.lapNumber - b.lapNumber);
      cars.push(car);
    }
  }

  return {
    sectionNames: [...sectionNames],
    cars
  };
};

const parsePenaltyType = (sanction) => {
  const value = String(sanction ?? '').toLowerCase();
  if (/disqual/.test(value)) return 'disqualification';
  if (/drive[- ]through/.test(value)) return 'drive_through';
  if (/stop and hold/.test(value)) return 'stop_and_hold';
  if (/stop and repair/.test(value)) return 'stop_and_repair';
  if (/back of (?:the )?field/.test(value) || /restart at the back/.test(value)) return 'back_of_field';
  if (/pending/.test(value)) return 'pending';
  if (/no further/.test(value)) return 'no_further_penalty';
  if (/yield|give up/.test(value)) return 'yield_positions';
  if (/time|second/.test(value)) return 'time_penalty';
  return 'other';
};

const parseSanctionImpact = (sanction) => {
  const value = String(sanction ?? '');
  const yieldMatch = value.match(/(?:Yield|Give Up)\s+(\d+)(?:\s+Track)?\s+Positions?/i);
  const secondsMatch = value.match(/(\d+)\s*(?:seconds?|secs?|s)\b/i);
  return {
    positionImpact: yieldMatch ? -Number(yieldMatch[1]) : null,
    timeImpactSeconds: secondsMatch ? Number(secondsMatch[1]) : null
  };
};

const extractBlocksBetween = (lines, startPattern, endPattern) => {
  const startIndex = lines.findIndex((line) => startPattern.test(line));
  if (startIndex < 0) return [];
  const endIndex = lines.findIndex((line, index) => index > startIndex && endPattern.test(line));
  return lines.slice(startIndex + 1, endIndex >= 0 ? endIndex : lines.length);
};

const parsePenaltySummaryText = (text) => {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const penaltyLines = extractBlocksBetween(lines, /^Car\s+Reason\s+Lap\s+Penalty$/i, /^Penalty Summary$/i);
  const blocks = [];
  let current = null;
  const sanctionPattern = /(Disqualification|Drive-Through|Stop and Repair|Stop and Hold(?:\s+for)?\s+\d+\s+Sec(?:onds?)?|Stop and Hold\s+\d+\s+seconds?|Stop and Hold(?:\s*\(\s*\d+\s+secs?\s*\))?|PENALTY\s*-\s*Stop and Hold(?:\s+Penalty)?\s*\(\s*\d+\s*s\s*\)|Yield(?:\s+\d+)?(?:\s+Track)?\s+Positions?(?:\s*\(\d+\))?|PENALTY\s*-\s*Give Up\s+\d+\s+Track\s+Positions?|Back of the Field|Restart at the Back of Field|No Further(?:\s+Penalty)?|Penalty Pending|Pending|\d+\s+second(?:s)?(?:\s+penalty)?|Time Penalty)$/i;
  const currentHasSanction = () => Boolean(current && sanctionPattern.test(current.replace(/\s+/g, ' ').trim()));
  for (const line of penaltyLines) {
    if (/^\d+\s+/.test(line) && (!current || currentHasSanction())) {
      if (current) blocks.push(current);
      current = line;
    } else if (current) {
      current = `${current} ${line}`;
    }
  }
  if (current) blocks.push(current);

  return blocks.flatMap((block) => {
    const normalized = block.replace(/\s+/g, ' ').trim();
    const sanctionMatch = normalized.match(sanctionPattern);
    if (!sanctionMatch) return [];
    const beforeSanction = normalized.slice(0, sanctionMatch.index).trim();
    const rowMatch = beforeSanction.match(/^(\d+)\s+(.+)\s+(\d+)$/);
    if (!rowMatch) return [];
    const sanction = sanctionMatch[1].replace(/\s+/g, ' ').trim();
    const impact = parseSanctionImpact(sanction);
    return [{
      carNumber: rowMatch[1],
      reason: rowMatch[2].replace(/\s+/g, ' ').trim(),
      lapNumber: Number(rowMatch[3]),
      sanction,
      penaltyType: parsePenaltyType(sanction),
      ...impact
    }];
  });
};

const parseCautionSummaryText = (text) => {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const startIndex = lines.findIndex((line) => /^Caution Summary$/i.test(line));
  if (startIndex < 0) return [];
  const endIndex = lines.findIndex((line, index) => index > startIndex && /Information provided by Indy Racing Information System/i.test(line));
  const cautionLines = lines
    .slice(startIndex + 1, endIndex >= 0 ? endIndex : lines.length)
    .filter((line) => !/^No\s+Duration\s+Total\s+Reason for Caution$/i.test(line));

  const blocks = [];
  let current = null;
  for (const line of cautionLines) {
    if (/^\d+\s+\d+\s+to\s+\d+\s+\d+\s+/.test(line)) {
      if (current) blocks.push(current);
      current = line;
    } else if (current) {
      current = `${current} ${line}`;
    }
  }
  if (current) blocks.push(current);

  return blocks.flatMap((block) => {
    const normalized = block.replace(/\s+/g, ' ').trim();
    const match = normalized.match(/^(\d+)\s+(\d+)\s+to\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) return [];
    const reason = match[5].trim();
    const lowerReason = reason.toLowerCase();
    const mentionedCars = Array.from(
      new Set(
        [...reason.matchAll(/\bCars?\s+([\d,\sand]+)\b/gi)].flatMap((carMatch) => carMatch[1].match(/\d+/g) ?? [])
      )
    );
    return [{
      cautionNumber: Number(match[1]),
      startLap: Number(match[2]),
      endLap: Number(match[3]),
      totalLaps: Number(match[4]),
      reason,
      incidentType: lowerReason.includes('contact')
        ? 'caution_contact'
        : lowerReason.includes('debris')
          ? 'caution_debris'
          : lowerReason.includes('off course')
            ? 'caution_off_course'
            : 'caution',
      mentionedCars
    }];
  });
};

const main = async () => {
  await mkdir(reportDetailsDir, { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });

  const dataset = await readJson(datasetPath);
  const retrievedAt = new Date().toISOString();
  const sourceEvidenceMap = new Map(
    asArray(dataset.sourceEvidence)
      .filter((row) => !/^source_indy_nxt_\d{4}_\d+_(?:lap_chart|event_summary|leader_lap_summary|top_section_times|section_results)_pdf$/.test(String(row.id ?? '')))
      .map((row) => [row.id, row])
  );
  const sessionById = new Map(asArray(dataset.sessions).map((row) => [row.id, row]));

  const detailFiles = (await readdir(rawDir)).filter((file) => /^\d{4}-events-session-\d+\.json$/.test(file)).sort();
  const report = {
    generatedAt: retrievedAt,
    lapChartsDiscovered: 0,
    lapChartsParsed: 0,
    lapChartsFullyParsed: 0,
    lapChartsPartiallyParsed: 0,
    lapSamplesImported: 0,
    partialLapSamplesImported: 0,
    bryceLapSamplesImported: 0,
    eventSummariesDiscovered: 0,
    eventSummariesParsed: 0,
    eventSummaryMetricsImported: 0,
    mostImprovedEventsImported: 0,
    leaderLapSummariesDiscovered: 0,
    leaderLapSummariesParsed: 0,
    leaderLapSummaryMetricsImported: 0,
    topSectionReportsDiscovered: 0,
    topSectionReportsParsed: 0,
    topSectionMetricsImported: 0,
    sectionResultsReportsDiscovered: 0,
    sectionResultsReportsParsed: 0,
    sectionResultsMetricsImported: 0,
    resultsReportsDiscovered: 0,
    resultsReportsParsed: 0,
    officialPenaltiesImported: 0,
    officialCautionIncidentsImported: 0,
    pdfsFetched: 0,
    pdfsCached: 0,
    textExtracted: 0,
    textCached: 0,
    xmlExtracted: 0,
    xmlCached: 0,
    partialLapChartImports: [],
    parserFailures: [],
    eventSummaryFailures: [],
    leaderLapSummaryFailures: [],
    topSectionFailures: [],
    topSectionReportsHeldOut: [],
    topSectionUnmappedRows: [],
    sectionResultsFailures: [],
    sectionResultsReportsHeldOut: [],
    sectionResultsUnmappedCars: [],
    resultsReportFailures: [],
    skipped: []
  };

  const nextLapSamples = asArray(dataset.lapSamples).filter((row) => !String(row.id ?? '').startsWith('lap_indy_nxt_'));
  const nextDerivedMetrics = asArray(dataset.derivedMetrics).filter((row) => !/^metric_indy_nxt_\d{4}_\d+_(?:event_summary_race_stats|leader_lap_summary|top_section_times|section_results)$/.test(String(row.id ?? '')));
  const nextRacecraftEvents = asArray(dataset.racecraftEvents).filter((row) => !/^racecraft_indy_nxt_\d{4}_\d+_most_improved_/.test(String(row.id ?? '')));
  const nextPenalties = asArray(dataset.penalties).filter((row) => !/^penalty_indy_nxt_\d{4}_\d+_/.test(String(row.id ?? '')));
  const nextIncidents = asArray(dataset.incidents).filter((row) => !/^incident_indy_nxt_caution_/.test(String(row.id ?? '')));
  const nextResults = asArray(dataset.results).map((row) => ({
    ...row,
    penaltyRefs: asArray(row.penaltyRefs).filter((ref) => !/^penalty_indy_nxt_\d{4}_\d+_/.test(String(ref))),
    incidentRefs: asArray(row.incidentRefs).filter((ref) => !/^incident_indy_nxt_caution_/.test(String(ref)))
  }));
  const resultBySessionCar = new Map();
  for (const result of nextResults) {
    if (result.sessionId?.startsWith('session_indy_nxt_') && result.carNumber) {
      resultBySessionCar.set(`${result.sessionId}|${result.carNumber}`, result);
    }
  }
  const timingEntryBySessionCar = new Map(resultBySessionCar);
  for (const qualifyingResult of asArray(dataset.qualifyingResults)) {
    const carNumber = qualifyingResult.carNumber ?? qualifyingResult.raw?.carNumber;
    if (qualifyingResult.sessionId?.startsWith('session_indy_nxt_') && carNumber) {
      timingEntryBySessionCar.set(`${qualifyingResult.sessionId}|${carNumber}`, {
        ...qualifyingResult,
        carNumber
      });
    }
  }

  for (const file of detailFiles) {
    const year = file.slice(0, 4);
    const sessionIdRaw = file.match(/events-session-(\d+)\.json$/)?.[1];
    const details = await readJson(join(rawDir, file));
    if (!sessionIdRaw) continue;

    const canonicalSessionId = `session_indy_nxt_${year}_${sessionIdRaw}`;
    const session = sessionById.get(canonicalSessionId);
    const lapChartReport = asArray(details.SessionReports).find((row) =>
      /lap chart/i.test(`${row.DocumentType ?? ''} ${row.Name ?? ''}`)
    );

    if (lapChartReport) {
      report.lapChartsDiscovered += 1;
      if (!session) {
        report.skipped.push({ sessionId: canonicalSessionId, reason: 'canonical_session_missing' });
      } else {

        const url = reportUrl(lapChartReport.Url);
        if (!url) {
          report.skipped.push({ sessionId: canonicalSessionId, reason: 'lap_chart_url_missing' });
        } else {

          const pdfName = `${year}-${sessionIdRaw}-${slug(lapChartReport.Name ?? lapChartReport.DocumentType ?? 'lap-chart')}${extname(url) || '.pdf'}`;
          const pdfPath = join(reportDetailsDir, pdfName);
          const textPath = join(reportDetailsDir, `${basename(pdfName, extname(pdfName))}.raw.txt`);
          try {
            const pdfResult = await fetchBinaryCached(url, pdfPath);
            report[pdfResult.fromCache ? 'pdfsCached' : 'pdfsFetched'] += 1;
            const textResult = await extractTextCached(pdfPath, textPath);
            report[textResult.fromCache ? 'textCached' : 'textExtracted'] += 1;

            const expectedByCar = new Map(
              asArray(dataset.results)
                .filter((row) => row.sessionId === canonicalSessionId && row.carNumber)
                .map((row) => [String(row.carNumber), Number(row.lapsCompleted ?? 0)])
            );
            const resultMetaByCar = new Map(
              asArray(dataset.results)
                .filter((row) => row.sessionId === canonicalSessionId && row.carNumber)
                .map((row) => [String(row.carNumber), { status: row.status ?? null, resultId: row.id, driverId: row.driverId }])
            );
            const candidates = [];
            let parsed = parseLapChartText(textResult.text);
            let parsedWith = 'pdftotext -raw plus lap-header row-position inversion';
            let validation = validateLapChartParsed({ parsed, canonicalSessionId, expectedByCar, url });
            candidates.push({ parsed, parsedWith, validation, extractedArtifactPath: textPath });
            let xmlPath = null;
            if (!validation.ok) {
              xmlPath = join(reportDetailsDir, `${basename(pdfName, extname(pdfName))}.xml`);
              const xmlResult = await extractXmlCached(pdfPath, xmlPath);
              report[xmlResult.fromCache ? 'xmlCached' : 'xmlExtracted'] += 1;
              const xmlParsed = parseLapChartXml(xmlResult.text);
              const xmlValidation = validateLapChartParsed({ parsed: xmlParsed, canonicalSessionId, expectedByCar, url });
              candidates.push({
                parsed: xmlParsed,
                parsedWith: 'pdftohtml -xml coordinate lap-column parser',
                validation: xmlValidation,
                extractedArtifactPath: xmlPath
              });
              if (xmlValidation.ok) {
                parsed = xmlParsed;
                parsedWith = 'pdftohtml -xml coordinate lap-column parser';
                validation = xmlValidation;
              } else {
                validation = {
                  ok: false,
                  failure: {
                    ...xmlValidation.failure,
                    rawTextParserFailure: validation.failure
                  }
                };
              }
            }

            let partialValidation = null;
            let isPartialImport = false;
            let extractedArtifactPath = parsedWith.includes('pdftohtml')
              ? (xmlPath ?? textPath)
              : textPath;
            if (!validation.ok) {
              const partialCandidates = candidates
                .map((candidate) => ({
                  ...candidate,
                  partialValidation: validateLapChartPartial({ parsed: candidate.parsed, canonicalSessionId, expectedByCar, resultMetaByCar, url })
                }))
                .filter((candidate) => candidate.partialValidation.ok && !candidate.partialValidation.complete)
                .sort((a, b) => b.parsed.samples.length - a.parsed.samples.length);

	              const partialCandidate = partialCandidates[0] ?? null;
	              if (partialCandidate) {
	                const supplementedCandidate = supplementPartialLapChart({
	                  baseCandidate: partialCandidate,
	                  candidates,
	                  canonicalSessionId,
	                  expectedByCar,
	                  resultMetaByCar,
	                  url
	                });
	                parsed = supplementedCandidate.parsed;
	                parsedWith = `${supplementedCandidate.parsedWith} partial visible-sample import`;
	                partialValidation = supplementedCandidate.partialValidation;
	                validation = { ok: true };
	                isPartialImport = true;
	                extractedArtifactPath = partialCandidate.extractedArtifactPath;
	                partialCandidate.supplementalSamples = supplementedCandidate.supplementalSamples ?? [];
	              } else {
                const partialFailure = candidates
                  .map((candidate) => validateLapChartPartial({ parsed: candidate.parsed, canonicalSessionId, expectedByCar, resultMetaByCar, url }).failure)
                  .find((failure) => failure?.reason === 'parsed_lap_counts_exceed_official_results')
                  ?? validation.failure;
                report.parserFailures.push(partialFailure);
              }
            }

            if (!validation.ok) {
              // Failure is already recorded above after checking whether a partial import is safe.
            } else {
              const evidenceId = `source_indy_nxt_${year}_${sessionIdRaw}_lap_chart_pdf`;
              sourceEvidenceMap.set(
                evidenceId,
                sourceEvidence({
                  id: evidenceId,
                  sourceName: `INDY NXT ${year} session ${sessionIdRaw} Race Lap Chart PDF`,
                  url,
                  retrievedAt,
                  coverage: `${details.EventName ?? 'INDY NXT event'} ${details.SessionName ?? 'Race'} official lap-by-lap position chart.`,
                  rawArtifactPath: pdfPath.replace(`${root}/`, ''),
                  parser: parsedWith,
                  notes: isPartialImport
                    ? `Partial import: parsed ${parsed.samples.length} source-visible car-lap position samples from ${parsed.rows.length} chart rows while withholding ${partialValidation?.missingSamples ?? 0} missing car-lap samples that were not visible in the selected parser output and preserving ${partialValidation?.resultLapConflicts?.length ?? 0} official result/chart lap-count conflicts. Extracted artifact: ${extractedArtifactPath.replace(`${root}/`, '')}.`
                    : `Parsed ${parsed.samples.length} car-lap position samples from ${parsed.rows.length} chart rows. Extracted artifact: ${extractedArtifactPath.replace(`${root}/`, '')}.`
                })
              );

              for (const sample of parsed.samples) {
                const result = resultBySessionCar.get(`${canonicalSessionId}|${sample.carNumber}`);
                const resultLapConflict = partialValidation?.resultLapConflicts?.find((row) => row.carNumber === sample.carNumber) ?? null;
                nextLapSamples.push({
                  id: `lap_indy_nxt_${year}_${sessionIdRaw}_${sample.carNumber}_${String(sample.lapNumber).padStart(3, '0')}`,
                  sessionId: canonicalSessionId,
                  driverId: result.driverId,
                  carId: result.carId ?? null,
                  carNumber: sample.carNumber,
                  lapNumber: sample.lapNumber,
                  lapTime: null,
                  position: sample.position,
                  gapToLeader: null,
                  gapToAhead: null,
                  sector1: null,
                  sector2: null,
                  sector3: null,
                  speedTrap: null,
                  flagState: null,
                  pitIn: null,
                  pitOut: null,
                  tireAge: null,
                  sourceTimestamp: null,
                  class: result.class ?? 'INDY NXT',
                  averageSpeedKph: null,
                  sessionElapsed: null,
                  isValid: true,
                  isSessionBest: false,
                  isPersonalBest: false,
                  raw: {
                    source: 'INDY NXT Race Lap Chart PDF',
                    chartCompleteness: isPartialImport ? 'partial_visible_laps_only' : 'complete_validated_against_result_lap_counts',
                    officialResultLapConflict: Boolean(resultLapConflict),
                    officialResultLaps: resultLapConflict ? resultLapConflict.expected : null,
                    officialResultStatus: resultLapConflict ? resultLapConflict.status : null,
	                    chartSamplesForCar: resultLapConflict ? resultLapConflict.parsed : null,
	                    eventName: details.EventName ?? null,
	                    sessionName: details.SessionName ?? null,
	                    sourceDocumentId: lapChartReport.DocumentID ?? null,
	                    sourceDocumentType: lapChartReport.DocumentType ?? lapChartReport.Name ?? null,
	                    ...(sample.supplementedFromParser ? { supplementedFromParser: sample.supplementedFromParser } : {})
	                  },
                  provenanceRefs: [evidenceId]
                });
                report.lapSamplesImported += 1;
                if (isPartialImport) report.partialLapSamplesImported += 1;
                if (result.driverId === 'driver_bryce_aron') report.bryceLapSamplesImported += 1;
              }
              report.lapChartsParsed += 1;
              if (isPartialImport) {
                report.lapChartsPartiallyParsed += 1;
                report.partialLapChartImports.push({
                  sessionId: canonicalSessionId,
                  parser: parsedWith,
	                  samplesImported: parsed.samples.length,
	                  supplementalSamplesImported: parsed.samples.filter((sample) => sample.supplementedFromParser).length,
	                  missingSamples: partialValidation?.missingSamples ?? 0,
                  missingByCar: partialValidation?.missingByCar ?? [],
                  resultLapConflicts: partialValidation?.resultLapConflicts ?? [],
                  url
                });
              } else {
                report.lapChartsFullyParsed += 1;
              }
            }
          } catch (error) {
            report.parserFailures.push({ sessionId: canonicalSessionId, reason: 'fetch_or_parse_error', message: error.message, url });
          }
        }
      }
    }

    const eventSummaryReport = asArray(details.SessionReports).find((row) =>
      /event summary/i.test(`${row.DocumentType ?? ''} ${row.Name ?? ''}`)
    );
    if (eventSummaryReport) {
      report.eventSummariesDiscovered += 1;
      if (!session) {
        report.skipped.push({ sessionId: canonicalSessionId, reason: 'canonical_session_missing_for_event_summary' });
      } else {
        const url = reportUrl(eventSummaryReport.Url);
        if (!url) {
          report.skipped.push({ sessionId: canonicalSessionId, reason: 'event_summary_url_missing' });
        } else {
          const pdfName = `${year}-${sessionIdRaw}-${slug(eventSummaryReport.Name ?? eventSummaryReport.DocumentType ?? 'event-summary')}${extname(url) || '.pdf'}`;
          const pdfPath = join(reportDetailsDir, pdfName);
          const textPath = join(reportDetailsDir, `${basename(pdfName, extname(pdfName))}.raw.txt`);
          try {
            const pdfResult = await fetchBinaryCached(url, pdfPath);
            report[pdfResult.fromCache ? 'pdfsCached' : 'pdfsFetched'] += 1;
            const textResult = await extractTextCached(pdfPath, textPath);
            report[textResult.fromCache ? 'textCached' : 'textExtracted'] += 1;

            const parsed = parseEventSummaryText(textResult.text);
            if (!parsed.hasRaceStats) {
              report.eventSummaryFailures.push({ sessionId: canonicalSessionId, reason: 'race_stats_not_parsed', url });
            } else {
              const evidenceId = `source_indy_nxt_${year}_${sessionIdRaw}_event_summary_pdf`;
              sourceEvidenceMap.set(
                evidenceId,
                sourceEvidence({
                  id: evidenceId,
                  sourceName: `INDY NXT ${year} session ${sessionIdRaw} Event Summary PDF`,
                  url,
                  retrievedAt,
                  coverage: `${details.EventName ?? 'INDY NXT event'} ${details.SessionName ?? 'Race'} official race summary, pass counts, lap stats, and most-improved note.`,
                  rawArtifactPath: pdfPath.replace(`${root}/`, ''),
                  parser: 'pdftotext -raw plus anchored Event Summary race-stat extraction',
                  notes: `Parsed official race summary metrics from text artifact ${textPath.replace(`${root}/`, '')}.`
                })
              );

              nextDerivedMetrics.push({
                id: `metric_indy_nxt_${year}_${sessionIdRaw}_event_summary_race_stats`,
                scope: 'session',
                metricType: 'official_event_summary_race_stats',
                sessionId: canonicalSessionId,
                eventId: session.eventId,
                seriesId: session.seriesId ?? 'series_indy_nxt',
                driverId: null,
                calculationVersion: 'official_pdf_direct_extract_v1',
                formula: 'Direct extraction from official INDY NXT Event Summary PDF race-stat fields; no derived calculation.',
                inputRefs: [evidenceId],
                metrics: parsed.metrics,
                confidence: 'official',
                raw: {
                  source: 'INDY NXT Event Summary PDF',
                  eventName: details.EventName ?? null,
                  sessionName: details.SessionName ?? null,
                  sourceDocumentId: eventSummaryReport.DocumentID ?? null,
                  sourceDocumentType: eventSummaryReport.DocumentType ?? eventSummaryReport.Name ?? null
                },
                provenanceRefs: [evidenceId]
              });
              report.eventSummaryMetricsImported += 1;

              if (parsed.mostImproved) {
                const result = resultBySessionCar.get(`${canonicalSessionId}|${parsed.mostImproved.carNumber}`);
                if (!result) {
                  report.eventSummaryFailures.push({
                    sessionId: canonicalSessionId,
                    reason: 'most_improved_car_missing_result_row',
                    carNumber: parsed.mostImproved.carNumber,
                    driverName: parsed.mostImproved.driverName,
                    url
                  });
                } else {
                  nextRacecraftEvents.push({
                    id: `racecraft_indy_nxt_${year}_${sessionIdRaw}_most_improved_${result.driverId}`,
                    sessionId: canonicalSessionId,
                    driverId: result.driverId,
                    lapNumber: null,
                    eventType: parsed.mostImproved.positionsImproved >= 0 ? 'start_gain' : 'start_loss',
                    positionBefore: parsed.mostImproved.started,
                    positionAfter: parsed.mostImproved.finished,
                    otherDriverIds: [],
                    description: `${parsed.mostImproved.driverName} was listed as Most Improved in the official Event Summary, improving ${parsed.mostImproved.positionsImproved} positions from P${parsed.mostImproved.started} to P${parsed.mostImproved.finished}.`,
                    confidence: 'official',
                    raw: {
                      source: 'INDY NXT Event Summary PDF',
                      carNumber: parsed.mostImproved.carNumber,
                      driverName: parsed.mostImproved.driverName,
                      positionsImproved: parsed.mostImproved.positionsImproved,
                      sourceDocumentId: eventSummaryReport.DocumentID ?? null,
                      sourceDocumentType: eventSummaryReport.DocumentType ?? eventSummaryReport.Name ?? null
                    },
                    provenanceRefs: [evidenceId]
                  });
                  report.mostImprovedEventsImported += 1;
                }
              }
              report.eventSummariesParsed += 1;
            }
          } catch (error) {
            report.eventSummaryFailures.push({ sessionId: canonicalSessionId, reason: 'fetch_or_parse_error', message: error.message, url });
          }
        }
      }
    }

    const leaderLapSummaryReport = asArray(details.SessionReports).find((row) =>
      /leader lap summary/i.test(`${row.DocumentType ?? ''} ${row.Name ?? ''}`)
    );
    if (leaderLapSummaryReport) {
      report.leaderLapSummariesDiscovered += 1;
      if (!session) {
        report.skipped.push({ sessionId: canonicalSessionId, reason: 'canonical_session_missing_for_leader_lap_summary' });
      } else {
        const leaderLapSummaryUrl = reportUrl(leaderLapSummaryReport.Url);
        if (!leaderLapSummaryUrl) {
          report.skipped.push({ sessionId: canonicalSessionId, reason: 'leader_lap_summary_url_missing' });
        } else {
          const leaderLapSummaryPdfName = `${year}-${sessionIdRaw}-${slug(leaderLapSummaryReport.Name ?? leaderLapSummaryReport.DocumentType ?? 'leader-lap-summary')}${extname(leaderLapSummaryUrl) || '.pdf'}`;
          const leaderLapSummaryPdfPath = join(reportDetailsDir, leaderLapSummaryPdfName);
          const leaderLapSummaryTextPath = join(reportDetailsDir, `${basename(leaderLapSummaryPdfName, extname(leaderLapSummaryPdfName))}.raw.txt`);
          try {
            const pdfResult = await fetchBinaryCached(leaderLapSummaryUrl, leaderLapSummaryPdfPath);
            report[pdfResult.fromCache ? 'pdfsCached' : 'pdfsFetched'] += 1;
            const textResult = await extractTextCached(leaderLapSummaryPdfPath, leaderLapSummaryTextPath);
            report[textResult.fromCache ? 'textCached' : 'textExtracted'] += 1;

            const parsed = parseLeaderLapSummaryText(textResult.text);
            if (!parsed.laps.length) {
              report.leaderLapSummaryFailures.push({ sessionId: canonicalSessionId, reason: 'leader_lap_rows_not_parsed', url: leaderLapSummaryUrl });
            } else {
              const evidenceId = `source_indy_nxt_${year}_${sessionIdRaw}_leader_lap_summary_pdf`;
              sourceEvidenceMap.set(
                evidenceId,
                sourceEvidence({
                  id: evidenceId,
                  sourceName: `INDY NXT ${year} session ${sessionIdRaw} Leader Lap Summary PDF`,
                  url: leaderLapSummaryUrl,
                  retrievedAt,
                  coverage: `${details.EventName ?? 'INDY NXT event'} ${details.SessionName ?? 'Race'} official leader-by-lap timing, margin, and flag-state summary.`,
                  rawArtifactPath: leaderLapSummaryPdfPath.replace(`${root}/`, ''),
                  parser: 'pdftotext -raw plus anchored Leader Lap Summary row extraction',
                  notes: `Parsed ${parsed.laps.length} official leader-lap rows from text artifact ${leaderLapSummaryTextPath.replace(`${root}/`, '')}.`
                })
              );

              const mappedLaps = parsed.laps.map((lap) => {
                const result = resultBySessionCar.get(`${canonicalSessionId}|${lap.carNumber}`);
                if (!result) {
                  report.leaderLapSummaryFailures.push({
                    sessionId: canonicalSessionId,
                    reason: 'leader_lap_car_missing_result_row',
                    lapNumber: lap.lapNumber,
                    carNumber: lap.carNumber,
                    driverName: lap.driverName,
                    url: leaderLapSummaryUrl
                  });
                }
                return {
                  ...lap,
                  driverId: result?.driverId ?? null,
                  carId: result?.carId ?? null,
                  teamId: result?.teamId ?? null
                };
              });

              nextDerivedMetrics.push({
                id: `metric_indy_nxt_${year}_${sessionIdRaw}_leader_lap_summary`,
                scope: 'session',
                metricType: 'official_leader_lap_summary',
                sessionId: canonicalSessionId,
                eventId: session.eventId,
                seriesId: session.seriesId ?? 'series_indy_nxt',
                driverId: null,
                calculationVersion: 'official_pdf_direct_extract_v1',
                formula: 'Direct extraction from official INDY NXT Leader Lap Summary PDF rows; no derived calculation.',
                inputRefs: [evidenceId],
                metrics: {
                  laps: mappedLaps,
                  uniqueLeaderDriverIds: Array.from(new Set(mappedLaps.map((row) => row.driverId).filter(Boolean)))
                },
                confidence: 'official',
                raw: {
                  source: 'INDY NXT Leader Lap Summary PDF',
                  eventName: details.EventName ?? null,
                  sessionName: details.SessionName ?? null,
                  sourceDocumentId: leaderLapSummaryReport.DocumentID ?? null,
                  sourceDocumentType: leaderLapSummaryReport.DocumentType ?? leaderLapSummaryReport.Name ?? null
                },
                provenanceRefs: [evidenceId]
              });
              report.leaderLapSummaryMetricsImported += 1;
              report.leaderLapSummariesParsed += 1;
            }
          } catch (error) {
            report.leaderLapSummaryFailures.push({ sessionId: canonicalSessionId, reason: 'fetch_or_parse_error', message: error.message, url: leaderLapSummaryUrl });
          }
        }
      }
    }

    const topSectionReport = asArray(details.SessionReports).find((row) =>
      /top section times/i.test(`${row.DocumentType ?? ''} ${row.Name ?? ''}`)
    );
    if (!topSectionReport) continue;

    report.topSectionReportsDiscovered += 1;
    if (!session) {
      report.skipped.push({ sessionId: canonicalSessionId, reason: 'canonical_session_missing_for_top_section_times' });
      continue;
    }

    const topSectionUrl = reportUrl(topSectionReport.Url);
    if (!topSectionUrl) {
      report.skipped.push({ sessionId: canonicalSessionId, reason: 'top_section_times_url_missing' });
      continue;
    }

    const topSectionPdfName = `${year}-${sessionIdRaw}-${slug(topSectionReport.Name ?? topSectionReport.DocumentType ?? 'top-section-times')}${extname(topSectionUrl) || '.pdf'}`;
    const topSectionPdfPath = join(reportDetailsDir, topSectionPdfName);
    const topSectionTextPath = join(reportDetailsDir, `${basename(topSectionPdfName, extname(topSectionPdfName))}.raw.txt`);
    try {
      const pdfResult = await fetchBinaryCached(topSectionUrl, topSectionPdfPath);
      report[pdfResult.fromCache ? 'pdfsCached' : 'pdfsFetched'] += 1;
      const textResult = await extractTextCached(topSectionPdfPath, topSectionTextPath);
      report[textResult.fromCache ? 'textCached' : 'textExtracted'] += 1;

      const parsed = parseTopSectionTimesText(textResult.text);
      if (!parsed.sections.length) {
        if (/cancell?ed|no\s+data|no\s+time/i.test(textResult.text)) {
          report.topSectionReportsHeldOut.push({
            sessionId: canonicalSessionId,
            reason: 'official_report_has_no_section_rows',
            sessionName: details.SessionName ?? null,
            url: topSectionUrl
          });
        } else {
          report.topSectionFailures.push({ sessionId: canonicalSessionId, reason: 'sections_not_parsed', url: topSectionUrl });
        }
      } else {

        const evidenceId = `source_indy_nxt_${year}_${sessionIdRaw}_top_section_times_pdf`;
        sourceEvidenceMap.set(
          evidenceId,
          sourceEvidence({
            id: evidenceId,
            sourceName: `INDY NXT ${year} session ${sessionIdRaw} Top Section Times PDF`,
            url: topSectionUrl,
            retrievedAt,
            coverage: `${details.EventName ?? 'INDY NXT event'} ${details.SessionName ?? 'Race'} official top section times and speeds by car/driver.`,
            rawArtifactPath: topSectionPdfPath.replace(`${root}/`, ''),
            parser: 'pdftotext -raw plus anchored Top Section Times extraction',
            notes: `Parsed ${parsed.sections.length} official section timing tables from text artifact ${topSectionTextPath.replace(`${root}/`, '')}.`
          })
        );

        const mappedSections = parsed.sections.map((section) => ({
          ...section,
          rows: section.rows.map((row) => {
            const result = timingEntryBySessionCar.get(`${canonicalSessionId}|${row.carNumber}`);
            if (!result) {
              report.topSectionUnmappedRows.push({
                sessionId: canonicalSessionId,
                reason: 'top_section_car_missing_canonical_timing_row',
                section: section.name,
                carNumber: row.carNumber,
                driverName: row.driverName,
                url: topSectionUrl
              });
            }
            return {
              ...row,
              driverId: result?.driverId ?? null,
              carId: result?.carId ?? null,
              teamId: result?.teamId ?? null
            };
          })
        }));

        nextDerivedMetrics.push({
          id: `metric_indy_nxt_${year}_${sessionIdRaw}_top_section_times`,
          scope: 'session',
          metricType: 'official_top_section_times',
          sessionId: canonicalSessionId,
          eventId: session.eventId,
          seriesId: session.seriesId ?? 'series_indy_nxt',
          driverId: null,
          calculationVersion: 'official_pdf_direct_extract_v1',
          formula: 'Direct extraction from official INDY NXT Top Section Times PDF section tables; no derived calculation.',
          inputRefs: [evidenceId],
          metrics: {
            sections: mappedSections
          },
          confidence: 'official',
          raw: {
            source: 'INDY NXT Top Section Times PDF',
            eventName: details.EventName ?? null,
            sessionName: details.SessionName ?? null,
            sourceDocumentId: topSectionReport.DocumentID ?? null,
            sourceDocumentType: topSectionReport.DocumentType ?? topSectionReport.Name ?? null
          },
          provenanceRefs: [evidenceId]
        });
        report.topSectionMetricsImported += 1;
        report.topSectionReportsParsed += 1;
      }
    } catch (error) {
      report.topSectionFailures.push({ sessionId: canonicalSessionId, reason: 'fetch_or_parse_error', message: error.message, url: topSectionUrl });
    }

    const sectionResultsReport = asArray(details.SessionReports).find((row) =>
      /section results/i.test(`${row.DocumentType ?? ''} ${row.Name ?? ''}`)
    );
    if (sectionResultsReport) {
      report.sectionResultsReportsDiscovered += 1;
      if (!session) {
        report.skipped.push({ sessionId: canonicalSessionId, reason: 'canonical_session_missing_for_section_results' });
      } else {
        const sectionResultsUrl = reportUrl(sectionResultsReport.Url);
        if (!sectionResultsUrl) {
          report.skipped.push({ sessionId: canonicalSessionId, reason: 'section_results_url_missing' });
        } else {
          const sectionResultsPdfName = `${year}-${sessionIdRaw}-${slug(sectionResultsReport.Name ?? sectionResultsReport.DocumentType ?? 'section-results')}${extname(sectionResultsUrl) || '.pdf'}`;
          const sectionResultsPdfPath = join(reportDetailsDir, sectionResultsPdfName);
          const sectionResultsTextPath = join(reportDetailsDir, `${basename(sectionResultsPdfName, extname(sectionResultsPdfName))}.layout.txt`);
          try {
            const pdfResult = await fetchBinaryCached(sectionResultsUrl, sectionResultsPdfPath);
            report[pdfResult.fromCache ? 'pdfsCached' : 'pdfsFetched'] += 1;
            const textResult = await extractLayoutTextCached(sectionResultsPdfPath, sectionResultsTextPath);
            report[textResult.fromCache ? 'textCached' : 'textExtracted'] += 1;

            const parsed = parseSectionResultsLayoutText(textResult.text);
            if (!parsed.cars.length) {
              if (!textResult.text.trim() || /cancell?ed|no\s+data|no\s+time|Section Data for Car\s*$/i.test(textResult.text)) {
                report.sectionResultsReportsHeldOut.push({
                  sessionId: canonicalSessionId,
                  reason: classifyEmptyOfficialPdf(pdfResult.buffer, textResult.text),
                  sessionName: details.SessionName ?? null,
                  url: sectionResultsUrl
                });
              } else {
                report.sectionResultsFailures.push({ sessionId: canonicalSessionId, reason: 'section_results_cars_not_parsed', url: sectionResultsUrl });
              }
            } else {
              const evidenceId = `source_indy_nxt_${year}_${sessionIdRaw}_section_results_pdf`;
              sourceEvidenceMap.set(
                evidenceId,
                sourceEvidence({
                  id: evidenceId,
                  sourceName: `INDY NXT ${year} session ${sessionIdRaw} Section Results PDF`,
                  url: sectionResultsUrl,
                  retrievedAt,
                  coverage: `${details.EventName ?? 'INDY NXT event'} ${details.SessionName ?? 'Race'} official lap-by-lap section times and speeds by car/driver.`,
                  rawArtifactPath: sectionResultsPdfPath.replace(`${root}/`, ''),
                  parser: 'pdftotext -layout plus column-position Section Results extraction',
                  notes: `Parsed ${parsed.cars.length} official car section-result tables from layout text artifact ${sectionResultsTextPath.replace(`${root}/`, '')}.`
                })
              );

              const mappedCars = parsed.cars.map((car) => {
                const result = timingEntryBySessionCar.get(`${canonicalSessionId}|${car.carNumber}`);
                if (!result) {
                  report.sectionResultsUnmappedCars.push({
                    sessionId: canonicalSessionId,
                    reason: 'section_results_car_missing_canonical_timing_row',
                    carNumber: car.carNumber,
                    driverName: car.driverName,
                    url: sectionResultsUrl
                  });
                }
                return {
                  ...car,
                  driverId: result?.driverId ?? null,
                  carId: result?.carId ?? null,
                  teamId: result?.teamId ?? null
                };
              });

              nextDerivedMetrics.push({
                id: `metric_indy_nxt_${year}_${sessionIdRaw}_section_results`,
                scope: 'session',
                metricType: 'official_section_results',
                sessionId: canonicalSessionId,
                eventId: session.eventId,
                seriesId: session.seriesId ?? 'series_indy_nxt',
                driverId: null,
                calculationVersion: 'official_pdf_direct_extract_v1',
                formula: 'Direct extraction from official INDY NXT Section Results PDF per-car section time and speed rows; no derived calculation.',
                inputRefs: [evidenceId],
                metrics: {
                  sectionNames: parsed.sectionNames,
                  cars: mappedCars,
                  carCount: mappedCars.length,
                  lapCount: mappedCars.reduce((total, car) => total + car.laps.length, 0)
                },
                confidence: 'official',
                raw: {
                  source: 'INDY NXT Section Results PDF',
                  eventName: details.EventName ?? null,
                  sessionName: details.SessionName ?? null,
                  sourceDocumentId: sectionResultsReport.DocumentID ?? null,
                  sourceDocumentType: sectionResultsReport.DocumentType ?? sectionResultsReport.Name ?? null
                },
                provenanceRefs: [evidenceId]
              });
              report.sectionResultsMetricsImported += 1;
              report.sectionResultsReportsParsed += 1;
            }
          } catch (error) {
            report.sectionResultsFailures.push({ sessionId: canonicalSessionId, reason: 'fetch_or_parse_error', message: error.message, url: sectionResultsUrl });
          }
        }
      }
    }

    const resultsReport = details.SessionType === 'R'
      ? asArray(details.SessionReports).find((row) =>
          /results/i.test(`${row.DocumentType ?? ''} ${row.Name ?? ''}`)
        )
      : null;
    if (!resultsReport) continue;

    report.resultsReportsDiscovered += 1;
    if (!session) {
      report.skipped.push({ sessionId: canonicalSessionId, reason: 'canonical_session_missing_for_results_report' });
      continue;
    }

    const resultsUrl = reportUrl(resultsReport.Url);
    if (!resultsUrl) {
      report.skipped.push({ sessionId: canonicalSessionId, reason: 'results_report_url_missing' });
      continue;
    }

    const resultsPdfName = `${year}-${sessionIdRaw}-${slug(resultsReport.Name ?? resultsReport.DocumentType ?? 'results')}${extname(resultsUrl) || '.pdf'}`;
    const resultsPdfPath = join(reportDetailsDir, resultsPdfName);
    const resultsTextPath = join(reportDetailsDir, `${basename(resultsPdfName, extname(resultsPdfName))}.raw.txt`);
    try {
      const pdfResult = await fetchBinaryCached(resultsUrl, resultsPdfPath);
      report[pdfResult.fromCache ? 'pdfsCached' : 'pdfsFetched'] += 1;
      const textResult = await extractTextCached(resultsPdfPath, resultsTextPath);
      report[textResult.fromCache ? 'textCached' : 'textExtracted'] += 1;

      const parsedPenalties = parsePenaltySummaryText(textResult.text);
      const parsedCautions = parseCautionSummaryText(textResult.text);
      const hasPenaltyOrCautionSections = /Penalty Summary|Caution Summary/i.test(textResult.text);
      if (!parsedPenalties.length && !parsedCautions.length && !hasPenaltyOrCautionSections) {
        report.resultsReportFailures.push({ sessionId: canonicalSessionId, reason: 'no_penalty_or_caution_rows_parsed', url: resultsUrl });
        continue;
      }

      const evidenceId = `source_indy_nxt_${year}_${sessionIdRaw}_results_pdf`;
      sourceEvidenceMap.set(
        evidenceId,
        sourceEvidence({
          id: evidenceId,
          sourceName: `INDY NXT ${year} session ${sessionIdRaw} Results PDF`,
          url: resultsUrl,
          retrievedAt,
          coverage: `${details.EventName ?? 'INDY NXT event'} ${details.SessionName ?? 'Race'} official results, penalty summary, and caution summary.`,
          rawArtifactPath: resultsPdfPath.replace(`${root}/`, ''),
          parser: 'pdftotext -raw plus anchored Results PDF penalty/caution extraction',
          notes: `Parsed ${parsedPenalties.length} official penalty rows and ${parsedCautions.length} official caution rows from text artifact ${resultsTextPath.replace(`${root}/`, '')}.`
        })
      );

      const penaltyIdsInSession = new Set();
      for (const penalty of parsedPenalties) {
        const result = resultBySessionCar.get(`${canonicalSessionId}|${penalty.carNumber}`);
        const basePenaltyId = `penalty_indy_nxt_${year}_${sessionIdRaw}_car_${penalty.carNumber}_lap_${penalty.lapNumber}_${slug(penalty.penaltyType)}`;
        let penaltyId = basePenaltyId;
        if (penaltyIdsInSession.has(penaltyId)) {
          penaltyId = `${basePenaltyId}_${slug(penalty.reason)}`;
        }
        let duplicateIndex = 2;
        while (penaltyIdsInSession.has(penaltyId)) {
          penaltyId = `${basePenaltyId}_${slug(penalty.reason)}_${duplicateIndex}`;
          duplicateIndex += 1;
        }
        penaltyIdsInSession.add(penaltyId);
        nextPenalties.push({
          id: penaltyId,
          sessionId: canonicalSessionId,
          driverId: result?.driverId ?? null,
          lapNumber: penalty.lapNumber,
          penaltyType: penalty.penaltyType,
          reason: penalty.reason,
          served: null,
          positionImpact: penalty.positionImpact,
          timeImpactSeconds: penalty.timeImpactSeconds,
          raw: {
            source: 'INDY NXT Results PDF Penalty Summary',
            carNumber: penalty.carNumber,
            sanction: penalty.sanction,
            eventName: details.EventName ?? null,
            sessionName: details.SessionName ?? null,
            sourceDocumentId: resultsReport.DocumentID ?? null,
            sourceDocumentType: resultsReport.DocumentType ?? resultsReport.Name ?? null
          },
          provenanceRefs: [evidenceId]
        });
        if (result) {
          result.penaltyRefs = Array.from(new Set([...(result.penaltyRefs ?? []), penaltyId]));
        } else {
          report.resultsReportFailures.push({
            sessionId: canonicalSessionId,
            reason: 'penalty_car_missing_result_row',
            carNumber: penalty.carNumber,
            penaltyId,
            url: resultsUrl
          });
        }
        report.officialPenaltiesImported += 1;
      }

      for (const caution of parsedCautions) {
        const involvedResults = caution.mentionedCars
          .map((carNumber) => resultBySessionCar.get(`${canonicalSessionId}|${carNumber}`))
          .filter(Boolean);
        const primaryResult = involvedResults.length === 1 ? involvedResults[0] : null;
        const incidentId = `incident_indy_nxt_caution_${year}_${sessionIdRaw}_${caution.cautionNumber}`;
        nextIncidents.push({
          id: incidentId,
          sessionId: canonicalSessionId,
          driverId: primaryResult?.driverId ?? null,
          lapNumber: caution.startLap,
          incidentType: caution.incidentType,
          description: `Official caution ${caution.cautionNumber} ran from lap ${caution.startLap} to lap ${caution.endLap} for ${caution.reason}.`,
          outcome: `caution_laps_${caution.startLap}_to_${caution.endLap}_duration_${caution.totalLaps}`,
          otherDriverIds: primaryResult ? [] : Array.from(new Set(involvedResults.map((row) => row.driverId).filter(Boolean))),
          raw: {
            source: 'INDY NXT Results PDF Caution Summary',
            cautionNumber: caution.cautionNumber,
            startLap: caution.startLap,
            endLap: caution.endLap,
            totalLaps: caution.totalLaps,
            reason: caution.reason,
            mentionedCars: caution.mentionedCars,
            eventName: details.EventName ?? null,
            sessionName: details.SessionName ?? null,
            sourceDocumentId: resultsReport.DocumentID ?? null,
            sourceDocumentType: resultsReport.DocumentType ?? resultsReport.Name ?? null
          },
          provenanceRefs: [evidenceId]
        });
        for (const result of involvedResults) {
          result.incidentRefs = Array.from(new Set([...(result.incidentRefs ?? []), incidentId]));
        }
        report.officialCautionIncidentsImported += 1;
      }
      report.resultsReportsParsed += 1;
    } catch (error) {
      report.resultsReportFailures.push({ sessionId: canonicalSessionId, reason: 'fetch_or_parse_error', message: error.message, url: resultsUrl });
    }
  }

  dataset.results = nextResults.sort((a, b) => a.id.localeCompare(b.id));
  dataset.lapSamples = nextLapSamples.sort((a, b) => a.id.localeCompare(b.id));
  dataset.derivedMetrics = nextDerivedMetrics.sort((a, b) => a.id.localeCompare(b.id));
  dataset.racecraftEvents = nextRacecraftEvents.sort((a, b) => a.id.localeCompare(b.id));
  dataset.penalties = nextPenalties.sort((a, b) => a.id.localeCompare(b.id));
  dataset.incidents = nextIncidents.sort((a, b) => a.id.localeCompare(b.id));
  dataset.sourceEvidence = Array.from(sourceEvidenceMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  dataset.updatedAt = retrievedAt;
  const indyNxtDetailGapDescription = [
    'EventsSessionDetails imports race/session result rows, qualifyingResults for official SessionType=Q records, and official terminal-status incident rows for contact/mechanical/dns outcomes.',
    'Official Race Lap Chart PDFs now import 29,519 official lap-by-lap position samples from all 36 completed Race Lap Chart PDFs: 26 charts fully validate against official completed-lap counts and 10 clean partial Race Lap Chart PDFs preserve explicit missing car-lap or official result/chart conflict diagnostics without guessing terminal or conflict laps.',
    'Official Event Summary PDFs import race-stat metrics and most-improved racecraft notes. Official Leader Lap Summary PDFs import leader-by-lap timing, margin, and flag-state metrics.',
    'Official Top Section Times PDFs import practice, qualifying, and race section-rank timing metrics when official section rows are present. Official Section Results PDFs import practice, qualifying, and race lap-by-lap section times and speeds at per-car/per-lap grain when official section rows are present.',
    'The remaining true section-results holdout is session_indy_nxt_2024_6325, where the official Section Results PDF URL returns corrupt non-PDF bytes; canceled/no-row reports remain held out rather than treated as missing data.',
    'Source-visible rows without canonical API timing rows keep car/name text with null canonical IDs. Official race Results PDFs import penalty/decision summary rows and caution-summary causal incident rows.',
    'Detailed pit-lane sequence context is source-unavailable in the current official report family; use official/API pit-stop counts as the production-safe pit metric unless a new official pit-summary source appears.'
  ].join(' ');
  dataset.gaps = asArray(dataset.gaps).map((gap) =>
    gap.id === 'gap_indy_nxt_qualifying_lap_reports'
		      ? {
		          ...gap,
		          description: indyNxtDetailGapDescription
		        }
      : gap
  );

  await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ wrote: datasetPath, report: reportPath, ...report }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
