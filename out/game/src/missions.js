// The story: five sequential jobs for fixer Dahlia Cross, plus two side
// activities — taxi fares and a street race. Each mission is a small state
// machine of stages; every stage sets the on-screen objective and a waypoint,
// and the update function checks its completion condition each step. Rewards
// are paid in cash on completion, and a failed mission restarts from its
// first stage.

import { MISSION_REWARDS } from './config.js';
import { createPed } from './peds.js';
import { addWanted } from './police.js';
import { pick, range } from './random.js';

export const MISSION_TITLES = [
  'First Wheels',
  'The Pickup',
  'Hot Pursuit',
  'Courier Run',
  'The Big Score',
];

export function createMissions() {
  return {
    index: 0,
    stage: 0,
    timer: 0,
    data: {},
    completed: [],
    objective: null,
    taxi: null,
    taxiCooldown: 12,
    race: null,
    raceOffer: false,
    storyDone: false,
  };
}

function dist(G, x, y) {
  const p = G.player.car || G.player;
  return Math.hypot(p.x - x, p.y - y);
}

function setObjective(G, text, x, y) {
  G.missions.objective = { text, x, y };
}

function finishMission(G) {
  const m = G.missions;
  const reward = MISSION_REWARDS[m.index];
  G.player.cash += reward;
  m.completed.push(m.index);
  G.banner = { title: 'MISSION COMPLETE', sub: `${MISSION_TITLES[m.index]} — $${reward}`, t: 3.5, color: '#7ddc7a' };
  G.audio.jingle();
  G.events.push({ type: 'mission-complete', index: m.index });
  m.index += 1;
  m.stage = 0;
  m.timer = 0;
  m.data = {};
  if (m.index >= MISSION_TITLES.length) {
    m.storyDone = true;
    m.objective = null;
    G.banner = { title: 'STORY COMPLETE', sub: 'Solmar City is yours, Milo. Free roam — fares, races, and the open road.', t: 5, color: '#f2c230' };
  }
}

export function failMission(G, reason) {
  const m = G.missions;
  if (m.index >= MISSION_TITLES.length) return;
  G.banner = { title: 'MISSION FAILED', sub: reason, t: 3, color: '#ff5a4e' };
  G.audio.fail();
  m.stage = 0;
  m.timer = 0;
  m.data = {};
  startMissionSetup(G, m.index);
}

/** Per-mission setup that runs when a mission (re)starts. */
export function startMissionSetup(G, index) {
  const m = G.missions;
  const s = G.city.spots;
  if (index === 2) {
    // Hot Pursuit opens with the whole department already looking for Milo.
    addWanted(G, 3, 'the pickup went loud');
  }
  if (index === 3) {
    m.data.checkpoints = [];
    for (let i = 0; i < 3; i += 1) {
      const p = G.city.randomRoadPoint();
      m.data.checkpoints.push({ x: p.x, y: p.y });
    }
    m.data.next = 0;
    m.timer = 150;
  }
  if (index === 4) {
    m.data.vaultProgress = 0;
  }
  void s;
}

function updateStory(G, dt) {
  const m = G.missions;
  const s = G.city.spots;
  if (m.index >= MISSION_TITLES.length) {
    m.objective = null;
    return;
  }
  const i = m.index;
  if (i === 0) {
    if (m.stage === 0) {
      setObjective(G, 'Steal any car — press E next to one', null, null);
      if (G.player.car) m.stage = 1;
    } else {
      setObjective(G, 'Deliver the car to Sunset Auto Paint', s.paintShop.x, s.paintShop.y);
      if (G.player.car && dist(G, s.paintShop.x, s.paintShop.y) < 85) finishMission(G);
    }
  } else if (i === 1) {
    if (m.stage === 0) {
      setObjective(G, 'Pick up the courier at the Marina', s.marina.x, s.marina.y);
      if (dist(G, s.marina.x, s.marina.y) < 75) {
        m.stage = 1;
        // The job pays in hardware: the pistol, and the ambush that comes with it.
        G.player.hasPistol = true;
        G.player.ammo += 24;
        G.toast = { text: 'Pistol unlocked — aim with the mouse, click to shoot', t: 4 };
        const names = ['Vex', 'Rook', 'Talon'];
        m.data.rivals = [];
        for (let k = 0; k < 3; k += 1) {
          const rival = createPed(G, s.marina.x + range(G.random, -120, 120), s.marina.y + range(G.random, -120, 120), { name: names[k], armed: true, hp: 3, shirt: '#3a3a3a' });
          G.peds.push(rival);
          m.data.rivals.push(rival);
        }
        addWanted(G, 1, 'shots fired at the marina');
      }
    } else if (m.stage === 1) {
      const left = m.data.rivals.filter((r) => r.state !== 'down').length;
      setObjective(G, `Fight off the ambush — crew left: ${left}`, s.marina.x, s.marina.y);
      if (left === 0) m.stage = 2;
    } else {
      setObjective(G, 'Get back to the hideout', s.hideout.x, s.hideout.y);
      if (dist(G, s.hideout.x, s.hideout.y) < 90) finishMission(G);
    }
  } else if (i === 2) {
    setObjective(G, 'Lose the cops, then reach the hideout', s.hideout.x, s.hideout.y);
    const nearHideout = dist(G, s.hideout.x, s.hideout.y) < 100;
    const nearestCop = Math.min(
      ...G.cruisers.map((c) => Math.hypot(c.x - G.player.x, c.y - G.player.y)),
      ...G.cops.map((c) => Math.hypot(c.x - G.player.x, c.y - G.player.y)),
      Infinity,
    );
    if (nearHideout && nearestCop > 420) finishMission(G);
  } else if (i === 3) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(G, 'Out of time — the parcels went to someone else.');
      return;
    }
    const cp = m.data.checkpoints[m.data.next];
    setObjective(G, `Deliver the parcel ${m.data.next + 1}/3 — ${Math.ceil(m.timer)}s left`, cp.x, cp.y);
    if (dist(G, cp.x, cp.y) < 75) {
      G.player.cash += 60;
      G.audio.chime();
      m.data.next += 1;
      if (m.data.next >= 3) finishMission(G);
    }
  } else if (i === 4) {
    if (m.stage === 0) {
      setObjective(G, 'Reach Harbor Bank', s.bank.x, s.bank.y);
      if (dist(G, s.bank.x, s.bank.y) < 75) m.stage = 1;
    } else if (m.stage === 1) {
      setObjective(G, 'Crack the vault — hold position by the doors', s.bank.x, s.bank.y);
      if (dist(G, s.bank.x, s.bank.y) < 65) {
        m.data.vaultProgress += dt;
        if (m.data.vaultProgress >= 4) {
          m.stage = 2;
          addWanted(G, 4, 'the bank alarm is screaming');
          G.toast = { text: 'Vault open! Four stars — run!', t: 4 };
        }
      } else m.data.vaultProgress = Math.max(0, m.data.vaultProgress - dt);
    } else {
      setObjective(G, 'Escape to the hideout — 4 stars on you', s.hideout.x, s.hideout.y);
      if (dist(G, s.hideout.x, s.hideout.y) < 90) finishMission(G);
    }
  }
}

/** A pedestrian near the player wants a cab: drive up to them to take the fare. */
function updateTaxi(G, dt) {
  const m = G.missions;
  if (m.taxi) {
    const t = m.taxi;
    if (t.state === 'waiting') {
      setObjective(G, `Pick up ${t.ped.name} — drive up to them`, t.ped.x, t.ped.y);
      if (G.player.car && Math.hypot(G.player.car.x - t.ped.x, G.player.car.y - t.ped.y) < 46) {
        t.state = 'riding';
        t.timer = Math.max(25, Math.hypot(t.dest.x - t.ped.x, t.dest.y - t.ped.y) / 260);
        G.peds = G.peds.filter((p) => p !== t.ped);
        G.toast = { text: `${t.ped.name} is in. Get them there — $${t.fare}`, t: 3 };
      }
      if (Math.hypot(G.player.x - t.ped.x, G.player.y - t.ped.y) > 900) {
        m.taxi = null;
        m.taxiCooldown = 10;
      }
    } else {
      t.timer -= dt;
      setObjective(G, `Drop off ${t.ped.name} — $${t.fare} (${Math.ceil(t.timer)}s)`, t.dest.x, t.dest.y);
      if (G.player.car && Math.hypot(G.player.car.x - t.dest.x, G.player.car.y - t.dest.y) < 75) {
        G.player.cash += t.fare;
        G.audio.chime();
        G.toast = { text: `Fare complete — $${t.fare}. Thanks, ${t.ped.name}!`, t: 3 };
        m.taxi = null;
        m.taxiCooldown = 14;
      } else if (t.timer <= 0) {
        G.toast = { text: `${t.ped.name} got out and walked. Fare lost.`, t: 3 };
        m.taxi = null;
        m.taxiCooldown = 14;
      }
    }
    return;
  }
  m.taxiCooldown -= dt;
  if (m.taxiCooldown > 0) return;
  // Offer a fare: a pedestrian appears a short drive away, waving.
  const p = G.city.randomSidewalkPoint();
  let guard = 0;
  while (Math.hypot(p.x - G.player.x, p.y - G.player.y) < 260 && guard < 10) {
    const q = G.city.randomSidewalkPoint();
    p.x = q.x;
    p.y = q.y;
    guard += 1;
  }
  const ped = createPed(G, p.x, p.y, { taxi: true, shirt: '#f2c230' });
  ped.state = 'taxi';
  G.peds.push(ped);
  const d = G.city.randomRoadPoint();
  const fare = 40 + Math.floor(Math.hypot(d.x - p.x, d.y - p.y) / 18);
  m.taxi = { ped, dest: { x: d.x, y: d.y }, state: 'waiting', fare, timer: 0 };
  G.toast = { text: `${ped.name} wants a cab — drive to the yellow marker`, t: 4 };
}

/** The street race: four checkpoints, one timer, one payout. */
function updateRace(G, dt) {
  const m = G.missions;
  const s = G.city.spots;
  if (m.race) {
    const r = m.race;
    r.timer -= dt;
    if (r.timer <= 0) {
      G.banner = { title: 'RACE OVER', sub: 'Too slow — the purse went to someone else.', t: 3, color: '#ff5a4e' };
      G.audio.fail();
      m.race = null;
      return;
    }
    const cp = r.checkpoints[r.next];
    setObjective(G, `Race checkpoint ${r.next + 1}/4 — ${Math.ceil(r.timer)}s`, cp.x, cp.y);
    if (dist(G, cp.x, cp.y) < 80) {
      G.audio.chime();
      r.next += 1;
      if (r.next >= r.checkpoints.length) {
        const bonus = Math.floor(r.timer) * 4;
        G.player.cash += 600 + bonus;
        G.banner = { title: 'RACE WON', sub: `You took the purse — $${600 + bonus}`, t: 3.5, color: '#7ddc7a' };
        G.audio.jingle();
        m.race = null;
      }
    }
    return;
  }
  // Standing at the start line in a car offers the race.
  m.raceOffer = !!G.player.car && dist(G, s.raceStart.x, s.raceStart.y) < 70;
}

export function startRace(G) {
  const m = G.missions;
  const checkpoints = [];
  for (let i = 0; i < 4; i += 1) {
    const p = G.city.randomRoadPoint();
    checkpoints.push({ x: p.x, y: p.y });
  }
  m.race = { checkpoints, next: 0, timer: 100 };
  m.raceOffer = false;
  G.toast = { text: 'Race started — hit all 4 checkpoints!', t: 3 };
}

/** Restart the current mission from its first stage, with no banner. */
export function resetMission(G) {
  const m = G.missions;
  if (m.index >= MISSION_TITLES.length) return;
  m.stage = 0;
  m.timer = 0;
  m.data = {};
  startMissionSetup(G, m.index);
}

/** The mission layer's one step: story, then taxi, then race — each later
 * one takes over the objective line while it is active. */
export function updateMissions(G, dt) {
  const m = G.missions;
  if (!m.storyDone) updateStory(G, dt);
  updateTaxi(G, dt);
  updateRace(G, dt);
  if (m.storyDone && !m.taxi && !m.race) m.objective = null;
}
