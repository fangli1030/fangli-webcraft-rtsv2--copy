// renderer.js — Main GameRenderer class: orchestrates grid, input, HUD, tutorial, worker

import { CONFIG, PLAYER_COLORS, AVAILABLE_MAPS, gameState, formatTroops } from './config.js';
import { ColorPalette, buildWaterColors } from './colors.js';
import { GridManager } from './grid.js';
import { InputManager } from './input.js';
import { HudRenderer } from './hud.js';
import { TutorialManager } from './tutorial.js';

export class GameRenderer {
  constructor(canvas, mapId, playerName) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.playerName = playerName || 'You';
    this.spectateMode = !playerName;
    this._lastTickTime = performance.now();

    this.bufferCanvas = document.createElement('canvas');
    this.bufferCanvas.width = CONFIG.WIDTH;
    this.bufferCanvas.height = CONFIG.HEIGHT;
    this.bufCtx = this.bufferCanvas.getContext('2d');
    this.imageData = this.bufCtx.createImageData(CONFIG.WIDTH, CONFIG.HEIGHT);
    this.data32 = new Uint32Array(this.imageData.data.buffer);

    this.camX = 0; this.camY = 0;
    this.zoom = 1; this.minZoom = 0.5; this.maxZoom = 8;
    this._camStartX = 0; this._camStartY = 0;

    this.grid = null; this.terrain = null;
    this.borderMap = null; this.defendedMap = null;
    this.waterC = null;
    this.playerData = []; this.cities = []; this.defensePosts = [];
    this.econBuildings = []; this.boats = []; this.animations = [];
    this.gameOver = false; this.winner = null;
    this.ready = false;
    this.attackRatio = 0.2;
    this.placementMode = null;
    this._leaderboardOpen = window.innerWidth >= 700;
    this._helpOpen = false;
    this._selectingLocation = false;
    this.totalLandTiles = 0;
    this._lastTroops = 0; this._troopRate = 0; this._troopRateTimer = 0;
    this._lastGold = 0; this._goldRate = 0;
    this._goldBreakdown = { land: 0, farms: 0, mines: 0 };
    this._hoverGoldPill = false;
    this._contextMenu = null;
    this._uiPositions = {};
    this._tutorialActive = false;

    // Sub-systems
    this.colors = new ColorPalette();
    this.gridMgr = new GridManager(this);
    this.input = new InputManager(this);
    this.hud = new HudRenderer(this);
    this.tutorial = new TutorialManager(this);

    this.resizeCanvas();
    this.zoom = this.fitZoom || this.minZoom;
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.placementMode = null; this._buildPreview = null; this._contextMenu = null; }
    });

    this._icons = {};
    for (const name of ['gold', 'city', 'defense_post', 'troop']) {
      const img = new Image();
      img.src = `icons/${name}.svg`;
      this._icons[name] = img;
    }
    this.startWorker(mapId || 'usa');
  }

  get GRID_W() { return gameState.GRID_W; }
  get GRID_H() { return gameState.GRID_H; }

  destroy() {
    if (this.worker) this.worker.terminate();
    this._destroyed = true;
  }

  resizeCanvas() {
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = w; this.canvas.height = h;
    this.ctx.imageSmoothingEnabled = false;
    const fitZoom = this.spectateMode
      ? Math.max(w / CONFIG.WIDTH, h / CONFIG.HEIGHT)
      : Math.min(w / CONFIG.WIDTH, h / CONFIG.HEIGHT);
    this.minZoom = Math.max(w / CONFIG.WIDTH, h / CONFIG.HEIGHT);
    this.fitZoom = fitZoom;
    if (this.zoom < this.minZoom) this.zoom = this.minZoom;
    if (this.spectateMode) {
      this.zoom = fitZoom;
      this.camX = (CONFIG.WIDTH - w / this.zoom) / 2;
      this.camY = (CONFIG.HEIGHT - h / this.zoom) / 2;
    }
    this.clampCamera();
  }

  screenToGame(sx, sy) {
    const r = this.canvas.getBoundingClientRect();
    const cx = (sx - r.left) / r.width * this.canvas.width;
    const cy = (sy - r.top) / r.height * this.canvas.height;
    return { gx: Math.floor(cx / this.zoom + this.camX), gy: Math.floor(cy / this.zoom + this.camY) };
  }

  screenToCanvas(sx, sy) {
    const r = this.canvas.getBoundingClientRect();
    return { cx: (sx - r.left) / r.width * this.canvas.width, cy: (sy - r.top) / r.height * this.canvas.height };
  }

  clampCamera() {
    const vw = this.canvas.width / this.zoom, vh = this.canvas.height / this.zoom;
    this.camX = Math.max(0, Math.min(CONFIG.WIDTH - vw, this.camX));
    this.camY = Math.max(0, Math.min(CONFIG.HEIGHT - vh, this.camY));
  }

  getBuildCost(key) {
    const ps = this.playerData[0] || {};
    if (key === 'city') return Math.min(500, Math.floor(50 * Math.pow(2, ps.cityCount || 0)));
    if (key === 'defense_post') return Math.min(150, 25 + (ps.dpostCount || 0) * 25);
    return 999;
  }

  async startWorker(mapId) {
    const mapInfo = AVAILABLE_MAPS.find(m => m.id === mapId) || AVAILABLE_MAPS[0];
    gameState.PLAYER_NAMES = [...mapInfo.playerNames];
    gameState.PLAYER_NAMES[0] = this.playerName;

    const manifest = await fetch(`maps/${mapId}/manifest.json`).then(r => r.json());
    const mapBuf = await fetch(`maps/${mapId}/map.bin`).then(r => r.arrayBuffer());
    const mapTerrain = new Uint8Array(mapBuf);

    CONFIG.WIDTH = manifest.width; CONFIG.HEIGHT = manifest.height;
    gameState.GRID_W = CONFIG.WIDTH; gameState.GRID_H = CONFIG.HEIGHT;
    gameState.STARTING_POSITIONS = manifest.nations.map(n => ({ gx: n.coordinates[0], gy: n.coordinates[1] }));

    this.bufferCanvas.width = CONFIG.WIDTH; this.bufferCanvas.height = CONFIG.HEIGHT;
    this.imageData = this.bufCtx.createImageData(CONFIG.WIDTH, CONFIG.HEIGHT);
    this.data32 = new Uint32Array(this.imageData.data.buffer);
    this.resizeCanvas();

    const GRID_W = this.GRID_W, GRID_H = this.GRID_H;
    this.terrain = new Uint8Array(GRID_W * GRID_H);
    this.waterMag = new Uint8Array(GRID_W * GRID_H);
    this.grid = new Int8Array(GRID_W * GRID_H).fill(-2);
    this.borderMap = new Uint8Array(GRID_W * GRID_H);
    this.defendedMap = new Uint8Array(GRID_W * GRID_H);
    this.distMap = new Uint8Array(GRID_W * GRID_H).fill(255);

    for (let i = 0; i < mapTerrain.length; i++) {
      const b = mapTerrain[i], isLand = (b >> 7) & 1, mag = b & 0x1f;
      if (isLand) {
        this.grid[i] = -1;
        this.terrain[i] = mag < 10 ? 1 : mag < 20 ? 2 : 3;
        this.waterMag[i] = 0;
      } else {
        this.terrain[i] = 0;
        this.waterMag[i] = mag;
      }
    }

    // Shuffle starting positions (Fisher-Yates)
    const shuffled = [...gameState.STARTING_POSITIONS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    gameState.STARTING_POSITIONS = shuffled;

    const R = CONFIG.STARTING_RADIUS;
    for (let p = 1; p < gameState.STARTING_POSITIONS.length; p++) {
      const { gx: sx, gy: sy } = gameState.STARTING_POSITIONS[p];
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const x = sx + dx, y = sy + dy;
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
        if (this.terrain[y * GRID_W + x] > 0) this.grid[y * GRID_W + x] = p;
      }
    }

    this.waterC = buildWaterColors(this.terrain, GRID_W, GRID_H);

    this.worker = new Worker('game-worker.js', { type: 'module' });
    this.worker.onerror = (e) => console.error('[worker error]', e);
    this.worker.onmessage = (e) => this._handleWorkerMessage(e.data);
    this.worker.postMessage({
      type: 'init', gridW: GRID_W, gridH: GRID_H, numBots: CONFIG.NUM_BOTS,
      cellSize: CONFIG.CELL_SIZE, cellsPerTick: CONFIG.CELLS_PER_TICK,
      expansionTickMs: CONFIG.EXPANSION_TICK_MS, botThinkMs: CONFIG.BOT_THINK_MS,
      startingTroops: CONFIG.STARTING_TROOPS, startingRadius: CONFIG.STARTING_RADIUS,
      startingPositions: gameState.STARTING_POSITIONS,
      terrain: Array.from(this.terrain), waterMag: Array.from(this.waterMag), grid: Array.from(this.grid),
      playerName: this.playerName,
      spectateMode: this.spectateMode,
      boatsEnabled: CONFIG.BOATS_ENABLED,
    });
  }

  _handleWorkerMessage(msg) {
    if (msg.type === 'init_done') {
      if (msg.fullGrid) {
        const fg = msg.fullGrid;
        for (let i = 0; i < fg.length; i++) this.grid[i] = fg[i];
      }
      this.gridMgr.fullRedraw();
      if (!this.spectateMode) {
        this.input.setup();
        this._selectingLocation = true;
        this._initCloudIntro();
      }
      if (msg.totalLandTiles) this.totalLandTiles = msg.totalLandTiles;
      this.ready = true;
      if (!this.spectateMode) {
        this._introStart = performance.now();
        this._introDuration = 3000;
        this._introFromZoom = this.minZoom * 0.6;
        this._introToZoom = this.minZoom;
        this.zoom = this._introFromZoom;
        const w = this.canvas.width, h = this.canvas.height;
        this.camX = (CONFIG.WIDTH - w / this.zoom) / 2;
        this.camY = (CONFIG.HEIGHT - h / this.zoom) / 2;
      }
    }

    if (msg.type === 'tick') {
      this._lastTickTime = performance.now();
      const ch = new Int32Array(msg.changes);
      for (let i = 0; i < msg.changesLen; i += 2) this.gridMgr.applyChange(ch[i], ch[i + 1]);
      this.playerData = msg.players;
      this.cities = msg.cities || [];
      const newDposts = msg.defensePosts || [];
      const dpostsChanged = newDposts.length !== (this.defensePosts || []).length;
      this.defensePosts = newDposts;
      this.econBuildings = msg.econBuildings || [];
      this.boats = msg.boats || [];
      if (msg.goldBreakdown) this._goldBreakdown = msg.goldBreakdown;
      this.gameOver = msg.gameOver; this.winner = msg.winner;
      for (const dd of (msg.destroyedDposts || [])) {
        this.animations.push({ type: 'dpost_destroy', idx: dd.idx, owner: dd.owner, startTime: performance.now(), duration: 800 });
      }
      if (dpostsChanged) this.gridMgr.refreshDefendedMap();
      if (this._tutorialActive) this.tutorial.checkCompletion('tick');

      // Troop rate calculation
      const now = performance.now();
      if (this.playerData[0] && now - this._troopRateTimer > 1000) {
        const currentTroops = this.playerData[0].troops + (this.playerData[0].attackTroops || 0);
        const currentGold = this.playerData[0].gold || 0;
        if (this._troopRateTimer === 0) {
          this._lastTroops = currentTroops;
          this._lastGold = currentGold;
          const cellCount = this.playerData[0].cellCount || 0;
          const baseGoldPerSec = 0.02 + cellCount * 0.0001;
          this._goldRate = baseGoldPerSec * 60 * 10;
          this._troopRateTimer = now;
          return;
        }
        this._troopRate = currentTroops - this._lastTroops;
        this._lastTroops = currentTroops;
        const goldDelta = currentGold - this._lastGold;
        if (goldDelta >= 0) this._goldRate = goldDelta * 60;
        this._lastGold = currentGold;
        this._troopRateTimer = now;
      }
    }

    if (msg.type === 'preview_result') this._buildPreview = msg.preview;
    if (msg.type === 'inspect_result') {
      if (this._inspectAllPending > 0 && msg.result) {
        this._inspectAllChains.push(msg.result);
        this._inspectAllPending--;
      } else {
        this._inspectData = msg.result;
      }
    }
    if (msg.type === 'inspect_all_type_result') this._inspectAllData = msg.result;
  }

  render() {
    if (this._destroyed) return;
    if (this.ready) {
      if (this._introStart) {
        const t = Math.min(1, (performance.now() - this._introStart) / this._introDuration);
        const e = 1 - Math.pow(1 - t, 3);
        this.zoom = this._introFromZoom + (this._introToZoom - this._introFromZoom) * e;
        const w = this.canvas.width, h = this.canvas.height;
        this.camX = (CONFIG.WIDTH - w / this.zoom) / 2;
        this.camY = (CONFIG.HEIGHT - h / this.zoom) / 2;
        if (t >= 1) this._introStart = null;
      } else if (this._placeAnim) {
        const a = this._placeAnim;
        const t = Math.min(1, (performance.now() - a.start) / a.duration);
        const e = 1 - Math.pow(1 - t, 3);
        this.zoom = a.fromZoom + (a.toZoom - a.fromZoom) * e;
        this.camX = a.fromCamX + (a.toCamX - a.fromCamX) * e;
        this.camY = a.fromCamY + (a.toCamY - a.fromCamY) * e;
        this.clampCamera();
        if (t >= 1) this._placeAnim = null;
      } else {
        if (this._hoverUI) this.canvas.style.cursor = 'pointer';
        else if (this.placementMode) this.canvas.style.cursor = 'cell';
        else this.canvas.style.cursor = 'default';

        const panSpeed = 4 / this.zoom;
        if (this._keysDown && this._keysDown.size) {
          if (this._keysDown.has('w')) this.camY -= panSpeed;
          if (this._keysDown.has('s')) this.camY += panSpeed;
          if (this._keysDown.has('a')) this.camX -= panSpeed;
          if (this._keysDown.has('d')) this.camX += panSpeed;
          this.clampCamera();
        }
      }

      this.bufCtx.putImageData(this.imageData, 0, 0);
      const ctx = this.ctx;
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.save();
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.camX, -this.camY);
      ctx.drawImage(this.bufferCanvas, 0, 0);
      ctx.restore();

      if (this._cloudIntro) this.renderCloudIntro();
      if (!this.spectateMode) this.hud.render();
    }
    requestAnimationFrame(() => this.render());
  }

  initTutorial() {
    this._tutorialActive = true;
    this.tutorial.init();
  }

  // --- Cloud intro (kept on renderer since it's a one-off effect) ---

  _initCloudIntro() {
    this._cloudIntro = { start: performance.now(), duration: 3000, puffs: [] };
    const cw = this.canvas.width, ch = this.canvas.height;
    const cx = cw / 2, cy = ch / 2;
    const cols = 8, rows = 6;
    const idx = [];
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) idx.push([gx, gy]);
    for (let i = 0; i < 40; i++) idx.push([Math.random() * cols, Math.random() * rows]);
    for (let i = 0; i < idx.length; i++) {
      const [gx, gy] = idx[i];
      const px = (gx + 0.5) / cols * cw + (Math.random() - 0.5) * (cw / cols) * 0.6;
      const py = (gy + 0.5) / rows * ch + (Math.random() - 0.5) * (ch / rows) * 0.6;
      const outAngle = Math.atan2(py - cy, px - cx);
      const edgeDist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) / Math.max(cw, ch);
      this._cloudIntro.puffs.push({
        x: px, y: py,
        r: 120 + Math.random() * 160,
        vx: Math.cos(outAngle) * (60 + edgeDist * 200 + Math.random() * 100),
        vy: Math.sin(outAngle) * (60 + edgeDist * 200 + Math.random() * 100),
        opacity: 0.7 + Math.random() * 0.3,
        layer: Math.random(),
        sub: [],
      });
      const p = this._cloudIntro.puffs[i];
      const numSub = 6 + Math.floor(Math.random() * 6);
      for (let j = 0; j < numSub; j++) {
        const sa = Math.random() * Math.PI * 2;
        const sd = Math.random() * p.r * 0.7;
        p.sub.push({ ox: Math.cos(sa) * sd, oy: Math.sin(sa) * sd, r: p.r * (0.35 + Math.random() * 0.45) });
      }
    }
  }

  renderCloudIntro() {
    const ci = this._cloudIntro;
    if (!ci) return false;
    const t = (performance.now() - ci.start) / ci.duration;
    if (t >= 1) { this._cloudIntro = null; return false; }
    const ctx = this.ctx;
    const fadeStart = 0.15;
    const globalFade = t < fadeStart ? 1 : 1 - Math.pow((t - fadeStart) / (1 - fadeStart), 0.8);
    const drift = Math.pow(t, 1.5);
    for (const p of ci.puffs) {
      const px = p.x + p.vx * drift * 2.5;
      const py = p.y + p.vy * drift * 2.5;
      const layerFade = Math.max(0, globalFade - p.layer * 0.2);
      if (layerFade <= 0) continue;
      const alpha = p.opacity * layerFade;
      for (const s of p.sub) {
        const sx = px + s.ox * (1 + drift * 0.5), sy = py + s.oy * (1 + drift * 0.5);
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.r * (1 + drift * 0.3));
        grad.addColorStop(0, `rgba(225,230,240,${alpha * 0.7})`);
        grad.addColorStop(0.4, `rgba(205,215,230,${alpha * 0.4})`);
        grad.addColorStop(1, `rgba(185,200,220,0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(sx - s.r * 1.5, sy - s.r * 1.5, s.r * 3, s.r * 3);
      }
    }
    return true;
  }
}
