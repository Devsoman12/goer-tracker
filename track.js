import { SETTINGS } from "./config.js";
import { PETALS, MAP_ASPECT } from "./routes.js";

// distances in km along each loop: on the map going out, off the map, on the map coming back
const KM_X = SETTINGS.mapWidthKm;
const KM_Y = SETTINGS.mapWidthKm / MAP_ASPECT;
export const kmBetween = (a, b) => Math.hypot((b[0] - a[0]) * KM_X, (b[1] - a[1]) * KM_Y);
const lengthKm = (pts) => pts.slice(1).reduce((sum, p, i) => sum + kmBetween(pts[i], p), 0);

function pointAt(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const seg = kmBetween(pts[i - 1], pts[i]);
    if (d <= seg) {
      const t = seg ? d / seg : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    d -= seg;
  }
  return pts[pts.length - 1];
}

export const LOOPS = {};
for (const [key, p] of Object.entries(PETALS)) {
  const outKm = lengthKm(p.out);
  const inKm = lengthKm(p.in);
  const offKm = SETTINGS.offMapKm[key] ?? outKm + inKm;
  const points = [];
  let d = 0;
  p.out.forEach((q, i) => points.push({ p: q, d: (d += i ? kmBetween(p.out[i - 1], q) : 0) }));
  d = outKm + offKm;
  p.in.forEach((q, i) => points.push({ p: q, d: (d += i ? kmBetween(p.in[i - 1], q) : 0) }));
  LOOPS[key] = { ...p, outKm, inKm, offKm, total: outKm + offKm + inKm, points };
}

const wrap = (d, total) => ((d % total) + total) % total;
const base = (goer, hours) => goer.start * LOOPS[goer.petal].total + (goer.kmPerDay * hours) / 24;

// where a Goer is on its route after `hours` (0..1 map coordinates), and whether that is on this map.
// shiftKm moves it along its route (used for pauses and for rejoining the route).
export function locate(goer, hours, shiftKm = 0) {
  const loop = LOOPS[goer.petal];
  let d = wrap(base(goer, hours) + shiftKm, loop.total);
  if (d < loop.outKm) return { onMap: true, at: pointAt(loop.out, d) };
  d -= loop.outKm;
  if (d < loop.offKm) {
    const leaving = d < loop.offKm / 2;
    return { onMap: false, at: leaving ? loop.out[loop.out.length - 1] : loop.in[0], backInDays: (loop.offKm - d) / goer.kmPerDay };
  }
  return { onMap: true, at: pointAt(loop.in, d - loop.offKm) };
}

// the closest point of the Goer's route on this map, with its distance along the loop
export function nearestOnRoute(goer, at) {
  let best = null;
  for (const q of LOOPS[goer.petal].points) {
    const km = kmBetween(at, q.p);
    if (!best || km < best.km) best = { km, p: q.p, d: q.d };
  }
  return best;
}

// the shift that puts the Goer at distance `d` along its loop at `hours`
export const shiftFor = (goer, hours, d) => wrap(d - base(goer, hours), LOOPS[goer.petal].total);

export function stepToward(from, to, km) {
  const total = kmBetween(from, to);
  if (total <= km) return { at: to, arrived: true };
  const t = km / total;
  return { at: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], arrived: false };
}

export const hourOf = (hours) => ((hours % 24) + 24) % 24;
export const isNight = (hours) => hourOf(hours) < SETTINGS.dayStartsAt || hourOf(hours) >= SETTINGS.nightStartsAt;
