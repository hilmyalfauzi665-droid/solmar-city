// Drawing only: the world's state in, pixels out. The camera shows a
// 1280x720 logical window of the city, scaled to fit the browser window.
// Everything is flat canvas shapes — roads with lane markings, rooftops with
// windows and air-conditioning units, the beach, the park, the marina — lit
// by a warm sun overlay. The HUD and the menus live in hud.js.

import { FONT, PALETTE, ROADS, ROAD_HALF, VIEW } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_OVER = 'over';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left') {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    ctx.font = fonts.get(size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function inView(G, x, y, margin) {
    const cam = G.camera;
    return x > cam.x - margin && x < cam.x + VIEW.width + margin && y > cam.y - margin && y < cam.y + VIEW.height + margin;
  }

  function drawGround(G) {
    const cam = G.camera;
    const left = cam.x - 40;
    const top = cam.y - 40;
    const w = VIEW.width + 80;
    const h = VIEW.height + 80;
    // Base ground: warm dry grass that reads as sun-baked lawns.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(left, top, w, h);
    // The beach and the ocean on the west edge.
    if (left < 150) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(left, top, 150 - left, h);
    }
    if (left < 86) {
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(left, top, 86 - left, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let y = Math.floor(cam.y / 90) * 90; y < cam.y + VIEW.height; y += 90) {
        ctx.beginPath();
        ctx.moveTo(10, y + 20);
        ctx.quadraticCurveTo(40, y + 8, 74, y + 20);
        ctx.stroke();
      }
    }
    // The park.
    const park = G.city.park;
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(park.x, park.y, park.w, park.h);
    // The marina basin.
    const m = G.city.marina;
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(m.x - 8, m.y, 8, m.h);
    ctx.fillRect(m.x, m.y - 8, m.w, 8);
    for (const boat of G.city.boats) {
      ctx.save();
      ctx.translate(boat.x, boat.y);
      ctx.rotate(boat.angle);
      ctx.fillStyle = boat.color;
      roundRect(ctx, -22, -7, 44, 14, 7);
      ctx.fill();
      ctx.fillStyle = '#20242c';
      ctx.fillRect(-6, -4, 12, 8);
      ctx.restore();
    }
  }

  function drawRoads(G) {
    const cam = G.camera;
    // Sidewalks first (a pale border around each road), then asphalt.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const r of ROADS) {
      ctx.fillRect(r - ROAD_HALF - 14, cam.y - 20, (ROAD_HALF + 14) * 2, VIEW.height + 40);
      ctx.fillRect(cam.x - 20, r - ROAD_HALF - 14, VIEW.width + 40, (ROAD_HALF + 14) * 2);
    }
    ctx.fillStyle = PALETTE.road;
    for (const r of ROADS) {
      ctx.fillRect(r - ROAD_HALF, cam.y - 20, ROAD_HALF * 2, VIEW.height + 40);
      ctx.fillRect(cam.x - 20, r - ROAD_HALF, VIEW.width + 40, ROAD_HALF * 2);
    }
    // Centre dashes and crosswalks at every intersection.
    ctx.fillStyle = PALETTE.roadLine;
    for (const r of ROADS) {
      for (let d = Math.floor((cam.y - 40) / 60) * 60; d < cam.y + VIEW.height + 40; d += 60) {
        if (Math.abs(d - r) > ROAD_HALF + 20) ctx.fillRect(r - 2, d, 4, 26);
      }
      for (let d = Math.floor((cam.x - 40) / 60) * 60; d < cam.x + VIEW.width + 40; d += 60) {
        if (Math.abs(d - r) > ROAD_HALF + 20) ctx.fillRect(d, r - 2, 26, 4);
      }
    }
    ctx.fillStyle = 'rgba(244,241,230,0.85)';
    for (const a of ROADS) {
      for (const b of ROADS) {
        for (let k = -2; k <= 2; k += 1) {
          ctx.fillRect(a + k * 18 - 6, b - ROAD_HALF + 4, 12, 16);
          ctx.fillRect(a + k * 18 - 6, b + ROAD_HALF - 20, 12, 16);
          ctx.fillRect(a - ROAD_HALF + 4, b + k * 18 - 6, 16, 12);
          ctx.fillRect(a + ROAD_HALF - 20, b + k * 18 - 6, 16, 12);
        }
      }
    }
  }

  function drawBuildings(G) {
    for (const b of G.city.buildings) {
      if (!inView(G, b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
      // Soft shadow to the south-east: the sun is high and warm.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      // Rooftop windows in a grid, plus an AC unit or two.
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      const cols = Math.max(2, Math.floor(b.w / 26));
      const rows = Math.max(2, Math.floor(b.h / 26));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          if (((c * 7 + r * 3 + Math.floor(b.seed)) % 5) === 0) continue;
          ctx.fillRect(b.x + 8 + c * ((b.w - 16) / cols), b.y + 8 + r * ((b.h - 16) / rows), 10, 8);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(b.x + b.w - 22, b.y + 10, 12, 10);
      if (b.tall) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(b.x + b.w / 2 - 14, b.y - 8, 28, 8);
      }
    }
    for (const t of G.city.trees) {
      if (!inView(G, t.x, t.y, 30)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(t.x + 4, t.y + 5, t.r, t.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.palm ? '#4e9b58' : '#3f7d3a';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSpotSigns(G) {
    const spots = G.city.spots;
    const signs = [
      [spots.paintShop, 'PAINT', '#f2c230'],
      [spots.bank, 'BANK', '#7ddc7a'],
      [spots.marina, 'MARINA', '#5db8e8'],
      [spots.hideout, 'HIDEOUT', '#c9a13b'],
      [spots.raceStart, 'RACE', '#ff5a4e'],
    ];
    for (const [s, label, color] of signs) {
      if (!inView(G, s.x, s.y, 60)) continue;
      ctx.fillStyle = 'rgba(16,21,29,0.8)';
      roundRect(ctx, s.x - 34, s.y - 44, 68, 20, 4);
      ctx.fill();
      text(label, s.x, s.y - 30, 11, color, 'center');
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawCar(G, car) {
    if (!inView(G, car.x, car.y, 60)) return;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-car.length / 2 + 4, -car.width / 2 + 4, car.length, car.width);
    // Wheels.
    ctx.fillStyle = '#14161a';
    const wl = car.length / 2 - 8;
    const ww = car.width / 2 - 1;
    ctx.fillRect(-wl, -ww - 3, 12, 6);
    ctx.fillRect(-wl, ww - 3, 12, 6);
    ctx.fillRect(wl - 12, -ww - 3, 12, 6);
    ctx.fillRect(wl - 12, ww - 3, 12, 6);
    // Body.
    ctx.fillStyle = car.color;
    roundRect(ctx, -car.length / 2, -car.width / 2, car.length, car.width, 7);
    ctx.fill();
    // Cabin and windshield.
    ctx.fillStyle = 'rgba(20,28,38,0.85)';
    roundRect(ctx, -car.length / 2 + 12, -car.width / 2 + 4, car.length / 2 - 8, car.width - 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,240,0.5)';
    ctx.fillRect(car.length / 2 - 12, -car.width / 2 + 5, 5, car.width - 10);
    if (car.model === 'taxi') {
      ctx.fillStyle = '#14161a';
      for (let k = 0; k < 5; k += 1) ctx.fillRect(-car.length / 2 + 6 + k * 8, -car.width / 2 + 1, 4, 4);
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(-6, -car.width / 2 - 3, 12, 5);
    }
    if (car.model === 'police') {
      ctx.fillStyle = '#f4f1e6';
      ctx.fillRect(-car.length / 2 + 10, -car.width / 2 + 2, car.length - 20, car.width - 4);
      ctx.fillStyle = '#20242c';
      ctx.fillRect(-car.length / 2 + 14, -car.width / 2 + 5, car.length / 2 - 10, car.width - 10);
      if (car.siren) {
        const phase = Math.floor(G.elapsed * 6) % 2 === 0;
        ctx.fillStyle = phase ? '#ff2e2e' : '#2e6bff';
        ctx.beginPath();
        ctx.arc(-2, -car.width / 2 + 1, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = phase ? '#2e6bff' : '#ff2e2e';
        ctx.beginPath();
        ctx.arc(6, -car.width / 2 + 1, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (car.smoke > 0) {
      ctx.fillStyle = 'rgba(120,120,120,0.5)';
      ctx.beginPath();
      ctx.arc(-car.length / 2, 0, 6 + car.smoke * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPerson(G, x, y, angle, shirt, skin, down, isPlayer, isCop) {
    if (!inView(G, x, y, 40)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(3, 5, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = shirt;
      roundRect(ctx, -13, -6, 26, 12, 6);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(15, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(angle);
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(4, -3, 6.5, 0, Math.PI * 2);
    ctx.fill();
    if (isPlayer) {
      ctx.fillStyle = '#c94f43';
      ctx.beginPath();
      ctx.arc(4, -3, 6.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f4f1e6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(16, 0);
      ctx.stroke();
    }
    if (isCop) {
      ctx.fillStyle = '#20242c';
      ctx.beginPath();
      ctx.arc(4, -3, 6.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(-2, -9, 12, 2);
    }
    ctx.restore();
  }

  function drawPickups(G) {
    for (const p of G.pickups) {
      if (!inView(G, p.x, p.y, 30)) continue;
      const bob = Math.sin(G.elapsed * 4 + p.x) * 2;
      if (p.kind === 'cash') {
        ctx.fillStyle = '#2e7d32';
        roundRect(ctx, p.x - 10, p.y - 7 + bob, 20, 14, 2);
        ctx.fill();
        text('$', p.x, p.y + 4 + bob, 12, '#7ddc7a', 'center');
      } else if (p.kind === 'ammo') {
        ctx.fillStyle = '#8a6d2f';
        ctx.fillRect(p.x - 9, p.y - 6 + bob, 18, 12);
        text('A', p.x, p.y + 4 + bob, 11, '#ffd23e', 'center');
      } else {
        ctx.fillStyle = '#f4f1e6';
        ctx.fillRect(p.x - 9, p.y - 9 + bob, 18, 18);
        ctx.fillStyle = '#e5534b';
        ctx.fillRect(p.x - 2, p.y - 6 + bob, 4, 12);
        ctx.fillRect(p.x - 6, p.y - 2 + bob, 12, 4);
      }
    }
  }

  function drawParticles(G) {
    for (const p of G.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'smoke') {
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'burst') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'tracer') {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'flash') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawWaypoint(G) {
    const obj = G.missions.objective;
    if (!obj || obj.x === null || obj.x === undefined) return;
    const pulse = 1 + Math.sin(G.elapsed * 5) * 0.12;
    ctx.save();
    ctx.translate(obj.x, obj.y);
    ctx.fillStyle = 'rgba(242,194,48,0.16)';
    ctx.fillRect(-14, -260, 28, 260);
    ctx.strokeStyle = '#f2c230';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f2c230';
    ctx.beginPath();
    ctx.moveTo(0, -18 * pulse);
    ctx.lineTo(12 * pulse, 0);
    ctx.lineTo(0, 18 * pulse);
    ctx.lineTo(-12 * pulse, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Paint one frame of the world for the given screen. */
  function draw(G, screen) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = G.shake > 0 ? (G.random() - 0.5) * G.shake : 0;
    const shakeY = G.shake > 0 ? (G.random() - 0.5) * G.shake : 0;
    const camX = G.camera.x + shakeX;
    const camY = G.camera.y + shakeY;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x - camX * view.scale, view.y - camY * view.scale);
    drawGround(G);
    drawRoads(G);
    // Skid marks lie on the asphalt, under everything else that moves.
    ctx.strokeStyle = 'rgba(20,20,20,0.4)';
    ctx.lineWidth = 4;
    for (const s of G.skids) {
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 8, s.y - Math.sin(s.angle) * 8);
      ctx.lineTo(s.x + Math.cos(s.angle) * 8, s.y + Math.sin(s.angle) * 8);
      ctx.stroke();
    }
    drawBuildings(G);
    drawSpotSigns(G);
    drawPickups(G);
    drawWaypoint(G);
    for (const car of G.cars) drawCar(G, car);
    for (const ped of G.peds) {
      drawPerson(G, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.state === 'down', false, false);
      if (ped.taxi && ped.state === 'taxi') {
        ctx.fillStyle = '#f2c230';
        ctx.beginPath();
        ctx.arc(ped.x, ped.y - 26 + Math.sin(G.elapsed * 6) * 2, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const cop of G.cops) drawPerson(G, cop.x, cop.y, cop.angle, '#2c3e6e', '#d9a06f', false, false, true);
    const player = G.player;
    if (!player.car) {
      const blink = player.invulnerable > 0 && Math.floor(G.elapsed * 12) % 2 === 0;
      if (!blink) drawPerson(G, player.x, player.y, player.angle, '#f4f1e6', '#d9a06f', false, true, false);
    }
    drawParticles(G);
    // Warm sun: a soft golden wash over the whole scene, plus a vignette.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const warm = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    warm.addColorStop(0, 'rgba(255,196,110,0.07)');
    warm.addColorStop(1, 'rgba(255,150,60,0.10)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const vig = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.45, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
