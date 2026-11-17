// Pedestrians: they walk the sidewalks to random destinations, cross at
// crosswalks, and run screaming when something scares them — a fast car, a
// punch, a gunshot. The same module also runs the mission-2 rivals (armed,
// they shoot back) and the taxi passengers who wait for a ride.

import { CAR } from './config.js';
import { pick, range } from './random.js';
import { addWanted } from './police.js';

const SHIRTS = ['#d05a4e', '#4e7dd0', '#5aa864', '#c9a13b', '#8a5fc0', '#d07a4e', '#4eb8c9', '#e8e4da'];
const SKINS = ['#f2c9a0', '#d9a06f', '#a06a42', '#8a5a35', '#f7d7b5'];
const NAMES = ['Rosa', 'Ken', 'Mara', 'Tomas', 'Lena', 'Omar', 'Priya', 'Felix', 'Nina', 'Gus', 'Iris', 'Marco'];

let nextPedId = 1;

export function createPed(G, x, y, opts = {}) {
  const p = {
    id: nextPedId,
    kind: 'ped',
    name: opts.name || pick(G.random, NAMES),
    x, y,
    angle: G.random() * Math.PI * 2,
    speed: 0,
    state: opts.state || 'walk',
    hp: opts.hp || 1,
    shirt: opts.shirt || pick(G.random, SHIRTS),
    skin: pick(G.random, SKINS),
    target: null,
    wait: range(G.random, 0, 2),
    fleeX: 0,
    fleeY: 0,
    downTimer: 0,
    shootTimer: range(G.random, 0.5, 1.5),
    taxi: !!opts.taxi,
    fare: null,
    scream: 0,
  };
  if (opts.armed) p.state = 'rival';
  return p;
}

/** Scare every pedestrian near (x, y): they run away from the threat. */
export function scarePeds(G, x, y, radius) {
  for (const ped of G.peds) {
    if (ped.state === 'down' || ped.state === 'rival') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeX = ped.x - x;
      ped.fleeY = ped.y - y;
      ped.scream = 1.2;
      ped.wait = range(G.random, 1.5, 3);
    }
  }
}

/** A pedestrian walking the sidewalk picks a new destination. */
function pickWalkTarget(G, ped) {
  const p = G.city.randomSidewalkPoint();
  ped.target = p;
}

function stepWalk(G, ped, dt) {
  if (ped.wait > 0) {
    ped.wait -= dt;
    ped.speed = 0;
    return;
  }
  if (!ped.target) pickWalkTarget(G, ped);
  const dx = ped.target.x - ped.x;
  const dy = ped.target.y - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 14) {
    ped.wait = range(G.random, 0.5, 4);
    ped.target = null;
    ped.speed = 0;
    return;
  }
  ped.angle = Math.atan2(dy, dx);
  ped.speed = 55;
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  const fixed = G.city.collideCircle(ped.x, ped.y, 10);
  ped.x = fixed.x;
  ped.y = fixed.y;
}

function stepFlee(G, ped, dt) {
  ped.wait -= dt;
  const d = Math.hypot(ped.fleeX, ped.fleeY) || 1;
  ped.angle = Math.atan2(ped.fleeY / d, ped.fleeX / d);
  ped.speed = 230;
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  const fixed = G.city.collideCircle(ped.x, ped.y, 10);
  ped.x = fixed.x;
  ped.y = fixed.y;
  if (ped.wait <= 0) {
    ped.state = 'walk';
    ped.target = null;
  }
}

/** A rival shoots at the player: a tracer, a bang, and damage if it lands. */
function stepRival(G, ped, dt) {
  const player = G.player;
  const d = Math.hypot(player.x - ped.x, player.y - ped.y);
  ped.shootTimer -= dt;
  if (d > 620) {
    // Close the distance on foot.
    ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
    ped.x += Math.cos(ped.angle) * 170 * dt;
    ped.y += Math.sin(ped.angle) * 170 * dt;
  } else {
    ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
    if (ped.shootTimer <= 0) {
      ped.shootTimer = range(G.random, 0.9, 1.8);
      G.audio.gunshot();
      G.particles.push({ kind: 'tracer', x: ped.x, y: ped.y, x2: player.x, y2: player.y, life: 0.12, maxLife: 0.12, color: '#ffd23e', size: 2 });
      if (G.random() < 0.45) damagePlayer(G, 8, 'shot');
      scarePeds(G, ped.x, ped.y, 260);
    }
  }
  const fixed = G.city.collideCircle(ped.x, ped.y, 10);
  ped.x = fixed.x;
  ped.y = fixed.y;
}

export function damagePlayer(G, amount, cause) {
  const player = G.player;
  if (player.invulnerable > 0 || player.hp <= 0) return;
  player.hp = Math.max(0, player.hp - amount);
  player.invulnerable = 0.5;
  G.shake = Math.min(12, G.shake + 5);
  if (player.hp <= 0) G.events.push({ type: 'down', cause });
}

/** Knock a pedestrian down: they drop cash, and the law takes notice. */
export function knockPed(G, ped, byCar) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.downTimer = 6;
  ped.speed = 0;
  G.particles.push({ kind: 'burst', x: ped.x, y: ped.y, life: 0.5, maxLife: 0.5, color: '#ff5a4e', size: 14 });
  if (G.random() < 0.6) {
    G.pickups.push({ kind: 'cash', x: ped.x + range(G.random, -14, 14), y: ped.y + range(G.random, -14, 14), value: Math.floor(range(G.random, 15, 60)), life: 30 });
  }
  scarePeds(G, ped.x, ped.y, 300);
  addWanted(G, 1, byCar ? 'hit a pedestrian' : 'assault');
}

/** Step every pedestrian, and resolve car-vs-pedestrian collisions. */
export function stepPeds(G, dt) {
  for (const ped of G.peds) {
    if (ped.scream > 0) ped.scream -= dt;
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'walk';
        ped.target = null;
      }
      continue;
    }
    if (ped.state === 'walk' || ped.state === 'taxi') stepWalk(G, ped, dt);
    else if (ped.state === 'flee') stepFlee(G, ped, dt);
    else if (ped.state === 'rival') stepRival(G, ped, dt);
  }
  // Cars running into pedestrians: the pedestrian goes down, the car slows.
  for (const car of G.cars) {
    if (Math.abs(car.speed) < 60) continue;
    for (const ped of G.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - car.x, ped.y - car.y);
      if (d < CAR.radius + 8) {
        knockPed(G, ped, true);
        // A bump, not a wall: running someone over is a crime, but it does
        // not stop a speeding car the way a wall does.
        car.speed *= 0.9;
        G.shake = Math.min(10, G.shake + 4);
      }
    }
  }
  // Thin the crowd back out: pedestrians far from the player respawn nearer.
  const px = G.player.x;
  const py = G.player.y;
  for (const ped of G.peds) {
    if (ped.state === 'rival' || ped.taxi) continue;
    if (Math.hypot(ped.x - px, ped.y - py) > 1500) {
      const p = G.city.randomSidewalkPoint();
      ped.x = p.x;
      ped.y = p.y;
      ped.target = null;
    }
  }
}

export function populatePeds(G) {
  for (let i = 0; i < CAR.pedCount; i += 1) {
    const p = G.city.randomSidewalkPoint();
    G.peds.push(createPed(G, p.x, p.y));
  }
}
