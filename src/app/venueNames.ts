/* One name per venue (proxy review 5, November 18, 2026).
 *
 * Every track label on the site reads from this table: race titles and race
 * cards (careerRaceNames), chapter and chart labels (chapters/common), the
 * season strips (races/seasonMarks), the climb, the race-week rows and
 * shortVenue. Each venue has one name and one short form for tight labels, the
 * short form a cut or the series' own initials of the same name (COTA, VIR,
 * WWTR), never a second name: Gateway was the old name of World Wide Technology
 * Raceway, so it never appears. Keys are the sources' spellings, lower-cased;
 * a race named by its event ("OUTFRONT Showdown", "Grand Prix of Monterey")
 * keeps the event's name, which is not a track label. */

interface Venue {
  name: string;
  short: string;
}

const v = (name: string, short = name): Venue => ({ name, short });

const VENUES: Record<string, Venue> = {
  /* SCCA, F1600, RCFFS */
  'homestead-miami speedway': v('Homestead-Miami Speedway', 'Homestead'),
  'sebring international raceway': v('Sebring'),
  sebring: v('Sebring'),
  'circuit of the americas': v('Circuit of the Americas', 'COTA'),
  'michelin raceway road atlanta': v('Road Atlanta'),
  'road atlanta': v('Road Atlanta'),
  'watkins glen international': v('Watkins Glen'),
  'watkins glen': v('Watkins Glen'),
  'mid ohio sports car course': v('Mid-Ohio'),
  'mid-ohio sports car course': v('Mid-Ohio'),
  'mid-ohio': v('Mid-Ohio'),
  'virginia international raceway': v('Virginia International Raceway', 'VIR'),
  'pittsburgh international race complex': v('Pittsburgh International Race Complex', 'Pittsburgh'),
  'summit point motorsports park': v('Summit Point'),
  'summit point motorsports park main circuit': v('Summit Point'),
  'summit point': v('Summit Point'),
  'new jersey motorsports park thunderbolt': v('New Jersey Motorsports Park', 'NJMP'),
  'new jersey motorsports park thunderbolt raceway': v('New Jersey Motorsports Park', 'NJMP'),
  'new jersey motorsports park': v('New Jersey Motorsports Park', 'NJMP'),
  /* Formula Ford, GB3 */
  'brands hatch circuit': v('Brands Hatch'),
  'brands hatch': v('Brands Hatch'),
  'castle combe circuit': v('Castle Combe'),
  'castle combe': v('Castle Combe'),
  'oulton park': v('Oulton Park'),
  'cadwell park circuit': v('Cadwell Park'),
  'cadwell park': v('Cadwell Park'),
  'silverstone circuit': v('Silverstone'),
  silverstone: v('Silverstone'),
  'donington park': v('Donington Park'),
  'snetterton circuit': v('Snetterton'),
  snetterton: v('Snetterton'),
  /* Euroformula; GB3's sheets say "Spa", 2021's and Euroformula's "Spa-Francorchamps" */
  'autodromo internacional do algarve': v('Portimão'),
  portimao: v('Portimão'),
  'portimão': v('Portimão'),
  'circuit de spa-francorchamps': v('Spa'),
  'spa-francorchamps': v('Spa'),
  spa: v('Spa'),
  hungaroring: v('Hungaroring'),
  'circuit paul ricard': v('Paul Ricard'),
  'paul ricard': v('Paul Ricard'),
  'red bull ring': v('Red Bull Ring'),
  'autodromo nazionale monza': v('Monza'),
  monza: v('Monza'),
  /* FR Oceania */
  'euromarque motorsport park': v('Euromarque'),
  'highlands motorsport park': v('Highlands'),
  'hampton downs motorsport park': v('Hampton Downs'),
  'taupo international motorsport park': v('Taupo'),
  'manfeild - circuit chris amon': v('Manfeild'),
  /* USF Pro 2000, IMSA */
  'lucas oil indianapolis raceway park': v('Indianapolis Raceway Park', 'IRP'),
  'indianapolis raceway park': v('Indianapolis Raceway Park', 'IRP'),
  'daytona international speedway': v('Daytona International Speedway', 'Daytona'),
  /* INDY NXT */
  'streets of st. petersburg': v('Streets of St. Petersburg', 'St. Pete'),
  'st petersburg street circuit': v('Streets of St. Petersburg', 'St. Pete'),
  'barber motorsports park': v('Barber Motorsports Park', 'Barber'),
  'indianapolis motor speedway road course': v('Indianapolis Motor Speedway Road Course', 'Indy Road Course'),
  'indianapolis motor speedway rc': v('Indianapolis Motor Speedway Road Course', 'Indy Road Course'),
  'detroit downtown street circuit': v('Streets of Detroit', 'Detroit'),
  'detroit street circuit': v('Streets of Detroit', 'Detroit'),
  'streets of detroit': v('Streets of Detroit', 'Detroit'),
  'road america': v('Road America'),
  'weathertech raceway laguna seca': v('WeatherTech Raceway Laguna Seca', 'Laguna Seca'),
  'iowa speedway': v('Iowa Speedway', 'Iowa'),
  'world wide technology raceway': v('World Wide Technology Raceway', 'WWTR'),
  'wwt raceway': v('World Wide Technology Raceway', 'WWTR'),
  'wwtr': v('World Wide Technology Raceway', 'WWTR'),
  gateway: v('World Wide Technology Raceway', 'WWTR'),
  'gateway motorsports park': v('World Wide Technology Raceway', 'WWTR'),
  'portland international raceway': v('Portland International Raceway', 'Portland'),
  'the milwaukee mile': v('The Milwaukee Mile', 'Milwaukee'),
  'milwaukee mile': v('The Milwaukee Mile', 'Milwaukee'),
  'nashville superspeedway': v('Nashville Superspeedway', 'Nashville'),
  'grand prix of arlington street circuit': v('Streets of Arlington', 'Arlington'),
  'streets of arlington': v('Streets of Arlington', 'Arlington')
};

const venueOf = (trackName: string): Venue | null => VENUES[trackName.trim().toLowerCase()] ?? null;

/** True where the table knows the venue. */
export const isKnownVenue = (trackName: string): boolean => venueOf(trackName) !== null;

/** The venue's one name ("Mid-Ohio", "World Wide Technology Raceway"); an unknown name as given. */
export const venueName = (trackName: string): string => venueOf(trackName)?.name ?? trackName.trim();

/** The venue's short form for tight labels ("COTA", "WWTR", "Mid-Ohio"); an unknown name as given. */
export const venueShort = (trackName: string): string => venueOf(trackName)?.short ?? trackName.trim();
