// Imports Bryce Aron's races that are timed on Orbits (MyLaps) result sheets and
// were missing from the career dataset (check of November 15, 2026):
//
//   - Hoosier SCCA Super Tour 2019, Formula F: Sebring, Circuit of the Americas
//     and Michelin Raceway Road Atlanta (two races each), with the official grids.
//   - Right Coast Formula F Series 2019, Race 3 at Mid-Ohio (he ran as the only
//     F1600 car in the field).
//   - USF Pro 2000 2024, the Freedom 90 at Lucas Oil Indianapolis Raceway Park,
//     with the official qualifying classification.
//
// Every row of every sheet is imported, not only Bryce's. The sheets are cached
// under data/career/raw/{scca-2019,rcffs-2019,usf-pro-2000-2024}/ and converted
// with `pdftotext -layout`; the parser is scripts/lib/orbits-results-parser.mjs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { parseOrbitsGrid, parseOrbitsSheet, isLapTime, splitRow } from './lib/orbits-results-parser.mjs';

const execFile = promisify(execFileCallback);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const reportPath = join(root, 'data/career/reports/orbits-career-import-report.json');
const refresh = process.argv.includes('--refresh');
const pdftotextBin = process.env.PDFTOTEXT_BIN ?? 'pdftotext';
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const importer = 'scripts/import-orbits-career.mjs';

const col = (key, header, align = 'left', slack) => ({ key, header, align, slack });
const layouts = {
  sccaSebringTimed: [
    col('pos', /Pos/, 'right'), col('pic', /PIC/, 'right'), col('no', /No\./, 'right'), col('class', /Class/), col('name', /Name/),
    col('make', /Make\/Model/), col('hometown', /Hometown/), col('laps', /Laps/, 'right'), col('best', /Best Tm/, 'right'),
    col('total', /Total Tm/, 'right'), col('diff', /Gap/, 'right', 6), col('member', /Member_ID/), col('region', /Region/)
  ],
  sccaSebringUntimed: [
    col('pos', /Pos/, 'right'), col('pic', /PIC/, 'right'), col('no', /No\./, 'right'), col('class', /Class/), col('name', /Name/),
    col('make', /Make\/Model/), col('hometown', /Hometown/), col('laps', /Laps/, 'right'), col('best', /Best Tm/, 'right'),
    col('member', /Member_ID/), col('region', /Region/), col('sponsor', /Sponsor/)
  ],
  // Homestead-Miami 2019 (Palm Tree Winter Majors): Pos, PIC, Class, No. in that order.
  // The sheet's right-hand City/State column is cut off at the page edge.
  sccaHomestead: [
    col('pos', /Pos/, 'right'), col('pic', /PIC/, 'right'), col('class', /Class/), col('no', /No\./, 'right'), col('name', /Name/),
    col('laps', /Laps/, 'right'), col('best', /Best Tm/, 'right'), col('total', /Total Tm/, 'right'), col('diff', /Gap/, 'right', 6),
    col('make', /Make-Model/), col('member', /Member_ID/), col('region', /Reg\./), col('hometown', /City/)
  ],
  sccaCota: [
    col('pos', /Pos/, 'right'), col('pic', /PIC/, 'right'), col('no', /No\./, 'right'), col('class', /Class/), col('name', /Name/),
    col('make', /Make\/Model/), col('hometown', /Hometown/), col('laps', /Laps/, 'right'), col('best', /Best Tm/, 'right'),
    col('member', /M\s*e\s*m\s*b\s*e\s*r_ID/), col('region', /Region/), col('sponsor', /Sponsor/)
  ],
  sccaRoadAtlanta: [
    col('pos', /Pos/, 'right'), col('no', /No\./, 'right'), col('pic', /PIC/, 'right'), col('classname', /ClassName/),
    col('laps', /Laps/, 'right'), col('best', /Best Tm/, 'right'), col('member', /Member_ID/), col('region', /Region/),
    col('hometown', /Hometown/), col('make', /Make-Model/), col('total', /Total Tm/, 'right'), col('sponsor', /Sponsor/)
  ],
  rcffs: [
    col('pos', /Pos/, 'right'), col('class', /Class/), col('no', /No\./, 'right'), col('name', /Name/), col('sponsor', /Sponsor/),
    col('laps', /Laps/, 'right'), col('best', /Best Tm/, 'right'), col('points', /Points/, 'right'), col('make', /Make\/Model/)
  ],
  usfRace: [
    col('pos', /Pos/, 'right'), col('sp', /SP/, 'right'), col('no', /No\./, 'right', 2), col('name', /Driver/), col('team', /Team/),
    col('laps', /Laps/, 'right'), col('total', /Total Tm/, 'right'), col('gap', /Diff/, 'right', 8), col('diff', /Gap/, 'right'),
    col('best', /Best Tm/, 'right'), col('bestSpeed', /Best Spd/, 'right'), col('bestLap', /Lap/, 'right'), col('points', /Points/, 'right')
  ],
  usfQualifying: [
    col('pos', /Pos/, 'right'), col('no', /No\./, 'right'), col('name', /Driver/), col('team', /Team/), col('total', /Total Tm/, 'right'),
    col('gap', /Diff/, 'right'), col('diff', /Gap/, 'right'), col('best', /Best Tm/, 'right'), col('bestLap', /Lap/, 'right'),
    col('secondBest', /2nd Best/, 'right'), col('averageSpeed', /Avg Spd/, 'right')
  ]
};

const sccaSourceNote = 'SCCA U.S. Majors Tour official Orbits results (Hoosier Super Tour and conference Majors events), served by SCCA on growtiming.scca.com (the www.scca.com host blocks scripts; the mirror serves the same files).';
const families = {
  scca: {
    seriesId: 'series_scca_super_tour',
    series: {
      id: 'series_scca_super_tour',
      // The sheets: Sebring, COTA and Road Atlanta are Hoosier Super Tour events (event
      // codes 19-ST-, on the 2019 Super Tour standings); Homestead is a Southeast
      // Conference Majors event (19-M-5908-S), not on the Super Tour standings. All
      // are rounds of the 2019 SCCA Majors Championship (the Southeast Conference
      // report scores Homestead, Sebring and Road Atlanta). The id stays.
      name: 'SCCA U.S. Majors Tour',
      category: 'formula',
      ladderLevel: 'US national club racing (SCCA Majors), Formula F class',
      governingBody: 'Sports Car Club of America',
      countryScope: 'United States',
      officialWebsite: 'https://www.scca.com/pages/majors-2',
      externalIds: { sccaProgram: 'U.S. Majors Tour / Hoosier Super Tour', bryceClass: 'FF' }
    },
    year: 2019,
    prefix: 'scca_super_tour_2019',
    timezoneNote: sccaSourceNote,
    rawDir: join(root, 'data/career/raw/scca-2019')
  },
  rcffs: {
    seriesId: 'series_rcffs',
    series: {
      id: 'series_rcffs',
      name: 'Right Coast Formula F Series',
      category: 'formula',
      ladderLevel: 'US regional Formula F (historic and modern Formula Ford)',
      governingBody: 'Right Coast Formula F Series (RCFFS)',
      countryScope: 'United States',
      officialWebsite: 'https://www.rcffs.org/',
      externalIds: { bryceClass: 'F16 (guest F1600 entry)' }
    },
    year: 2019,
    prefix: 'rcffs_2019',
    rawDir: join(root, 'data/career/raw/rcffs-2019')
  },
  usf: {
    seriesId: 'series_usf_pro_2000',
    series: {
      id: 'series_usf_pro_2000',
      name: 'USF Pro 2000 Championship',
      category: 'formula',
      ladderLevel: 'USF Pro Championships (Road to Indy), one step below INDY NXT',
      governingBody: 'Andersen Promotions / INDYCAR timing',
      countryScope: 'United States',
      officialWebsite: 'https://www.usfpro2000.com/',
      externalIds: {}
    },
    year: 2024,
    prefix: 'usf_pro_2000_2024',
    rawDir: join(root, 'data/career/raw/usf-pro-2000-2024')
  }
};

const newTracks = {
  track_homestead_miami_speedway_road_course: {
    id: 'track_homestead_miami_speedway_road_course',
    name: 'Homestead-Miami Speedway',
    canonicalName: 'Homestead-Miami Speedway',
    country: 'United States',
    region: 'Florida',
    city: 'Homestead',
    timezone: 'America/New_York',
    trackType: 'road',
    configuration: 'Modified Road Course (infield plus oval turns 3 and 4)',
    lengthMi: 2.3,
    aliases: ['Homestead-Miami Speedway', 'Homestead-Miami Speedway 2.30', 'Homestead-Miami', 'Homestead']
  },
  track_sebring_international_raceway: {
    id: 'track_sebring_international_raceway',
    name: 'Sebring International Raceway',
    canonicalName: 'Sebring International Raceway',
    country: 'United States',
    region: 'Florida',
    city: 'Sebring',
    timezone: 'America/New_York',
    trackType: 'road',
    configuration: 'Long course (Grand Prix circuit)',
    lengthMi: 3.74,
    aliases: ['Sebring', 'SEBRING LONG COURSE', 'Sebring International Raceway']
  },
  track_circuit_of_the_americas: {
    id: 'track_circuit_of_the_americas',
    name: 'Circuit of the Americas',
    canonicalName: 'Circuit of The Americas',
    country: 'United States',
    region: 'Texas',
    city: 'Austin',
    timezone: 'America/Chicago',
    trackType: 'road',
    configuration: 'Grand Prix circuit (CCW)',
    lengthMi: 3.41,
    aliases: ['COTA', 'Circuit of the Americas', 'Circuit of the Americas- CCW']
  },
  track_lucas_oil_indianapolis_raceway_park: {
    id: 'track_lucas_oil_indianapolis_raceway_park',
    name: 'Lucas Oil Indianapolis Raceway Park',
    canonicalName: 'Lucas Oil Indianapolis Raceway Park',
    country: 'United States',
    region: 'Indiana',
    city: 'Brownsburg',
    timezone: 'America/Indiana/Indianapolis',
    trackType: 'oval',
    configuration: 'Oval',
    lengthMi: 0.686,
    aliases: ['Lucas Oil Oval', 'Indianapolis Raceway Park Oval', 'IRP', 'Lucas Oil Indianapolis Raceway Park']
  }
};

const events = [
  {
    // His first car races. Not a Super Tour round: a Southeast Conference event of the
    // same 2019 U.S. Majors Tour, so it sits in the SCCA family with the Super Tour rounds.
    family: 'scca',
    key: 'homestead',
    eventId: 'event_scca_super_tour_2019_homestead',
    name: 'SCCA U.S. Majors Tour 2019 - Homestead-Miami Speedway (Florida Region, Palm Tree Winter Majors)',
    eventStartDate: '2019-01-03',
    eventEndDate: '2019-01-06',
    trackId: 'track_homestead_miami_speedway_road_course',
    timezone: 'America/New_York',
    country: 'United States',
    officialEventId: '1992798',
    eventPageUrl: 'https://growtiming.scca.com/events/1992798-southeast-conference-majors-florida-region',
    eventPagePath: 'event-pages/homestead-1992798.html',
    eventDateSource: 'SCCA event page 1992798 (Southeast Conference Majors, Florida Region) dates the meeting from January 3, 2019; the last race sheet is dated January 6, 2019.',
    supporting: [
      {
        id: 'source_scca_2019_southeast_conference_report',
        url: 'https://growtiming.scca.com/downloads/48003-southeast-2019-conference-report/download',
        pdf: '2019-southeast-conference-report.pdf',
        sourceType: 'official_pdf',
        sourceName: 'SCCA 2019 U.S. Majors Tour Southeast Conference report',
        coverage: 'Official season standings for the 2019 SCCA Southeast Conference, with per-race Formula F class finishes and qualifying positions in parentheses.',
        notes: 'Formula F row for Bryce Aron lists the two Homestead-Miami races (HMP1, HMP2) as "(5) 4" and "(4) 8*": qualifying 5th and 4th in class, class finish 4th and 8th; the asterisk marks a race that scored no points. Both class finishes agree with the PIC column of the Orbits sheets.'
      }
    ],
    sessions: [
      {
        key: 'race_1', name: 'Group 7 Race 1', raceNumber: 1, layout: 'sccaHomestead', gridOrder: null,
        url: 'https://www.scca.com/wp-content/uploads/2026/06/2019_0105_M_Homestead_Results.pdf', pdf: 'homestead-palm-tree-winter-majors-results.pdf',
        pages: [15, 15], text: 'homestead-group-7-race-1.txt',
        note: 'One combined results book for every group (SCCA results archive, U.S. Majors Tour 2019); Group 7 Race 1 is page 15. No grid sheet was found, so start positions stay empty; the Southeast Conference report gives his Formula F qualifying position (5th).'
      },
      {
        key: 'race_2', name: 'Group 7 Race 2', raceNumber: 2, layout: 'sccaHomestead', gridOrder: null,
        url: 'https://www.scca.com/wp-content/uploads/2026/06/2019_0105_M_Homestead_Results.pdf', pdf: 'homestead-palm-tree-winter-majors-results.pdf',
        pages: [16, 16], text: 'homestead-group-7-race-2.txt',
        note: 'Page 16 of the same book. The race was checkered early "due to track conditions". The conference report gives his Formula F qualifying position (4th) and marks the race as scoring him no points.'
      }
    ]
  },
  {
    family: 'scca',
    key: 'sebring',
    eventId: 'event_scca_super_tour_2019_sebring',
    name: 'Hoosier SCCA Super Tour 2019 - Sebring (Central Florida Region, Winter Vacation)',
    eventStartDate: '2019-01-11',
    eventEndDate: '2019-01-13',
    trackId: 'track_sebring_international_raceway',
    timezone: 'America/New_York',
    country: 'United States',
    officialEventId: '1992799',
    eventPageUrl: 'https://growtiming.scca.com/events/1992799-hoosier-scca-super-tour-central-florida-region',
    eventPagePath: 'event-pages/sebring-1992799.html',
    sessions: [
      {
        key: 'race_1', name: 'Group 7 Race 1', raceNumber: 1, layout: 'sccaSebringTimed', gridOrder: ['pos', 'pic', 'no'],
        url: 'https://growtiming.scca.com/downloads/43592-7-r1/download', pdf: 'sebring-group-7-race-1.pdf',
        gridUrl: 'https://growtiming.scca.com/downloads/43604-7-grid-1/download', gridPdf: 'sebring-group-7-race-1-grid.pdf'
      },
      {
        key: 'race_2', name: 'Group 7 Race 2', raceNumber: 2, layout: 'sccaSebringUntimed', gridOrder: ['pos', 'pic', 'no'],
        url: 'https://growtiming.scca.com/downloads/43627-7-r2/download', pdf: 'sebring-group-7-race-2.pdf',
        gridUrl: 'https://growtiming.scca.com/downloads/43611-7-grid-2/download', gridPdf: 'sebring-group-7-race-2-grid.pdf'
      }
    ]
  },
  {
    family: 'scca',
    key: 'cota',
    eventId: 'event_scca_super_tour_2019_circuit_of_the_americas',
    name: 'Hoosier SCCA Super Tour 2019 - Circuit of the Americas (Lone Star Region Polar Prix)',
    eventStartDate: '2019-02-08',
    eventEndDate: '2019-02-10',
    trackId: 'track_circuit_of_the_americas',
    timezone: 'America/Chicago',
    country: 'United States',
    officialEventId: '1992852',
    eventPageUrl: 'https://growtiming.scca.com/events/1992852-hoosier-scca-super-tour-lone-star-region-polar-prix',
    eventPagePath: 'event-pages/cota-1992852.html',
    sessions: [
      {
        key: 'saturday_race', name: 'Group 7 Saturday Race', raceNumber: 1, layout: 'sccaCota', gridOrder: ['pos', 'pic', 'no'],
        url: 'https://growtiming.scca.com/downloads/43976-group-7-saturday-race-provisional/download', pdf: 'cota-group-7-saturday-race.pdf',
        gridUrl: 'https://growtiming.scca.com/downloads/43956-group-7-saturday-race-grid/download', gridPdf: 'cota-group-7-saturday-race-grid.pdf',
        note: 'The download is named "provisional" but the sheet is headed "Saturday Official Race Results" and printed after the official posting.'
      },
      {
        key: 'sunday_race', name: 'Group 7 Sunday Race', raceNumber: 2, layout: 'sccaCota', gridOrder: ['pos', 'pic', 'no'],
        url: 'https://growtiming.scca.com/downloads/44003-group-7-sunday-race-result-official/download', pdf: 'cota-group-7-sunday-race.pdf',
        gridUrl: 'https://growtiming.scca.com/downloads/43988-group-7-sunday-race-grid/download', gridPdf: 'cota-group-7-sunday-race-grid.pdf'
      }
    ]
  },
  {
    family: 'scca',
    key: 'road_atlanta',
    eventId: 'event_scca_super_tour_2019_road_atlanta',
    name: 'Hoosier SCCA Super Tour 2019 - Michelin Raceway Road Atlanta (Atlanta Region)',
    eventStartDate: '2019-03-15',
    eventEndDate: '2019-03-17',
    trackId: 'track_michelin_raceway_road_atlanta',
    timezone: 'America/New_York',
    country: 'United States',
    officialEventId: '1992801',
    eventPageUrl: 'https://growtiming.scca.com/events/1992801-hoosier-scca-super-tour-road-atlanta-atlanta-region',
    eventPagePath: 'event-pages/road-atlanta-1992801.html',
    sessions: [
      {
        key: 'saturday_race', name: 'Group 3 Saturday Race', raceNumber: 1, layout: 'sccaRoadAtlanta', gridOrder: ['pos', 'no', 'pic'],
        url: 'https://growtiming.scca.com/downloads/44654-gp3-sat-race-prov/download', pdf: 'road-atlanta-group-3-saturday-race.pdf',
        gridUrl: 'https://growtiming.scca.com/downloads/44636-gp3-qual2-race-grid/download', gridPdf: 'road-atlanta-group-3-saturday-race-grid.pdf',
        note: 'The download is named "prov" but the sheet is stamped OFFICIAL.'
      },
      {
        key: 'sunday_race', name: 'Group 3 Sunday Race', raceNumber: 2, layout: 'sccaRoadAtlanta', gridOrder: ['pos', 'no', 'pic'],
        url: 'https://growtiming.scca.com/downloads/44690-gp3-sun-race-offical/download', pdf: 'road-atlanta-group-3-sunday-race.pdf',
        gridUrl: 'https://growtiming.scca.com/downloads/44672-gp3-sun-grid/download', gridPdf: 'road-atlanta-group-3-sunday-race-grid.pdf'
      }
    ]
  },
  {
    family: 'rcffs',
    key: 'mid_ohio',
    eventId: 'event_rcffs_2019_mid_ohio',
    name: 'Right Coast Formula F Series 2019 - Race Weekend 2, Mid-Ohio (FRP All Formula Weekend)',
    eventStartDate: '2019-06-28',
    eventEndDate: '2019-06-30',
    trackId: 'track_mid_ohio_sports_car_course',
    timezone: 'America/New_York',
    country: 'United States',
    officialEventId: null,
    eventDateSource: 'RCFFS race report for Race Weekend 2 at Mid-Ohio ("June 28, 29 & 30")',
    supporting: [
      {
        id: 'source_rcffs_2019_mid_ohio_race_report',
        url: 'https://www.rcffs.org/uploads/7/5/7/4/75745913/race_report_from_right_coast_formula_f_series_race_weekend_2_at_mid_ohio.pdf',
        pdf: 'rcffs-race-weekend-2-mid-ohio-report.pdf',
        sourceType: 'official_pdf',
        sourceName: 'RCFFS race report, Race Weekend 2 at Mid-Ohio 2019',
        coverage: 'Series race report for the June 28-30, 2019 Mid-Ohio weekend: event dates, practice order, and Race 3 narrative.',
        notes: 'Used for the event dates only. Its statement that Bryce started Race 3 from the back is not imported as a grid position (no official grid sheet).'
      }
    ],
    sessions: [
      {
        key: 'race_3', name: 'Race 3 (RCFFS 50th Anniversary feature)', raceNumber: 3, layout: 'rcffs', gridOrder: null,
        url: 'https://www.rcffs.org/uploads/7/5/7/4/75745913/rcffs_r3_results_6-30-19.pdf', pdf: 'rcffs-r3-results-2019-06-30.pdf'
      }
    ]
  },
  {
    family: 'usf',
    key: 'lucas_oil',
    eventId: 'event_usf_pro_2000_2024_lucas_oil_freedom_90',
    name: 'USF Pro 2000 2024 - Freedom 90, Lucas Oil Indianapolis Raceway Park',
    eventStartDate: '2024-05-23',
    eventEndDate: '2024-05-25',
    trackId: 'track_lucas_oil_indianapolis_raceway_park',
    timezone: 'America/Indiana/Indianapolis',
    country: 'United States',
    officialEventId: null,
    eventDateSource: 'Official qualifying (May 23, 2024) and race (May 25, 2024) sheets',
    sessions: [
      {
        key: 'qualifying', name: 'Qualifying', sessionType: 'qualifying', raceNumber: null, layout: 'usfQualifying', gridOrder: null,
        url: 'https://www.usfpro2000.com/docs/default-source/results/lor-usf-pro-2000-qualifying.pdf', pdf: 'lor-qualifying.pdf'
      },
      {
        key: 'race', name: 'Freedom 90', raceNumber: 1, layout: 'usfRace', gridOrder: null,
        url: 'https://www.usfpro2000.com/docs/default-source/results/lor-usf-pro-2000-race---official.pdf', pdf: 'lor-race-official.pdf'
      }
    ]
  }
];

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const slug = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
const safeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[^\d.+-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};
const relative = (path) => path.replace(`${root}/`, '');

const readJsonIfExists = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const fetchCached = async (url, path) => {
  if (!refresh) {
    try {
      await readFile(path);
      return { fromCache: true };
    } catch {
      // Fetch below.
    }
  }
  const response = await fetch(url, { headers: { 'user-agent': userAgent, accept: 'application/pdf,text/html,*/*' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  return { fromCache: false };
};

// `pages` ([first, last]) converts only those pages of a combined results book.
const convertPdf = async (pdfPath, textPath, pages = null) => {
  if (!refresh) {
    try {
      return { text: await readFile(textPath, 'utf8'), fromCache: true };
    } catch {
      // Convert below.
    }
  }
  await mkdir(dirname(textPath), { recursive: true });
  const pageArgs = pages ? ['-f', String(pages[0]), '-l', String(pages[1])] : [];
  await execFile(pdftotextBin, ['-layout', ...pageArgs, pdfPath, textPath]);
  return { text: await readFile(textPath, 'utf8'), fromCache: false };
};

const mergeValue = (current, next) => {
  if (next === null || next === undefined || next === '') return current;
  if (Array.isArray(current) || Array.isArray(next)) return Array.from(new Set([...asArray(current), ...asArray(next)]));
  if (current && next && typeof current === 'object' && typeof next === 'object') return { ...current, ...next };
  return next;
};

const upsert = (map, row) => {
  const current = map.get(row.id);
  if (!current) {
    map.set(row.id, row);
    return;
  }
  const merged = { ...current };
  for (const [key, value] of Object.entries(row)) merged[key] = mergeValue(current[key], value);
  merged.provenanceRefs = Array.from(new Set([...(current.provenanceRefs ?? []), ...(row.provenanceRefs ?? [])]));
  map.set(row.id, merged);
};

// The public report names an unmatched grid row by driver only: the rest of
// the grid line carries a class token, a lap time and the entrant's club
// membership number, which stay in the private raw sheet.
const gridNameForReport = (nameText) =>
  String(nameText ?? '')
    .replace(/^[A-Z0-9]{1,4}\s+/, '')
    .split(/\s+(?=\d+:\d{2}\.\d|\d{4,})/)[0]
    .trim();

const sourceEvidence = ({ id, sourceType, sourceName, url, retrievedAt, coverage, rawArtifactPath, notes }) => ({
  id,
  sourceType,
  sourceName,
  url,
  retrievedAt,
  publishedAt: null,
  accessedBy: importer,
  licenseNotes: 'Public official timing sheets; store extracted facts, source URLs, and cached artifacts for verification.',
  confidenceTier: 'official',
  coverage,
  parser: importer,
  rawArtifactPath,
  notes
});

const cleanName = (value) => String(value ?? '').replace(/\s+/g, ' ').replace(/\s+\(R\)$/i, '').trim();
const driverIdFor = (name) => (/^bryce\s+aron$/i.test(cleanName(name)) ? 'driver_bryce_aron' : `driver_${slug(cleanName(name))}`);

// "1/12/2019 04:15 PM" or "2/9/2019 16:55" -> { date: '2019-01-12', time: '16:15' }
const parseSheetDateTime = (titleLines) => {
  for (const line of titleLines) {
    const match = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
    if (!match) continue;
    let [, month, day, year, hour, minute, meridiem] = match;
    let h = Number(hour);
    if (meridiem) {
      if (/pm/i.test(meridiem) && h < 12) h += 12;
      if (/am/i.test(meridiem) && h === 12) h = 0;
    }
    return { date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`, time: `${String(h).padStart(2, '0')}:${minute}` };
  }
  return { date: null, time: null };
};

const statusFor = (positionToken) => {
  const token = String(positionToken ?? '').toUpperCase();
  if (/^\d+$/.test(token)) return 'running';
  if (token === 'DNS') return 'dns';
  if (token === 'DNF') return 'dnf';
  if (token === 'DQ' || token === 'DSQ') return 'dsq';
  if (token === 'NC') return 'dnf';
  return 'unknown';
};

const gapValue = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const main = async () => {
  const existing = await readJsonIfExists(datasetPath, {});
  const retrievedAt = new Date().toISOString();
  const ownedPrefixes = Object.values(families).map((family) => family.prefix);
  const owned = (id) => ownedPrefixes.some((prefix) => String(id ?? '').includes(`_${prefix}_`) || String(id ?? '').endsWith(`_${prefix}`));
  const keep = (rows) => asArray(rows).filter((row) => !owned(row.id));

  const sourceEvidenceMap = new Map(keep(existing.sourceEvidence).map((row) => [row.id, row]));
  const drivers = new Map(asArray(existing.drivers).map((row) => [row.id, row]));
  const series = new Map(asArray(existing.series).map((row) => [row.id, row]));
  const teams = new Map(asArray(existing.teams).map((row) => [row.id, row]));
  const cars = new Map(keep(existing.cars).map((row) => [row.id, row]));
  const tracks = new Map(asArray(existing.tracks).map((row) => [row.id, row]));
  const seasons = new Map(keep(existing.seasons).map((row) => [row.id, row]));
  const eventMap = new Map(keep(existing.events).map((row) => [row.id, row]));
  const sessions = new Map(keep(existing.sessions).map((row) => [row.id, row]));
  const results = new Map(keep(existing.results).map((row) => [row.id, row]));
  const mediaAssets = new Map(keep(existing.mediaAssets).map((row) => [row.id, row]));
  const penalties = new Map(keep(existing.penalties).map((row) => [row.id, row]));

  const report = {
    checkedAt: retrievedAt,
    refresh,
    fetched: 0,
    cached: 0,
    sessionsImported: 0,
    resultRowsImported: 0,
    bryceResultRowsImported: 0,
    gridRowsImported: 0,
    gridRowsUnmatched: [],
    rawArtifacts: [],
    bryce: [],
    parserNotes: [],
    gaps: []
  };

  for (const family of Object.values(families)) {
    upsert(series, { ...family.series, provenanceRefs: [] });
  }

  for (const event of events) {
    const family = families[event.family];
    const eventEvidenceIds = [];
    if (event.eventPageUrl) {
      const pagePath = join(family.rawDir, event.eventPagePath);
      const page = await fetchCached(event.eventPageUrl, pagePath);
      report[page.fromCache ? 'cached' : 'fetched'] += 1;
      report.rawArtifacts.push(relative(pagePath));
      const id = `source_${family.prefix}_${event.key}_event_page`;
      eventEvidenceIds.push(id);
      upsert(sourceEvidenceMap, sourceEvidence({
        id,
        sourceType: 'official_page',
        sourceName: `${event.name} SCCA event page`,
        url: event.eventPageUrl,
        retrievedAt,
        coverage: `Official SCCA event page for ${event.name}: dates ${event.eventStartDate} to ${event.eventEndDate} and venue.`,
        rawArtifactPath: relative(pagePath),
        notes: family.timezoneNote ?? null
      }));
    }
    for (const support of asArray(event.supporting)) {
      const supportPath = join(family.rawDir, 'pdf', support.pdf);
      const fetched = await fetchCached(support.url, supportPath);
      report[fetched.fromCache ? 'cached' : 'fetched'] += 1;
      report.rawArtifacts.push(relative(supportPath));
      eventEvidenceIds.push(support.id);
      upsert(sourceEvidenceMap, sourceEvidence({ ...support, retrievedAt, rawArtifactPath: relative(supportPath) }));
    }

    if (newTracks[event.trackId] && !tracks.has(event.trackId)) {
      upsert(tracks, { ...newTracks[event.trackId], provenanceRefs: [] });
    }

    const sessionEvidenceIds = [];
    for (const sessionConfig of event.sessions) {
      const sessionType = sessionConfig.sessionType ?? 'race';
      const pdfPath = join(family.rawDir, 'pdf', sessionConfig.pdf);
      const textPath = join(family.rawDir, 'text', sessionConfig.text ?? sessionConfig.pdf.replace(/\.pdf$/, '.txt'));
      const fetched = await fetchCached(sessionConfig.url, pdfPath);
      report[fetched.fromCache ? 'cached' : 'fetched'] += 1;
      const { text } = await convertPdf(pdfPath, textPath, sessionConfig.pages ?? null);
      report.rawArtifacts.push(relative(pdfPath), relative(textPath));

      const parsed = parseOrbitsSheet(text, { columns: layouts[sessionConfig.layout] });
      const sessionId = `session_${family.prefix}_${event.key}_${sessionConfig.key}`;
      const evidenceId = `source_${family.prefix}_${event.key}_${sessionConfig.key}_pdf`;
      sessionEvidenceIds.push(evidenceId);
      const { date, time } = parseSheetDateTime(parsed.meta.titleLines);
      const startedAt = parsed.meta.startedAtLocal;
      upsert(sourceEvidenceMap, sourceEvidence({
        id: evidenceId,
        sourceType: 'official_pdf',
        sourceName: `${event.name} ${sessionConfig.name} official classification`,
        url: sessionConfig.url,
        retrievedAt,
        coverage: `${event.name} ${sessionConfig.name}: every classified and not-classified row on the official Orbits sheet${sessionConfig.pages ? ` (page ${sessionConfig.pages[0]} of the combined results book)` : ''}.`,
        rawArtifactPath: relative(pdfPath),
        notes: [`Sheet header: ${parsed.meta.titleLines.join(' | ')}.`, sessionConfig.note ?? null].filter(Boolean).join(' ')
      }));
      upsert(mediaAssets, {
        id: `asset_${family.prefix}_${event.key}_${sessionConfig.key}_pdf`,
        assetType: 'result_sheet',
        title: `${event.name} ${sessionConfig.name} official results`,
        url: sessionConfig.url,
        rightsStatus: 'link_only',
        publishedAt: date,
        eventId: event.eventId,
        sessionId,
        driverId: null,
        summary: `Official ${sessionConfig.name} classification.`,
        quoteText: null,
        provenanceRefs: [evidenceId]
      });

      // Continuation lines (a long team name pushes the timing onto the next line).
      const rows = [];
      for (const row of parsed.rows) rows.push(row);
      const lines = text.split(/\r?\n/);
      for (const row of rows) {
        const nextLine = lines[row.lineNumber] ?? '';
        if (row.values.laps === null && /^\s{20,}\d/.test(nextLine)) {
          const continuation = splitRow(nextLine, parsed.located);
          for (const [key, value] of Object.entries(continuation)) if (row.values[key] === null && value !== null) row.values[key] = value;
          row.continuationLine = nextLine.trim();
        }
      }

      let grid = [];
      let gridEvidenceId = null;
      if (sessionConfig.gridUrl) {
        const gridPdfPath = join(family.rawDir, 'pdf', sessionConfig.gridPdf);
        const gridTextPath = join(family.rawDir, 'text', sessionConfig.gridPdf.replace(/\.pdf$/, '.txt'));
        const gridFetched = await fetchCached(sessionConfig.gridUrl, gridPdfPath);
        report[gridFetched.fromCache ? 'cached' : 'fetched'] += 1;
        const { text: gridText } = await convertPdf(gridPdfPath, gridTextPath);
        report.rawArtifacts.push(relative(gridPdfPath), relative(gridTextPath));
        grid = parseOrbitsGrid(gridText, { order: sessionConfig.gridOrder });
        gridEvidenceId = `source_${family.prefix}_${event.key}_${sessionConfig.key}_grid_pdf`;
        upsert(sourceEvidenceMap, sourceEvidence({
          id: gridEvidenceId,
          sourceType: 'official_pdf',
          sourceName: `${event.name} ${sessionConfig.name} official grid`,
          url: sessionConfig.gridUrl,
          retrievedAt,
          coverage: `${event.name} ${sessionConfig.name} official grid (overall start positions).`,
          rawArtifactPath: relative(gridPdfPath),
          notes: `${grid.length} grid rows parsed.`
        }));
      }
      const gridByCar = new Map(grid.map((row) => [String(row.carNumber), row]));

      const scheduledStart = date && time ? `${date}T${time}:00` : null;
      const actualStart = date && startedAt ? `${date}T${startedAt.padStart(8, '0')}` : null;
      upsert(sessions, {
        id: sessionId,
        eventId: event.eventId,
        sessionType,
        sessionName: sessionConfig.name,
        raceNumber: sessionConfig.raceNumber,
        scheduledStart,
        actualStart,
        timezone: event.timezone,
        lapsScheduled: null,
        distanceScheduled: null,
        status: 'official',
        officialSessionId: null,
        weatherObservationRefs: [],
        ingestionState: 'official_pdf',
        broadcastRouteRefs: [],
        notificationRefs: [],
        raw: {
          titleLines: parsed.meta.titleLines,
          raceFormat: parsed.meta.raceFormat,
          circuitLengthMi: parsed.meta.circuitLengthMi,
          marginOfVictory: parsed.meta.marginOfVictory,
          averageSpeedMph: parsed.meta.averageSpeedMph,
          bestLapTime: parsed.meta.bestLapTime,
          bestLapBy: parsed.meta.bestLapBy,
          printed: parsed.meta.printed,
          announcements: parsed.announcements,
          sheetHasTotalTime: layouts[sessionConfig.layout].some((column) => column.key === 'total')
        },
        provenanceRefs: [...eventEvidenceIds, evidenceId, gridEvidenceId].filter(Boolean)
      });
      report.sessionsImported += 1;

      const fieldSize = rows.length;
      for (const row of rows) {
        const v = row.values;
        if (v.classname !== undefined) {
          // Road Atlanta prints class and name under one fused "ClassName" header.
          const [classToken, ...nameTokens] = String(v.classname ?? '').trim().split(/\s+/);
          v.class = classToken ?? null;
          v.name = nameTokens.join(' ') || null;
        }
        const positionToken = String(v.pos ?? '').split(/\s+/)[0];
        const status = statusFor(positionToken);
        const finishPosition = status === 'running' ? Number(positionToken) : null;
        const name = cleanName(v.name);
        const carNumber = String(v.no ?? '').trim().split(/\s+/)[0];
        const driverId = driverIdFor(name);
        const teamName = v.team ? v.team.trim() : null;
        const teamId = teamName ? `team_${slug(teamName)}` : null;
        const carId = `car_${family.prefix}_${slug(name)}_${slug(carNumber)}`;
        const resultId = `result_${family.prefix}_${event.key}_${sessionConfig.key}_${slug(carNumber)}_${driverId}`;
        const lapsFromColumn = safeNumber(v.laps);
        // USF oval qualifying prints no lap column, only the two timed laps (best and 2nd best).
        // Warm-up and in-laps are not on the sheet, so the session's lap count stays unknown;
        // the timed laps are kept in raw.timedLapsOnSheet.
        const timedLapsOnSheet = sessionType === 'qualifying' && v.laps === undefined
          ? (isLapTime(v.best) && isLapTime(v.secondBest) ? 2 : isLapTime(v.best) ? 1 : 0)
          : null;
        const laps = timedLapsOnSheet === null ? lapsFromColumn : null;
        const gridRow = gridByCar.get(carNumber) ?? null;
        const startPosition = v.sp !== undefined && v.sp !== null ? safeNumber(v.sp) : gridRow ? gridRow.position : null;

        // A driver already in the dataset keeps the name another importer gave it.
        const knownDriver = drivers.get(driverId);
        upsert(drivers, {
          id: driverId,
          displayName: knownDriver?.displayName ?? name,
          givenName: knownDriver?.givenName ?? name.split(' ')[0] ?? null,
          familyName: knownDriver?.familyName ?? (name.split(' ').slice(1).join(' ') || null),
          nationality: driverId === 'driver_bryce_aron' ? 'United States' : null,
          hometown: driverId === 'driver_bryce_aron' ? 'Winnetka, Illinois' : null,
          dateOfBirth: null,
          externalIds: {},
          provenanceRefs: [evidenceId]
        });
        if (teamId) {
          upsert(teams, { id: teamId, name: teamName, provenanceRefs: [evidenceId] });
        }
        upsert(cars, {
          id: carId,
          seriesId: family.seriesId,
          seasonYear: family.year,
          chassis: v.make ? v.make.trim() : null,
          engine: null,
          tireSupplier: null,
          class: v.class ? v.class.trim() : null,
          carNumber,
          entrant: teamName,
          teamId,
          liveryNotes: null,
          provenanceRefs: [evidenceId]
        });
        upsert(results, {
          id: resultId,
          sessionId,
          driverId,
          teamId,
          carId,
          carNumber,
          class: v.class ? v.class.trim() : null,
          gridPosition: startPosition,
          startPosition,
          finishPosition,
          classifiedPosition: finishPosition,
          finishPercentile: finishPosition && fieldSize ? Number(((fieldSize - finishPosition + 1) / fieldSize).toFixed(4)) : null,
          fieldSize,
          classPosition: safeNumber(String(v.pic ?? '').split(/\s+/)[0]),
          lapsCompleted: laps,
          lapsScheduled: null,
          lapsLed: null,
          points: safeNumber(v.points),
          status,
          statusRaw: positionToken,
          totalTime: v.total ? v.total.trim() : null,
          gapToLeader: gapValue(v.gap),
          gapToAhead: gapValue(v.diff),
          averageSpeed: v.averageSpeed ? safeNumber(v.averageSpeed) : null,
          averageSpeedUnit: v.averageSpeed ? 'mph' : null,
          bestLapTime: isLapTime(v.best) ? v.best.trim() : null,
          bestLapNumber: safeNumber(v.bestLap),
          bestLapRank: null,
          pitStops: null,
          penaltyRefs: [],
          incidentRefs: [],
          sourceResultId: `${event.key}:${sessionConfig.key}:${positionToken}:${carNumber}:${name}`,
          raw: {
            timedLapsOnSheet,
            section: row.section,
            sourceLine: row.line.trim(),
            continuationLine: row.continuationLine ?? null,
            parsedColumns: v,
            gridEvidence: gridRow ? { carNumber: gridRow.carNumber, position: gridRow.position, classPosition: safeNumber(gridRow.pic), lineNumber: gridRow.lineNumber } : null,
            layoutWarning: row.section === 'not_classified' ? 'Not-classified rows are printed off the header grid; make and hometown may be split at the wrong word.' : null
          },
          provenanceRefs: [evidenceId, gridRow ? gridEvidenceId : null].filter(Boolean)
        });
        if (gridRow) report.gridRowsImported += 1;
        report.resultRowsImported += 1;
        if (driverId === 'driver_bryce_aron') {
          report.bryceResultRowsImported += 1;
          report.bryce.push({ sessionId, carNumber, startPosition, finishPosition, classPosition: safeNumber(v.pic), laps, totalTime: v.total ?? null, status });
        }
      }
      for (const gridRow of grid) {
        if (!rows.some((row) => String(row.values.no ?? '').trim().split(/\s+/)[0] === String(gridRow.carNumber))) {
          report.gridRowsUnmatched.push({ sessionId, carNumber: gridRow.carNumber, position: gridRow.position, name: gridNameForReport(gridRow.nameText) });
        }
      }
    }

    upsert(eventMap, {
      id: event.eventId,
      seriesId: family.seriesId,
      seasonYear: family.year,
      name: event.name,
      round: null,
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      trackId: event.trackId,
      country: event.country,
      officialEventId: event.officialEventId,
      raw: event.eventDateSource ? { eventDateSource: event.eventDateSource } : undefined,
      provenanceRefs: eventEvidenceIds.length ? eventEvidenceIds : sessionEvidenceIds
    });
  }

  for (const family of Object.values(families)) {
    const familySessionIds = new Set(Array.from(sessions.values()).filter((row) => row.id.startsWith(`session_${family.prefix}_`) && row.sessionType === 'race').map((row) => row.id));
    const bryceRows = Array.from(results.values()).filter((row) => row.driverId === 'driver_bryce_aron' && familySessionIds.has(row.sessionId));
    upsert(seasons, {
      id: `season_${family.prefix}_bryce_aron`,
      year: family.year,
      seriesId: family.seriesId,
      driverId: 'driver_bryce_aron',
      teamIds: Array.from(new Set(bryceRows.map((row) => row.teamId).filter(Boolean))),
      carIds: Array.from(new Set(bryceRows.map((row) => row.carId))),
      championshipPosition: null,
      points: null,
      starts: bryceRows.filter((row) => row.status !== 'dns').length,
      wins: bryceRows.filter((row) => row.finishPosition === 1).length,
      poles: null,
      podiums: bryceRows.filter((row) => row.finishPosition && row.finishPosition <= 3).length,
      top5: bryceRows.filter((row) => row.finishPosition && row.finishPosition <= 5).length,
      top10: bryceRows.filter((row) => row.finishPosition && row.finishPosition <= 10).length,
      dnfs: bryceRows.filter((row) => row.status !== 'running').length,
      raw: { note: 'Counts are overall finishing positions from the imported race sheets, not class positions or a championship table.' },
      provenanceRefs: Array.from(new Set(bryceRows.flatMap((row) => row.provenanceRefs)))
    });
    const seriesRow = series.get(family.seriesId);
    series.set(family.seriesId, {
      ...seriesRow,
      provenanceRefs: Array.from(sourceEvidenceMap.keys()).filter((id) => id.startsWith(`source_${family.prefix}_`))
    });
  }

  const dataset = {
    ...existing,
    updatedAt: retrievedAt,
    drivers: Array.from(drivers.values()).sort((a, b) => a.id.localeCompare(b.id)),
    series: Array.from(series.values()).sort((a, b) => a.id.localeCompare(b.id)),
    teams: Array.from(teams.values()).sort((a, b) => a.id.localeCompare(b.id)),
    cars: Array.from(cars.values()).sort((a, b) => a.id.localeCompare(b.id)),
    tracks: Array.from(tracks.values()).sort((a, b) => a.id.localeCompare(b.id)),
    seasons: Array.from(seasons.values()).sort((a, b) => a.id.localeCompare(b.id)),
    events: Array.from(eventMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    sessions: Array.from(sessions.values()).sort((a, b) => a.id.localeCompare(b.id)),
    results: Array.from(results.values()).sort((a, b) => a.id.localeCompare(b.id)),
    penalties: Array.from(penalties.values()).sort((a, b) => a.id.localeCompare(b.id)),
    mediaAssets: Array.from(mediaAssets.values()).sort((a, b) => a.id.localeCompare(b.id)),
    sourceEvidence: Array.from(sourceEvidenceMap.values()).sort((a, b) => a.id.localeCompare(b.id))
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    wrote: relative(datasetPath),
    report: relative(reportPath),
    sessionsImported: report.sessionsImported,
    resultRowsImported: report.resultRowsImported,
    gridRowsImported: report.gridRowsImported,
    gridRowsUnmatched: report.gridRowsUnmatched.length,
    bryce: report.bryce
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
