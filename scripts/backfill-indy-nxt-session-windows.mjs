import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/indy-nxt/racecontrol');
const weekendScheduleBaseDir = join(root, 'data/career/raw/indy-nxt/weekend-schedules');
const trackActivityRawPath = join(rawDir, 'trackactivityleaderboardfeed_nxt.json');
const scheduleRawPath = join(rawDir, 'schedulefeed_nxt.json');
const reportPath = join(root, 'data/career/reports/indy-nxt-session-window-backfill-report.json');
const trackActivitySourceUrl = 'https://indycar.blob.core.windows.net/racecontrol/trackactivityleaderboardfeed_nxt.json';
const scheduleSourceUrl = 'https://indycar.blob.core.windows.net/racecontrol/schedulefeed_nxt.json';
const refresh = process.argv.includes('--refresh');
const execFileAsync = promisify(execFile);
const pdfToTextBin = process.env.PDFTOTEXT_BIN ?? 'pdftotext';
const pdfToPpmBin = process.env.PDFTOPPM_BIN ?? 'pdftoppm';
const tesseractBin = process.env.TESSERACT_BIN ?? 'tesseract';

const raceControlEventTrackIds = {
  5545: 'track_road_america',
  5537: 'track_road_america',
  5544: 'track_mid_ohio_sports_car_course',
  5543: 'track_mid_ohio_sports_car_course',
  5538: 'track_nashville_superspeedway',
  5547: 'track_portland_international_raceway',
  5540: 'track_the_milwaukee_mile',
  5542: 'track_weathertech_raceway_laguna_seca',
  5541: 'track_weathertech_raceway_laguna_seca'
};

const officialWeekendSchedules2024 = [
  {
    year: 2024,
    key: 'stp',
    sourceName: 'INDYCAR 2024 St. Petersburg weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2024/NICS/01-STP/indycar-weekendschedule-STP.pdf',
    timeZoneLabel: 'Eastern',
    entries: [
      { sessionId: 'session_indy_nxt_2024_6328', dateHeader: 'FRIDAY, MARCH 8', sourceLabel: 'PRACTICE 1', scheduledStart: '2024-03-08T13:35:00', fragments: ['FIRESTONE GRAND PRIX OF ST. PETERSBURG', 'FRIDAY, MARCH 8', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '1:35 PM'] },
      { sessionId: 'session_indy_nxt_2024_6329', dateHeader: 'SATURDAY, MARCH 9', sourceLabel: 'PRACTICE 2', scheduledStart: '2024-03-09T08:25:00', fragments: ['SATURDAY, MARCH 9', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '8:25 AM'] },
      { sessionId: 'session_indy_nxt_2024_6324', dateHeader: 'SUNDAY, MARCH 10', sourceLabel: 'GRAND PRIX OF ST. PETERSBURG', scheduledStart: '2024-03-10T10:00:00', listedSecondTime: '10:05 AM', fragments: ['SUNDAY, MARCH 10', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF ST.', 'PETERSBURG', '10:00 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2024_6330', 'session_indy_nxt_2024_6346', 'session_indy_nxt_2024_6536'] }
    ]
  },
  {
    year: 2024,
    key: 'ala',
    sourceName: 'INDYCAR 2024 Alabama weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2024/NICS/04-ALA/indycar-weekendschedule-ALA24.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2024_6354', dateHeader: 'FRIDAY, APRIL 26', sourceLabel: 'PRACTICE 1', scheduledStart: '2024-04-26T13:30:00', fragments: ['CHILDREN’S OF ALABAMA INDY GRAND PRIX', 'FRIDAY, APRIL 26', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '1:30 PM'] },
      { sessionId: 'session_indy_nxt_2024_6355', dateHeader: 'SATURDAY, APRIL 27', sourceLabel: 'PRACTICE 2', scheduledStart: '2024-04-27T10:05:00', fragments: ['SATURDAY, APRIL 27', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '10:05 AM'] },
      { sessionId: 'session_indy_nxt_2024_6314', dateHeader: 'SUNDAY, APRIL 28', sourceLabel: 'GRAND PRIX OF ALABAMA', scheduledStart: '2024-04-28T10:05:00', listedSecondTime: '10:10 AM', fragments: ['SUNDAY, APRIL 28', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF ALABAMA', '10:05 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2024_6356', 'session_indy_nxt_2024_6357', 'session_indy_nxt_2024_6537'] }
    ]
  },
  {
    year: 2024,
    key: 'ims',
    sourceName: 'INDYCAR 2024 IMS road course weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2024/NICS/05-IMSRC/indycar-weekendschedule-IMSRC24.pdf',
    timeZoneLabel: 'Eastern',
    entries: [
      { sessionId: 'session_indy_nxt_2024_6365', dateHeader: 'FRIDAY, MAY 10', sourceLabel: 'PRACTICE', scheduledStart: '2024-05-10T11:05:00', fragments: ['SONSIO GRAND PRIX', 'FRIDAY, MAY 10', 'INDY NXT BY FIRESTONE', 'PRACTICE', '11:05 AM'] },
      { sessionId: 'session_indy_nxt_2024_6315', dateHeader: 'FRIDAY, MAY 10', sourceLabel: 'INDIANAPOLIS GRAND PRIX RACE 1', scheduledStart: '2024-05-10T18:10:00', listedSecondTime: '6:20 PM', fragments: ['FRIDAY, MAY 10', 'INDY NXT BY FIRESTONE', 'INDIANAPOLIS GRAND PRIX', 'RACE 1', '6:10 PM'] },
      { sessionId: 'session_indy_nxt_2024_6325', dateHeader: 'SATURDAY, MAY 11', sourceLabel: 'INDIANAPOLIS GRAND PRIX RACE 2', scheduledStart: '2024-05-11T13:00:00', listedSecondTime: '1:10 PM', fragments: ['SATURDAY, MAY 11', 'INDY NXT BY FIRESTONE', 'INDIANAPOLIS GRAND PRIX', 'RACE 2', '1:00 PM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_race_1_and_race_2_group_sessions', canonicalSessionIds: ['session_indy_nxt_2024_6366', 'session_indy_nxt_2024_6367', 'session_indy_nxt_2024_6389', 'session_indy_nxt_2024_6390', 'session_indy_nxt_2024_6538', 'session_indy_nxt_2024_6539'] }
    ]
  },
  {
    year: 2024,
    key: 'det',
    sourceName: 'INDYCAR 2024 Detroit weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2024/NICS/07-DET/indycar-weekendschedule-DET24.pdf',
    timeZoneLabel: 'Eastern',
    entries: [
      { sessionId: 'session_indy_nxt_2024_6391', dateHeader: 'FRIDAY, MAY 31', sourceLabel: 'PRACTICE 1', scheduledStart: '2024-05-31T13:50:00', fragments: ['CHEVROLET DETROIT GRAND PRIX', 'FRIDAY, MAY 31', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '1:50 PM'] },
      { sessionId: 'session_indy_nxt_2024_6392', dateHeader: 'SATURDAY, JUNE 1', sourceLabel: 'PRACTICE 2', scheduledStart: '2024-06-01T08:00:00', fragments: ['SATURDAY, JUNE 1', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '8:00 AM'] },
      { sessionId: 'session_indy_nxt_2024_6326', dateHeader: 'SUNDAY, JUNE 2', sourceLabel: 'DETROIT GRAND PRIX', scheduledStart: '2024-06-02T10:20:00', listedSecondTime: '10:30 AM', fragments: ['SUNDAY, JUNE 2', 'INDY NXT BY FIRESTONE', 'DETROIT GRAND PRIX', '10:20 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2024_6393', 'session_indy_nxt_2024_6394', 'session_indy_nxt_2024_6540'] }
    ]
  },
  {
    year: 2024,
    key: 'ra',
    sourceName: 'INDYCAR 2024 Road America weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2024/NICS/08-RA/indycar-weekendschedule-RA24.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2024_6402', dateHeader: 'FRIDAY, JUNE 7', sourceLabel: 'PRACTICE 1', scheduledStart: '2024-06-07T13:50:00', fragments: ['XPEL GRAND PRIX AT ROAD AMERICA', 'FRIDAY, JUNE 7', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '1:50 PM'] },
      { sessionId: 'session_indy_nxt_2024_6403', dateHeader: 'SATURDAY, JUNE 8', sourceLabel: 'PRACTICE 2', scheduledStart: '2024-06-08T09:00:00', fragments: ['SATURDAY, JUNE 8', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '9:00 AM'] },
      { sessionId: 'session_indy_nxt_2024_6316', dateHeader: 'SUNDAY, JUNE 9', sourceLabel: 'GRAND PRIX AT ROAD AMERICA', scheduledStart: '2024-06-09T12:05:00', listedSecondTime: '12:15 PM', fragments: ['SUNDAY, JUNE 9', 'INDY NXT BY FIRESTONE', 'GRAND PRIX AT ROAD AMERICA', '12:05 PM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2024_6404', 'session_indy_nxt_2024_6405', 'session_indy_nxt_2024_6541'] }
    ]
  },
  {
    year: 2024,
    key: 'lag',
    sourceName: 'INDYCAR 2024 Laguna Seca weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2024/NICS/09-LAG/indycar-weekendschedule-LAG24.pdf',
    timeZoneLabel: 'Pacific',
    entries: [
      { sessionId: 'session_indy_nxt_2024_6413', dateHeader: 'FRIDAY, JUNE 21', sourceLabel: 'PRACTICE 1', scheduledStart: '2024-06-21T13:10:00', fragments: ['FIRESTONE GRAND PRIX OF MONTEREY', 'FRIDAY, JUNE 21', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '1:10 PM'] },
      { sessionId: 'session_indy_nxt_2024_6414', dateHeader: 'FRIDAY, JUNE 21', sourceLabel: 'PRACTICE 2', scheduledStart: '2024-06-21T15:40:00', fragments: ['FRIDAY, JUNE 21', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '3:40 PM'] },
      { sessionId: 'session_indy_nxt_2024_6317', dateHeader: 'SATURDAY, JUNE 22', sourceLabel: 'GRAND PRIX OF MONTEREY RACE 1', scheduledStart: '2024-06-22T12:25:00', listedSecondTime: '12:35 PM', fragments: ['SATURDAY, JUNE 22', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF MONTEREY', 'RACE 1', '12:25 PM'] },
      { sessionId: 'session_indy_nxt_2024_6327', dateHeader: 'SUNDAY, JUNE 23', sourceLabel: 'GRAND PRIX OF MONTEREY RACE 2', scheduledStart: '2024-06-23T12:55:00', listedSecondTime: '1:05 PM', fragments: ['SUNDAY, JUNE 23', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF MONTEREY', 'RACE 2', '12:55 PM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_race_1_and_race_2_group_sessions', canonicalSessionIds: ['session_indy_nxt_2024_6415', 'session_indy_nxt_2024_6416', 'session_indy_nxt_2024_6417', 'session_indy_nxt_2024_6418', 'session_indy_nxt_2024_6542', 'session_indy_nxt_2024_6543'] }
    ]
  },
  {
    year: 2024,
    key: 'mid',
    sourceName: 'INDYCAR 2024 Mid-Ohio weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2024/NICS/10-MID/indycar-weekendschedule-MID24.pdf',
    timeZoneLabel: 'Eastern',
    entries: [
      { sessionId: 'session_indy_nxt_2024_6426', dateHeader: 'FRIDAY, JULY 5', sourceLabel: 'PRACTICE 1', scheduledStart: '2024-07-05T14:05:00', fragments: ['HONDA INDY 200 AT MID-OHIO', 'FRIDAY, JULY 5', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '2:05 PM'] },
      { sessionId: 'session_indy_nxt_2024_6427', dateHeader: 'SATURDAY, JULY 6', sourceLabel: 'PRACTICE 2', scheduledStart: '2024-07-06T09:40:00', fragments: ['SATURDAY, JULY 6', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '9:40 AM'] },
      { sessionId: 'session_indy_nxt_2024_6318', dateHeader: 'SUNDAY, JULY 7', sourceLabel: 'GRAND PRIX AT MID-OHIO', scheduledStart: '2024-07-07T11:15:00', listedSecondTime: '11:25 AM', fragments: ['SUNDAY, JULY 7', 'INDY NXT BY FIRESTONE', 'GRAND PRIX AT MID-OHIO', '11:15 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2024_6428', 'session_indy_nxt_2024_6429', 'session_indy_nxt_2024_6544'] }
    ]
  },
  {
    year: 2024,
    key: 'iow',
    sourceName: 'INDYCAR 2024 Iowa weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2024/NICS/11-12-IOW/indycar-weekendschedule-IOW24.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2024_6437', dateHeader: 'FRIDAY, JULY 12', sourceLabel: 'PRACTICE', scheduledStart: '2024-07-12T13:00:00', fragments: ['HY-VEE INDYCAR RACE WEEKEND', 'FRIDAY, JULY 12', 'INDY NXT BY FIRESTONE', 'PRACTICE', '1:00 PM'] },
      { sessionId: 'session_indy_nxt_2024_6438', dateHeader: 'FRIDAY, JULY 12', sourceLabel: 'QUALIFICATIONS', scheduledStart: '2024-07-12T17:30:00', fragments: ['FRIDAY, JULY 12', 'INDY NXT BY FIRESTONE', 'QUALIFICATIONS', '5:30 PM'] },
      { sessionId: 'session_indy_nxt_2024_6319', dateHeader: 'SATURDAY, JULY 13', sourceLabel: 'AT IOWA SPEEDWAY', scheduledStart: '2024-07-13T13:05:00', listedSecondTime: '1:15 PM', fragments: ['SATURDAY, JULY 13', 'INDY NXT BY FIRESTONE', 'AT IOWA SPEEDWAY', '1:05 PM'] }
    ]
  },
  {
    year: 2024,
    key: 'stl',
    sourceName: 'INDYCAR 2024 WWTR weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2024/NICS/14-STL/indycar-weekendschedule-STL24.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2024_6480', dateHeader: 'FRIDAY, AUGUST 16', sourceLabel: 'PRACTICE', scheduledStart: '2024-08-16T14:15:00', fragments: ['BOMMARITO AUTOMOTIVE GROUP 500', 'FRIDAY, AUGUST 16', 'INDY NXT BY FIRESTONE', 'PRACTICE', '2:15 PM'] },
      { sessionId: 'session_indy_nxt_2024_6481', dateHeader: 'FRIDAY, AUGUST 16', sourceLabel: 'QUALIFICATIONS', scheduledStart: '2024-08-16T17:45:00', fragments: ['FRIDAY, AUGUST 16', 'INDY NXT BY FIRESTONE', 'QUALIFICATIONS', '5:45 PM'] },
      { sessionId: 'session_indy_nxt_2024_6320', dateHeader: 'SATURDAY, AUGUST 17', sourceLabel: 'OUTFRONT SHOWDOWN', scheduledStart: '2024-08-17T14:55:00', listedSecondTime: '3:05 PM', fragments: ['SATURDAY, AUGUST 17', 'INDY NXT BY FIRESTONE', 'OUTFRONT SHOWDOWN', '2:55 PM'] }
    ]
  },
  {
    year: 2024,
    key: 'por',
    sourceName: 'INDYCAR 2024 Portland weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2024/NICS/15-POR/indycar-weekendschedule-POR24.pdf',
    timeZoneLabel: 'Pacific',
    entries: [
      { sessionId: 'session_indy_nxt_2024_6494', dateHeader: 'FRIDAY, AUGUST 23', sourceLabel: 'PRACTICE 1', scheduledStart: '2024-08-23T13:45:00', fragments: ['BITNILE.COM GRAND PRIX OF PORTLAND', 'FRIDAY, AUGUST 23', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '1:45 PM'] },
      { sessionId: 'session_indy_nxt_2024_6495', dateHeader: 'SATURDAY, AUGUST 24', sourceLabel: 'PRACTICE 2', scheduledStart: '2024-08-24T11:20:00', fragments: ['SATURDAY, AUGUST 24', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '11:20 AM'] },
      { sessionId: 'session_indy_nxt_2024_6321', dateHeader: 'SUNDAY, AUGUST 25', sourceLabel: 'GRAND PRIX OF PORTLAND', scheduledStart: '2024-08-25T10:10:00', listedSecondTime: '10:20 AM', fragments: ['SUNDAY, AUGUST 25', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF PORTLAND', '10:10 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2024_6496', 'session_indy_nxt_2024_6513', 'session_indy_nxt_2024_6545'] }
    ]
  },
  {
    year: 2024,
    key: 'mil',
    sourceName: 'INDYCAR 2024 Milwaukee weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2024/NICS/16-17-MIL/indycar-weekendschedule-MIL24.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2024_6505', dateHeader: 'FRIDAY, AUGUST 30', sourceLabel: 'PRACTICE', scheduledStart: '2024-08-30T13:30:00', fragments: ['HY-VEE MILWAUKEE MILE', 'FRIDAY, AUGUST 30', 'INDY NXT BY FIRESTONE', 'PRACTICE', '1:30 PM'] },
      { sessionId: 'session_indy_nxt_2024_6506', dateHeader: 'SATURDAY, AUGUST 31', sourceLabel: 'QUALIFICATIONS', scheduledStart: '2024-08-31T12:00:00', fragments: ['SATURDAY, AUGUST 31', 'INDY NXT BY FIRESTONE', 'QUALIFICATIONS', '12:00 PM'] },
      { sessionId: 'session_indy_nxt_2024_6322', dateHeader: 'SATURDAY, AUGUST 31', sourceLabel: 'AT THE MILWAUKEE MILE', scheduledStart: '2024-08-31T14:50:00', listedSecondTime: '3:00 PM', fragments: ['SATURDAY, AUGUST 31', 'INDY NXT BY FIRESTONE AT', 'THE MILWAUKEE MILE', '2:50 PM'] }
    ]
  },
  {
    year: 2024,
    key: 'nsh',
    sourceName: 'INDYCAR 2024 Nashville weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2024/NICS/18-NSH/indycar-weekendschedule-NSH24.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2024_6488', dateHeader: 'SATURDAY, SEPTEMBER 14', sourceLabel: 'PRACTICE 1', scheduledStart: '2024-09-14T09:00:00', fragments: ['BIG MACHINE MUSIC CITY GRAND PRIX', 'SATURDAY, SEPTEMBER 14', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '9:00 AM'] },
      { sessionId: 'session_indy_nxt_2024_6490', dateHeader: 'SATURDAY, SEPTEMBER 14', sourceLabel: 'PRACTICE 2', scheduledStart: '2024-09-14T12:00:00', fragments: ['SATURDAY, SEPTEMBER 14', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '12:00 PM'] },
      { sessionId: 'session_indy_nxt_2024_6489', dateHeader: 'SATURDAY, SEPTEMBER 14', sourceLabel: 'QUALIFICATIONS', scheduledStart: '2024-09-14T14:45:00', fragments: ['SATURDAY, SEPTEMBER 14', 'INDY NXT BY FIRESTONE', 'QUALIFICATIONS', '2:45 PM'] },
      { sessionId: 'session_indy_nxt_2024_6323', dateHeader: 'SUNDAY, SEPTEMBER 15', sourceLabel: 'MUSIC CITY GRAND PRIX', scheduledStart: '2024-09-15T10:50:00', listedSecondTime: '11:00 PM', fragments: ['SUNDAY, SEPTEMBER 15', 'INDY NXT BY FIRESTONE', 'MUSIC CITY GRAND PRIX', '10:50 AM'] }
    ]
  }
];

const officialWeekendSchedules2025 = [
  {
    key: 'stp',
    sourceName: 'INDYCAR 2025 St. Petersburg weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2025/NICS/01-STP/indycar-weekendschedule-STP25.pdf',
    timeZoneLabel: 'Eastern',
    entries: [
      { sessionId: 'session_indy_nxt_2025_6515', dateHeader: 'FRIDAY, FEBRUARY 28', sourceLabel: 'PRACTICE 1', scheduledStart: '2025-02-28T14:00:00', fragments: ['FIRESTONE GRAND PRIX OF ST. PETERSBURG', 'FRIDAY, FEBRUARY 28', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '2:00 PM'] },
      { sessionId: 'session_indy_nxt_2025_6516', dateHeader: 'SATURDAY, MARCH 1', sourceLabel: 'PRACTICE 2', scheduledStart: '2025-03-01T09:00:00', fragments: ['SATURDAY, MARCH 1', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '9:00 AM'] },
      { sessionId: 'session_indy_nxt_2025_6446', dateHeader: 'SUNDAY, MARCH 2', sourceLabel: 'GRAND PRIX OF ST. PETERSBURG', scheduledStart: '2025-03-02T10:00:00', listedSecondTime: '10:10 AM', fragments: ['SUNDAY, MARCH 2', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF ST. PETERSBURG', '10:00 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2025_6517', 'session_indy_nxt_2025_6518'] }
    ]
  },
  {
    key: 'ala',
    sourceName: 'INDYCAR 2025 Alabama weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2025/NICS/04-ALA/indycar-weekendschedule-ALA25.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2025_6611', dateHeader: 'FRIDAY, MAY 2', sourceLabel: 'PRACTICE 1', scheduledStart: '2025-05-02T13:30:00', fragments: ['CHILDREN’S OF ALABAMA INDY GRAND PRIX', 'FRIDAY, MAY 2', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '1:30 PM'] },
      { sessionId: 'session_indy_nxt_2025_6612', dateHeader: 'SATURDAY, MAY 3', sourceLabel: 'PRACTICE 2', scheduledStart: '2025-05-03T09:00:00', fragments: ['SATURDAY, MAY 3', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '9:00 AM'] },
      { sessionId: 'session_indy_nxt_2025_6445', dateHeader: 'SUNDAY, MAY 4', sourceLabel: 'GRAND PRIX OF ALABAMA', scheduledStart: '2025-05-04T10:30:00', listedSecondTime: '10:36 AM', fragments: ['SUNDAY, MAY 4', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF ALABAMA', '10:30 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2025_6613', 'session_indy_nxt_2025_6614', 'session_indy_nxt_2025_6592'] }
    ]
  },
  {
    key: 'ims',
    sourceName: 'INDYCAR 2025 IMS road course weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2025/NICS/05-IMSRC/indycar-weekendschedule-IMSRC25.pdf',
    timeZoneLabel: 'Eastern',
    entries: [
      { sessionId: 'session_indy_nxt_2025_6627', dateHeader: 'FRIDAY, MAY 9', sourceLabel: 'PRACTICE', scheduledStart: '2025-05-09T11:00:00', fragments: ['SONSIO GRAND PRIX', 'FRIDAY, MAY 9', 'INDY NXT BY FIRESTONE', 'PRACTICE', '11:00 AM'] },
      { sessionId: 'session_indy_nxt_2025_6444', dateHeader: 'FRIDAY, MAY 9', sourceLabel: 'INDIANAPOLIS GRAND PRIX RACE 1', scheduledStart: '2025-05-09T19:00:00', listedSecondTime: '7:06 PM', fragments: ['FRIDAY, MAY 9', 'INDY NXT BY FIRESTONE', 'INDIANAPOLIS GRAND PRIX', 'RACE 1', '7:00 PM'] },
      { sessionId: 'session_indy_nxt_2025_6443', dateHeader: 'SATURDAY, MAY 10', sourceLabel: 'INDIANAPOLIS GRAND PRIX RACE 2', scheduledStart: '2025-05-10T13:00:00', listedSecondTime: '1:06 PM', fragments: ['SATURDAY, MAY 10', 'INDY NXT BY FIRESTONE', 'INDIANAPOLIS GRAND PRIX', 'RACE 2', '1:00 PM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_race_1_and_race_2_group_sessions', canonicalSessionIds: ['session_indy_nxt_2025_6628', 'session_indy_nxt_2025_6629', 'session_indy_nxt_2025_6630', 'session_indy_nxt_2025_6631', 'session_indy_nxt_2025_6591', 'session_indy_nxt_2025_6590'] }
    ]
  },
  {
    key: 'det',
    sourceName: 'INDYCAR 2025 Detroit weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2025/NICS/07-DET/indycar-weekendschedule-DET25.pdf',
    timeZoneLabel: 'Eastern',
    entries: [
      { sessionId: 'session_indy_nxt_2025_6639', dateHeader: 'FRIDAY, MAY 30', sourceLabel: 'PRACTICE 1', scheduledStart: '2025-05-30T14:00:00', fragments: ['CHEVROLET DETROIT GRAND PRIX', 'FRIDAY, MAY 30', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '2:00 PM'] },
      { sessionId: 'session_indy_nxt_2025_6640', dateHeader: 'SATURDAY, MAY 31', sourceLabel: 'PRACTICE 2', scheduledStart: '2025-05-31T08:00:00', fragments: ['SATURDAY, MAY 31', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '8:00 AM'] },
      { sessionId: 'session_indy_nxt_2025_6455', dateHeader: 'SUNDAY, JUNE 1', sourceLabel: 'DETROIT GRAND PRIX', scheduledStart: '2025-06-01T10:30:00', listedSecondTime: '10:36 PM', fragments: ['SUNDAY, JUNE 1', 'INDY NXT BY FIRESTONE', 'DETROIT GRAND PRIX', '10:30 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2025_6641', 'session_indy_nxt_2025_6642', 'session_indy_nxt_2025_6600'] }
    ]
  },
  {
    key: 'stl',
    sourceName: 'INDYCAR 2025 WWTR weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2025/NICS/08-STL/indycar-weekendschedule-V2-STL25.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2025_6667', dateHeader: 'SATURDAY, JUNE 14', sourceLabel: 'PRACTICE', scheduledStart: '2025-06-14T15:15:00', fragments: ['SATURDAY, JUNE 14', 'INDY NXT BY FIRESTONE', 'PRACTICE', '3:15 PM'] },
      { sessionId: 'session_indy_nxt_2025_6599', dateHeader: 'SATURDAY, JUNE 14', sourceLabel: 'QUALIFICATIONS', scheduledStart: '2025-06-14T19:00:00', fragments: ['SATURDAY, JUNE 14', 'INDY NXT BY FIRESTONE', 'QUALIFICATIONS', '7:00 PM'] },
      { sessionId: 'session_indy_nxt_2025_6454', dateHeader: 'SUNDAY, JUNE 15', sourceLabel: 'AT WORLD WIDE TECHNOLOGY RACEWAY', scheduledStart: '2025-06-15T15:30:00', listedSecondTime: '3:35 PM', fragments: ['SUNDAY, JUNE 15', 'INDY NXT BY FIRESTONE', 'TECHNOLOGY RACEWAY', '3:30 PM'] }
    ]
  },
  {
    key: 'ra',
    sourceName: 'INDYCAR 2025 Road America weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2025/NICS/09-RA/indycar-weekendschedule-RA25.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2025_6675', dateHeader: 'FRIDAY, JUNE 20', sourceLabel: 'PRACTICE 1', scheduledStart: '2025-06-20T14:30:00', fragments: ['XPEL GRAND PRIX AT ROAD AMERICA', 'FRIDAY, JUNE 20', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '2:30 PM'] },
      { sessionId: 'session_indy_nxt_2025_6676', dateHeader: 'SATURDAY, JUNE 21', sourceLabel: 'PRACTICE 2', scheduledStart: '2025-06-21T09:00:00', fragments: ['SATURDAY, JUNE 21', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '9:00 AM'] },
      { sessionId: 'session_indy_nxt_2025_6453', dateHeader: 'SUNDAY, JUNE 22', sourceLabel: 'GRAND PRIX AT ROAD AMERICA', scheduledStart: '2025-06-22T10:00:00', listedSecondTime: '10:06 PM', fragments: ['SUNDAY, JUNE 22', 'INDY NXT BY FIRESTONE', 'GRAND PRIX AT ROAD AMERICA', '10:00 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2025_6677', 'session_indy_nxt_2025_6678', 'session_indy_nxt_2025_6598'] }
    ]
  },
  {
    key: 'mid',
    sourceName: 'INDYCAR 2025 Mid-Ohio weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2025/NICS/10-MID/indycar-weekendschedule-MID25.pdf',
    timeZoneLabel: 'Eastern',
    entries: [
      { sessionId: 'session_indy_nxt_2025_6679', dateHeader: 'FRIDAY, JULY 4', sourceLabel: 'PRACTICE 1', scheduledStart: '2025-07-04T15:00:00', fragments: ['THE HONDA INDY 200 AT MID-OHIO', 'FRIDAY, JULY 4', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '3:00 PM'] },
      { sessionId: 'session_indy_nxt_2025_6680', dateHeader: 'SATURDAY, JULY 5', sourceLabel: 'PRACTICE 2', scheduledStart: '2025-07-05T08:30:00', fragments: ['SATURDAY, JULY 5', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '8:30 AM'] },
      { sessionId: 'session_indy_nxt_2025_6452', dateHeader: 'SUNDAY, JULY 6', sourceLabel: 'GRAND PRIX AT MID-OHIO', scheduledStart: '2025-07-06T10:30:00', listedSecondTime: '10:36 AM', fragments: ['SUNDAY, JULY 6', 'INDY NXT BY FIRESTONE', 'GRAND PRIX AT MID-OHIO', '10:30 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2025_6681', 'session_indy_nxt_2025_6682', 'session_indy_nxt_2025_6597'] }
    ]
  },
  {
    key: 'iow',
    sourceName: 'INDYCAR 2025 Iowa weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2025/NICS/11-12-IOW/indycar-weekendschedule-V2-IOW25.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2025_6690', dateHeader: 'FRIDAY, JULY 11', sourceLabel: 'PRACTICE', scheduledStart: '2025-07-11T13:30:00', fragments: ['THE SUKUP INDYCAR RACE WEEKEND AT IOWA SPEEDWAY', 'FRIDAY, JULY 11', 'INDY NXT BY FIRESTONE', 'PRACTICE', '1:30 PM'] },
      { sessionId: 'session_indy_nxt_2025_6451', dateHeader: 'SATURDAY, JULY 12', sourceLabel: 'AT IOWA SPEEDWAY', scheduledStart: '2025-07-12T11:00:00', listedSecondTime: '11:06 AM', fragments: ['SATURDAY, JULY 12', 'INDY NXT BY FIRESTONE', 'AT IOWA SPEEDWAY', '11:00 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'not_present_in_official_weekend_schedule_pdf', canonicalSessionIds: ['session_indy_nxt_2025_6596'] }
    ]
  },
  {
    key: 'lag',
    sourceName: 'INDYCAR 2025 Laguna Seca weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2025/NICS/14-LAG/indycar-weekendschedule-V3-LAG25.pdf',
    timeZoneLabel: 'Pacific',
    entries: [
      { sessionId: 'session_indy_nxt_2025_6707', dateHeader: 'FRIDAY, JULY 25', sourceLabel: 'PRACTICE 1', scheduledStart: '2025-07-25T13:00:00', fragments: ['JAVA HOUSE GRAND PRIX OF MONTEREY', 'FRIDAY, JULY 25', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '1:00 PM'] },
      { sessionId: 'session_indy_nxt_2025_6708', dateHeader: 'FRIDAY, JULY 25', sourceLabel: 'PRACTICE 2', scheduledStart: '2025-07-25T15:30:00', fragments: ['FRIDAY, JULY 25', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '3:30 PM'] },
      { sessionId: 'session_indy_nxt_2025_6442', dateHeader: 'SATURDAY, JULY 26', sourceLabel: 'GRAND PRIX OF MONTEREY RACE 1', scheduledStart: '2025-07-26T13:30:00', listedSecondTime: '1:36 PM', fragments: ['SATURDAY, JULY 26', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF MONTEREY', 'RACE 1', '1:30 PM'] },
      { sessionId: 'session_indy_nxt_2025_6450', dateHeader: 'SUNDAY, JULY 27', sourceLabel: 'GRAND PRIX OF MONTEREY RACE 2', scheduledStart: '2025-07-27T15:30:00', listedSecondTime: '3:36 PM', fragments: ['SUNDAY, JULY 27', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF MONTEREY', 'RACE 2', '3:30 PM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_race_1_and_race_2_group_sessions', canonicalSessionIds: ['session_indy_nxt_2025_6709', 'session_indy_nxt_2025_6710', 'session_indy_nxt_2025_6711', 'session_indy_nxt_2025_6712', 'session_indy_nxt_2025_6589', 'session_indy_nxt_2025_6595'] }
    ]
  },
  {
    key: 'por',
    sourceName: 'INDYCAR 2025 Portland weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2025/NICS/15-POR/indycar-weekendschedule-V2-POR25.pdf',
    timeZoneLabel: 'Pacific',
    entries: [
      { sessionId: 'session_indy_nxt_2025_6713', dateHeader: 'FRIDAY, AUGUST 8', sourceLabel: 'PRACTICE 1', scheduledStart: '2025-08-08T13:00:00', fragments: ['BITNILE.COM GRAND PRIX OF PORTLAND', 'FRIDAY, AUGUST 8', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '1:00 PM'] },
      { sessionId: 'session_indy_nxt_2025_6714', dateHeader: 'SATURDAY, AUGUST 9', sourceLabel: 'PRACTICE 2', scheduledStart: '2025-08-09T13:30:00', fragments: ['SATURDAY, AUGUST 9', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '1:30 PM'] },
      { sessionId: 'session_indy_nxt_2025_6449', dateHeader: 'SUNDAY, AUGUST 10', sourceLabel: 'GRAND PRIX AT PORTLAND', scheduledStart: '2025-08-10T10:00:00', listedSecondTime: '10:06 AM', fragments: ['SUNDAY, AUGUST 10', 'INDY NXT BY FIRESTONE', 'GRAND PRIX AT PORTLAND', '10:00 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2025_6715', 'session_indy_nxt_2025_6716', 'session_indy_nxt_2025_6594'] }
    ]
  },
  {
    key: 'mil',
    sourceName: 'INDYCAR 2025 Milwaukee weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2025/NICS/16-MIL/indycar-weekendschedule-V3-MIL25.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2025_6727', dateHeader: 'SATURDAY, AUGUST 23', sourceLabel: 'PRACTICE', scheduledStart: '2025-08-23T08:00:00', fragments: ['SNAP-ON MILWAUKEE MILE 250', 'SATURDAY, AUGUST 23', 'INDY NXT BY FIRESTONE', 'PRACTICE', '8:00 AM'] },
      { sessionId: 'session_indy_nxt_2025_6588', dateHeader: 'SATURDAY, AUGUST 23', sourceLabel: 'QUALIFICATIONS', scheduledStart: '2025-08-23T14:30:00', fragments: ['SATURDAY, AUGUST 23', 'INDY NXT BY FIRESTONE', 'QUALIFICATIONS', '2:30 PM'] },
      { sessionId: 'session_indy_nxt_2025_6448', dateHeader: 'SUNDAY, AUGUST 24', sourceLabel: 'AT THE MILWAUKEE MILE', scheduledStart: '2025-08-24T10:30:00', listedSecondTime: '10:35 AM', fragments: ['SUNDAY, AUGUST 24', 'INDY NXT BY FIRESTONE', 'AT THE MILWAUKEE MILE', '10:30 AM'] }
    ]
  },
  {
    key: 'nsh',
    sourceName: 'INDYCAR 2025 Nashville weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2025/NICS/17-NSH/indycar-weekendschedule-V2-NSH25.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2025_6731', dateHeader: 'SATURDAY, AUGUST 30', sourceLabel: 'PRACTICE', scheduledStart: '2025-08-30T08:00:00', fragments: ['BORCHETTA BOURBON MUSIC CITY GRAND PRIX', 'SATURDAY, AUGUST 30', 'INDY NXT BY FIRESTONE', 'PRACTICE', '8:00 AM'] },
      { sessionId: 'session_indy_nxt_2025_6593', dateHeader: 'SATURDAY, AUGUST 30', sourceLabel: 'QUALIFICATIONS', scheduledStart: '2025-08-30T11:30:00', fragments: ['SATURDAY, AUGUST 30', 'INDY NXT BY FIRESTONE', 'QUALIFICATIONS', '11:30 AM'] },
      { sessionId: 'session_indy_nxt_2025_6447', dateHeader: 'SUNDAY, AUGUST 31', sourceLabel: 'MUSIC CITY GRAND PRIX', scheduledStart: '2025-08-31T10:30:00', listedSecondTime: '10:35 AM', fragments: ['SUNDAY, AUGUST 31', 'INDY NXT BY FIRESTONE', 'MUSIC CITY GRAND PRIX', '10:30 AM'] }
    ]
  }
];

const officialWeekendSchedules2026 = [
  {
    key: 'stp',
    sourceName: 'INDYCAR 2026 St. Petersburg weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2026/NICS/01-STP/indycar-weekendschedule-STP26.pdf',
    timeZoneLabel: 'Eastern',
    entries: [
      { sessionId: 'session_indy_nxt_2026_6766', dateHeader: 'FRIDAY, FEBRUARY 27', sourceLabel: 'PRACTICE 1', scheduledStart: '2026-02-27T12:30:00', fragments: ['FIRESTONE GRAND PRIX OF ST. PETERSBURG', 'FRIDAY, FEBRUARY 27', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '12:30 PM'] },
      { sessionId: 'session_indy_nxt_2026_6767', dateHeader: 'SATURDAY, FEBRUARY 28', sourceLabel: 'PRACTICE 2', scheduledStart: '2026-02-28T08:30:00', fragments: ['SATURDAY, FEBRUARY 28', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '8:30 AM'] },
      { sessionId: 'session_indy_nxt_2026_6751', dateHeader: 'SUNDAY, MARCH 1', sourceLabel: 'GRAND PRIX OF ST. PETERSBURG', scheduledStart: '2026-03-01T10:00:00', listedSecondTime: '10:10 AM', fragments: ['SUNDAY, MARCH 1', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF ST.', 'PETERSBURG', '10:00 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2026_6768', 'session_indy_nxt_2026_6769', 'session_indy_nxt_2026_6770'] }
    ]
  },
  {
    key: 'arl',
    sourceName: 'INDYCAR 2026 Arlington weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2026/NICS/03-ARL/indycar-weekendschedule-V2-ARL26.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2026_6783', dateHeader: 'FRIDAY, MARCH 13', sourceLabel: 'PRACTICE 1', scheduledStart: '2026-03-13T14:00:00', fragments: ['JAVA HOUSE GRAND PRIX OF ARLINGTON', 'FRIDAY, MARCH 13', 'INDY NXT BY FIRESTONE', 'PRACTICE 1', '2:00 PM'] },
      { sessionId: 'session_indy_nxt_2026_6784', dateHeader: 'SATURDAY, MARCH 14', sourceLabel: 'PRACTICE 2', scheduledStart: '2026-03-14T10:00:00', fragments: ['SATURDAY, MARCH 14', 'INDY NXT BY FIRESTONE', 'PRACTICE 2', '10:00 AM'] },
      { sessionId: 'session_indy_nxt_2026_6753', dateHeader: 'SUNDAY, MARCH 15', sourceLabel: 'GRAND PRIX OF ARLINGTON', scheduledStart: '2026-03-15T09:30:00', listedSecondTime: '9:45 AM', fragments: ['SUNDAY, MARCH 15', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF ARLINGTON', '9:30 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFICATIONS', reason: 'coarse_schedule_label_ambiguous_with_group_qualifying_sessions', canonicalSessionIds: ['session_indy_nxt_2026_6785', 'session_indy_nxt_2026_6786', 'session_indy_nxt_2026_6787'] }
    ]
  },
  {
    key: 'ala',
    sourceName: 'INDYCAR 2026 Alabama weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2026/NICS/04-ALA/indycar-weekendschedule-v2-ALA26.pdf',
    timeZoneLabel: 'Central',
    entries: [
      { sessionId: 'session_indy_nxt_2026_6804', dateHeader: 'FRIDAY, MARCH 27', sourceLabel: 'PRACTICE', scheduledStart: '2026-03-27T13:30:00', fragments: ["CHILDREN'S OF ALABAMA INDY GRAND PRIX", 'FRIDAY, MARCH 27', 'INDY NXT BY FIRESTONE', 'PRACTICE', '1:30 PM'] },
      { sessionId: 'session_indy_nxt_2026_6750', dateHeader: 'SATURDAY, MARCH 28', sourceLabel: 'GRAND PRIX OF ALABAMA RACE 1', scheduledStart: '2026-03-28T12:00:00', listedSecondTime: '12:10 PM', fragments: ['SATURDAY, MARCH 28', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF ALABAMA RACE 1', '12:00 PM'] },
      { sessionId: 'session_indy_nxt_2026_6752', dateHeader: 'SUNDAY, MARCH 29', sourceLabel: 'GRAND PRIX OF ALABAMA RACE 2', scheduledStart: '2026-03-29T10:00:00', listedSecondTime: '10:10 AM', fragments: ['SUNDAY, MARCH 29', 'INDY NXT BY FIRESTONE', 'GRAND PRIX OF ALABAMA RACE 2', '10:00 AM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFYING', reason: 'coarse_schedule_label_ambiguous_with_race_1_and_race_2_group_sessions', canonicalSessionIds: ['session_indy_nxt_2026_6805', 'session_indy_nxt_2026_6806', 'session_indy_nxt_2026_6807', 'session_indy_nxt_2026_6808', 'session_indy_nxt_2026_6809', 'session_indy_nxt_2026_6810'] }
    ]
  },
  {
    key: 'ims',
    sourceName: 'INDYCAR 2026 IMS road course weekend schedule PDF',
    url: 'https://www.indycar.com/-/media/Files/2026/NICS/06-IMSRC/indycar-weekendschedule-v2-IMSRC26.pdf',
    timeZoneLabel: 'Eastern',
    entries: [
      { sessionId: 'session_indy_nxt_2026_6828', dateHeader: 'FRIDAY, MAY 8', sourceLabel: 'PRACTICE', scheduledStart: '2026-05-08T08:00:00', fragments: ['SONSIO GRAND PRIX', 'FRIDAY, MAY 8', 'INDY NXT BY FIRESTONE', 'PRACTICE', '8:00 AM'] },
      { sessionId: 'session_indy_nxt_2026_6756', dateHeader: 'FRIDAY, MAY 8', sourceLabel: 'INDIANAPOLIS GRAND PRIX RACE 1', scheduledStart: '2026-05-08T16:00:00', listedSecondTime: '4:05 PM', fragments: ['FRIDAY, MAY 8', 'INDY NXT BY FIRESTONE', 'INDIANAPOLIS GRAND PRIX RACE 1', '4:00 PM'] },
      { sessionId: 'session_indy_nxt_2026_6765', dateHeader: 'SATURDAY, MAY 9', sourceLabel: 'INDIANAPOLIS GRAND PRIX RACE 2', scheduledStart: '2026-05-09T14:30:00', listedSecondTime: '2:35 PM', fragments: ['SATURDAY, MAY 9', 'INDY NXT BY FIRESTONE', 'INDIANAPOLIS GRAND PRIX RACE 2', '2:30 PM'] }
    ],
    skippedRows: [
      { sourceLabel: 'QUALIFYING', reason: 'coarse_schedule_label_ambiguous_with_race_1_and_race_2_group_sessions', canonicalSessionIds: ['session_indy_nxt_2026_6829', 'session_indy_nxt_2026_6830', 'session_indy_nxt_2026_6831', 'session_indy_nxt_2026_6832', 'session_indy_nxt_2026_6833', 'session_indy_nxt_2026_6834'] }
    ]
  }
];

const officialWeekendSchedules = [
  ...officialWeekendSchedules2024,
  ...officialWeekendSchedules2025.map((schedule) => ({ ...schedule, year: 2025 })),
  ...officialWeekendSchedules2026.map((schedule) => ({ ...schedule, year: 2026 }))
];

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const relative = (path) => path.replace(`${root}/`, '');

const readJsonIfExists = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const readTextIfExists = async (path, fallback = null) => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return fallback;
  }
};

const fileBufferIfExists = async (path) => {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
};

const fetchJsonCached = async (url, path) => {
  if (!refresh) {
    const cached = await readJsonIfExists(path, null);
    if (cached) return { payload: cached, fromCache: true };
  }

  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const payload = await response.json();
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
  return { payload, fromCache: false };
};

const fetchPdfCached = async (url, path) => {
  if (!refresh) {
    const cached = await fileBufferIfExists(path);
    if (cached) return { buffer: cached, fromCache: true };
  }

  const response = await fetch(url, { headers: { accept: 'application/pdf' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(path, buffer);
  return { buffer, fromCache: false };
};

const extractWeekendScheduleText = async ({ pdfPath, layoutTextPath, ocrTextPath, ocrImageDir }) => {
  if (!refresh) {
    const cachedLayout = await readTextIfExists(layoutTextPath, null);
    if (cachedLayout?.trim()) return { text: cachedLayout, fromCache: true, method: 'pdftotext_layout' };
    const cachedOcr = await readTextIfExists(ocrTextPath, null);
    if (cachedOcr?.trim()) return { text: cachedOcr, fromCache: true, method: 'tesseract_ocr' };
  }

  await execFileAsync(pdfToTextBin, ['-layout', pdfPath, layoutTextPath], { maxBuffer: 16 * 1024 * 1024 });
  const layoutText = await readTextIfExists(layoutTextPath, '');
  if (layoutText.trim()) return { text: layoutText, fromCache: false, method: 'pdftotext_layout' };

  await mkdir(ocrImageDir, { recursive: true });
  const imagePrefix = join(ocrImageDir, 'page');
  await execFileAsync(pdfToPpmBin, ['-png', '-r', '220', pdfPath, imagePrefix], { maxBuffer: 16 * 1024 * 1024 });
  const { stdout } = await execFileAsync(tesseractBin, ['page-1.png', 'stdout', '--psm', '6'], {
    cwd: ocrImageDir,
    maxBuffer: 16 * 1024 * 1024
  });
  await writeFile(ocrTextPath, stdout);
  await rm(ocrImageDir, { recursive: true, force: true });
  return { text: stdout, fromCache: false, method: 'tesseract_ocr' };
};

const sourceUtcDateTime = (value) => {
  const normalized = String(value ?? '').trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  return match ? `${match[1]}T${match[2]}Z` : null;
};

const utcToLocalDateTime = (value, timezone) => {
  const sourceUtc = sourceUtcDateTime(value);
  if (!sourceUtc || !timezone) return null;
  const date = new Date(sourceUtc);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}:${byType.second}`;
};

const trackActivitySourceEvidence = ({ retrievedAt }) => ({
  id: 'source_indy_nxt_2026_race_control_trackactivity_schedule',
  sourceType: 'official_json',
  sourceName: 'INDY NXT Race Control trackactivity feed',
  url: trackActivitySourceUrl,
  retrievedAt,
  publishedAt: null,
  accessedBy: 'scripts/backfill-indy-nxt-session-windows.mjs',
  licenseNotes: 'Public official INDYCAR Race Control JSON feed; store source-backed session window fields and raw artifact.',
  confidenceTier: 'official',
  coverage: 'Current INDY NXT Race Control event/session activity feed with session IDs, scheduled start/end windows, and estimated green flags.',
  parser: 'scripts/backfill-indy-nxt-session-windows.mjs',
  rawArtifactPath: relative(trackActivityRawPath),
  notes: 'Importer updates only existing canonical sessions whose officialSessionId exactly matches trackactivity sessionid. Race Control feed datetime strings are stored as source UTC and converted to the canonical event/session timezone for local session windows. No name/date fuzzy matching is performed.'
});

const scheduleSourceEvidence = ({ retrievedAt }) => ({
  id: 'source_indy_nxt_2026_race_control_schedule',
  sourceType: 'official_json',
  sourceName: 'INDY NXT Race Control schedule feed',
  url: scheduleSourceUrl,
  retrievedAt,
  publishedAt: null,
  accessedBy: 'scripts/backfill-indy-nxt-session-windows.mjs',
  licenseNotes: 'Public official INDYCAR Race Control JSON feed; store source-backed session schedule fields and raw artifact.',
  confidenceTier: 'official',
  coverage: 'Current INDY NXT Race Control event schedule feed with event IDs and broadcast/session start-end windows.',
  parser: 'scripts/backfill-indy-nxt-session-windows.mjs',
  rawArtifactPath: relative(scheduleRawPath),
  notes: 'Importer updates only existing canonical sessions when the schedule eventid matches the canonical officialEventId and a normalized practice/race label maps to exactly one canonical session. Qualification rows are skipped because schedule-feed labels are coarser than canonical group sessions.'
});

const weekendScheduleSourceEvidence = ({ schedule, retrievedAt, rawPdfPath, rawTextPath, parser }) => ({
  id: `source_indy_nxt_${schedule.year}_weekend_schedule_${schedule.key}`,
  sourceType: 'official_pdf',
  sourceName: schedule.sourceName,
  url: schedule.url,
  retrievedAt,
  publishedAt: null,
  accessedBy: 'scripts/backfill-indy-nxt-session-windows.mjs',
  licenseNotes: 'Public official INDYCAR weekend schedule PDF; store source-backed session schedule fields and raw artifact.',
  confidenceTier: 'official',
  coverage: `${schedule.year} INDY NXT weekend schedule rows for ${schedule.key.toUpperCase()}, labeled as all times local (${schedule.timeZoneLabel}).`,
  parser,
  rawArtifactPath: relative(rawPdfPath),
  notes: `Importer stores only official schedule start times for unambiguous INDY NXT canonical sessions. Race second listed times are preserved in raw fields and are not treated as actualStart. Text artifact: ${relative(rawTextPath)}.`
});

const upsert = (map, row) => {
  const current = map.get(row.id);
  if (!current) {
    map.set(row.id, row);
    return;
  }
  map.set(row.id, {
    ...current,
    ...row,
    provenanceRefs: Array.from(new Set([...(current.provenanceRefs ?? []), ...(row.provenanceRefs ?? [])]))
  });
};

const normalizeEvidenceText = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const missingFragments = (text, fragments) => {
  const normalizedText = normalizeEvidenceText(text);
  return fragments.filter((fragment) => !normalizedText.includes(normalizeEvidenceText(fragment)));
};

const trackActivitySessions = (payload) => {
  const events = asArray(payload?.trackactivity?.event);
  return events.flatMap((event) =>
    asArray(event?.sessions?.session).map((session) => ({
      eventId: String(event.eventid ?? ''),
      eventName: event.eventname ?? null,
      sessionId: String(session.sessionid ?? ''),
      sessionLabel: session.sessionlabel ?? null,
      sessionType: session.sessiontype ?? null,
      sourceStartUtc: sourceUtcDateTime(session.startdatetime),
      sourceEndUtc: sourceUtcDateTime(session.enddatetime),
      sourceEstimatedGreenFlagUtc: sourceUtcDateTime(session.estimatedgreenflag),
      resultOfficial: session.resultsofficial === '1',
      resultImported: session.resultsimported === '1',
      raw: session
    }))
  );
};

const normalizeLabel = (value) =>
  String(value ?? '')
    .replace(/^INDY NXT\s*-\s*/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/^qualifications$/, 'qualifying');

const safeScheduleLabel = (label) => {
  const normalized = normalizeLabel(label);
  if (/^practice(?: \d+)?$/.test(normalized)) return normalized;
  if (/^race(?: \d+)?$/.test(normalized)) return normalized;
  return null;
};

const eventRaceKey = (event) => {
  const name = normalizeLabel(event?.name);
  const match = name.match(/\brace ([12])\b/);
  return match ? `race ${match[1]}` : null;
};

const canonicalScheduleKeys = (session, event) => {
  const label = normalizeLabel(session.sessionName);
  const keys = new Set();
  if (/^practice(?: \d+)?$/.test(label)) keys.add(label);
  if (label === 'race') keys.add(eventRaceKey(event) ?? 'race');
  if (/^race [12]$/.test(label)) keys.add(label);
  return [...keys];
};

const sessionTypeFromRaceControl = (session) => {
  const type = String(session.sessionType ?? '').trim().toUpperCase();
  if (type === 'P') return 'practice';
  if (type === 'Q') return 'qualifying';
  if (type === 'R') return 'race';
  const label = normalizeLabel(session.sessionLabel);
  if (/practice/.test(label)) return 'practice';
  if (/qual/.test(label)) return 'qualifying';
  if (/race/.test(label)) return 'race';
  return 'unknown';
};

const raceNumberFrom = (sessionLabel, eventName) => {
  const sessionMatch = normalizeLabel(sessionLabel).match(/\brace ([12])\b/);
  if (sessionMatch) return Number(sessionMatch[1]);
  const eventMatch = normalizeLabel(eventName).match(/\brace ([12])\b/);
  return eventMatch ? Number(eventMatch[1]) : null;
};

const scheduleFeedSessions = (payload) => {
  const events = asArray(payload?.schedule?.race);
  return events.flatMap((event) =>
    asArray(event?.broadcasts?.broadcast).map((broadcast) => ({
      eventId: String(event.eventid ?? ''),
      eventName: event.name ?? null,
      eventUrl: event.link_url ?? null,
      scheduleLabel: broadcast.name ?? null,
      matchKey: safeScheduleLabel(broadcast.name),
      sourceStartUtc: sourceUtcDateTime(broadcast.start),
      sourceEndUtc: sourceUtcDateTime(broadcast.end),
      raw: broadcast
    }))
  );
};

const scheduleFeedEvents = (payload) =>
  asArray(payload?.schedule?.race).map((event) => ({
    eventId: String(event.eventid ?? ''),
    eventName: event.name ?? null,
    eventUrl: event.link_url ?? null,
    sourceGreenFlagUtc: sourceUtcDateTime(event.green_flag),
    raw: event
  }));

const localDate = (value) => (typeof value === 'string' && value.includes('T') ? value.slice(0, 10) : null);

const normalizeDateOnly = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdy = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!mdy) return null;
  const [, month, day, year] = mdy;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const sourceEvidenceRefs = (refs) =>
  asArray(refs).filter((ref) =>
    String(ref).startsWith('source_indynxt_events_session_') ||
    String(ref).startsWith('source_indy_nxt_') ||
    String(ref).startsWith('source_track_metadata_')
  );

const compactEvidence = (items) => {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const collectEventDateEvidence = ({ event, eventSessions }) => {
  const dates = [];
  const evidence = [];
  const push = ({ value, sourceRef, sourceField, sourceValue = null, sessionId = null, note = null }) => {
    const date = normalizeDateOnly(value);
    if (!date) return;
    dates.push(date);
    evidence.push({
      date,
      sourceRef,
      sourceField,
      sourceValue,
      sessionId,
      note
    });
  };

  for (const field of ['eventStartDate', 'eventEndDate']) {
    push({
      value: event[field],
      sourceRef: sourceEvidenceRefs(event.provenanceRefs)[0] ?? null,
      sourceField: `canonical event.${field} originally imported from official event/session date`,
      sourceValue: event[field] ?? null,
      note: 'normalized_to_iso_date'
    });
  }

  for (const session of eventSessions) {
    const raw = session.raw ?? {};
    const trackActivity = raw.raceControlTrackActivityWindow;
    if (trackActivity) {
      for (const [key, value] of [
        ['scheduledStart', trackActivity.scheduledStart ?? session.scheduledStart],
        ['estimatedGreenFlag', trackActivity.estimatedGreenFlag ?? session.actualStart],
        ['scheduledEnd', trackActivity.scheduledEnd ?? session.scheduledEnd]
      ]) {
        push({
          value,
          sourceRef: 'source_indy_nxt_2026_race_control_trackactivity_schedule',
          sourceField: `trackactivity.session.${key} converted from source UTC`,
          sourceValue: {
            sourceStartUtc: trackActivity.sourceStartUtc ?? null,
            sourceEndUtc: trackActivity.sourceEndUtc ?? null,
            sourceEstimatedGreenFlagUtc: trackActivity.sourceEstimatedGreenFlagUtc ?? null
          },
          sessionId: session.id
        });
      }
    }

    const scheduleWindow = raw.raceControlScheduleWindow;
    if (scheduleWindow) {
      for (const [key, value] of [
        ['scheduledStart', scheduleWindow.scheduledStart ?? session.scheduledStart],
        ['scheduledEnd', scheduleWindow.scheduledEnd ?? session.scheduledEnd]
      ]) {
        push({
          value,
          sourceRef: 'source_indy_nxt_2026_race_control_schedule',
          sourceField: `schedule.broadcast.${key} converted from source UTC`,
          sourceValue: {
            sourceStartUtc: scheduleWindow.sourceStartUtc ?? null,
            sourceEndUtc: scheduleWindow.sourceEndUtc ?? null
          },
          sessionId: session.id
        });
      }
    }

    const greenFlag = raw.raceControlScheduleGreenFlagWindow;
    if (greenFlag) {
      push({
        value: greenFlag.scheduledStart ?? session.scheduledStart,
        sourceRef: 'source_indy_nxt_2026_race_control_schedule',
        sourceField: 'schedule.race.green_flag converted from source UTC',
        sourceValue: greenFlag.sourceGreenFlagUtc ?? null,
        sessionId: session.id
      });
    }

    const weekendSchedule = raw.indycarWeekendScheduleWindow;
    if (weekendSchedule) {
      push({
        value: weekendSchedule.scheduledStart ?? session.scheduledStart,
        sourceRef: `source_indy_nxt_${weekendSchedule.scheduleYear}_weekend_schedule_${weekendSchedule.scheduleKey}`,
        sourceField: 'official_weekend_schedule_pdf.local_session_start',
        sourceValue: {
          sourceName: weekendSchedule.sourceName ?? null,
          sourceDateHeader: weekendSchedule.sourceDateHeader ?? null,
          sourceLabel: weekendSchedule.sourceLabel ?? null,
          sourceScheduledStart: weekendSchedule.sourceScheduledStart ?? null
        },
        sessionId: session.id
      });
    }

    const apiRefs = asArray(session.provenanceRefs).filter((ref) => String(ref).startsWith('source_indynxt_events_session_'));
    if (apiRefs.length) {
      push({
        value: session.scheduledStart,
        sourceRef: apiRefs[0],
        sourceField: 'EventsSessionDetails.SessionDate',
        sourceValue: session.scheduledStart ?? null,
        sessionId: session.id
      });
    }
  }

  return {
    dates: Array.from(new Set(dates)).sort(),
    evidence: compactEvidence(evidence)
  };
};

const main = async () => {
  await mkdir(rawDir, { recursive: true });
  await mkdir(weekendScheduleBaseDir, { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });

  const dataset = await readJsonIfExists(datasetPath, {});
  const retrievedAt = new Date().toISOString();
  const trackActivityFetch = await fetchJsonCached(trackActivitySourceUrl, trackActivityRawPath);
  const scheduleFetch = await fetchJsonCached(scheduleSourceUrl, scheduleRawPath);
  const feedSessions = trackActivitySessions(trackActivityFetch.payload).filter((session) => session.sessionId);
  const scheduleSessions = scheduleFeedSessions(scheduleFetch.payload).filter((session) => session.eventId);
  const scheduleEvents = scheduleFeedEvents(scheduleFetch.payload).filter((event) => event.eventId && event.sourceGreenFlagUtc);

  const sessions = new Map(asArray(dataset.sessions).map((row) => [row.id, row]));
  const events = new Map(asArray(dataset.events).map((row) => [row.id, row]));
  const sourceEvidenceMap = new Map(asArray(dataset.sourceEvidence).map((row) => [row.id, row]));
  const tracksById = new Map(asArray(dataset.tracks).map((row) => [row.id, row]));
  const resultSessionIds = new Set(asArray(dataset.results).map((row) => row.sessionId).filter(Boolean));
  const eventsById = new Map(events);
  const eventsByOfficialId = new Map(Array.from(events.values()).map((row) => [String(row.officialEventId ?? ''), row]).filter(([id]) => id));
  const scheduleEventsById = new Map(scheduleEvents.map((event) => [event.eventId, event]));
  upsert(sourceEvidenceMap, trackActivitySourceEvidence({ retrievedAt }));
  upsert(sourceEvidenceMap, scheduleSourceEvidence({ retrievedAt }));

  const report = {
    checkedAt: retrievedAt,
    refresh,
    sources: {
      trackActivity: {
        sourceUrl: trackActivitySourceUrl,
        rawArtifactPath: relative(trackActivityRawPath),
        fetched: trackActivityFetch.fromCache ? 0 : 1,
        cached: trackActivityFetch.fromCache ? 1 : 0
      },
      schedule: {
        sourceUrl: scheduleSourceUrl,
        rawArtifactPath: relative(scheduleRawPath),
        fetched: scheduleFetch.fromCache ? 0 : 1,
        cached: scheduleFetch.fromCache ? 1 : 0
      },
      weekendSchedules: []
    },
    feedSessions: feedSessions.length,
    scheduleFeedSessions: scheduleSessions.length,
    directCanonicalMatches: 0,
    scheduleCanonicalMatches: 0,
    scheduleGreenFlagCanonicalMatches: 0,
    sessionsUpdated: [],
    scheduleSessionsUpdated: [],
    scheduleGreenFlagSessionsUpdated: [],
    weekendSchedulePdfSessionsUpdated: [],
    weekendSchedulePdfSessionsSkipped: [],
    scheduleOnlyEventsCreated: [],
    scheduleOnlySessionsCreated: [],
    scheduleOnlySessionsUpdated: [],
    eventDateSpansUpdated: [],
    scheduleSessionsSkipped: [],
    scheduleGreenFlagSessionsSkipped: [],
    feedSessionsWithoutCanonicalMatch: [],
    notes: [
      'Only exact officialSessionId/sessionid matches are updated.',
      'Trackactivity startdatetime becomes scheduledStart; estimatedgreenflag becomes actualStart when present because Race Control labels it as the expected green flag rather than the post-session official start.',
      'Race Control datetime strings are treated as UTC source values and converted to event-local timestamps before canonical storage.',
      'Schedule-feed updates require exact eventid plus an unambiguous normalized practice/race label. Qualifying rows are skipped because schedule labels do not expose canonical group timing.',
      'Event-level green_flag values are used only for exact-event race sessions that do not already have a higher-priority trackactivity or broadcast schedule window.',
      'Future Race Control trackactivity sessions can create schedule-only canonical event/session rows when the event has a curated track mapping. These rows carry no result rows and remain status=scheduled until official result imports arrive.',
      'Official INDYCAR weekend schedule PDFs backfill unambiguous historical INDY NXT practice, race, and single-session qualifying scheduledStart rows. Race second listed times are retained in raw data and are not promoted to actualStart.',
      'Coarse PDF Qualifications rows are skipped when canonical data splits the qualifying block into group or combined classifications.'
    ]
  };

  for (const feedSession of feedSessions) {
    const canonicalSessionId = `session_indy_nxt_2026_${feedSession.sessionId}`;
    const current = sessions.get(canonicalSessionId);
    if (!current) {
      continue;
    }
    const hasImportedResultRows = resultSessionIds.has(canonicalSessionId);
    if (current.ingestionState === 'schedule_only' && !hasImportedResultRows) {
      continue;
    }

    report.directCanonicalMatches += 1;
    const event = eventsById.get(current.eventId);
    const timezone = current.timezone ?? event?.timezone ?? null;
    const scheduledStart = utcToLocalDateTime(feedSession.raw.startdatetime, timezone);
    const scheduledEnd = utcToLocalDateTime(feedSession.raw.enddatetime, timezone);
    const estimatedGreenFlag = utcToLocalDateTime(feedSession.raw.estimatedgreenflag, timezone);
    const next = {
      ...current,
      scheduledStart: scheduledStart ?? current.scheduledStart,
      actualStart: estimatedGreenFlag ?? current.actualStart,
      scheduledEnd: scheduledEnd ?? current.scheduledEnd ?? null,
      timePrecision: 'local_datetime',
      timeSource: 'official_race_control_trackactivity',
      ingestionState: hasImportedResultRows ? undefined : current.ingestionState,
      raw: {
        ...(current.raw ?? {}),
        raceControlTrackActivityWindow: {
          eventId: feedSession.eventId,
          eventName: feedSession.eventName,
          sessionLabel: feedSession.sessionLabel,
          sessionType: feedSession.sessionType,
          sourceTimezone: 'UTC',
          sourceStartUtc: feedSession.sourceStartUtc,
          sourceEndUtc: feedSession.sourceEndUtc,
          sourceEstimatedGreenFlagUtc: feedSession.sourceEstimatedGreenFlagUtc,
          scheduledStart,
          scheduledEnd,
          estimatedGreenFlag,
          resultImported: feedSession.resultImported,
          resultOfficial: feedSession.resultOfficial
        }
      },
      provenanceRefs: Array.from(new Set([...(current.provenanceRefs ?? []), 'source_indy_nxt_2026_race_control_trackactivity_schedule']))
    };
    sessions.set(canonicalSessionId, next);
    report.sessionsUpdated.push({
      sessionId: canonicalSessionId,
      officialSessionId: feedSession.sessionId,
      scheduledStart: next.scheduledStart,
      actualStart: next.actualStart,
      scheduledEnd: next.scheduledEnd,
      timezone,
      sourceStartUtc: feedSession.sourceStartUtc,
      sourceEstimatedGreenFlagUtc: feedSession.sourceEstimatedGreenFlagUtc
    });
  }

  const unmatchedFeedSessions = feedSessions.filter((feedSession) => {
    if (!feedSession.sessionId) return false;
    const existing = sessions.get(`session_indy_nxt_2026_${feedSession.sessionId}`);
    return !existing || (existing.ingestionState === 'schedule_only' && !resultSessionIds.has(existing.id));
  });
  const unmatchedByEventId = new Map();
  for (const feedSession of unmatchedFeedSessions) {
    if (!unmatchedByEventId.has(feedSession.eventId)) unmatchedByEventId.set(feedSession.eventId, []);
    unmatchedByEventId.get(feedSession.eventId).push(feedSession);
  }

  for (const [eventOfficialId, eventFeedSessions] of unmatchedByEventId) {
    const trackId = raceControlEventTrackIds[eventOfficialId];
    const track = tracksById.get(trackId);
    const scheduleEvent = scheduleEventsById.get(eventOfficialId);
    if (!trackId || !track) {
      for (const feedSession of eventFeedSessions) {
        report.feedSessionsWithoutCanonicalMatch.push({
          sessionId: feedSession.sessionId,
          eventId: feedSession.eventId,
          eventName: feedSession.eventName,
          sessionLabel: feedSession.sessionLabel,
          sourceStartUtc: feedSession.sourceStartUtc,
          sourceEstimatedGreenFlagUtc: feedSession.sourceEstimatedGreenFlagUtc,
          reason: 'no_curated_track_mapping_for_schedule_only_event'
        });
      }
      continue;
    }

    const timezone = track.timezone;
    const eventId = `event_indy_nxt_2026_${eventOfficialId}`;
    let event = events.get(eventId);
    const localWindows = eventFeedSessions
      .map((feedSession) => ({
        start: utcToLocalDateTime(feedSession.raw.startdatetime, timezone),
        end: utcToLocalDateTime(feedSession.raw.enddatetime, timezone)
      }))
      .filter((row) => row.start);
    const localDates = localWindows
      .flatMap((row) => [localDate(row.start), localDate(row.end)])
      .filter(Boolean)
      .sort();

    if (!event) {
      event = {
        id: eventId,
        seriesId: 'series_indy_nxt',
        seasonYear: 2026,
        name: scheduleEvent?.eventName ?? eventFeedSessions[0]?.eventName ?? `INDY NXT Race Control Event ${eventOfficialId}`,
        round: null,
        eventStartDate: localDates[0] ?? null,
        eventEndDate: localDates.at(-1) ?? localDates[0] ?? null,
        trackId,
        country: track.country ?? 'United States',
        officialEventId: eventOfficialId,
        timezone,
        status: 'scheduled',
        raw: {
          raceControlScheduleOnlyEvent: {
            eventId: eventOfficialId,
            eventName: scheduleEvent?.eventName ?? eventFeedSessions[0]?.eventName ?? null,
            eventUrl: scheduleEvent?.eventUrl ?? null,
            sourceTimezone: 'UTC',
            trackActivitySessionIds: eventFeedSessions.map((feedSession) => feedSession.sessionId)
          }
        },
        provenanceRefs: Array.from(new Set([
          'source_indy_nxt_2026_race_control_schedule',
          'source_indy_nxt_2026_race_control_trackactivity_schedule',
          ...(track.provenanceRefs ?? [])
        ]))
      };
      events.set(eventId, event);
      eventsById.set(eventId, event);
      eventsByOfficialId.set(eventOfficialId, event);
      report.scheduleOnlyEventsCreated.push({
        eventId,
        officialEventId: eventOfficialId,
        eventName: event.name,
        trackId,
        eventStartDate: event.eventStartDate,
        eventEndDate: event.eventEndDate,
        timezone
      });
    }

    for (const feedSession of eventFeedSessions) {
      const sessionId = `session_indy_nxt_2026_${feedSession.sessionId}`;
      const current = sessions.get(sessionId);
      const scheduledStart = utcToLocalDateTime(feedSession.raw.startdatetime, timezone);
      const scheduledEnd = utcToLocalDateTime(feedSession.raw.enddatetime, timezone);
      const estimatedGreenFlag = utcToLocalDateTime(feedSession.raw.estimatedgreenflag, timezone);
      if (!scheduledStart) {
        report.feedSessionsWithoutCanonicalMatch.push({
          sessionId: feedSession.sessionId,
          eventId: feedSession.eventId,
          eventName: feedSession.eventName,
          sessionLabel: feedSession.sessionLabel,
          sourceStartUtc: feedSession.sourceStartUtc,
          sourceEstimatedGreenFlagUtc: feedSession.sourceEstimatedGreenFlagUtc,
          reason: 'missing_or_unparseable_start_for_schedule_only_session'
        });
        continue;
      }

      const next = {
        ...(current ?? {}),
        id: sessionId,
        eventId,
        sessionType: sessionTypeFromRaceControl(feedSession),
        sessionName: feedSession.sessionLabel ?? 'Race Control Session',
        raceNumber: raceNumberFrom(feedSession.sessionLabel, event.name),
        scheduledStart,
        actualStart: estimatedGreenFlag,
        scheduledEnd,
        timezone,
        lapsScheduled: null,
        distanceScheduled: null,
        status: 'scheduled',
        officialSessionId: feedSession.sessionId,
        timePrecision: 'local_datetime',
        timeSource: 'official_race_control_trackactivity_schedule_only',
        weatherObservationRefs: [],
        ingestionState: 'schedule_only',
        broadcastRouteRefs: [],
        notificationRefs: [],
        raw: {
          raceControlTrackActivityWindow: {
            eventId: feedSession.eventId,
            eventName: feedSession.eventName,
            sessionLabel: feedSession.sessionLabel,
            sessionType: feedSession.sessionType,
            sourceTimezone: 'UTC',
            sourceStartUtc: feedSession.sourceStartUtc,
            sourceEndUtc: feedSession.sourceEndUtc,
            sourceEstimatedGreenFlagUtc: feedSession.sourceEstimatedGreenFlagUtc,
            scheduledStart,
            scheduledEnd,
            estimatedGreenFlag,
            resultImported: feedSession.resultImported,
            resultOfficial: feedSession.resultOfficial,
            scheduleOnly: true
          }
        },
        provenanceRefs: [
          'source_indy_nxt_2026_race_control_trackactivity_schedule',
          'source_indy_nxt_2026_race_control_schedule'
        ]
      };
      sessions.set(sessionId, next);
      const reportRow = {
        sessionId,
        officialSessionId: feedSession.sessionId,
        eventId,
        officialEventId: eventOfficialId,
        sessionLabel: feedSession.sessionLabel,
        sessionType: next.sessionType,
        scheduledStart,
        actualStart: estimatedGreenFlag,
        scheduledEnd,
        timezone,
        sourceStartUtc: feedSession.sourceStartUtc,
        sourceEstimatedGreenFlagUtc: feedSession.sourceEstimatedGreenFlagUtc
      };
      if (current) report.scheduleOnlySessionsUpdated.push(reportRow);
      else report.scheduleOnlySessionsCreated.push(reportRow);
    }
  }

  for (const scheduleSession of scheduleSessions) {
    if (!scheduleSession.matchKey) {
      report.scheduleSessionsSkipped.push({
        eventId: scheduleSession.eventId,
        eventName: scheduleSession.eventName,
        scheduleLabel: scheduleSession.scheduleLabel,
        reason: 'unsupported_or_ambiguous_schedule_label'
      });
      continue;
    }

    const event = eventsByOfficialId.get(scheduleSession.eventId);
    if (!event) {
      report.scheduleSessionsSkipped.push({
        eventId: scheduleSession.eventId,
        eventName: scheduleSession.eventName,
        scheduleLabel: scheduleSession.scheduleLabel,
        matchKey: scheduleSession.matchKey,
        reason: 'no_existing_canonical_event'
      });
      continue;
    }

    const candidates = Array.from(sessions.values()).filter((session) => {
      if (session.eventId !== event.id) return false;
      const keys = canonicalScheduleKeys(session, event);
      return keys.includes(scheduleSession.matchKey);
    });

    if (candidates.length !== 1) {
      report.scheduleSessionsSkipped.push({
        eventId: scheduleSession.eventId,
        eventName: scheduleSession.eventName,
        scheduleLabel: scheduleSession.scheduleLabel,
        matchKey: scheduleSession.matchKey,
        reason: candidates.length === 0 ? 'no_unambiguous_canonical_session' : 'multiple_canonical_sessions',
        candidateSessionIds: candidates.map((session) => session.id)
      });
      continue;
    }

    const current = candidates[0];
    if (['official_race_control_trackactivity', 'official_race_control_trackactivity_schedule_only'].includes(current.timeSource)) {
      report.scheduleSessionsSkipped.push({
        eventId: scheduleSession.eventId,
        eventName: scheduleSession.eventName,
        scheduleLabel: scheduleSession.scheduleLabel,
        matchKey: scheduleSession.matchKey,
        reason: 'higher_priority_trackactivity_window_exists',
        candidateSessionIds: [current.id]
      });
      continue;
    }

    const timezone = current.timezone ?? event.timezone ?? null;
    const scheduledStart = utcToLocalDateTime(scheduleSession.raw.start, timezone);
    const scheduledEnd = utcToLocalDateTime(scheduleSession.raw.end, timezone);
    if (!scheduledStart) {
      report.scheduleSessionsSkipped.push({
        eventId: scheduleSession.eventId,
        eventName: scheduleSession.eventName,
        scheduleLabel: scheduleSession.scheduleLabel,
        matchKey: scheduleSession.matchKey,
        reason: 'missing_or_unparseable_start',
        candidateSessionIds: [current.id]
      });
      continue;
    }

    const next = {
      ...current,
      scheduledStart,
      scheduledEnd: scheduledEnd ?? current.scheduledEnd ?? null,
      timePrecision: 'local_datetime',
      timeSource: 'official_race_control_schedule',
      raw: {
        ...(current.raw ?? {}),
        raceControlScheduleWindow: {
          eventId: scheduleSession.eventId,
          eventName: scheduleSession.eventName,
          eventUrl: scheduleSession.eventUrl,
          scheduleLabel: scheduleSession.scheduleLabel,
          matchKey: scheduleSession.matchKey,
          sourceTimezone: 'UTC',
          sourceStartUtc: scheduleSession.sourceStartUtc,
          sourceEndUtc: scheduleSession.sourceEndUtc,
          scheduledStart,
          scheduledEnd
        }
      },
      provenanceRefs: Array.from(new Set([...(current.provenanceRefs ?? []), 'source_indy_nxt_2026_race_control_schedule']))
    };
    sessions.set(current.id, next);
    report.scheduleCanonicalMatches += 1;
    report.scheduleSessionsUpdated.push({
      sessionId: current.id,
      eventId: scheduleSession.eventId,
      scheduleLabel: scheduleSession.scheduleLabel,
      scheduledStart: next.scheduledStart,
      scheduledEnd: next.scheduledEnd,
      timezone,
      sourceStartUtc: scheduleSession.sourceStartUtc,
      sourceEndUtc: scheduleSession.sourceEndUtc
    });
  }

  for (const scheduleEvent of scheduleEvents) {
    const event = eventsByOfficialId.get(scheduleEvent.eventId);
    if (!event) {
      report.scheduleGreenFlagSessionsSkipped.push({
        eventId: scheduleEvent.eventId,
        eventName: scheduleEvent.eventName,
        reason: 'no_existing_canonical_event'
      });
      continue;
    }

    const candidates = Array.from(sessions.values()).filter((session) => session.eventId === event.id && session.sessionType === 'race');
    if (candidates.length !== 1) {
      report.scheduleGreenFlagSessionsSkipped.push({
        eventId: scheduleEvent.eventId,
        eventName: scheduleEvent.eventName,
        reason: candidates.length === 0 ? 'no_canonical_race_session' : 'multiple_canonical_race_sessions',
        candidateSessionIds: candidates.map((session) => session.id)
      });
      continue;
    }

    const current = candidates[0];
    if (['official_race_control_trackactivity', 'official_race_control_trackactivity_schedule_only', 'official_race_control_schedule'].includes(current.timeSource)) {
      report.scheduleGreenFlagSessionsSkipped.push({
        eventId: scheduleEvent.eventId,
        eventName: scheduleEvent.eventName,
        reason: 'higher_priority_window_exists',
        candidateSessionIds: [current.id]
      });
      continue;
    }

    const timezone = current.timezone ?? event.timezone ?? null;
    const scheduledStart = utcToLocalDateTime(scheduleEvent.raw.green_flag, timezone);
    if (!scheduledStart) {
      report.scheduleGreenFlagSessionsSkipped.push({
        eventId: scheduleEvent.eventId,
        eventName: scheduleEvent.eventName,
        reason: 'missing_or_unparseable_green_flag',
        candidateSessionIds: [current.id]
      });
      continue;
    }

    const next = {
      ...current,
      scheduledStart,
      timePrecision: 'local_datetime',
      timeSource: 'official_race_control_schedule_green_flag',
      raw: {
        ...(current.raw ?? {}),
        raceControlScheduleGreenFlagWindow: {
          eventId: scheduleEvent.eventId,
          eventName: scheduleEvent.eventName,
          eventUrl: scheduleEvent.eventUrl,
          sourceTimezone: 'UTC',
          sourceGreenFlagUtc: scheduleEvent.sourceGreenFlagUtc,
          scheduledStart
        }
      },
      provenanceRefs: Array.from(new Set([...(current.provenanceRefs ?? []), 'source_indy_nxt_2026_race_control_schedule']))
    };
    sessions.set(current.id, next);
    report.scheduleGreenFlagCanonicalMatches += 1;
    report.scheduleGreenFlagSessionsUpdated.push({
      sessionId: current.id,
      eventId: scheduleEvent.eventId,
      eventName: scheduleEvent.eventName,
      scheduledStart: next.scheduledStart,
      timezone,
      sourceGreenFlagUtc: scheduleEvent.sourceGreenFlagUtc
    });
  }

  for (const schedule of officialWeekendSchedules) {
    const weekendScheduleDir = join(weekendScheduleBaseDir, String(schedule.year));
    await mkdir(weekendScheduleDir, { recursive: true });
    const pdfPath = join(weekendScheduleDir, `${schedule.key}.pdf`);
    const layoutTextPath = join(weekendScheduleDir, `${schedule.key}.layout.txt`);
    const ocrTextPath = join(weekendScheduleDir, `${schedule.key}.ocr.txt`);
    const ocrImageDir = join(weekendScheduleDir, `${schedule.key}-ocr`);
    const pdfFetch = await fetchPdfCached(schedule.url, pdfPath);
    const extracted = await extractWeekendScheduleText({ pdfPath, layoutTextPath, ocrTextPath, ocrImageDir });
    const rawTextPath = extracted.method === 'tesseract_ocr' ? ocrTextPath : layoutTextPath;
    report.sources.weekendSchedules.push({
      year: schedule.year,
      key: schedule.key,
      sourceUrl: schedule.url,
      rawArtifactPath: relative(pdfPath),
      textArtifactPath: relative(rawTextPath),
      fetched: pdfFetch.fromCache ? 0 : 1,
      cached: pdfFetch.fromCache ? 1 : 0,
      textFromCache: extracted.fromCache ? 1 : 0,
      parser: extracted.method
    });
    upsert(sourceEvidenceMap, weekendScheduleSourceEvidence({
      schedule,
      retrievedAt,
      rawPdfPath: pdfPath,
      rawTextPath,
      parser: extracted.method === 'tesseract_ocr'
        ? 'pdftotext -layout with tesseract OCR fallback for image-only PDF'
        : 'pdftotext -layout'
    }));

    for (const skippedRow of asArray(schedule.skippedRows)) {
      report.weekendSchedulePdfSessionsSkipped.push({
        year: schedule.year,
        key: schedule.key,
        sourceUrl: schedule.url,
        sourceLabel: skippedRow.sourceLabel,
        reason: skippedRow.reason,
        candidateSessionIds: skippedRow.canonicalSessionIds
      });
    }

    for (const entry of schedule.entries) {
      const missing = missingFragments(extracted.text, entry.fragments);
      if (missing.length) {
        report.weekendSchedulePdfSessionsSkipped.push({
          year: schedule.year,
          key: schedule.key,
          sourceUrl: schedule.url,
          sessionId: entry.sessionId,
          sourceLabel: entry.sourceLabel,
          dateHeader: entry.dateHeader,
          reason: 'source_text_fragments_missing',
          missingFragments: missing
        });
        continue;
      }

      const current = sessions.get(entry.sessionId);
      if (!current) {
        report.weekendSchedulePdfSessionsSkipped.push({
          year: schedule.year,
          key: schedule.key,
          sourceUrl: schedule.url,
          sessionId: entry.sessionId,
          sourceLabel: entry.sourceLabel,
          dateHeader: entry.dateHeader,
          reason: 'no_canonical_session'
        });
        continue;
      }

      if (['official_race_control_trackactivity', 'official_race_control_trackactivity_schedule_only', 'official_race_control_schedule', 'official_race_control_schedule_green_flag'].includes(current.timeSource)) {
        report.weekendSchedulePdfSessionsSkipped.push({
          year: schedule.year,
          key: schedule.key,
          sourceUrl: schedule.url,
          sessionId: current.id,
          sourceLabel: entry.sourceLabel,
          dateHeader: entry.dateHeader,
          reason: 'higher_priority_race_control_window_exists'
        });
        continue;
      }

      const event = eventsById.get(current.eventId);
      const timezone = current.timezone ?? event?.timezone ?? null;
      if (!timezone) {
        report.weekendSchedulePdfSessionsSkipped.push({
          year: schedule.year,
          key: schedule.key,
          sourceUrl: schedule.url,
          sessionId: current.id,
          sourceLabel: entry.sourceLabel,
          dateHeader: entry.dateHeader,
          reason: 'missing_event_timezone'
        });
        continue;
      }

      const sourceId = `source_indy_nxt_${schedule.year}_weekend_schedule_${schedule.key}`;
      const next = {
        ...current,
        scheduledStart: entry.scheduledStart,
        scheduledEnd: current.scheduledEnd ?? null,
        actualStart: current.actualStart ?? null,
        timePrecision: 'local_datetime',
        timeSource: 'official_indycar_weekend_schedule_pdf',
        raw: {
          ...(current.raw ?? {}),
          indycarWeekendScheduleWindow: {
            scheduleKey: schedule.key,
            scheduleYear: schedule.year,
            sourceUrl: schedule.url,
            sourceName: schedule.sourceName,
            timeZoneLabel: schedule.timeZoneLabel,
            sourceDateHeader: entry.dateHeader,
            sourceLabel: entry.sourceLabel,
            sourceScheduledStart: entry.scheduledStart,
            sourceListedSecondTime: entry.listedSecondTime ?? null,
            scheduledStart: entry.scheduledStart,
            actualStartPolicy: 'not_set_from_weekend_schedule_pdf',
            evidenceFragments: entry.fragments,
            parser: extracted.method,
            rawTextArtifactPath: relative(rawTextPath)
          }
        },
        provenanceRefs: Array.from(new Set([...(current.provenanceRefs ?? []), sourceId]))
      };
      sessions.set(current.id, next);
      report.weekendSchedulePdfSessionsUpdated.push({
        year: schedule.year,
        key: schedule.key,
        sessionId: current.id,
        eventId: current.eventId,
        sourceLabel: entry.sourceLabel,
        dateHeader: entry.dateHeader,
        scheduledStart: entry.scheduledStart,
        actualStart: next.actualStart,
        timezone,
        sourceUrl: schedule.url,
        rawTextArtifactPath: relative(rawTextPath),
        parser: extracted.method
      });
    }
  }

  const sessionsByEventId = new Map();
  for (const session of sessions.values()) {
    if (!sessionsByEventId.has(session.eventId)) sessionsByEventId.set(session.eventId, []);
    sessionsByEventId.get(session.eventId).push(session);
  }

  for (const event of events.values()) {
    if (event.seriesId !== 'series_indy_nxt') continue;
    const eventSessions = sessionsByEventId.get(event.id) ?? [];
    const { dates, evidence } = collectEventDateEvidence({ event, eventSessions });
    if (!dates.length) continue;

    const eventStartDate = dates[0];
    const eventEndDate = dates.at(-1) ?? dates[0];
    const track = tracksById.get(event.trackId);
    const timezone = event.timezone ?? track?.timezone ?? null;
    const sourceRefs = Array.from(new Set([
      ...(event.provenanceRefs ?? []),
      ...evidence.map((row) => row.sourceRef).filter(Boolean)
    ]));

    const sourceRefsChanged = sourceRefs.join('|') !== asArray(event.provenanceRefs).join('|');
    if (
      event.eventStartDate === eventStartDate &&
      event.eventEndDate === eventEndDate &&
      (event.timezone ?? null) === (timezone ?? null) &&
      !sourceRefsChanged
    ) {
      continue;
    }

    const next = {
      ...event,
      eventStartDate,
      eventEndDate,
      timezone: timezone ?? event.timezone ?? null,
      provenanceRefs: sourceRefs
    };
    events.set(event.id, next);
    eventsById.set(event.id, next);
    if (next.officialEventId) eventsByOfficialId.set(String(next.officialEventId), next);
    report.eventDateSpansUpdated.push({
      eventId: event.id,
      officialEventId: event.officialEventId ?? null,
      eventName: event.name,
      oldEventStartDate: event.eventStartDate ?? null,
      oldEventEndDate: event.eventEndDate ?? null,
      eventStartDate,
      eventEndDate,
      timezone: timezone ?? event.timezone ?? null,
      sourceEvidence: evidence
    });
  }

  const nextDataset = {
    ...dataset,
    updatedAt: retrievedAt,
    events: Array.from(events.values()).sort((a, b) => a.id.localeCompare(b.id)),
    sessions: Array.from(sessions.values()).sort((a, b) => a.id.localeCompare(b.id)),
    sourceEvidence: Array.from(sourceEvidenceMap.values()).sort((a, b) => a.id.localeCompare(b.id))
  };

  await writeFile(datasetPath, `${JSON.stringify(nextDataset, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    wrote: datasetPath,
    report: reportPath,
    directCanonicalMatches: report.directCanonicalMatches,
    sessionsUpdated: report.sessionsUpdated.length,
    scheduleCanonicalMatches: report.scheduleCanonicalMatches,
    scheduleSessionsUpdated: report.scheduleSessionsUpdated.length,
    scheduleGreenFlagCanonicalMatches: report.scheduleGreenFlagCanonicalMatches,
    scheduleGreenFlagSessionsUpdated: report.scheduleGreenFlagSessionsUpdated.length,
    weekendSchedulePdfSessionsUpdated: report.weekendSchedulePdfSessionsUpdated.length,
    weekendSchedulePdfSessionsSkipped: report.weekendSchedulePdfSessionsSkipped.length,
    eventDateSpansUpdated: report.eventDateSpansUpdated.length,
    scheduleOnlyEventsCreated: report.scheduleOnlyEventsCreated.length,
    scheduleOnlySessionsCreated: report.scheduleOnlySessionsCreated.length,
    scheduleOnlySessionsUpdated: report.scheduleOnlySessionsUpdated.length,
    feedSessionsWithoutCanonicalMatch: report.feedSessionsWithoutCanonicalMatch.length,
    source: {
      trackActivity: trackActivityFetch.fromCache ? 'cache' : 'fetch',
      schedule: scheduleFetch.fromCache ? 'cache' : 'fetch'
    }
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
