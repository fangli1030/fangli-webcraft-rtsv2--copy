// worker/grid.js — Border detection, tile conquest, expansion processing

import { WILD_COST, ENEMY_BASE_COST, DPOST_DEFENSE_MULT, DPOST_SPEED_PENALTY } from './constants.js';
import { state as s } from './state.js';
import { isTileDefended } from './buildings.js';

export function calcIsBorder(idx) {
  const owner = s.grid[idx];
  if (owner < 0) return false;
  const x = idx % s.GRID_W, y = (idx / s.GRID_W) | 0;
  return (
    (x > 0 && s.grid[idx - 1] !== owner && s.terrain[idx - 1] > 0) ||
    (x < s.GRID_W - 1 && s.grid[idx + 1] !== owner && s.terrain[idx + 1] > 0) ||
    (y > 0 && s.grid[idx - s.GRID_W] !== owner && s.terrain[idx - s.GRID_W] > 0) ||
    (y < s.GRID_H - 1 && s.grid[idx + s.GRID_W] !== owner && s.terrain[idx + s.GRID_W] > 0)
  );
}

export function updateBorders(idx) {
  const update = (i) => {
    if (i < 0 || i >= s.GRID_W * s.GRID_H) return;
    const o = s.grid[i]; if (o < 0) return;
    const ps = s.playerStates[o];
    if (calcIsBorder(i)) ps.borderTiles.add(i); else ps.borderTiles.delete(i);
  };
  const x = idx % s.GRID_W, y = (idx / s.GRID_W) | 0;
  update(idx);
  if (x > 0) update(idx - 1);
  if (x < s.GRID_W - 1) update(idx + 1);
  if (y > 0) update(idx - s.GRID_W);
  if (y < s.GRID_H - 1) update(idx + s.GRID_W);
}

export function conquer(newOwner, idx) {
  const oldOwner = s.grid[idx];
  const x = idx % s.GRID_W, y = (idx / s.GRID_W) | 0;
  if (oldOwner >= 0) {
    s.playerStates[oldOwner].cellCount--;
    s.playerStates[oldOwner].borderTiles.delete(idx);
    s.centersSumX[oldOwner] -= x; s.centersSumY[oldOwner] -= y; s.centersN[oldOwner]--;

    if (s.playerStates[oldOwner].cellCount <= 0 && s.playerStates[oldOwner].alive) {
      const stolen = s.playerStates[oldOwner].gold;
      s.playerStates[newOwner].gold += stolen;
      s.playerStates[oldOwner].gold = 0;
    }
  }
  s.grid[idx] = newOwner;
  s.playerStates[newOwner].cellCount++;
  s.centersSumX[newOwner] += x; s.centersSumY[newOwner] += y; s.centersN[newOwner]++;
  updateBorders(idx);
  s.tileChanges.push(idx, newOwner);
  if (s.citySet.has(idx)) {
    const city = s.cities.find(c => c.idx === idx);
    if (city) {
      if (oldOwner >= 0) s.playerStates[oldOwner].cityCount--;
      city.owner = newOwner;
      s.playerStates[newOwner].cityCount++;
    }
  }
  if (s.dpostSet.has(idx)) {
    const dpIdx = s.defensePosts.findIndex(d => d.idx === idx);
    if (dpIdx >= 0) {
      if (oldOwner >= 0) s.playerStates[oldOwner].dpostCount--;
      s.destroyedDposts.push({ idx, owner: oldOwner });
      s.defensePosts.splice(dpIdx, 1);
      s.dpostSet.delete(idx);
    }
  }
  if (s.econBuildingSet.has(idx)) {
    const eb = s.econBuildings.find(b => b.idx === idx);
    if (eb) { eb.owner = newOwner; }
  }
}

export function processExpansions() {
  for (let i = 0; i < s.playerStates.length; i++) {
    const ps = s.playerStates[i];
    if (!ps.alive) { ps.attacks = []; ps.expanding = false; ps.attackTarget = null; ps.attackTroops = 0; continue; }
    if (ps.borderTiles.size === 0) { ps.attacks = []; ps.expanding = false; ps.attackTarget = null; ps.attackTroops = 0; continue; }

    for (let ai = ps.attacks.length - 1; ai >= 0; ai--) {
      const atk = ps.attacks[ai];
      if (atk.troops < 1) { ps.attacks.splice(ai, 1); continue; }
      if (atk.target >= 0 && atk.target < s.playerStates.length && !s.playerStates[atk.target].alive) {
        ps.troops += atk.troops; ps.attacks.splice(ai, 1); continue;
      }

      const target = atk.target;
      let captured = 0;
      let capturebudget = target === -1 ? s.CELLS_PER_TICK * 3 : s.CELLS_PER_TICK * 2;
      capturebudget = Math.max(1, Math.floor(capturebudget / Math.max(1, ps.attacks.length)));

      const skip = (Math.random() * ps.borderTiles.size) | 0;
      let sc = 0;
      for (const fIdx of ps.borderTiles) {
        if (captured >= capturebudget || atk.troops < 1) break;
        if (sc++ < skip) continue;
        const fx = fIdx % s.GRID_W, fy = (fIdx / s.GRID_W) | 0;
        const r = (Math.random() * 4) | 0;
        const ox = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (let d = 0; d < 4; d++) {
          const [dx, dy] = ox[(r + d) & 3];
          const nx = fx + dx, ny = fy + dy;
          if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
          const nIdx = ny * s.GRID_W + nx;
          if (s.grid[nIdx] !== target || s.terrain[nIdx] === 0) continue;
          const ter = s.terrain[nIdx];
          let cost;
          if (target === -1) { cost = s.isSpectateMode ? WILD_COST[ter] * 0.1 : WILD_COST[ter]; }
          else {
            const defPs = s.playerStates[target];
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

    if (ps.attacks.length > 0) {
      ps.expanding = true;
      ps.attackTarget = ps.attacks[0].target;
      ps.attackTroops = ps.attacks.reduce((sum, a) => sum + a.troops, 0);
    } else {
      ps.expanding = false;
      ps.attackTarget = null;
      ps.attackTroops = 0;
    }
  }
}

export function processBeachheads() {
  const BEACHHEAD_RANGE = 40;
  for (let i = 0; i < s.playerStates.length; i++) {
    const ps = s.playerStates[i];
    if (!ps.alive) continue;
    for (let b = ps.beachheads.length - 1; b >= 0; b--) {
      const bh = ps.beachheads[b];
      if (bh.troops < 1) { ps.beachheads.splice(b, 1); continue; }

      if (bh.target >= 0 && bh.target < s.playerStates.length && !s.playerStates[bh.target].alive) {
        ps.troops += bh.troops;
        ps.beachheads.splice(b, 1);
        continue;
      }

      const lx = bh.landingIdx % s.GRID_W, ly = (bh.landingIdx / s.GRID_W) | 0;
      const activeFront = new Set();
      for (const idx of ps.borderTiles) {
        const x = idx % s.GRID_W, y = (idx / s.GRID_W) | 0;
        if (Math.abs(x - lx) + Math.abs(y - ly) > BEACHHEAD_RANGE) continue;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
          const ni = ny * s.GRID_W + nx;
          if (s.grid[ni] === bh.target && s.terrain[ni] > 0) { activeFront.add(idx); break; }
        }
      }

      if (activeFront.size === 0) {
        ps.troops += bh.troops;
        ps.beachheads.splice(b, 1);
        continue;
      }

      let captured = 0;
      const budget = Math.max(3, Math.floor(s.CELLS_PER_TICK / 2));
      for (const fIdx of activeFront) {
        if (captured >= budget || bh.troops < 1) break;
        const fx = fIdx % s.GRID_W, fy = (fIdx / s.GRID_W) | 0;
        const r = (Math.random() * 4) | 0;
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (let d = 0; d < 4; d++) {
          const [dx, dy] = dirs[(r + d) & 3];
          const nx = fx + dx, ny = fy + dy;
          if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
          const nIdx = ny * s.GRID_W + nx;
          if (s.grid[nIdx] !== bh.target || s.terrain[nIdx] === 0) continue;
          const ter = s.terrain[nIdx];
          let cost;
          if (bh.target === -1) {
            cost = s.isSpectateMode ? WILD_COST[ter] * 0.1 : WILD_COST[ter];
          } else {
            const defPs = s.playerStates[bh.target];
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

export function generateTroops(dt, econGold) {
  const ticks = dt / 100;
  for (let i = 0; i < s.playerStates.length; i++) {
    const ps = s.playerStates[i];
    if (!ps.alive || ps.cellCount === 0) continue;
    let max = maxTroopsForTiles(ps.cellCount, ps.cityCount);
    if (ps.isBot) max = Math.floor(max * (s.isSpectateMode ? 1.0 : 0.7));
    if (ps.troops >= max) { ps.troops = max; continue; }
    let toAdd = (3.25 + Math.pow(Math.max(0, ps.troops), 0.65) / 3.7) * (1 - ps.troops / max) * ticks;
    if (ps.isBot && !s.isSpectateMode) toAdd *= 0.8;
    if (s.isSpectateMode) toAdd *= 3;
    ps.troops = Math.min(ps.troops + toAdd, max);
    let goldRate = (0.008 + ps.cellCount * 0.00004) + econGold.total[i];
    if (s.isSpectateMode) goldRate *= 5;
    ps.gold += goldRate * ticks;
  }
}

function maxTroopsForTiles(t, cityCount) {
  return Math.floor(Math.pow(t, 0.6) * 12 + 150 + (cityCount || 0) * 500);
}

export function checkElimination() {
  let go = false, w = null;
  for (let i = 0; i < s.playerStates.length; i++) {
    const ps = s.playerStates[i];
    if (ps.alive && ps.cellCount <= 0) { ps.alive = false; ps.expanding = false; ps.attackTarget = null; }
  }
  if (s.isSpectateMode) {
    if (s.playerStates.filter(ps => ps.alive).length <= 1) go = true;
  } else {
    if (!s.playerPlaced) return { gameOver: false, winner: null };
    if (!s.playerStates[0].alive && s.playerStates[0].cellCount <= 0) go = true;
    else if (s.playerStates[0].alive && s.totalLandTiles > 0 && s.playerStates[0].cellCount / s.totalLandTiles >= 0.8) { go = true; w = 0; }
    else if (s.playerStates.filter(ps => ps.alive).length <= 1) { go = true; w = s.playerStates[0].alive ? 0 : null; }
  }
  return { gameOver: go, winner: w };
}
