import OBR, { buildShape, buildLabel } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import { GOERS, SETTINGS } from "./config.js";
import { PETALS } from "./routes.js";
import { whereIs, isNight, kmBetween } from "./track.js";

export { OBR };
export const ID = "wastelands.goer-tracker";
export const STATE = `${ID}/state`;
const TAG = `${ID}/item`; // items the extension made
const PLACED = `${ID}/placed`; // on every Goer token: where the extension last put it
export const DEFAULT = {
  hours: 8, mapId: null, reveal: {}, paused: {}, shift: {}, detached: {}, waiting: {},
  nightOverlay: true, labels: SETTINGS.labels, playRate: 0, autoReveal: true, heard: {},
};

// Labels and the stand-in circles are local items: only the GM sees them, and they disappear
// with the extension. Only the night overlay is a real scene item, because the players see it too.
const local = () => OBR.scene.local;

let report = () => {};
export const onReport = (fn) => (report = fn);

// ---- state (kept in the scene, so it stays with the map) ----
export const withDefaults = (s) => ({ ...DEFAULT, ...(s ?? {}) });
export const getState = async () => withDefaults((await OBR.scene.getMetadata())[STATE]);
const saveState = (state) => OBR.scene.setMetadata({ [STATE]: state });

// changes run one after another; clock ticks are skipped while the previous change still runs
let queue = Promise.resolve();
let busy = false;
export function change(fn, { skipIfBusy = false } = {}) {
  if (skipIfBusy && busy) return queue;
  queue = queue.then(async () => {
    busy = true;
    try {
      const state = await getState();
      const next = { ...state, ...fn(state) };
      await saveState(next);
      await sync(next);
    } catch (error) {
      report(`Error: ${error?.message ?? error}`);
    } finally {
      busy = false;
    }
  });
  return queue;
}

// ---- finding things in the scene ----
// "founder_token.png", "Founder Token" and "founder-token" all read as the same name
const words = (s) => String(s ?? "").toLowerCase().replace(/\.(png|jpe?g|webp|gif)$/, "").split(/[^a-z0-9]+/).filter(Boolean);
const squash = (s) => words(s).join("");
const isImage = (item) => item.type === "IMAGE" && item.layer !== "MAP" && !item.metadata?.[TAG];
const keyOf = (item) => item.metadata?.[TAG]?.key;

// the selected item, else a map with "main map" in its name, else the biggest image on the map layer
export async function findMap() {
  const selection = await OBR.player.getSelection();
  if (selection?.length) return selection[0];
  const maps = await OBR.scene.items.getItems((item) => item.layer === "MAP" && item.type === "IMAGE");
  const main = maps.find((map) => words(map.name).includes("main") && words(map.name).includes("map"));
  if (main) return main.id;
  let best = null;
  let area = -1;
  for (const map of maps) {
    const box = await OBR.scene.items.getItemBounds([map.id]);
    if (box.width * box.height > area) [best, area] = [map.id, box.width * box.height];
  }
  return best;
}

async function offsetOf(api, item) {
  const b = await api.getItemBounds([item.id]);
  return { x: b.center.x - item.position.x, y: b.center.y - item.position.y, width: b.width };
}

// a Goer off the map waits just outside the edge where it left (or will come back)
const outside = ([u, v], m) => [
  u <= 0.001 ? -m.u : u >= 0.999 ? 1 + m.u : u,
  v <= 0.001 ? -m.v : v >= 0.999 ? 1 + m.v : v,
];

// ---- put every token where it belongs ----
export async function sync(state) {
  // the Goers belong to the main map: if it is gone, hide them instead of moving them onto another map
  if (state.mapId && !(await OBR.scene.items.getItems([state.mapId])).length) {
    await hideAll();
    return report("The main map is not in this scene any more, so the Goers are hidden. Put it back, or select a map and click Find map.");
  }
  if (!state.mapId) {
    const mapId = await findMap();
    if (!mapId) return report("No map in this scene. Add the main map to the scene as a map first.");
    state = { ...state, mapId };
    await saveState(state);
  }
  const box = await OBR.scene.items.getItemBounds([state.mapId]);
  const toScene = ([u, v]) => ({ x: box.min.x + u * box.width, y: box.min.y + v * box.height });
  const perKm = SETTINGS.tokenSizePerKm * box.width;

  let items = await OBR.scene.items.getItems();
  let helpers = await local().getItems((item) => keyOf(item));

  // tidy up: circles and labels that older versions put into the scene, doubled helpers
  const stale = items.filter((i) => keyOf(i) && keyOf(i) !== "night").map((i) => i.id);
  if (!state.nightOverlay) stale.push(...items.filter((i) => keyOf(i) === "night").map((i) => i.id));
  if (stale.length) await OBR.scene.items.deleteItems(stale);
  const seen = new Set();
  const doubled = helpers.filter((i) => seen.has(keyOf(i)) || !seen.add(keyOf(i))).map((i) => i.id);
  if (doubled.length) await local().deleteItems(doubled);

  // its image: the exact token name first, else an image whose name has the Goer's name as a word
  const userToken = (g) =>
    items.find((i) => isImage(i) && squash(i.name) === squash(g.token)) ??
    items.find((i) => isImage(i) && words(i.name).includes(g.name.toLowerCase()));
  const helper = (key) => helpers.find((i) => keyOf(i) === key);

  // where the players are on the main map, and which Goers they can hear
  const party = partyPoints(items, box);
  const heard = {};
  for (const g of GOERS) {
    const loc = whereIs(g, state);
    if (state.autoReveal && loc.onMap && party.some((p) => kmBetween(p, loc.at) <= SETTINGS.hearingKmPerKm * g.sizeKm)) heard[g.name] = true;
  }
  if (JSON.stringify(heard) !== JSON.stringify(state.heard)) {
    state = { ...state, heard };
    await saveState(state);
  }

  // create what is missing
  if (state.nightOverlay && !items.some((i) => keyOf(i) === "night")) {
    await OBR.scene.items.addItems([buildShape().shapeType("RECTANGLE").width(box.width).height(box.height)
      .position({ ...box.center }).fillColor("#0a1030").fillOpacity(SETTINGS.nightOpacity).strokeWidth(0).strokeOpacity(0)
      .layer("DRAWING").locked(true).disableHit(true).visible(false).name("Night")
      .metadata({ [TAG]: { key: "night" } }).build()]);
  }
  const add = [];
  const remove = [];
  for (const g of GOERS) {
    const size = perKm * g.sizeKm;
    const at = toScene(whereIs(g, state).at);
    const circle = helper(g.name);
    if (userToken(g)) {
      if (circle) remove.push(circle.id);
    } else if (!circle) {
      add.push(buildShape().shapeType("CIRCLE").width(size).height(size).position(at)
        .fillColor(PETALS[g.petal].color).fillOpacity(1).strokeColor("#000000").strokeWidth(size * 0.08)
        .layer("MOUNT").name(g.name).metadata({ [TAG]: { key: g.name, goer: g.name } }).build());
    }
    const label = helper(`label:${g.name}`);
    if (state.labels && !label) {
      add.push(buildLabel().plainText(g.name).position(at).locked(true).disableHit(true)
        .name(`${g.name} label`).metadata({ [TAG]: { key: `label:${g.name}`, goer: g.name } }).build());
    } else if (!state.labels && label) remove.push(label.id);
  }
  if (remove.length) await local().deleteItems(remove);
  if (add.length) await local().addItems(add);
  items = await OBR.scene.items.getItems();
  helpers = await local().getItems((item) => keyOf(item));

  // plan every change, then apply them: scene items in one update, local helpers in another
  const scenePlan = new Map();
  const localPlan = new Map();
  const nightItem = items.find((i) => keyOf(i) === "night");
  if (nightItem) {
    const off = await offsetOf(OBR.scene.items, nightItem);
    const dark = isNight(state.hours);
    scenePlan.set(nightItem.id, (d) => {
      d.position = { x: box.center.x - off.x, y: box.center.y - off.y };
      d.visible = dark;
    });
  }
  for (const g of GOERS) {
    const loc = whereIs(g, state);
    const size = perKm * g.sizeKm;
    const margin = { u: (size * 1.5) / box.width, v: (size * 1.5) / box.height };
    const at = toScene(loc.onMap ? loc.at : outside(loc.at, margin));
    const shown = loc.onMap && (!!state.reveal[g.name] || !!heard[g.name]);
    const image = userToken(g);
    const token = image ?? helper(g.name);
    if (token) {
      const api = image ? OBR.scene.items : local();
      const now = await offsetOf(api, token);
      const ratio = now.width ? size / now.width : 1;
      const off = { x: now.x * ratio, y: now.y * ratio };
      const pos = { x: at.x - off.x, y: at.y - off.y };
      (image ? scenePlan : localPlan).set(token.id, (d) => {
        if (d.type === "IMAGE") {
          d.scale = { x: d.scale.x * ratio, y: d.scale.y * ratio };
          d.visible = shown;
        } else {
          d.width = size;
          d.height = size;
          d.style.fillOpacity = shown ? 1 : 0.4; // the circle is only for you; faint = hidden from players
        }
        d.position = pos;
        d.metadata[PLACED] = { goer: g.name, pos, off, size };
      });
    }
    const label = helper(`label:${g.name}`);
    if (label) {
      localPlan.set(label.id, (d) => {
        d.position = { x: at.x, y: at.y + size * 0.65 };
        d.text.plainText = !loc.onMap ? `${g.name} (off the map)` : loc.detached ? `${g.name} (off its route)` : g.name;
        d.style.backgroundOpacity = shown ? 0.85 : 0.35; // faint = hidden from players
      });
    }
  }
  if (scenePlan.size) {
    await OBR.scene.items.updateItems([...scenePlan.keys()], (drafts) => drafts.forEach((d) => scenePlan.get(d.id)(d)));
  }
  if (localPlan.size) {
    await local().updateItems([...localPlan.keys()], (drafts) => drafts.forEach((d) => localPlan.get(d.id)(d)));
  }
  const missing = GOERS.filter((g) => !userToken(g)).map((g) => g.name);
  const images = items.filter(isImage).map((i) => `"${i.name}"`);
  report(missing.length && images.length
    ? `No image found for ${missing.join(", ")}. Images in the scene: ${images.slice(0, 15).join(", ")}`
    : "");
}

// the tokens that stand for the players: named in config.js, or every visible character token on the map
function partyPoints(items, box) {
  const names = SETTINGS.partyTokens.map(squash);
  return items
    .filter((i) => i.layer === "CHARACTER" && i.visible && !keyOf(i) && (!names.length || names.includes(squash(i.name))))
    .map((i) => i.position)
    .filter((p) => p.x >= box.min.x && p.x <= box.max.x && p.y >= box.min.y && p.y <= box.max.y)
    .map((p) => [(p.x - box.min.x) / box.width, (p.y - box.min.y) / box.height]);
}

// when a player token moves, check again who can be heard
let partyWhere = "";
export function onPartyMove(items) {
  const now = JSON.stringify(items.filter((i) => i.layer === "CHARACTER").map((i) => [i.id, Math.round(i.position.x), Math.round(i.position.y), i.visible]));
  if (now === partyWhere) return;
  const first = !partyWhere;
  partyWhere = now;
  if (!first) change(() => ({}));
}

async function hideAll() {
  const placed = await OBR.scene.items.getItems((item) => item.metadata?.[PLACED] || keyOf(item));
  if (placed.length) await OBR.scene.items.updateItems(placed.map((i) => i.id), (drafts) => drafts.forEach((d) => (d.visible = false)));
  const helpers = await local().getItems((item) => keyOf(item));
  if (helpers.length) await local().deleteItems(helpers.map((i) => i.id));
}

// removes everything the extension made: helpers, the night overlay, circles left by older versions
export async function removeTokens() {
  const scene = await OBR.scene.items.getItems((item) => keyOf(item));
  if (scene.length) await OBR.scene.items.deleteItems(scene.map((item) => item.id));
  const helpers = await local().getItems((item) => keyOf(item));
  if (helpers.length) await local().deleteItems(helpers.map((item) => item.id));
}

// the GM dragged a Goer: it leaves its route where it was dropped
export async function onItemsChange(items, gmId) {
  const moved = items.filter((item) => {
    const placed = item.metadata?.[PLACED];
    if (!placed || (item.lastModifiedUserId && item.lastModifiedUserId !== gmId)) return false;
    return Math.hypot(item.position.x - placed.pos.x, item.position.y - placed.pos.y) > placed.size * 0.1;
  });
  if (!moved.length) return;
  const state = await getState();
  if (!state.mapId || !(await OBR.scene.items.getItems([state.mapId])).length) return;
  const box = await OBR.scene.items.getItemBounds([state.mapId]);
  const dropped = {};
  for (const item of moved) {
    const { goer, off } = item.metadata[PLACED];
    const cx = item.position.x + off.x;
    const cy = item.position.y + off.y;
    dropped[goer] = [(cx - box.min.x) / box.width, (cy - box.min.y) / box.height];
  }
  await change((s) => ({ detached: { ...s.detached, ...dropped } }));
}
