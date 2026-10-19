import OBR, { buildShape, buildLabel } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import { GOERS, SETTINGS } from "./config.js";
import { PETALS } from "./routes.js";
import { locate, nearestOnRoute, shiftFor, stepToward, hourOf, isNight } from "./track.js";

const ID = "wastelands.goer-tracker";
const STATE = `${ID}/state`;
const TAG = `${ID}/item`;
const DEFAULT = { hours: 8, mapId: null, reveal: {}, paused: {}, shift: {}, detached: {}, nightOverlay: true, labels: SETTINGS.labels };
const $ = (id) => document.getElementById(id);
// "founder_token.png", "Founder Token" and "founder-token" all read as the same name
const words = (s) => String(s ?? "").toLowerCase().replace(/\.(png|jpe?g|webp|gif)$/, "").split(/[^a-z0-9]+/).filter(Boolean);
const squash = (s) => words(s).join("");
const isImage = (item) => item.type === "IMAGE" && item.layer !== "MAP" && !item.metadata?.[TAG];
const msg = (text) => ($("msg").textContent = text ?? "");

let role = "PLAYER";
let myId = null;
let lastBox = null; // the map's bounds at the last update
const expected = new Map(); // token id -> where the extension last put it
let busy = false;
let timer = null;

// ---- state (kept in the scene, so it stays with the map) ----
const withDefaults = (s) => ({ ...DEFAULT, ...(s ?? {}) });
const getState = async () => withDefaults((await OBR.scene.getMetadata())[STATE]);
const saveState = (state) => OBR.scene.setMetadata({ [STATE]: state });

// changes run one after another; fast-forward ticks are skipped while the previous one still runs
let queue = Promise.resolve();
function change(fn, { skipIfBusy = false } = {}) {
  if (skipIfBusy && busy) return queue;
  queue = queue.then(async () => {
    busy = true;
    try {
      const state = await getState();
      const next = { ...state, ...fn(state) };
      await saveState(next);
      await sync(next);
    } catch (error) {
      msg(`Error: ${error?.message ?? error}`);
    } finally {
      busy = false;
    }
  });
  return queue;
}

// move time: paused Goers stay put, Goers taken off their route walk back to it
function advance(s, dh) {
  const hours = Math.max(0, s.hours + dh);
  dh = hours - s.hours;
  const shift = { ...s.shift };
  const detached = { ...s.detached };
  for (const g of GOERS) {
    const km = (g.kmPerDay * dh) / 24;
    const paused = !!s.paused[g.name];
    if (paused || detached[g.name]) shift[g.name] = (shift[g.name] ?? 0) - km;
    if (detached[g.name] && !paused && km > 0) {
      const target = nearestOnRoute(g, detached[g.name]);
      const step = stepToward(detached[g.name], target.p, km);
      if (step.arrived) {
        delete detached[g.name];
        shift[g.name] = shiftFor(g, hours, target.d);
      } else detached[g.name] = step.at;
    }
  }
  return { hours, shift, detached };
}

function whereIs(g, s) {
  if (s.detached[g.name]) return { onMap: true, at: s.detached[g.name], detached: true };
  return locate(g, s.hours, s.shift[g.name] ?? 0);
}

// a Goer off the map waits just outside the edge where it left (or will come back)
const outside = ([u, v], m) => [
  u <= 0.001 ? -m.u : u >= 0.999 ? 1 + m.u : u,
  v <= 0.001 ? -m.v : v >= 0.999 ? 1 + m.v : v,
];

// the selected item, or else the biggest image on the map layer
async function findMap() {
  const selection = await OBR.player.getSelection();
  if (selection?.length) return selection[0];
  const maps = await OBR.scene.items.getItems((item) => item.layer === "MAP" && item.type === "IMAGE");
  let best = null;
  let area = -1;
  for (const map of maps) {
    const box = await OBR.scene.items.getItemBounds([map.id]);
    if (box.width * box.height > area) [best, area] = [map.id, box.width * box.height];
  }
  return best;
}

async function offsetOf(item) {
  const b = await OBR.scene.items.getItemBounds([item.id]);
  return { x: b.center.x - item.position.x, y: b.center.y - item.position.y, width: b.width };
}

// ---- tokens ----
async function sync(state) {
  if (!state.mapId || !(await OBR.scene.items.getItems([state.mapId])).length) {
    const mapId = await findMap();
    if (!mapId) return msg("No map in this scene. Add the main map to the scene as a map first.");
    state = { ...state, mapId };
    await saveState(state);
  }
  const box = (lastBox = await OBR.scene.items.getItemBounds([state.mapId]));
  const toScene = ([u, v]) => ({ x: box.min.x + u * box.width, y: box.min.y + v * box.height });
  const perKm = SETTINGS.tokenSizePerKm * box.width;

  let items = await OBR.scene.items.getItems();
  // its image: the exact token name first, else an image whose name has the Goer's name as a word
  const userToken = (g) =>
    items.find((i) => isImage(i) && squash(i.name) === squash(g.token)) ??
    items.find((i) => isImage(i) && words(i.name).includes(g.name.toLowerCase()));
  const ours = (key) => items.find((i) => i.metadata?.[TAG]?.key === key);

  // create what is missing: the night overlay, a circle for each Goer without its own image, labels
  const add = [];
  const remove = [];
  if (!ours("night")) {
    add.push(buildShape().shapeType("RECTANGLE").width(box.width).height(box.height).position({ ...box.center })
      .fillColor("#0a1030").fillOpacity(SETTINGS.nightOpacity).strokeWidth(0).strokeOpacity(0)
      .layer("DRAWING").locked(true).disableHit(true).visible(false).name("Night")
      .metadata({ [TAG]: { key: "night" } }).build());
  }
  for (const g of GOERS) {
    const size = perKm * g.sizeKm;
    const at = toScene(whereIs(g, state).at);
    const circle = ours(g.name);
    if (userToken(g)) {
      if (circle) remove.push(circle.id);
    } else if (!circle) {
      add.push(buildShape().shapeType("CIRCLE").width(size).height(size).position(at)
        .fillColor(PETALS[g.petal].color).fillOpacity(1).strokeColor("#000000").strokeWidth(size * 0.08)
        .layer("MOUNT").visible(false).name(g.name)
        .metadata({ [TAG]: { key: g.name, goer: g.name } }).build());
    }
    if (state.labels && !ours(`label:${g.name}`)) {
      add.push(buildLabel().plainText(g.name).position(at).locked(true).disableHit(true).visible(false)
        .name(`${g.name} label`).metadata({ [TAG]: { key: `label:${g.name}`, goer: g.name } }).build());
    }
  }
  // labels switched off are removed, so they are gone for the GM too
  if (!state.labels) remove.push(...items.filter((i) => String(i.metadata?.[TAG]?.key).startsWith("label:")).map((i) => i.id));
  if (remove.length) await OBR.scene.items.deleteItems(remove);
  if (add.length) await OBR.scene.items.addItems(add);
  if (remove.length || add.length) items = await OBR.scene.items.getItems();

  // plan every change, then apply them all in one update
  const plan = new Map();
  const nightItem = ours("night");
  if (nightItem) {
    const off = await offsetOf(nightItem);
    const dark = isNight(state.hours) && state.nightOverlay;
    plan.set(nightItem.id, (d) => {
      d.position = { x: box.center.x - off.x, y: box.center.y - off.y };
      d.visible = dark;
    });
  }
  for (const g of GOERS) {
    const loc = whereIs(g, state);
    const size = perKm * g.sizeKm;
    const margin = { u: (size * 1.5) / box.width, v: (size * 1.5) / box.height };
    const at = toScene(loc.onMap ? loc.at : outside(loc.at, margin));
    const shown = !!state.reveal[g.name] && loc.onMap;
    const token = userToken(g) ?? ours(g.name);
    if (token) {
      const now = await offsetOf(token);
      const ratio = now.width ? size / now.width : 1;
      const off = { x: now.x * ratio, y: now.y * ratio };
      const pos = { x: at.x - off.x, y: at.y - off.y };
      expected.set(token.id, { pos, off, goer: g.name });
      plan.set(token.id, (d) => {
        if (d.type === "IMAGE") d.scale = { x: d.scale.x * ratio, y: d.scale.y * ratio };
        else {
          d.width = size;
          d.height = size;
        }
        d.position = pos;
        d.visible = shown;
      });
    }
    const label = ours(`label:${g.name}`);
    if (label) {
      plan.set(label.id, (d) => {
        d.position = { x: at.x, y: at.y + size * 0.65 };
        d.text.plainText = loc.detached ? `${g.name} (off its route)` : g.name;
        d.visible = shown;
      });
    }
  }
  await OBR.scene.items.updateItems([...plan.keys()], (drafts) => {
    for (const d of drafts) plan.get(d.id)(d);
  });
  const missing = GOERS.filter((g) => !userToken(g)).map((g) => g.name);
  const images = items.filter(isImage).map((i) => `"${i.name}"`);
  msg(missing.length && images.length
    ? `No image found for ${missing.join(", ")}. Images in the scene: ${images.slice(0, 15).join(", ")}`
    : "");
}

async function removeTokens() {
  const mine = await OBR.scene.items.getItems((item) => item.metadata?.[TAG]);
  await OBR.scene.items.deleteItems(mine.map((item) => item.id));
  expected.clear();
}

// the GM dragged a Goer: take it off its route from where it was dropped
async function onItemsChange(items) {
  if (role !== "GM" || busy || !lastBox) return;
  const moved = {};
  const tolerance = lastBox.width * 0.002;
  for (const item of items) {
    const e = expected.get(item.id);
    if (!e || item.lastModifiedUserId !== myId) continue;
    if (Math.hypot(item.position.x - e.pos.x, item.position.y - e.pos.y) <= tolerance) continue;
    const cx = item.position.x + e.off.x;
    const cy = item.position.y + e.off.y;
    moved[e.goer] = [(cx - lastBox.min.x) / lastBox.width, (cy - lastBox.min.y) / lastBox.height];
    e.pos = item.position;
  }
  if (Object.keys(moved).length) await change((s) => ({ detached: { ...s.detached, ...moved } }));
}

// ---- panel ----
function render(state) {
  const day = Math.floor(state.hours / 24) + 1;
  const hour = Math.floor(hourOf(state.hours));
  $("clock").textContent = `Day ${day} · ${String(hour).padStart(2, "0")}:00`;
  $("phase").textContent = isNight(state.hours) ? "Night: the Ground wakes up" : "Day: the sun is out";
  if (role !== "GM") return;
  if (document.activeElement !== $("setDay")) $("setDay").value = day;
  if (document.activeElement !== $("setHour")) $("setHour").value = hour;
  $("nightOverlay").checked = !!state.nightOverlay;
  $("labels").checked = !!state.labels;
  const list = $("list");
  list.replaceChildren();
  for (const g of GOERS) {
    const loc = whereIs(g, state);
    const paused = !!state.paused[g.name];
    const tr = document.createElement("tr");

    const name = document.createElement("td");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = PETALS[g.petal].color;
    name.append(dot, `${g.name} (${g.petal})`);

    const where = document.createElement("td");
    where.className = "muted";
    where.textContent = (paused ? "paused · " : "") + (loc.detached
      ? "off its route, walking back"
      : loc.onMap ? `on the map · ${g.kmPerDay} km/day` : `off the map, back in ~${Math.ceil(loc.backInDays)} d`);

    const tools = document.createElement("td");
    tools.className = "tools";
    const pause = document.createElement("button");
    pause.className = "small";
    pause.textContent = paused ? "▶" : "⏸";
    pause.title = paused ? "let it walk again" : "pause this Goer";
    pause.onclick = () => change((s) => ({ paused: { ...s.paused, [g.name]: !s.paused[g.name] } }));
    tools.append(pause);
    if (loc.detached) {
      const back = document.createElement("button");
      back.className = "small";
      back.textContent = "↩";
      back.title = "put it back on its route now";
      back.onclick = () => change((s) => {
        const target = nearestOnRoute(g, s.detached[g.name]);
        const detached = { ...s.detached };
        delete detached[g.name];
        return { detached, shift: { ...s.shift, [g.name]: shiftFor(g, s.hours, target.d) } };
      });
      tools.append(" ", back);
    }
    const show = document.createElement("input");
    show.type = "checkbox";
    show.checked = !!state.reveal[g.name];
    show.title = "show to players";
    show.onchange = () => change((s) => ({ reveal: { ...s.reveal, [g.name]: show.checked } }));
    tools.append(" ", show, " show");

    tr.append(name, where, tools);
    list.append(tr);
  }
}

function stopPlay() {
  clearInterval(timer);
  timer = null;
  $("play").textContent = "▶ Play";
}

function wire() {
  const step = () => Number($("amount").value || 0) * Number($("unit").value);
  $("plus").onclick = () => change((s) => advance(s, step()));
  $("minus").onclick = () => change((s) => advance(s, -step()));
  $("go").onclick = () => change((s) => {
    const day = Math.max(1, Number($("setDay").value) || 1);
    const hour = Math.min(23, Math.max(0, Number($("setHour").value) || 0));
    return advance(s, (day - 1) * 24 + hour - s.hours);
  });
  for (const rate of SETTINGS.playRates) {
    const option = document.createElement("option");
    option.value = rate;
    option.textContent = `${rate} day${rate > 1 ? "s" : ""} / s`;
    $("rate").append(option);
  }
  $("play").onclick = () => {
    if (timer) return stopPlay();
    timer = setInterval(() => change((s) => advance(s, Number($("rate").value) * 24), { skipIfBusy: true }), 1000);
    $("play").textContent = "⏸ Stop";
  };
  $("nightOverlay").onchange = () => change(() => ({ nightOverlay: $("nightOverlay").checked }));
  $("labels").onchange = () => change(() => ({ labels: $("labels").checked }));
  $("sync").onclick = () => change(() => ({}));
  $("remove").onclick = () => removeTokens();
  $("useMap").onclick = async () => {
    const mapId = await findMap();
    if (!mapId) return msg("No map in this scene. Add the main map to the scene as a map first.");
    await removeTokens();
    await change(() => ({ mapId }));
  };
}

OBR.onReady(async () => {
  role = await OBR.player.getRole();
  myId = await OBR.player.getId();
  if (role === "GM") {
    $("gm").classList.remove("hidden");
    wire();
  }
  const start = async () => {
    const state = await getState();
    render(state);
    if (role === "GM" && state.mapId) await change(() => ({}));
  };
  if (await OBR.scene.isReady()) start();
  OBR.scene.onReadyChange((ready) => ready && start());
  OBR.scene.onMetadataChange((meta) => render(withDefaults(meta[STATE])));
  OBR.scene.items.onChange(onItemsChange);
});
