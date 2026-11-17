// Cars: their models, arcade driving physics, parked cars and traffic. The
// player's car uses simple arcade rules — acceleration, steering that bites
// harder at speed, a handbrake that lets the tail slide — and traffic cars
// follow the road grid from intersection to intersection, keeping to their
// lane and slowing for the car ahead. All car-vs-world and car-vs-car
// collisions live here too.

import { CAR, MODELS, ROADS, ROAD_HALF } from './config.js';
import { pick, range } from './random.js';

export const CAR_MODELS = Object.keys(MODELS);

let nextCarId = 1;

export function createCar(modelKey, x, y, angle, driver) {
  const model = MODELS[modelKey];
  return {
    id: nextCarId,
    kind: 'car',
    model: modelKey,
    name: model.name,
    color: model.color,
    length: model.length,
    width: model.width,
    accel: model.accel,
    top: model.top,
    grip: model.grip,
    reverse: model.reverse,
    x, y, angle,
    speed: 0,
    steer: 0,
    driver: driver || 'traffic',
    // Traffic state: the intersection it is heading for, and its lane offset.
    target: null,
    lane: 0,
    cruise: 0,
    blocked: 0,
    smoke: 0,
    damage: 0,
    honkTimer: 0,
    siren: 0,
  };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export { angleDiff, roadAxis };

/** Steer a car toward a point: returns the steering input (-1..1). */
export function steerToward(car, tx, ty) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(want, car.angle);
  return Math.max(-1, Math.min(1, diff * 2.2));
}

/**
 * Which road a car is on: the nearest vertical centreline or the nearest
 * horizontal one, and how far the car is from each. The nearest road *point*
 * alone cannot tell — a car sitting exactly on a road returns its own
 * position, so both offsets are zero. At an intersection (a tie) the car's
 * heading decides.
 */
function roadAxis(car) {
  let bestV = ROADS[0];
  let bestH = ROADS[0];
  for (const r of ROADS) {
    if (Math.abs(car.x - r) < Math.abs(car.x - bestV)) bestV = r;
    if (Math.abs(car.y - r) < Math.abs(car.y - bestH)) bestH = r;
  }
  const distV = Math.abs(car.x - bestV);
  const distH = Math.abs(car.y - bestH);
  const vertical = distV < distH || (distV === distH && Math.abs(Math.cos(car.angle)) < Math.abs(Math.sin(car.angle)));
  return { vertical, line: vertical ? bestV : bestH, distV, distH };
}

/**
 * The point to steer at when a car must reach intersection (tx, ty) without
 * cutting across a block: stay on the road the car is on until the
 * intersection where the turn happens, keeping to the right-hand lane for
 * the direction of travel. A car that is off the roads entirely is sent to
 * the nearest road point first.
 */
export function roadSteerTarget(G, car, tx, ty) {
  const axis = roadAxis(car);
  const onRoad = Math.min(axis.distV, axis.distH) < 40;
  if (!onRoad) return G.city.nearestRoadPoint(car.x, car.y);
  if (axis.vertical) {
    const headingSouth = ty > car.y;
    return { x: axis.line + (headingSouth ? -20 : 20), y: ty };
  }
  const headingEast = tx > car.x;
  return { x: tx, y: axis.line + (headingEast ? 20 : -20) };
}

/**
 * One step of arcade car physics. `throttle` -1..1 (reverse..forward),
 * `steer` -1..1, `handbrake` true to slide. `gripScale` lets traffic and the
 * police drive more tamely than the player.
 */
export function stepCarPhysics(G, car, throttle, steer, handbrake, dt, gripScale = 1) {
  const grip = car.grip * gripScale * (handbrake ? 0.45 : 1);
  const maxSpeed = throttle >= 0 ? car.top : car.reverse;
  car.speed += throttle * car.accel * dt;
  // Rolling drag, plus stronger drag when the handbrake is on.
  car.speed -= car.speed * (handbrake ? 1.6 : 0.55) * dt;
  if (car.speed > maxSpeed) car.speed = maxSpeed;
  if (car.speed < -car.reverse) car.speed = -car.reverse;
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;
  const steerAmount = steer * Math.min(1, (Math.abs(car.speed) + 40) / 120) * (Math.abs(car.speed) < 10 ? 1 : car.speed >= 0 ? 1 : -1);
  car.angle += steerAmount * grip * 0.85 * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (handbrake && Math.abs(car.speed) > 120) {
    G.skids.push({ x: car.x, y: car.y, angle: car.angle, life: 5 });
    if (G.skids.length > 220) G.skids.shift();
  }
  const fixed = G.city.collideCircle(car.x, car.y, CAR.radius);
  if (fixed.hit) {
    const impact = Math.abs(car.speed);
    if (impact > 180) {
      car.damage += impact * 0.05;
      G.audio.crash();
      G.shake = Math.min(14, impact * 0.03);
      spawnSparks(G, car.x, car.y, 8);
    }
    car.x = fixed.x;
    car.y = fixed.y;
    car.speed *= -0.25;
  }
  if (car.damage > 60) car.smoke = Math.min(1, (car.damage - 60) / 60);
  return car;
}

/** Traffic picks its next intersection: a crossing on the road it is on,
 * keeping to the right-hand lane for its direction of travel. */
function pickNextTarget(G, car) {
  const roads = ROADS;
  const axis = roadAxis(car);
  const onVertical = axis.vertical;
  const near = G.city.nearestRoadPoint(car.x, car.y);
  let cross = pick(G.random, roads);
  // Do not aim at the intersection the car is already sitting on.
  let guard = 0;
  while (Math.abs(cross - (onVertical ? car.y : car.x)) < 60 && guard < 8) {
    cross = pick(G.random, roads);
    guard += 1;
  }
  if (onVertical) {
    // Heading south, the right lane is the west side; heading north, east.
    car.target = { x: axis.line + (cross > car.y ? -20 : 20), y: cross };
  } else {
    // Heading east, the right lane is the south side; heading west, north.
    car.target = { x: cross, y: axis.line + (cross > car.x ? 20 : -20) };
  }
  car.cruise = range(G.random, 110, 175);
}

/** Step one traffic car: drive to its target intersection, then pick another. */
function stepTrafficCar(G, car, dt) {
  if (!car.target) pickNextTarget(G, car);
  const dx = car.target.x - car.x;
  const dy = car.target.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 26) {
    pickNextTarget(G, car);
    return;
  }
  // Slow for the car ahead in the same lane.
  let slow = 1;
  for (const other of G.cars) {
    if (other === car || other.driver === 'none') continue;
    const ox = other.x - car.x;
    const oy = other.y - car.y;
    const ahead = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
    const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
    if (ahead > 0 && ahead < 70 && side < 30) { slow = ahead < 40 ? 0 : 0.35; break; }
  }
  if (dist < 90) slow = Math.min(slow, 0.55);
  const steer = steerToward(car, car.target.x, car.target.y);
  const throttle = slow === 0 ? -0.4 : 0.55 * slow;
  if (slow === 0) {
    car.blocked += dt;
    if (car.blocked > 2.5 && car.honkTimer <= 0) {
      G.audio.honk();
      car.honkTimer = 4;
      car.blocked = 0;
    }
  } else car.blocked = 0;
  car.honkTimer -= dt;
  stepCarPhysics(G, car, throttle, steer, false, dt, 0.7);
}

/** Car-vs-car: circles that push apart and trade a little speed. */
export function resolveCarCollisions(G) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = CAR.radius * 2 - 2;
      if (d >= min || d < 0.01) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const impact = Math.abs(a.speed - b.speed);
      if (impact > 160) {
        G.audio.crash();
        G.shake = Math.min(10, impact * 0.02);
        spawnSparks(G, (a.x + b.x) / 2, (a.y + b.y) / 2, 6);
      }
      // A shove, not a trade. In a rear-end the car ahead is pushed up to the
      // speed of the car behind it, so it pulls away instead of being caught
      // again on the next step — the old rule (0.6x) made the rear car catch
      // up forever, and the 0.85x penalty each step ground a convoy to a
      // crawl. In a head-on the cars bounce apart instead.
      const vax = Math.cos(a.angle) * a.speed;
      const vay = Math.sin(a.angle) * a.speed;
      const vbx = Math.cos(b.angle) * b.speed;
      const vby = Math.sin(b.angle) * b.speed;
      if (vax * vbx + vay * vby > 0) {
        const faster = Math.abs(a.speed) >= Math.abs(b.speed) ? a : b;
        const slower = faster === a ? b : a;
        slower.speed = faster.speed;
        faster.speed *= 0.95;
      } else {
        a.speed *= -0.4;
        b.speed *= -0.4;
      }
    }
  }
}

export function spawnSparks(G, x, y, n) {
  for (let i = 0; i < n; i += 1) {
    const a = G.random() * Math.PI * 2;
    const s = range(G.random, 60, 260);
    G.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, maxLife: 0.4, color: '#ffd23e', size: 3 });
  }
}

export function spawnSmoke(G, x, y) {
  G.particles.push({ kind: 'smoke', x: x + range(G.random, -8, 8), y: y + range(G.random, -8, 8), vx: range(G.random, -12, 12), vy: range(G.random, -30, -10), life: 1.1, maxLife: 1.1, color: '#8a8a8a', size: 7 });
}

/** Fill the city with parked cars along road edges and moving traffic. */
export function populateCars(G) {
  const used = new Set();
  for (let i = 0; i < CAR.parkedCount; i += 1) {
    const p = G.city.randomRoadPoint();
    const key = `${Math.round(p.x / 60)}:${Math.round(p.y / 60)}`;
    if (used.has(key)) continue;
    used.add(key);
    const vertical = Math.abs(p.angle) < 0.1 || Math.abs(p.angle - Math.PI) < 0.1;
    const side = G.random() < 0.5 ? 1 : -1;
    const x = vertical ? p.x + side * (ROAD_HALF - 14) : p.x;
    const y = vertical ? p.y : p.y + side * (ROAD_HALF - 14);
    const model = pick(G.random, ['sedan', 'sedan', 'coupe', 'pickup', 'van', 'taxi']);
    G.cars.push(createCar(model, x, y, p.angle, 'none'));
  }
  for (let i = 0; i < CAR.trafficCount; i += 1) {
    const p = G.city.randomRoadPoint();
    const model = pick(G.random, ['sedan', 'sedan', 'taxi', 'coupe', 'pickup', 'van']);
    const car = createCar(model, p.x, p.y, p.angle, 'traffic');
    car.speed = range(G.random, 100, 160);
    G.cars.push(car);
  }
}

/** Step every car that is not the player's: traffic drives, parked cars sit. */
export function stepCars(G, dt) {
  for (const car of G.cars) {
    if (car.driver === 'traffic') stepTrafficCar(G, car, dt);
    if (car.smoke > 0 && G.random() < car.smoke * 0.4) spawnSmoke(G, car.x, car.y - 6);
  }
  resolveCarCollisions(G);
  // Keep traffic topped up: a car that drifted too far from the player is
  // respawned nearer, so the streets always feel alive.
  const px = G.player.x;
  const py = G.player.y;
  for (const car of G.cars) {
    if (car.driver !== 'traffic') continue;
    if (Math.hypot(car.x - px, car.y - py) > 1600) {
      const p = G.city.randomRoadPoint();
      car.x = p.x;
      car.y = p.y;
      car.angle = p.angle;
      car.target = null;
    }
  }
}
