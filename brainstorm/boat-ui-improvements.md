# Boat UI Improvements

## Problem
The right-click boat launch menu feels stale. It's a tiny 36x28px dark rectangle with a small blue arrow icon -- easy to miss, not satisfying to use, and doesn't communicate much information before committing to a boat launch.

---

## Current State
- **Right-click context menu**: Small dark rounded rect with a blue dart icon, a wave squiggle, and a dashed line to the click point. No text, no troop info, no feedback on whether a boat can actually launch.
- **Boat sprite**: Dart/arrow shape in player color with white stroke. Wake trail behind, dashed path ahead. Troop count only visible when zoomed in.
- **Beachhead**: Pulsing circle at landing site with troop count.
- **HUD**: "Boats: N/3" text at top center.

---

## Proposed Improvements

### 1. Radial Context Menu (High Impact)
Replace the single tiny button with a small radial or card-style popup:
- **"Send Boat" option** with a proper boat icon and label text
- **Troop preview**: Show how many troops would be sent (based on current `attackRatio * troops * BOAT_TROOP_FRACTION`)
- **"Cancel Attack" option** (if currently attacking) -- currently right-click without a target cancels, but this is not discoverable
- **Disable state**: Gray out "Send Boat" if at max boats (3/3) or not enough troops, with a short reason ("Max boats reached" / "Not enough troops")

### 2. Path Preview on Hover (High Impact)
Before committing to a launch, show the planned boat path:
- When the context menu is open, render a **dashed blue line** from the nearest player-owned water border tile to the right-click target (the BFS path the worker would compute)
- Could request a `preview_boat_path` from the worker (similar to `preview_econ`)
- Shows the player where the boat will actually travel -- important for large maps with winding waterways

### 3. Better Context Menu Visuals (Medium Impact)
If not going full radial, at minimum improve the current popup:
- **Larger hit area** -- 36x28px is tiny, especially on high-DPI screens
- **Text label** -- "Launch Boat" below the icon
- **Troop count** -- "~142 troops" shown in the popup
- **Boat count indicator** -- "1/3 boats" so the player knows capacity
- **Hover highlight** -- lighten the background when cursor is over the button
- **Entry animation** -- subtle scale-up from 0.8 to 1.0 over 100ms so it feels responsive

### 4. Launch Animation (Medium Impact)
When a boat is launched, add visual feedback:
- **Ripple effect** at the departure point (expanding circle that fades)
- **Screen shake** (very subtle, 1-2px) -- optional, might be annoying
- **Sound cue** placeholder -- just a visual flash for now since there's no audio system

### 5. Improved Boat Sprites (Low-Medium Impact)
The current dart shape works but could be more recognizable:
- **Sail detail** -- add a small triangle "sail" above the hull
- **Player-colored hull with white sail** -- more contrast, easier to spot
- **Size scaling** -- boats could be slightly larger at low zoom levels so they're visible on the world map
- **Bobbing animation** -- subtle sine-wave vertical offset to make boats feel alive on the water

### 6. Boat HUD Improvements (Low Impact)
- Move "Boats: N/3" from top-center to a **small pill** near the gold/troop pills in the bottom bar, or as an icon row
- Show boat status on hover: destination, ETA (ticks remaining), troop count
- Color-code: blue = en route, green = landed/beachhead

---

## Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P0 | Larger context menu with text + troop preview | Small | High |
| P0 | Disable state when can't launch | Small | High |
| P1 | Hover highlight on context menu button | Tiny | Medium |
| P1 | Entry animation (scale-up) | Tiny | Medium |
| P2 | Path preview on hover | Medium | High |
| P2 | Launch ripple animation | Small | Medium |
| P3 | Improved boat sprites (sail) | Small | Low |
| P3 | Boat HUD in bottom bar | Medium | Low |

---

## Files to Change
- **`game.js`**: Context menu rendering (~line 1149), boat rendering (~line 833), mousemove hover detection, HUD section
- **`game-worker.js`**: New `preview_boat_path` message handler (if doing path preview), boat launch response with path data

## Open Questions
- Should the context menu support multiple actions (attack, boat, alliance?) or stay boat-only?
- Is a radial menu overkill for a single action? A styled card might be simpler and more readable.
- Should boats show their path at all times, or only on hover/selection?
