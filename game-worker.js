// game-worker.js — All game logic runs in this Web Worker thread

const T_WATER = 0, T_PLAINS = 1, T_HIGHLAND = 2, T_MOUNTAIN = 3;
const WILD_COST = [0, 0.4, 0.7, 1.2];
const ENEMY_BASE_COST = [0, 1.2, 2.0, 3.5];
const CITY_COST = 100;
const CITY_TROOP_BONUS = 100;
const CITY_MIN_DIST = 15;
const BOT_STRATEGIES = [
  null, 'aggressive', 'aggressive', 'aggressive', 'aggressive',
  'defensive', 'defensive', 'defensive', 'balanced', 'balanced', 'balanced',
];

let GRID_W, GRID_H, NUM_BOTS, CELLS_PER_TICK, EXPANSION_TICK_MS, BOT_THINK_MS;
let grid, terrain, playerStates;
let tileChanges = [];
let centersSumX, centersSumY, centersN;
let cities = [];
let citySet = new Set();

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
    const skip = (Math.random() * ps.borderTiles.size) | 0;
    let sc = 0;
    for (const fIdx of ps.borderTiles) {
      if (captured >= CELLS_PER_TICK || ps.attackTroops < 1) break;
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
  for (let i = 0; i < playerStates.length; i++) {
    const ps = playerStates[i];
    if (!ps.alive || ps.cellCount === 0) continue;
    let max = maxTroopsForTiles(ps.cellCount, ps.cityCount);
    if (ps.isBot) max = Math.floor(max * 0.7);
    if (ps.troops >= max) { ps.troops = max; continue; }
    let toAdd = (2 + Math.pow(Math.max(0, ps.troops), 0.65) / 6) * (1 - ps.troops / max) * ticks;
    if (ps.isBot) toAdd *= 0.8;
    ps.troops = Math.min(ps.troops + toAdd, max);
    ps.gold += (0.02 + ps.cellCount * 0.0001) * ticks;
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

function placeCity(owner, idx) {
  const ps = playerStates[owner];
  if (ps.gold < CITY_COST || !canPlaceCity(idx)) return false;
  if (grid[idx] !== owner) return false;
  ps.gold -= CITY_COST;
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

function botThinkAll() {
  const bordered = Array.from({ length: playerStates.length }, () => new Set());
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
  for (let i = 1; i <= NUM_BOTS; i++) botThinkSingle(i, bordered[i]);
}

function botThinkSingle(id, borders) {
  const ps = playerStates[id]; if (!ps.alive) return;
  const max = maxTroopsForTiles(ps.cellCount, ps.cityCount);
  const strat = BOT_STRATEGIES[id];

  if (ps.gold >= CITY_COST && ps.cellCount > 50) tryPlaceCity(id);

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
  const th = strat === 'aggressive' ? 0.25 : strat === 'defensive' ? 0.6 : 0.4;
  if (ps.troops < max * th) return;
  const enemies = [...borders].filter(o => o >= 0 && playerStates[o].alive);
  const hasWild = borders.has(-1);
  const wantAtk = enemies.length > 0 && (strat === 'aggressive' ? Math.random() < 0.7 : strat === 'balanced' ? Math.random() < 0.4 : Math.random() < 0.2);
  if (wantAtk) {
    const target = enemies.reduce((b, e) => playerStates[e].cellCount < playerStates[b].cellCount ? e : b);
    const sendRatio = strat === 'aggressive' ? 0.4 : strat === 'balanced' ? 0.25 : 0.15;
    const send = Math.floor(ps.troops * sendRatio);
    ps.troops -= send; ps.attackTroops = send;
    ps.attackTarget = target;
    ps.expanding = true;
  } else if (hasWild) {
    const send = Math.floor(ps.troops * 0.2);
    ps.troops -= send; ps.attackTroops = send;
    ps.attackTarget = -1; ps.expanding = true;
  }
}

let lastTime = 0, expansionTimer = 0, botTimer = 0, gameOver = false;

function tick() {
  if (gameOver) return;
  const now = performance.now();
  const dt = Math.min(now - lastTime, 100);
  lastTime = now;
  generateTroops(dt);
  expansionTimer += dt;
  if (expansionTimer >= EXPANSION_TICK_MS) { expansionTimer = 0; processExpansions(); }
  botTimer += dt;
  if (botTimer >= BOT_THINK_MS) { botTimer = 0; botThinkAll(); }
  const elim = checkElimination();
  if (elim.gameOver) gameOver = true;

  const playerData = playerStates.map((ps, i) => ({
    troops: ps.troops, attackTroops: ps.attackTroops, cellCount: ps.cellCount, alive: ps.alive,
    expanding: ps.expanding, attackTarget: ps.attackTarget, gold: ps.gold, cityCount: ps.cityCount,
    cx: centersN[i] > 0 ? centersSumX[i] / centersN[i] : 0,
    cy: centersN[i] > 0 ? centersSumY[i] / centersN[i] : 0, cn: centersN[i],
  }));
  const cityData = cities.map(c => ({ idx: c.idx, owner: c.owner }));
  const ch = new Int32Array(tileChanges);
  tileChanges = [];
  self.postMessage({ type: 'tick', changes: ch.buffer, changesLen: ch.length, players: playerData, cities: cityData, gameOver: elim.gameOver, winner: elim.winner }, [ch.buffer]);
}

self.onmessage = function(e) {
  const msg = e.data;
  if (msg.type === 'init') {
    GRID_W = msg.gridW; GRID_H = msg.gridH; NUM_BOTS = msg.numBots;
    CELLS_PER_TICK = msg.cellsPerTick; EXPANSION_TICK_MS = msg.expansionTickMs; BOT_THINK_MS = msg.botThinkMs;
    grid = new Int8Array(GRID_W * GRID_H).fill(-2);
    terrain = new Uint8Array(GRID_W * GRID_H);

    const ms = msg.mapScale;
    const ox = msg.mapOffsetX || 0;
    const cs = msg.cellSize || 1;
    const si = msg.indiaOutline.map(([x, y]) => [x * ms + ox, y * ms]);
    const ss = msg.sriLankaOutline.map(([x, y]) => [x * ms + ox, y * ms]);
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++) {
        const px = x * cs + cs / 2, py = y * cs + cs / 2;
        if (isPointInPolygon(px, py, si) || isPointInPolygon(px, py, ss))
          grid[y * GRID_W + x] = -1;
      }

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const idx = y * GRID_W + x; if (grid[idx] === -2) continue;
        const noise = smoothNoise(x, y, 40) * 0.5 + smoothNoise(x, y, 20) * 0.3 + smoothNoise(x, y, 8) * 0.2;
        const lat = 1 - y / GRID_H, lon = x / GRID_W;

        let elevation = noise * 0.25;

        // Himalayas — massive mountain wall across the north
        if (lat > 0.84) elevation += 0.7 * Math.min(1, (lat - 0.84) / 0.08);
        else if (lat > 0.76) elevation += 0.35 * ((lat - 0.76) / 0.08);

        // Indo-Gangetic Plain — wide flat belt below Himalayas
        if (lat > 0.56 && lat < 0.78 && lon > 0.05 && lon < 0.85) {
          const dist = Math.abs(lat - 0.67) / 0.11;
          elevation *= (1 - Math.max(0, 1 - dist * dist) * 0.8);
        }

        // Thar Desert (Rajasthan) — arid highlands
        if (lat > 0.55 && lat < 0.72 && lon < 0.22) elevation += 0.12;

        // Western Ghats — mountain ridge along southwest coast
        if (lat > 0.08 && lat < 0.52 && lon < 0.25) {
          const ridgeLon = 0.08 + (lat - 0.08) * 0.15;
          const dist = Math.abs(lon - ridgeLon);
          if (dist < 0.06) elevation += 0.4 * Math.exp(-dist * dist / 0.001);
        }

        // Deccan Plateau — elevated interior of southern peninsula
        if (lat > 0.12 && lat < 0.52 && lon > 0.12 && lon < 0.6) {
          const edgeDist = Math.min(lat - 0.12, 0.52 - lat, lon - 0.12, 0.6 - lon);
          elevation += 0.18 * Math.min(1, edgeDist / 0.08);
        }

        // Eastern Ghats — lower hills along southeast coast
        if (lat > 0.18 && lat < 0.48 && lon > 0.45 && lon < 0.65) {
          const ridgeDist = Math.abs(lon - 0.55);
          if (ridgeDist < 0.05) elevation += 0.15 * Math.exp(-ridgeDist * ridgeDist / 0.001);
        }

        // NE India hills (Meghalaya, Nagaland)
        if (lat > 0.68 && lat < 0.78 && lon > 0.8) elevation += 0.25;

        // Sri Lanka central highlands
        if (lat < 0.12 && lon > 0.35 && lon < 0.55) {
          const d = Math.sqrt((lat - 0.06) ** 2 + (lon - 0.45) ** 2);
          if (d < 0.04) elevation += 0.2 * (1 - d / 0.04);
        }

        if (elevation > 0.5) terrain[idx] = T_MOUNTAIN;
        else if (elevation > 0.28) terrain[idx] = T_HIGHLAND;
        else terrain[idx] = T_PLAINS;
      }
    }

    playerStates = [];
    for (let i = 0; i <= NUM_BOTS; i++)
      playerStates.push({
        troops: i === 0 ? msg.startingTroops : msg.startingTroops * 0.5,
        cellCount: 0, alive: true, expanding: false, attackTarget: null,
        borderTiles: new Set(), attackTroops: 0, gold: 0, cityCount: 0,
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
      const R2 = R + 2;
      for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H && terrain[y * GRID_W + x] > 0) terrain[y * GRID_W + x] = T_PLAINS;
      }
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

    // Send copies to main thread (don't transfer — we need to keep them)
    self.postMessage({ type: 'init_done', terrain: Array.from(terrain), grid: Array.from(grid), gridW: GRID_W, gridH: GRID_H });
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
    const ps = playerStates[0];
    ps.troops += ps.attackTroops; ps.attackTroops = 0;
    ps.expanding = false; ps.attackTarget = null;
  }
  if (msg.type === 'place_city') {
    const idx = msg.gy * GRID_W + msg.gx;
    placeCity(0, idx);
  }
};
