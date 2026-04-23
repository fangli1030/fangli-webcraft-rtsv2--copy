// CONFIG is populated after manifest loads
const CONFIG = {
  WIDTH: 1440,
  HEIGHT: 1800,
  CELL_SIZE: 1,
  NUM_BOTS: 10,
  STARTING_RADIUS: 10,
  STARTING_TROOPS: 200,
  EXPANSION_TICK_MS: 50,
  CELLS_PER_TICK: 10,
  BOT_THINK_MS: 2000,
};

let GRID_W = CONFIG.WIDTH;
let GRID_H = CONFIG.HEIGHT;

const PLAYER_COLORS = [
  '#4488ff', '#ff4444', '#44bb44', '#ffaa22', '#cc44cc',
  '#44cccc', '#ff6699', '#bbbb22', '#8855dd', '#cc8844', '#44cc88',
];
const AVAILABLE_MAPS = [
  { id: 'india_small', name: 'India (Small)', desc: '480x600 — Fast games', playerNames: ['You', 'Maurya', 'Chola', 'Mughal', 'Maratha', 'Gupta', 'Rajput', 'Vijayanagara', 'Pallava', 'Sikh Empire', 'Pandya'] },
  { id: 'indiahd', name: 'India (HD)', desc: '1440x1800 — Full detail', playerNames: ['You', 'Maurya', 'Chola', 'Mughal', 'Maratha', 'Gupta', 'Rajput', 'Vijayanagara', 'Pallava', 'Sikh Empire', 'Pandya'] },
  { id: 'europe', name: 'Europe', desc: '1520x960 — Iceland to the Urals', playerNames: ['You', 'Roman Empire', 'Byzantine', 'Frankish', 'Viking', 'Castile', 'Habsburg', 'Prussian', 'Kievan Rus', 'Ottoman', 'Polish'] },
];

let PLAYER_NAMES = AVAILABLE_MAPS[0].playerNames;
let STARTING_POSITIONS = [];

function hexToRgb(hex) { return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }; }
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; return (((h ^ (h >> 13)) * 1274126177) & 0x7fffffff) / 0x7fffffff; }
const toU32 = (r, g, b) => (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
function lerpColor(a, b, t) { return { r: (a.r * (1 - t) + b.r * t) | 0, g: (a.g * (1 - t) + b.g * t) | 0, b: (a.b * (1 - t) + b.b * t) | 0 }; }
function maxTroopsForTiles(t, cityCount) { return Math.floor(Math.pow(t, 0.6) * 12 + 150 + (cityCount || 0) * 100); }
function formatTroops(n) { n = Math.floor(n); if (n >= 10000) return (n / 1000).toFixed(0) + 'K'; if (n >= 1000) return (n / 1000).toFixed(1) + 'K'; return '' + n; }

class GameRenderer {
  constructor(canvas, mapId) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    // The game buffer is fixed at CONFIG size; the display canvas scales to fill screen
    this.bufferCanvas = document.createElement('canvas');
    this.bufferCanvas.width = CONFIG.WIDTH;
    this.bufferCanvas.height = CONFIG.HEIGHT;
    this.bufCtx = this.bufferCanvas.getContext('2d');
    this.imageData = this.bufCtx.createImageData(CONFIG.WIDTH, CONFIG.HEIGHT);
    this.data32 = new Uint32Array(this.imageData.data.buffer);

    // Camera
    this.camX = 0;
    this.camY = 0;
    this.zoom = 1;
    this.minZoom = 0.5;
    this.maxZoom = 8;
    this._panning = false;
    this._panStartX = 0;
    this._panStartY = 0;
    this._camStartX = 0;
    this._camStartY = 0;

    this.grid = null;
    this.terrain = null;
    this.borderMap = null;
    this.waterColors = null;
    this.playerData = [];
    this.cities = [];
    this.animations = [];
    this.gameOver = false;
    this.winner = null;
    this.ready = false;
    this.infoPanelTimer = 0;
    this.attackRatio = 0.5;
    this.placementMode = null; // null, 'city', or 'defense_post'

    this.resizeCanvas();
    this.zoom = this.fitZoom || this.minZoom;
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.placementMode = null; this._buildPreview = null; this._contextMenu = null; } });
    window._gameRenderer = this;
    this.initColors();
    this.startWorker(mapId || 'indiahd');
  }

  resizeCanvas() {
    const panel = document.getElementById('info-panel');
    const panelW = panel ? panel.offsetWidth + 32 : 260;
    const w = window.innerWidth - panelW;
    const h = window.innerHeight - 32;
    this.canvas.width = Math.floor(w);
    this.canvas.height = Math.floor(h);
    this.canvas.style.width = Math.floor(w) + 'px';
    this.canvas.style.height = Math.floor(h) + 'px';
    this.ctx.imageSmoothingEnabled = false;
    const fitZoom = Math.min(w / CONFIG.WIDTH, h / CONFIG.HEIGHT);
    this.minZoom = fitZoom * 0.3;
    this.fitZoom = fitZoom;
    if (this.zoom < this.minZoom) this.zoom = this.minZoom;
    this.clampCamera();
  }

  screenToGame(sx, sy) {
    const r = this.canvas.getBoundingClientRect();
    const cx = (sx - r.left) / r.width * this.canvas.width;
    const cy = (sy - r.top) / r.height * this.canvas.height;
    const gx = (cx / this.zoom + this.camX);
    const gy = (cy / this.zoom + this.camY);
    return { gx: Math.floor(gx), gy: Math.floor(gy) };
  }

  screenToCanvas(sx, sy) {
    const r = this.canvas.getBoundingClientRect();
    return { cx: (sx - r.left) / r.width * this.canvas.width, cy: (sy - r.top) / r.height * this.canvas.height };
  }

  clampCamera() {
    const vw = this.canvas.width / this.zoom;
    const vh = this.canvas.height / this.zoom;
    if (vw >= CONFIG.WIDTH) {
      this.camX = -(vw - CONFIG.WIDTH) / 2;
    } else {
      this.camX = Math.max(0, Math.min(CONFIG.WIDTH - vw, this.camX));
    }
    if (vh >= CONFIG.HEIGHT) {
      this.camY = -(vh - CONFIG.HEIGHT) / 2;
    } else {
      this.camY = Math.max(0, Math.min(CONFIG.HEIGHT - vh, this.camY));
    }
  }

  initColors() {
    const tan = { r: 196, g: 168, b: 98 }, white = { r: 220, g: 216, b: 210 };
    this.terrainC = [0, toU32(110, 158, 72), toU32(186, 166, 108), toU32(210, 206, 198)];
    this.playerC = PLAYER_COLORS.map(hex => {
      const c = hexToRgb(hex), h = lerpColor(c, tan, 0.15), m = lerpColor(c, white, 0.25);
      return [0, toU32(c.r, c.g, c.b), toU32(h.r, h.g, h.b), toU32(m.r, m.g, m.b)];
    });
    this.playerBC = PLAYER_COLORS.map(hex => {
      const c = hexToRgb(hex);
      const bo = c2 => toU32(Math.min(255, c2.r + 50), Math.min(255, c2.g + 50), Math.min(255, c2.b + 50));
      return [0, bo(c), bo(lerpColor(c, tan, 0.15)), bo(lerpColor(c, white, 0.25))];
    });
    this.playerDefBCLight = PLAYER_COLORS.map(hex => {
      const c = hexToRgb(hex);
      const dk = c2 => toU32((c2.r * 0.8)|0, (c2.g * 0.8)|0, (c2.b * 0.8)|0);
      return [0, dk(c), dk(lerpColor(c, tan, 0.15)), dk(lerpColor(c, white, 0.25))];
    });
    this.playerDefBCDark = PLAYER_COLORS.map(hex => {
      const c = hexToRgb(hex);
      const dk = c2 => toU32((c2.r * 0.6)|0, (c2.g * 0.6)|0, (c2.b * 0.6)|0);
      return [0, dk(c), dk(lerpColor(c, tan, 0.15)), dk(lerpColor(c, white, 0.25))];
    });
  }

  async startWorker(mapId) {
    const mapInfo = AVAILABLE_MAPS.find(m => m.id === mapId) || AVAILABLE_MAPS[0];
    PLAYER_NAMES = mapInfo.playerNames;

    const manifest = await fetch(`maps/${mapId}/manifest.json`).then(r => r.json());
    const mapBuf = await fetch(`maps/${mapId}/map.bin`).then(r => r.arrayBuffer());
    const mapTerrain = new Uint8Array(mapBuf);

    CONFIG.WIDTH = manifest.width;
    CONFIG.HEIGHT = manifest.height;
    GRID_W = CONFIG.WIDTH;
    GRID_H = CONFIG.HEIGHT;

    STARTING_POSITIONS = manifest.nations.map(n => ({ gx: n.coordinates[0], gy: n.coordinates[1] }));

    // Rebuild buffers at correct size
    this.bufferCanvas.width = CONFIG.WIDTH;
    this.bufferCanvas.height = CONFIG.HEIGHT;
    this.imageData = this.bufCtx.createImageData(CONFIG.WIDTH, CONFIG.HEIGHT);
    this.data32 = new Uint32Array(this.imageData.data.buffer);
    this.resizeCanvas();

    // Decode binary terrain into our terrain format:
    // Each byte: [land:7][shore:6][ocean:5][mag:0-4]
    // Our terrain: 0=water, 1=plains(mag<10), 2=highland(mag 10-19), 3=mountain(mag>=20)
    this.terrain = new Uint8Array(GRID_W * GRID_H);
    this.grid = new Int8Array(GRID_W * GRID_H).fill(-2);
    this.borderMap = new Uint8Array(GRID_W * GRID_H);
    this.defendedMap = new Uint8Array(GRID_W * GRID_H);

    for (let i = 0; i < mapTerrain.length; i++) {
      const b = mapTerrain[i];
      const isLand = (b >> 7) & 1;
      const mag = b & 0x1f;
      if (isLand) {
        this.grid[i] = -1; // unclaimed land
        if (mag < 10) this.terrain[i] = 1;      // plains
        else if (mag < 20) this.terrain[i] = 2;  // highland
        else this.terrain[i] = 3;                // mountain
      }
    }

    // Pre-place spawn territories on the main thread's grid too
    // so the first render shows ownership correctly
    const R = CONFIG.STARTING_RADIUS;
    for (let p = 0; p < STARTING_POSITIONS.length; p++) {
      const { gx: sx, gy: sy } = STARTING_POSITIONS[p];
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const x = sx + dx, y = sy + dy;
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
        const idx = y * GRID_W + x;
        if (this.terrain[idx] > 0) this.grid[idx] = p;
      }
    }

    this.initWater();

    this.worker = new Worker('game-worker.js');
    this.worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'init_done') {
        this.fullRedraw();
        this.setupInput();
        this.ready = true;
      }
      if (msg.type === 'tick') {
        const ch = new Int32Array(msg.changes);
        for (let i = 0; i < msg.changesLen; i += 2) this.applyChange(ch[i], ch[i + 1]);
        this.playerData = msg.players;
        this.cities = msg.cities || [];
        const newDposts = msg.defensePosts || [];
        const dpostsChanged = newDposts.length !== (this.defensePosts || []).length;
        this.defensePosts = newDposts;
        this.econBuildings = msg.econBuildings || [];
        this.boats = msg.boats || [];
        this.gameOver = msg.gameOver;
        this.winner = msg.winner;
        for (const dd of (msg.destroyedDposts || [])) {
          this.animations.push({
            type: 'dpost_destroy', idx: dd.idx, owner: dd.owner,
            startTime: performance.now(), duration: 800,
          });
        }
        if (dpostsChanged) this.refreshDefendedMap();
      }
      if (msg.type === 'preview_result') {
        this._buildPreview = msg.preview;
      }
      if (msg.type === 'inspect_result') {
        this._inspectData = msg.result;
      }
    };
    this.worker.postMessage({
      type: 'init', gridW: GRID_W, gridH: GRID_H, numBots: CONFIG.NUM_BOTS,
      cellSize: CONFIG.CELL_SIZE,
      cellsPerTick: CONFIG.CELLS_PER_TICK, expansionTickMs: CONFIG.EXPANSION_TICK_MS,
      botThinkMs: CONFIG.BOT_THINK_MS, startingTroops: CONFIG.STARTING_TROOPS,
      startingRadius: CONFIG.STARTING_RADIUS, startingPositions: STARTING_POSITIONS,
      terrain: Array.from(this.terrain), grid: Array.from(this.grid),
    });
  }

  initWater() {
    this.waterC = new Uint32Array(GRID_W * GRID_H);
    const coast = new Uint8Array(GRID_W * GRID_H);
    // Pass 1: detect coastal tiles (water adjacent to land)
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x; if (this.terrain[i] > 0) continue;
      if ((x > 0 && this.terrain[i-1] > 0) || (x < GRID_W-1 && this.terrain[i+1] > 0) ||
          (y > 0 && this.terrain[i-GRID_W] > 0) || (y < GRID_H-1 && this.terrain[i+GRID_W] > 0)) coast[i] = 1;
    }
    // Pass 2: also mark tiles adjacent to coastal tiles (river-adjacent spread)
    const coast2 = new Uint8Array(coast);
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x; if (this.terrain[i] > 0 || coast[i]) continue;
      if ((x > 0 && coast[i-1]) || (x < GRID_W-1 && coast[i+1]) ||
          (y > 0 && coast[i-GRID_W]) || (y < GRID_H-1 && coast[i+GRID_W])) coast2[i] = 1;
    }
    // Pass 3: assign colors
    const riverBlue = toU32(70, 115, 155);
    const coastBlue = toU32(55, 95, 140);
    const defaultDeep = toU32(40, 75, 120);
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x; if (this.terrain[i] > 0) continue;
      if (coast[i]) {
        this.waterC[i] = riverBlue;
      } else if (coast2[i]) {
        this.waterC[i] = coastBlue;
      } else {
        const v = (hash(x*3,y*3)*6)|0, d = (hash(x,y)*4)|0;
        this.waterC[i] = toU32(40+v, 75+v+d, 120+v+d);
      }
    }
  }

  calcBorder(idx) {
    const o = this.grid[idx]; if (o < 0) return false;
    const x = idx % GRID_W, y = (idx / GRID_W) | 0;
    return (x > 0 && this.grid[idx-1] !== o && this.terrain[idx-1] > 0) ||
           (x < GRID_W-1 && this.grid[idx+1] !== o && this.terrain[idx+1] > 0) ||
           (y > 0 && this.grid[idx-GRID_W] !== o && this.terrain[idx-GRID_W] > 0) ||
           (y < GRID_H-1 && this.grid[idx+GRID_W] !== o && this.terrain[idx+GRID_W] > 0);
  }

  calcDefended(idx) {
    const owner = this.grid[idx];
    if (owner < 0 || !this.defensePosts) return false;
    const tx = idx % GRID_W, ty = (idx / GRID_W) | 0;
    for (const dp of this.defensePosts) {
      if (dp.owner !== owner) continue;
      const dx = dp.idx % GRID_W, dy = (dp.idx / GRID_W) | 0;
      if (Math.abs(tx - dx) + Math.abs(ty - dy) <= 20) return true;
    }
    return false;
  }

  paintCell(idx) {
    const o = this.grid[idx], t = this.terrain[idx];
    if (t === 0) this.data32[idx] = this.waterC[idx];
    else if (o === -1) this.data32[idx] = this.terrainC[t];
    else if (this.defendedMap[idx]) {
      const gx = idx % GRID_W, gy = (idx / GRID_W) | 0;
      this.data32[idx] = (gx + gy) % 2 === 0 ? this.playerDefBCLight[o][t] : this.playerDefBCDark[o][t];
    }
    else this.data32[idx] = this.borderMap[idx] ? this.playerBC[o][t] : this.playerC[o][t];
  }

  applyChange(idx, newOwner) {
    this.grid[idx] = newOwner;
    const x = idx % GRID_W, y = (idx / GRID_W) | 0;
    const cells = [idx];
    if (x > 0) cells.push(idx - 1);
    if (x < GRID_W - 1) cells.push(idx + 1);
    if (y > 0) cells.push(idx - GRID_W);
    if (y < GRID_H - 1) cells.push(idx + GRID_W);
    for (const i of cells) {
      this.borderMap[i] = (this.grid[i] >= 0 && this.calcBorder(i)) ? 1 : 0;
      this.defendedMap[i] = (this.borderMap[i] && this.calcDefended(i)) ? 1 : 0;
      this.paintCell(i);
    }
  }

  fullRedraw() {
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      if (this.grid[i] >= 0) this.borderMap[i] = this.calcBorder(i) ? 1 : 0;
      this.defendedMap[i] = (this.borderMap[i] && this.calcDefended(i)) ? 1 : 0;
      this.paintCell(i);
    }
  }

  refreshDefendedMap() {
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      if (!this.borderMap[i]) { this.defendedMap[i] = 0; continue; }
      const wasDef = this.defendedMap[i];
      this.defendedMap[i] = this.calcDefended(i) ? 1 : 0;
      if (this.defendedMap[i] !== wasDef) this.paintCell(i);
    }
  }

  setupInput() {
    const DRAG_THRESHOLD = 5;

    this._keysDown = new Set();
    window.addEventListener('keydown', e => { if ('wasd'.includes(e.key)) this._keysDown.add(e.key); });
    window.addEventListener('keyup', e => this._keysDown.delete(e.key));

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();

      let deltaY = e.deltaY;
      if (e.ctrlKey) {
        // Trackpad pinch: ctrlKey + small deltaY. Amplify for usable range.
        // Large ctrl-wheel deltas are browser zoom shortcuts (cmd+/cmd-) — ignore.
        if (Math.abs(deltaY) > 10) return;
        deltaY *= 10;
      } else if (Math.abs(deltaY) < 2) {
        // Filter macOS residual momentum jitter.
        return;
      }

      const { cx, cy } = this.screenToCanvas(e.clientX, e.clientY);
      const gameX = cx / this.zoom + this.camX;
      const gameY = cy / this.zoom + this.camY;
      const zoomFactor = 1 + deltaY / 600;
      this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom / zoomFactor));
      this.camX = gameX - cx / this.zoom;
      this.camY = gameY - cy / this.zoom;
      this.clampCamera();
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      this._mouseDownX = e.clientX;
      this._mouseDownY = e.clientY;
      this._didDrag = false;
      this._camStartX = this.camX;
      this._camStartY = this.camY;

      // If context menu is open, absorb the mousedown (don't start panning)
      if (this._contextMenu) {
        this._contextMenuClick = true;
        e.preventDefault();
        return;
      }

      // Check slider
      const { cx, cy } = this.screenToCanvas(e.clientX, e.clientY);
      const sx = 10, sy = this.canvas.height - 50, sw = 200, sh = 12;
      if (cx >= sx && cx <= sx + sw && cy >= sy && cy <= sy + sh) {
        this.attackRatio = Math.max(0.05, Math.min(1, (cx - sx) / sw));
        this._draggingSlider = true;
        e.preventDefault();
        return;
      }

      this._mouseIsDown = true;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this._draggingSlider) {
        const { cx } = this.screenToCanvas(e.clientX, e.clientY);
        this.attackRatio = Math.max(0.05, Math.min(1, (cx - 10) / 200));
        return;
      }

      // Track hover position for preview/inspect
      const { gx, gy } = this.screenToGame(e.clientX, e.clientY);
      this._hoverGx = gx; this._hoverGy = gy;

      if (this.placementMode && ['farm','mine','mill','factory'].includes(this.placementMode)) {
        if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
          this.worker.postMessage({ type: 'preview_econ', gx, gy, buildType: this.placementMode });
        }
      } else if (!this._mouseIsDown) {
        // Inspect existing buildings on hover (search nearby, not exact pixel)
        if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
          const allBuildings = [
            ...(this.econBuildings || []),
            ...(this.cities || []).map(c => ({ ...c, type: 'city' })),
          ];
          let closest = null, closestDist = Math.max(2, Math.ceil(4 / this.zoom));
          for (const b of allBuildings) {
            const bx = b.idx % GRID_W, by = (b.idx / GRID_W) | 0;
            const dist = Math.abs(gx - bx) + Math.abs(gy - by);
            if (dist < closestDist) { closestDist = dist; closest = b; }
          }
          if (closest && closest.type !== 'city') {
            if (this._lastInspectIdx !== closest.idx) {
              this._lastInspectIdx = closest.idx;
              this.worker.postMessage({ type: 'inspect_building', idx: closest.idx });
            }
          } else {
            this._lastInspectIdx = -1;
            this._inspectData = null;
          }
        }
      }

      if (!this._mouseIsDown) return;

      const dx = e.clientX - this._mouseDownX;
      const dy = e.clientY - this._mouseDownY;
      if (!this._didDrag && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
        this._didDrag = true;
      }
      if (this._didDrag) {
        const r = this.canvas.getBoundingClientRect();
        const panDx = dx / r.width * this.canvas.width / this.zoom;
        const panDy = dy / r.height * this.canvas.height / this.zoom;
        this.camX = this._camStartX - panDx;
        this.camY = this._camStartY - panDy;
        this.clampCamera();
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (this._draggingSlider) { this._draggingSlider = false; return; }

      // Check context menu click
      if (this._contextMenu && this._contextMenuClick) {
        this._contextMenuClick = false;
        const cm = this._contextMenu;
        const { cx, cy } = this.screenToCanvas(e.clientX, e.clientY);
        const cmCanvas = this.screenToCanvas(cm.screenX, cm.screenY);
        const btnX = cmCanvas.cx, btnY = cmCanvas.cy - 40;
        const btnW = 36, btnH = 28;
        if (cx >= btnX - btnW/2 && cx <= btnX + btnW/2 && cy >= btnY - btnH/2 && cy <= btnY + btnH/2) {
          this.worker.postMessage({ type: 'rightclick', gx: cm.gx, gy: cm.gy });
        }
        this._contextMenu = null;
        return;
      }

      if (this._mouseIsDown && !this._didDrag) {
        // It was a click, not a drag
        if (!this.gameOver) {
          const { cx, cy } = this.screenToCanvas(e.clientX, e.clientY);
          const sx = 10, sy = this.canvas.height - 50, sw = 200, sh = 12;
          if (!(cx >= sx && cx <= sx + sw && cy >= sy && cy <= sy + sh)) {
            const { gx, gy } = this.screenToGame(e.clientX, e.clientY);
            if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
              if (this.placementMode === 'city') {
                this.worker.postMessage({ type: 'place_city', gx, gy });
                this.placementMode = null;
              } else if (this.placementMode === 'defense_post') {
                this.worker.postMessage({ type: 'place_defense_post', gx, gy });
                this.placementMode = null;
              } else if (this.placementMode === 'farm' || this.placementMode === 'mine' || this.placementMode === 'mill' || this.placementMode === 'factory') {
                this.worker.postMessage({ type: 'place_econ', gx, gy, buildType: this.placementMode });
                this.placementMode = null;
                this._buildPreview = null;
              } else if (e.shiftKey) {
                this.worker.postMessage({ type: 'place_city', gx, gy });
              } else if (e.ctrlKey || e.metaKey) {
                this.worker.postMessage({ type: 'place_defense_post', gx, gy });
              } else {
                this.worker.postMessage({ type: 'click', gx, gy, ratio: this.attackRatio });
              }
            }
          }
        }
      }

      this._mouseIsDown = false;
      this._didDrag = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.placementMode) {
        this.placementMode = null;
        this._buildPreview = null;
        return;
      }
      const { gx, gy } = this.screenToGame(e.clientX, e.clientY);
      if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
        const idx = gy * GRID_W + gx;
        if (this.terrain && this.terrain[idx] > 0 && this.grid && this.grid[idx] !== 0) {
          this._contextMenu = { screenX: e.clientX, screenY: e.clientY, gx, gy };
          return;
        }
      }
      this._contextMenu = null;
      this.worker.postMessage({ type: 'rightclick' });
    });

    // Prevent click event from also firing after drag
    this.canvas.addEventListener('click', (e) => { e.stopPropagation(); }, true);
  }

  render() {
    if (this.ready) {
      this.canvas.style.cursor = this.placementMode ? 'cell' : 'crosshair';
      const panSpeed = 4 / this.zoom;
      if (this._keysDown && this._keysDown.size) {
        if (this._keysDown.has('w')) this.camY -= panSpeed;
        if (this._keysDown.has('s')) this.camY += panSpeed;
        if (this._keysDown.has('a')) this.camX -= panSpeed;
        if (this._keysDown.has('d')) this.camX += panSpeed;
        this.clampCamera();
      }

      // Draw game buffer to the offscreen canvas
      this.bufCtx.putImageData(this.imageData, 0, 0);

      // Draw zoomed/panned view to display canvas
      const ctx = this.ctx;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.save();
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.camX, -this.camY);
      ctx.drawImage(this.bufferCanvas, 0, 0);
      ctx.restore();

      this.renderOverlays();
      const now = performance.now();
      if (now - this.infoPanelTimer > 300) { this.infoPanelTimer = now; this.updateInfoPanel(); }
    }
    requestAnimationFrame(() => this.render());
  }

  renderOverlays() {
    if (!this.playerData.length) return;
    const ctx = this.ctx, ps = this.playerData[0] || {};

    // Player labels — in game-world coordinates (zoomed)
    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    // Draw cities
    for (const city of this.cities) {
      const cx = city.idx % GRID_W, cy = (city.idx / GRID_W) | 0;
      const r = Math.max(2, 3 / Math.max(1, this.zoom * 0.3));
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.strokeStyle = PLAYER_COLORS[city.owner] || '#fff';
      ctx.lineWidth = Math.max(0.5, 1 / this.zoom);
      ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
    }

    // Draw defense posts (diamond shape + range circle)
    // Check if hovering over any defense post
    let hoveringDpost = false;
    const hgx = this._hoverGx, hgy = this._hoverGy;
    if (hgx !== undefined && hgy !== undefined) {
      for (const dp of (this.defensePosts || [])) {
        const dx = dp.idx % GRID_W, dy = (dp.idx / GRID_W) | 0;
        if (Math.abs(hgx - dx) + Math.abs(hgy - dy) <= Math.max(3, Math.ceil(5 / this.zoom))) {
          hoveringDpost = true; break;
        }
      }
    }

    for (const dp of (this.defensePosts || [])) {
      const dx = dp.idx % GRID_W, dy = (dp.idx / GRID_W) | 0;
      const r = Math.max(2, 2.5 / Math.max(1, this.zoom * 0.3));
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = PLAYER_COLORS[dp.owner] || '#fff';
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.3, 0.7 / this.zoom);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.restore();

      if (hoveringDpost && dp.owner === 0) {
        ctx.beginPath();
        ctx.arc(dx, dy, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = Math.max(0.5, 1 / this.zoom);
        ctx.stroke();
      }
    }

    // Defense post destroy animations
    const now = performance.now();
    for (let i = this.animations.length - 1; i >= 0; i--) {
      const anim = this.animations[i];
      const elapsed = now - anim.startTime;
      if (elapsed >= anim.duration) { this.animations.splice(i, 1); continue; }
      const t = elapsed / anim.duration;
      if (anim.type === 'dpost_destroy') {
        const ax = anim.idx % GRID_W, ay = (anim.idx / GRID_W) | 0;
        const color = PLAYER_COLORS[anim.owner] || '#ff4444';
        const numParticles = 8;
        for (let p = 0; p < numParticles; p++) {
          const angle = (p / numParticles) * Math.PI * 2;
          const dist = t * 12;
          const px = ax + Math.cos(angle) * dist;
          const py = ay + Math.sin(angle) * dist;
          const size = Math.max(0.5, (1 - t) * 3);
          ctx.globalAlpha = 1 - t;
          ctx.fillStyle = color;
          ctx.fillRect(px - size / 2, py - size / 2, size, size);
        }
        const flash = Math.max(0, 1 - t * 3);
        if (flash > 0) {
          ctx.globalAlpha = flash * 0.5;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(ax, ay, (1 - flash) * 8 + 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // Draw economy buildings
    const econIcons = { farm: '☘', mine: '⛏', mill: '⚙', factory: '⚒' };
    const econColors = { farm: '#66aa44', mine: '#aa7744', mill: '#88aa55', factory: '#aa8855' };
    for (const eb of (this.econBuildings || [])) {
      const ex = eb.idx % GRID_W, ey = (eb.idx / GRID_W) | 0;
      const r = Math.max(1.5, 2 / Math.max(1, this.zoom * 0.3));
      ctx.fillStyle = econColors[eb.type] || '#888';
      ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PLAYER_COLORS[eb.owner] || '#fff';
      ctx.lineWidth = Math.max(0.3, 0.6 / this.zoom);
      ctx.stroke();
      if (this.zoom > 2) {
        ctx.fillStyle = '#fff'; ctx.font = `${Math.max(3, 5 / this.zoom)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(econIcons[eb.type] || '?', ex, ey);
      }
    }

    // Draw boats and their paths
    for (const boat of (this.boats || [])) {
      const path = boat.path;
      if (!path || path.length < 2) continue;
      const pColor = PLAYER_COLORS[boat.owner] || '#fff';

      // Draw path line (dotted)
      ctx.strokeStyle = pColor + '66';
      ctx.lineWidth = Math.max(0.5, 1 / this.zoom);
      ctx.setLineDash([Math.max(1, 3 / this.zoom), Math.max(1, 3 / this.zoom)]);
      ctx.beginPath();
      for (let j = 0; j < path.length; j++) {
        const px = path[j] % GRID_W, py = (path[j] / GRID_W) | 0;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw boat at current position
      const ci = Math.min(boat.pathIdx, path.length - 1);
      const bx = path[ci] % GRID_W, by = (path[ci] / GRID_W) | 0;
      const bs = Math.max(2, 3 / Math.max(1, this.zoom * 0.3));

      // Triangle pointing toward next path point
      let angle = 0;
      if (ci < path.length - 1) {
        const nx = path[ci + 1] % GRID_W, ny = (path[ci + 1] / GRID_W) | 0;
        angle = Math.atan2(ny - by, nx - bx);
      }
      ctx.save(); ctx.translate(bx, by); ctx.rotate(angle);
      ctx.fillStyle = pColor;
      ctx.beginPath();
      ctx.moveTo(bs, 0);
      ctx.lineTo(-bs, -bs * 0.7);
      ctx.lineTo(-bs * 0.4, 0);
      ctx.lineTo(-bs, bs * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.3, 0.5 / this.zoom);
      ctx.stroke();
      ctx.restore();

      // Troop count label
      if (this.zoom > 1) {
        ctx.fillStyle = '#fff'; ctx.font = `${Math.max(3, 6 / this.zoom)}px monospace`;
        ctx.textAlign = 'center'; ctx.fillText(formatTroops(boat.troops), bx, by - bs - 2);
      }
    }

    // Defense post placement preview
    if (this.placementMode === 'defense_post' && this._hoverGx !== undefined) {
      const hx = this._hoverGx, hy = this._hoverGy;
      const hIdx = hy * GRID_W + hx;
      const valid = hx >= 0 && hx < GRID_W && hy >= 0 && hy < GRID_H &&
                    this.terrain[hIdx] > 0 && this.grid[hIdx] === 0;

      // Show all existing player defense post radii during placement
      for (const dp of (this.defensePosts || [])) {
        if (dp.owner !== 0) continue;
        const ex = dp.idx % GRID_W, ey = (dp.idx / GRID_W) | 0;
        ctx.beginPath(); ctx.arc(ex, ey, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = Math.max(0.5, 1 / this.zoom);
        ctx.stroke();
      }

      // New placement radius — bold and clear
      ctx.beginPath(); ctx.arc(hx, hy, 20, 0, Math.PI * 2);
      ctx.fillStyle = valid ? 'rgba(255,255,255,0.15)' : 'rgba(255,68,68,0.2)';
      ctx.fill();
      ctx.strokeStyle = valid ? 'rgba(255,255,255,0.7)' : '#ff4444cc';
      ctx.lineWidth = Math.max(1, 2 / this.zoom);
      ctx.stroke();

      // Diamond icon at cursor
      const r = Math.max(2, 2.5 / Math.max(1, this.zoom * 0.3));
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = valid ? PLAYER_COLORS[0] : '#ff4444';
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.3, 0.7 / this.zoom);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.restore();

      // Tint border tiles that would become defended
      if (valid) {
        ctx.globalAlpha = 0.3;
        for (let dy = -20; dy <= 20; dy++) {
          for (let dx = -20; dx <= 20; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > 20) continue;
            const tx = hx + dx, ty = hy + dy;
            if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) continue;
            const ti = ty * GRID_W + tx;
            if (this.borderMap[ti] && this.grid[ti] === 0) {
              ctx.fillStyle = (tx + ty) % 2 === 0 ? '#4488ff' : '#2244aa';
              ctx.fillRect(tx, ty, 1, 1);
            }
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    // City placement preview
    if (this.placementMode === 'city' && this._hoverGx !== undefined) {
      const hx = this._hoverGx, hy = this._hoverGy;
      const hIdx = hy * GRID_W + hx;
      const onOwnLand = hx >= 0 && hx < GRID_W && hy >= 0 && hy < GRID_H &&
                         this.terrain[hIdx] > 0 && this.grid[hIdx] === 0;
      let tooClose = false;
      const conflicting = [];
      for (const c of this.cities) {
        const cx = c.idx % GRID_W, cy = (c.idx / GRID_W) | 0;
        if (Math.abs(hx - cx) + Math.abs(hy - cy) < 15) { tooClose = true; conflicting.push(c); }
      }
      const valid = onOwnLand && !tooClose;

      const r = Math.max(2, 3 / Math.max(1, this.zoom * 0.3));
      ctx.fillStyle = valid ? '#ffd700' : '#ff4444';
      ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
      ctx.strokeStyle = valid ? PLAYER_COLORS[0] : '#ff4444';
      ctx.lineWidth = Math.max(0.5, 1 / this.zoom);
      ctx.strokeRect(hx - r, hy - r, r * 2, r * 2);

      for (const c of conflicting) {
        const cx = c.idx % GRID_W, cy = (c.idx / GRID_W) | 0;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cx, cy);
        ctx.strokeStyle = '#ff4444aa'; ctx.lineWidth = Math.max(0.5, 1 / this.zoom); ctx.stroke();
      }

      if (valid) {
        const fontSize = Math.max(4, 8 / this.zoom);
        ctx.fillStyle = '#ffd700'; ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center'; ctx.fillText('+100 max troops', hx, hy - r - 3);
      }
    }

    // Placement preview overlay
    if (this._buildPreview && this.placementMode) {
      const pv = this._buildPreview;
      const hx = this._hoverGx, hy = this._hoverGy;
      if (pv.type === 'farm' || pv.type === 'mine') {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#44ff44';
        for (const t of (pv.claimable || [])) {
          ctx.fillRect(t % GRID_W, (t / GRID_W) | 0, 1, 1);
        }
        ctx.fillStyle = '#ff4444';
        for (const t of (pv.claimed || [])) {
          ctx.fillRect(t % GRID_W, (t / GRID_W) | 0, 1, 1);
        }
        ctx.globalAlpha = 1;
        // Radius circle
        if (hx !== undefined) {
          ctx.beginPath(); ctx.arc(hx, hy, pv.radius, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = Math.max(0.3, 0.5 / this.zoom); ctx.stroke();
        }
        // Show connections to mills/factories that would boost this building
        ctx.globalAlpha = 0.6;
        for (const cidx of (pv.connectedProcessors || [])) {
          const cx2 = cidx % GRID_W, cy2 = (cidx / GRID_W) | 0;
          ctx.fillStyle = '#44ffff';
          ctx.beginPath(); ctx.arc(cx2, cy2, 3, 0, Math.PI * 2); ctx.fill();
          if (hx !== undefined) {
            ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cx2, cy2);
            ctx.strokeStyle = '#44ffffaa'; ctx.lineWidth = Math.max(0.5, 1 / this.zoom); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      } else {
        // Mill/factory preview — show connected farms/mines
        ctx.globalAlpha = 0.6;
        for (const cidx of (pv.connected || [])) {
          const cx2 = cidx % GRID_W, cy2 = (cidx / GRID_W) | 0;
          ctx.fillStyle = '#44ffff';
          ctx.beginPath(); ctx.arc(cx2, cy2, 3, 0, Math.PI * 2); ctx.fill();
          if (hx !== undefined) {
            ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cx2, cy2);
            ctx.strokeStyle = '#44ffffaa'; ctx.lineWidth = Math.max(0.5, 1 / this.zoom); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        if (hx !== undefined) {
          ctx.beginPath(); ctx.arc(hx, hy, pv.radius, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = Math.max(0.3, 0.5 / this.zoom); ctx.stroke();
        }
        if (pv.stackCount > 0 && hx !== undefined) {
          ctx.fillStyle = '#ff4444'; ctx.font = `${Math.max(4, 8 / this.zoom)}px monospace`;
          ctx.textAlign = 'center'; ctx.fillText(`-${Math.round(pv.stackCount * 40)}% penalty`, hx, hy - pv.radius - 3);
        }
      }
    }

    // Inspect overlay — hover over existing buildings, show full production chain
    if (this._inspectData && !this.placementMode) {
      const chain = this._inspectData;
      const isFarmChain = chain.type === 'farm' || chain.type === 'mill';
      const tileColor = isFarmChain ? '#44ff44' : '#cc8844';

      // Draw all claimed tiles from all producers in the chain
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = tileColor;
      for (const t of (chain.allClaimedTiles || [])) {
        ctx.fillRect(t % GRID_W, (t / GRID_W) | 0, 1, 1);
      }
      ctx.globalAlpha = 1;

      // Highlight all producer buildings (farms/mines)
      for (const prod of (chain.producers || [])) {
        const px = prod.idx % GRID_W, py = (prod.idx / GRID_W) | 0;
        ctx.beginPath(); ctx.arc(px, py, Math.max(2, 3 / this.zoom), 0, Math.PI * 2);
        ctx.fillStyle = tileColor + 'aa'; ctx.fill();
        ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = Math.max(0.3, 0.6 / this.zoom); ctx.stroke();
      }

      // Highlight all processor buildings (mills/factories) with radius circles
      for (const proc of (chain.processors || [])) {
        const mx = proc.idx % GRID_W, my = (proc.idx / GRID_W) | 0;
        ctx.beginPath(); ctx.arc(mx, my, Math.max(2, 3 / this.zoom), 0, Math.PI * 2);
        ctx.fillStyle = '#44ffffaa'; ctx.fill();
        ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = Math.max(0.3, 0.6 / this.zoom); ctx.stroke();

        // Radius circle for processor
        ctx.beginPath(); ctx.arc(mx, my, proc.radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff44'; ctx.lineWidth = Math.max(0.3, 0.5 / this.zoom); ctx.stroke();

        // Connection lines from processor to each producer
        ctx.globalAlpha = 0.5;
        for (const prod of (chain.producers || [])) {
          const px = prod.idx % GRID_W, py = (prod.idx / GRID_W) | 0;
          ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(px, py);
          ctx.strokeStyle = '#44ffffaa'; ctx.lineWidth = Math.max(0.5, 1 / this.zoom); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Radius circle for the hovered building itself
      const hbx = chain.idx % GRID_W, hby = (chain.idx / GRID_W) | 0;
      ctx.beginPath(); ctx.arc(hbx, hby, chain.radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = Math.max(0.5, 1 / this.zoom); ctx.stroke();
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < this.playerData.length; i++) {
      const p = this.playerData[i]; if (!p.alive || p.cn === 0) continue;
      const sz = Math.max(8, Math.min(18, Math.sqrt(p.cn) * 0.06)) / Math.max(1, this.zoom * 0.5);
      ctx.font = `bold ${sz}px sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(PLAYER_NAMES[i], p.cx + 1, p.cy - sz * 0.35 + 1);
      ctx.fillStyle = '#ffffff'; ctx.fillText(PLAYER_NAMES[i], p.cx, p.cy - sz * 0.35);
      ctx.font = `${(sz * 0.85)|0}px monospace`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(formatTroops(p.troops), p.cx + 1, p.cy + sz * 0.5 + 1);
      ctx.fillStyle = '#ffffffcc'; ctx.fillText(formatTroops(p.troops), p.cx, p.cy + sz * 0.5);
    }
    ctx.restore();

    // HUD — in screen coordinates (fixed position)
    const max = maxTroopsForTiles(ps.cellCount || 0, ps.cityCount || 0);
    let st = 'IDLE', sc = '#44cc88';
    if (ps.expanding && ps.attackTarget !== null) {
      if (ps.attackTarget === -1) { st = 'TAKING WILDERNESS'; sc = '#cccc44'; }
      else { st = 'ATTACKING ' + PLAYER_NAMES[ps.attackTarget].toUpperCase(); sc = '#ff6644'; }
    }
    ctx.fillStyle = sc; ctx.fillRect(10, 10, 10, 10);
    ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(st, 26, 20);

    if (this.placementMode) {
      const labels = { city: 'PLACING CITY', defense_post: 'PLACING DEFENSE POST', farm: 'PLACING FARM', mine: 'PLACING MINE', mill: 'PLACING MILL', factory: 'PLACING FACTORY' };
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 11px monospace'; ctx.fillText((labels[this.placementMode] || 'PLACING') + ' — click your territory', 26, 34);
    }

    // Gold display
    const boatCount = (this.boats || []).filter(b => b.owner === 0).length;
    const goldStr = `Gold: ${Math.floor(ps.gold || 0)}  Cities: ${ps.cityCount || 0}  Posts: ${ps.dpostCount || 0}  Boats: ${boatCount}/3`;
    ctx.font = '11px monospace'; ctx.fillStyle = '#ffd700'; ctx.fillText(goldStr, 26, this.placementMode ? 48 : 36);

    const bx = 10, by = this.canvas.height - 20, bw = 200, bh = 8;
    const troops = ps.troops || 0;
    const f = Math.min(1, troops / Math.max(1, max));

    // Zone boundaries (fraction of max)
    const optLow = 0.2, optHigh = 0.45;

    // Background with zone markers
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(bx, by, bw, bh);

    // Draw zone ticks on background
    ctx.fillStyle = '#333';
    ctx.fillRect(bx + bw * optLow, by, 1, bh);
    ctx.fillRect(bx + bw * optHigh, by, 1, bh);

    // Fill bar with zone-based color
    let barColor;
    if (f < optLow) barColor = '#cc4444';
    else if (f <= optHigh) barColor = PLAYER_COLORS[0];
    else barColor = '#ccaa22';
    ctx.fillStyle = barColor; ctx.fillRect(bx, by, bw * f, bh);

    ctx.font = '11px monospace'; ctx.fillStyle = '#fff';
    const zoneName = f < optLow ? ' [LOW]' : f <= optHigh ? ' [OPTIMAL]' : ' [FULL]';
    ctx.fillText(`Troops: ${formatTroops(troops)} / ${formatTroops(max)}${zoneName}`, bx, by - 5);

    if (ps.attackTroops > 0) {
      ctx.fillStyle = '#ff6644';
      ctx.fillText(`  Attacking: ${formatTroops(ps.attackTroops)}`, bx + 210, by + 7);
    }

    // Attack ratio slider (screen space)
    const sy = this.canvas.height - 50, sx = 10, sw = 200, sh = 12;
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle = '#335588'; ctx.fillRect(sx, sy, sw * this.attackRatio, sh);
    ctx.strokeStyle = '#556688'; ctx.lineWidth = 1; ctx.strokeRect(sx, sy, sw, sh);
    ctx.font = '10px monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.fillText(`Attack: ${Math.round(this.attackRatio * 100)}%`, sx + 4, sy + 10);

    // Context menu (boat launch popup)
    if (this._contextMenu) {
      const cm = this._contextMenu;
      const cmCanvas = this.screenToCanvas(cm.screenX, cm.screenY);
      const btnX = cmCanvas.cx, btnY = cmCanvas.cy - 40;
      const btnW = 36, btnH = 28;

      // Button background
      ctx.fillStyle = 'rgba(22,27,34,0.92)';
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 1.5;
      const rx = btnX - btnW/2, ry = btnY - btnH/2;
      ctx.beginPath();
      ctx.roundRect(rx, ry, btnW, btnH, 5);
      ctx.fill(); ctx.stroke();

      // Boat icon (triangle)
      ctx.fillStyle = '#4488ff';
      ctx.beginPath();
      ctx.moveTo(btnX + 8, btnY);
      ctx.lineTo(btnX - 6, btnY - 6);
      ctx.lineTo(btnX - 3, btnY);
      ctx.lineTo(btnX - 6, btnY + 6);
      ctx.closePath();
      ctx.fill();

      // Small wave lines under boat
      ctx.strokeStyle = '#4488ff88';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(btnX - 8, btnY + 10); ctx.quadraticCurveTo(btnX - 4, btnY + 7, btnX, btnY + 10);
      ctx.quadraticCurveTo(btnX + 4, btnY + 13, btnX + 8, btnY + 10);
      ctx.stroke();

      // Pointer line from button to target
      ctx.strokeStyle = '#4488ff44'; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(btnX, btnY + btnH/2); ctx.lineTo(cmCanvas.cx, cmCanvas.cy);
      ctx.stroke(); ctx.setLineDash([]);
    }

    if (this.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 48px sans-serif';
      ctx.fillStyle = this.winner === 0 ? '#44ff44' : '#ff4444';
      ctx.fillText(this.winner === 0 ? 'VICTORY!' : 'DEFEATED', this.canvas.width / 2, this.canvas.height / 2 - 20);
      ctx.font = '18px sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText('Refresh to play again', this.canvas.width / 2, this.canvas.height / 2 + 30);
    }
  }

  updateInfoPanel() {
    const panel = document.getElementById('info-panel');
    if (!panel || !this.playerData.length) return;
    const ps = this.playerData[0], max = maxTroopsForTiles(ps.cellCount, ps.cityCount);
    let tgt = 'None';
    if (ps.expanding && ps.attackTarget !== null)
      tgt = ps.attackTarget === -1 ? '<span style="color:#cccc44">Wilderness</span>' : `<span style="color:#ff6644">${PLAYER_NAMES[ps.attackTarget]}</span>`;
    const lb = this.playerData.map((s, i) => ({ id: i, name: PLAYER_NAMES[i], ...s })).filter(p => p.alive).sort((a, b) => b.cellCount - a.cellCount);

    const cityCost = Math.floor(100 * Math.pow(2, ps.cityCount || 0));
    const dpostCost = Math.min(250, 50 * ((ps.dpostCount || 0) + 1));
    const gold = ps.gold || 0;
    const cityDisabled = gold < cityCost ? ' disabled' : '';
    const dpostDisabled = gold < dpostCost ? ' disabled' : '';
    const citySel = this.placementMode === 'city' ? ' selected' : '';
    const dpostSel = this.placementMode === 'defense_post' ? ' selected' : '';

    const farmSel = this.placementMode === 'farm' ? ' selected' : '';
    const mineSel = this.placementMode === 'mine' ? ' selected' : '';
    const millSel = this.placementMode === 'mill' ? ' selected' : '';
    const factSel = this.placementMode === 'factory' ? ' selected' : '';
    const farmDis = gold < 30 ? ' disabled' : '';
    const mineDis = gold < 50 ? ' disabled' : '';
    const millDis = gold < 60 ? ' disabled' : '';
    const factDis = gold < 80 ? ' disabled' : '';

    panel.innerHTML = `
      <div class="panel-header"><span style="color:${PLAYER_COLORS[0]}">&#9632;</span> You
        <div>Territory: ${ps.cellCount} cells</div>
        <div>Troops: ${formatTroops(ps.troops)} / ${formatTroops(max)}${ps.attackTroops > 0 ? ` <span style="color:#ff6644">(${formatTroops(ps.attackTroops)} atk)</span>` : ''}</div>
        <div style="color:#ffd700">Gold: ${Math.floor(gold)}</div>
        <div>Attack ratio: ${Math.round(this.attackRatio * 100)}%</div>
        <div>Target: ${tgt}</div></div>
      <div class="build-panel" style="flex-wrap:wrap">
        <div class="build-btn${citySel}${cityDisabled}" data-build="city">
          <span class="build-icon">&#9632;</span>
          <span class="build-label">City</span>
          <div class="build-cost">${cityCost}g</div>
        </div>
        <div class="build-btn${dpostSel}${dpostDisabled}" data-build="defense_post">
          <span class="build-icon">&#9670;</span>
          <span class="build-label">Def Post</span>
          <div class="build-cost">${dpostCost}g</div>
        </div>
        <div class="build-btn${farmSel}${farmDis}" data-build="farm">
          <span class="build-icon" style="color:#66aa44">&#9752;</span>
          <span class="build-label">Farm</span>
          <div class="build-cost">30g</div>
        </div>
        <div class="build-btn${mineSel}${mineDis}" data-build="mine">
          <span class="build-icon" style="color:#aa7744">&#9935;</span>
          <span class="build-label">Mine</span>
          <div class="build-cost">50g</div>
        </div>
        <div class="build-btn${millSel}${millDis}" data-build="mill">
          <span class="build-icon" style="color:#88aa55">&#9881;</span>
          <span class="build-label">Mill</span>
          <div class="build-cost">60g</div>
        </div>
        <div class="build-btn${factSel}${factDis}" data-build="factory">
          <span class="build-icon" style="color:#aa8855">&#9874;</span>
          <span class="build-label">Factory</span>
          <div class="build-cost">80g</div>
        </div>
      </div>
      <div class="info-section"><div class="info-hint">Select building, click your territory to place<br>Farms claim plains, mines claim mountains<br>Mills boost farms, factories boost mines<br>Right-click enemy across water: launch boat<br>Right-click / Escape to cancel</div></div>
      <div class="info-section"><div class="info-title">Terrain</div>
        <div class="terrain-row"><span class="ter-swatch" style="background:#6e9e48"></span> Plains</div>
        <div class="terrain-row"><span class="ter-swatch" style="background:#baa66c"></span> Highland</div>
        <div class="terrain-row"><span class="ter-swatch" style="background:#d2cec6"></span> Mountain</div></div>
      <div class="leaderboard"><div class="info-title">Leaderboard</div>
        ${lb.map(p => `<div class="lb-row${p.id===0?' lb-player':''}"><span style="color:${PLAYER_COLORS[p.id]}">&#9632;</span> ${p.name}: ${p.cellCount} <span style="color:#8b949e">(${formatTroops(p.troops)})</span>${p.expanding?(p.attackTarget===-1?'<span style="color:#cccc44;font-size:10px"> [wild]</span>':'<span style="color:#ff6644;font-size:10px"> [atk]</span>'):''}</div>`).join('')}</div>`;

    // Delegated click handler on panel (survives innerHTML rebuilds)
    if (!this._panelClickAttached) {
      this._panelClickAttached = true;
      panel.addEventListener('click', (e) => {
        const btn = e.target.closest('.build-btn');
        if (!btn || btn.classList.contains('disabled')) return;
        e.stopPropagation();
        const mode = btn.dataset.build;
        this.placementMode = this.placementMode === mode ? null : mode;
        this._buildPreview = null;
        this.updateInfoPanel();
      });
    }
  }
}

window.addEventListener('load', () => {
  const container = document.getElementById('game-container');

  // Create map selection overlay
  const overlay = document.createElement('div');
  overlay.id = 'map-select-overlay';
  overlay.innerHTML = `
    <div class="map-select-box">
      <h2>Select Map</h2>
      <div class="map-select-grid">
        ${AVAILABLE_MAPS.map(m => `
          <div class="map-select-card" data-map="${m.id}">
            <div class="map-select-name">${m.name}</div>
            <div class="map-select-desc">${m.desc}</div>
            <div class="map-select-players">${m.playerNames.length} players</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelectorAll('.map-select-card').forEach(card => {
    card.addEventListener('click', () => {
      const mapId = card.dataset.map;
      overlay.remove();
      const renderer = new GameRenderer(document.getElementById('game-canvas'), mapId);
      renderer.render();
    });
  });
});
