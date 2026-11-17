// The HUD and the menus, drawn over the world in the same 1280x720 logical
// space: cash and health, the wanted stars, the clock, the mission objective,
// the speedometer, a live minimap, toasts and banners — and the title, pause,
// busted and game-over screens. Menus are keyboard driven (Enter, C, S, R,
// Esc) so they work the same with a mouse click anywhere.

import { FONT, PALETTE, ROADS, VIEW, WORLD } from './config.js';
import { MISSION_TITLES } from './missions.js';

const MINI = 200;
const MINI_SCALE = MINI / WORLD.size;

function formatClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  const fonts = new Map();

  function text(value, x, y, size, color, align = 'left', font = null) {
    const key = `${size}:${font || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${font || 'bold'} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function panel(x, y, w, h, alpha = 0.72) {
    ctx.fillStyle = `rgba(16,21,29,${alpha})`;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
  }

  function drawMinimap(G) {
    const mx = VIEW.width - MINI - 16;
    const my = VIEW.height - MINI - 16;
    panel(mx - 6, my - 6, MINI + 12, MINI + 12, 0.8);
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, MINI, MINI);
    ctx.clip();
    ctx.fillStyle = '#2a323d';
    ctx.fillRect(mx, my, MINI, MINI);
    const px = (x) => mx + x * MINI_SCALE;
    const py = (y) => my + y * MINI_SCALE;
    // Water and park.
    ctx.fillStyle = '#3d9cc2';
    ctx.fillRect(mx, my, 86 * MINI_SCALE, MINI);
    const marina = G.city.marina;
    ctx.fillRect(px(marina.x), py(marina.y), marina.w * MINI_SCALE, marina.h * MINI_SCALE);
    const park = G.city.park;
    ctx.fillStyle = '#69a854';
    ctx.fillRect(px(park.x), py(park.y), park.w * MINI_SCALE, park.h * MINI_SCALE);
    // Roads.
    ctx.fillStyle = '#6a7078';
    for (const r of ROADS) {
      ctx.fillRect(px(r) - 2, my, 4, MINI);
      ctx.fillRect(mx, py(r) - 2, MINI, 4);
    }
    // Buildings as dots.
    ctx.fillStyle = '#8a8f96';
    for (const b of G.city.buildings) ctx.fillRect(px(b.x), py(b.y), Math.max(2, b.w * MINI_SCALE), Math.max(2, b.h * MINI_SCALE));
    // Race checkpoints, taxi fare, mission waypoint.
    if (G.missions.race) {
      ctx.fillStyle = '#ff5a4e';
      for (const cp of G.missions.race.checkpoints) {
        ctx.beginPath();
        ctx.arc(px(cp.x), py(cp.y), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (G.missions.taxi) {
      const t = G.missions.taxi;
      const d = t.state === 'waiting' ? t.ped : t.dest;
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.arc(px(d.x), py(d.y), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const obj = G.missions.objective;
    if (obj && obj.x !== null && obj.x !== undefined) {
      ctx.fillStyle = '#f2c230';
      ctx.save();
      ctx.translate(px(obj.x), py(obj.y));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    // Police blips, then the player arrow on top.
    ctx.fillStyle = '#ff2e2e';
    for (const c of G.cruisers) {
      ctx.beginPath();
      ctx.arc(px(c.x), py(c.y), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const c of G.cops) {
      ctx.beginPath();
      ctx.arc(px(c.x), py(c.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const player = G.player;
    ctx.save();
    ctx.translate(px(player.x), py(player.y));
    ctx.rotate(player.angle);
    ctx.fillStyle = '#f4f1e6';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    text('SOLMAR', mx + MINI / 2, my - 10, 11, PALETTE.muted, 'center');
  }

  function drawStars(G) {
    const x = VIEW.width - 24;
    const y = 44;
    for (let i = 0; i < 5; i += 1) {
      text(i < G.wanted ? '★' : '☆', x - i * 30, y, 26, i < G.wanted ? PALETTE.wanted : 'rgba(244,241,230,0.4)', 'right');
    }
  }

  function measure(value, size) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    ctx.font = fonts.get(size);
    return ctx.measureText(value).width;
  }

  function drawObjective(G) {
    const obj = G.missions.objective;
    if (!obj) return;
    const p = G.player.car || G.player;
    let label = obj.text;
    if (obj.x !== null && obj.x !== undefined) {
      const d = Math.hypot(obj.x - p.x, obj.y - p.y);
      label += `  —  ${Math.round(d)}m`;
    }
    const w = Math.min(760, measure(label, 17) + 40);
    panel(VIEW.width / 2 - w / 2, 14, w, 34, 0.72);
    text(label, VIEW.width / 2, 38, 17, PALETTE.text, 'center');
  }

  function drawEdgeArrow(G) {
    const obj = G.missions.objective;
    if (!obj || obj.x === null || obj.x === undefined) return;
    const p = G.player.car || G.player;
    const dx = obj.x - p.x;
    const dy = obj.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < VIEW.width / 2) return;
    const angle = Math.atan2(dy, dx);
    const cx = VIEW.width / 2 + Math.cos(angle) * (VIEW.width / 2 - 70);
    const cy = VIEW.height / 2 + Math.sin(angle) * (VIEW.height / 2 - 70);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = '#f2c230';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text(`${Math.round(d)}m`, cx, cy + 30, 13, '#f2c230', 'center');
  }

  function drawHud(G) {
    // Cash and health, top left.
    panel(16, 14, 190, 64, 0.72);
    text(`$${Math.floor(G.player.cash).toLocaleString('en-US')}`, 30, 42, 24, PALETTE.cash);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(30, 52, 162, 10);
    ctx.fillStyle = G.player.hp > 30 ? '#7ddc7a' : '#ff5a4e';
    ctx.fillRect(30, 52, 162 * Math.max(0, G.player.hp / 100), 10);
    if (G.player.hasPistol) text(`Ammo ${G.player.ammo}`, 30, 76, 13, PALETTE.muted);
    // Wanted stars and the clock, top right.
    drawStars(G);
    text(formatClock(G.clockMinutes), VIEW.width - 24, 78, 18, PALETTE.text, 'right');
    text(`Mission ${Math.min(G.missions.index + 1, 5)}/5 — ${MISSION_TITLES[Math.min(G.missions.index, 4)]}`, VIEW.width - 24, 100, 13, PALETTE.muted, 'right');
    // Objective, speed, hints.
    drawObjective(G);
    if (G.missions.raceOffer) {
      panel(VIEW.width / 2 - 170, 56, 340, 30, 0.8);
      text('Press E — Street Race, $600 purse', VIEW.width / 2, 77, 16, '#ff5a4e', 'center');
    }
    if (G.player.car) {
      const mph = Math.round(Math.abs(G.player.car.speed) * 0.12);
      panel(16, VIEW.height - 78, 170, 62, 0.72);
      text(`${mph} mph`, 30, VIEW.height - 44, 24, PALETTE.text);
      text(G.player.car.name, 30, VIEW.height - 22, 13, PALETTE.muted);
    } else {
      text('WASD move · Shift sprint · Space punch · E enter car · P pause', 20, VIEW.height - 18, 13, 'rgba(244,241,230,0.65)');
    }
    if (G.toast && G.toast.t > 0) {
      const w = measure(G.toast.text, 15) + 36;
      panel(VIEW.width / 2 - w / 2, VIEW.height - 96, w, 32, 0.78);
      text(G.toast.text, VIEW.width / 2, VIEW.height - 74, 15, PALETTE.text, 'center');
    }
    if (G.banner && G.banner.t > 0) {
      const a = Math.min(1, G.banner.t);
      ctx.globalAlpha = a;
      text(G.banner.title, VIEW.width / 2, 300, 52, G.banner.color, 'center');
      if (G.banner.sub) text(G.banner.sub, VIEW.width / 2, 336, 20, PALETTE.text, 'center');
      ctx.globalAlpha = 1;
    }
    drawEdgeArrow(G);
    drawMinimap(G);
    if (G.audioMuted) text('Muted — M to unmute', VIEW.width - 24, VIEW.height - 240, 13, PALETTE.muted, 'right');
  }

  function drawMenuPanel(title, lines, prompt, accent) {
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(VIEW.width / 2 - 330, 120, 660, 440, 0.92);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(VIEW.width / 2 - 330, 120, 660, 440);
    text(title, VIEW.width / 2, 190, 54, accent, 'center');
    let y = 240;
    for (const line of lines) {
      text(line, VIEW.width / 2, y, 19, PALETTE.text, 'center');
      y += 32;
    }
    text(prompt, VIEW.width / 2, 520, 20, PALETTE.wanted, 'center');
  }

  function drawTitle(G, saveExists) {
    ctx.fillStyle = 'rgba(10,14,20,0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text('SOLMAR CITY', VIEW.width / 2, 150, 84, '#f2c230', 'center');
    text('A sun-soaked open world. One driver. One debt.', VIEW.width / 2, 196, 22, PALETTE.text, 'center');
    const lines = [
      'Milo Vane owes fixer Dahlia Cross a fortune.',
      'Steal cars, run jobs, dodge the Solmar PD — and pay it back.',
      '',
      'WASD / arrows — move & drive      Shift — sprint',
      'E — enter / steal a car           Space — punch / handbrake',
      'Mouse — aim, click — shoot        P / Esc — pause & save      M — mute',
      '',
      'Five story missions · Taxi fares · Street races · 0–5 wanted stars',
    ];
    let y = 260;
    for (const line of lines) {
      text(line, VIEW.width / 2, y, 19, PALETTE.text, 'center');
      y += 30;
    }
    const prompt = saveExists ? 'ENTER — new game      C — continue your save' : 'ENTER or click — start the game';
    text(prompt, VIEW.width / 2, 560, 22, PALETTE.wanted, 'center');
    text('An original game. Not affiliated with any commercial series.', VIEW.width / 2, 690, 13, PALETTE.muted, 'center');
  }

  function drawPaused(G) {
    const lines = [
      'P / Esc — resume',
      'S — save the game',
      'R — restart from the title screen',
      'M — mute / unmute',
      '',
      G.savedFlash > 0 ? 'Saved!' : `Cash $${Math.floor(G.player.cash).toLocaleString('en-US')} · Missions done: ${G.missions.completed.length}/5`,
    ];
    drawMenuPanel('PAUSED', lines, 'The city waits for no one — except now.', '#f2c230');
  }

  function drawBusted() {
    drawMenuPanel('BUSTED', ['The Solmar PD caught up with you.', 'They took a cut of your cash and dropped you at the hideout.'], 'ENTER — back on the streets', '#5d7ea6');
  }

  function drawOver() {
    drawMenuPanel('GAME OVER', ['Milo went down. The city keeps moving.', 'Your cash stays where it was — Dahlia still wants her cut.'], 'ENTER — get back up', '#ff5a4e');
  }

  /** Paint the HUD and, for menu screens, the menu over the world. */
  function draw(G, screen, view, saveExists) {
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === 'title') drawTitle(G, saveExists);
    else if (screen === 'paused') {
      drawHud(G);
      drawPaused(G);
    } else if (screen === 'busted') {
      drawHud(G);
      drawBusted();
    } else if (screen === 'over') {
      drawHud(G);
      drawOver();
    } else drawHud(G);
  }

  return { draw };
}
