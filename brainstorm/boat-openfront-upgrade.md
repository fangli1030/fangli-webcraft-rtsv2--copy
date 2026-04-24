# Plan: Upgrade Boat System to Match OpenFront

## Context
Our boat system uses plain BFS for pathfinding, producing zigzag paths that hug coastlines. Shore selection picks wrong coastlines. There's no boat retreat, no smooth visual interpolation, and shore coercion is naive. This plan upgrades every part of the boat pipeline to match OpenFront's approach.

## Overview of Changes
1. Store water magnitude data (distance to shore) for each water tile
2. Replace BFS pathfinding with weighted A* using shore-distance costs
3. Improve shore coercion to pick the best-connectivity water neighbor
4. Add line-of-sight path smoothing to eliminate zigzag paths
5. Precompute water components for instant connectivity checks
6. Fix shore selection to only find target-player-owned shore tiles
7. Use A*-based source shore selection (not BFS distance)
8. Add boat retreat mechanic
9. Add client-side path interpolation for smooth visual movement
10. Decouple boat movement from expansion tick

---

## Change 1: Store Water Magnitude

### Why
OpenFront's A* costs depend on how far a water tile is from the nearest shore. Our map.bin already encodes this as the lower 5 bits of each byte (`magnitude = byte & 0x1f`), but we currently throw it away — we only use it to classify land tiles into plains/highland/mountain.

### What to do

**In game.js** — in the `startWorker` method where `mapTerrain` is processed (around line 206), currently we only store terrain type (0-3). Add a second array called `waterMag` (same size as terrain) that stores the magnitude for water tiles.

For each byte in `mapTerrain`:
- If bit 7 is 0 (water tile): set `waterMag[i] = byte & 0x1f` and `terrain[i] = 0` (as before)
- If bit 7 is 1 (land tile): set `waterMag[i] = 0` and terrain as before

Pass `waterMag` to the worker alongside `terrain` in the init message.

**In game-worker.js** — accept `waterMag` from the init message and store it as a module-level `Uint8Array`, just like `terrain` and `grid` are stored. Declare it at the top alongside the other `let` declarations.

---

## Change 2: Replace BFS Pathfinding with Weighted A*

### Why
BFS treats all water tiles equally, so paths zigzag along coastlines. OpenFront's A* penalizes tiles near shore (magnitude < 3) and slightly penalizes deep ocean (magnitude > 10), making boats prefer water 3-10 tiles from shore — producing natural arcing routes.

### What to do

**In game-worker.js**, replace the `findWaterPath` function entirely with an A* implementation.

The new function should take the same arguments (`srcIdx`, `dstIdx`) and return the same format (array of tile indices from source to destination, or null).

**Cost model** (matching OpenFront exactly):
- Define `COST_SCALE = 100`
- Base cost per step: `100`
- Magnitude penalty:
  - magnitude 0-2 (near shore): add `1000` (10 × COST_SCALE)
  - magnitude 3-10 (sweet spot): add `0`
  - magnitude 11+ (deep water): add `100` (1 × COST_SCALE)
- Total step cost = `100 + penalty`

**Heuristic:**
- Use weighted Manhattan distance: `5 × 100 × (|dx| + |dy|)` where dx/dy are the coordinate differences to the goal
- The weight of 5 makes it a greedy-leaning A* (faster but not guaranteed optimal, which is fine)

**Cross-product tie-breaker** (prevents zigzag between equal-cost paths):
- Compute `dxGoal = goalX - startX`, `dyGoal = goalY - startY`
- `crossNorm = max(1, |dxGoal| + |dyGoal|)`
- For each neighbor being evaluated: `cross = |dxGoal × (ny - goalY) - dyGoal × (nx - goalX)|`
- Tie-breaker value = `floor(cross × 99 / (crossNorm × crossNorm))`
- Add this to the f-value: `f = g + h + tieBreaker`

**Priority queue:**
- Use a binary min-heap keyed by f-value. Each entry stores the tile index and f-value.
- Track g-values in a Map (tile index → g-value). A tile is "closed" when dequeued.
- Track parent in a Map (tile index → parent tile index) for path reconstruction.

**Neighbors:** 4-directional (cardinal only), same as current BFS. For each neighbor, skip if it's land (`terrain[ni] !== 0`), unless it's in the destination's `endWater` set.

**Cap:** Keep the 150k iteration cap as a safety measure.

---

## Change 3: Improve Shore Coercion

### Why
When the A* starts from a shore tile (land), it needs to enter water. Currently we just grab any adjacent water tile. OpenFront picks the adjacent water neighbor with the highest "connectivity score" — the one that has the most water neighbors of its own. This avoids starting the path in narrow channels or dead-end coves.

### What to do

**In the new `findWaterPath`**, when seeding the A* from the source shore tile, instead of adding ALL adjacent water tiles to the open set, do this:

1. For each water neighbor of the source shore tile, count how many of THAT neighbor's own 4 cardinal neighbors are also water. This count (0-4) is the connectivity score.
2. Pick the water neighbor with the highest connectivity score.
3. Seed the A* with ONLY that one best water neighbor (g=0, parent=srcIdx).

Do the same for the destination: when building the `endWater` set, pick only the destination's water neighbor with the highest connectivity score. When that tile is reached by A*, the path is found.

If there's a tie in connectivity score, pick the one closest (by Manhattan distance) to the other endpoint.

---

## Change 4: Line-of-Sight Path Smoothing

### Why
Even with A*, paths can have unnecessary waypoints. OpenFront applies LOS smoothing that shortcuts straight-line segments, producing clean arcing routes.

### What to do

**In game-worker.js**, add a `smoothPath(path)` function that runs after `findWaterPath` returns.

**The algorithm:**
1. Start at path index 0 (`current = 0`). Add `path[0]` to result.
2. Binary search for the farthest index where a straight line from `path[current]` to `path[far]` passes only through valid water tiles with magnitude >= 2.
3. The straight line check uses Bresenham's line algorithm: step pixel by pixel from the start to the end. For every tile along the line, check that `terrain[tile] === 0` (is water) AND `waterMag[tile] >= 2` (not too close to shore). If any tile fails, the line is blocked.
4. If a shortcut is found (farthest > current + 1), rasterize the straight line from `path[current]` to `path[farthest]` using Bresenham and add all intermediate tiles to the result.
5. Set `current = farthest` and repeat from step 2.
6. When `current` reaches the end of the path, add the final tile and return the result.

**Second pass (stricter):** After the first smoothing pass, run it again with magnitude >= 3 instead of >= 2. This further smooths the mid-ocean segments while the first pass handles the near-shore segments. This matches OpenFront's two-pass approach.

**Bresenham line rasterization:**
- Standard integer Bresenham algorithm. Given two tile indices, convert to (x,y) coordinates, step pixel by pixel. Return all tile indices along the line.

**Integration:** In `launchBoat`, after `findWaterPath` returns a path, call `smoothPath(path)`. The smoothed path replaces the original. If the smoothed path is shorter than 3 tiles, return null.

---

## Change 5: Precompute Water Components

### Why
Currently, if a boat can't reach the target (disconnected water bodies), we waste time running the full A* before discovering there's no path. OpenFront precomputes water component IDs and checks connectivity in O(1) before pathfinding.

### What to do

**In game-worker.js**, during the init phase (after terrain is loaded), compute water components using flood fill:

1. Create a `Int32Array` called `waterComponent` with length `GRID_W × GRID_H`, initialized to -1.
2. Initialize a component counter at 0.
3. Scan all tiles linearly. When a water tile (`terrain[i] === 0`) with `waterComponent[i] === -1` is found:
   - Assign the current component ID.
   - BFS/flood-fill from that tile through all connected water tiles (4-directional), setting `waterComponent[ni] = componentId` for each.
   - Increment the component counter.

**Usage in findBoatEndpoints:**
Before running the expensive multi-source water BFS, do a quick check:
1. Find any water tile adjacent to any player shore tile — get its component ID from `waterComponent`.
2. During the land BFS from the target (Step 3), when a shore tile is found and its adjacent water tile is checked, verify that `waterComponent[waterTile]` matches the player's water component. Skip shore tiles on different water bodies.

**Usage in findWaterPath:**
Before running the A*, check that any water neighbor of the source and any water neighbor of the destination share the same `waterComponent` value. If not, return null immediately without running the search.

---

## Change 6: Fix Target Shore Selection

### Why
Our current `findBoatEndpoints` land BFS walks through ALL non-player land to find shore tiles near the target. This can find shores owned by wilderness or a third player, not just the target's shores. OpenFront specifically finds the nearest shore tile **owned by the target player**.

### What to do

**In `findBoatEndpoints`** (game-worker.js), modify the land BFS (Step 3) to restrict which shore tiles are valid destination candidates:

Currently, when the land BFS finds a tile adjacent to water, it immediately checks water distance and considers it a candidate. Change this so that the land tile must meet additional criteria:

1. The land tile must be owned by the target player OR by wilderness (-1). It should NOT be owned by the player launching the boat or by a third player that wasn't the intended target.
2. To determine the "target player": look at `grid[targetIdx]` (the owner of the tile the user clicked). Store this at the top of `findBoatEndpoints` as `targetOwner`.
3. In the land BFS, when checking if a found shore tile is a valid destination: `grid[curr] === targetOwner || grid[curr] === -1`. Skip tiles owned by anyone else.

This ensures the boat lands on the target's coast, not on a random nearby player's coast.

---

## Change 7: A*-Based Source Shore Selection

### Why
Our current source shore selection uses a multi-source water BFS that measures distance in tile-count. OpenFront uses multi-source A*, so the source shore is optimized by **path cost** (avoiding shallow water) rather than just hop count. This matters because a 50-tile path through open water is cheaper than a 30-tile path hugging the coast.

### What to do

**In `findBoatEndpoints`** (game-worker.js), replace the multi-source water BFS (Step 2) with a multi-source version of the A* from Change 2:

1. Seed the A* open set with the best water neighbor (by connectivity score, see Change 3) of each player shore tile, all with g=0.
2. Track which player shore tile seeded each entry (same `waterSrc` concept as current BFS, but now tracking through the A* instead).
3. The A* uses the same cost model as Change 2 (magnitude penalties, base cost 100).
4. For the heuristic: since this is multi-source with no single target, use heuristic = 0 (Dijkstra-like). The A* degrades to a uniform-cost search, which is correct for multi-source shortest-path.

Actually, this makes it Dijkstra's algorithm with the magnitude-weighted costs. This is still much better than BFS because it accounts for path cost, not just hop count.

The `waterDist` map now stores **cost** (not hop count), and `waterSrc` still tracks the originating player shore tile.

In Step 3 (land BFS), when checking water distance, compare costs instead of hop counts. The shore pair with the lowest total A*-cost wins.

---

## Change 8: Boat Retreat Mechanic

### Why
OpenFront lets players cancel boats mid-journey by right-clicking them or pressing a cancel key. The boat turns around and heads back to the nearest friendly shore, with a 25% troop penalty on arrival. Our game has no retreat — boats are fire-and-forget.

### What to do

**Worker side (game-worker.js):**

1. Add a new message type `'cancel_boat'` that takes a boat index or some identifier.
2. When received, find the boat owned by the player. Set a `retreating` flag on the boat object.
3. In `processBoats`, when a boat has `retreating = true`:
   - Find the nearest player-owned shore tile by water distance from the boat's current position. Use a water BFS from the boat's current path position outward, checking each shore tile found to see if it's owned by the boat's owner.
   - Recompute the path from the boat's current position to that shore tile using `findWaterPath`.
   - Replace the boat's path and reset `pathIdx`.
   - When the retreating boat arrives at the friendly shore: add `floor(boat.troops * 0.75)` back to the player's troop pool (25% penalty). Delete the boat. Do NOT create a beachhead.

**Client side (game.js):**

1. Add a way for the player to cancel a boat. Two options (implement both):
   - Right-clicking on a boat (check if the click position is near any boat's current position) sends `cancel_boat`.
   - Pressing Escape while a boat is active sends `cancel_boat` for the most recent boat.
2. Add `retreating` to the boat data sent in tick messages so the client can show a visual indicator (e.g., change the wake trail color to yellow/orange for retreating boats).

**Boat data structure:** Add `retreating: false` to the boat object created in `launchBoat`. Include it in the `boatData` mapping in the tick function.

---

## Change 9: Client-Side Path Interpolation

### Why
Currently boats visually jump from tile to tile each time a tick message arrives. OpenFront sends the full path to the client and the client interpolates the boat's position between ticks, producing smooth continuous movement.

### What to do

**Worker side (game-worker.js):**

The boat's full path is already sent to the client in the tick message (`path` field in `boatData`). No worker changes needed.

**Client side (game.js):**

In the boat rendering code (inside `renderOverlays`), instead of drawing the boat at the discrete `path[pathIdx]` position, interpolate between `path[pathIdx]` and `path[pathIdx + 1]`:

1. Track a `lastTickTime` for when the most recent tick message arrived.
2. Calculate `progress = (performance.now() - lastTickTime) / tickInterval` where `tickInterval` is the expected time between ticks (50ms in normal mode).
3. Clamp `progress` to 0-1.
4. The boat's visual position is:
   - `currentTile = path[pathIdx]`
   - `nextTile = path[min(pathIdx + 1, path.length - 1)]`
   - `visualX = currentTileX + (nextTileX - currentTileX) × progress`
   - `visualY = currentTileY + (nextTileY - currentTileY) × progress`
5. Draw the boat at the interpolated position instead of the discrete tile position.

This makes the boat glide smoothly between tiles instead of jumping.

**Tracking `lastTickTime`:** In the `onmessage` handler where tick data is received (around line 254), record `this._lastTickTime = performance.now()`. Use this in the render loop for interpolation.

---

## Change 10: Decouple Boat Movement from Expansion Tick

### Why
Currently boats advance by 1 path index per expansion tick (every 50ms in normal mode). This couples boat speed to the expansion system. OpenFront moves boats 1 tile per game tick independently.

### What to do

**In game-worker.js**, move `processBoats()` out of the expansion timer gate. Currently in the tick function, `processBoats()` is called inside the `if (expansionTimer >= EXPANSION_TICK_MS)` block in non-spectate mode. Move it to run every tick, unconditionally, alongside `botThinkAll()`.

This means boats move once per tick interval (50ms in normal, 16ms in spectate) instead of once per expansion tick. The boat speed increase may need tuning — if boats move too fast, add a `boatMoveTimer` similar to `expansionTimer` that accumulates `dt` and only calls `processBoats()` when it crosses a threshold (e.g., 80ms). This gives independent control over boat speed without coupling to expansion.

---

## Files to Modify

| File | Changes |
|------|---------|
| `game.js` | Extract and pass `waterMag` array from map.bin to worker; add `lastTickTime` tracking; add boat position interpolation in render; add cancel-boat input handling (right-click on boat + Escape key); show retreat indicator |
| `game-worker.js` | Accept `waterMag`; rewrite `findWaterPath` as A* with shore coercion; add `smoothPath` with two-pass LOS; add water component precomputation; fix target shore selection to require target-player ownership; upgrade source shore selection to cost-based Dijkstra; add `cancel_boat` message handler and retreat logic; add `retreating` flag to boat data; decouple boat movement timing |

---

## Implementation Order

Implement in this order to minimize risk of breaking things:

1. **Change 1** (water magnitude) — pure data plumbing, no behavior change
2. **Change 5** (water components) — pure precomputation, no behavior change
3. **Change 2** (A* pathfinding) — replaces BFS, immediately visible improvement
4. **Change 3** (shore coercion) — small improvement to path start/end quality
5. **Change 4** (LOS smoothing) — major visual improvement on top of A*
6. **Change 6** (target shore fix) — correctness fix for shore selection
7. **Change 7** (cost-based source selection) — quality improvement for source selection
8. **Change 10** (decouple movement) — timing change, may need tuning
9. **Change 9** (interpolation) — visual polish, depends on Change 10 for timing
10. **Change 8** (retreat) — new feature, independent of other changes

---

## Verification

1. Launch a boat — path should arc smoothly through open water, not zigzag along coastline
2. Boat should avoid hugging the shore (prefers water 3-10 tiles from coast)
3. Boat path should be visibly shorter and cleaner than before
4. Performance: launching a boat should not freeze the game (A* with 150k cap)
5. Boats on disconnected water bodies should fail instantly (water component check)
6. Boat should depart from the player's coast closest to the target by water cost
7. Boat should land on a shore tile owned by the target player, not a random third party
8. Boat movement should feel smooth — no visible tile-to-tile jumping (interpolation)
9. Right-clicking a boat should make it retreat with a yellow/orange trail
10. Retreating boat arriving at friendly shore should refund 75% of troops
11. Pressing Escape should cancel the most recent boat
12. All existing boat features should still work: wake trail, beachhead on arrival, context menu, troop count display
