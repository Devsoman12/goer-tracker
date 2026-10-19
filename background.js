// Runs in the background while the room is open: the clock (Play) and dragging Goers off their route.
import { OBR, getState, change, onItemsChange, onPartyMove } from "./engine.js";
import { advance } from "./track.js";

const MIN_STEP_HOURS = 1 / 60; // move the Goers at least one game minute at a time

OBR.onReady(async () => {
  if ((await OBR.player.getRole()) !== "GM") return;
  const gmId = await OBR.player.getId();
  OBR.scene.items.onChange((items) => {
    onItemsChange(items, gmId);
    onPartyMove(items);
  });
  OBR.scene.local.onChange((items) => onItemsChange(items, gmId));

  // the labels and circles are local and vanish on reload: put them back when a scene opens
  const restore = async () => (await getState()).mapId && change(() => ({}));
  if (await OBR.scene.isReady()) restore();
  OBR.scene.onReadyChange((ready) => ready && restore());

  let last = Date.now();
  let pending = 0;
  setInterval(async () => {
    const now = Date.now();
    const seconds = (now - last) / 1000;
    last = now;
    if (!(await OBR.scene.isReady())) return;
    const state = await getState();
    if (!state.playRate) {
      pending = 0;
      return;
    }
    pending += state.playRate * seconds;
    if (pending < MIN_STEP_HOURS) return;
    const hours = pending;
    pending = 0;
    await change((s) => advance(s, hours), { skipIfBusy: true });
  }, 1000);
});
