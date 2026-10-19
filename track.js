import { SETTINGS } from "./config.js";
import { PETALS, MAP_ASPECT } from "./routes.js";

// distances in km along each loop: on the map going out, off the map, on the map coming back
const KM_X = SETTINGS.mapWidthKm;
const KM_Y = SETTINGS.mapWidthKm / MAP_ASPECT;
const segKm = (a, b) => Math.hypot((b[0] - a[0]) * KM_X, (b[1] - a[1]) * KM_Y);
const lengthKm = (pts) => pts.slice(1).reduce((sum, p, i) => sum + segKm(pts[i], p), 0);

function pointAt(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const seg = segKm(pts[i - 1], pts[i]);
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
  LOOPS[key] = { ...p, outKm, inKm, offKm, total: outKm + offKm + inKm };
}

// where a Goer is after `hours` (0..1 map coordinates), and whether it is on this map
export function locate(goer, hours) {
  const loop = LOOPS[goer.petal];
  const travelled = goer.start * loop.total + (goer.kmPerDay * hours) / 24;
  let d = ((travelled % loop.total) + loop.total) % loop.total;
  if (d < loop.outKm) return { onMap: true, at: pointAt(loop.out, d) };
  d -= loop.outKm;
  if (d < loop.offKm) {
    const at = d < loop.offKm / 2 ? loop.out[loop.out.length - 1] : loop.in[0];
    return { onMap: false, at, backInDays: (loop.offKm - d) / goer.kmPerDay };
  }
  return { onMap: true, at: pointAt(loop.in, d - loop.offKm) };
}

export const hourOf = (hours) => ((hours % 24) + 24) % 24;
export const isNight = (hours) => hourOf(hours) < SETTINGS.dayStartsAt || hourOf(hours) >= SETTINGS.nightStartsAt;
