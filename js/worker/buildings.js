// worker/buildings.js — City, defense post, and economy building placement and queries

import {
  CITY_COST, CITY_MIN_DIST, DPOST_RANGE,
  FARM_COST, MINE_COST, MILL_COST, FACTORY_COST,
  ECON_RADIUS, MILL_RADIUS,
  FARM_BASE_GOLD, MINE_BASE_GOLD,
  MILL_BOOST, FACTORY_BOOST,
  MILL_STACK_PENALTY, FACTORY_STACK_PENALTY,
  T_PLAINS, T_MOUNTAIN,
} from './constants.js';
import { state as s } from './state.js';

// --- Defense posts ---

export function isTileDefended(idx, owner) {
  const tx = idx % s.GRID_W, ty = (idx / s.GRID_W) | 0;
  for (const dp of s.defensePosts) {
    if (dp.owner !== owner) continue;
    const dx = dp.idx % s.GRID_W, dy = (dp.idx / s.GRID_W) | 0;
    if (Math.abs(tx - dx) + Math.abs(ty - dy) <= DPOST_RANGE) return true;
  }
  return false;
}

export function dpostCost(count) { return Math.min(150, 25 + count * 25); }

export function placeDefensePost(owner, idx) {
  const ps = s.playerStates[owner];
  const cost = dpostCost(ps.dpostCount);
  if (ps.gold < cost) return false;
  if (s.terrain[idx] === 0 || s.grid[idx] !== owner) return false;
  if (s.dpostSet.has(idx) || s.citySet.has(idx)) return false;
  ps.gold -= cost;
  ps.dpostCount++;
  s.defensePosts.push({ idx, owner });
  s.dpostSet.add(idx);
  return true;
}

export function tryPlaceDefensePost(owner) {
  const ps = s.playerStates[owner];
  const candidates = [];
  for (const idx of ps.borderTiles) {
    if (s.dpostSet.has(idx) || s.citySet.has(idx)) continue;
    if (s.terrain[idx] === 0) continue;
    candidates.push(idx);
  }
  if (candidates.length === 0) return;
  placeDefensePost(owner, candidates[(Math.random() * candidates.length) | 0]);
}

// --- Cities ---

export function canPlaceCity(idx) {
  if (s.terrain[idx] === 0 || s.grid[idx] < 0) return false;
  if (s.citySet.has(idx)) return false;
  const x = idx % s.GRID_W, y = (idx / s.GRID_W) | 0;
  for (const c of s.cities) {
    const cx = c.idx % s.GRID_W, cy = (c.idx / s.GRID_W) | 0;
    if (Math.abs(x - cx) + Math.abs(y - cy) < CITY_MIN_DIST) return false;
  }
  return true;
}

export function cityCost(cityCount) { return Math.min(500, CITY_COST * Math.pow(2, cityCount)); }

export function placeCity(owner, idx) {
  const ps = s.playerStates[owner];
  const cost = cityCost(ps.cityCount);
  if (ps.gold < cost || !canPlaceCity(idx)) return false;
  if (s.grid[idx] !== owner) return false;
  ps.gold -= cost;
  ps.cityCount++;
  s.cities.push({ idx, owner });
  s.citySet.add(idx);
  return true;
}

export function tryPlaceCity(owner) {
  const ps = s.playerStates[owner];
  const tiles = [];
  for (let y = 0; y < s.GRID_H; y++)
    for (let x = 0; x < s.GRID_W; x++) {
      const idx = y * s.GRID_W + x;
      if (s.grid[idx] === owner && !ps.borderTiles.has(idx) && canPlaceCity(idx)) tiles.push(idx);
    }
  if (tiles.length === 0) return;
  placeCity(owner, tiles[(Math.random() * tiles.length) | 0]);
}

// --- Economy buildings ---

function tilesInRadius(cx, cy, radius) {
  const result = [];
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
      result.push(ny * s.GRID_W + nx);
    }
  }
  return result;
}

export function placeEconBuilding(owner, idx, type) {
  const ps = s.playerStates[owner];
  const costs = { farm: FARM_COST, mine: MINE_COST, mill: MILL_COST, factory: FACTORY_COST };
  const cost = costs[type];
  if (!cost || ps.gold < cost) return false;
  if (s.terrain[idx] === 0 || s.grid[idx] !== owner) return false;
  if (s.econBuildingSet.has(idx) || s.citySet.has(idx) || s.dpostSet.has(idx)) return false;

  ps.gold -= cost;
  const bx = idx % s.GRID_W, by = (idx / s.GRID_W) | 0;
  const building = { idx, owner, type, claimedTiles: [], output: 0, id: s.econBuildings.length };

  if (type === 'farm' || type === 'mine') {
    const targetTerrain = type === 'farm' ? T_PLAINS : T_MOUNTAIN;
    const tiles = tilesInRadius(bx, by, ECON_RADIUS);
    for (const t of tiles) {
      if (s.terrain[t] === targetTerrain && s.terrainClaimed[t] === 0) {
        s.terrainClaimed[t] = building.id + 1;
        building.claimedTiles.push(t);
      }
    }
    const baseGold = type === 'farm' ? FARM_BASE_GOLD : MINE_BASE_GOLD;
    building.output = baseGold * building.claimedTiles.length;
  }

  s.econBuildings.push(building);
  s.econBuildingSet.add(idx);
  recalcProcessors();
  return true;
}

export function recalcProcessors() {
  for (const b of s.econBuildings) {
    if (b.type !== 'mill' && b.type !== 'factory') continue;
    const bx = b.idx % s.GRID_W, by = (b.idx / s.GRID_W) | 0;
    const targetType = b.type === 'mill' ? 'farm' : 'mine';
    const tiles = tilesInRadius(bx, by, MILL_RADIUS);
    const tileSet = new Set(tiles);

    let connectedCount = 0;
    for (const other of s.econBuildings) {
      if (other.type === targetType && tileSet.has(other.idx)) connectedCount++;
    }

    let stackCount = 0;
    for (const other of s.econBuildings) {
      if (other.type === b.type && other.idx !== b.idx && tileSet.has(other.idx)) stackCount++;
    }

    const boost = b.type === 'mill' ? MILL_BOOST : FACTORY_BOOST;
    const penalty = b.type === 'mill' ? MILL_STACK_PENALTY : FACTORY_STACK_PENALTY;
    const stackMult = Math.max(0.1, 1 - stackCount * penalty);
    b.connectedCount = connectedCount;
    b.stackMult = stackMult;
    b.output = 0;
  }
}

export function getEconGoldPerTick() {
  const buildingOutputs = new Map();
  for (const b of s.econBuildings) {
    if (b.type === 'farm' || b.type === 'mine') {
      buildingOutputs.set(b.id, b.output);
    }
  }

  for (const b of s.econBuildings) {
    if (b.type !== 'mill' && b.type !== 'factory') continue;
    const bx = b.idx % s.GRID_W, by = (b.idx / s.GRID_W) | 0;
    const targetType = b.type === 'mill' ? 'farm' : 'mine';
    const tiles = tilesInRadius(bx, by, MILL_RADIUS);
    const tileSet = new Set(tiles);

    const boost = (b.type === 'mill' ? MILL_BOOST : FACTORY_BOOST) * b.stackMult;
    for (const other of s.econBuildings) {
      if (other.type === targetType && tileSet.has(other.idx)) {
        const cur = buildingOutputs.get(other.id) || other.output;
        buildingOutputs.set(other.id, cur * (1 + boost));
      }
    }
  }

  const goldPerOwner = new Float64Array(s.playerStates.length);
  const farmGoldPerOwner = new Float64Array(s.playerStates.length);
  const mineGoldPerOwner = new Float64Array(s.playerStates.length);
  for (const b of s.econBuildings) {
    if (b.type === 'farm' || b.type === 'mine') {
      const val = buildingOutputs.get(b.id) || b.output;
      goldPerOwner[b.owner] += val;
      if (b.type === 'farm') farmGoldPerOwner[b.owner] += val;
      else mineGoldPerOwner[b.owner] += val;
    }
  }
  return { total: goldPerOwner, farms: farmGoldPerOwner, mines: mineGoldPerOwner };
}

export function queryBuildingPreview(type, idx) {
  const bx = idx % s.GRID_W, by = (idx / s.GRID_W) | 0;
  if (type === 'farm' || type === 'mine') {
    const targetTerrain = type === 'farm' ? T_PLAINS : T_MOUNTAIN;
    const tiles = tilesInRadius(bx, by, ECON_RADIUS);
    const claimable = [], claimed = [];
    for (const t of tiles) {
      if (s.terrain[t] !== targetTerrain) continue;
      if (s.terrainClaimed[t] === 0) claimable.push(t);
      else claimed.push(t);
    }
    const processorType = type === 'farm' ? 'mill' : 'factory';
    const connectedProcessors = [];
    for (const b of s.econBuildings) {
      if (b.type !== processorType) continue;
      const pbx = b.idx % s.GRID_W, pby = (b.idx / s.GRID_W) | 0;
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
    for (const b of s.econBuildings) {
      if (b.type === targetType && tileSet.has(b.idx)) connected.push(b.idx);
      if (b.type === type && b.idx !== idx && tileSet.has(b.idx)) stackCount++;
    }
    return { type, radius: MILL_RADIUS, connected, stackCount, totalRadius: tiles.length };
  }
}

export function queryBuildingInspect(buildingIdx) {
  const b = s.econBuildings.find(eb => eb.idx === buildingIdx);
  if (!b) return null;

  const chain = { type: b.type, idx: b.idx, radius: b.type === 'mill' || b.type === 'factory' ? MILL_RADIUS : ECON_RADIUS,
    producers: [], processors: [], allClaimedTiles: [] };

  if (b.type === 'farm' || b.type === 'mine') {
    chain.producers.push({ idx: b.idx, claimedTiles: b.claimedTiles, output: b.output });
    chain.allClaimedTiles.push(...b.claimedTiles);

    const processorType = b.type === 'farm' ? 'mill' : 'factory';
    for (const proc of s.econBuildings) {
      if (proc.type !== processorType) continue;
      const px = proc.idx % s.GRID_W, py = (proc.idx / s.GRID_W) | 0;
      const bx2 = b.idx % s.GRID_W, by2 = (b.idx / s.GRID_W) | 0;
      if ((px - bx2) * (px - bx2) + (py - by2) * (py - by2) > MILL_RADIUS * MILL_RADIUS) continue;

      chain.processors.push({ idx: proc.idx, radius: MILL_RADIUS, stackMult: proc.stackMult });

      const ptiles = tilesInRadius(px, py, MILL_RADIUS);
      const ptileSet = new Set(ptiles);
      for (const other of s.econBuildings) {
        if (other.type === b.type && other.idx !== b.idx && ptileSet.has(other.idx)) {
          if (!chain.producers.find(p => p.idx === other.idx)) {
            chain.producers.push({ idx: other.idx, claimedTiles: other.claimedTiles, output: other.output });
            chain.allClaimedTiles.push(...other.claimedTiles);
          }
        }
      }
    }
  } else {
    chain.processors.push({ idx: b.idx, radius: MILL_RADIUS, stackMult: b.stackMult });
    const targetType = b.type === 'mill' ? 'farm' : 'mine';
    const bx = b.idx % s.GRID_W, by = (b.idx / s.GRID_W) | 0;
    const tiles = tilesInRadius(bx, by, MILL_RADIUS);
    const tileSet = new Set(tiles);
    for (const other of s.econBuildings) {
      if (other.type === targetType && tileSet.has(other.idx)) {
        chain.producers.push({ idx: other.idx, claimedTiles: other.claimedTiles, output: other.output });
        chain.allClaimedTiles.push(...other.claimedTiles);
      }
    }
  }

  return chain;
}
