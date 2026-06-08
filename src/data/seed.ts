import type { BroadcastSessionRoute, DriverProfile, HistoryPoint, RaceHeartbeat, RaceSnapshot, TimingRow } from './types';

export const sourceUrls = {
  timing: '/racecontrol/timingscoring-ris.json',
  drivers: '/racecontrol/driversfeed_nxt.json',
  config: '/racecontrol/tsconfig.json',
  schedule: '/racecontrol/schedulefeed_nxt.json',
  trackActivity: '/racecontrol/trackactivityleaderboardfeed_nxt.json',
  leaderboard: 'https://www.indynxt.com/leaderboard',
  app: 'https://www.indycar.com/mobile-app',
  indycarLive: 'https://www.indycarlive.com/',
  radio: 'https://www.indycar.com/Radio',
  foxSports: 'https://www.foxsports.com/live/fs1',
  hulu: 'https://www.hulu.com/live-tv',
  xfinity: 'https://www.xfinity.com/stream/'
};

export const seedHeartbeat: RaceHeartbeat = {
  eventName: 'INDY NXT by Firestone at WWT Raceway',
  trackName: 'World Wide Technology Raceway',
  trackLength: 1.25,
  trackType: 'O',
  currentFlag: 'CHECKERED',
  totalLaps: '75',
  lapNumber: '75',
  SessionName: 'Race',
  SessionType: 'R',
  SessionStatus: 'CHECKERED',
  EventID: '5546',
  EventSessionID: '6763',
  flagTimes: { green: '27:48', yellow: '16:11' }
};

export const seedBryceProfile: DriverProfile = {
  name: 'Bryce Aron',
  firstname: 'Bryce',
  lastname: 'Aron',
  number: '9',
  team: 'Chip Ganassi Racing',
  headshot: 'https://www.indycar.com/-/media/IndyCar/Drivers/INDY-NXT/Headshot/BryceAron.jpg',
  heroshot: 'https://www.indycar.com/-/media/IndyCar/Drivers/INDY-NXT/Hero/BryceAron.jpg',
  waistupimage: 'https://www.indycar.com/-/media/IndyCar/Drivers/INDY-NXT/SmallTorso/BryceAron.png',
  carillustration: 'https://www.indycar.com/-/media/IndyCar/Cars/2026/INDY-NXT/Liveries/9-JaguarRangeRover.png',
  endplatesmall: 'https://www.indycar.com/-/media/IndyCar/Cars/2026/INDY-NXT/Endplates/Color-Trans/9-BlackRedTrim-T.png',
  radiofrequency: '452.7000',
  hometown: 'Winnetka, Illinois',
  residence: 'Winnetka, Illinois',
  website: 'https://www.brycearon.com/',
  stats: {
    starts: '7',
    poles: '0',
    wins: '0',
    top5: '0',
    top10: '3',
    avgstart: '14.14',
    avgfinish: '13.28',
    lapsled: '0',
    running: '7',
    points: '124'
  }
};

export const seedTimingRows: TimingRow[] = [
  {
    no: '99',
    firstName: 'Myles',
    lastName: 'Rowe',
    team: 'ABEL Motorsports',
    rank: 1,
    liveRank: 1,
    startPosition: 24,
    marker: 'Finished',
    status: 'Active',
    comment: '',
    diff: '0.0000',
    gap: '0.0000',
    liveGap: '14.4785',
    laps: '75',
    lapsLed: '29',
    bestLapTime: '28.3282',
    bestLap: '75',
    lastLapTime: '28.3282',
    qualTime: '28.3282',
    BestSpeed: '158.852',
    LastSpeed: '158.852',
    AverageSpeed: '127.959',
    pitStops: 0,
    lastPitLap: 0,
    sincePitLap: 75,
    onTrack: 'False',
    Tire: 'P',
    Passes: 29,
    Passed: 6,
    totalEntrantPoints: 172,
    runningDriverPoints: 172
  },
  {
    no: '14',
    firstName: 'Alessandro',
    lastName: 'de Tullio',
    team: 'AJ Foyt Racing',
    rank: 2,
    liveRank: 2,
    startPosition: 2,
    marker: 'Finished',
    status: 'Active',
    comment: '',
    diff: '2.2081',
    gap: '2.2081',
    liveGap: '2.1793',
    laps: '75',
    lapsLed: '0',
    bestLapTime: '28.4934',
    bestLap: '75',
    lastLapTime: '28.4934',
    qualTime: '28.4934',
    BestSpeed: '157.931',
    LastSpeed: '157.931',
    AverageSpeed: '127.852',
    pitStops: 0,
    lastPitLap: 0,
    sincePitLap: 75,
    onTrack: 'False',
    Tire: 'P',
    Passes: 11,
    Passed: 4,
    totalEntrantPoints: 163,
    runningDriverPoints: 163
  },
  {
    no: '9',
    firstName: 'Bryce',
    lastName: 'Aron',
    team: 'Chip Ganassi Racing',
    rank: 23,
    liveRank: 23,
    startPosition: 12,
    marker: 'None',
    status: 'DNF',
    comment: 'Mechanical',
    diff: '70 laps',
    gap: '55 laps',
    liveGap: '22.8631',
    laps: '5',
    lapsLed: '0',
    bestLapTime: '29.7074',
    bestLap: '4',
    lastLapTime: '37.9416',
    qualTime: '29.7074',
    BestSpeed: '151.477',
    LastSpeed: '118.603',
    AverageSpeed: '137.255',
    pitStops: 1,
    lastPitLap: 5,
    sincePitLap: 0,
    onTrack: 'True',
    Tire: 'P',
    Passes: 1,
    Passed: 12,
    totalEntrantPoints: 107,
    runningDriverPoints: 107
  }
];

export const historyPoints: HistoryPoint[] = [
  { race: 'St. Pete', type: 'Street', start: 11, finish: 9, bestLapRank: 10, points: 22 },
  { race: 'Barber', type: 'Road', start: 15, finish: 12, bestLapRank: 13, points: 18 },
  { race: 'Indy GP 1', type: 'Road', start: 14, finish: 10, bestLapRank: 11, points: 20 },
  { race: 'Indy GP 2', type: 'Road', start: 16, finish: 14, bestLapRank: 15, points: 16 },
  { race: 'Detroit', type: 'Street', start: 12, finish: 11, bestLapRank: 12, points: 19 },
  { race: 'WWTR', type: 'Oval', start: 12, finish: 23, bestLapRank: 20, points: 12 }
];

export const seedBroadcastRoute: BroadcastSessionRoute = {
  eventId: seedHeartbeat.EventID,
  sessionId: seedHeartbeat.EventSessionID,
  eventName: seedHeartbeat.eventName,
  sessionName: 'Race',
  sessionType: 'R',
  startsAt: '2026-06-07 21:30:00',
  endsAt: '2026-06-07 22:30:00',
  estimatedGreenFlag: '2026-06-07 21:35:00',
  primaryVideo: {
    id: 'seed-fs1',
    name: 'FS1',
    url: 'https://www.foxsports.com/live/fs1',
    kind: 'video'
  },
  alternates: [
    {
      id: 'seed-provider-hulu',
      name: 'Hulu Live TV',
      url: 'https://www.hulu.com/live-tv',
      kind: 'fallback'
    },
    {
      id: 'seed-provider-xfinity',
      name: 'Xfinity Stream',
      url: 'https://www.xfinity.com/stream/',
      kind: 'fallback'
    }
  ],
  audio: [
    {
      id: 'seed-indycar-radio',
      name: 'INDYCAR Radio Network',
      url: 'https://www.indycar.com/Radio',
      kind: 'audio'
    }
  ],
  international: [
    {
      id: 'seed-indycar-live',
      name: 'INDYCAR LIVE',
      url: 'https://www.indycarlive.com',
      kind: 'international'
    }
  ],
  source: 'seed',
  note: 'Seeded WWTR race route. Use live schedule/activity feeds during race week.'
};

export const seedSnapshot: RaceSnapshot = {
  heartbeat: seedHeartbeat,
  timingRows: seedTimingRows,
  bryce: seedTimingRows.find((row) => row.no === '9')!,
  bryceProfile: seedBryceProfile,
  trackMapUrl: 'https://www.indycar.com/-/media/IndyCar/Schedules/TrackOutlines/Sectors/STL-Turns-Traps.jpg',
  broadcastRoute: seedBroadcastRoute,
  updatedAt: new Date().toISOString(),
  sourceState: 'seed',
  sourceProbes: [
    {
      id: 'timing',
      label: 'Timing and scoring',
      url: sourceUrls.timing,
      state: 'seed',
      note: 'Seeded from the public Race Control blob schema.'
    },
    {
      id: 'drivers',
      label: 'INDY NXT drivers',
      url: sourceUrls.drivers,
      state: 'seed',
      note: 'Seeded Bryce profile and radio frequency.'
    }
  ]
};
