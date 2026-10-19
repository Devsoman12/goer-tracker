import OBR, { buildShape, buildLabel } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import { GOERS, SETTINGS } from "./config.js";
import { PETALS } from "./routes.js";
import { locate, hourOf, isNight } from "./track.js";

const ID = "wastelands.goer-tracker";
const STATE = `${ID}/state`;
const TAG = `${ID}/item`;
const DEFAULT = { hours: 8, mapId: null, reveal: {}, nightOverlay: true };
const $ = (id) => document.getElementById(id);
let role = "PLAYER";

// ---- state (kept in the scene, so it stays with the map) ----
async function getState() {
  const meta = await OBR.scene.getMetadata();
  return { ...DEFAULT, ...(meta[STATE] ?? {}) };
}

async function change(fn) {
  const state = await getState();
  const next = { ...state, ...fn(state) };
  next.hours = Math.max(0, next.hours);
  await OBR.scene.setMetadata({ [STATE]: next });
  await sync(next);
}

const msg = (text) => ($("msg").textContent = text ?? "");

// ---- tokens ----
async function sync(state) {
  if (!state.mapId) return msg("Select the map image, then click 'Use selected map'.");
  let box;
  try {
    box = await OBR.scene.items.getItemBounds([state.mapId]);
  } catch {
    return msg("The saved map is gone. Select the map again and click 'Use selected map'.");
  }
  const toScene = ([u, v]) => ({ x: box.min.x + u * box.width, y: box.min.y + v * box.height });
  const size = SETTINGS.tokenSize * box.width;
  const mine = await OBR.scene.items.getItems((item) => item.metadata?.[TAG]);
  const have = new Set(mine.map((item) => item.metadata[TAG].key));

  const add = [];
  if (!have.has("night")) {
    add.push(buildShape().shapeType("RECTANGLE").width(box.width).height(box.height).position({ ...box.center })
      .fillColor("#0a1030").fillOpacity(SETTINGS.nightOpacity).strokeWidth(0).strokeOpacity(0)
      .layer("DRAWING").locked(true).disableHit(true).visible(false).name("Night")
      .metadata({ [TAG]: { key: "night" } }).build());
  }
  for (const g of GOERS) {
    const at = toScene(locate(g, state.hours).at);
    if (!have.has(g.name)) {
      add.push(buildShape().shapeType("CIRCLE").width(size).height(size).position(at)
        .fillColor(PETALS[g.petal].color).fillOpacity(1).strokeColor("#000000").strokeWidth(size * 0.08)
        .layer("PROP").locked(true).visible(false).name(g.name)
        .metadata({ [TAG]: { key: g.name, goer: g.name } }).build());
    }
    if (!have.has(`label:${g.name}`)) {
      add.push(buildLabel().plainText(g.name).position({ x: at.x, y: at.y + size * 0.8 })
        .locked(true).visible(false).name(`${g.name} label`)
        .metadata({ [TAG]: { key: `label:${g.name}`, goer: g.name } }).build());
    }
  }
  if (add.length) {
    await OBR.scene.items.addItems(add);
    await measureShapes(add.filter((item) => item.type === "SHAPE"));
  }

  const night = isNight(state.hours);
  const all = await OBR.scene.items.getItems((item) => item.metadata?.[TAG]);
  await OBR.scene.items.updateItems(all.map((item) => item.id), (drafts) => {
    for (const d of drafts) {
      const meta = d.metadata[TAG];
      const off = meta.off ?? { x: 0, y: 0 };
      if (meta.key === "night") {
        d.position = { x: box.center.x - off.x, y: box.center.y - off.y };
        d.visible = night && state.nightOverlay;
        continue;
      }
      const g = GOERS.find((x) => x.name === meta.goer);
      if (!g) continue;
      const loc = locate(g, state.hours);
      const at = toScene(loc.at);
      const shown = !!state.reveal[g.name] && loc.onMap;
      if (meta.key === g.name) {
        d.position = { x: at.x - off.x, y: at.y - off.y };
      } else {
        d.position = { x: at.x, y: at.y + size * 0.8 };
        d.text.plainText = loc.onMap ? g.name : `${g.name} (off the map)`;
      }
      d.visible = shown;
    }
  });
  msg("");
}

// shapes may be anchored at a corner or the centre; measure once so the centre lands on the route
async function measureShapes(shapes) {
  const offs = {};
  for (const shape of shapes) {
    const box = await OBR.scene.items.getItemBounds([shape.id]);
    offs[shape.id] = { x: box.center.x - shape.position.x, y: box.center.y - shape.position.y };
  }
  if (!shapes.length) return;
  await OBR.scene.items.updateItems(Object.keys(offs), (drafts) => {
    for (const d of drafts) d.metadata[TAG] = { ...d.metadata[TAG], off: offs[d.id] };
  });
}

async function removeTokens() {
  const mine = await OBR.scene.items.getItems((item) => item.metadata?.[TAG]);
  await OBR.scene.items.deleteItems(mine.map((item) => item.id));
}

// ---- panel ----
function render(state) {
  const day = Math.floor(state.hours / 24) + 1;
  const hour = hourOf(state.hours);
  $("clock").textContent = `Day ${day} · ${String(hour).padStart(2, "0")}:00`;
  $("phase").textContent = isNight(state.hours) ? "Night: the Ground wakes up" : "Day: the sun is out";
  if (role !== "GM") return;
  $("setDay").value = day;
  $("setHour").value = hour;
  $("nightOverlay").checked = !!state.nightOverlay;
  const list = $("list");
  list.replaceChildren();
  for (const g of GOERS) {
    const loc = locate(g, state.hours);
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = PETALS[g.petal].color;
    name.append(dot, `${g.name} (${g.petal})`);
    const where = document.createElement("td");
    where.className = "muted";
    where.textContent = loc.onMap ? `on the map · ${g.kmPerDay} km/day` : `off the map, back in ~${Math.ceil(loc.backInDays)} d`;
    const show = document.createElement("td");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!state.reveal[g.name];
    box.title = "show to players";
    box.onchange = () => change((s) => ({ reveal: { ...s.reveal, [g.name]: box.checked } }));
    show.append(box, " show");
    tr.append(name, where, show);
    list.append(tr);
  }
}

function wire() {
  document.querySelectorAll("button[data-h]").forEach((b) => {
    b.onclick = () => change((s) => ({ hours: s.hours + Number(b.dataset.h) }));
  });
  $("go").onclick = () => change(() => ({
    hours: (Math.max(1, Number($("setDay").value) || 1) - 1) * 24 + Math.min(23, Math.max(0, Number($("setHour").value) || 0)),
  }));
  $("nightOverlay").onchange = () => change(() => ({ nightOverlay: $("nightOverlay").checked }));
  $("sync").onclick = async () => sync(await getState());
  $("remove").onclick = () => removeTokens();
  $("useMap").onclick = async () => {
    const selection = await OBR.player.getSelection();
    if (!selection?.length) return msg("Select the map image first (unlock the map layer if needed).");
    const [item] = await OBR.scene.items.getItems([selection[0]]);
    await removeTokens();
    await change(() => ({ mapId: item.id }));
    msg(item.layer === "MAP" ? "" : "Note: the selected item is not on the map layer.");
  };
}

OBR.onReady(async () => {
  role = await OBR.player.getRole();
  if (role === "GM") {
    $("gm").classList.remove("hidden");
    wire();
  }
  const start = async () => render(await getState());
  if (await OBR.scene.isReady()) start();
  OBR.scene.onReadyChange((ready) => ready && start());
  OBR.scene.onMetadataChange((meta) => render({ ...DEFAULT, ...(meta[STATE] ?? {}) }));
});
