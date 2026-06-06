// worker/boats.js — Boat pathfinding, launching, and per-tick processing

import { COST_SCALE, MAX_BOATS, BOAT_TROOP_FRACTION, WILD_COST, ENEMY_BASE_COST, hash } from './constants.js';
import { state as s } from './state.js';
import { conquer } from './grid.js';

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
    pts.push(y * s.GRID_W + x);
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
    const idx = y * s.GRID_W + x;
    if (s.terrain[idx] !== 0 || s.waterMag[idx] < minMag) return false;
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
      const x0 = path[curr] % s.GRID_W, y0 = path[curr] / s.GRID_W | 0;
      const x1 = path[mid] % s.GRID_W, y1 = path[mid] / s.GRID_W | 0;
      if (lineOfSightClear(x0, y0, x1, y1, minMag)) {
        farthest = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (farthest > curr + 1) {
      const x0 = path[curr] % s.GRID_W, y0 = path[curr] / s.GRID_W | 0;
      const x1 = path[farthest] % s.GRID_W, y1 = path[farthest] / s.GRID_W | 0;
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

function findBoatEndpoints(owner, targetGx, targetGy) {
  const targetIdx = targetGy * s.GRID_W + targetGx;
  const targetOwner = s.grid[targetIdx];

  const ownerShores = [];
  for (const idx of s.playerStates[owner].borderTiles) {
    const x = idx % s.GRID_W, y = (idx / s.GRID_W) | 0;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < s.GRID_W && ny >= 0 && ny < s.GRID_H && s.terrain[ny * s.GRID_W + nx] === 0) {
        ownerShores.push(idx);
        break;
      }
    }
  }
  if (ownerShores.length === 0) return null;

  const waterDist = new Map();
  const waterSrc = new Map();
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

  for (const shoreIdx of ownerShores) {
    const sx = shoreIdx % s.GRID_W, sy = (shoreIdx / s.GRID_W) | 0;
    let bestNi = -1, bestConn = -1;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = sx + dx, ny = sy + dy;
      if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
      const ni = ny * s.GRID_W + nx;
      if (s.terrain[ni] !== 0) continue;
      let conn = 0;
      for (const [dx2, dy2] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx2 = nx + dx2, ny2 = ny + dy2;
        if (nx2 < 0 || nx2 >= s.GRID_W || ny2 < 0 || ny2 >= s.GRID_H) continue;
        if (s.terrain[ny2 * s.GRID_W + nx2] === 0) conn++;
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
    const cidx = curr.idx, cCost = curr.cost;
    if (waterDist.get(cidx) < cCost) continue;
    const cx = cidx % s.GRID_W, cy = cidx / s.GRID_W | 0;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
      const ni = ny * s.GRID_W + nx;
      if (s.terrain[ni] !== 0) continue;
      const stepCost = getWaterCost(s.waterMag[ni]);
      const nCost = cCost + stepCost;
      const oldCost = waterDist.get(ni);
      if (oldCost !== undefined && nCost >= oldCost) continue;
      waterDist.set(ni, nCost);
      waterSrc.set(ni, waterSrc.get(cidx));
      dHeapPush({ idx: ni, cost: nCost });
    }
  }

  const visited = new Set([targetIdx]);
  const landQueue = [targetIdx];
  let lhead = 0;
  let bestDest = -1, bestSrc2 = -1, bestDistVal = Infinity;
  while (lhead < landQueue.length && lhead < 5000) {
    const curr = landQueue[lhead++];
    const cx = curr % s.GRID_W, cy = (curr / s.GRID_W) | 0;
    for (const [ddx, ddy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = cx + ddx, ny = cy + ddy;
      if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
      const ni = ny * s.GRID_W + nx;
      if (visited.has(ni)) continue;
      visited.add(ni);
      if (s.terrain[ni] === 0) {
        if (s.grid[curr] !== targetOwner && s.grid[curr] !== -1) continue;
        const wd = waterDist.get(ni);
        if (wd !== undefined && wd < bestDistVal) {
          bestDistVal = wd;
          bestDest = curr;
          bestSrc2 = waterSrc.get(ni);
        }
        continue;
      }
      if (s.grid[ni] !== targetOwner && s.grid[ni] !== -1) continue;
      landQueue.push(ni);
    }
  }

  if (bestDest < 0 || bestSrc2 < 0) return null;
  if (bestDest === bestSrc2) return null;
  return { srcShore: bestSrc2, destShore: bestDest };
}

function findWaterPath(srcIdx, dstIdx) {
  const sx = srcIdx % s.GRID_W, sy = (srcIdx / s.GRID_W) | 0;
  const dx = dstIdx % s.GRID_W, dy = (dstIdx / s.GRID_W) | 0;

  let bestStart = -1, bestStartConn = -1;
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nx = sx + ox, ny = sy + oy;
    if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
    const ni = ny * s.GRID_W + nx;
    if (s.terrain[ni] !== 0) continue;
    let conn = 0;
    for (const [dx2, dy2] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx2 = nx + dx2, ny2 = ny + dy2;
      if (nx2 < 0 || nx2 >= s.GRID_W || ny2 < 0 || ny2 >= s.GRID_H) continue;
      if (s.terrain[ny2 * s.GRID_W + nx2] === 0) conn++;
    }
    if (conn > bestStartConn || (conn === bestStartConn && bestStart === -1)) { bestStartConn = conn; bestStart = ni; }
  }
  if (bestStart === -1) return null;

  let bestEnd = -1, bestEndConn = -1;
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nx = dx + ox, ny = dy + oy;
    if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
    const ni = ny * s.GRID_W + nx;
    if (s.terrain[ni] !== 0) continue;
    let conn = 0;
    for (const [dx2, dy2] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx2 = nx + dx2, ny2 = ny + dy2;
      if (nx2 < 0 || nx2 >= s.GRID_W || ny2 < 0 || ny2 >= s.GRID_H) continue;
      if (s.terrain[ny2 * s.GRID_W + nx2] === 0) conn++;
    }
    if (conn > bestEndConn || (conn === bestEndConn && bestEnd === -1)) { bestEndConn = conn; bestEnd = ni; }
  }
  if (bestEnd === -1) return null;

  if (s.waterComponent[bestStart] !== s.waterComponent[bestEnd]) return null;

  const ex = bestEnd % s.GRID_W, ey = bestEnd / s.GRID_W | 0;
  const dxGoal = ex - (bestStart % s.GRID_W), dyGoal = ey - (bestStart / s.GRID_W | 0);
  const crossNorm = Math.max(1, Math.abs(dxGoal) + Math.abs(dyGoal));

  const open = [];
  const gScore = new Map();
  const parent = new Map();
  const closed = new Set();

  function heapPush(item) {
    open.push(item);
    let i = open.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (open[p].f <= open[i].f) break; [open[p], open[i]] = [open[i], open[p]]; i = p; }
  }
  function heapPop() {
    if (open.length === 0) return null;
    const top = open[0]; const last = open.pop();
    if (open.length > 0) { open[0] = last; let i = 0; while (true) { const l = i * 2 + 1, r = l + 1; let sm = i; if (l < open.length && open[l].f < open[sm].f) sm = l; if (r < open.length && open[r].f < open[sm].f) sm = r; if (sm === i) break; [open[i], open[sm]] = [open[sm], open[i]]; i = sm; } }
    return top;
  }

  gScore.set(bestStart, 0);
  const h0 = 5 * COST_SCALE * (Math.abs((bestStart % s.GRID_W) - ex) + Math.abs((bestStart / s.GRID_W | 0) - ey));
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
      const path = [dstIdx]; let c = cidx;
      while (c !== srcIdx) { path.push(c); c = parent.get(c); }
      path.push(srcIdx);
      return smoothPath(path.reverse());
    }
    const cx = cidx % s.GRID_W, cy = cidx / s.GRID_W | 0;
    const g = gScore.get(cidx) || 0;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
      const ni = ny * s.GRID_W + nx;
      if (s.terrain[ni] !== 0 || closed.has(ni)) continue;
      const stepCost = getWaterCost(s.waterMag[ni]);
      const tg = g + stepCost;
      const oldG = gScore.get(ni);
      if (oldG !== undefined && tg >= oldG) continue;
      const h = 5 * COST_SCALE * (Math.abs(nx - ex) + Math.abs(ny - ey));
      const cross = Math.abs(dxGoal * (ny - ey) - dyGoal * (nx - ex));
      const tie = Math.floor(cross * 99 / (crossNorm * crossNorm));
      gScore.set(ni, tg);
      parent.set(ni, cidx);
      heapPush({ idx: ni, f: tg + h + tie });
    }
  }
  return null;
}

export function launchBoat(owner, targetGx, targetGy) {
  const ps = s.playerStates[owner];
  if (!ps.alive || ps.troops < 5) return null;
  if (s.boats.filter(b => b.owner === owner).length >= MAX_BOATS) return null;
  if (s.terrain[targetGy * s.GRID_W + targetGx] === 0) return null;

  const endpoints = findBoatEndpoints(owner, targetGx, targetGy);
  if (!endpoints) return null;

  const path = findWaterPath(endpoints.srcShore, endpoints.destShore);
  if (!path || path.length < 3) return null;

  const send = Math.max(1, Math.floor(ps.troops * BOAT_TROOP_FRACTION));
  ps.troops -= send;
  s.boats.push({ owner, troops: send, path, pathIdx: 0, targetIdx: endpoints.destShore, retreating: false });
  return true;
}

export function processBoats() {
  for (let i = s.boats.length - 1; i >= 0; i--) {
    const boat = s.boats[i];
    if (!s.playerStates[boat.owner].alive) { s.boats.splice(i, 1); continue; }

    boat.pathIdx += 1;
    if (boat.pathIdx >= boat.path.length - 1) {
      if (boat.retreating) {
        const ps = s.playerStates[boat.owner];
        ps.troops += Math.floor(boat.troops * 0.75);
        s.boats.splice(i, 1);
      } else {
        const destIdx = boat.path[boat.path.length - 1];
        if (s.terrain[destIdx] > 0) {
          const destOwner = s.grid[destIdx];
          if (destOwner !== boat.owner) {
            if (destOwner >= 0) {
              const defPs = s.playerStates[destOwner];
              if (defPs.cellCount > 0) defPs.troops = Math.max(0, defPs.troops - defPs.troops / defPs.cellCount);
            }
            conquer(boat.owner, destIdx);
          }
          const toCheck = [destIdx];
          const checked = new Set([destIdx]);
          let conquered = 0;
          const MAX_EXTRA = 8;
          let checkHead = 0;
          while (checkHead < toCheck.length && conquered < MAX_EXTRA) {
            const curr = toCheck[checkHead++];
            const cx = curr % s.GRID_W, cy = (curr / s.GRID_W) | 0;
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
              const nx = cx + dx, ny = cy + dy;
              if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
              const ni = ny * s.GRID_W + nx;
              if (checked.has(ni)) continue;
              checked.add(ni);
              if (s.terrain[ni] === 0) continue;
              const tileOwner = s.grid[ni];
              if (tileOwner === boat.owner) continue;
              const cost = tileOwner >= 0 ? ENEMY_BASE_COST[s.terrain[ni]] : WILD_COST[s.terrain[ni]];
              if (boat.troops < cost) continue;
              conquer(boat.owner, ni);
              boat.troops -= cost;
              conquered++;
              toCheck.push(ni);
              if (conquered >= MAX_EXTRA) break;
            }
          }
          const ps = s.playerStates[boat.owner];
          const target = destOwner >= 0 && destOwner !== boat.owner ? destOwner : -1;
          ps.beachheads.push({ landingIdx: destIdx, troops: boat.troops, target: target });
        }
        s.boats.splice(i, 1);
      }
    }
  }
}
