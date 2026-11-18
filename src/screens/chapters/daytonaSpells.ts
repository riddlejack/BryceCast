/* Car 85's driver spells in the 2025 Rolex 24 at Daytona, with their race-
 * clock times.
 *
 * Derived from the official IMSA / Al Kamel time card as the stint pack's
 * producer already extracts it: analysis/imsa-daytona-stint-class-pace/
 * output/imsa_lap_observations.csv (sha256 777a59cf54d3871b…), rows with
 * carNumber 85, in lap order. Elapsed time is the running sum of the car's
 * official lap times (all 780 laps have one; they sum to 86,507.1 s, the 24
 * hours plus the last lap); a spell is an unbroken run of one driver. Bryce's
 * three spells hold 49 + 59 + 34 = 142 laps, the pack's own count.
 *
 * Asked of the data lane (r2-data, November 18, 2026) as a pack field,
 * `car85Spells`; when it lands, read it from the pack and delete this file. */

export interface CarSpell {
  driverName: string;
  driverId: string;
  startLap: number;
  endLap: number;
  laps: number;
  startElapsedSeconds: number;
  endElapsedSeconds: number;
}

export const CAR85_SPELLS: CarSpell[] = [
  { driverName: 'Gianmaria Bruni', driverId: 'driver_gianmaria_bruni', startLap: 1, endLap: 58, laps: 58, startElapsedSeconds: 0.0, endElapsedSeconds: 5910.5 },
  { driverName: 'Tijmen van der Helm', driverId: 'driver_tijmen_van_der_helm', startLap: 59, endLap: 109, laps: 51, startElapsedSeconds: 5910.5, endElapsedSeconds: 11738.8 },
  { driverName: 'Pascal Wehrlein', driverId: 'driver_pascal_wehrlein', startLap: 110, endLap: 171, laps: 62, startElapsedSeconds: 11738.8, endElapsedSeconds: 18553.6 },
  { driverName: 'Bryce Aron', driverId: 'driver_bryce_aron', startLap: 172, endLap: 220, laps: 49, startElapsedSeconds: 18553.6, endElapsedSeconds: 24021.1 },
  { driverName: 'Gianmaria Bruni', driverId: 'driver_gianmaria_bruni', startLap: 221, endLap: 273, laps: 53, startElapsedSeconds: 24021.1, endElapsedSeconds: 30528.8 },
  { driverName: 'Tijmen van der Helm', driverId: 'driver_tijmen_van_der_helm', startLap: 274, endLap: 315, laps: 42, startElapsedSeconds: 30528.8, endElapsedSeconds: 35039.5 },
  { driverName: 'Pascal Wehrlein', driverId: 'driver_pascal_wehrlein', startLap: 316, endLap: 387, laps: 72, startElapsedSeconds: 35039.5, endElapsedSeconds: 43257.3 },
  { driverName: 'Bryce Aron', driverId: 'driver_bryce_aron', startLap: 388, endLap: 446, laps: 59, startElapsedSeconds: 43257.3, endElapsedSeconds: 50493.2 },
  { driverName: 'Gianmaria Bruni', driverId: 'driver_gianmaria_bruni', startLap: 447, endLap: 503, laps: 57, startElapsedSeconds: 50493.2, endElapsedSeconds: 56501.9 },
  { driverName: 'Tijmen van der Helm', driverId: 'driver_tijmen_van_der_helm', startLap: 504, endLap: 558, laps: 55, startElapsedSeconds: 56501.9, endElapsedSeconds: 62153.5 },
  { driverName: 'Pascal Wehrlein', driverId: 'driver_pascal_wehrlein', startLap: 559, endLap: 598, laps: 40, startElapsedSeconds: 62153.5, endElapsedSeconds: 66475.9 },
  { driverName: 'Bryce Aron', driverId: 'driver_bryce_aron', startLap: 599, endLap: 632, laps: 34, startElapsedSeconds: 66475.9, endElapsedSeconds: 70506.6 },
  { driverName: 'Gianmaria Bruni', driverId: 'driver_gianmaria_bruni', startLap: 633, endLap: 660, laps: 28, startElapsedSeconds: 70506.6, endElapsedSeconds: 73377.5 },
  { driverName: 'Tijmen van der Helm', driverId: 'driver_tijmen_van_der_helm', startLap: 661, endLap: 708, laps: 48, startElapsedSeconds: 73377.5, endElapsedSeconds: 78302.3 },
  { driverName: 'Pascal Wehrlein', driverId: 'driver_pascal_wehrlein', startLap: 709, endLap: 738, laps: 30, startElapsedSeconds: 78302.3, endElapsedSeconds: 81846.9 },
  { driverName: 'Gianmaria Bruni', driverId: 'driver_gianmaria_bruni', startLap: 739, endLap: 780, laps: 42, startElapsedSeconds: 81846.9, endElapsedSeconds: 86507.1 },
];
