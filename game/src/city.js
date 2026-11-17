// The city of Solmar: a 2800x2800 coastal grid. Roads run on a 400 px grid,
// blocks between them hold coloured rooftops, one block is a park, one block
// holds the marina basin, and the west edge is a beach with the ocean beyond
// it. Everything is generated from the seed, so the same seed always builds
// the same city. The module also answers the questions the rest of the game
// asks about the map: is this point on a road, in the water, or inside a
// building, and where is the nearest road.

import { PALETTE, ROADS, ROAD_HALF, WORLD } from './config.js';
import { pick, range } from './random.js';

const ROOF_COLORS = ['#c96a4a', '#d08a4e', '#7d9b6a', '#5d7ea6', '#a65d6e', '#8a6fa8', '#b8a05e', '#6a8a8a', '#9c5f43', '#7a6a9c'];
const MARINA = { x: 2280, y: 2280, w: 265, h: 265 };
const PARK = { x: 1071, y: 1071, w: 258, h: 258 };

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function buildCity(random) {
  const size = WORLD.size;

  // Story spots first, so no building is ever placed on top of one.
  const spots = {
    spawn: { x: 600, y: 1960, label: 'Hideout' },
    hideout: { x: 700, y: 2000, label: 'Hideout' },
    paintShop: { x: 1060, y: 880, label: 'Sunset Auto Paint' },
    marina: { x: 2265, y: 2400, label: 'Marina' },
    bank: { x: 1900, y: 1500, label: 'Harbor Bank' },
    raceStart: { x: 1400, y: 255, label: 'Race Start' },
    taxiStand: { x: 600, y: 600, label: 'Taxi Stand' },
    park: { x: 1200, y: 1200, label: 'Palm Park' },
  };
  const keepOut = Object.values(spots).map((s) => ({ x: s.x - 70, y: s.y - 70, w: 140, h: 140 }));

  const buildings = [];
  for (let i = 0; i < ROADS.length - 1; i += 1) {
    for (let j = 0; j < ROADS.length - 1; j += 1) {
      const bx = ROADS[i] + ROAD_HALF + 16;
      const by = ROADS[j] + ROAD_HALF + 16;
      const bw = ROADS[i + 1] - ROADS[i] - 2 * (ROAD_HALF + 16);
      const bh = ROADS[j + 1] - ROADS[j] - 2 * (ROAD_HALF + 16);
      const block = { x: bx, y: by, w: bw, h: bh };
      if (rectsOverlap(block, PARK) || rectsOverlap(block, MARINA)) continue;
      const downtown = i >= 2 && i <= 3 && j >= 2 && j <= 3;
      const count = downtown ? 1 : 2 + Math.floor(random() * 3);
      for (let k = 0; k < count; k += 1) {
        const w = downtown ? range(random, 150, 200) : range(random, 70, 130);
        const h = downtown ? range(random, 150, 200) : range(random, 70, 130);
        const x = bx + 8 + random() * Math.max(1, bw - w - 16);
        const y = by + 8 + random() * Math.max(1, bh - h - 16);
        const b = { x, y, w, h, color: pick(random, ROOF_COLORS), tall: downtown && random() < 0.6, seed: random() * 100 };
        if (keepOut.some((k) => rectsOverlap(b, k))) continue;
        if (buildings.some((o) => rectsOverlap(b, { x: o.x - 14, y: o.y - 14, w: o.w + 28, h: o.h + 28 }))) continue;
        buildings.push(b);
      }
    }
  }

  const trees = [];
  for (let i = 0; i < 46; i += 1) {
    trees.push({ x: PARK.x + 14 + random() * (PARK.w - 28), y: PARK.y + 14 + random() * (PARK.h - 28), r: range(random, 9, 15) });
  }
  for (let i = 0; i < 70; i += 1) {
    const road = pick(random, ROADS);
    const along = range(random, 60, size - 60);
    const side = random() < 0.5 ? -1 : 1;
    if (random() < 0.5) trees.push({ x: road + side * (ROAD_HALF + 10), y: along, r: range(random, 7, 11) });
    else trees.push({ x: along, y: road + side * (ROAD_HALF + 10), r: range(random, 7, 11) });
  }
  for (let i = 0; i < 18; i += 1) {
    trees.push({ x: range(random, 95, 150), y: range(random, 60, size - 60), r: range(random, 8, 12), palm: true });
  }

  const boats = [];
  for (let i = 0; i < 5; i += 1) {
    boats.push({ x: MARINA.x + 30 + random() * (MARINA.w - 90), y: MARINA.y + 30 + random() * (MARINA.h - 60), angle: random() * Math.PI * 2, color: pick(random, ['#f4f1e6', '#d08a4e', '#5d7ea6']) });
  }

  const city = { size, buildings, trees, boats, spots, marina: MARINA, park: PARK };

  return {
    ...city,
    isRoad(x, y) {
      if (x < 0 || y < 0 || x > size || y > size) return false;
      for (const r of ROADS) if (Math.abs(x - r) <= ROAD_HALF || Math.abs(y - r) <= ROAD_HALF) return true;
      return false;
    },
    isWater(x, y) {
      if (x < 82) return true;
      return x > MARINA.x && x < MARINA.x + MARINA.w && y > MARINA.y && y < MARINA.y + MARINA.h;
    },
    isPark(x, y) {
      return x > PARK.x && x < PARK.x + PARK.w && y > PARK.y && y < PARK.y + PARK.h;
    },
    /** The closest point on a road centreline to (x, y). */
    nearestRoadPoint(x, y) {
      let bestV = ROADS[0];
      let bestH = ROADS[0];
      for (const r of ROADS) {
        if (Math.abs(x - r) < Math.abs(x - bestV)) bestV = r;
        if (Math.abs(y - r) < Math.abs(y - bestH)) bestH = r;
      }
      return Math.abs(x - bestV) < Math.abs(y - bestH) ? { x: bestV, y } : { x, y: bestH };
    },
    /** A random point on a road, with a random driving direction along it. */
    randomRoadPoint() {
      const road = pick(random, ROADS);
      const along = range(random, 80, size - 80);
      const vertical = random() < 0.5;
      return vertical
        ? { x: road, y: along, angle: random() < 0.5 ? 0 : Math.PI }
        : { x: along, y: road, angle: random() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
    },
    /** A random point on a sidewalk, beside a road. */
    randomSidewalkPoint() {
      const road = pick(random, ROADS);
      const along = range(random, 80, size - 80);
      const side = random() < 0.5 ? -1 : 1;
      const off = ROAD_HALF + 10;
      return random() < 0.5 ? { x: road + side * off, y: along } : { x: along, y: road + side * off };
    },
    /**
     * Push a circle of radius r out of buildings, water and the world edge.
     * Returns the corrected position and whether anything was hit.
     */
    collideCircle(x, y, r) {
      let hit = false;
      for (const b of buildings) {
        const cx = Math.max(b.x, Math.min(x, b.x + b.w));
        const cy = Math.max(b.y, Math.min(y, b.y + b.h));
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 0.01) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          y = cy + (dy / d) * r;
        } else {
          // Centre inside the building: push out along the smallest overlap.
          const left = x - b.x + r;
          const right = b.x + b.w - x + r;
          const top = y - b.y + r;
          const bottom = b.y + b.h - y + r;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = b.x - r;
          else if (m === right) x = b.x + b.w + r;
          else if (m === top) y = b.y - r;
          else y = b.y + b.h + r;
        }
      }
      // Water: the ocean and the marina basin are solid for cars and feet.
      if (x - r < 82) { x = 82 + r; hit = true; }
      if (x > MARINA.x - r && x < MARINA.x + MARINA.w + r && y > MARINA.y - r && y < MARINA.y + MARINA.h + r) {
        const left = x - (MARINA.x - r);
        const right = MARINA.x + MARINA.w + r - x;
        const top = y - (MARINA.y - r);
        const bottom = MARINA.y + MARINA.h + r - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = MARINA.x - r;
        else if (m === right) x = MARINA.x + MARINA.w + r;
        else if (m === top) y = MARINA.y - r;
        else y = MARINA.y + MARINA.h + r;
        hit = true;
      }
      if (x < r) { x = r; hit = true; }
      if (y < r) { y = r; hit = true; }
      if (x > size - r) { x = size - r; hit = true; }
      if (y > size - r) { y = size - r; hit = true; }
      return { x, y, hit };
    },
  };
}

export { PALETTE };
