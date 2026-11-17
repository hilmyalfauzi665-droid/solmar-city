// Saving: one localStorage key holds the campaign — cash, missions, the
// player's position and health, the pistol, and the clock. The game autosaves
// every 20 seconds of play and on every mission completion; the pause menu
// saves on demand. A save from a private window simply does not persist.

import { SAVE_KEY } from './config.js';

export function saveGame(G) {
  const data = {
    version: 1,
    cash: Math.floor(G.player.cash),
    hp: Math.round(G.player.hp),
    x: Math.round(G.player.x),
    y: Math.round(G.player.y),
    hasPistol: G.player.hasPistol,
    ammo: G.player.ammo,
    missionIndex: G.missions.index,
    completed: G.missions.completed,
    clockMinutes: Math.round(G.clockMinutes),
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

/** Apply a loaded save to a fresh game state. */
export function applySave(G, data) {
  G.player.cash = data.cash;
  G.player.hp = data.hp;
  G.player.x = data.x;
  G.player.y = data.y;
  G.player.hasPistol = !!data.hasPistol;
  G.player.ammo = data.ammo || 0;
  G.missions.index = data.missionIndex || 0;
  G.missions.completed = data.completed || [];
  G.clockMinutes = data.clockMinutes || 600;
  G.camera.x = data.x - 640;
  G.camera.y = data.y - 360;
  // A loaded mission starts from its first stage, clean.
  G.missions.stage = 0;
  G.missions.timer = 0;
  G.missions.data = {};
  if (G.missions.index >= 5) G.missions.storyDone = true;
}
