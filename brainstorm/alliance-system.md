# Alliance System

Inspired by OpenFront.io's alliance mechanics, adapted for this game's simpler scope.

---

## Core Mechanics

### Forming an Alliance
- **Right-click** an enemy player's territory to open the context menu (same menu as boat launch -- this becomes a multi-action radial/card menu)
- Select **"Request Alliance"** (handshake icon, green `#4ade80`)
- The target player (bot) evaluates the request based on AI logic (see Bot AI section)
- If accepted, both players become allies immediately
- Visual + text feedback: "Alliance formed with [Player Name]!" banner at top of screen

### Breaking an Alliance
- Right-click an allied player's territory, select **"Break Alliance"** (red icon `#dc2626`)
- **Traitor penalty**: 30 seconds of debuffs:
  - Territory is 50% easier to conquer (defense debuff)
  - Cannot request new alliances during traitor period
- Breaking is instant -- no confirmation dialog (keep the game fast)

### Alliance Duration
- Alliances last **5 minutes** (3000 ticks at 100ms/tick)
- **Extension window**: 30 seconds before expiration, a subtle pulsing indicator appears on the ally's territory border
- Bots auto-decide whether to renew based on threat assessment
- If neither side renews, alliance expires silently (no traitor penalty)

### Alliance Limits
- Max **2 simultaneous alliances** for the human player (prevents allying everyone)
- Bots: 1-3 alliances depending on strategy (aggressive bots ally less)

---

## Gameplay Effects

### What Allies Cannot Do
- **Cannot attack** each other's territory (clicks on allied territory are no-ops, show "Allied" tooltip)
- **Cannot send boats** to allied territory

### What Allies Can Do
- **Donate troops**: Right-click ally territory > "Donate Troops" -- sends `attackRatio * troops * 0.2` to the ally
- **Shared borders don't generate border friction** -- expansion prioritizes non-allied frontiers
- **Boats can pass through allied water** without being blocked (if water blocking is ever added)

### Bot Behavior with Alliances
- Bots will **never attack an ally** (honor the alliance)
- Bots may **break alliances** when:
  - They are much stronger than the ally (2x+ troops)
  - The ally is the last remaining opponent
  - Their strategy is "aggressive" and they have no other targets
- Bots are more likely to **accept** alliance requests when:
  - They share a common strong enemy
  - They are weak relative to neighbors
  - Their strategy is "defensive" or "balanced"

---

## Visual Design

### Map Display (Key Feature)

**Allied territory borders** should be visually distinct:
- **Border between allies**: Rendered as a **dashed line** instead of a solid border, in a blended color of both players. This communicates "we're connected but separate."
- **Ally territory tint**: In an optional "diplomacy view" toggle, allied territory gets a subtle **yellow-green overlay** (`rgba(74, 222, 128, 0.08)`), enemy territory gets a **red overlay** (`rgba(220, 50, 50, 0.08)`), and neutral gets no overlay.
- **Alliance indicator on territory**: A small **handshake icon** or **chain-link icon** drawn at the midpoint of the shared border between two allies, pulsing gently.

### Player Name Labels
- Allied player names rendered in **green** on the map (currently all non-player names are in their player color)
- Or: a small green dot/shield icon next to allied player names in the leaderboard

### Leaderboard Changes
- Allied players get a **green handshake icon** next to their name
- Optionally show alliance timer: "Maurya (ally 3:42)"

### Context Menu Integration
The right-click context menu becomes multi-action depending on target:

**On enemy/wilderness territory:**
```
+---------------------------+
|  [boat icon] Send Boat    |
|  [handshake]  Request Ally |
+---------------------------+
```

**On allied territory:**
```
+---------------------------+
|  [troops icon] Donate     |
|  [break icon]  Break Ally |
+---------------------------+
```

**On own territory:**
- No context menu (or just "Cancel Attack" if attacking)

### HUD Elements
- **Alliance bar**: Small section in bottom bar or near leaderboard showing current allies with countdown timers
- **Notification banner**: "Alliance formed!", "Alliance broken!", "Alliance expiring..." banners that fade in/out at the top of the screen
- **Traitor indicator**: If you break an alliance, a red skull icon appears next to your troop bar for the traitor duration

---

## Data Model

### Worker State (`game-worker.js`)

```js
// Per-player alliance state
playerStates[i].alliances = [];  // array of { partnerId, expiresAt, formedAt }
playerStates[i].traitorUntil = 0; // timestamp when traitor debuff ends
playerStates[i].allianceRequests = []; // pending: { fromId, expiresAt }

// Constants
const ALLIANCE_DURATION = 300000;      // 5 minutes in ms
const ALLIANCE_MAX = 2;                // max simultaneous alliances
const TRAITOR_DURATION = 30000;        // 30 seconds
const TRAITOR_DEFENSE_DEBUFF = 0.5;    // 50% easier to conquer
const ALLIANCE_REQUEST_TTL = 20000;    // request expires after 20s
const ALLIANCE_REQUEST_COOLDOWN = 30000;
const TROOP_DONATE_FRACTION = 0.2;
```

### Messages (worker <-> client)

```js
// Client -> Worker
{ type: 'alliance_request', targetPlayer: N }
{ type: 'alliance_break', targetPlayer: N }
{ type: 'donate_troops', targetPlayer: N, ratio: 0.2 }

// Worker -> Client (in tick data)
playerData[i].alliances: [{ partner: N, expiresAt: T }]
playerData[i].isTraitor: bool
playerData[i].allianceRequests: [{ from: N }]  // pending requests for player 0

// Worker -> Client (events)
{ type: 'alliance_event', event: 'formed'|'broken'|'expired'|'request'|'rejected', player1: N, player2: N }
```

### Border Rendering Changes

In the border rendering loop, check if two adjacent tiles belong to allied players. If so, render the border differently:
- Current: solid line in the tile owner's color
- Allied border: dashed line in a blended color, or skip every other border pixel for a "permeable" look

---

## Implementation Plan

### Phase 1: Core Alliance Logic (Worker)
1. Add alliance state to `playerStates`
2. Handle `alliance_request` message -- validate, create pending request
3. Bot AI: evaluate and accept/reject requests
4. Handle `alliance_break` -- remove alliance, apply traitor debuff
5. Block attacks on allied territory in `processExpansions()`
6. Apply traitor defense debuff in expansion cost calculation
7. Alliance expiration check each tick
8. Include alliance data in tick message

### Phase 2: Context Menu Upgrade (Client)
1. Expand context menu from single-button to multi-option card
2. Show different options based on target (enemy vs ally vs wilderness)
3. Hit detection for multiple buttons
4. Send appropriate messages to worker

### Phase 3: Map Visuals (Client)
1. Modify border rendering to detect allied borders and draw dashed
2. Add alliance indicator icon at shared border midpoints
3. Green-tint allied player names in leaderboard
4. Add handshake icon to leaderboard for allies

### Phase 4: HUD & Feedback (Client)
1. Alliance notification banners (formed/broken/expiring)
2. Traitor skull icon on HUD
3. Alliance timer display
4. Troop donation visual feedback

### Phase 5: Bot AI Polish
1. Tune acceptance/rejection thresholds
2. Strategic alliance-breaking logic
3. Prevent bots from all allying against the player (feels unfair)
4. Bots request alliances with the player when appropriate

---

## Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P0 | Alliance state + form/break in worker | Medium | Critical |
| P0 | Block attacks on allies | Small | Critical |
| P0 | Multi-option context menu | Medium | High |
| P1 | Allied border rendering (dashed) | Medium | High |
| P1 | Bot accept/reject AI | Medium | High |
| P1 | Alliance notification banners | Small | Medium |
| P2 | Traitor penalty system | Small | Medium |
| P2 | Alliance timer + expiration | Small | Medium |
| P2 | Troop donation | Medium | Medium |
| P2 | Leaderboard alliance indicators | Small | Low |
| P3 | Diplomacy view toggle | Medium | Low |
| P3 | Alliance indicator icon on shared border | Small | Low |
| P3 | Bot strategic alliance-breaking | Medium | Medium |

---

## Files to Change
- **`game-worker.js`**: Alliance state, request handling, attack blocking, traitor debuff, bot AI, tick data
- **`game.js`**: Context menu expansion, border rendering, leaderboard, HUD notifications, troop donation UI

## Open Questions
- Should the player be able to see alliance requests from bots as a popup, or auto-accept/reject?
- Should there be a "diplomacy" hotkey to toggle the tinted overlay view?
- Should alliances affect the win condition? (e.g., allied victory if all surviving players are allied?)
- Should troop donation have a cooldown to prevent spam?
