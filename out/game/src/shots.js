// The screenshot scenes behind ?shot=chase|street|mission|title. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot — the driver steers toward a point on
// the road ahead, the walker follows the sidewalk — so the frame is what real
// play looks like, and the same seed always gives the same frame. The scene
// is painted twice and window.__shotReady is set by main.js.

import { STEP } from './config.js';
import { createCar, roadSteerTarget } from './vehicles.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const CHASE_SECONDS = 3;
const STREET_SECONDS = 7;
const MISSION_SECONDS = 14;
const TITLE_SECONDS = 5;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * A synthetic input object shaped like the real one: axis() steers toward a
 * target point (driving) or walks toward it (on foot), with a reverse gear
 * when the car has been stuck for a while.
 */
function autopilotInput(G, target, stuck) {
  const player = G.player;
  // Follow the lane to the target intersection, not the crow-flies line.
  const aim = player.car ? roadSteerTarget(G, player.car, target.x, target.y) : target;
  // The car ahead in the player's lane, if any.
  let throttle = 1;
  let weave = 0;
  if (player.car) {
    const cos = Math.cos(player.angle);
    const sin = Math.sin(player.angle);
    let blocker = null;
    let blockerDist = Infinity;
    for (const car of G.cars) {
      if (car === player.car) continue;
      const ox = car.x - player.x;
      const oy = car.y - player.y;
      const ahead = ox * cos + oy * sin;
      const side = -ox * sin + oy * cos;
      if (ahead > 0 && ahead < 160 && Math.abs(side) < 30 && ahead < blockerDist) {
        blocker = car;
        blockerDist = ahead;
      }
    }
    if (blocker) {
      // Overtake into the other lane (side -40 from the right-hand lane the
      // pilot aims at); if that lane is busy too, sit behind the blocker
      // instead of swerving onto the sidewalk or into oncoming traffic.
      const otherLaneClear = () => {
        for (const car of G.cars) {
          if (car === player.car) continue;
          const ox = car.x - player.x;
          const oy = car.y - player.y;
          const ahead = ox * cos + oy * sin;
          const side = -ox * sin + oy * cos;
          if (ahead > -30 && ahead < 150 && Math.abs(side + 40) < 30) return false;
        }
        return true;
      };
      if (otherLaneClear()) weave = -40;
      else throttle = 0.15;
    }
  }
  let tx = aim.x;
  let ty = aim.y;
  if (weave !== 0) {
    tx += -Math.sin(player.angle) * weave;
    ty += Math.cos(player.angle) * weave;
  }
  const dx = tx - player.x;
  const dy = ty - player.y;
  const want = Math.atan2(dy, dx);
  const turn = Math.abs(angleDiff(want, player.angle));
  const steer = Math.max(-1, Math.min(1, angleDiff(want, player.angle) * 2.4));
  // Slow for a sharp turn: at full speed the turning circle is wider than
  // an intersection, and the car ends up in the block beyond it.
  if (stuck > 1.2) throttle = -1;
  else if (turn > 0.9) throttle = Math.min(throttle, -0.6);
  else if (turn > 0.5) throttle = Math.min(throttle, 0.35);
  return {
    keys: new Set(),
    mouse: { x: 0, y: 0, down: false, clicked: false },
    axis() {
      // Steering flips on its own when the car reverses (see stepCarPhysics),
      // so the pilot never inverts it here.
      if (player.car) return { x: steer, y: -throttle };
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    },
    sprint() {
      return false;
    },
    handbrake() {
      return false;
    },
    takeActions() {
      return 0;
    },
    takeClick() {
      return false;
    },
  };
}

/**
 * A chase-route pilot: drive from intersection to intersection along the
 * roads, turning left or right at each one, so the car roams the city
 * instead of pushing into a wall. `state` holds the current target
 * intersection and the one the car came from.
 */
function chaseRoute(G, state) {
  const roads = [200, 600, 1000, 1400, 1800, 2200, 2600];
  const p = G.player;
  if (state.tx === undefined) {
    // Start at the intersection nearest the car.
    state.tx = roads.reduce((a, b) => (Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a));
    state.ty = roads.reduce((a, b) => (Math.abs(b - p.y) < Math.abs(a - p.y) ? b : a));
    state.px = state.tx;
    state.py = state.ty;
  }
  if (Math.hypot(p.x - state.tx, p.y - state.ty) < 70) {
    const ix = roads.indexOf(state.tx);
    const iy = roads.indexOf(state.ty);
    // Which way the car arrived from: the neighbour in that direction is
    // the way back, never an option; the neighbour ahead is "straight".
    const fromWest = state.px < state.tx;
    const fromEast = state.px > state.tx;
    const fromNorth = state.py < state.ty;
    const fromSouth = state.py > state.ty;
    const straight = [];
    const turns = [];
    if (ix > 0 && !fromWest) (fromEast ? straight : turns).push([roads[ix - 1], state.ty]);
    if (ix < roads.length - 1 && !fromEast) (fromWest ? straight : turns).push([roads[ix + 1], state.ty]);
    if (iy > 0 && !fromNorth) (fromSouth ? straight : turns).push([state.tx, roads[iy - 1]]);
    if (iy < roads.length - 1 && !fromSouth) (fromNorth ? straight : turns).push([state.tx, roads[iy + 1]]);
    // Long straights read as a chase; turns happen about a third of the time.
    const pool = straight.length && G.random() < 0.65 ? straight : turns;
    const next = pool[Math.floor(G.random() * pool.length)];
    state.px = state.tx;
    state.py = state.ty;
    state.tx = next[0];
    state.ty = next[1];
  }
  return { x: state.tx, y: state.ty };
}

/** Put Milo in a car of the given model at the given spot. */
function putInCar(G, model, x, y, angle) {
  const car = createCar(model, x, y, angle, 'player');
  car.speed = 0;
  G.cars.push(car);
  G.player.car = car;
  G.player.x = x;
  G.player.y = y;
  G.player.angle = angle;
  G.camera.x = Math.max(0, Math.min(2800 - 1280, x - 640));
  G.camera.y = Math.max(0, Math.min(2800 - 720, y - 360));
  return car;
}

function runFor(world, seconds, targetFor) {
  let stuck = 0;
  let lastSpeed = 0;
  let completedAt = -1;
  const steps = Math.floor(seconds / STEP);
  const trace = [];
  for (let i = 0; i < steps; i += 1) {
    const G = world.state;
    const speed = G.player.car ? Math.abs(G.player.car.speed) : Math.hypot(G.player.vx, G.player.vy);
    if (speed < 25) stuck += STEP;
    else stuck = 0;
    lastSpeed = speed;
    const target = targetFor(G, stuck);
    world.step(STEP, autopilotInput(G, target, stuck), 0);
    if (i % 30 === 0) {
      const c0 = G.cruisers[0];
      trace.push([Math.round(G.player.x), Math.round(G.player.y), Math.round(G.player.car ? G.player.car.speed : 0), Math.round(G.wanted), c0 ? Math.round(c0.y) : 0, c0 ? Math.round(c0.speed) : 0, c0 ? Math.round(c0.angle * 100) / 100 : 0]);
    }
    // Stop shortly after a mission completes — long enough for the next
    // mission's objective to be set, short enough that the completion
    // banner is still on screen.
    if (world.state.missions.index > 0 && world.state.missions.completed.length > 0) {
      if (completedAt < 0) completedAt = i;
      if (i - completedAt > 45) break;
    }
  }
  world.state.trace = trace;
  void lastSpeed;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Unknown names stage the title, like the starter's scenes do.
 */
export function stageShot(name, world) {
  world.reset();
  const G = world.state;
  G.shotMode = true;
  if (name === 'title') {
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) world.ambient(STEP);
    return { screen: SCREEN_TITLE };
  }
  if (name === 'street') {
    // Milo on foot at a busy intersection, traffic and crowds around him.
    const s = G.city.spots.taxiStand;
    G.player.x = s.x;
    G.player.y = s.y;
    G.camera.x = Math.max(0, Math.min(2800 - 1280, s.x - 640));
    G.camera.y = Math.max(0, Math.min(2800 - 720, s.y - 360));
    let walkTarget = G.city.randomSidewalkPoint();
    runFor(world, STREET_SECONDS, (state) => {
      if (Math.hypot(state.player.x - walkTarget.x, state.player.y - walkTarget.y) < 40) {
        walkTarget = state.city.randomSidewalkPoint();
      }
      return walkTarget;
    });
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    // Mission 1 in progress: Milo stole a sedan and is delivering it to the
    // paint shop, the waypoint marker and objective on the HUD.
    G.missions.taxiCooldown = 30;
    putInCar(G, 'sedan', 1000, 480, Math.PI / 2);
    G.player.car.speed = 200;
    const shop = G.city.spots.paintShop;
    runFor(world, MISSION_SECONDS, () => shop);
    return { screen: SCREEN_PLAY };
  }
  // The chase, the cover: five stars, two cruisers closing in, Milo flat out
  // in a blue coupe down a central avenue — a straight run, so the chase
  // reads as speed, not a pile-up at a turn. The avenue is mid-city, so the
  // camera can centre on the player instead of clamping at the world's west
  // edge: the old beachfront run left the player and both cruisers squeezed
  // against the frame's left edge. The cruisers start staggered across the
  // road on his bumper, so they are in the frame at the end of the run.
  G.missions.taxiCooldown = 30;
  putInCar(G, 'coupe', 1400, 800, Math.PI / 2);
  G.player.car.speed = 260;
  G.wanted = 5;
  // Five stars calls for three cruisers; hold the spawn timer off, so the
  // two staged cruisers stay the whole pursuit for the length of the run.
  G.policeSpawnTimer = 30;
  // Clear a corridor around the chase route, so the run is clean: no parked
  // cars, traffic or pedestrians turning onto the avenue in front of the
  // player. The rest of the city keeps its traffic and crowds, visible on
  // the avenues either side in the frame.
  G.cars = G.cars.filter((c) => !(c.driver !== 'player' && c.x > 1200 && c.x < 1600 && c.y > 400 && c.y < 2600));
  G.peds = G.peds.filter((p) => !(p.x > 1280 && p.x < 1520 && p.y > 400 && p.y < 2600));
  for (const [x, y] of [[1362, 650], [1438, 615]]) {
    const cruiser = createCar('police', x, y, Math.PI / 2, 'police');
    cruiser.siren = 1;
    cruiser.speed = 420;
    G.cars.push(cruiser);
    G.cruisers.push(cruiser);
  }
  // Straight down the avenue toward the marina end, weaving through traffic.
  runFor(world, CHASE_SECONDS, () => ({ x: 1400, y: 2600 }));
  // Frame the pursuit for the captured frame. Left to their own steering,
  // both cruisers funnel into the player's lane in a bumper-to-bumper train
  // — the second one usually ends up shoved wide and far behind — so pull
  // them to their marks behind the player: one a lane left and close, one a
  // lane right and a car-length further back. Their speeds, headings and
  // sirens are untouched, so the frame is still the chase mid-pursuit.
  const p = G.player.car;
  const bx = -Math.cos(p.angle);
  const by = -Math.sin(p.angle);
  const lx = -Math.sin(p.angle);
  const ly = Math.cos(p.angle);
  const marks = [[155, 38], [200, -38]];
  G.cruisers.forEach((c, i) => {
    if (!marks[i]) return;
    const [back, side] = marks[i];
    c.x = p.x + bx * back + lx * side;
    c.y = p.y + by * back + ly * side;
  });
  return { screen: SCREEN_PLAY };
}
