// Every tuning number and colour for Solmar City in one place. The camera shows
// a 1280x720 logical window of a 2800x2800 world; the renderer scales that
// window to the browser window, so no rule below depends on screen size.

export const STEP = 1 / 60;
export const VIEW = { width: 1280, height: 720 };
export const WORLD = { size: 2800 };

// Roads run on a 400 px grid; the road centrelines sit at these coordinates.
export const ROADS = [200, 600, 1000, 1400, 1800, 2200, 2600];
export const ROAD_HALF = 55;
export const LANE = 20;

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  sprintSpeed: 330,
  maxHealth: 100,
  punchRange: 46,
  punchDamage: 34,
  punchCooldown: 0.42,
  gunRange: 520,
  gunDamage: 40,
  gunCooldown: 0.28,
};

export const CAR = {
  // One car is a circle of this radius for collisions; the body is longer.
  radius: 17,
  // Parked and traffic cars per spawn pass.
  parkedCount: 26,
  trafficCount: 16,
  pedCount: 46,
};

export const WANTED = {
  max: 5,
  decaySeconds: 9,
  decayDistance: 620,
  bustSeconds: 0.9,
};

// Car models: each has its own colour, size and handling. No model copies a
// real car; the shapes are plain canvas bodies with distinct silhouettes.
export const MODELS = {
  sedan: { name: 'Sedan', length: 46, width: 22, color: '#c94f43', accel: 430, top: 430, grip: 3.4, reverse: 150 },
  taxi: { name: 'Cab', length: 46, width: 22, color: '#f2c230', accel: 400, top: 410, grip: 3.4, reverse: 150 },
  coupe: { name: 'Coupe', length: 44, width: 21, color: '#3f7fd0', accel: 520, top: 520, grip: 4.2, reverse: 170 },
  pickup: { name: 'Pickup', length: 50, width: 23, color: '#5a7d4f', accel: 380, top: 380, grip: 3.0, reverse: 140 },
  van: { name: 'Van', length: 54, width: 24, color: '#8f8a80', accel: 320, top: 340, grip: 2.6, reverse: 120 },
  police: { name: 'Cruiser', length: 48, width: 22, color: '#20242c', accel: 500, top: 500, grip: 4.0, reverse: 170 },
};

export const PALETTE = {
  backdrop: '#10151d',
  grass: '#7fae62',
  block: '#a49d8d',
  sidewalk: '#c9c2b2',
  road: '#3b4048',
  roadLine: '#e8d44f',
  sand: '#e6cf9e',
  water: '#3d9cc2',
  waterDeep: '#2a7ba6',
  park: '#69a854',
  text: '#f4f1e6',
  muted: '#b9b3a4',
  panel: '#1d232e',
  panelEdge: '#f2c230',
  cash: '#7ddc7a',
  danger: '#ff5a4e',
  wanted: '#ffd23e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'solmar-city.save.v1';

export const MISSION_REWARDS = [400, 700, 900, 1100, 2500];
