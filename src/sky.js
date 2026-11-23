export const MARS_SOL_SECONDS = 88775.244;
export const MARS_SIDEREAL_SECONDS = 88642.66;
export const PHOBOS_ORBIT_SECONDS = 7 * 3600 + 39.2 * 60;
export const DEIMOS_ORBIT_SECONDS = 30 * 3600 + 17.9 * 60;

const MARS_RADIUS_KM = 3389.5;
const LATITUDE = 18.44 * Math.PI / 180;
const TAU = Math.PI * 2;

function moonPosition(seconds, orbitSeconds, orbitRadius, moonRadius, initialHourAngle) {
  const hourAngle = initialHourAngle + TAU * seconds * (1 / MARS_SIDEREAL_SECONDS - 1 / orbitSeconds);
  const east = -orbitRadius * Math.sin(hourAngle);
  const north = -orbitRadius * Math.cos(hourAngle) * Math.sin(LATITUDE);
  const up = orbitRadius * Math.cos(hourAngle) * Math.cos(LATITUDE) - MARS_RADIUS_KM;
  const distance = Math.hypot(east, north, up);
  return { x: east / distance, y: up / distance, z: -north / distance, angularRadius: moonRadius / distance };
}

export function marsSky(sol, minutes) {
  const seconds = (sol - 1 + minutes / 1440) * MARS_SOL_SECONDS;
  const hourAngle = TAU * (minutes / 1440 - 0.5);
  const cosHour = Math.cos(hourAngle);
  return {
    sun: {
      x: -Math.sin(hourAngle),
      y: Math.cos(LATITUDE) * cosHour,
      z: Math.sin(LATITUDE) * cosHour
    },
    phobos: moonPosition(seconds, PHOBOS_ORBIT_SECONDS, 9376, 11.1, 0.35),
    deimos: moonPosition(seconds, DEIMOS_ORBIT_SECONDS, 23463, 6.2, -0.9)
  };
}
