// Milo Vane, on foot and behind the wheel. On foot he walks, sprints, punches
// and — once the pistol is unlocked — shoots where the mouse points. Near a
// car, E steals it (pulling a driver out if it has one) and E again gets out.
// Driving uses the arcade physics from vehicles.js; the wanted level notices
// stolen cars, assaults and gunfire.

import { ACTION_CONFIRM, ACTION_INTERACT } from './input.js';
import { CAR, PLAYER } from './config.js';
import { addWanted } from './police.js';
import { createPed, damagePlayer, knockPed, scarePeds } from './peds.js';
import { stepCarPhysics } from './vehicles.js';
import { startRace } from './missions.js';

export function createPlayer(G) {
  const s = G.city.spots.spawn;
  return {
    x: s.x, y: s.y, angle: -Math.PI / 2,
    vx: 0, vy: 0,
    hp: PLAYER.maxHealth,
    cash: 250,
    car: null,
    punchTimer: 0,
    shootTimer: 0,
    invulnerable: 0,
    hasPistol: false,
    ammo: 0,
    walkPhase: 0,
    prevSpace: false,
  };
}

function nearestCar(G, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function enterCar(G, car) {
  const player = G.player;
  if (car.driver === 'traffic') {
    // Stealing a driven car pulls the driver out onto the street.
    const driver = createPed(G, car.x + 30, car.y, { shirt: '#c9a13b' });
    driver.state = 'flee';
    driver.fleeX = 40;
    driver.fleeY = 0;
    driver.wait = 2.5;
    G.peds.push(driver);
    addWanted(G, 1, 'carjacking');
    G.toast = { text: 'You jacked the car! The driver ran for it.', t: 2.5 };
  }
  car.driver = 'player';
  player.car = car;
  player.x = car.x;
  player.y = car.y;
  G.audio.chime();
}

function exitCar(G) {
  const player = G.player;
  const car = player.car;
  car.driver = 'none';
  car.speed = 0;
  player.car = null;
  player.x = car.x - Math.sin(car.angle) * 30;
  player.y = car.y + Math.cos(car.angle) * 30;
  player.angle = car.angle;
  const fixed = G.city.collideCircle(player.x, player.y, PLAYER.radius);
  player.x = fixed.x;
  player.y = fixed.y;
}

/** The punch: everything in front of Milo within reach takes a hit. */
function punch(G) {
  const player = G.player;
  player.punchTimer = PLAYER.punchCooldown;
  G.audio.punch();
  const reach = PLAYER.punchRange;
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);
  let hitAnything = false;
  for (const ped of G.peds) {
    const dx = ped.x - player.x;
    const dy = ped.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + 10 || d < 0.01) continue;
    if ((dx * fx + dy * fy) / d < 0.4) continue;
    hitAnything = true;
    if (ped.state === 'rival') {
      ped.hp -= PLAYER.punchDamage;
      if (ped.hp <= 0) knockPed(G, ped, false);
      else {
        ped.x += dx * 0.4;
        ped.y += dy * 0.4;
      }
    } else knockPed(G, ped, false);
  }
  for (const cop of G.cops) {
    const dx = cop.x - player.x;
    const dy = cop.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + 10 || d < 0.01) continue;
    if ((dx * fx + dy * fy) / d < 0.4) continue;
    hitAnything = true;
    cop.x += dx * 0.8;
    cop.y += dy * 0.8;
    cop.bustTimer = 0;
    addWanted(G, 1, 'assaulting an officer');
  }
  if (hitAnything) {
    G.shake = Math.min(8, G.shake + 3);
    G.particles.push({ kind: 'burst', x: player.x + fx * 30, y: player.y + fy * 30, life: 0.25, maxLife: 0.25, color: '#ffd23e', size: 10 });
  }
  scarePeds(G, player.x, player.y, 200);
}

/** The pistol: a hitscan shot toward the mouse, with a tracer and a bang. */
function shoot(G) {
  const player = G.player;
  if (!player.hasPistol || player.ammo <= 0) return;
  player.shootTimer = PLAYER.gunCooldown;
  player.ammo -= 1;
  const mx = G.mouseWorld.x;
  const my = G.mouseWorld.y;
  const dx = mx - player.x;
  const dy = my - player.y;
  const d = Math.hypot(dx, dy) || 1;
  const range = Math.min(PLAYER.gunRange, d);
  const ex = player.x + (dx / d) * range;
  const ey = player.y + (dy / d) * range;
  player.angle = Math.atan2(dy, dx);
  G.audio.gunshot();
  G.particles.push({ kind: 'tracer', x: player.x, y: player.y, x2: ex, y2: ey, life: 0.12, maxLife: 0.12, color: '#ffd23e', size: 2 });
  G.particles.push({ kind: 'flash', x: player.x + (dx / d) * 22, y: player.y + (dy / d) * 22, life: 0.08, maxLife: 0.08, color: '#fff2a0', size: 12 });
  // The first thing the shot crosses takes the hit.
  let best = null;
  let bestT = range;
  const consider = (x, y, radius, target) => {
    const px = x - player.x;
    const py = y - player.y;
    const t = px * (dx / d) + py * (dy / d);
    if (t < 0 || t > bestT) return;
    const perp = Math.abs(px * (dy / d) - py * (dx / d));
    if (perp < radius + 8) {
      best = target;
      bestT = t;
    }
  };
  for (const ped of G.peds) if (ped.state !== 'down') consider(ped.x, ped.y, 12, { type: 'ped', ped });
  for (const cop of G.cops) consider(cop.x, cop.y, 12, { type: 'cop', cop });
  for (const car of G.cars) {
    if (car === player.car) continue;
    consider(car.x, car.y, CAR.radius, { type: 'car', car });
  }
  if (best) {
    if (best.type === 'ped') {
      const ped = best.ped;
      if (ped.state === 'rival') {
        ped.hp -= PLAYER.gunDamage;
        if (ped.hp <= 0) knockPed(G, ped, false);
      } else knockPed(G, ped, false);
    } else if (best.type === 'cop') {
      const cop = best.cop;
      cop.x += (dx / d) * 40;
      cop.y += (dy / d) * 40;
      cop.bustTimer = 0;
      addWanted(G, 1, 'shooting at police');
    } else {
      best.car.damage += 30;
      G.particles.push({ kind: 'burst', x: best.car.x, y: best.car.y, life: 0.3, maxLife: 0.3, color: '#ff5a4e', size: 10 });
    }
  }
  // Gunfire draws the law, but only once per stretch — the cops do not
  // file a new report for every single shot.
  if (G.gunCrimeTimer <= 0) {
    addWanted(G, 1, 'gunfire in the streets');
    G.gunCrimeTimer = 15;
  }
  scarePeds(G, player.x, player.y, 320);
  G.shake = Math.min(6, G.shake + 2);
}

function stepOnFoot(G, dt, input, actions) {
  const player = G.player;
  const axis = input.axis();
  const len = Math.hypot(axis.x, axis.y) || 1;
  const speed = input.sprint() ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  player.vx = (axis.x / len) * speed * (axis.x || axis.y ? 1 : 0);
  player.vy = (axis.y / len) * speed * (axis.x || axis.y ? 1 : 0);
  if (axis.x || axis.y) {
    player.angle = Math.atan2(player.vy, player.vx);
    player.walkPhase += dt * 10;
  }
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  const fixed = G.city.collideCircle(player.x, player.y, PLAYER.radius);
  if (fixed.hit) {
    player.x = fixed.x;
    player.y = fixed.y;
  }
  // Walking into a car shoves the player out of it.
  for (const car of G.cars) {
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < CAR.radius + PLAYER.radius && d > 0.01) {
      player.x = car.x + (dx / d) * (CAR.radius + PLAYER.radius);
      player.y = car.y + (dy / d) * (CAR.radius + PLAYER.radius);
    }
  }
  // A moving car that hits Milo on foot hurts.
  for (const car of G.cars) {
    if (Math.abs(car.speed) < 80) continue;
    const d = Math.hypot(player.x - car.x, player.y - car.y);
    if (d < CAR.radius + PLAYER.radius) {
      damagePlayer(G, 18, 'run over');
      player.x += (player.x - car.x) * 0.6;
      player.y += (player.y - car.y) * 0.6;
    }
  }
  if (player.punchTimer > 0) player.punchTimer -= dt;
  if (player.shootTimer > 0) player.shootTimer -= dt;
  if (player.invulnerable > 0) player.invulnerable -= dt;

  const space = input.keys.has('Space');
  const spacePressed = space && !player.prevSpace;
  player.prevSpace = space;
  const clicked = input.takeClick();
  if (spacePressed && player.punchTimer <= 0) punch(G);
  else if (clicked && player.shootTimer <= 0) {
    if (player.hasPistol && player.ammo > 0) shoot(G);
    else if (player.punchTimer <= 0) punch(G);
  }
  if (actions & ACTION_INTERACT) {
    if (G.missions.raceOffer) startRace(G);
    else {
      const car = nearestCar(G, 75);
      if (car) enterCar(G, car);
    }
  }
  // Pickups: cash, ammo and health lying on the street.
  for (let i = G.pickups.length - 1; i >= 0; i -= 1) {
    const p = G.pickups[i];
    if (Math.hypot(p.x - player.x, p.y - player.y) < 26) {
      if (p.kind === 'cash') {
        player.cash += p.value;
        G.toast = { text: `+$${p.value}`, t: 1.5 };
      } else if (p.kind === 'ammo') {
        player.ammo += 12;
        G.toast = { text: '+12 pistol ammo', t: 1.5 };
      } else {
        player.hp = Math.min(PLAYER.maxHealth, player.hp + 40);
        G.toast = { text: '+40 health', t: 1.5 };
      }
      G.audio.chime();
      G.pickups.splice(i, 1);
    }
  }
}

function stepDriving(G, dt, input, actions) {
  const player = G.player;
  const car = player.car;
  const axis = input.axis();
  const throttle = -axis.y;
  const steer = axis.x;
  stepCarPhysics(G, car, throttle, steer, input.handbrake(), dt, 1);
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.vx = Math.cos(car.angle) * car.speed;
  player.vy = Math.sin(car.angle) * car.speed;
  if (car.damage > 120) {
    // A wrecked car catches fire and Milo has to bail out.
    G.particles.push({ kind: 'burst', x: car.x, y: car.y, life: 0.4, maxLife: 0.4, color: '#ff7a2e', size: 16 });
    car.damage = 0;
    car.driver = 'none';
    player.car = null;
    damagePlayer(G, 20, 'wreck');
  }
  if (actions & ACTION_INTERACT) exitCar(G);
}

/** One step of the player, on foot or in a car. */
export function stepPlayer(G, dt, input, actions) {
  if (G.player.car) stepDriving(G, dt, input, actions);
  else stepOnFoot(G, dt, input, actions);
}
