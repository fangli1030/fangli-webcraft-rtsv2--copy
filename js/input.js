// input.js — Mouse, keyboard, touch, and wheel input handling

import { CONFIG, BUILD_ITEMS, gameState } from './config.js';

export class InputManager {
  constructor(renderer) {
    this.r = renderer;
  }

  get GRID_W() { return this.r.GRID_W; }
  get GRID_H() { return this.r.GRID_H; }

  setup() {
    const DRAG_THRESHOLD = 5;
    const r = this.r;
    r._keysDown = new Set();

    window.addEventListener('keydown', e => {
      if ('wasd'.includes(e.key)) {
        r._keysDown.add(e.key);
        if (r._tutorialActive) r.tutorial.checkCompletion('wasd');
      }
      const hotkeyMap = { '1': 'city', '2': 'defense_post' };
      if (hotkeyMap[e.key]) {
        if (r._tutorialActive) {
          const step = r.tutorial.currentStep();
          if (step) {
            if (step.id === 'city' && e.key !== '1') return;
            if (step.id === 'defense_post' && e.key !== '2') return;
            if (step.id === 'boats' || step.id === 'welcome' || step.id === 'camera' || step.id === 'complete') return;
          }
        }
        const mode = hotkeyMap[e.key];
        r.placementMode = r.placementMode === mode ? null : mode;
        r._buildPreview = null;
      }
      if (e.key === 'Tab') { e.preventDefault(); r._leaderboardOpen = !r._leaderboardOpen; }
    });
    window.addEventListener('keyup', e => r._keysDown.delete(e.key));

    r.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      let deltaY = e.deltaY;
      if (r._leaderboardOpen) {
        const { cx: scx, cy: scy } = r.screenToCanvas(e.clientX, e.clientY);
        if (scx < 240 && scy < 300) {
          r._lbScroll = (r._lbScroll || 0) + (deltaY > 0 ? 1 : -1);
          return;
        }
      }
      if (e.ctrlKey) { if (Math.abs(deltaY) > 10) return; deltaY *= 10; }
      else if (Math.abs(deltaY) < 2) return;
      const { cx, cy } = r.screenToCanvas(e.clientX, e.clientY);
      const gameX = cx / r.zoom + r.camX, gameY = cy / r.zoom + r.camY;
      r.zoom = Math.max(r.minZoom, Math.min(r.maxZoom, r.zoom / (1 + deltaY / 600)));
      r.camX = gameX - cx / r.zoom; r.camY = gameY - cy / r.zoom;
      r.clampCamera();
      if (r._tutorialActive) r.tutorial.checkCompletion('scroll');
    }, { passive: false });

    r.canvas.addEventListener('mousedown', (e) => {
      r._mouseDownX = e.clientX; r._mouseDownY = e.clientY;
      r._didDrag = false; r._camStartX = r.camX; r._camStartY = r.camY;
      if (e.button === 2) return;
      if (r._contextMenu) { r._contextMenuClick = true; e.preventDefault(); return; }

      const { cx, cy } = r.screenToCanvas(e.clientX, e.clientY);

      // Check build buttons
      for (const item of BUILD_ITEMS) {
        const bp = r._uiPositions.buildButtons && r._uiPositions.buildButtons[item.key];
        if (bp && cx >= bp.x && cx <= bp.x + bp.w && cy >= bp.y && cy <= bp.y + bp.h) {
          const cost = r.getBuildCost(item.key);
          const gold = (r.playerData[0] || {}).gold || 0;
          if (gold >= cost) {
            r.placementMode = r.placementMode === item.key ? null : item.key;
            r._buildPreview = null;
          }
          e.preventDefault(); return;
        }
      }

      const barInfo = r.hud._getBottomBarLayout();
      if (barInfo && cy >= barInfo.y && cy <= barInfo.y + barInfo.h && cx >= barInfo.x && cx <= barInfo.x + barInfo.w) {
        e.preventDefault(); return;
      }

      const helpX = r.canvas.width - 30, helpY = 30;
      if ((cx - helpX) ** 2 + (cy - helpY) ** 2 < 225) {
        r._helpOpen = !r._helpOpen; e.preventDefault(); return;
      }

      if (cx >= 10 && cx < 310 && cy >= 10 && cy < 30) {
        r._leaderboardOpen = !r._leaderboardOpen; e.preventDefault(); return;
      }

      r._mouseIsDown = true;
    });

    r.canvas.addEventListener('mousemove', (e) => {
      const { gx, gy } = r.screenToGame(e.clientX, e.clientY);
      r._hoverGx = gx; r._hoverGy = gy;

      const { cx: hcx, cy: hcy } = r.screenToCanvas(e.clientX, e.clientY);
      const helpX = r.canvas.width - 30, helpY = 30;
      r._hoverHelp = (hcx - helpX) ** 2 + (hcy - helpY) ** 2 < 225;
      const overLeaderboard = hcx >= 10 && hcx < 310 && hcy >= 10 && hcy < 30;

      let overBuildBtn = false;
      let newHoverBuildKey = null;
      const bps = r._uiPositions.buildButtons || {};
      for (const item of BUILD_ITEMS) {
        const bp = bps[item.key];
        if (bp && hcx >= bp.x && hcx <= bp.x + bp.w && hcy >= bp.y && hcy <= bp.y + bp.h) {
          newHoverBuildKey = item.key;
          overBuildBtn = true;
          break;
        }
      }
      r._hoverBuildKey = newHoverBuildKey;

      const gp = r._goldPillRect;
      r._hoverGoldPill = gp && hcx >= gp.x && hcx <= gp.x + gp.w && hcy >= gp.y && hcy <= gp.y + gp.h;
      const tb = r._troopBarRect;
      r._hoverTroopBar = tb && hcx >= tb.x && hcx <= tb.x + tb.w && hcy >= tb.y && hcy <= tb.y + tb.h;
      const terr = r._territoryBarRect;
      r._hoverTerritoryBar = terr && hcx >= terr.x && hcx <= terr.x + terr.w && hcy >= terr.y && hcy <= terr.y + terr.h;
      const ob = r._outboundPillRect;
      r._hoverOutbound = ob && hcx >= ob.x && hcx <= ob.x + ob.w && hcy >= ob.y && hcy <= ob.y + ob.h;

      r._hoverUI = overBuildBtn || r._hoverHelp || overLeaderboard;

      if (!r._mouseIsDown) return;
      const dx = e.clientX - r._mouseDownX, dy = e.clientY - r._mouseDownY;
      if (!r._didDrag && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) r._didDrag = true;
      if (r._didDrag) {
        const rect = r.canvas.getBoundingClientRect();
        r.camX = r._camStartX - dx / rect.width * r.canvas.width / r.zoom;
        r.camY = r._camStartY - dy / rect.height * r.canvas.height / r.zoom;
        r.clampCamera();
      }
    });

    r.canvas.addEventListener('mouseup', (e) => {
      if (r._contextMenu && r._contextMenuClick) {
        r._contextMenuClick = false;
        const cm = r._contextMenu;
        const { cx, cy } = r.screenToCanvas(e.clientX, e.clientY);
        const cmCanvas = r.screenToCanvas(cm.screenX, cm.screenY);
        const btnX = cmCanvas.cx, btnY = cmCanvas.cy - 40;
        if (cx >= btnX - 18 && cx <= btnX + 18 && cy >= btnY - 14 && cy <= btnY + 14) {
          if (CONFIG.BOATS_ENABLED && r._tutorialActive) {
            const step = r.tutorial.currentStep();
            if (!step || step.id !== 'boats') { r._contextMenu = null; return; }
          }
          r.worker.postMessage({ type: 'rightclick', gx: cm.gx, gy: cm.gy });
        }
        r._contextMenu = null; return;
      }

      if (r._mouseIsDown && !r._didDrag && r.gameOver && r._restartBtn) {
        const { cx, cy } = r.screenToCanvas(e.clientX, e.clientY);
        const rb = r._restartBtn;
        if (cx >= rb.x && cx <= rb.x + rb.w && cy >= rb.y && cy <= rb.y + rb.h) {
          location.reload();
          return;
        }
      }

      if (r._mouseIsDown && !r._didDrag && !r.gameOver) {
        this._handleGameClick(e.clientX, e.clientY);
      }
      r._mouseIsDown = false; r._didDrag = false;
    });

    r.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (r.placementMode) { r.placementMode = null; r._buildPreview = null; return; }
      const { gx, gy } = r.screenToGame(e.clientX, e.clientY);
      if (CONFIG.BOATS_ENABLED && gx >= 0 && gx < this.GRID_W && gy >= 0 && gy < this.GRID_H) {
        const idx = gy * this.GRID_W + gx;
        if (r.terrain && r.terrain[idx] > 0 && r.grid && r.grid[idx] !== 0) {
          r._contextMenu = { screenX: e.clientX, screenY: e.clientY, gx, gy }; return;
        }
      }
      r._contextMenu = null;
      r.worker.postMessage({ type: 'rightclick' });
    });

    r.canvas.addEventListener('click', (e) => { e.stopPropagation(); }, true);

    this._setupTouch();
  }

  _handleGameClick(clientX, clientY) {
    const r = this.r;
    const { gx, gy } = r.screenToGame(clientX, clientY);
    if (gx < 0 || gx >= this.GRID_W || gy < 0 || gy >= this.GRID_H) return;

    // Location selection mode
    if (r._selectingLocation) {
      if (r._cloudIntro) { r._mouseIsDown = false; r._didDrag = false; return; }
      const idx = gy * this.GRID_W + gx;
      if (r.terrain[idx] > 0 && r.grid[idx] === -1) {
        const R = CONFIG.STARTING_RADIUS;
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > R * R) continue;
          const x = gx + dx, y = gy + dy;
          if (x < 0 || x >= this.GRID_W || y < 0 || y >= this.GRID_H) continue;
          const ci = y * this.GRID_W + x;
          if (r.terrain[ci] > 0 && r.grid[ci] < 0) r.grid[ci] = 0;
        }
        r.gridMgr.fullRedraw();
        r.worker.postMessage({ type: 'place_player', gx, gy, radius: R });
        r._selectingLocation = false;
        const targetZoom = Math.max(r.fitZoom * 1.5, 3);
        const toCamX = gx - r.canvas.width / targetZoom / 2;
        const toCamY = gy - r.canvas.height / targetZoom / 2;
        r._placeAnim = {
          start: performance.now(), duration: 1200,
          fromZoom: r.zoom, toZoom: targetZoom,
          fromCamX: r.camX, fromCamY: r.camY,
          toCamX, toCamY,
        };
      }
      r._mouseIsDown = false; r._didDrag = false;
      return;
    }

    // Tutorial click detection (before processing)
    if (r._tutorialActive) r.tutorial.checkCompletion('click', { gx, gy });

    // Tutorial input filtering
    if (r._tutorialActive) {
      const step = r.tutorial.currentStep();
      if (step) {
        if (step.id === 'welcome' || step.id === 'camera' || step.id === 'complete') {
          r._mouseIsDown = false; r._didDrag = false;
          return;
        }
        if (step.id === 'expand' && r.grid) {
          const idx = gy * this.GRID_W + gx;
          if (r.grid[idx] !== -1) {
            r._mouseIsDown = false; r._didDrag = false;
            return;
          }
        }
      }
    }

    if (r.placementMode === 'city') {
      r.worker.postMessage({ type: 'place_city', gx, gy }); r.placementMode = null;
    } else if (r.placementMode === 'defense_post') {
      r.worker.postMessage({ type: 'place_defense_post', gx, gy }); r.placementMode = null;
    } else {
      r.worker.postMessage({ type: 'click', gx, gy, ratio: r.attackRatio });
    }
  }

  _setupTouch() {
    const r = this.r;
    let touchStartTime = 0;

    r.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchStartTime = performance.now();
        r._mouseDownX = t.clientX; r._mouseDownY = t.clientY;
        r._didDrag = false; r._camStartX = r.camX; r._camStartY = r.camY;
        r._mouseIsDown = true;
        r._touchId = t.identifier;
      } else if (e.touches.length === 2) {
        r._mouseIsDown = false; r._didDrag = true;
        const t0 = e.touches[0], t1 = e.touches[1];
        r._pinchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        r._pinchZoom = r.zoom;
        const mx = (t0.clientX + t1.clientX) / 2, my = (t0.clientY + t1.clientY) / 2;
        const { cx, cy } = r.screenToCanvas(mx, my);
        r._pinchGameX = cx / r.zoom + r.camX;
        r._pinchGameY = cy / r.zoom + r.camY;
      }
    }, { passive: false });

    r.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const scale = dist / r._pinchDist;
        r.zoom = Math.max(r.minZoom, Math.min(r.maxZoom, r._pinchZoom * scale));
        const mx = (t0.clientX + t1.clientX) / 2, my = (t0.clientY + t1.clientY) / 2;
        const { cx, cy } = r.screenToCanvas(mx, my);
        r.camX = r._pinchGameX - cx / r.zoom;
        r.camY = r._pinchGameY - cy / r.zoom;
        r.clampCamera();
        return;
      }
      if (!r._mouseIsDown || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - r._mouseDownX, dy = t.clientY - r._mouseDownY;
      if (!r._didDrag && Math.abs(dx) + Math.abs(dy) > 10) r._didDrag = true;
      if (r._didDrag) {
        const rect = r.canvas.getBoundingClientRect();
        r.camX = r._camStartX - dx / rect.width * r.canvas.width / r.zoom;
        r.camY = r._camStartY - dy / rect.height * r.canvas.height / r.zoom;
        r.clampCamera();
      }
    }, { passive: false });

    r.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (e.touches.length > 0) return;
      if (r._mouseIsDown && !r._didDrag) {
        const t = e.changedTouches[0];
        const { cx: tcx, cy: tcy } = r.screenToCanvas(t.clientX, t.clientY);

        if (tcx >= 10 && tcx < 310 && tcy >= 10 && tcy < 30) {
          r._leaderboardOpen = !r._leaderboardOpen;
          r._mouseIsDown = false; r._didDrag = false; return;
        }
        const bps = r._uiPositions.buildButtons || {};
        for (const item of BUILD_ITEMS) {
          const bp = bps[item.key];
          if (bp && tcx >= bp.x && tcx <= bp.x + bp.w && tcy >= bp.y && tcy <= bp.y + bp.h) {
            const cost = r.getBuildCost(item.key);
            const gold = (r.playerData[0] || {}).gold || 0;
            if (gold >= cost) {
              r.placementMode = r.placementMode === item.key ? null : item.key;
              r._buildPreview = null;
            }
            r._mouseIsDown = false; r._didDrag = false; return;
          }
        }
        const helpX = r.canvas.width - 30, helpY = 30;
        if ((tcx - helpX) ** 2 + (tcy - helpY) ** 2 < 225) {
          r._helpOpen = !r._helpOpen;
          r._mouseIsDown = false; r._didDrag = false; return;
        }

        // Simulate game click
        const { gx, gy } = r.screenToGame(t.clientX, t.clientY);
        if (gx >= 0 && gx < this.GRID_W && gy >= 0 && gy < this.GRID_H && !r.gameOver) {
          if (r._selectingLocation) {
            if (!r._cloudIntro) {
              const idx = gy * this.GRID_W + gx;
              if (r.terrain[idx] > 0 && r.grid[idx] === -1) {
                const R = CONFIG.STARTING_RADIUS;
                for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
                  if (dx * dx + dy * dy > R * R) continue;
                  const x = gx + dx, y = gy + dy;
                  if (x < 0 || x >= this.GRID_W || y < 0 || y >= this.GRID_H) continue;
                  const ci = y * this.GRID_W + x;
                  if (r.terrain[ci] > 0 && r.grid[ci] < 0) r.grid[ci] = 0;
                }
                r.gridMgr.fullRedraw();
                r.worker.postMessage({ type: 'place_player', gx, gy, radius: R });
                r._selectingLocation = false;
                const targetZoom = Math.max(r.fitZoom * 1.5, 3);
                const toCamX = gx - r.canvas.width / targetZoom / 2;
                const toCamY = gy - r.canvas.height / targetZoom / 2;
                r._placeAnim = {
                  start: performance.now(), duration: 1200,
                  fromZoom: r.zoom, toZoom: targetZoom,
                  fromCamX: r.camX, fromCamY: r.camY,
                  toCamX, toCamY,
                };
              }
            }
          } else if (r.placementMode === 'city') {
            r.worker.postMessage({ type: 'place_city', gx, gy }); r.placementMode = null;
          } else if (r.placementMode === 'defense_post') {
            r.worker.postMessage({ type: 'place_defense_post', gx, gy }); r.placementMode = null;
          } else {
            r.worker.postMessage({ type: 'click', gx, gy, ratio: r.attackRatio });
          }
        }
        if (r.gameOver && r._restartBtn) {
          const { cx, cy } = r.screenToCanvas(t.clientX, t.clientY);
          const rb = r._restartBtn;
          if (cx >= rb.x && cx <= rb.x + rb.w && cy >= rb.y && cy <= rb.y + rb.h) {
            location.reload();
          }
        }
      }
      r._mouseIsDown = false; r._didDrag = false;
    }, { passive: false });
  }
}
