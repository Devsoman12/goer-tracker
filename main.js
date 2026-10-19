// The panel: time, Play, and the list of Goers. The moving itself is in engine.js and background.js.
import { OBR, STATE, withDefaults, getState, change, findMap, removeTokens, onReport } from "./engine.js";
import { GOERS, SETTINGS } from "./config.js";
import { PETALS } from "./routes.js";
import { advance, whereIs, nearestOnRoute, shiftFor, isNight } from "./track.js";

const $ = (id) => document.getElementById(id);
let role = "PLAYER";
onReport((text) => ($("msg").textContent = text ?? ""));

function render(state) {
  const minutes = Math.round(state.hours * 60);
  const day = Math.floor(minutes / 1440) + 1;
  const hour = Math.floor((minutes % 1440) / 60);
  const clock = `${String(hour).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  $("clock").textContent = `Day ${day} · ${clock}`;
  $("phase").textContent = isNight(state.hours) ? "Night: the Ground wakes up" : "Day: the sun is out";
  if (role !== "GM") return;
  if (document.activeElement !== $("setDay")) $("setDay").value = day;
  if (document.activeElement !== $("setHour")) $("setHour").value = hour;
  $("nightOverlay").checked = !!state.nightOverlay;
  $("labels").checked = !!state.labels;
  $("play").textContent = state.playRate ? "⏸ Stop" : "▶ Play";
  if (state.playRate) $("rate").value = String(state.playRate);

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
    let text = loc.detached ? "off its route, walking back"
      : loc.onMap ? `on the map · ${g.kmPerDay} km/day` : `off the map, back in ~${Math.ceil(loc.backInDays)} d`;
    if (state.waiting[g.name] && !paused) text = `waiting for ${state.waiting[g.name]} to pass`;
    where.textContent = (paused ? "paused · " : "") + text;

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
    option.value = String(rate.hoursPerSecond);
    option.textContent = rate.label;
    $("rate").append(option);
  }
  $("play").onclick = () => change((s) => ({ playRate: s.playRate ? 0 : Number($("rate").value) }));
  $("rate").onchange = () => change((s) => (s.playRate ? { playRate: Number($("rate").value) } : {}));
  $("nightOverlay").onchange = () => change(() => ({ nightOverlay: $("nightOverlay").checked }));
  $("labels").onchange = () => change(() => ({ labels: $("labels").checked }));
  $("sync").onclick = () => change(() => ({}));
  $("remove").onclick = () => removeTokens();
  $("useMap").onclick = async () => {
    const mapId = await findMap();
    if (!mapId) return ($("msg").textContent = "No map in this scene. Add the main map to the scene as a map first.");
    await removeTokens();
    await change(() => ({ mapId }));
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
  OBR.scene.onMetadataChange((meta) => render(withDefaults(meta[STATE])));
});
