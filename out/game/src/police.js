// The wanted system: 0 to 5 stars. Crimes raise it, the police respond in
// proportion — cruisers that chase and ram, foot cops that run the player
// down — and it fades when the player stays out of sight. A foot cop who
// catches the player on foot busts them: cash lost, back at the hideout.

import { ROADS, WANTED } from './config.js';
import { createCar, angleDiff, roadAxis, roadSteerTarget, stepCarPhysics, steerToward } from './vehicles.js';

export function addWanted(G, stars, reason) {
  if (G.wanted >= WANTED.max) return;
  G.wanted = Math.min(WANTED.max, G.wanted + stars);
  G.unseenTimer = 0;
  if (reason) G.toast = { text: `Wanted level ${G.wanted} — ${reason}`, t: 3 };
}

/** How many cruisers the current wanted level calls for (foot cops at 1+). */
function cruisersWanted(level) {
  return level === 0 ? 0 : level < 3 ? 1 : level < 5 ? 2 : 3;
}

function spawnCruiser(G) {
  const p = G.city.randomRoadPoint();
  // Spawn on a road near the player, but not on top of them.
  let guard = 0;
  while (Math.hypot(p.x - G.player.x, p.y - G.player.y) < 500 && guard < 10) {
    const q = G.city.randomRoadPoint();
    p.x = q.x;
    p.y = q.y;
    p.angle = q.angle;
    guard += 1;
  }
  const car = createCar('police', p.x, p.y, p.angle, 'police');
  car.siren = 1;
  G.cars.push(car);
  G.cruisers.push(car);
  return car;
}

function spawnFootCop(G, x, y) {
  const cop = { kind: 'cop', x, y, angle: 0, speed: 0, bustTimer: 0, state: 'chase' };
  G.cops.push(cop);
  return cop;
}

/**
 * One cruiser chasing the player. Up close it rams straight at the player;
 * further away it follows the road grid, intersection by intersection, toward
 * the intersection nearest the player — never cutting across blocks, so it
 * does not wedge itself on buildings. Each leg picks the neighbouring
 * intersection closest to the destination.
 */
function stepCruiser(G, car, dt) {
  const player = G.player;
  const target = player.car || player;
  const dPlayer = Math.hypot(target.x - car.x, target.y - car.y);
  // Ram only when the player is close and on the same road as the cruiser;
  // across a block, ramming means driving through buildings.
  const sameRoad = Math.abs(target.x - car.x) < 45 || Math.abs(target.y - car.y) < 45;
  let tx;
  let ty;
  if (dPlayer < 170 && sameRoad) {
    tx = target.x;
    ty = target.y;
  } else {
    const near = G.city.nearestRoadPoint(target.x, target.y);
    const destX = ROADS.reduce((a, b) => (Math.abs(b - near.x) < Math.abs(a - near.x) ? b : a));
    const destY = ROADS.reduce((a, b) => (Math.abs(b - near.y) < Math.abs(a - near.y) ? b : a));
    if (!car.route || car.route.dx !== destX || car.route.dy !== destY) {
      // Start the route at the intersection ahead of the cruiser on the road
      // it is on — the nearest intersection may already be behind it, and
      // targeting that turns the cruiser around into the car behind it.
      const axis = roadAxis(car);
      let leg;
      let prev;
      if (axis.vertical) {
        const next = destY > car.y ? ROADS.find((r) => r > car.y + 1) : ROADS.slice().reverse().find((r) => r < car.y - 1);
        const back = destY > car.y ? ROADS.slice().reverse().find((r) => r < car.y - 1) : ROADS.find((r) => r > car.y + 1);
        leg = { x: axis.line, y: next === undefined ? destY : next };
        prev = { x: axis.line, y: back === undefined ? car.y : back };
      } else {
        const next = destX > car.x ? ROADS.find((r) => r > car.x + 1) : ROADS.slice().reverse().find((r) => r < car.x - 1);
        const back = destX > car.x ? ROADS.slice().reverse().find((r) => r < car.x - 1) : ROADS.find((r) => r > car.x + 1);
        leg = { x: next === undefined ? destX : next, y: axis.line };
        prev = { x: back === undefined ? car.x : back, y: axis.line };
      }
      car.route = { tx: leg.x, ty: leg.y, px: prev.x, py: prev.y, dx: destX, dy: destY };
    }
    const r = car.route;
    if (r.tx === r.dx && r.ty === r.dy) {
      // At the destination intersection: close in on the player directly.
      tx = target.x;
      ty = target.y;
    } else {
      if (Math.hypot(car.x - r.tx, car.y - r.ty) < 70) {
        const ix = ROADS.indexOf(r.tx);
        const iy = ROADS.indexOf(r.ty);
        let best = null;
        let bestD = Infinity;
        const consider = (nx, ny) => {
          if (nx === r.px && ny === r.py) return;
          const d = Math.hypot(nx - r.dx, ny - r.dy);
          if (d < bestD) {
            bestD = d;
            best = [nx, ny];
          }
        };
        if (ix > 0) consider(ROADS[ix - 1], r.ty);
        if (ix < ROADS.length - 1) consider(ROADS[ix + 1], r.ty);
        if (iy > 0) consider(r.tx, ROADS[iy - 1]);
        if (iy < ROADS.length - 1) consider(r.tx, ROADS[iy + 1]);
        if (best) {
          r.px = r.tx;
          r.py = r.ty;
          r.tx = best[0];
          r.ty = best[1];
        }
      }
      tx = r.tx;
      ty = r.ty;
    }
  }
  // Follow the lane to the target, not the crow-flies line: ramming aims
  // at the player's place on the road, so a cruiser never follows the
  // player onto the sand or through a block.
  const aim = roadSteerTarget(G, car, tx, ty);
  const wantAngle = Math.atan2(aim.y - car.y, aim.x - car.x);
  const turn = Math.abs(angleDiff(wantAngle, car.angle));
  const steer = steerToward(car, aim.x, aim.y);
  // Slow for a sharp turn, or the turning circle carries the cruiser into
  // the block beyond the intersection; brake hard for a very sharp one.
  const throttle = turn > 0.9 ? -0.6 : turn > 0.5 ? 0.35 : 1;
  stepCarPhysics(G, car, throttle, steer, false, dt, 0.9);
  car.siren = 1;
  // Ram: shove the player's car and slow it.
  if (player.car) {
    const d = Math.hypot(player.car.x - car.x, player.car.y - car.y);
    if (d < 44) {
      player.car.speed *= 0.92;
      G.shake = Math.min(10, G.shake + 3);
    }
  } else if (Math.hypot(player.x - car.x, player.y - car.y) < 60) {
    // The player is on foot and a cruiser is on top of them: a cop gets out.
    if (G.cops.length < 2 && G.wanted >= 1) {
      spawnFootCop(G, car.x, car.y);
      car.speed = 0;
      car.driver = 'none';
      G.cruisers = G.cruisers.filter((c) => c !== car);
    }
  }
  if (car.damage > 60 && G.random() < 0.3) {
    // A battered cruiser smokes; the smoke itself is drawn in stepCars.
  }
}

/** A foot cop runs at the player; touching them while they are slow busts. */
function stepFootCop(G, cop, dt) {
  const player = G.player;
  const dx = player.x - cop.x;
  const dy = player.y - cop.y;
  const d = Math.hypot(dx, dy);
  cop.angle = Math.atan2(dy, dx);
  if (d > 30) {
    cop.x += Math.cos(cop.angle) * 235 * dt;
    cop.y += Math.sin(cop.angle) * 235 * dt;
    cop.bustTimer = 0;
  } else {
    // Caught: hold still next to the player and the bust lands.
    const playerSpeed = player.car ? Math.abs(player.car.speed) : Math.hypot(player.vx || 0, player.vy || 0);
    if (!player.car && playerSpeed < 90) {
      cop.bustTimer += dt;
      if (cop.bustTimer > WANTED.bustSeconds) {
        G.events.push({ type: 'busted' });
        cop.bustTimer = 0;
      }
    } else cop.bustTimer = 0;
  }
  const fixed = G.city.collideCircle(cop.x, cop.y, 10);
  cop.x = fixed.x;
  cop.y = fixed.y;
}

export function stepPolice(G, dt) {
  if (G.wanted > 0) {
    const want = cruisersWanted(G.wanted);
    let active = G.cruisers.length;
    if (active < want) {
      G.policeSpawnTimer -= dt;
      if (G.policeSpawnTimer <= 0) {
        spawnCruiser(G);
        G.policeSpawnTimer = 2.5;
      }
    }
    // Wanted fades only while no police can see the player.
    let nearest = Infinity;
    for (const c of G.cruisers) nearest = Math.min(nearest, Math.hypot(c.x - G.player.x, c.y - G.player.y));
    for (const c of G.cops) nearest = Math.min(nearest, Math.hypot(c.x - G.player.x, c.y - G.player.y));
    if (nearest > WANTED.decayDistance) {
      G.unseenTimer += dt;
      if (G.unseenTimer > WANTED.decaySeconds) {
        G.wanted -= 1;
        G.unseenTimer = 0;
        G.toast = { text: `Wanted level down to ${G.wanted}`, t: 2.5 };
        if (G.wanted === 0) {
          G.toast = { text: 'You lost the cops. Lay low.', t: 3 };
          G.cops.length = 0;
        }
      }
    } else G.unseenTimer = 0;
  }
  for (const car of [...G.cruisers]) stepCruiser(G, car, dt);
  for (const cop of G.cops) stepFootCop(G, cop, dt);
  // Cruisers too far away give up the chase and go back to patrol.
  const px = G.player.x;
  const py = G.player.y;
  for (const car of [...G.cruisers]) {
    if (Math.hypot(car.x - px, car.y - py) > 1700) {
      car.driver = 'traffic';
      car.siren = 0;
      G.cruisers = G.cruisers.filter((c) => c !== car);
    }
  }
}

/** The bust: lose a cut of the cash, wake up at the hideout, wanted cleared. */
export function bustPlayer(G) {
  const lost = Math.min(G.player.cash, Math.max(50, Math.floor(G.player.cash * 0.2)));
  G.player.cash -= lost;
  G.player.hp = 100;
  G.wanted = 0;
  G.unseenTimer = 0;
  G.cops.length = 0;
  for (const car of G.cruisers) {
    car.driver = 'traffic';
    car.siren = 0;
  }
  G.cruisers.length = 0;
  if (G.player.car) {
    G.player.car.driver = 'none';
    G.player.car = null;
  }
  const s = G.city.spots.hideout;
  G.player.x = s.x;
  G.player.y = s.y;
  G.player.angle = 0;
  G.camera.x = s.x - 640;
  G.camera.y = s.y - 360;
  G.banner = { title: 'BUSTED', sub: `The Solmar PD took $${lost} off you.`, t: 3.5, color: '#5d7ea6' };
  G.audio.fail();
}
