// Records races Bryce ran that the dataset cannot import as results, because no
// official classification sheet was found. They are gaps, not results: no
// session or result rows are created, and no career figure counts them.
//
// Level B: the official SCCA conference standings list his class finish, but no
// race sheet was found (Homestead-Miami, January 2019).
// Level C: reported only, by press and a results aggregator; the series'
// own documents for the meeting were not found (Mugello, Euroformula 2023).
// See MISSING-RACES-CHECK.md (November 15, 2026) in the BryceCast build folder.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const reportPath = join(root, 'data/career/reports/unclassified-race-gaps-report.json');
const accessedBy = 'scripts/backfill-unclassified-race-gaps.mjs';

const evidence = [
  {
    id: 'source_scca_2019_southeast_conference_report',
    sourceType: 'official_pdf',
    sourceName: 'SCCA 2019 U.S. Majors Tour Southeast Conference report',
    url: 'https://growtiming.scca.com/downloads/48003-southeast-2019-conference-report/download',
    confidenceTier: 'official',
    coverage: 'Official season standings for the 2019 SCCA Southeast Conference, with per-race class finishes and starting positions in parentheses.',
    rawArtifactPath: 'data/career/raw/scca-2019/pdf/2019-southeast-conference-report.pdf',
    notes: 'Formula F row for Bryce Aron lists the two Homestead-Miami races as "(5) 4" and "(4) 8*". The asterisk marks a race that scored no points. No Homestead race sheet was found on growtiming.scca.com.'
  },
  {
    id: 'source_speedsport_euroformula_2023_mugello_race_1',
    sourceType: 'press_results',
    sourceName: 'Speedsport Magazine Euroformula Open 2023 Mugello Race 1 results',
    url: 'https://www.speedsport-magazine.com/motorsport/euroformula-open/2023/results/21-mugello',
    confidenceTier: 'reported',
    coverage: 'Third-party results table for Euroformula Open 2023 Round 7 Race 1 at Mugello.',
    rawArtifactPath: 'data/career/raw/career-gaps/speedsport-euroformula-2023-21-mugello.html',
    notes: 'Reported only. The Euroformula Open race-documents page used for the other 2023 rounds has no Mugello classification.'
  },
  {
    id: 'source_speedsport_euroformula_2023_mugello_race_2',
    sourceType: 'press_results',
    sourceName: 'Speedsport Magazine Euroformula Open 2023 Mugello Race 2 results',
    url: 'https://www.speedsport-magazine.com/motorsport/euroformula-open/2023/results/22-mugello',
    confidenceTier: 'reported',
    coverage: 'Third-party results table for Euroformula Open 2023 Round 7 Race 2 at Mugello.',
    rawArtifactPath: 'data/career/raw/career-gaps/speedsport-euroformula-2023-22-mugello.html',
    notes: 'Reported only.'
  },
  {
    id: 'source_formula_scout_euroformula_2023_mugello_report',
    sourceType: 'press_article',
    sourceName: 'Formula Scout Euroformula Open 2023 Mugello race reports (article 111697)',
    url: 'https://www.formulascout.com/?p=111697',
    confidenceTier: 'reported',
    coverage: 'Press report of Euroformula Open 2023 Round 7 at Mugello naming Bryce Aron in both races.',
    rawArtifactPath: null,
    notes: 'Reported only; cited in MISSING-RACES-CHECK.md. Not saved.'
  }
];

const gaps = [
  {
    id: 'gap_career_race_scca_2019_homestead_race_1_no_sheet',
    level: 'B',
    date: '2019-01-04/2019-01-06',
    venue: 'Homestead-Miami Speedway',
    country: 'United States',
    series: 'SCCA U.S. Majors Tour, Southeast Conference, Formula F',
    known: { classStart: 5, classFinish: 4, overallFinish: null, fieldSize: null },
    evidenceRefs: ['source_scca_2019_southeast_conference_report'],
    description: 'Homestead-Miami, January 2019, race 1 of the weekend: the official SCCA Southeast Conference report lists Bryce 5th on the Formula F grid and 4th in class at the finish ("(5) 4"). No race sheet was found, so laps, time, overall finish and field size are unknown. Counted in no career figure.'
  },
  {
    id: 'gap_career_race_scca_2019_homestead_race_2_no_sheet',
    level: 'B',
    date: '2019-01-04/2019-01-06',
    venue: 'Homestead-Miami Speedway',
    country: 'United States',
    series: 'SCCA U.S. Majors Tour, Southeast Conference, Formula F',
    known: { classStart: 4, classFinish: 8, overallFinish: null, fieldSize: null, pointsScored: false },
    evidenceRefs: ['source_scca_2019_southeast_conference_report'],
    description: 'Homestead-Miami, January 2019, race 2: the official SCCA Southeast Conference report lists Bryce 4th on the Formula F grid and 8th in class, with no points ("(4) 8*"). No race sheet was found. Counted in no career figure.'
  },
  {
    id: 'gap_career_race_euroformula_2023_mugello_race_1_reported_only',
    level: 'C',
    date: '2023-09-30',
    venue: 'Mugello Circuit',
    country: 'Italy',
    series: 'Euroformula Open 2023 Round 7, Motopark car 23',
    known: { start: 5, finish: 5, fieldSize: null },
    evidenceRefs: ['source_speedsport_euroformula_2023_mugello_race_1', 'source_formula_scout_euroformula_2023_mugello_report'],
    description: 'Mugello, September 30, 2023, Euroformula Open Round 7 Race 1: reported 5th from 5th by Formula Scout and Speedsport Magazine. The official classification was not found. Counted in no career figure.'
  },
  {
    id: 'gap_career_race_euroformula_2023_mugello_race_2_reported_only',
    level: 'C',
    date: '2023-10-01',
    venue: 'Mugello Circuit',
    country: 'Italy',
    series: 'Euroformula Open 2023 Round 7, Motopark car 23',
    known: { start: 2, finish: 8, lapsDown: 1, fieldSize: null },
    evidenceRefs: ['source_speedsport_euroformula_2023_mugello_race_2', 'source_formula_scout_euroformula_2023_mugello_report'],
    description: 'Mugello, October 1, 2023, Euroformula Open Round 7 Race 2 (reverse grid): reported 8th from 2nd, one lap down. The official classification was not found. Counted in no career figure.'
  }
];

const main = async () => {
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
  const retrievedAt = new Date().toISOString();
  const evidenceIds = new Set(evidence.map((row) => row.id));
  const gapIds = new Set(gaps.map((row) => row.id));
  dataset.sourceEvidence = [
    ...dataset.sourceEvidence.filter((row) => !evidenceIds.has(row.id)),
    ...evidence.map((row) => ({
      ...row,
      retrievedAt,
      publishedAt: null,
      accessedBy,
      licenseNotes: 'Public pages and PDFs; store extracted facts, source URLs, and raw copies only in the private overlay.',
      parser: accessedBy
    }))
  ].sort((a, b) => a.id.localeCompare(b.id));
  dataset.gaps = [
    ...dataset.gaps.filter((row) => !gapIds.has(row.id)),
    ...gaps.map((row) => ({
      id: row.id,
      scope: 'career_dataset:races_without_official_classification',
      status: 'open',
      description: row.description,
      provenanceRefs: row.evidenceRefs,
      raw: {
        evidenceLevel: row.level,
        date: row.date,
        venue: row.venue,
        country: row.country,
        series: row.series,
        known: row.known,
        countedInCareerFigures: false
      }
    }))
  ];
  await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`);
  const report = { checkedAt: retrievedAt, gapsWritten: gaps.length, sourceEvidenceWritten: evidence.length, gapIds: [...gapIds] };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
