/* ---------- next season, as far as it is officially known ----------
 * The packaged upcoming-event window (screens.upcomingPrep.events) is the
 * authority the moment INDY NXT publishes its own calendar; this file only
 * bridges the gap between a finished season and that publication.
 *
 * As of 2026-09-19 INDYCAR has released Phase One of the 2027 NTT INDYCAR
 * SERIES schedule (eight dates) and has said the INDY NXT by Firestone calendar
 * "will be announced at a later date". INDY NXT runs on INDYCAR weekends, so
 * these dates are shown as INDYCAR weekends — never as confirmed NXT rounds.
 * Replace or empty this list when the NXT calendar lands in the package. */

export interface AnnouncedWeekend {
  /** Race day, ISO date (venue-local). */
  date: string;
  /** Only where the source names the event itself. */
  eventName?: string;
  /** Venue as INDYCAR names it. */
  venue: string;
  /** Canonical BryceCast track name when the venue is one INDY NXT has raced
   *  in Bryce's seasons — drives the outline and his record there. */
  trackName: string | null;
}

export interface NextSeasonOutlook {
  seasonYear: number;
  /** 'pending' until INDY NXT publishes its own calendar. */
  indyNxtCalendar: 'pending' | 'published';
  checkedOn: string;
  source: { label: string; url: string };
  indycarWeekends: AnnouncedWeekend[];
}

export const nextSeasonOutlook: NextSeasonOutlook = {
  seasonYear: 2027,
  indyNxtCalendar: 'pending',
  checkedOn: '2026-09-19',
  source: {
    label: 'INDYCAR — Phase One of the 2027 NTT INDYCAR SERIES schedule (Aug 12, 2026)',
    url: 'https://www.indycar.com/news/2026/08/08-12-early-2027-sked'
  },
  indycarWeekends: [
    { date: '2027-03-07', venue: 'Streets of St. Petersburg', trackName: 'Streets of St. Petersburg' },
    { date: '2027-03-13', venue: 'Phoenix Raceway', trackName: null },
    { date: '2027-03-21', venue: 'Streets of Arlington', trackName: 'Streets of Arlington' },
    { date: '2027-04-04', venue: 'Barber Motorsports Park', trackName: 'Barber Motorsports Park' },
    { date: '2027-04-18', venue: 'Streets of Long Beach', trackName: null },
    { date: '2027-05-15', venue: 'Indianapolis Motor Speedway Road Course', trackName: 'Indianapolis Motor Speedway Road Course' },
    { date: '2027-05-30', eventName: 'The 111th Indianapolis 500', venue: 'Indianapolis Motor Speedway', trackName: null },
    { date: '2027-06-06', venue: 'Streets of Detroit', trackName: 'Streets of Detroit' }
  ]
};
