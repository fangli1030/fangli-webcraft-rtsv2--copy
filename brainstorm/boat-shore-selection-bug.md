# Bug Fix: Boat Source Shore Selection

## Problem
When launching a boat, the game picks the source shore tile closest to the destination **by Manhattan distance** (straight-line). This ignores the actual water path. A shore tile on the wrong side of a peninsula or landmass can be geographically close but require a very long water route — or even be on a completely different coastline.

**Example:** Player owns a U-shaped coastline. The destination is across a narrow strait on the left. The current code might pick a shore tile on the right arm of the U because it's closer by Manhattan distance, even though the water path is 10x longer.

## Root Cause
`findNearestOwnedShore()` (game-worker.js line ~568):
1. Finds all player shore tiles (border tiles adjacent to water)
2. Sorts by `Math.abs(x - dsx) + Math.abs(y - dsy)` — Manhattan distance to the destination shore
3. Tries the top 10 closest, picking the first with a water-connected BFS
4. The BFS only checks connectivity (can it reach?), not path length

The sort criterion is wrong. Manhattan distance on land doesn't correlate with water path distance.

## Fix: Sort by Water Path Length

### Approach
Instead of sorting by Manhattan distance and then doing a binary "connected?" BFS, do a **single reverse BFS from the destination water tiles** outward through all water. This gives the actual water distance to every water tile on the map in one pass. Then for each candidate shore tile, look up the water distance of its adjacent water tiles and pick the minimum.

### Implementation (game-worker.js)

Replace the current `findNearestOwnedShore()` with:

```js
function findNearestOwnedShore(owner, targetX, targetY) {
  const targetIdx = targetY * GRID_W + targetX;
  const destShore = findNearestLandShore(targetIdx);
  if (destShore < 0) return -1;
  const dsx = destShore % GRID_W, dsy = (destShore / GRID_W) | 0;

  // BFS from destination water tiles to compute water distance to all reachable water
  const destWaterSeeds = [];
  for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nx = dsx + dx, ny = dsy + dy;
    if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H && terrain[ny * GRID_W + nx] === 0)
      destWaterSeeds.push(ny * GRID_W + nx);
  }
  if (destWaterSeeds.length === 0) return -1;

  // waterDist[idx] = BFS distance from destination water. Only water tiles.
  const waterDist = new Map();
  const queue = [];
  for (const seed of destWaterSeeds) {
    waterDist.set(seed, 0);
    queue.push(seed);
  }
  let head = 0;
  while (head < queue.length && head < 50000) {
    const curr = queue[head++];
    const d = waterDist.get(curr);
    const cx = curr % GRID_W, cy = (curr / GRID_W) | 0;
    for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      const ni = ny * GRID_W + nx;
      if (terrain[ni] !== 0 || waterDist.has(ni)) continue;
      waterDist.set(ni, d + 1);
      queue.push(ni);
    }
  }

  // For each candidate shore tile, find its best adjacent water distance
  let bestIdx = -1, bestWaterDist = Infinity;
  for (const idx of playerStates[owner].borderTiles) {
    const x = idx % GRID_W, y = (idx / GRID_W) | 0;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      const ni = ny * GRID_W + nx;
      if (terrain[ni] !== 0) continue;
      const wd = waterDist.get(ni);
      if (wd !== undefined && wd < bestWaterDist) {
        bestWaterDist = wd;
        bestIdx = idx;
      }
    }
  }
  return bestIdx;
}
```

### Key differences from current code
- **One BFS** from dest water outward (up to 50k tiles) computes real water distances
- Candidate selection uses **actual water path distance**, not Manhattan
- No need for the `candidates.slice(0, 10)` limit — we check all border tiles but with a simple lookup per tile (O(1) per adjacent water tile)
- Automatically handles connectivity — tiles not reachable by water won't have a `waterDist` entry

### Performance
- The BFS is bounded to 50k tiles (vs current 20k per candidate × up to 10 candidates = 200k worst case)
- Only runs once per boat launch, not per tick
- Net improvement: faster and more correct

### Risk
- Slightly more memory (Map of up to 50k entries, transient)
- None of this affects the tick loop — only runs on right-click
