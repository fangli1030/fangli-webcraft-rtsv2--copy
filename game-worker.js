// game-worker.js — All game logic runs in this Web Worker thread

const T_WATER = 0, T_PLAINS = 1, T_HIGHLAND = 2, T_MOUNTAIN = 3;
const WILD_COST = [0, 0.05, 0.1, 0.2];
const ENEMY_BASE_COST = [0, 0.3, 0.5, 0.9];
const CITY_COST = 50;
const CITY_TROOP_BONUS = 500;
const CITY_MIN_DIST = 15;
const DPOST_RANGE = 20;
const DPOST_DEFENSE_MULT = 4;
const DPOST_SPEED_PENALTY = 2;
const FARM_COST = 30;
const MINE_COST = 50;
const MILL_COST = 60;
const FACTORY_COST = 80;
const ECON_RADIUS = 12;
const MILL_RADIUS = 15;
const FARM_BASE_GOLD = 0.02;
const MINE_BASE_GOLD = 0.03;
const MILL_BOOST = 0.5;
const FACTORY_BOOST = 0.5;
const MILL_STACK_PENALTY = 0.4;
const FACTORY_STACK_PENALTY = 0.4;
const BOT_STRATEGIES = [
  null, 'aggressive', 'aggressive', 'aggressive', 'aggressive',
  'defensive', 'defensive', 'defensive', 'balanced', 'balanced', 'balanced',
  'aggressive', 'aggressive', 'defensive', 'defensive', 'balanced',
  'balanced', 'aggressive', 'defensive', 'balanced', 'aggressive',
];
const MAX_BOATS = 3;
const BOAT_TROOP_FRACTION = 0.2;
const COST_SCALE = 100;

let GRID_W, GRID_H, NUM_BOTS, CELLS_PER_TICK, EXPANSION_TICK_MS, BOT_THINK_MS;
let isSpectateMode = false;
let boatsEnabled = false;
let grid, terrain, waterMag, waterComponent, playerStates;
let totalLandTiles = 0;
let playerPlaced = false;
let tileChanges = [];
let centersSumX, centersSumY, centersN;
let cities = [];
let citySet = new Set();
let defensePosts = [];
let dpostSet = new Set();
let econBuildings = []; // {idx, owner, type:'farm'|'mine'|'mill'|'factory', claimedTiles:[], output:0}
let econBuildingSet = new Set();
let terrainClaimed = null;
let boats = [];
let destroyedDposts = []; // Uint8Array: 0=unclaimed, buildingId+1 = claimed by that building

function maxTroopsForTiles(t, cityCount) { return Math.floor(Math.pow(t, 0.6) * 12 + 150 + (cityCount || 0) * CITY_TROOP_BONUS); }

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  return (((h ^ (h >> 13)) * 1274126177) & 0x7fffffff) / 0x7fffffff;
}

function getWaterCost(mag) {
  const base = COST_SCALE;
  if (mag < 3) return base + 10 * COST_SCALE;
  if (mag <= 10) return base;
  return base + COST_SCALE;
}

function bresenhamLine(x0, y0, x1, y1) {
  const pts = [];
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (true) {
    pts.push(y * GRID_W + x);
    if (x === x1 && y === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return pts;
}

function lineOfSightClear(x0, y0, x1, y1, minMag) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (true) {
    const idx = y * GRID_W + x;
    if (terrain[idx] !== 0 || waterMag[idx] < minMag) return false;
    if (x === x1 && y === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return true;
}

function smoothPathOnce(path, minMag) {
  if (path.length < 3) return path;
  const result = [path[0]];
  let curr = 0;
  while (curr < path.length - 1) {
    let farthest = curr + 1;
    let lo = curr + 1, hi = path.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const x0 = path[curr] % GRID_W, y0 = path[curr] / GRID_W | 0;
      const x1 = path[mid] % GRID_W, y1 = path[mid] / GRID_W | 0;
      if (lineOfSightClear(x0, y0, x1, y1, minMag)) {
        farthest = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (farthest > curr + 1) {
      const x0 = path[curr] % GRID_W, y0 = path[curr] / GRID_W | 0;
      const x1 = path[farthest] % GRID_W, y1 = path[farthest] / GRID_W | 0;
      const line = bresenhamLine(x0, y0, x1, y1);
      for (let i = 1; i < line.length; i++) result.push(line[i]);
    } else {
      result.push(path[farthest]);
    }
    curr = farthest;
  }
  return result;
}

function smoothPath(path) {
  const pass1 = smoothPathOnce(path, 2);
  return smoothPathOnce(pass1, 3);
}
function smoothNoise(x, y, s) {
  const sx = x / s, sy = y / s, ix = Math.floor(sx), iy = Math.floor(sy);
  const fx = sx - ix, fy = sy - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function isPointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function calcIsBorder(idx) {
  const owner = grid[idx];
  if (owner < 0) return false;
  const x = idx % GRID_W, y = (idx / GRID_W) | 0;
  return (
    (x > 0 && grid[idx - 1] !== owner && terrain[idx - 1] > 0) ||
    (x < GRID_W - 1 && grid[idx + 1] !== owner && terrain[idx + 1] > 0) ||
    (y > 0 && grid[idx - GRID_W] !== owner && terrain[idx - GRID_W] > 0) ||
    (y < GRID_H - 1 && grid[idx + GRID_W] !== owner && terrain[idx + GRID_W] > 0)
  );
}

function updateBorders(idx) {
  const update = (i) => {
    if (i < 0 || i >= GRID_W * GRID_H) return;
    const o = grid[i]; if (o < 0) return;
    const ps = playerStates[o];
    if (calcIsBorder(i)) ps.borderTiles.add(i); else ps.borderTiles.delete(i);
  };
  const x = idx % GRID_W, y = (idx / GRID_W) | 0;
  update(idx);
  if (x > 0) update(idx - 1);
  if (x < GRID_W - 1) update(idx + 1);
  if (y > 0) update(idx - GRID_W);
  if (y < GRID_H - 1) update(idx + GRID_W);
}

function conquer(newOwner, idx) {
  const oldOwner = grid[idx];
  const x = idx % GRID_W, y = (idx / GRID_W) | 0;
  if (oldOwner >= 0) {
    playerStates[oldOwner].cellCount--;
    playerStates[oldOwner].borderTiles.delete(idx);
    centersSumX[oldOwner] -= x; centersSumY[oldOwner] -= y; centersN[oldOwner]--;

    if (playerStates[oldOwner].cellCount <= 0 && playerStates[oldOwner].alive) {
      const stolen = playerStates[oldOwner].gold;
      playerStates[newOwner].gold += stolen;
      playerStates[oldOwner].gold = 0;
    }
  }
  grid[idx] = newOwner;
  playerStates[newOwner].cellCount++;
  centersSumX[newOwner] += x; centersSumY[newOwner] += y; centersN[newOwner]++;
  updateBorders(idx);
  tileChanges.push(idx, newOwner);
  if (citySet.has(idx)) {
    const city = cities.find(c => c.idx === idx);
    if (city) {
      if (oldOwner >= 0) playerStates[oldOwner].cityCount--;
      city.owner = newOwner;
      playerStates[newOwner].cityCount++;
    }
  }
  if (dpostSet.has(idx)) {
    const dpIdx = defensePosts.findIndex(d => d.idx === idx);
    if (dpIdx >= 0) {
      const dp = defensePosts[dpIdx];
      if (oldOwner >= 0) playerStates[oldOwner].dpostCount--;
      destroyedDposts.push({ idx, owner: oldOwner });
      defensePosts.splice(dpIdx, 1);
      dpostSet.delete(idx);
    }
  }
  if (econBuildingSet.has(idx)) {
    const eb = econBuildings.find(b => b.idx === idx);
    if (eb) { eb.owner = newOwner; }
  }
}

function processExpansions() {
  for (let i = 0; i < playerStates.length; i++) {
    const ps = playerStates[i];
    if (!ps.alive) { ps.attacks = []; ps.expanding = false; ps.attackTarget = null; ps.attackTroops = 0; continue; }
    if (ps.borderTiles.size === 0) { ps.attacks = []; ps.expanding = false; ps.attackTarget = null; ps.attackTroops = 0; continue; }

    for (let ai = ps.attacks.length - 1; ai >= 0; ai--) {
      const atk = ps.attacks[ai];
      if (atk.troops < 1) { ps.attacks.splice(ai, 1); continue; }
      // If target died, return troops to player
      if (atk.target >= 0 && atk.target < playerStates.length && !playerStates[atk.target].alive) {
        ps.troops += atk.troops; ps.attacks.splice(ai, 1); continue;
      }

      const target = atk.target;
      let captured = 0;
      let capturebudget = target === -1 ? CELLS_PER_TICK * 3 : CELLS_PER_TICK;
      // Each attack gets a slice of the budget proportional to attack count
      capturebudget = Math.max(1, Math.floor(capturebudget / Math.max(1, ps.attacks.length)));

      const skip = (Math.random() * ps.borderTiles.size) | 0;
      let sc = 0;
      for (const fIdx of ps.borderTiles) {
        if (captured >= capturebudget || atk.troops < 1) break;
        if (sc++ < skip) continue;
        const fx = fIdx % GRID_W, fy = (fIdx / GRID_W) | 0;
        const r = (Math.random() * 4) | 0;
        const ox = [[-1,0],[1,0],[0,-1],[0,1]];
        for (let d = 0; d < 4; d++) {
          const [dx, dy] = ox[(r + d) & 3];
          const nx = fx + dx, ny = fy + dy;
          if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
          const nIdx = ny * GRID_W + nx;
          if (grid[nIdx] !== target || terrain[nIdx] === 0) continue;
          const ter = terrain[nIdx];
          let cost;
          if (target === -1) { cost = isSpectateMode ? WILD_COST[ter] * 0.1 : WILD_COST[ter]; }
          else {
            const defPs = playerStates[target];
            const ratio = Math.min(2, Math.max(0.6, defPs.troops / Math.max(1, ps.troops + atk.troops)));
            cost = ENEMY_BASE_COST[ter] * ratio;
            if (isTileDefended(nIdx, target)) { cost *= DPOST_DEFENSE_MULT; capturebudget -= (DPOST_SPEED_PENALTY - 1); }
            if (defPs.cellCount > 0) defPs.troops = Math.max(0, defPs.troops - defPs.troops / defPs.cellCount);
          }
          if (atk.troops >= cost) { atk.troops -= cost; conquer(i, nIdx); captured++; }
          break;
        }
      }
      if (atk.troops < 1) ps.attacks.splice(ai, 1);
    }

    // Sync legacy fields (used by bots and UI for backward compat)
    if (ps.attacks.length > 0) {
      ps.expanding = true;
      ps.attackTarget = ps.attacks[0].target;
      ps.attackTroops = ps.attacks.reduce((s, a) => s + a.troops, 0);
    } else {
      ps.expanding = false;
      ps.attackTarget = null;
      ps.attackTroops = 0;
    }
  }
}

function processBeachheads() {
  const BEACHHEAD_RANGE = 40;
  for (let i = 0; i < playerStates.length; i++) {
    const ps = playerStates[i];
    if (!ps.alive) continue;
    for (let b = ps.beachheads.length - 1; b >= 0; b--) {
      const bh = ps.beachheads[b];
      if (bh.troops < 1) { ps.beachheads.splice(b, 1); continue; }

      if (bh.target >= 0 && bh.target < playerStates.length && !playerStates[bh.target].alive) {
        ps.troops += bh.troops;
        ps.beachheads.splice(b, 1);
        continue;
      }

      const lx = bh.landingIdx % GRID_W, ly = (bh.landingIdx / GRID_W) | 0;
      const activeFront = new Set();
      for (const idx of ps.borderTiles) {
        const x = idx % GRID_W, y = (idx / GRID_W) | 0;
        if (Math.abs(x - lx) + Math.abs(y - ly) > BEACHHEAD_RANGE) continue;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
          const ni = ny * GRID_W + nx;
          if (grid[ni] === bh.target && terrain[ni] > 0) { activeFront.add(idx); break; }
        }
      }

      if (activeFront.size === 0) {
        ps.troops += bh.troops;
        ps.beachheads.splice(b, 1);
        continue;
      }

      let captured = 0;
      const budget = Math.max(3, Math.floor(CELLS_PER_TICK / 2));
      for (const fIdx of activeFront) {
        if (captured >= budget || bh.troops < 1) break;
        const fx = fIdx % GRID_W, fy = (fIdx / GRID_W) | 0;
        const r = (Math.random() * 4) | 0;
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (let d = 0; d < 4; d++) {
          const [dx, dy] = dirs[(r + d) & 3];
          const nx = fx + dx, ny = fy + dy;
          if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
          const nIdx = ny * GRID_W + nx;
          if (grid[nIdx] !== bh.target || terrain[nIdx] === 0) continue;
          const ter = terrain[nIdx];
          let cost;
          if (bh.target === -1) {
            cost = isSpectateMode ? WILD_COST[ter] * 0.1 : WILD_COST[ter];
          } else {
            const defPs = playerStates[bh.target];
            const ratio = Math.min(2, Math.max(0.6, defPs.troops / Math.max(1, ps.troops + bh.troops)));
            cost = ENEMY_BASE_COST[ter] * ratio;
            if (isTileDefended(nIdx, bh.target)) cost *= DPOST_DEFENSE_MULT;
            if (defPs.cellCount > 0) defPs.troops = Math.max(0, defPs.troops - defPs.troops / defPs.cellCount);
          }
          if (bh.troops >= cost) { bh.troops -= cost; conquer(i, nIdx); captured++; }
          break;
        }
      }
      if (bh.troops < 1) ps.beachheads.splice(b, 1);
    }
  }
}

function generateTroops(dt) {
  const ticks = dt / 100;
  const econ = getEconGoldPerTick();
  lastEconBreakdown = econ;
  for (let i = 0; i < playerStates.length; i++) {
    const ps = playerStates[i];
    if (!ps.alive || ps.cellCount === 0) continue;
    let max = maxTroopsForTiles(ps.cellCount, ps.cityCount);
    if (ps.isBot) max = Math.floor(max * (isSpectateMode ? 1.0 : 0.7));
    if (ps.troops >= max) { ps.troops = max; continue; }
    let toAdd = (3.25 + Math.pow(Math.max(0, ps.troops), 0.65) / 3.7) * (1 - ps.troops / max) * ticks;
    if (ps.isBot && !isSpectateMode) toAdd *= 0.8;
    if (isSpectateMode) toAdd *= 3;
    ps.troops = Math.min(ps.troops + toAdd, max);
    let goldRate = (0.008 + ps.cellCount * 0.00004) + econ.total[i];
    if (isSpectateMode) goldRate *= 5;
    ps.gold += goldRate * ticks;
  }
}

function checkElimination() {
  let go = false, w = null;
  for (let i = 0; i < playerStates.length; i++) {
    const ps = playerStates[i];
    if (ps.alive && ps.cellCount <= 0) { ps.alive = false; ps.expanding = false; ps.attackTarget = null; }
  }
  if (isSpectateMode) {
    if (playerStates.filter(ps => ps.alive).length <= 1) go = true;
  } else {
    if (!playerPlaced) return { gameOver: false, winner: null };
    if (!playerStates[0].alive && playerStates[0].cellCount <= 0) go = true;
    else if (playerStates[0].alive && totalLandTiles > 0 && playerStates[0].cellCount / totalLandTiles >= 0.8) { go = true; w = 0; }
    else if (playerStates.filter(ps => ps.alive).length <= 1) { go = true; w = playerStates[0].alive ? 0 : null; }
  }
  return { gameOver: go, winner: w };
}

function canPlaceCity(idx) {
  if (terrain[idx] === 0 || grid[idx] < 0) return false;
  if (citySet.has(idx)) return false;
  const x = idx % GRID_W, y = (idx / GRID_W) | 0;
  for (const c of cities) {
    const cx = c.idx % GRID_W, cy = (c.idx / GRID_W) | 0;
    if (Math.abs(x - cx) + Math.abs(y - cy) < CITY_MIN_DIST) return false;
  }
  return true;
}

function cityCost(cityCount) { return Math.min(500, CITY_COST * Math.pow(2, cityCount)); }

function placeCity(owner, idx) {
  const ps = playerStates[owner];
  const cost = cityCost(ps.cityCount);
  if (ps.gold < cost || !canPlaceCity(idx)) return false;
  if (grid[idx] !== owner) return false;
  ps.gold -= cost;
  ps.cityCount++;
  cities.push({ idx, owner });
  citySet.add(idx);
  return true;
}

function tryPlaceCity(owner) {
  const ps = playerStates[owner];
  const tiles = [];
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++) {
      const idx = y * GRID_W + x;
      if (grid[idx] === owner && !ps.borderTiles.has(idx) && canPlaceCity(idx)) tiles.push(idx);
    }
  if (tiles.length === 0) return;
  placeCity(owner, tiles[(Math.random() * tiles.length) | 0]);
}

function isTileDefended(idx, owner) {
  const tx = idx % GRID_W, ty = (idx / GRID_W) | 0;
  for (const dp of defensePosts) {
    if (dp.owner !== owner) continue;
    const dx = dp.idx % GRID_W, dy = (dp.idx / GRID_W) | 0;
    if (Math.abs(tx - dx) + Math.abs(ty - dy) <= DPOST_RANGE) return true;
  }
  return false;
}

function dpostCost(count) { return Math.min(150, 25 + count * 25); }

function placeDefensePost(owner, idx) {
  const ps = playerStates[owner];
  const cost = dpostCost(ps.dpostCount);
  if (ps.gold < cost) return false;
  if (terrain[idx] === 0 || grid[idx] !== owner) return false;
  if (dpostSet.has(idx) || citySet.has(idx)) return false;
  ps.gold -= cost;
  ps.dpostCount++;
  defensePosts.push({ idx, owner });
  dpostSet.add(idx);
  return true;
}

function tryPlaceDefensePost(owner) {
  const ps = playerStates[owner];
  const candidates = [];
  for (const idx of ps.borderTiles) {
    if (dpostSet.has(idx) || citySet.has(idx)) continue;
    if (terrain[idx] === 0) continue;
    candidates.push(idx);
  }
  if (candidates.length === 0) return;
  placeDefensePost(owner, candidates[(Math.random() * candidates.length) | 0]);
}

// --- Economy Buildings ---

function tilesInRadius(cx, cy, radius) {
  const result = [];
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      result.push(ny * GRID_W + nx);
    }
  }
  return result;
}

function placeEconBuilding(owner, idx, type) {
  const ps = playerStates[owner];
  const costs = { farm: FARM_COST, mine: MINE_COST, mill: MILL_COST, factory: FACTORY_COST };
  const cost = costs[type];
  if (!cost || ps.gold < cost) return false;
  if (terrain[idx] === 0 || grid[idx] !== owner) return false;
  if (econBuildingSet.has(idx) || citySet.has(idx) || dpostSet.has(idx)) return false;

  ps.gold -= cost;
  const bx = idx % GRID_W, by = (idx / GRID_W) | 0;
  const building = { idx, owner, type, claimedTiles: [], output: 0, id: econBuildings.length };

  if (type === 'farm' || type === 'mine') {
    const targetTerrain = type === 'farm' ? T_PLAINS : T_MOUNTAIN;
    const tiles = tilesInRadius(bx, by, ECON_RADIUS);
    for (const t of tiles) {
      if (terrain[t] === targetTerrain && terrainClaimed[t] === 0) {
        terrainClaimed[t] = building.id + 1;
        building.claimedTiles.push(t);
      }
    }
    const baseGold = type === 'farm' ? FARM_BASE_GOLD : MINE_BASE_GOLD;
    building.output = baseGold * building.claimedTiles.length;
  }

  econBuildings.push(building);
  econBuildingSet.add(idx);
  recalcProcessors();
  return true;
}

function recalcProcessors() {
  for (const b of econBuildings) {
    if (b.type !== 'mill' && b.type !== 'factory') continue;
    const bx = b.idx % GRID_W, by = (b.idx / GRID_W) | 0;
    const targetType = b.type === 'mill' ? 'farm' : 'mine';
    const tiles = tilesInRadius(bx, by, MILL_RADIUS);
    const tileSet = new Set(tiles);

    let connectedCount = 0;
    for (const other of econBuildings) {
      if (other.type === targetType && tileSet.has(other.idx)) connectedCount++;
    }

    // Count other mills/factories in range for stacking penalty
    let stackCount = 0;
    for (const other of econBuildings) {
      if (other.type === b.type && other.idx !== b.idx && tileSet.has(other.idx)) stackCount++;
    }

    const boost = b.type === 'mill' ? MILL_BOOST : FACTORY_BOOST;
    const penalty = b.type === 'mill' ? MILL_STACK_PENALTY : FACTORY_STACK_PENALTY;
    const stackMult = Math.max(0.1, 1 - stackCount * penalty);
    b.connectedCount = connectedCount;
    b.stackMult = stackMult;
    b.output = 0; // processors don't produce directly, they boost
  }
}

function getEconGoldPerTick() {
  // Calculate gold per tick from all economy buildings
  // First: base outputs from farms/mines
  const buildingOutputs = new Map();
  for (const b of econBuildings) {
    if (b.type === 'farm' || b.type === 'mine') {
      buildingOutputs.set(b.id, b.output);
    }
  }

  // Then: mills/factories boost connected farms/mines
  for (const b of econBuildings) {
    if (b.type !== 'mill' && b.type !== 'factory') continue;
    const bx = b.idx % GRID_W, by = (b.idx / GRID_W) | 0;
    const targetType = b.type === 'mill' ? 'farm' : 'mine';
    const tiles = tilesInRadius(bx, by, MILL_RADIUS);
    const tileSet = new Set(tiles);

    const boost = (b.type === 'mill' ? MILL_BOOST : FACTORY_BOOST) * b.stackMult;
    for (const other of econBuildings) {
      if (other.type === targetType && tileSet.has(other.idx)) {
        const cur = buildingOutputs.get(other.id) || other.output;
        buildingOutputs.set(other.id, cur * (1 + boost));
      }
    }
  }

  // Sum per owner, tracking farm vs mine separately
  const goldPerOwner = new Float64Array(playerStates.length);
  const farmGoldPerOwner = new Float64Array(playerStates.length);
  const mineGoldPerOwner = new Float64Array(playerStates.length);
  for (const b of econBuildings) {
    if (b.type === 'farm' || b.type === 'mine') {
      const val = buildingOutputs.get(b.id) || b.output;
      goldPerOwner[b.owner] += val;
      if (b.type === 'farm') farmGoldPerOwner[b.owner] += val;
      else mineGoldPerOwner[b.owner] += val;
    }
  }
  return { total: goldPerOwner, farms: farmGoldPerOwner, mines: mineGoldPerOwner };
}

function queryBuildingPreview(type, idx) {
  const bx = idx % GRID_W, by = (idx / GRID_W) | 0;
  if (type === 'farm' || type === 'mine') {
    const targetTerrain = type === 'farm' ? T_PLAINS : T_MOUNTAIN;
    const tiles = tilesInRadius(bx, by, ECON_RADIUS);
    const claimable = [], claimed = [];
    for (const t of tiles) {
      if (terrain[t] !== targetTerrain) continue;
      if (terrainClaimed[t] === 0) claimable.push(t);
      else claimed.push(t);
    }
    // Find processors (mills/factories) that would connect to this building
    const processorType = type === 'farm' ? 'mill' : 'factory';
    const connectedProcessors = [];
    for (const b of econBuildings) {
      if (b.type !== processorType) continue;
      const pbx = b.idx % GRID_W, pby = (b.idx / GRID_W) | 0;
      const dist2 = (bx - pbx) * (bx - pbx) + (by - pby) * (by - pby);
      if (dist2 <= MILL_RADIUS * MILL_RADIUS) connectedProcessors.push(b.idx);
    }
    return { type, radius: ECON_RADIUS, claimable, claimed, connectedProcessors, totalRadius: tiles.length };
  } else {
    const targetType = type === 'mill' ? 'farm' : 'mine';
    const tiles = tilesInRadius(bx, by, MILL_RADIUS);
    const tileSet = new Set(tiles);
    const connected = [];
    let stackCount = 0;
    for (const b of econBuildings) {
      if (b.type === targetType && tileSet.has(b.idx)) connected.push(b.idx);
      if (b.type === type && b.idx !== idx && tileSet.has(b.idx)) stackCount++;
    }
    return { type, radius: MILL_RADIUS, connected, stackCount, totalRadius: tiles.length };
  }
}

function queryBuildingInspect(buildingIdx) {
  const b = econBuildings.find(eb => eb.idx === buildingIdx);
  if (!b) return null;

  // Build the full production chain regardless of which building was hovered
  const chain = { type: b.type, idx: b.idx, radius: b.type === 'mill' || b.type === 'factory' ? MILL_RADIUS : ECON_RADIUS,
    producers: [], processors: [], allClaimedTiles: [] };

  if (b.type === 'farm' || b.type === 'mine') {
    // This is a producer — find connected processors, then find all producers connected to those processors
    chain.producers.push({ idx: b.idx, claimedTiles: b.claimedTiles, output: b.output });
    chain.allClaimedTiles.push(...b.claimedTiles);

    const processorType = b.type === 'farm' ? 'mill' : 'factory';
    for (const proc of econBuildings) {
      if (proc.type !== processorType) continue;
      const px = proc.idx % GRID_W, py = (proc.idx / GRID_W) | 0;
      const bx = b.idx % GRID_W, by = (b.idx / GRID_W) | 0;
      if ((px - bx) * (px - bx) + (py - by) * (py - by) > MILL_RADIUS * MILL_RADIUS) continue;

      chain.processors.push({ idx: proc.idx, radius: MILL_RADIUS, stackMult: proc.stackMult });

      // Find all other producers connected to this processor
      const ptiles = tilesInRadius(px, py, MILL_RADIUS);
      const ptileSet = new Set(ptiles);
      for (const other of econBuildings) {
        if (other.type === b.type && other.idx !== b.idx && ptileSet.has(other.idx)) {
          if (!chain.producers.find(p => p.idx === other.idx)) {
            chain.producers.push({ idx: other.idx, claimedTiles: other.claimedTiles, output: other.output });
            chain.allClaimedTiles.push(...other.claimedTiles);
          }
        }
      }
    }
  } else {
    // This is a processor — find all connected producers
    chain.processors.push({ idx: b.idx, radius: MILL_RADIUS, stackMult: b.stackMult });
    const targetType = b.type === 'mill' ? 'farm' : 'mine';
    const bx = b.idx % GRID_W, by = (b.idx / GRID_W) | 0;
    const tiles = tilesInRadius(bx, by, MILL_RADIUS);
    const tileSet = new Set(tiles);
    for (const other of econBuildings) {
      if (other.type === targetType && tileSet.has(other.idx)) {
        chain.producers.push({ idx: other.idx, claimedTiles: other.claimedTiles, output: other.output });
        chain.allClaimedTiles.push(...other.claimedTiles);
      }
    }
  }

  return chain;
}

// --- Boats ---

function findBoatEndpoints(owner, targetGx, targetGy) {
  const targetIdx = targetGy * GRID_W + targetGx;
  const targetOwner = grid[targetIdx];

  // Step 1 — Collect player shore tiles:
  const ownerShores = [];
  for (const idx of playerStates[owner].borderTiles) {
    const x = idx % GRID_W, y = (idx / GRID_W) | 0;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H && terrain[ny * GRID_W + nx] === 0) {
        ownerShores.push(idx);
        break;
      }
    }
  }
  if (ownerShores.length === 0) return null;

  // Step 2 — Multi-source Dijkstra from player shores (cost-based, not hop count):
  const waterDist = new Map();  // waterIdx -> cost from nearest shore
  const waterSrc = new Map();   // waterIdx -> source shore idx
  const open = [];
  
  function dHeapPush(item) {
    open.push(item);
    let i = open.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (open[p].cost <= open[i].cost) break;
      [open[p], open[i]] = [open[i], open[p]];
      i = p;
    }
  }
  
  function dHeapPop() {
    if (open.length === 0) return null;
    const top = open[0];
    const last = open.pop();
    if (open.length > 0) {
      open[0] = last;
      let i = 0;
      while (true) {
        const l = i * 2 + 1, r = l + 1;
        let smallest = i;
        if (l < open.length && open[l].cost < open[smallest].cost) smallest = l;
        if (r < open.length && open[r].cost < open[smallest].cost) smallest = r;
        if (smallest === i) break;
        [open[i], open[smallest]] = [open[smallest], open[i]];
        i = smallest;
      }
    }
    return top;
  }

  // Seed with best connectivity water neighbor of each shore
  for (const shoreIdx of ownerShores) {
    const sx = shoreIdx % GRID_W, sy = (shoreIdx / GRID_W) | 0;
    let bestNi = -1, bestConn = -1;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = sx + dx, ny = sy + dy;
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      const ni = ny * GRID_W + nx;
      if (terrain[ni] !== 0) continue;
      let conn = 0;
      for (const [dx2, dy2] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx2 = nx + dx2, ny2 = ny + dy2;
        if (nx2 < 0 || nx2 >= GRID_W || ny2 < 0 || ny2 >= GRID_H) continue;
        if (terrain[ny2 * GRID_W + nx2] === 0) conn++;
      }
      if (conn > bestConn) { bestConn = conn; bestNi = ni; }
    }
    if (bestNi !== -1 && !waterDist.has(bestNi)) {
      waterDist.set(bestNi, 0);
      waterSrc.set(bestNi, shoreIdx);
      dHeapPush({ idx: bestNi, cost: 0, src: shoreIdx });
    }
  }

  while (open.length > 0) {
    const curr = dHeapPop();
    if (!curr) break;
    const cidx = curr.idx, cCost = curr.cost, cSrc = curr.src;
    if (waterDist.get(cidx) < cCost) continue;
    
    const cx = cidx % GRID_W, cy = cidx / GRID_W | 0;
    for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      const ni = ny * GRID_W + nx;
      if (terrain[ni] !== 0) continue;
      const stepCost = getWaterCost(waterMag[ni]);
      const nCost = cCost + stepCost;
      const oldCost = waterDist.get(ni);
      if (oldCost !== undefined && nCost >= oldCost) continue;
      waterDist.set(ni, nCost);
      waterSrc.set(ni, cSrc);
      dHeapPush({ idx: ni, cost: nCost, src: cSrc });
    }
  }

  // Step 3 — Land BFS from target to find destination shore candidates:
  // Restrict to the target's land (targetOwner or wilderness) to land on correct coast
  const visited = new Set([targetIdx]);
  const landQueue = [targetIdx];
  let lhead = 0;
  let bestDest = -1, bestSrc = -1, bestDist = Infinity;
  while (lhead < landQueue.length && lhead < 5000) {
    const curr = landQueue[lhead++];
    const cx = curr % GRID_W, cy = (curr / GRID_W) | 0;
    for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = cx + ddx, ny = cy + ddy;
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      const ni = ny * GRID_W + nx;
      if (visited.has(ni)) continue;
      visited.add(ni);
      if (terrain[ni] === 0) {
        // Only consider shore if the land tile is owned by target or is wilderness
        if (grid[curr] !== targetOwner && grid[curr] !== -1) continue;
        const wd = waterDist.get(ni);
        if (wd !== undefined && wd < bestDist) {
          bestDist = wd;
          bestDest = curr;
          bestSrc = waterSrc.get(ni);
        }
        continue;
      }
      // Only walk through target-owned or wilderness land
      if (grid[ni] !== targetOwner && grid[ni] !== -1) continue;
      landQueue.push(ni);
    }
  }

  // Step 4 — Return result:
  if (bestDest < 0 || bestSrc < 0) return null;
  if (bestDest === bestSrc) return null;
  return { srcShore: bestSrc, destShore: bestDest };
}



function getWaterCost(mag) {
  const base = COST_SCALE;
  if (mag < 3) return base + 10 * COST_SCALE;
  if (mag <= 10) return base;
  return base + COST_SCALE;
}

function findWaterPath(srcIdx, dstIdx) {
  const sx = srcIdx % GRID_W, sy = (srcIdx / GRID_W) | 0;
  const dx = dstIdx % GRID_W, dy = (dstIdx / GRID_W) | 0;

  // Pick best water neighbor by connectivity (shore coercion)
  let bestStart = -1, bestStartConn = -1;
  for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nx = sx + ox, ny = sy + oy;
    if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
    const ni = ny * GRID_W + nx;
    if (terrain[ni] !== 0) continue;
    let conn = 0;
    for (const [dx2, dy2] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx2 = nx + dx2, ny2 = ny + dy2;
      if (nx2 < 0 || nx2 >= GRID_W || ny2 < 0 || ny2 >= GRID_H) continue;
      if (terrain[ny2 * GRID_W + nx2] === 0) conn++;
    }
    if (conn > bestStartConn || (conn === bestStartConn && bestStart === -1)) {
      bestStartConn = conn;
      bestStart = ni;
    }
  }
  if (bestStart === -1) return null;

  let bestEnd = -1, bestEndConn = -1;
  for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nx = dx + ox, ny = dy + oy;
    if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
    const ni = ny * GRID_W + nx;
    if (terrain[ni] !== 0) continue;
    let conn = 0;
    for (const [dx2, dy2] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx2 = nx + dx2, ny2 = ny + dy2;
      if (nx2 < 0 || nx2 >= GRID_W || ny2 < 0 || ny2 >= GRID_H) continue;
      if (terrain[ny2 * GRID_W + nx2] === 0) conn++;
    }
    if (conn > bestEndConn || (conn === bestEndConn && bestEnd === -1)) {
      bestEndConn = conn;
      bestEnd = ni;
    }
  }
  if (bestEnd === -1) return null;

  // Quick connectivity check using precomputed components
  if (waterComponent[bestStart] !== waterComponent[bestEnd]) return null;

  // A* search
  const ex = bestEnd % GRID_W, ey = bestEnd / GRID_W | 0;
  const dxGoal = ex - (bestStart % GRID_W), dyGoal = ey - (bestStart / GRID_W | 0);
  const crossNorm = Math.max(1, Math.abs(dxGoal) + Math.abs(dyGoal));

  const open = [];
  const gScore = new Map();
  const fScore = new Map();
  const parent = new Map();
  const closed = new Set();

  function heapPush(item) {
    open.push(item);
    let i = open.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (open[p].f <= open[i].f) break;
      [open[p], open[i]] = [open[i], open[p]];
      i = p;
    }
  }

  function heapPop() {
    if (open.length === 0) return null;
    const top = open[0];
    const last = open.pop();
    if (open.length > 0) {
      open[0] = last;
      let i = 0;
      while (true) {
        const l = i * 2 + 1, r = l + 1;
        let smallest = i;
        if (l < open.length && open[l].f < open[smallest].f) smallest = l;
        if (r < open.length && open[r].f < open[smallest].f) smallest = r;
        if (smallest === i) break;
        [open[i], open[smallest]] = [open[smallest], open[i]];
        i = smallest;
      }
    }
    return top;
  }

  gScore.set(bestStart, 0);
  const h0 = 5 * COST_SCALE * (Math.abs((bestStart % GRID_W) - ex) + Math.abs((bestStart / GRID_W | 0) - ey));
  fScore.set(bestStart, h0);
  parent.set(bestStart, srcIdx);
  heapPush({ idx: bestStart, f: h0 });

  let iters = 0;
  while (open.length > 0 && iters < 150000) {
    iters++;
    const curr = heapPop();
    if (!curr) break;
    const cidx = curr.idx;
    if (closed.has(cidx)) continue;
    closed.add(cidx);

    if (cidx === bestEnd) {
      const path = [dstIdx];
      let c = cidx;
      while (c !== srcIdx) { path.push(c); c = parent.get(c); }
      path.push(srcIdx);
      return smoothPath(path.reverse());
    }

    const cx = cidx % GRID_W, cy = cidx / GRID_W | 0;
    const g = gScore.get(cidx) || 0;

    for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      const ni = ny * GRID_W + nx;
      if (terrain[ni] !== 0) continue;
      if (closed.has(ni)) continue;

      const mag = waterMag[ni];
      const stepCost = getWaterCost(mag);
      const tg = g + stepCost;
      const oldG = gScore.get(ni);
      if (oldG !== undefined && tg >= oldG) continue;

      const h = 5 * COST_SCALE * (Math.abs(nx - ex) + Math.abs(ny - ey));
      const cross = Math.abs(dxGoal * (ny - ey) - dyGoal * (nx - ex));
      const tie = Math.floor(cross * 99 / (crossNorm * crossNorm));
      const f = tg + h + tie;

      gScore.set(ni, tg);
      fScore.set(ni, f);
      parent.set(ni, cidx);
      heapPush({ idx: ni, f });
    }
  }
  return null;
}

function launchBoat(owner, targetGx, targetGy) {
  const ps = playerStates[owner];
  if (!ps.alive || ps.troops < 5) return null;
  if (boats.filter(b => b.owner === owner).length >= MAX_BOATS) return null;
  if (terrain[targetGy * GRID_W + targetGx] === 0) return null;

  const endpoints = findBoatEndpoints(owner, targetGx, targetGy);
  if (!endpoints) return null;

  const path = findWaterPath(endpoints.srcShore, endpoints.destShore);
  if (!path || path.length < 3) return null;

  const send = Math.max(1, Math.floor(ps.troops * BOAT_TROOP_FRACTION));
  ps.troops -= send;
  boats.push({ owner, troops: send, path, pathIdx: 0, targetIdx: endpoints.destShore, retreating: false });
  return true;
}

function processBoats() {
  for (let i = boats.length - 1; i >= 0; i--) {
    const boat = boats[i];
    if (!playerStates[boat.owner].alive) { boats.splice(i, 1); continue; }

    boat.pathIdx += 1;
    if (boat.pathIdx >= boat.path.length - 1) {
      if (boat.retreating) {
        const ps = playerStates[boat.owner];
        ps.troops += Math.floor(boat.troops * 0.75);
        boats.splice(i, 1);
      } else {
        const destIdx = boat.path[boat.path.length - 1];
        if (terrain[destIdx] > 0) {
          const destOwner = grid[destIdx];
          if (destOwner !== boat.owner) {
            if (destOwner >= 0) {
              const defPs = playerStates[destOwner];
              if (defPs.cellCount > 0) defPs.troops = Math.max(0, defPs.troops - defPs.troops / defPs.cellCount);
            }
            conquer(boat.owner, destIdx);
          }
          // Conquer additional tiles around landing point to create a foothold
          const toCheck = [destIdx];
          const checked = new Set([destIdx]);
          let conquered = 0;
          const MAX_EXTRA = 8;
          let checkHead = 0;
          while (checkHead < toCheck.length && conquered < MAX_EXTRA) {
            const curr = toCheck[checkHead++];
            const cx = curr % GRID_W, cy = (curr / GRID_W) | 0;
            for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              const nx = cx + dx, ny = cy + dy;
              if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
              const ni = ny * GRID_W + nx;
              if (checked.has(ni)) continue;
              checked.add(ni);
              if (terrain[ni] === 0) continue;
              const tileOwner = grid[ni];
              if (tileOwner === boat.owner) continue;
              const cost = tileOwner >= 0 ? ENEMY_BASE_COST[terrain[ni]] : WILD_COST[terrain[ni]];
              if (boat.troops < cost) continue;
              conquer(boat.owner, ni);
              boat.troops -= cost;
              conquered++;
              toCheck.push(ni);
              if (conquered >= MAX_EXTRA) break;
            }
          }
          // Spawn a beachhead attack from the landing tile
          const ps = playerStates[boat.owner];
          const target = destOwner >= 0 && destOwner !== boat.owner ? destOwner : -1;
          ps.beachheads.push({ landingIdx: destIdx, troops: boat.troops, target: target });
        }
        boats.splice(i, 1);
      }
    }
  }
}

function botThinkAllAt(now) {
  const bordered = Array.from({ length: playerStates.length }, () => new Set());
  let needsBorders = false;
  const startIdx = isSpectateMode ? 0 : 1;
  for (let i = startIdx; i <= NUM_BOTS; i++) {
    const ps = playerStates[i];
    if (ps.alive && now >= ps.nextAttackTick) needsBorders = true;
  }
  if (!needsBorders) return;

  for (let i = 0; i < playerStates.length; i++) {
    const ps = playerStates[i]; if (!ps.alive) continue;
    for (const idx of ps.borderTiles) {
      const x = idx % GRID_W, y = (idx / GRID_W) | 0;
      for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
        const no = grid[ny * GRID_W + nx];
        if (no !== i && terrain[ny * GRID_W + nx] > 0) bordered[i].add(no);
      }
    }
  }
  for (let i = startIdx; i <= NUM_BOTS; i++) {
    if (now >= playerStates[i].nextAttackTick) botThinkSingle(i, bordered[i], now);
  }
}

function botThinkAll() {
  botThinkAllAt(performance.now());
}

function botThinkSingle(id, borders, now) {
  const ps = playerStates[id]; if (!ps.alive) return;
  ps.nextAttackTick = now + ps.attackCooldown;

  let max = maxTroopsForTiles(ps.cellCount, ps.cityCount);
  max = Math.floor(max * 0.7);

  if (ps.gold >= cityCost(ps.cityCount) && ps.cellCount > (isSpectateMode ? 20 : 50)) tryPlaceCity(id);
  const dpCost = dpostCost(ps.dpostCount);
  if (ps.gold >= dpCost && ps.cellCount > (isSpectateMode ? 15 : 30) && Math.random() < (isSpectateMode ? 0.6 : 0.3)) tryPlaceDefensePost(id);

  // If already attacking, check if we should stop
  if (ps.expanding && ps.attackTarget !== null) {
    if (ps.attackTroops < 1 || !borders.has(ps.attackTarget)) {
      ps.troops += ps.attackTroops; ps.attackTroops = 0;
      ps.expanding = false; ps.attackTarget = null;
    }
    if (ps.attackTarget !== null && ps.attackTarget >= 0 && ps.attackTarget < playerStates.length && !playerStates[ps.attackTarget].alive) {
      ps.troops += ps.attackTroops; ps.attackTroops = 0;
      ps.expanding = false; ps.attackTarget = null;
    }
    return;
  }

  const hasWild = borders.has(-1);

  if (isSpectateMode) {
    const enemies = [...borders]
      .filter(o => o >= 0 && o < playerStates.length && playerStates[o].alive)
      .sort((a, b) => playerStates[a].troops - playerStates[b].troops);

    // Always try to attack a neighbor
    if (enemies.length > 0 && ps.troops > max * 0.05) {
      const target = Math.random() < 0.4 && enemies.length > 1
        ? enemies[Math.floor(Math.random() * enemies.length)]
        : enemies[0];
      botSetAttack(ps, target, Math.max(1, Math.floor(ps.troops * 0.85)));
      return;
    }

    // Expand into wilderness with everything
    if (hasWild && ps.troops > 1) {
      botSetAttack(ps, -1, Math.floor(ps.troops * 0.9));
    }
    return;
  }

  // Normal gameplay bot logic below
  if (hasWild && ps.troops > max * 0.1) {
    const wildRatio = 0.08;
    const send = Math.floor(ps.troops * wildRatio);
    if (send >= 1) {
      botSetAttack(ps, -1, send);
      return;
    }
  }

  // 2. THRESHOLD GATE — only attack players when troops are high enough
  if (ps.troops < max * ps.reserveRatio) return;
  if (ps.troops < max * ps.triggerRatio && Math.random() > 0.1) return;

  // 3. TARGET SELECTION — only attack neighbors weaker than us
  const enemies = [...borders]
    .filter(o => o >= 0 && playerStates[o].alive && playerStates[o].troops < ps.troops)
    .sort((a, b) => playerStates[a].troops - playerStates[b].troops);

  if (enemies.length === 0) return;

  // Pick the weakest neighbor
  const target = enemies[0];

  // 4. COMMIT — send everything above reserve
  const reserve = Math.floor(max * ps.reserveRatio);
  const send = Math.max(1, Math.floor(ps.troops - reserve));
  botSetAttack(ps, target, send);
}

function botSetAttack(ps, target, send) {
  // Bots have a single attack at a time
  for (const a of ps.attacks) ps.troops += a.troops;
  ps.attacks = [];
  if (send >= 1 && ps.troops >= send) {
    ps.troops -= send;
    ps.attacks.push({ target, troops: send });
  }
}

let lastTime = 0, expansionTimer = 0, boatTimer = 0, gameOver = false;
let lastEconBreakdown = null;

function tick() {
  if (gameOver) return;
  const now = performance.now();
  const dt = Math.min(now - lastTime, 100);
  lastTime = now;
  generateTroops(dt);
  if (boatsEnabled) {
    boatTimer += dt;
    if (boatTimer >= 80) { boatTimer = 0; processBoats(); }
  }
  if (isSpectateMode) {
    processExpansions(); processBeachheads();
  } else {
    expansionTimer += dt;
    if (expansionTimer >= EXPANSION_TICK_MS) { expansionTimer = 0; processExpansions(); processBeachheads(); }
  }
  botThinkAll();
  const elim = checkElimination();
  if (elim.gameOver) gameOver = true;

  const playerData = playerStates.map((ps, i) => ({
    troops: ps.troops, attackTroops: ps.attackTroops, cellCount: ps.cellCount, alive: ps.alive,
    expanding: ps.expanding, attackTarget: ps.attackTarget, gold: ps.gold, cityCount: ps.cityCount, dpostCount: ps.dpostCount,
    cx: centersN[i] > 0 ? centersSumX[i] / centersN[i] : 0,
    cy: centersN[i] > 0 ? centersSumY[i] / centersN[i] : 0, cn: centersN[i],
    beachheads: ps.beachheads.map(bh => ({ landingIdx: bh.landingIdx, troops: bh.troops, target: bh.target })),
    attacks: (ps.attacks || []).map(a => ({ target: a.target, troops: a.troops })),
  }));
  const cityData = cities.map(c => ({ idx: c.idx, owner: c.owner }));
  const dpostData = defensePosts.map(d => ({ idx: d.idx, owner: d.owner }));
  const econData = econBuildings.map(b => ({ idx: b.idx, owner: b.owner, type: b.type, claimedCount: b.claimedTiles.length, output: b.output, connectedCount: b.connectedCount || 0, stackMult: b.stackMult || 1 }));
  const boatData = boats.map(b => ({ owner: b.owner, troops: b.troops, path: b.path, pathIdx: b.pathIdx, targetIdx: b.targetIdx, retreating: b.retreating }));
  const destroyedData = destroyedDposts.slice();
  destroyedDposts = [];
  const ch = new Int32Array(tileChanges);
  tileChanges = [];
  const ps0 = playerStates[0];
  const landGold = ps0 && ps0.alive ? (0.02 + ps0.cellCount * 0.0001) : 0;
  const goldBreakdown = lastEconBreakdown ? {
    land: isSpectateMode ? landGold * 5 : landGold,
    farms: isSpectateMode ? (lastEconBreakdown.farms[0] || 0) * 5 : (lastEconBreakdown.farms[0] || 0),
    mines: isSpectateMode ? (lastEconBreakdown.mines[0] || 0) * 5 : (lastEconBreakdown.mines[0] || 0),
  } : { land: 0, farms: 0, mines: 0 };
  self.postMessage({ type: 'tick', changes: ch.buffer, changesLen: ch.length, players: playerData, cities: cityData, defensePosts: dpostData, econBuildings: econData, boats: boatData, destroyedDposts: destroyedData, goldBreakdown, gameOver: elim.gameOver, winner: elim.winner }, [ch.buffer]);
}

self.onmessage = function(e) {
  const msg = e.data;
  if (msg.type === 'init') {
    GRID_W = msg.gridW; GRID_H = msg.gridH; NUM_BOTS = msg.numBots;
    CELLS_PER_TICK = msg.cellsPerTick; EXPANSION_TICK_MS = msg.expansionTickMs; BOT_THINK_MS = msg.botThinkMs;
    const spectate = msg.spectateMode;
    isSpectateMode = !!spectate;
    boatsEnabled = !!msg.boatsEnabled;
    if (spectate) CELLS_PER_TICK = Math.max(CELLS_PER_TICK, 80);

    // Accept pre-built terrain and grid from main thread (decoded from map.bin)
    terrain = new Uint8Array(msg.terrain);
    waterMag = new Uint8Array(msg.waterMag);
    grid = new Int8Array(msg.grid);

    totalLandTiles = 0;
    for (let i = 0; i < terrain.length; i++) if (terrain[i] > 0) totalLandTiles++;

    playerStates = [];
    for (let i = 0; i <= NUM_BOTS; i++)
      playerStates.push({
        troops: spectate ? msg.startingTroops * 10 : (i === 0 ? msg.startingTroops : msg.startingTroops * 0.5),
        cellCount: 0, alive: i > 0, expanding: false, attackTarget: null,
        borderTiles: new Set(), attackTroops: 0, attacks: [], gold: spectate ? 200 : (i === 0 ? 300 : 0), cityCount: 0, dpostCount: 0, beachheads: [],
        isBot: spectate || i > 0,
        reserveRatio: spectate ? 0.02 + Math.random() * 0.03 : 0.3 + Math.random() * 0.1,
        triggerRatio: spectate ? 0.05 + Math.random() * 0.05 : 0.5 + Math.random() * 0.1,
        attackCooldown: spectate ? 80 + Math.random() * 120 : 400 + Math.random() * 400,
        nextAttackTick: spectate ? performance.now() : performance.now() + 2000 + Math.random() * 3000,
      });
    centersSumX = new Float64Array(playerStates.length);
    centersSumY = new Float64Array(playerStates.length);
    centersN = new Int32Array(playerStates.length);

    const R = msg.startingRadius;
    const startIdx = 1;
    for (let i = startIdx; i < msg.startingPositions.length; i++) {
      const { gx: sx, gy: sy } = msg.startingPositions[i];
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const x = sx + dx, y = sy + dy;
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
        const idx = y * GRID_W + x; if (terrain[idx] === 0) continue;
        grid[idx] = i; playerStates[i].cellCount++;
        centersSumX[i] += x; centersSumY[i] += y; centersN[i]++;
      }
    }
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const idx = y * GRID_W + x; const o = grid[idx];
      if (o >= 0 && calcIsBorder(idx)) playerStates[o].borderTiles.add(idx);
    }

    terrainClaimed = new Uint8Array(GRID_W * GRID_H);

    // Precompute water components for connectivity checks
    waterComponent = new Int32Array(GRID_W * GRID_H).fill(-1);
    let compId = 0;
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      if (terrain[i] !== 0 || waterComponent[i] !== -1) continue;
      const queue = [i];
      waterComponent[i] = compId;
      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++];
        const cx = curr % GRID_W, cy = (curr / GRID_W) | 0;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
          const ni = ny * GRID_W + nx;
          if (terrain[ni] !== 0 || waterComponent[ni] !== -1) continue;
          waterComponent[ni] = compId;
          queue.push(ni);
        }
      }
      compId++;
    }

    if (spectate) {
      const simTicks = 200;
      const simDt = 50;
      const baseTime = performance.now();
      for (let t = 0; t < simTicks; t++) {
        const simNow = baseTime + t * simDt;
        generateTroops(simDt);
        processExpansions();
        botThinkAllAt(simNow);
        for (let i = 0; i < playerStates.length; i++) {
          const ps = playerStates[i];
          if (ps.alive && ps.cellCount <= 0) { ps.alive = false; ps.expanding = false; ps.attackTarget = null; }
        }
        if (playerStates.filter(ps => ps.alive).length <= 3) break;
      }
      console.log('[fast-forward] done, cells per player:', playerStates.map(ps => ps.cellCount));
      tileChanges = [];
      const realNow = performance.now();
      for (const ps of playerStates) {
        ps.nextAttackTick = realNow;
      }
    }

    self.postMessage({ type: 'init_done', fullGrid: spectate ? Array.from(grid) : null, totalLandTiles });
    lastTime = performance.now();
    setInterval(tick, spectate ? 16 : 50);
  }
  if (msg.type === 'click') {
    if (!terrain || terrain[msg.gy * GRID_W + msg.gx] === 0) return;
    const co = grid[msg.gy * GRID_W + msg.gx]; const ps = playerStates[0];
    if (co === 0) {
      // Clicking own territory: cancel all attacks, return troops
      for (const a of ps.attacks) ps.troops += a.troops;
      ps.attacks = [];
    } else {
      const ratio = msg.ratio || 0.2;
      const existing = ps.attacks.find(a => a.target === co);
      if (existing) {
        const extra = Math.floor(ps.troops * ratio);
        ps.troops -= extra; existing.troops += extra;
      } else {
        const send = Math.floor(ps.troops * ratio);
        if (send >= 1) {
          ps.troops -= send;
          ps.attacks.push({ target: co, troops: send });
        }
      }
    }
  }
  if (msg.type === 'rightclick') {
    if (msg.gx !== undefined && msg.gy !== undefined) {
      const idx = msg.gy * GRID_W + msg.gx;
      if (boatsEnabled && terrain[idx] > 0 && grid[idx] !== 0) {
        launchBoat(0, msg.gx, msg.gy);
      }
      return;
    }
    // Right-click empty: cancel all attacks
    const ps = playerStates[0];
    for (const a of ps.attacks) ps.troops += a.troops;
    ps.attacks = [];
  }
  if (msg.type === 'cancel_boat' && boatsEnabled) {
    for (let i = boats.length - 1; i >= 0; i--) {
      const boat = boats[i];
      if (boat.owner === 0 && !boat.retreating) {
        boat.retreating = true;
        // Find nearest friendly shore and path back
        const currIdx = boat.path[boat.pathIdx];
        const cx = currIdx % GRID_W, cy = (currIdx / GRID_W) | 0;
        
        // Find all player shore tiles
        const ownerShores = [];
        for (const idx of playerStates[0].borderTiles) {
          const x = idx % GRID_W, y = (idx / GRID_W) | 0;
          for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H && terrain[ny * GRID_W + nx] === 0) {
              ownerShores.push(idx);
              break;
            }
          }
        }
        if (ownerShores.length > 0) {
          // Pick closest shore by water distance
          let bestShore = ownerShores[0];
          let bestDist = Infinity;
          for (const shore of ownerShores) {
            const sx = shore % GRID_W, sy = (shore / GRID_W) | 0;
            const dist = Math.abs(sx - cx) + Math.abs(sy - cy);
            if (dist < bestDist) { bestDist = dist; bestShore = shore; }
          }
          const newPath = findWaterPath(currIdx, bestShore);
          if (newPath && newPath.length >= 2) {
            boat.path = newPath;
            boat.pathIdx = 0;
            boat.targetIdx = bestShore;
          }
        }
        break;
      }
    }
  }
  if (msg.type === 'place_city') {
    const idx = msg.gy * GRID_W + msg.gx;
    placeCity(0, idx);
  }
  if (msg.type === 'place_defense_post') {
    const idx = msg.gy * GRID_W + msg.gx;
    placeDefensePost(0, idx);
  }
  if (msg.type === 'place_econ') {
    const idx = msg.gy * GRID_W + msg.gx;
    placeEconBuilding(0, idx, msg.buildType);
  }
  if (msg.type === 'preview_econ') {
    const idx = msg.gy * GRID_W + msg.gx;
    const preview = queryBuildingPreview(msg.buildType, idx);
    self.postMessage({ type: 'preview_result', preview });
  }
  if (msg.type === 'inspect_building') {
    const idx = msg.idx;
    const result = queryBuildingInspect(idx);
    self.postMessage({ type: 'inspect_result', result });
  }
  if (msg.type === 'inspect_all_type') {
    try {
      const { buildType, owner } = msg;
      const matching = econBuildings.filter(b => b.type === buildType && b.owner === owner);
      self.postMessage({ type: 'debug_log', msg: 'inspect_all_type: ' + buildType + ' matching=' + matching.length + ' total_econ=' + econBuildings.length });
      const seenProducers = new Set(), seenProcessors = new Set(), seenTiles = new Set();
      const merged = { type: buildType, producers: [], processors: [], allClaimedTiles: [] };
      for (const b of matching) {
        const chain = queryBuildingInspect(b.idx);
        if (!chain) continue;
        for (const p of (chain.producers || [])) {
          if (!seenProducers.has(p.idx)) { seenProducers.add(p.idx); merged.producers.push(p); }
        }
        for (const p of (chain.processors || [])) {
          if (!seenProcessors.has(p.idx)) { seenProcessors.add(p.idx); merged.processors.push(p); }
        }
        for (const t of (chain.allClaimedTiles || [])) {
          if (!seenTiles.has(t)) { seenTiles.add(t); merged.allClaimedTiles.push(t); }
        }
      }
      self.postMessage({ type: 'inspect_all_type_result', result: merged });
    } catch(err) {
      console.error('[worker] inspect_all_type error:', err);
      self.postMessage({ type: 'inspect_all_type_result', result: { type: msg.buildType, producers: [], processors: [], allClaimedTiles: [] } });
    }
  }
  if (msg.type === 'grant_gold') {
    if (playerStates && playerStates[0]) {
      playerStates[0].gold = Math.max(playerStates[0].gold, msg.amount);
    }
  }
  if (msg.type === 'place_player') {
    const gx = msg.gx, gy = msg.gy;
    const R = msg.radius || 10;
    const ps = playerStates[0];
    ps.alive = true;
    playerPlaced = true;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const x = gx + dx, y = gy + dy;
      if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
      const idx = y * GRID_W + x;
      if (terrain[idx] === 0 || grid[idx] >= 0) continue;
      grid[idx] = 0; ps.cellCount++;
      centersSumX[0] += x; centersSumY[0] += y; centersN[0]++;
      tileChanges.push(idx, 0);
    }
    for (let dy = -R - 1; dy <= R + 1; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const x = gx + dx, y = gy + dy;
      if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
      const idx = y * GRID_W + x;
      if (grid[idx] === 0 && calcIsBorder(idx)) ps.borderTiles.add(idx);
    }
  }
};
