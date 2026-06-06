// game-worker.js — Web Worker entry point: init, tick loop, message handling

import { state as s } from './js/worker/state.js';
import { calcIsBorder } from './js/worker/grid.js';
import { processExpansions, processBeachheads, generateTroops, checkElimination } from './js/worker/grid.js';
import { placeCity, placeDefensePost, placeEconBuilding, getEconGoldPerTick, queryBuildingPreview, queryBuildingInspect } from './js/worker/buildings.js';
import { botThinkAll, botThinkAllAt } from './js/worker/bots.js';
import { launchBoat, processBoats } from './js/worker/boats.js';

let lastTime = 0, expansionTimer = 0, boatTimer = 0, gameOver = false;
let lastEconBreakdown = null;

function tick() {
  if (gameOver || s.paused) return;
  const now = performance.now();
  const dt = Math.min(now - lastTime, 100);
  lastTime = now;

  const econ = getEconGoldPerTick();
  lastEconBreakdown = econ;
  generateTroops(dt, econ);

  if (s.boatsEnabled) {
    boatTimer += dt;
    if (boatTimer >= 80) { boatTimer = 0; processBoats(); }
  }
  if (s.isSpectateMode) {
    processExpansions(); processBeachheads();
  } else {
    expansionTimer += dt;
    if (expansionTimer >= s.EXPANSION_TICK_MS) { expansionTimer = 0; processExpansions(); processBeachheads(); }
  }
  botThinkAll();
  const elim = checkElimination();
  if (elim.gameOver) gameOver = true;

  const playerData = s.playerStates.map((ps, i) => ({
    troops: ps.troops, attackTroops: ps.attackTroops, cellCount: ps.cellCount, alive: ps.alive,
    expanding: ps.expanding, attackTarget: ps.attackTarget, gold: ps.gold, cityCount: ps.cityCount, dpostCount: ps.dpostCount,
    cx: s.centersN[i] > 0 ? s.centersSumX[i] / s.centersN[i] : 0,
    cy: s.centersN[i] > 0 ? s.centersSumY[i] / s.centersN[i] : 0, cn: s.centersN[i],
    beachheads: ps.beachheads.map(bh => ({ landingIdx: bh.landingIdx, troops: bh.troops, target: bh.target })),
    attacks: (ps.attacks || []).map(a => ({ target: a.target, troops: a.troops })),
  }));
  const cityData = s.cities.map(c => ({ idx: c.idx, owner: c.owner }));
  const dpostData = s.defensePosts.map(d => ({ idx: d.idx, owner: d.owner }));
  const econData = s.econBuildings.map(b => ({ idx: b.idx, owner: b.owner, type: b.type, claimedCount: b.claimedTiles.length, output: b.output, connectedCount: b.connectedCount || 0, stackMult: b.stackMult || 1 }));
  const boatData = s.boats.map(b => ({ owner: b.owner, troops: b.troops, path: b.path, pathIdx: b.pathIdx, targetIdx: b.targetIdx, retreating: b.retreating }));
  const destroyedData = s.destroyedDposts.slice();
  s.destroyedDposts = [];
  const ch = new Int32Array(s.tileChanges);
  s.tileChanges = [];
  const ps0 = s.playerStates[0];
  const landGold = ps0 && ps0.alive ? (0.02 + ps0.cellCount * 0.0001) : 0;
  const goldBreakdown = lastEconBreakdown ? {
    land: s.isSpectateMode ? landGold * 5 : landGold,
    farms: s.isSpectateMode ? (lastEconBreakdown.farms[0] || 0) * 5 : (lastEconBreakdown.farms[0] || 0),
    mines: s.isSpectateMode ? (lastEconBreakdown.mines[0] || 0) * 5 : (lastEconBreakdown.mines[0] || 0),
  } : { land: 0, farms: 0, mines: 0 };
  self.postMessage({ type: 'tick', changes: ch.buffer, changesLen: ch.length, players: playerData, cities: cityData, defensePosts: dpostData, econBuildings: econData, boats: boatData, destroyedDposts: destroyedData, goldBreakdown, gameOver: elim.gameOver, winner: elim.winner }, [ch.buffer]);
}

self.onmessage = function(e) {
  const msg = e.data;
  if (msg.type === 'init') {
    s.GRID_W = msg.gridW; s.GRID_H = msg.gridH; s.NUM_BOTS = msg.numBots;
    s.CELLS_PER_TICK = msg.cellsPerTick; s.EXPANSION_TICK_MS = msg.expansionTickMs; s.BOT_THINK_MS = msg.botThinkMs;
    const spectate = msg.spectateMode;
    s.isSpectateMode = !!spectate;
    s.boatsEnabled = !!msg.boatsEnabled;
    if (spectate) s.CELLS_PER_TICK = Math.max(s.CELLS_PER_TICK, 80);

    s.terrain = new Uint8Array(msg.terrain);
    s.waterMag = new Uint8Array(msg.waterMag);
    s.grid = new Int8Array(msg.grid);

    s.totalLandTiles = 0;
    for (let i = 0; i < s.terrain.length; i++) if (s.terrain[i] > 0) s.totalLandTiles++;

    s.playerStates = [];
    for (let i = 0; i <= s.NUM_BOTS; i++)
      s.playerStates.push({
        troops: spectate ? msg.startingTroops * 10 : (i === 0 ? msg.startingTroops : msg.startingTroops * 0.5),
        cellCount: 0, alive: i > 0, expanding: false, attackTarget: null,
        borderTiles: new Set(), attackTroops: 0, attacks: [], gold: spectate ? 200 : (i === 0 ? 300 : 0), cityCount: 0, dpostCount: 0, beachheads: [],
        isBot: spectate || i > 0,
        reserveRatio: spectate ? 0.02 + Math.random() * 0.03 : 0.3 + Math.random() * 0.1,
        triggerRatio: spectate ? 0.05 + Math.random() * 0.05 : 0.5 + Math.random() * 0.1,
        attackCooldown: spectate ? 80 + Math.random() * 120 : 400 + Math.random() * 400,
        nextAttackTick: spectate ? performance.now() : performance.now() + 2000 + Math.random() * 3000,
      });
    s.centersSumX = new Float64Array(s.playerStates.length);
    s.centersSumY = new Float64Array(s.playerStates.length);
    s.centersN = new Int32Array(s.playerStates.length);

    const R = msg.startingRadius;
    for (let i = 1; i < msg.startingPositions.length; i++) {
      const { gx: sx, gy: sy } = msg.startingPositions[i];
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const x = sx + dx, y = sy + dy;
        if (x < 0 || x >= s.GRID_W || y < 0 || y >= s.GRID_H) continue;
        const idx = y * s.GRID_W + x; if (s.terrain[idx] === 0) continue;
        s.grid[idx] = i; s.playerStates[i].cellCount++;
        s.centersSumX[i] += x; s.centersSumY[i] += y; s.centersN[i]++;
      }
    }
    for (let y = 0; y < s.GRID_H; y++) for (let x = 0; x < s.GRID_W; x++) {
      const idx = y * s.GRID_W + x; const o = s.grid[idx];
      if (o >= 0 && calcIsBorder(idx)) s.playerStates[o].borderTiles.add(idx);
    }

    s.terrainClaimed = new Uint8Array(s.GRID_W * s.GRID_H);

    // Precompute water components
    s.waterComponent = new Int32Array(s.GRID_W * s.GRID_H).fill(-1);
    let compId = 0;
    for (let i = 0; i < s.GRID_W * s.GRID_H; i++) {
      if (s.terrain[i] !== 0 || s.waterComponent[i] !== -1) continue;
      const queue = [i];
      s.waterComponent[i] = compId;
      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++];
        const cx = curr % s.GRID_W, cy = (curr / s.GRID_W) | 0;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
          const ni = ny * s.GRID_W + nx;
          if (s.terrain[ni] !== 0 || s.waterComponent[ni] !== -1) continue;
          s.waterComponent[ni] = compId;
          queue.push(ni);
        }
      }
      compId++;
    }

    if (spectate) {
      const simTicks = 200, simDt = 50;
      const baseTime = performance.now();
      for (let t = 0; t < simTicks; t++) {
        const simNow = baseTime + t * simDt;
        const econ = getEconGoldPerTick();
        generateTroops(simDt, econ);
        processExpansions();
        botThinkAllAt(simNow);
        for (let i = 0; i < s.playerStates.length; i++) {
          const ps = s.playerStates[i];
          if (ps.alive && ps.cellCount <= 0) { ps.alive = false; ps.expanding = false; ps.attackTarget = null; }
        }
        if (s.playerStates.filter(ps => ps.alive).length <= 3) break;
      }
      s.tileChanges = [];
      const realNow = performance.now();
      for (const ps of s.playerStates) ps.nextAttackTick = realNow;
    }

    self.postMessage({ type: 'init_done', fullGrid: spectate ? Array.from(s.grid) : null, totalLandTiles: s.totalLandTiles });
    lastTime = performance.now();
    setInterval(tick, spectate ? 16 : 50);
  }

  if (msg.type === 'click') {
    if (!s.terrain || s.terrain[msg.gy * s.GRID_W + msg.gx] === 0) return;
    const co = s.grid[msg.gy * s.GRID_W + msg.gx]; const ps = s.playerStates[0];
    if (co === 0) {
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
      const idx = msg.gy * s.GRID_W + msg.gx;
      if (s.boatsEnabled && s.terrain[idx] > 0 && s.grid[idx] !== 0) {
        launchBoat(0, msg.gx, msg.gy);
      }
      return;
    }
    const ps = s.playerStates[0];
    for (const a of ps.attacks) ps.troops += a.troops;
    ps.attacks = [];
  }

  if (msg.type === 'cancel_boat' && s.boatsEnabled) {
    for (let i = s.boats.length - 1; i >= 0; i--) {
      const boat = s.boats[i];
      if (boat.owner === 0 && !boat.retreating) {
        boat.retreating = true;
        break;
      }
    }
  }

  if (msg.type === 'place_city') placeCity(0, msg.gy * s.GRID_W + msg.gx);
  if (msg.type === 'place_defense_post') placeDefensePost(0, msg.gy * s.GRID_W + msg.gx);
  if (msg.type === 'place_econ') placeEconBuilding(0, msg.gy * s.GRID_W + msg.gx, msg.buildType);

  if (msg.type === 'preview_econ') {
    const preview = queryBuildingPreview(msg.buildType, msg.gy * s.GRID_W + msg.gx);
    self.postMessage({ type: 'preview_result', preview });
  }
  if (msg.type === 'inspect_building') {
    const result = queryBuildingInspect(msg.idx);
    self.postMessage({ type: 'inspect_result', result });
  }
  if (msg.type === 'inspect_all_type') {
    try {
      const { buildType, owner } = msg;
      const matching = s.econBuildings.filter(b => b.type === buildType && b.owner === owner);
      const seenProducers = new Set(), seenProcessors = new Set(), seenTiles = new Set();
      const merged = { type: buildType, producers: [], processors: [], allClaimedTiles: [] };
      for (const b of matching) {
        const chain = queryBuildingInspect(b.idx);
        if (!chain) continue;
        for (const p of (chain.producers || [])) { if (!seenProducers.has(p.idx)) { seenProducers.add(p.idx); merged.producers.push(p); } }
        for (const p of (chain.processors || [])) { if (!seenProcessors.has(p.idx)) { seenProcessors.add(p.idx); merged.processors.push(p); } }
        for (const t of (chain.allClaimedTiles || [])) { if (!seenTiles.has(t)) { seenTiles.add(t); merged.allClaimedTiles.push(t); } }
      }
      self.postMessage({ type: 'inspect_all_type_result', result: merged });
    } catch (err) {
      console.error('[worker] inspect_all_type error:', err);
      self.postMessage({ type: 'inspect_all_type_result', result: { type: msg.buildType, producers: [], processors: [], allClaimedTiles: [] } });
    }
  }

  if (msg.type === 'pause') s.paused = true;
  if (msg.type === 'resume') { s.paused = false; lastTime = performance.now(); }
  if (msg.type === 'grant_gold') {
    if (s.playerStates && s.playerStates[0]) s.playerStates[0].gold = Math.max(s.playerStates[0].gold, msg.amount);
  }
  if (msg.type === 'place_player') {
    const gx = msg.gx, gy = msg.gy;
    const R = msg.radius || 10;
    const ps = s.playerStates[0];
    ps.alive = true;
    s.playerPlaced = true;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const x = gx + dx, y = gy + dy;
      if (x < 0 || x >= s.GRID_W || y < 0 || y >= s.GRID_H) continue;
      const idx = y * s.GRID_W + x;
      if (s.terrain[idx] === 0 || s.grid[idx] >= 0) continue;
      s.grid[idx] = 0; ps.cellCount++;
      s.centersSumX[0] += x; s.centersSumY[0] += y; s.centersN[0]++;
      s.tileChanges.push(idx, 0);
    }
    for (let dy = -R - 1; dy <= R + 1; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const x = gx + dx, y = gy + dy;
      if (x < 0 || x >= s.GRID_W || y < 0 || y >= s.GRID_H) continue;
      const idx = y * s.GRID_W + x;
      if (s.grid[idx] === 0 && calcIsBorder(idx)) ps.borderTiles.add(idx);
    }
  }
};
