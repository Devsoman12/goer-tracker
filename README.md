# Goer Tracker (Owlbear Rodeo extension)

Moves the Goers along their routes on the Wastelands main map, keeps the day and the hour, and darkens the map at night. Goer tokens stay hidden from the players until you tick "show".

## Files
- `config.js`: the Goers, their route (N, E, S, W), speed and start position; map width in km, day and night hours, token size. Edit this one.
- `routes.js`: the routes, generated from `maps/main map/MAIN MAP - Goer routes proposal 2.jpg`. Don't edit by hand.
- `track.js`: the movement maths. `engine.js`: placing the tokens in Owlbear. `main.js`, `index.html`: the panel. `background.js`, `background.html`: the clock and dragging, running in the background. `manifest.json`, `icon.svg`: what Owlbear loads.

## Put it online (GitHub Pages, free)
1. Create a public repository named `goer-tracker` and upload all the files from this folder. Owlbear reads the paths in `manifest.json` from the site root, so they start with `/goer-tracker/`; with another repository name, change them.
2. Settings → Pages → Deploy from a branch → `main`, folder `/ (root)` → Save. After a minute the site is at `https://<your-name>.github.io/goer-tracker/`.
3. In Owlbear Rodeo: Profile → Extensions → Add custom extension → `https://<your-name>.github.io/goer-tracker/manifest.json`.
4. Turn the extension on in your room.

After changing `config.js`, upload it again; Owlbear picks it up on the next reload.

## Use
1. Add the main map to the scene as a map. Add your Goer token images too (as mounts); they are found by their name (`token` in `config.js`), so keep the uploaded file names. A Goer without an image gets a coloured circle.
2. Open Goer Tracker and click **Place / update tokens**. It finds the biggest map in the scene by itself; **Find map** does it again (or uses the selected item).
3. Move time: type an amount, pick minutes, hours or days, press **+** or **−**. **Go to** jumps to a day and hour. **Play** runs the clock, from real time up to 365 days per second; it keeps running while the room is open in your browser, even with the panel closed.
4. Per Goer: **⏸** pauses it, **show** reveals it to the players. Drag a Goer anywhere and it leaves its route; as time passes it walks back to the nearest point of it (**↩** puts it back at once).

When two Goers would bump into each other, the slower one waits until the faster one has passed.

Token sizes follow `sizeKm` × `tokenSizePerKm`. Goers off the map wait just outside its edge, hidden. The time is saved in the scene, so it stays with the map.
