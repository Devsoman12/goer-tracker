# Goer Tracker (Owlbear Rodeo extension)

Moves the Goers along their routes on the Wastelands main map, keeps the day and the hour, and darkens the map at night. Goer tokens stay hidden from the players until you tick "show".

## Files
- `config.js`: the Goers, their route (N, E, S, W), speed and start position; map width in km, day and night hours, token size. Edit this one.
- `routes.js`: the routes, generated from `maps/main map/MAIN MAP - Goer routes proposal 2.jpg`. Don't edit by hand.
- `track.js`: the movement maths. `main.js`, `index.html`: the panel in Owlbear. `manifest.json`, `icon.svg`: what Owlbear loads.

## Put it online (GitHub Pages, free)
1. Create a public repository, for example `goer-tracker`, and upload all the files from this folder.
2. Settings → Pages → Deploy from a branch → `main`, folder `/ (root)` → Save. After a minute the site is at `https://<your-name>.github.io/goer-tracker/`.
3. In Owlbear Rodeo: Profile → Extensions → Add custom extension → `https://<your-name>.github.io/goer-tracker/manifest.json`.
4. Turn the extension on in your room.

After changing `config.js`, upload it again; Owlbear picks it up on the next reload.

## Use
1. Add the main map to the scene, select it (unlock the map layer if needed), open Goer Tracker and click **Use selected map**.
2. Click **Place / update tokens**.
3. Move time with the buttons. Tick **show** next to a Goer when the players should see it.

The time is saved in the scene, so it stays with the map.
