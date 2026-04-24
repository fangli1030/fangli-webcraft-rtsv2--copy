# Plan: Rewrite Boat System

## Context
The boat/transport ship system has multiple interrelated bugs that make it feel broken. This plan addresses all of them. The two files to modify are `game.js` (client) and `game-worker.js` (worker thread).

---

## Fix 1: Right-click should NOT trigger a ground attack

### The bug
When the player right-clicks, BOTH a boat launch AND a ground attack happen at the same tile. The player sees their troops attack AND a boat launch simultaneously.

### Why it happens
In `game.js`, the `mousedown` event listener (around line 523) runs for ALL mouse buttons. It sets `this._mouseIsDown = true` regardless of which button was pressed. Later, when `mouseup` fires, it checks `this._mouseIsDown && !this._didDrag` and treats it as a left-click attack. So a right-click sets the flag on mousedown, and mouseup reads it as a left-click.

### What to change
In the `mousedown` event listener in `game.js`, find the line `this._mouseIsDown = true` (around line 569). BEFORE that line, add a check: if `e.button === 2`, return early. This means right-clicks will never set `_mouseIsDown` to true, so `mouseup` will never process them as attacks.

IMPORTANT: The camera panning variables (`_mouseDownX`, `_mouseDownY`, `_didDrag`, `_camStartX`, `_camStartY`) are set at the TOP of the mousedown handler, BEFORE the button check and BEFORE the bottom bar / help button checks. Those lines must stay for ALL buttons so that right-click-drag panning still works. The early return for `e.button === 2` should go right after the context menu check (the `if (this._contextMenu)` block), before the bottom bar click checks begin. This way right-click still sets up camera drag state but skips all the attack/placement logic.

### Exact location
Find `this.canvas.addEventListener('mousedown', (e) => {` in `game.js`. The handler starts by setting drag variables, then checks context menu. After the context menu check (`if (this._contextMenu) { ... return; }`), add: if `e.button === 2`, return. This is before the bottom bar checks, help button checks, and before `this._mouseIsDown = true`.

---

## Fix 2: Right-click should NOT cancel an ongoing attack when a boat launch fails

### The bug
When the player right-clicks enemy territory across water to send a boat, but the boat launch fails for any reason (no path, at max boats, etc.), the player's current ground attack gets cancelled. The player loses their ongoing expansion for no reason.

### Why it happens
In `game-worker.js`, the `rightclick` message handler (around line 1038) works like this:
1. If coordinates are provided AND the tile is valid enemy land → try `launchBoat()`
2. If `launchBoat()` succeeds → `return` (stop processing)
3. If `launchBoat()` fails → fall through to lines 1046-1048 which cancel the player's attack by setting `ps.expanding = false`, `ps.attackTarget = null`, and moving `attackTroops` back to `troops`

So a failed boat attempt always cancels the current attack.

### What to change
In the `rightclick` handler in `game-worker.js`, change the logic so that:
- If `msg.gx` and `msg.gy` ARE provided (meaning the player right-clicked a specific tile via the context menu boat button): try to launch the boat. Whether it succeeds or fails, `return` immediately. Do NOT fall through to the cancel-attack code.
- If `msg.gx` and `msg.gy` are NOT provided (meaning the player right-clicked on water, own territory, or empty space — this is handled by the `contextmenu` listener in game.js which sends `rightclick` with no coordinates): cancel the current attack as before.

### Exact location
In `game-worker.js`, find `if (msg.type === 'rightclick')`. Inside the `if (msg.gx !== undefined && msg.gy !== undefined)` block, after the `launchBoat()` call, add a `return` statement REGARDLESS of whether `launchBoat` returned a result or null. Currently the `return` is only inside `if (result)`. Change it so the entire block returns unconditionally after attempting the boat.

---

## Fix 3: Rewrite shore selection so boats use the nearest coastline

### The bug
When the player sends a boat, it often departs from a coastline that is far away from the target, going the long way around the map. The player expects the boat to leave from the nearest coast facing the target.

### Why it happens
The current `findBoatEndpoints()` function in `game-worker.js` (around line 568) has a flawed algorithm:

1. It does a multi-source water BFS from ALL player shore tiles outward through water (capped at 80k tiles). This records the water distance from the nearest player shore to every reachable water tile.
2. It then does a land BFS from the clicked target tile outward through land (capped at 5k tiles), looking for shore tiles. For each shore tile found, it checks the water distance to the player.
3. It picks the destination shore with the shortest water distance.

The problem is twofold:
- The 80k water BFS cap may not reach all water tiles, so valid short routes get missed.
- The land BFS from the target can reach shore tiles on distant coastlines (the other side of the continent), and if those happen to have a shorter water distance entry (because the water BFS reached them from a different player shore), the algorithm picks the wrong pair.

### What to change
Delete `findBoatEndpoints()` entirely. Also delete `findNearestLandShore()` (it's no longer called by `launchBoat()` after the previous refactor, but may still exist in the file — remove it if unused).

Write a new `findBoatEndpoints(owner, targetGx, targetGy)` function that works as follows:

**Step 1 — Collect player shore tiles:**
Loop through all of `playerStates[owner].borderTiles`. For each border tile, check if any of its 4 cardinal neighbors is water (`terrain[neighborIdx] === 0`). If yes, this border tile is a shore tile. Collect all such shore tiles into an array.

If no shore tiles found, return null.

**Step 2 — Multi-source water BFS from player shores:**
Create two Maps: `waterDist` (water tile index → integer distance) and `waterSrc` (water tile index → the player shore tile index that seeded it).

Seed the BFS: for each player shore tile, look at its 4 cardinal neighbors. For each neighbor that is water AND not already in `waterDist`, add it to `waterDist` with distance 0 and to `waterSrc` with the shore tile's index. Add it to the BFS queue.

Run the BFS: dequeue tiles, for each of their 4 cardinal water neighbors not yet visited, set their distance to `currentDist + 1` and their source to the same source as the current tile. Add to queue.

Do NOT cap the BFS. Let it run until the queue is empty. On the india_small map (480x600), there are roughly 30-40k water tiles. This is fast and only runs on right-click, not per tick.

**Step 3 — Land BFS from target to find destination shore candidates:**
Starting from `targetGy * GRID_W + targetGx`, do a BFS through land tiles only (tiles where `terrain[idx] > 0`). Cap this at 5000 tiles explored.

For each tile dequeued, check its 4 cardinal neighbors. If a neighbor is water (`terrain[neighborIdx] === 0`), then the current tile is a shore tile on the target's landmass. Look up that water neighbor in `waterDist`. If it exists and is less than the current best distance, update the best: record this land tile as `bestDest`, the corresponding `waterSrc` entry as `bestSrc`, and the distance as `bestDist`.

Do NOT add water tiles to the land BFS queue — only land tiles get enqueued.

**Step 4 — Return result:**
If `bestDest` and `bestSrc` were found and they are different tiles, return `{ srcShore: bestSrc, destShore: bestDest }`. Otherwise return null.

**Why this works:** The multi-source water BFS naturally finds the shortest water route from ANY player shore to ANY water tile on the map. When the land BFS finds shore tiles near the target, looking up their adjacent water distances automatically picks the shore that faces the player's nearest coastline. No caps means no missed routes.

### Exact location
In `game-worker.js`, find the `findBoatEndpoints` function (starts around line 568). Replace the entire function body with the algorithm described above. Delete `findNearestLandShore` if it exists and is unused.

The `launchBoat` function should NOT need changes — it already calls `findBoatEndpoints` and uses the result's `srcShore` and `destShore`.

Also, in `findWaterPath()` (the function that computes the actual path between the two shore tiles), find the `while (head < queue.length)` loop. Add a cap: change it to `while (head < queue.length && head < 150000)`. This prevents freezes on unexpectedly large maps but is high enough to never be hit on normal maps.

---

## Fix 4: Strengthen beachhead on boat arrival

### The bug
When a boat arrives at enemy territory, it conquers just ONE tile and creates a beachhead. But the defender often has massive troop superiority nearby and immediately reconquers that single tile. The beachhead then has zero front tiles and dissolves, returning troops to reserves. The player sees their boat arrive and nothing happens.

### Why it happens
In `processBoats()` in `game-worker.js` (around line 736), when a boat arrives at its destination:
1. It conquers the single destination tile via `conquer(boat.owner, destIdx)`
2. It creates a beachhead: `ps.beachheads.push({ landingIdx: destIdx, troops: boat.troops, target: target })`

One tile is not enough to survive against a defender expanding back.

### What to change
In `processBoats()`, after conquering the destination tile and BEFORE creating the beachhead, add a loop that conquers additional tiles around the landing point. This creates a small cluster foothold.

The loop should:
1. Start with the landing tile's 4 cardinal neighbors
2. For each neighbor: if it's a valid land tile (`terrain[idx] > 0`) AND it's owned by the target (or wilderness), AND the boat has enough troops remaining to pay the conquest cost, conquer it and subtract the cost from `boat.troops`
3. Then check the neighbors of those newly conquered tiles (a 2-ring BFS), same logic
4. Stop after conquering up to 8 additional tiles or when troops run out
5. Use `WILD_COST` for wilderness tiles and `ENEMY_BASE_COST` for enemy tiles (same costs as `processExpansions` uses, terrain-type indexed)

After this cluster conquest, create the beachhead with whatever troops remain in `boat.troops`.

### Exact location
In `game-worker.js`, find `processBoats()`. Inside the `if (boat.pathIdx >= boat.path.length - 1)` block, after the line `conquer(boat.owner, destIdx);`, add the cluster conquest loop BEFORE the `ps.beachheads.push(...)` line.

---

## Files to Modify

| File | Fixes | What changes |
|------|-------|-------------|
| `game.js` | Fix 1 | Add `e.button === 2` early return in `mousedown` handler |
| `game-worker.js` | Fix 2 | Add unconditional `return` after boat attempt in `rightclick` handler |
| `game-worker.js` | Fix 3 | Rewrite `findBoatEndpoints()`, delete `findNearestLandShore()`, cap `findWaterPath()` BFS |
| `game-worker.js` | Fix 4 | Add cluster conquest in `processBoats()` on arrival |

---

## Verification Checklist

1. **Right-click enemy across water:** boat launches, NO ground attack starts at the same tile
2. **Right-click while already ground-attacking:** if boat launch fails, ongoing attack is NOT cancelled
3. **Right-click on own territory or water (no context menu):** current attack cancels as expected
4. **India map, west coast player, click east coast enemy:** boat departs from the western shore (not the southern tip or some random coast)
5. **India map, player borders both east and west water:** boat departs from whichever coast is closer by water to the target
6. **Boat arrives at enemy coast:** a visible cluster of 5-9 tiles is conquered at the landing point, not just 1 tile
7. **Beachhead persists:** after arrival, the beachhead indicator shows and expansion spreads outward from the cluster over the next few seconds
8. **Large map performance:** launching a boat does not cause a noticeable frame freeze (BFS completes in under 100ms)
