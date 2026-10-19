// Edit this file to change the Goers, their speeds, sizes and where they start.
// petal: which route they walk (N, E, S, W; the routes themselves are in routes.js)
// kmPerDay: speed
// start: where on its loop the Goer is on day 1 (0 = at the centre, going out; 0.5 = halfway round)
// token: name of its image in Owlbear (the uploaded file name without .png); found in the scene by itself
// sizeKm: how long the Goer is; the token gets a size to match (see tokenSizePerKm)
export const GOERS = [
  { name: "Founder", petal: "N", kmPerDay: 11, start: 0.1, token: "founder_token", sizeKm: 2.4 },
  { name: "Mother", petal: "N", kmPerDay: 13, start: 0.42, token: "mother_token", sizeKm: 1.1 },
  { name: "Bear", petal: "N", kmPerDay: 15, start: 0.71, token: "bear_token", sizeKm: 1.2 },
  { name: "Runner", petal: "N", kmPerDay: 48, start: 0.88, token: "runner_token", sizeKm: 0.5 }, // placeholder route
  { name: "Rhino", petal: "E", kmPerDay: 17, start: 0.15, token: "rhino_token", sizeKm: 1.3 },
  { name: "Lion", petal: "E", kmPerDay: 30, start: 0.55, token: "lion_token", sizeKm: 1.2 },
  { name: "Ram", petal: "E", kmPerDay: 21, start: 0.8, token: "ram_token", sizeKm: 1.0 },
  { name: "Turtle", petal: "S", kmPerDay: 4, start: 0.3, token: "turtle_token", sizeKm: 1.8 },
  { name: "Sloth", petal: "S", kmPerDay: 7, start: 0.75, token: "sloth_token", sizeKm: 0.9 },
  { name: "Llama", petal: "W", kmPerDay: 23, start: 0.05, token: "llama_token", sizeKm: 1.1 },
  { name: "Giraffe", petal: "W", kmPerDay: 26, start: 0.38, token: "giraffe_token", sizeKm: 0.9 },
  { name: "Iguana", petal: "W", kmPerDay: 19, start: 0.66, token: "iguana_token", sizeKm: 1.0 },
];

export const SETTINGS = {
  mapWidthKm: 9500, // this piece of the map, about 3x Russia
  // how long each loop runs outside the map, in km; null = as long as its part on the map
  offMapKm: { N: null, E: null, S: null, W: null },
  dayStartsAt: 6, // hour the sun rises
  nightStartsAt: 18, // hour the sun sets
  tokenSizePerKm: 0.01, // token width for a 1 km Goer, as a part of the map width
  labels: true, // name labels under the tokens at the start (switch them in the panel)
  nightOpacity: 0.45, // how dark the night overlay is
  playRates: [1, 7, 30, 365], // fast-forward choices, in days per second
};
