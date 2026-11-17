// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, busted and game over. ?seed=N fixes the city; ?shot=chase|
// street|mission|title (with &seed=N) stages that scene instead of running
// the loop, paints it twice and sets window.__shotReady for a screenshot.

import { STEP, VIEW, WORLD } from './config.js';
import { createRandom } from './random.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_SAVE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildCity } from './city.js';
import { populateCars, stepCars } from './vehicles.js';
import { populatePeds, stepPeds } from './peds.js';
import { bustPlayer, stepPolice } from './police.js';
import { createMissions, resetMission, startMissionSetup, updateMissions } from './missions.js';
import { createPlayer, stepPlayer } from './player.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createHud } from './hud.js';
import { applySave, hasSave, loadSave, saveGame } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const EVENT_BUSTED = 1;
const EVENT_DOWN = 2;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const hud = createHud(canvas);

/** Build a fresh game state from a seed: city, cars, crowds, Milo. */
function createGame(seedValue) {
  const random = createRandom(seedValue);
  const city = buildCity(random);
  const G = {
    random,
    city,
    player: null,
    cars: [],
    peds: [],
    cops: [],
    cruisers: [],
    particles: [],
    pickups: [],
    skids: [],
    wanted: 0,
    unseenTimer: 0,
    policeSpawnTimer: 0,
    gunCrimeTimer: 0,
    missions: createMissions(),
    camera: { x: 0, y: 0 },
    shake: 0,
    elapsed: 0,
    clockMinutes: 600,
    banner: null,
    toast: null,
    events: [],
    audio: createAudio(),
    audioMuted: false,
    mouseWorld: { x: 0, y: 0 },
    autosaveTimer: 0,
    savedFlash: 0,
    shotMode: false,
  };
  G.player = createPlayer(G);
  populateCars(G);
  populatePeds(G);
  // A few pickups lying around the city from the start.
  for (let i = 0; i < 6; i += 1) {
    const p = city.randomSidewalkPoint();
    G.pickups.push({ kind: i % 3 === 0 ? 'ammo' : i % 3 === 1 ? 'health' : 'cash', x: p.x, y: p.y, value: 50, life: 999 });
  }
  G.camera.x = Math.max(0, Math.min(WORLD.size - VIEW.width, G.player.x - VIEW.width / 2));
  G.camera.y = Math.max(0, Math.min(WORLD.size - VIEW.height, G.player.y - VIEW.height / 2));
  return G;
}

function clampCamera(G) {
  const p = G.player.car || G.player;
  const tx = Math.max(0, Math.min(WORLD.size - VIEW.width, p.x - VIEW.width / 2));
  const ty = Math.max(0, Math.min(WORLD.size - VIEW.height, p.y - VIEW.height / 2));
  G.camera.x += (tx - G.camera.x) * 0.08;
  G.camera.y += (ty - G.camera.y) * 0.08;
}

function stepParticles(G, dt) {
  for (let i = G.particles.length - 1; i >= 0; i -= 1) {
    const p = G.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      G.particles.splice(i, 1);
      continue;
    }
    if (p.vx !== undefined) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
  }
  for (let i = G.skids.length - 1; i >= 0; i -= 1) {
    G.skids[i].life -= dt;
    if (G.skids[i].life <= 0) G.skids.splice(i, 1);
  }
  for (let i = G.pickups.length - 1; i >= 0; i -= 1) {
    const p = G.pickups[i];
    p.life -= dt;
    if (p.life <= 0) G.pickups.splice(i, 1);
  }
}

/**
 * One fixed step of a live game. Returns event flags for what happened, so
 * the caller can change screens without the world knowing about them.
 */
function stepWorld(G, dt, input, actions) {
  let events = 0;
  G.elapsed += dt;
  G.clockMinutes += dt * 0.5;
  if (G.clockMinutes >= 1440) G.clockMinutes -= 1440;
  if (G.gunCrimeTimer > 0) G.gunCrimeTimer -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
  if (G.banner && G.banner.t > 0) G.banner.t -= dt;
  if (G.toast && G.toast.t > 0) G.toast.t -= dt;
  if (G.savedFlash > 0) G.savedFlash -= dt;

  stepPlayer(G, dt, input, actions);
  stepCars(G, dt);
  stepPeds(G, dt);
  stepPolice(G, dt);
  updateMissions(G, dt);
  stepParticles(G, dt);
  clampCamera(G);

  // Autosave while playing; explicit saves happen from the pause menu.
  G.autosaveTimer += dt;
  if (G.autosaveTimer > 20 && !G.shotMode) {
    G.autosaveTimer = 0;
    saveGame(G);
  }

  for (const event of G.events) {
    if (event.type === 'busted') {
      bustPlayer(G);
      resetMission(G);
      events |= EVENT_BUSTED;
    } else if (event.type === 'down') {
      events |= EVENT_DOWN;
    } else if (event.type === 'mission-complete') {
      if (!G.shotMode) saveGame(G);
    }
  }
  G.events.length = 0;

  if (!G.shotMode) {
    const speed01 = G.player.car ? Math.abs(G.player.car.speed) / G.player.car.top : Math.hypot(G.player.vx, G.player.vy) / 330;
    G.audio.update(Math.min(1, speed01), G.wanted);
  }
  return events;
}

/** The title screen's living backdrop: traffic and crowds, camera drifting. */
function stepAmbient(G, dt) {
  G.elapsed += dt;
  stepCars(G, dt);
  stepPeds(G, dt);
  stepParticles(G, dt);
  const t = G.elapsed * 0.05;
  G.camera.x = Math.max(0, Math.min(WORLD.size - VIEW.width, 1400 + Math.sin(t) * 500 - VIEW.width / 2));
  G.camera.y = Math.max(0, Math.min(WORLD.size - VIEW.height, 1400 + Math.cos(t) * 380 - VIEW.height / 2));
}

function createWorld(seedValue) {
  let G = createGame(seedValue);
  return {
    get state() {
      return G;
    },
    reset() {
      G = createGame(seedValue);
    },
    step(dt, input, actions) {
      return stepWorld(G, dt, input, actions);
    },
    ambient(dt) {
      stepAmbient(G, dt);
    },
  };
}

function runShot(name) {
  const world = createWorld(seed);
  world.state.shotMode = true;
  const scene = stageShot(name, world);
  const G = world.state;
  window.__shotDebug = {
    player: { x: Math.round(G.player.x), y: Math.round(G.player.y), hp: G.player.hp, cash: Math.floor(G.player.cash) },
    car: G.player.car ? { x: Math.round(G.player.car.x), y: Math.round(G.player.car.y), speed: Math.round(G.player.car.speed), damage: Math.round(G.player.car.damage) } : null,
    camera: { x: Math.round(G.camera.x), y: Math.round(G.camera.y) },
    wanted: G.wanted,
    cruisers: G.cruisers.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), speed: Math.round(c.speed) })),
    mission: G.missions.index,
    completed: G.missions.completed,
    objective: G.missions.objective,
    trace: G.trace || null,
  };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen);
    hud.draw(world.state, scene.screen, renderer.view, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      status.textContent = 'shot-ready';
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const world = createWorld(seed);
  let screen = SCREEN_TITLE;
  let saveExists = hasSave();
  let accumulator = 0;
  let last = performance.now();
  let prevKeys = new Set();

  function announce(message) {
    status.textContent = message;
  }

  function startGame(continueSave) {
    world.reset();
    const G = world.state;
    if (continueSave) {
      const data = loadSave();
      if (data) applySave(G, data);
    }
    if (G.missions.index < 5) startMissionSetup(G, G.missions.index);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(continueSave ? 'Continuing your save. Good luck out there.' : 'Playing. Steal a car and deliver it to the paint shop.');
  }

  function handleActions() {
    const actions = input.takeActions();
    const G = world.state;
    if (actions & ACTION_MUTE) {
      G.audioMuted = G.audio.toggleMute();
      announce(G.audioMuted ? 'Muted.' : 'Sound on.');
    }
    // One-shot key presses that are not in the action flags (C, R).
    const pressed = new Set();
    for (const code of input.keys) if (!prevKeys.has(code)) pressed.add(code);
    prevKeys = new Set(input.keys);
    if (actions || pressed.size > 0) G.audio.unlock();

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(false);
      else if (pressed.has('KeyC') && saveExists) startGame(true);
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_SAVE) {
        if (saveGame(G)) {
          G.savedFlash = 2;
          announce('Game saved.');
        }
      } else if (pressed.has('KeyR')) {
        screen = SCREEN_TITLE;
        world.reset();
        saveExists = hasSave();
        announce('Solmar City. Press Enter to play.');
      }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        const p = G.player;
        if (screen === SCREEN_OVER) {
          if (p.car) {
            p.car.driver = 'none';
            p.car = null;
          }
          p.hp = 100;
          const s = G.city.spots.hideout;
          p.x = s.x;
          p.y = s.y;
          resetMission(G);
        }
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    return actions;
  }

  function updateMouseWorld() {
    const G = world.state;
    const view = renderer.view;
    const ratio = window.devicePixelRatio || 1;
    // Client pixels to logical view pixels (the canvas is letterboxed),
    // then into world coordinates through the camera.
    const lx = (input.mouse.x * ratio - view.x) / view.scale;
    const ly = (input.mouse.y * ratio - view.y) / view.scale;
    G.mouseWorld.x = G.camera.x + lx;
    G.mouseWorld.y = G.camera.y + ly;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    updateMouseWorld();
    const G = world.state;
    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        stepAmbient(G, STEP);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        const events = stepWorld(G, STEP, input, actions);
        accumulator -= STEP;
        if (events & EVENT_BUSTED) {
          screen = SCREEN_BUSTED;
          announce('Busted. The police took a cut of your cash.');
          break;
        }
        if (events & EVENT_DOWN) {
          screen = SCREEN_OVER;
          announce('Game over. Milo went down.');
          break;
        }
      }
    } else {
      accumulator = 0;
      if (screen === SCREEN_PAUSED) G.audio.update(0, 0);
    }
    renderer.draw(G, screen);
    hud.draw(G, screen, renderer.view, saveExists);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar City. Press Enter to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
