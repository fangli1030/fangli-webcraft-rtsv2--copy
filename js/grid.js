// grid.js — Grid cell painting, border/defended map computation, distance map

export class GridManager {
  constructor(renderer) {
    this.r = renderer;
  }

  get GRID_W() { return this.r.GRID_W; }
  get GRID_H() { return this.r.GRID_H; }

  calcBorder(idx) {
    const g = this.r.grid, GRID_W = this.GRID_W;
    const o = g[idx]; if (o < 0) return false;
    const x = idx % GRID_W, y = (idx / GRID_W) | 0;
    return (x > 0 && g[idx - 1] !== o) ||
      (x < GRID_W - 1 && g[idx + 1] !== o) ||
      (y > 0 && g[idx - GRID_W] !== o) ||
      (y < GRID_W - 1 + (this.GRID_H - 1) * GRID_W && g[idx + GRID_W] !== o);
  }

  calcDefended(idx) {
    const owner = this.r.grid[idx], GRID_W = this.GRID_W;
    if (owner < 0 || !this.r.defensePosts) return false;
    const tx = idx % GRID_W, ty = (idx / GRID_W) | 0;
    for (const dp of this.r.defensePosts) {
      if (dp.owner !== owner) continue;
      const dx = dp.idx % GRID_W, dy = (dp.idx / GRID_W) | 0;
      if (Math.abs(tx - dx) + Math.abs(ty - dy) <= 20) return true;
    }
    return false;
  }

  calcDistMap() {
    const dm = this.r.distMap, GRID_W = this.GRID_W, GRID_H = this.GRID_H;
    dm.fill(255);
    const queue = [];
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      if (this.r.borderMap[i]) { dm[i] = 0; queue.push(i); }
    }
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const d = dm[idx] + 1;
      if (d > 3) continue;
      const o = this.r.grid[idx], x = idx % GRID_W, y = (idx / GRID_W) | 0;
      const nbrs = [];
      if (x > 0) nbrs.push(idx - 1);
      if (x < GRID_W - 1) nbrs.push(idx + 1);
      if (y > 0) nbrs.push(idx - GRID_W);
      if (y < GRID_H - 1) nbrs.push(idx + GRID_W);
      for (const ni of nbrs) {
        if (this.r.grid[ni] === o && dm[ni] > d) {
          dm[ni] = d;
          queue.push(ni);
        }
      }
    }
  }

  updateDistMapLocal(centerIdx) {
    const R = 6, GRID_W = this.GRID_W, GRID_H = this.GRID_H;
    const cx = centerIdx % GRID_W, cy = (centerIdx / GRID_W) | 0;
    const x0 = Math.max(0, cx - R), x1 = Math.min(GRID_W - 1, cx + R);
    const y0 = Math.max(0, cy - R), y1 = Math.min(GRID_H - 1, cy + R);
    const dm = this.r.distMap;
    const affected = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * GRID_W + x;
      if (this.r.grid[i] >= 0) { dm[i] = 255; affected.push(i); }
    }
    const queue = [];
    for (const i of affected) {
      if (this.r.borderMap[i]) { dm[i] = 0; queue.push(i); }
    }
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const d = dm[idx] + 1;
      if (d > 3) continue;
      const o = this.r.grid[idx], x = idx % GRID_W, y = (idx / GRID_W) | 0;
      const nbrs = [];
      if (x > 0) nbrs.push(idx - 1);
      if (x < GRID_W - 1) nbrs.push(idx + 1);
      if (y > 0) nbrs.push(idx - GRID_W);
      if (y < GRID_H - 1) nbrs.push(idx + GRID_W);
      for (const ni of nbrs) {
        if (this.r.grid[ni] === o && dm[ni] > d) {
          dm[ni] = d;
          queue.push(ni);
        }
      }
    }
    for (const i of affected) this.paintCell(i);
  }

  paintCell(idx) {
    const o = this.r.grid[idx], t = this.r.terrain[idx], colors = this.r.colors;
    if (t === 0) this.r.data32[idx] = this.r.waterC[idx];
    else if (o === -1) this.r.data32[idx] = colors.terrainC[t];
    else if (this.r.defendedMap[idx]) {
      const gx = idx % this.GRID_W, gy = (idx / this.GRID_W) | 0;
      this.r.data32[idx] = (gx + gy) % 2 === 0 ? colors.playerDefBCLight[o][t] : colors.playerDefBCDark[o][t];
    } else {
      const d = Math.min(this.r.distMap[idx], 3);
      this.r.data32[idx] = this.r.borderMap[idx] ? colors.playerBC[o][t] : colors.playerGrad[o][d][t];
    }
  }

  applyChange(idx, newOwner) {
    const GRID_W = this.GRID_W, GRID_H = this.GRID_H;
    this.r.grid[idx] = newOwner;
    const x = idx % GRID_W, y = (idx / GRID_W) | 0;
    const cells = [idx];
    if (x > 0) cells.push(idx - 1);
    if (x < GRID_W - 1) cells.push(idx + 1);
    if (y > 0) cells.push(idx - GRID_W);
    if (y < GRID_H - 1) cells.push(idx + GRID_W);
    for (const i of cells) {
      this.r.borderMap[i] = (this.r.grid[i] >= 0 && this.calcBorder(i)) ? 1 : 0;
      this.r.defendedMap[i] = (this.r.borderMap[i] && this.calcDefended(i)) ? 1 : 0;
    }
    this.updateDistMapLocal(idx);
  }

  fullRedraw() {
    const GRID_W = this.GRID_W, GRID_H = this.GRID_H;
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      if (this.r.grid[i] >= 0) this.r.borderMap[i] = this.calcBorder(i) ? 1 : 0;
      this.r.defendedMap[i] = (this.r.borderMap[i] && this.calcDefended(i)) ? 1 : 0;
    }
    this.calcDistMap();
    for (let i = 0; i < GRID_W * GRID_H; i++) this.paintCell(i);
  }

  refreshDefendedMap() {
    for (let i = 0; i < this.GRID_W * this.GRID_H; i++) {
      if (!this.r.borderMap[i]) { this.r.defendedMap[i] = 0; continue; }
      const was = this.r.defendedMap[i];
      this.r.defendedMap[i] = this.calcDefended(i) ? 1 : 0;
      if (this.r.defendedMap[i] !== was) this.paintCell(i);
    }
  }
}
