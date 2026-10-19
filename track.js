import { GOERS, SETTINGS } from "./config.js";
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

// where a Goer stands now: off its route where the GM left it, or on its route
export function whereIs(g, s) {
  if (s.detached[g.name]) return { onMap: true, at: s.detached[g.name], detached: true };
  return locate(g, s.hours, s.shift[g.name] ?? 0);
}

// two Goers closer than this (in km) would bump into each other: half their token widths added up
const tokenKm = (g) => SETTINGS.tokenSizePerKm * SETTINGS.mapWidthKm * g.sizeKm;
const reach = (a, b) => (tokenKm(a) + tokenKm(b)) / 2;
// small enough steps that the fastest Goer can't jump over the smallest one
const STEP_HOURS = Math.max(0.25, (Math.min(...GOERS.map(tokenKm)) / 4) / (Math.max(...GOERS.map((g) => g.kmPerDay)) / 24));

// move time by dh hours. Paused Goers stay put; Goers taken off their route walk back to it;
// when two Goers would bump into each other, the slower one waits until the faster one has passed.
export function advance(s, dh) {
  const target = Math.max(0, s.hours + dh);
  const shift = { ...s.shift };
  const detached = { ...s.detached };
  let waiting = {};
  let hours = s.hours;
  if (target <= hours) {
    for (const g of GOERS) {
      if (s.paused[g.name] || detached[g.name]) shift[g.name] = (shift[g.name] ?? 0) - (g.kmPerDay * (target - hours)) / 24;
    }
    return { hours: target, shift, detached, waiting };
  }
  const at = (g, h) => locate(g, h, shift[g.name] ?? 0);
  while (hours < target - 1e-9) {
    const h = Math.min(STEP_HOURS, target - hours);
    const next = hours + h;
    const walkers = GOERS.filter((g) => !s.paused[g.name] && !detached[g.name]);
    const now = Object.fromEntries(walkers.map((g) => [g.name, at(g, hours)]));
    const then = Object.fromEntries(walkers.map((g) => [g.name, at(g, next)]));
    waiting = {};
    for (let i = 0; i < walkers.length; i++) {
      for (let j = i + 1; j < walkers.length; j++) {
        const [a, b] = [walkers[i], walkers[j]];
        const [a0, b0, a1, b1] = [now[a.name], now[b.name], then[a.name], then[b.name]];
        if (!a0.onMap || !b0.onMap || !a1.onMap || !b1.onMap) continue;
        const after = kmBetween(a1.at, b1.at);
        if (after >= reach(a, b) || after >= kmBetween(a0.at, b0.at)) continue;
        const [slow, fast] = a.kmPerDay < b.kmPerDay ? [a, b] : [b, a];
        waiting[slow.name] = fast.name;
      }
    }
    for (const g of GOERS) {
      const km = (g.kmPerDay * h) / 24;
      if (s.paused[g.name] || waiting[g.name]) {
        shift[g.name] = (shift[g.name] ?? 0) - km;
      } else if (detached[g.name]) {
        const back = nearestOnRoute(g, detached[g.name]);
        const step = stepToward(detached[g.name], back.p, km);
        if (step.arrived) {
          delete detached[g.name];
          shift[g.name] = shiftFor(g, next, back.d);
        } else detached[g.name] = step.at;
      }
    }
    hours = next;
  }
  return { hours: target, shift, detached, waiting };
}

export const hourOf = (hours) => ((hours % 24) + 24) % 24;
export const isNight = (hours) => hourOf(hours) < SETTINGS.dayStartsAt || hourOf(hours) >= SETTINGS.nightStartsAt;
