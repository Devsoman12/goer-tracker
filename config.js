// Edit this file to change the Goers, their speeds and where they start.
// petal: which route they walk (N, E, S, W; the routes themselves are in routes.js)
// kmPerDay: speed
// start: where on its loop the Goer is on day 1 (0 = at the centre, going out; 0.5 = halfway round)
export const GOERS = [
  { name: "Founder", petal: "N", kmPerDay: 11, start: 0.1 },
  { name: "Mother", petal: "N", kmPerDay: 13, start: 0.42 },
  { name: "Bear", petal: "N", kmPerDay: 15, start: 0.71 },
  { name: "Runner", petal: "N", kmPerDay: 48, start: 0.88 }, // placeholder: its route is not decided yet
  { name: "Rhino", petal: "E", kmPerDay: 17, start: 0.15 },
  { name: "Lion", petal: "E", kmPerDay: 30, start: 0.55 },
  { name: "Ram", petal: "E", kmPerDay: 21, start: 0.8 },
  { name: "Turtle", petal: "S", kmPerDay: 4, start: 0.3 },
  { name: "Sloth", petal: "S", kmPerDay: 7, start: 0.75 },
  { name: "Llama", petal: "W", kmPerDay: 23, start: 0.05 },
  { name: "Giraffe", petal: "W", kmPerDay: 26, start: 0.38 },
  { name: "Iguana", petal: "W", kmPerDay: 19, start: 0.66 },
];

export const SETTINGS = {
  mapWidthKm: 9500, // this piece of the map, about 3x Russia
  // how long each loop runs outside the map, in km; null = as long as its part on the map
  offMapKm: { N: null, E: null, S: null, W: null },
  dayStartsAt: 6, // hour the sun rises
  nightStartsAt: 18, // hour the sun sets
  tokenSize: 0.012, // token diameter as a part of the map width
  nightOpacity: 0.45, // how dark the night overlay is
};
