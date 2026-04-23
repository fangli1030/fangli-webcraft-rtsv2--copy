# Bug: Right-Click Triggers Attack

## Problem
When the player right-clicks (to send a boat or cancel an attack), the troops also start a regular left-click attack at the same location. This is because the right-click event flow unintentionally triggers the attack logic.

## Root Cause
**File:** `game.js`, `mousedown` handler (~line 523)

The `mousedown` listener doesn't filter by mouse button. The event flow on right-click:

1. `mousedown` fires (right button) → sets `_mouseIsDown = true`
2. `contextmenu` fires → shows boat popup OR sends cancel-attack
3. `mouseup` fires (right button) → checks `_mouseIsDown && !_didDrag` → **true** → triggers attack at that tile

The `mouseup` handler at line 648 processes this as a regular left-click attack because `_mouseIsDown` was set by the right-click's mousedown.

## Fix
**File:** `game.js`, line ~523

Add `e.button === 0` check in the `mousedown` handler so only left-clicks set `_mouseIsDown`:

```js
// Current:
this.canvas.addEventListener('mousedown', (e) => {
  this._mouseDownX = e.clientX; this._mouseDownY = e.clientY;
  this._didDrag = false; this._camStartX = this.camX; this._camStartY = this.camY;

// Fixed:
this.canvas.addEventListener('mousedown', (e) => {
  this._mouseDownX = e.clientX; this._mouseDownY = e.clientY;
  this._didDrag = false; this._camStartX = this.camX; this._camStartY = this.camY;
  if (e.button !== 0) return;  // Only process left-click
```

**Note:** The `return` must be placed AFTER the camera drag setup (mouseDownX/Y, camStartX/Y) but BEFORE the `_mouseIsDown = true` line, so that right-click dragging to pan still works but `_mouseIsDown` is never set for right-clicks.

Actually, looking more carefully — the camera pan logic in `mousemove` uses `_mouseIsDown` too. So we need to be more precise. The cleanest fix:

```js
this.canvas.addEventListener('mousedown', (e) => {
  this._mouseDownX = e.clientX; this._mouseDownY = e.clientY;
  this._didDrag = false; this._camStartX = this.camX; this._camStartY = this.camY;
  if (e.button === 2) return;  // Right-click handled by contextmenu listener
  ...
```

This lets middle-click dragging still work for panning while blocking right-click from triggering attacks.

### Files to modify
- `game.js` line ~523: Add `if (e.button === 2) return;` after camera state setup

### Verification
1. Right-click enemy territory across water → boat popup appears, no attack starts
2. Right-click on water or own territory → attack cancels, no new attack starts  
3. Left-click enemy territory → attack still works normally
4. Left-click drag → camera pan still works
