// Parser for Orbits (MyLaps) result and grid sheets converted with `pdftotext -layout`.
//
// Orbits sheets are used by SCCA (Super Tour), the Right Coast Formula F Series
// and the INDYCAR-run USF Pro 2000 timing. Every organiser picks its own column
// set and order, so the caller names the columns it expects, in header order,
// each with a pattern that finds it on the header line. Rows are then cut into
// chunks on runs of two or more spaces, and each chunk is given to the column
// whose header span it starts in. A chunk that runs across the start of the
// next text column (a long name followed by one space and the car make) is cut
// at the space nearest that column's start.

const POSITION_TOKEN = /^(?:\d+|DNS|DNF|DQ|DSQ|NC)$/i;

export const lapTimeToSeconds = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parts = text.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
};

export const isLapTime = (value) => /^(?:\d+:)?\d{1,2}(?::\d{2})?\.\d{1,4}$/.test(String(value ?? '').trim());

const chunksWithOffsets = (line) => {
  const chunks = [];
  const pattern = /\S+(?: \S+)*/g;
  let match;
  while ((match = pattern.exec(line))) {
    chunks.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return chunks;
};

export const locateColumns = (headerLine, columns) => {
  const located = [];
  let from = 0;
  for (const column of columns) {
    const pattern = new RegExp(column.header.source, column.header.flags.includes('g') ? column.header.flags : `${column.header.flags}g`);
    pattern.lastIndex = from;
    const match = pattern.exec(headerLine);
    if (!match) throw new Error(`Orbits header has no column "${column.key}" (${column.header}) in: ${headerLine.trim()}`);
    located.push({ ...column, start: match.index, headerEnd: match.index + match[0].length });
    from = match.index + match[0].length;
  }
  return located;
};

// Column index for a chunk: the last column whose start (less a small slack for
// right-aligned numbers that begin left of their header) is at or before the
// chunk start.
// `shift` moves every column start right by the amount the row itself is
// offset (not-classified rows are often printed a few characters to the right).
const columnIndexFor = (located, position, shift) => {
  let index = 0;
  for (let i = 0; i < located.length; i += 1) {
    const slack = located[i].align === 'right' ? located[i].slack ?? 4 : 1;
    if (position >= located[i].start + shift - slack) index = i;
  }
  return index;
};

export const splitRow = (line, located) => {
  const values = Object.fromEntries(located.map((column) => [column.key, null]));
  const pending = chunksWithOffsets(line);
  let shift = 0;
  while (pending.length) {
    const chunk = pending.shift();
    const index = columnIndexFor(located, chunk.start, shift);
    const column = located[index];
    if (column.align !== 'right' && values[column.key] === null) {
      const offset = chunk.start - column.start;
      if (offset >= 0 && offset <= 6) shift = offset;
    }
    const next = located[index + 1];
    const nextStart = next ? next.start + shift : null;
    if (next && next.align !== 'right' && chunk.end > nextStart) {
      // Cut at the single space closest to the next column's start.
      let cut = -1;
      for (let offset = 0; offset <= 4 && cut < 0; offset += 1) {
        for (const candidate of [nextStart - 1 - offset, nextStart - 1 + offset]) {
          const local = candidate - chunk.start;
          if (local > 0 && local < chunk.text.length && chunk.text[local] === ' ') {
            cut = local;
            break;
          }
        }
      }
      if (cut > 0) {
        const head = chunk.text.slice(0, cut);
        const tail = chunk.text.slice(cut + 1);
        pending.unshift({ text: tail, start: chunk.start + cut + 1, end: chunk.end });
        values[located[index].key] = [values[located[index].key], head].filter(Boolean).join(' ');
        continue;
      }
    }
    const key = located[index].key;
    values[key] = [values[key], chunk.text].filter(Boolean).join(' ');
  }
  return values;
};

// Returns { header, rows, notClassified, announcements, meta } for one sheet.
export const parseOrbitsSheet = (text, { columns, headerPattern = /^\s*Pos\b/i, rowPattern = /^\s*(?:\d+|DNS|DNF|DQ|DSQ|NC)\s+/i }) => {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => headerPattern.test(line));
  if (headerIndex < 0) throw new Error('Orbits sheet has no header line');
  const located = locateColumns(lines[headerIndex], columns);
  const rows = [];
  let section = 'classified';
  const announcements = [];
  let inAnnouncements = false;
  for (const [lineIndex, line] of lines.slice(headerIndex + 1).entries()) {
    if (/^\s*Not classified\s*$/i.test(line)) {
      section = 'not_classified';
      continue;
    }
    if (/^\s*Announcements\s*$/i.test(line)) {
      inAnnouncements = true;
      continue;
    }
    if (/^\s*Margin of Victory/i.test(line)) inAnnouncements = false;
    if (inAnnouncements) {
      if (line.trim()) announcements.push(line.trim().replace(/^\d+\s{2,}/, ''));
      continue;
    }
    if (/^\s*Margin of Victory/i.test(line)) break;
    if (!rowPattern.test(line)) continue;
    const values = splitRow(line, located);
    const positionToken = String(values[located[0].key] ?? '').split(/\s+/)[0];
    if (!POSITION_TOKEN.test(positionToken)) continue;
    rows.push({ section, lineNumber: headerIndex + 2 + lineIndex, line, values });
  }
  const summaryIndex = lines.findIndex((line) => /^\s*Margin of Victory/i.test(line));
  const summaryValues = summaryIndex >= 0 ? lines[summaryIndex + 1]?.trim().split(/\s{2,}/) ?? [] : [];
  const lengthMatch = text.match(/([0-9]+\.[0-9]+)\s+miles/i);
  // "Race (20:00 Time) started at 16:18:29", or "Race started at 16:32:52" with no format.
  const startedMatch = text.match(/Race\s+(?:\(([^)]*)\)\s+)?started at\s+([0-9]{1,2}:[0-9]{2}:[0-9]{2})/i);
  const printedMatch = text.match(/Printed:\s*([0-9/]+\s+[0-9:]+\s*[AP]M)/i);
  return {
    header: lines[headerIndex],
    located,
    rows,
    announcements,
    meta: {
      titleLines: lines.slice(0, headerIndex).map((line) => line.trim()).filter(Boolean),
      circuitLengthMi: lengthMatch ? Number(lengthMatch[1]) : null,
      raceFormat: startedMatch ? startedMatch[1] ?? null : null,
      startedAtLocal: startedMatch ? startedMatch[2] : null,
      printed: printedMatch ? printedMatch[1] : null,
      marginOfVictory: summaryValues[0] ?? null,
      averageSpeedMph: summaryValues[1] ? Number(summaryValues[1]) : null,
      bestLapTime: summaryValues[2] ?? null,
      bestSpeedMph: summaryValues[3] ? Number(summaryValues[3]) : null,
      bestLapBy: summaryValues[4] ?? null
    }
  };
};

// Grid sheets: Pos, (PIC), No., Name in a fixed leading order. `order` names the
// leading numeric tokens, for example ['pos', 'pic', 'no'] or ['pos', 'no', 'pic'].
export const parseOrbitsGrid = (text, { order }) => {
  const rows = [];
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /^\s*Pos\b/i.test(line));
  for (const [lineIndex, line] of lines.slice(headerIndex + 1).entries()) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < order.length + 1) continue;
    if (!order.every((key, index) => (key === 'no' ? /^\d+[A-Z]?$/i.test(tokens[index]) : /^\d+$/.test(tokens[index])))) continue;
    const record = Object.fromEntries(order.map((key, index) => [key, tokens[index]]));
    const rest = line.trim().split(/\s+/).slice(order.length).join(' ');
    record.position = Number(record.pos);
    record.carNumber = record.no;
    record.nameText = rest;
    record.lineNumber = headerIndex + 2 + lineIndex;
    rows.push(record);
  }
  return rows;
};
