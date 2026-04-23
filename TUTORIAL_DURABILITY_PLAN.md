# Tutorial Highlight Durability Plan

## Problem Statement

The tutorial highlight system in `renderTutorial()` (game.js:1194-1218) uses hardcoded magic numbers to position highlights over HUD elements:

- `y: bar.y + 38` assumes the slider is always 38px below bar top
- `y: bar.y + 58` assumes build buttons are always 58px below bar top
- `h: 14` hardcodes slider height
- `h: 42` hardcodes button height
- `btnW` calculation is duplicated between `renderOverlays()` and `renderTutorial()`
- Button identity is determined by array index (`index 0 = city`, `index 1 = defense_post`), not by key

If the bottom bar layout changes (row spacing, element sizes, BUILD_ITEMS order), highlights will silently break with no error — they'll just be misaligned.

## Solution: UI Position Cache

Cache the actual rendered positions of UI elements during `renderOverlays()`, then look them up by semantic key in `renderTutorial()`. This eliminates all duplicated layout math and index assumptions.

---

## Current State of the Code

### Key locations (all in `game.js`):

| What | Where | Notes |
|------|-------|-------|
| `BUILD_ITEMS` array | Line 36-43 | 6 items: city, defense_post, farm, mine, mill, factory |
| `GameRenderer` constructor | Line 46 | Instance variables initialized lines 60-78 |
| `_getBottomBarLayout()` | Line 706 | Returns `{x, y, w, h}` for the bottom bar |
| `renderOverlays()` | Line 756 | Renders the bottom bar, slider (row2, line 1001), build buttons (row3, line 1010-1023) |
| `renderTutorial()` | Line 1178 | Renders tutorial overlay; highlight rect logic at lines 1194-1218 |
| `_tutorialSteps` array | Lines 83-91 | 9 steps; 3 use HUD highlights: `slider`, `build_btn_city`, `build_btn_dpost` |
| `renderOverlays()` call site | Line 751 | Called before `renderTutorial()` (line 1170), so cache will always be populated |

### Current highlight types and their positioning:

- **`border` / `enemy_border`**: Computed from `playerData[0].centroid` — these are fine, no magic numbers needed
- **`slider`**: Hardcoded at `bar.y + 38`, height 14 — should come from `row2Y` in renderOverlays
- **`build_btn_city`**: Hardcoded at `bar.y + 58`, uses index 0 — should look up by `key === 'city'`
- **`build_btn_dpost`**: Hardcoded at `bar.y + 58 + btnW`, uses index 1 — should look up by `key === 'defense_post'`

### Relevant layout variables in `renderOverlays()`:

- `row2Y = bar.y + 38` (line 1001) — slider row
- `row3Y = bar.y + 58` (line 1010) — build button row
- `btnW = (bar.w - 20) / BUILD_ITEMS.length` (line 1011) — button width
- `btnH = 42` (line 1011) — button height
- Each button's x position: `bx = bar.x + 10 + i * btnW` (line 1014)
- Each button's rendered rect: `(bx + 2, row3Y, btnW - 4, btnH)` with 5px border radius (line 1020)

---

## Implementation Steps

### Step 1: Add `_uiPositions` to the constructor

**File:** game.js, in the constructor (after line 74, near other instance state)

Add a new instance property `_uiPositions` initialized to an empty object. This will hold cached screen positions of UI elements keyed by semantic name.

### Step 2: Populate the cache in `renderOverlays()`

**File:** game.js, inside `renderOverlays()`

**For the slider (after the slider is rendered, around line 1007):**
Store the slider's position in `this._uiPositions.slider` using the same `row2Y`, x, width, and height values that are already computed for rendering the slider. The rect should be: `{x: bar.x + 10, y: row2Y, w: bar.w - 20, h: 14}`.

**For the build buttons (inside the BUILD_ITEMS loop, after each button is rendered, around line 1022):**
Initialize `this._uiPositions.buildButtons` as an empty object before the loop. Inside the loop, store each button's position keyed by `item.key` (not by index). The rect should be: `{x: bx + 2, y: row3Y, w: btnW - 4, h: btnH}` — matching the actual rendered button rect.

### Step 3: Replace hardcoded positions in `renderTutorial()`

**File:** game.js, in `renderTutorial()` (lines 1205-1217)

Replace the three HUD-based highlight branches:

- **`slider` branch** (lines 1205-1207): Instead of calling `_getBottomBarLayout()` and computing `bar.y + 38`, just read `this._uiPositions.slider`.
- **`build_btn_city` branch** (lines 1208-1212): Instead of computing index-based position, read `this._uiPositions.buildButtons['city']`.
- **`build_btn_dpost` branch** (lines 1213-1217): Instead of computing index-based position, read `this._uiPositions.buildButtons['defense_post']`.

After this change, `renderTutorial()` should have zero references to `_getBottomBarLayout()`, `BUILD_ITEMS.length`, or any pixel offsets for HUD elements.

### Step 4: Add a guard for missing cache entries

**File:** game.js, in `renderTutorial()`, at the start of the highlight block (before line 1195)

Add a guard: if `step.highlight` is set but `this._uiPositions.slider` is falsy (meaning `renderOverlays()` hasn't run yet), skip rendering the highlight for this frame. This handles the theoretical edge case where the tutorial renders before the first overlay render pass.

**Note:** In practice this shouldn't happen because `renderOverlays()` (line 751) is called before `renderTutorial()` (line 1170) in the render loop. The guard is defensive only.

---

## Extensibility

To add a highlight for any future UI element:
1. In `renderOverlays()`, store its position in `_uiPositions` under a descriptive key after rendering it
2. In `_tutorialSteps`, set `highlight` to `'build_btn_<key>'` (for build buttons) or a new key
3. In `renderTutorial()`, add a branch that reads from `_uiPositions`

For build buttons specifically, new entries in `BUILD_ITEMS` are automatically cached — you only need to add the tutorial step.

---

## Render Order Guarantee

`renderOverlays()` is called at line 751, and `renderTutorial()` is called at line 1170 (inside `renderOverlays()` itself, at the end). This means the cache is always populated before the tutorial reads it. The call chain is:

```
render() → renderOverlays() → [populates _uiPositions] → renderTutorial() → [reads _uiPositions]
```

---

## Testing Checklist

### Functional verification:
- [ ] Slider highlight aligns perfectly with the attack slider
- [ ] City button highlight aligns with the city build button
- [ ] Defense post button highlight aligns with the defense post build button
- [ ] Arrow from tutorial text box points to the center of each highlighted element

### Durability tests:
- [ ] Change `row2Y` offset (e.g., `bar.y + 38` → `bar.y + 45`) — slider highlight should follow
- [ ] Change `row3Y` offset (e.g., `bar.y + 58` → `bar.y + 65`) — button highlights should follow
- [ ] Change `btnH` (e.g., 42 → 50) — button highlights should resize
- [ ] Reorder BUILD_ITEMS (e.g., swap city and defense_post) — highlights should follow the correct buttons, not the old indices
- [ ] Add a new BUILD_ITEMS entry before city — existing highlights should still target the correct buttons

### Edge cases:
- [ ] Window resize during tutorial — highlights should reposition (they will, since `_getBottomBarLayout()` is responsive and cache is repopulated each frame)
- [ ] Tutorial step with highlight on first frame after page load
- [ ] Transitioning between highlight types (slider → build button → no highlight)

## Risks

- **Cache is per-frame**: Since `renderOverlays()` repopulates `_uiPositions` every frame, there's no stale data risk. The cache is effectively a "last rendered position" snapshot.
- **Performance**: Negligible — storing ~7 small objects per frame (1 slider + 6 build buttons).
- **Missing cache entries**: If a tutorial step references a key that doesn't exist in `_uiPositions.buildButtons`, the highlight will silently be null. The guard from Step 4 handles this gracefully by skipping the highlight rather than crashing.
