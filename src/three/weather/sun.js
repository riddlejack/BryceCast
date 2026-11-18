// weather/sun.js: where the sun stood at a place and moment (career round 2, Nov 17 2026), so each race's model is lit
// from the sun of its own race hour. NOAA's solar position equations (the General Solar Position calculations behind
// the NOAA Solar Calculator, https://gml.noaa.gov/grad/solcalc/calcdetails.html), good to well under a degree for
// 1900-2100; no refraction (it matters only within a degree or two of the horizon).
//
//   solarPosition(latDeg, lonDeg, utcMs) -> { azimuthDeg, elevationDeg }
//     azimuthDeg   the sun's bearing, degrees clockwise from true north (90 east, 180 south)
//     elevationDeg its height above the horizon (negative: below it)

const RAD = Math.PI / 180;

export function solarPosition(latDeg, lonDeg, utcMs) {
  const jd = utcMs / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const omega = (125.04 - 1934.136 * T) * RAD;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const y = Math.tan(eps / 2) ** 2, L0r = L0 * RAD;
  const eqTime = 4 / RAD * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));   // minutes
  const minutesUtc = (((utcMs % 86400000) + 86400000) % 86400000) / 60000;
  const trueSolar = (((minutesUtc + eqTime + 4 * lonDeg) % 1440) + 1440) % 1440;
  const ha = (trueSolar / 4 - 180) * RAD;
  const lat = latDeg * RAD;
  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const elevationDeg = 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / RAD;
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) / RAD + 180;
  return { azimuthDeg: ((az % 360) + 360) % 360, elevationDeg };
}
