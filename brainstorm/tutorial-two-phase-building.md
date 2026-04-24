# Two-Phase Tutorial for City & Defense Post Placement

## What We Want

Right now, the city and defense post tutorial steps do everything at once: highlight the build button, tell the player to press a hotkey AND place the building, all while a dim overlay covers the map. The player can barely see where to place.

We want to split each into two phases:

1. **Select phase**: Dim the screen, highlight the build button, ask the player to click it (or press the hotkey). Once they do, advance.
2. **Place phase**: Remove ALL dimming, show only the tutorial text box floating at the top, tell the player to click their territory to place the building. Once it's placed, advance.

This means the single "city" step becomes two steps, and the single "defense_post" step becomes two steps. Total tutorial steps goes from 9 to 11.

---

## Exactly What to Change

There are three locations in `game.js` that need changes. Nothing else changes — no rendering logic, no input filtering, no dimming code.

---

### Change 1: Split the tutorial steps

**Where:** The `_tutorialSteps` array in the constructor, around line 89-90.

**Current state:** There are two steps:
- Step at line 89 has `id: 'city'`, `completionType: 'city_placed'`, `highlight: 'build_btn_city'`
- Step at line 90 has `id: 'defense_post'`, `completionType: 'defense_post_placed'`, `highlight: 'build_btn_dpost'`

**What to do:** Remove those two steps. Replace them with four steps in this exact order:

**Step A — City Select**
- `id`: `'city_select'`
- `title`: `'Build a City'`
- `text`: `'Click the City button or press 1.'`
- `completionType`: `'city_selected'`
- `highlight`: `'build_btn_city'` (this triggers the dim overlay + highlight on the city button)
- `arrowTarget`: `null`

**Step B — City Place**
- `id`: `'city_place'`
- `title`: `'Place Your City'`
- `text`: `'Click inside your territory to place it. Cities increase max troops.'`
- `completionType`: `'city_placed'` (same as the old step — reuse the existing tick-based detection)
- `highlight`: `null` (setting this to null means NO dim overlay, NO highlight — just the floating text box)
- `arrowTarget`: `null`

**Step C — Defense Post Select**
- `id`: `'dpost_select'`
- `title`: `'Build a Defense Post'`
- `text`: `'Click the Def Post button or press 2.'`
- `completionType`: `'dpost_selected'`
- `highlight`: `'build_btn_dpost'` (dim overlay + highlight on the defense post button)
- `arrowTarget`: `null`

**Step D — Defense Post Place**
- `id`: `'dpost_place'`
- `title`: `'Place Your Defense Post'`
- `text`: `'Click on your border to place it. They protect your territory.'`
- `completionType`: `'defense_post_placed'` (same as the old step — reuse the existing tick-based detection)
- `highlight`: `null` (no dim, no highlight)
- `arrowTarget`: `null`

---

### Change 2: Add two new completion checks

**Where:** The `_checkTutorialCompletion` method, inside the `switch (step.completionType)` block. This is around line 1327.

**What to do:** Add two new `case` branches anywhere inside the switch. They detect when the player has selected the correct build mode.

**Case: `city_selected`**
- Should advance when `trigger` is `'tick'` AND `this.placementMode` equals `'city'`.
- That's it. The tick trigger fires every game update (called at line 271), so this detects the selection almost instantly after the player clicks the button or presses 1.

**Case: `dpost_selected`**
- Should advance when `trigger` is `'tick'` AND `this.placementMode` equals `'defense_post'`.
- Same logic as above, just checking for the defense post placement mode.

The existing `city_placed` and `defense_post_placed` cases stay exactly as they are. They already handle the place phase by checking if a new building appeared on tick.

---

### Change 3: Update the gold grant trigger

**Where:** The `_advanceTutorial` method, around line 1383.

**Current state:** There is a condition that grants 200 gold when the tutorial advances INTO a step with `id === 'city'` or `id === 'defense_post'`. This gives the player enough gold to build.

**What to do:** Change the condition to check for `id === 'city_select'` or `id === 'dpost_select'` instead. The gold needs to be available when the player first sees the build button highlight, not when they're placing. The old step IDs (`city` and `defense_post`) no longer exist after Change 1.

---

## Why Nothing Else Needs to Change

These are common gotchas that do NOT need fixing:

- **Dimming overlay**: The `renderTutorial` method only draws the dim overlay when `highlightRect` is non-null. The place-phase steps have `highlight: null`, so `highlightRect` stays null, so no dim is drawn. The text box still renders because it always renders regardless of highlight.

- **Input filtering**: The mouseup handler (around line 657) only blocks clicks for steps with IDs `welcome`, `camera`, `complete`, and `expand`. None of our new step IDs match those, so all clicks pass through during both select and place phases.

- **Build button clicks**: Button clicks are handled in the mousedown handler (line 531) which returns early before reaching the tutorial input filter. So clicking build buttons always works during the tutorial regardless of step.

- **Hotkey presses**: The keydown handler (around line 487) sets `placementMode` for keys 1-6. This is not blocked by the tutorial. So pressing 1 or 2 works fine during select-phase steps.

- **Step counter**: The step counter in the tutorial text box uses `this._tutorialSteps.length` dynamically, so it automatically updates from "X/9" to "X/11".

- **Baseline counts in `_advanceTutorial`**: The method saves baseline city/dpost/boat counts whenever it advances. This still works correctly because the baseline is saved when entering the place-phase step, right before the player places the building.

---

## How to Verify

1. Start a tutorial game
2. Get to the city step (step 6 of 11) — screen should dim, city button should be highlighted with a gold pulsing border
3. Click the city button or press 1 — dim should disappear, text should change to "Place Your City", step counter should show 7/11
4. Click inside territory — city should be placed, tutorial advances to defense post select (step 8/11)
5. Screen should dim again, defense post button highlighted
6. Click the button or press 2 — dim disappears, text says "Place Your Defense Post"
7. Click on border — defense post placed, tutorial advances to boats step
