// game-worker.js — All game logic runs in this Web Worker thread

const T_WATER = 0, T_PLAINS = 1, T_HIGHLAND = 2, T_MOUNTAIN = 3;
const WILD_COST = [0, 0.4, 0.7, 1.2];
const ENEMY_BASE_COST = [0, 1.2, 2.0, 3.5];
const CITY_COST = 100;
const CITY_TROOP_BONUS = 100;
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
];
const MAX_BOATS = 3;
const BOAT_TROOP_FRACTION = 0.2;

let GRID_W, GRID_H, NUM_BOTS, CELLS_PER_TICK, EXPANSION_TICK_MS, BOT_THINK_MS;
let grid, terrain, playerStates;
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
    if (!ps.alive || !ps.expanding || ps.attackTarget === null || ps.attackTroops < 1) {
      if (ps.expanding) { ps.expanding = false; ps.attackTarget = null; ps.attackTroops = 0; }
      continue;
    }
    if (ps.attackTarget >= 0 && !playerStates[ps.attackTarget].alive) {
      ps.troops += ps.attackTroops; ps.attackTroops = 0;
      ps.expanding = false; ps.attackTarget = null; continue;
    }
    const target = ps.attackTarget;
    if (ps.borderTiles.size === 0) { ps.expanding = false; ps.attackTarget = null; ps.attackTroops = 0; continue; }

    let captured = 0;
    let capturebudget = CELLS_PER_TICK;
    const skip = (Math.random() * ps.borderTiles.size) | 0;
    let sc = 0;
    for (const fIdx of ps.borderTiles) {
      if (captured >= capturebudget || ps.attackTroops < 1) break;
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
        if (target === -1) { cost = WILD_COST[ter]; }
        else {
          const defPs = playerStates[target];
          const ratio = Math.min(2, Math.max(0.6, defPs.troops / Math.max(1, ps.troops + ps.attackTroops)));
          cost = ENEMY_BASE_COST[ter] * ratio;
          if (isTileDefended(nIdx, target)) { cost *= DPOST_DEFENSE_MULT; capturebudget -= (DPOST_SPEED_PENALTY - 1); }
          if (defPs.cellCount > 0) defPs.troops = Math.max(0, defPs.troops - defPs.troops / defPs.cellCount);
        }
        if (ps.attackTroops >= cost) { ps.attackTroops -= cost; conquer(i, nIdx); captured++; }
        break;
      }
    }
    if (ps.attackTroops < 1) { ps.expanding = false; ps.attackTarget = null; ps.attackTroops = 0; }
  }
}

function generateTroops(dt) {
  const ticks = dt / 100;
  const econGold = getEconGoldPerTick();
  for (let i = 0; i < playerStates.length; i++) {
    const ps = playerStates[i];
    if (!ps.alive || ps.cellCount === 0) continue;
    let max = maxTroopsForTiles(ps.cellCount, ps.cityCount);
    if (ps.isBot) max = Math.floor(max * 0.7);
    if (ps.troops >= max) { ps.troops = max; continue; }
    let toAdd = (2 + Math.pow(Math.max(0, ps.troops), 0.65) / 6) * (1 - ps.troops / max) * ticks;
    if (ps.isBot) toAdd *= 0.8;
    ps.troops = Math.min(ps.troops + toAdd, max);
    ps.gold += ((0.02 + ps.cellCount * 0.0001) + econGold[i]) * ticks;
  }
}

function checkElimination() {
  let go = false, w = null;
  for (let i = 0; i < playerStates.length; i++) {
    const ps = playerStates[i];
    if (ps.alive && ps.cellCount <= 0) { ps.alive = false; ps.expanding = false; ps.attackTarget = null; }
  }
  if (!playerStates[0].alive) go = true;
  else if (playerStates.filter(ps => ps.alive).length <= 1) { go = true; w = playerStates[0].alive ? 0 : null; }
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

function cityCost(cityCount) { return CITY_COST * Math.pow(2, cityCount); }

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

function dpostCost(count) { return Math.min(250, (count + 1) * 50); }

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

  // Sum per owner
  const goldPerOwner = new Float64Array(playerStates.length);
  for (const b of econBuildings) {
    if (b.type === 'farm' || b.type === 'mine') {
      goldPerOwner[b.owner] += buildingOutputs.get(b.id) || b.output;
    }
  }
  return goldPerOwner;
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

function findNearestOwnedShore(owner, targetX, targetY) {
  const targetIdx = targetY * GRID_W + targetX;
  const destShore = findNearestLandShore(targetIdx);
  if (destShore < 0) return -1;
  const dsx = destShore % GRID_W, dsy = (destShore / GRID_W) | 0;

  let bestIdx = -1, bestDist = Infinity;
  for (const idx of playerStates[owner].borderTiles) {
    const x = idx % GRID_W, y = (idx / GRID_W) | 0;
    let isShore = false;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H && terrain[ny * GRID_W + nx] === 0) {
        isShore = true; break;
      }
    }
    if (!isShore) continue;
    const dist = Math.abs(x - dsx) + Math.abs(y - dsy);
    if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
  }
  return bestIdx;
}

function findNearestLandShore(targetIdx) {
  const tx = targetIdx % GRID_W, ty = (targetIdx / GRID_W) | 0;
  // Check if target itself is a shore tile
  for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const wx = tx + ddx, wy = ty + ddy;
    if (wx >= 0 && wx < GRID_W && wy >= 0 && wy < GRID_H && terrain[wy * GRID_W + wx] === 0)
      return targetIdx;
  }
  // BFS outward from target through land to find nearest shore tile
  const visited = new Set([targetIdx]);
  const queue = [targetIdx];
  let head = 0;
  while (head < queue.length && head < 5000) {
    const curr = queue[head++];
    const cx = curr % GRID_W, cy = (curr / GRID_W) | 0;
    for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = cx + ddx, ny = cy + ddy;
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      const ni = ny * GRID_W + nx;
      if (visited.has(ni)) continue;
      visited.add(ni);
      if (terrain[ni] === 0) continue;
      // Check if this land tile is adjacent to water
      for (const [dx2, dy2] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const wx = nx + dx2, wy = ny + dy2;
        if (wx >= 0 && wx < GRID_W && wy >= 0 && wy < GRID_H && terrain[wy * GRID_W + wx] === 0)
          return ni;
      }
      queue.push(ni);
    }
  }
  return -1;
}

function findWaterPath(srcIdx, dstIdx) {
  const sx = srcIdx % GRID_W, sy = (srcIdx / GRID_W) | 0;
  const dx = dstIdx % GRID_W, dy = (dstIdx / GRID_W) | 0;
  const startWater = [];
  for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nx = sx + ox, ny = sy + oy;
    if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H && terrain[ny * GRID_W + nx] === 0)
      startWater.push(ny * GRID_W + nx);
  }
  if (startWater.length === 0) return null;

  const endWater = new Set();
  for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nx = dx + ox, ny = dy + oy;
    if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H && terrain[ny * GRID_W + nx] === 0)
      endWater.add(ny * GRID_W + nx);
  }
  if (endWater.size === 0) return null;

  const visited = new Set(startWater);
  const parent = new Map();
  for (const sw of startWater) parent.set(sw, srcIdx);
  const queue = [...startWater];
  let head = 0;

  while (head < queue.length) {
    const curr = queue[head++];
    if (endWater.has(curr)) {
      const path = [dstIdx];
      let c = curr;
      while (c !== srcIdx) { path.push(c); c = parent.get(c); }
      path.push(srcIdx);
      return path.reverse();
    }
    const cx = curr % GRID_W, cy = (curr / GRID_W) | 0;
    for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      const ni = ny * GRID_W + nx;
      if (visited.has(ni)) continue;
      if (terrain[ni] !== 0 && !endWater.has(ni)) continue;
      visited.add(ni);
      parent.set(ni, curr);
      queue.push(ni);
    }
  }
  return null;
}

function launchBoat(owner, targetGx, targetGy) {
  const ps = playerStates[owner];
  if (!ps.alive || ps.troops < 5) return null;
  const ownerBoats = boats.filter(b => b.owner === owner);
  if (ownerBoats.length >= MAX_BOATS) return null;

  const targetIdx = targetGy * GRID_W + targetGx;
  if (terrain[targetIdx] === 0) return null;

  const destShore = findNearestLandShore(targetIdx);
  if (destShore < 0) return null;

  const shoreIdx = findNearestOwnedShore(owner, targetGx, targetGy);
  if (shoreIdx < 0) return null;

  // Don't launch if source and dest are on the same landmass (no water crossing needed)
  if (shoreIdx === destShore) return null;

  const path = findWaterPath(shoreIdx, destShore);
  if (!path || path.length < 3) return null;

  const send = Math.max(1, Math.floor(ps.troops * BOAT_TROOP_FRACTION));
  ps.troops -= send;

  const boat = { owner, troops: send, path, pathIdx: 0, targetIdx: destShore };
  boats.push(boat);
  return boat;
}

function processBoats() {
  for (let i = boats.length - 1; i >= 0; i--) {
    const boat = boats[i];
    if (!playerStates[boat.owner].alive) { boats.splice(i, 1); continue; }

    boat.pathIdx += 2;
    if (boat.pathIdx >= boat.path.length - 1) {
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
        playerStates[boat.owner].troops += boat.troops;
      }
      boats.splice(i, 1);
    }
  }
}

function botThinkAll() {
  const now = performance.now();
  const bordered = Array.from({ length: playerStates.length }, () => new Set());
  let needsBorders = false;
  for (let i = 1; i <= NUM_BOTS; i++) {
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
  for (let i = 1; i <= NUM_BOTS; i++) {
    if (now >= playerStates[i].nextAttackTick) botThinkSingle(i, bordered[i], now);
  }
}

function botThinkSingle(id, borders, now) {
  const ps = playerStates[id]; if (!ps.alive) return;
  ps.nextAttackTick = now + ps.attackCooldown;

  let max = maxTroopsForTiles(ps.cellCount, ps.cityCount);
  max = Math.floor(max * 0.7);

  if (ps.gold >= cityCost(ps.cityCount) && ps.cellCount > 50) tryPlaceCity(id);
  const dpCost = dpostCost(ps.dpostCount);
  if (ps.gold >= dpCost && ps.cellCount > 30 && Math.random() < 0.3) tryPlaceDefensePost(id);

  // If already attacking, check if we should stop
  if (ps.expanding && ps.attackTarget !== null) {
    if (ps.attackTroops < 1 || !borders.has(ps.attackTarget)) {
      ps.troops += ps.attackTroops; ps.attackTroops = 0;
      ps.expanding = false; ps.attackTarget = null;
    }
    if (ps.attackTarget >= 0 && !playerStates[ps.attackTarget].alive) {
      ps.troops += ps.attackTroops; ps.attackTroops = 0;
      ps.expanding = false; ps.attackTarget = null;
    }
    return;
  }

  const hasWild = borders.has(-1);

  // 1. WILDERNESS FIRST — always expand into unclaimed land if available
  if (hasWild && ps.troops > max * 0.1) {
    const send = Math.floor(ps.troops * 0.08);
    if (send >= 1) {
      ps.troops -= send; ps.attackTroops = send;
      ps.attackTarget = -1; ps.expanding = true;
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
  ps.troops -= send; ps.attackTroops = send;
  ps.attackTarget = target;
  ps.expanding = true;
}

let lastTime = 0, expansionTimer = 0, gameOver = false;

function tick() {
  if (gameOver) return;
  const now = performance.now();
  const dt = Math.min(now - lastTime, 100);
  lastTime = now;
  generateTroops(dt);
  expansionTimer += dt;
  if (expansionTimer >= EXPANSION_TICK_MS) { expansionTimer = 0; processExpansions(); processBoats(); }
  botThinkAll();
  const elim = checkElimination();
  if (elim.gameOver) gameOver = true;

  const playerData = playerStates.map((ps, i) => ({
    troops: ps.troops, attackTroops: ps.attackTroops, cellCount: ps.cellCount, alive: ps.alive,
    expanding: ps.expanding, attackTarget: ps.attackTarget, gold: ps.gold, cityCount: ps.cityCount, dpostCount: ps.dpostCount,
    cx: centersN[i] > 0 ? centersSumX[i] / centersN[i] : 0,
    cy: centersN[i] > 0 ? centersSumY[i] / centersN[i] : 0, cn: centersN[i],
  }));
  const cityData = cities.map(c => ({ idx: c.idx, owner: c.owner }));
  const dpostData = defensePosts.map(d => ({ idx: d.idx, owner: d.owner }));
  const econData = econBuildings.map(b => ({ idx: b.idx, owner: b.owner, type: b.type, claimedCount: b.claimedTiles.length, output: b.output, connectedCount: b.connectedCount || 0, stackMult: b.stackMult || 1 }));
  const boatData = boats.map(b => ({ owner: b.owner, troops: b.troops, path: b.path, pathIdx: b.pathIdx, targetIdx: b.targetIdx }));
  const destroyedData = destroyedDposts.slice();
  destroyedDposts = [];
  const ch = new Int32Array(tileChanges);
  tileChanges = [];
  self.postMessage({ type: 'tick', changes: ch.buffer, changesLen: ch.length, players: playerData, cities: cityData, defensePosts: dpostData, econBuildings: econData, boats: boatData, destroyedDposts: destroyedData, gameOver: elim.gameOver, winner: elim.winner }, [ch.buffer]);
}

self.onmessage = function(e) {
  const msg = e.data;
  if (msg.type === 'init') {
    GRID_W = msg.gridW; GRID_H = msg.gridH; NUM_BOTS = msg.numBots;
    CELLS_PER_TICK = msg.cellsPerTick; EXPANSION_TICK_MS = msg.expansionTickMs; BOT_THINK_MS = msg.botThinkMs;

    // Accept pre-built terrain and grid from main thread (decoded from map.bin)
    terrain = new Uint8Array(msg.terrain);
    grid = new Int8Array(msg.grid);

    playerStates = [];
    for (let i = 0; i <= NUM_BOTS; i++)
      playerStates.push({
        troops: i === 0 ? msg.startingTroops : msg.startingTroops * 0.5,
        cellCount: 0, alive: true, expanding: false, attackTarget: null,
        borderTiles: new Set(), attackTroops: 0, gold: i === 0 ? 300 : 0, cityCount: 0, dpostCount: 0,
        isBot: i > 0,
        reserveRatio: 0.3 + Math.random() * 0.1,
        triggerRatio: 0.5 + Math.random() * 0.1,
        attackCooldown: 400 + Math.random() * 400,
        nextAttackTick: performance.now() + 2000 + Math.random() * 3000,
      });
    centersSumX = new Float64Array(playerStates.length);
    centersSumY = new Float64Array(playerStates.length);
    centersN = new Int32Array(playerStates.length);

    const R = msg.startingRadius;
    for (let i = 0; i < msg.startingPositions.length; i++) {
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
    self.postMessage({ type: 'init_done' });
    lastTime = performance.now();
    setInterval(tick, 50);
  }
  if (msg.type === 'click') {
    if (!terrain || terrain[msg.gy * GRID_W + msg.gx] === 0) return;
    const co = grid[msg.gy * GRID_W + msg.gx]; const ps = playerStates[0];
    if (co === 0) {
      ps.troops += ps.attackTroops; ps.attackTroops = 0;
      ps.expanding = false; ps.attackTarget = null;
    } else {
      const ratio = msg.ratio || 0.2;
      if (ps.expanding && ps.attackTarget === co) {
        const extra = Math.floor(ps.troops * ratio);
        ps.troops -= extra; ps.attackTroops += extra;
      } else {
        ps.troops += ps.attackTroops; ps.attackTroops = 0;
        const send = Math.floor(ps.troops * ratio);
        ps.troops -= send; ps.attackTroops = send;
        ps.attackTarget = co; ps.expanding = true;
      }
    }
  }
  if (msg.type === 'rightclick') {
    if (msg.gx !== undefined && msg.gy !== undefined) {
      const idx = msg.gy * GRID_W + msg.gx;
      if (terrain[idx] > 0 && grid[idx] !== 0) {
        const result = launchBoat(0, msg.gx, msg.gy);
        if (result) return;
      }
    }
    const ps = playerStates[0];
    ps.troops += ps.attackTroops; ps.attackTroops = 0;
    ps.expanding = false; ps.attackTarget = null;
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
};
