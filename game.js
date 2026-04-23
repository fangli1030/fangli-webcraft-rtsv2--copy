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
  { id: 'india_small', name: 'India (Small)', desc: '480x600', playerNames: ['You', 'Maurya', 'Chola', 'Mughal', 'Maratha', 'Gupta', 'Rajput', 'Vijayanagara', 'Pallava', 'Sikh Empire', 'Pandya'] },
  { id: 'indiahd', name: 'India (HD)', desc: '1440x1800', playerNames: ['You', 'Maurya', 'Chola', 'Mughal', 'Maratha', 'Gupta', 'Rajput', 'Vijayanagara', 'Pallava', 'Sikh Empire', 'Pandya'] },
  { id: 'europe', name: 'Europe', desc: '1520x960', playerNames: ['You', 'Roman Empire', 'Byzantine', 'Frankish', 'Viking', 'Castile', 'Habsburg', 'Prussian', 'Kievan Rus', 'Ottoman', 'Polish'] },
];

let PLAYER_NAMES = AVAILABLE_MAPS[0].playerNames;
let STARTING_POSITIONS = [];

function hexToRgb(hex) { return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }; }
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; return (((h ^ (h >> 13)) * 1274126177) & 0x7fffffff) / 0x7fffffff; }
const toU32 = (r, g, b) => (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
function lerpColor(a, b, t) { return { r: (a.r * (1 - t) + b.r * t) | 0, g: (a.g * (1 - t) + b.g * t) | 0, b: (a.b * (1 - t) + b.b * t) | 0 }; }
function maxTroopsForTiles(t, cityCount) { return Math.floor(Math.pow(t, 0.6) * 12 + 150 + (cityCount || 0) * 100); }
function formatTroops(n) { n = Math.floor(n); if (n >= 10000) return (n / 1000).toFixed(0) + 'K'; if (n >= 1000) return (n / 1000).toFixed(1) + 'K'; return '' + n; }

const BUILD_ITEMS = [
  { key: 'city', label: 'City', icon: '■', hotkey: '1', color: '#ffd700' },
  { key: 'defense_post', label: 'Def Post', icon: '◆', hotkey: '2', color: '#ffffff' },
  { key: 'farm', label: 'Farm', icon: '☘', hotkey: '3', color: '#66aa44' },
  { key: 'mine', label: 'Mine', icon: '⛏', hotkey: '4', color: '#aa7744' },
  { key: 'mill', label: 'Mill', icon: '⚙', hotkey: '5', color: '#88aa55' },
  { key: 'factory', label: 'Factory', icon: '⚒', hotkey: '6', color: '#aa8855' },
];

class GameRenderer {
  constructor(canvas, mapId, playerName) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.playerName = playerName || 'You';
    this.spectateMode = !playerName;

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
    this.waterColors = null;
    this.playerData = []; this.cities = []; this.defensePosts = [];
    this.econBuildings = []; this.boats = []; this.animations = [];
    this.gameOver = false; this.winner = null;
    this.ready = false;
    this.attackRatio = 0.2;
    this.placementMode = null;
    this._leaderboardOpen = true;
    this._helpOpen = false;
    this._lastTroops = 0; this._troopRate = 0; this._troopRateTimer = 0;
    this._lastGold = 0; this._goldRate = 0;
    this._contextMenu = null;
    this._tutorialActive = false;
    this._tutorialStep = 0;
    this._tutorialSteps = [
      { id: 'welcome', title: 'Welcome to Meta RTS!', text: "Let's learn the basics. Click to continue.", completionType: 'click_anywhere', highlight: null, arrowTarget: null },
      { id: 'camera', title: 'Camera Controls', text: 'Use WASD to pan and scroll to zoom.', completionType: 'camera_controls', highlight: null, arrowTarget: null },
      { id: 'expand', title: 'Expand Your Territory', text: 'Click unclaimed land near your border to expand.', completionType: 'expand_click', highlight: 'border', arrowTarget: null },
      { id: 'attack', title: 'Attack Enemies', text: 'Click enemy territory to attack!', completionType: 'attack_click', highlight: 'enemy_border', arrowTarget: null },
      { id: 'attack_slider', title: 'Attack Slider', text: 'Drag the slider to control troop allocation.', completionType: 'slider_drag', highlight: 'slider', arrowTarget: null },
      { id: 'city', title: 'Place a City', text: 'Press 1, then click inside your territory. Cities increase max troops.', completionType: 'city_placed', highlight: 'build_btn_city', arrowTarget: null },
      { id: 'defense_post', title: 'Place a Defense Post', text: 'Press 2, then click your border. They protect your borders.', completionType: 'defense_post_placed', highlight: 'build_btn_dpost', arrowTarget: null },
      { id: 'boats', title: 'Send Boats', text: 'Right-click enemy territory across water to send troops by boat. Pan around to find enemy territory across water.', completionType: 'boat_launched', highlight: null, arrowTarget: null },
      { id: 'complete', title: 'Tutorial Complete!', text: "You're ready! Good luck. Click to dismiss.", completionType: 'click_anywhere', highlight: null, arrowTarget: null },
    ];
    this._tutorialCompleted = {};

    this.resizeCanvas();
    this.zoom = this.fitZoom || this.minZoom;
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.placementMode = null; this._buildPreview = null; this._contextMenu = null; }
    });
    this.initColors();
    this.startWorker(mapId || 'india_small');
  }

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
    this.minZoom = fitZoom * 0.3;
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
    // No clamping — allow panning freely beyond map edges
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
    const terrainRgb = [null, {r:110,g:158,b:72}, {r:186,g:166,b:108}, {r:210,g:206,b:198}];
    const blendAmounts = [1.0, 0.7, 0.4, 0.2];
    this.playerGrad = PLAYER_COLORS.map(hex => {
      const c = hexToRgb(hex);
      const tinted = [null, c, lerpColor(c, tan, 0.15), lerpColor(c, white, 0.25)];
      return blendAmounts.map(blend => {
        return [0,
          toU32(...Object.values(lerpColor(terrainRgb[1], tinted[1], blend))),
          toU32(...Object.values(lerpColor(terrainRgb[2], tinted[2], blend))),
          toU32(...Object.values(lerpColor(terrainRgb[3], tinted[3], blend)))
        ];
      });
    });
  }

  async startWorker(mapId) {
    const mapInfo = AVAILABLE_MAPS.find(m => m.id === mapId) || AVAILABLE_MAPS[0];
    PLAYER_NAMES = [...mapInfo.playerNames];
    PLAYER_NAMES[0] = this.playerName;

    const manifest = await fetch(`maps/${mapId}/manifest.json`).then(r => r.json());
    const mapBuf = await fetch(`maps/${mapId}/map.bin`).then(r => r.arrayBuffer());
    const mapTerrain = new Uint8Array(mapBuf);

    CONFIG.WIDTH = manifest.width; CONFIG.HEIGHT = manifest.height;
    GRID_W = CONFIG.WIDTH; GRID_H = CONFIG.HEIGHT;
    STARTING_POSITIONS = manifest.nations.map(n => ({ gx: n.coordinates[0], gy: n.coordinates[1] }));

    this.bufferCanvas.width = CONFIG.WIDTH; this.bufferCanvas.height = CONFIG.HEIGHT;
    this.imageData = this.bufCtx.createImageData(CONFIG.WIDTH, CONFIG.HEIGHT);
    this.data32 = new Uint32Array(this.imageData.data.buffer);
    this.resizeCanvas();

    this.terrain = new Uint8Array(GRID_W * GRID_H);
    this.grid = new Int8Array(GRID_W * GRID_H).fill(-2);
    this.borderMap = new Uint8Array(GRID_W * GRID_H);
    this.defendedMap = new Uint8Array(GRID_W * GRID_H);
    this.distMap = new Uint8Array(GRID_W * GRID_H).fill(255);

    for (let i = 0; i < mapTerrain.length; i++) {
      const b = mapTerrain[i], isLand = (b >> 7) & 1, mag = b & 0x1f;
      if (isLand) {
        this.grid[i] = -1;
        this.terrain[i] = mag < 10 ? 1 : mag < 20 ? 2 : 3;
      }
    }

    const R = CONFIG.STARTING_RADIUS;
    const startIdx = this.spectateMode ? 1 : 0;
    for (let p = startIdx; p < STARTING_POSITIONS.length; p++) {
      const { gx: sx, gy: sy } = STARTING_POSITIONS[p];
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const x = sx + dx, y = sy + dy;
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
        if (this.terrain[y * GRID_W + x] > 0) this.grid[y * GRID_W + x] = p;
      }
    }

    this.initWater();

    this.worker = new Worker('game-worker.js');
    this.worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'init_done') {
        if (msg.fullGrid) {
          const fg = msg.fullGrid;
          let changed = 0;
          for (let i = 0; i < fg.length; i++) {
            if (this.grid[i] !== fg[i]) changed++;
            this.grid[i] = fg[i];
          }
          console.log('[landing] received fullGrid, changed cells:', changed);
        }
        this.fullRedraw();
        if (!this.spectateMode) this.setupInput();
        this.ready = true;
        if (!this.spectateMode) {
          this._introStart = performance.now();
          this._introDuration = 1500;
          this._introFromZoom = this.fitZoom * 0.3;
          this._introToZoom = this.fitZoom;
          this.zoom = this._introFromZoom;
          const w = this.canvas.width, h = this.canvas.height;
          this.camX = (CONFIG.WIDTH - w / this.zoom) / 2;
          this.camY = (CONFIG.HEIGHT - h / this.zoom) / 2;
        }
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
        this.gameOver = msg.gameOver; this.winner = msg.winner;
        for (const dd of (msg.destroyedDposts || [])) {
          this.animations.push({ type: 'dpost_destroy', idx: dd.idx, owner: dd.owner, startTime: performance.now(), duration: 800 });
        }
        if (dpostsChanged) this.refreshDefendedMap();
        if (this._tutorialActive) this._checkTutorialCompletion('tick');

        // Troop rate calculation
        const now = performance.now();
        if (this.playerData[0] && now - this._troopRateTimer > 1000) {
          const currentTroops = this.playerData[0].troops + (this.playerData[0].attackTroops || 0);
          const currentGold = this.playerData[0].gold || 0;
          
          // On first measurement, initialize baselines and calculate initial gold rate from cell count
          if (this._troopRateTimer === 0) {
            this._lastTroops = currentTroops;
            this._lastGold = currentGold;
            // Calculate base gold rate from starting cell count: (0.02 + cellCount * 0.0001) * 60 ticks/min * 10 (dt=100)
            const cellCount = this.playerData[0].cellCount || 0;
            const baseGoldPerSec = 0.02 + cellCount * 0.0001;
            this._goldRate = baseGoldPerSec * 60 * 10; // 60 seconds/min * 10 ticks per second (100ms dt)
            this._troopRateTimer = now;
            return;
          }
          
          // Calculate troop rate
          this._troopRate = currentTroops - this._lastTroops;
          this._lastTroops = currentTroops;
          
          // Only update gold rate if gold increased (income), not if it decreased (spending)
          const goldDelta = currentGold - this._lastGold;
          if (goldDelta >= 0) {
            this._goldRate = goldDelta * 60;
          }
          this._lastGold = currentGold;
          this._troopRateTimer = now;
        }
      }
      if (msg.type === 'preview_result') this._buildPreview = msg.preview;
      if (msg.type === 'inspect_result') this._inspectData = msg.result;
    };
    this.worker.postMessage({
      type: 'init', gridW: GRID_W, gridH: GRID_H, numBots: CONFIG.NUM_BOTS,
      cellSize: CONFIG.CELL_SIZE, cellsPerTick: CONFIG.CELLS_PER_TICK,
      expansionTickMs: CONFIG.EXPANSION_TICK_MS, botThinkMs: CONFIG.BOT_THINK_MS,
      startingTroops: CONFIG.STARTING_TROOPS, startingRadius: CONFIG.STARTING_RADIUS,
      startingPositions: STARTING_POSITIONS,
      terrain: Array.from(this.terrain), grid: Array.from(this.grid),
      playerName: this.playerName,
      spectateMode: this.spectateMode,
    });
  }

  initWater() {
    this.waterC = new Uint32Array(GRID_W * GRID_H);
    const coast = new Uint8Array(GRID_W * GRID_H);
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x; if (this.terrain[i] > 0) continue;
      if ((x > 0 && this.terrain[i-1] > 0) || (x < GRID_W-1 && this.terrain[i+1] > 0) ||
          (y > 0 && this.terrain[i-GRID_W] > 0) || (y < GRID_H-1 && this.terrain[i+GRID_W] > 0)) coast[i] = 1;
    }
    const coast2 = new Uint8Array(coast);
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x; if (this.terrain[i] > 0 || coast[i]) continue;
      if ((x > 0 && coast[i-1]) || (x < GRID_W-1 && coast[i+1]) ||
          (y > 0 && coast[i-GRID_W]) || (y < GRID_H-1 && coast[i+GRID_W])) coast2[i] = 1;
    }
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x; if (this.terrain[i] > 0) continue;
      if (coast[i]) this.waterC[i] = toU32(70, 115, 155);
      else if (coast2[i]) this.waterC[i] = toU32(55, 95, 140);
      else { const v = (hash(x*3,y*3)*6)|0, d = (hash(x,y)*4)|0; this.waterC[i] = toU32(40+v, 75+v+d, 120+v+d); }
    }
  }

  calcBorder(idx) {
    const o = this.grid[idx]; if (o < 0) return false;
    const x = idx % GRID_W, y = (idx / GRID_W) | 0;
    return (x > 0 && this.grid[idx-1] !== o) ||
           (x < GRID_W-1 && this.grid[idx+1] !== o) ||
           (y > 0 && this.grid[idx-GRID_W] !== o) ||
           (y < GRID_H-1 && this.grid[idx+GRID_W] !== o);
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

  calcDistMap() {
    const dm = this.distMap;
    dm.fill(255);
    const queue = [];
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      if (this.borderMap[i]) { dm[i] = 0; queue.push(i); }
    }
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const d = dm[idx] + 1;
      if (d > 3) continue;
      const o = this.grid[idx], x = idx % GRID_W, y = (idx / GRID_W) | 0;
      const nbrs = [];
      if (x > 0) nbrs.push(idx - 1);
      if (x < GRID_W - 1) nbrs.push(idx + 1);
      if (y > 0) nbrs.push(idx - GRID_W);
      if (y < GRID_H - 1) nbrs.push(idx + GRID_W);
      for (const ni of nbrs) {
        if (this.grid[ni] === o && dm[ni] > d) {
          dm[ni] = d;
          queue.push(ni);
        }
      }
    }
  }

  updateDistMapLocal(centerIdx) {
    const R = 6;
    const cx = centerIdx % GRID_W, cy = (centerIdx / GRID_W) | 0;
    const x0 = Math.max(0, cx - R), x1 = Math.min(GRID_W - 1, cx + R);
    const y0 = Math.max(0, cy - R), y1 = Math.min(GRID_H - 1, cy + R);
    const dm = this.distMap;
    const affected = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * GRID_W + x;
      if (this.grid[i] >= 0) { dm[i] = 255; affected.push(i); }
    }
    const queue = [];
    for (const i of affected) {
      if (this.borderMap[i]) { dm[i] = 0; queue.push(i); }
    }
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const d = dm[idx] + 1;
      if (d > 3) continue;
      const o = this.grid[idx], x = idx % GRID_W, y = (idx / GRID_W) | 0;
      const nbrs = [];
      if (x > 0) nbrs.push(idx - 1);
      if (x < GRID_W - 1) nbrs.push(idx + 1);
      if (y > 0) nbrs.push(idx - GRID_W);
      if (y < GRID_H - 1) nbrs.push(idx + GRID_W);
      for (const ni of nbrs) {
        if (this.grid[ni] === o && dm[ni] > d) {
          dm[ni] = d;
          queue.push(ni);
        }
      }
    }
    for (const i of affected) this.paintCell(i);
  }

  paintCell(idx) {
    const o = this.grid[idx], t = this.terrain[idx];
    if (t === 0) this.data32[idx] = this.waterC[idx];
    else if (o === -1) this.data32[idx] = this.terrainC[t];
    else if (this.defendedMap[idx]) {
      const gx = idx % GRID_W, gy = (idx / GRID_W) | 0;
      this.data32[idx] = (gx + gy) % 2 === 0 ? this.playerDefBCLight[o][t] : this.playerDefBCDark[o][t];
    }
    else {
      const d = Math.min(this.distMap[idx], 3);
      this.data32[idx] = this.borderMap[idx] ? this.playerBC[o][t] : this.playerGrad[o][d][t];
    }
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
    }
    this.updateDistMapLocal(idx);
  }

  fullRedraw() {
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      if (this.grid[i] >= 0) this.borderMap[i] = this.calcBorder(i) ? 1 : 0;
      this.defendedMap[i] = (this.borderMap[i] && this.calcDefended(i)) ? 1 : 0;
    }
    this.calcDistMap();
    for (let i = 0; i < GRID_W * GRID_H; i++) this.paintCell(i);
  }

  refreshDefendedMap() {
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      if (!this.borderMap[i]) { this.defendedMap[i] = 0; continue; }
      const was = this.defendedMap[i];
      this.defendedMap[i] = this.calcDefended(i) ? 1 : 0;
      if (this.defendedMap[i] !== was) this.paintCell(i);
    }
  }

  getBuildCost(key) {
    const ps = this.playerData[0] || {};
    if (key === 'city') return Math.floor(100 * Math.pow(2, ps.cityCount || 0));
    if (key === 'defense_post') return Math.min(250, 50 * ((ps.dpostCount || 0) + 1));
    if (key === 'farm') return 30;
    if (key === 'mine') return 50;
    if (key === 'mill') return 60;
    if (key === 'factory') return 80;
    return 999;
  }

  setupInput() {
    const DRAG_THRESHOLD = 5;
    this._keysDown = new Set();

    window.addEventListener('keydown', e => {
      if ('wasd'.includes(e.key)) {
        this._keysDown.add(e.key);
        if (this._tutorialActive) this._checkTutorialCompletion('wasd');
      }
      const hotkeyMap = { '1': 'city', '2': 'defense_post', '3': 'farm', '4': 'mine', '5': 'mill', '6': 'factory' };
      if (hotkeyMap[e.key]) {
        // Tutorial input filtering for building hotkeys
        if (this._tutorialActive) {
          const step = this._tutorialSteps[this._tutorialStep];
          if (step) {
            if (step.id === 'city' && e.key !== '1') return;
            if (step.id === 'defense_post' && e.key !== '2') return;
            if (step.id === 'boats' || step.id === 'welcome' || step.id === 'camera' || step.id === 'complete') return;
          }
        }
        const mode = hotkeyMap[e.key];
        this.placementMode = this.placementMode === mode ? null : mode;
        this._buildPreview = null;
      }
      if (e.key === 'Tab') { e.preventDefault(); this._leaderboardOpen = !this._leaderboardOpen; }
    });
    window.addEventListener('keyup', e => this._keysDown.delete(e.key));

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      let deltaY = e.deltaY;
      if (e.ctrlKey) { if (Math.abs(deltaY) > 10) return; deltaY *= 10; }
      else if (Math.abs(deltaY) < 2) return;
      const { cx, cy } = this.screenToCanvas(e.clientX, e.clientY);
      const gameX = cx / this.zoom + this.camX, gameY = cy / this.zoom + this.camY;
      this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom / (1 + deltaY / 600)));
      this.camX = gameX - cx / this.zoom; this.camY = gameY - cy / this.zoom;
      this.clampCamera();
      if (this._tutorialActive) this._checkTutorialCompletion('scroll');
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      this._mouseDownX = e.clientX; this._mouseDownY = e.clientY;
      this._didDrag = false; this._camStartX = this.camX; this._camStartY = this.camY;

      if (this._contextMenu) { this._contextMenuClick = true; e.preventDefault(); return; }

      // Check bottom bar clicks
      const { cx, cy } = this.screenToCanvas(e.clientX, e.clientY);
      const barInfo = this._getBottomBarLayout();
      if (barInfo && cy >= barInfo.y && cy <= barInfo.y + barInfo.h && cx >= barInfo.x && cx <= barInfo.x + barInfo.w) {
        // Check slider
        const sliderY = barInfo.y + 42, sliderX = barInfo.x + 10, sliderW = barInfo.w - 20;
        if (cy >= sliderY && cy <= sliderY + 14) {
          this.attackRatio = Math.max(0.05, Math.min(1, (cx - sliderX) / sliderW));
          this._draggingSlider = true; e.preventDefault(); return;
        }
        // Check build buttons
        const btnY = barInfo.y + 62, btnH = 40;
        if (cy >= btnY && cy <= btnY + btnH) {
          const btnW = (barInfo.w - 20) / BUILD_ITEMS.length;
          const btnIdx = Math.floor((cx - barInfo.x - 10) / btnW);
          if (btnIdx >= 0 && btnIdx < BUILD_ITEMS.length) {
            const item = BUILD_ITEMS[btnIdx];
            const cost = this.getBuildCost(item.key);
            const gold = (this.playerData[0] || {}).gold || 0;
            if (gold >= cost) {
              this.placementMode = this.placementMode === item.key ? null : item.key;
              this._buildPreview = null;
            }
            e.preventDefault(); return;
          }
        }
        e.preventDefault(); return;
      }

      // Check help button
      const helpX = this.canvas.width - 30, helpY = 30;
      if ((cx - helpX) ** 2 + (cy - helpY) ** 2 < 225) {
        this._helpOpen = !this._helpOpen; e.preventDefault(); return;
      }

      // Check leaderboard toggle
      if (cx < 200 && cy < 24) {
        this._leaderboardOpen = !this._leaderboardOpen; e.preventDefault(); return;
      }

      this._mouseIsDown = true;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this._draggingSlider) {
        const { cx } = this.screenToCanvas(e.clientX, e.clientY);
        const barInfo = this._getBottomBarLayout();
        if (barInfo) this.attackRatio = Math.max(0.05, Math.min(1, (cx - barInfo.x - 10) / (barInfo.w - 20)));
        return;
      }
      const { gx, gy } = this.screenToGame(e.clientX, e.clientY);
      this._hoverGx = gx; this._hoverGy = gy;

      const { cx: hcx, cy: hcy } = this.screenToCanvas(e.clientX, e.clientY);
      const hBarInfo = this._getBottomBarLayout();
      const overBar = hBarInfo && hcy >= hBarInfo.y && hcy <= hBarInfo.y + hBarInfo.h && hcx >= hBarInfo.x && hcx <= hBarInfo.x + hBarInfo.w;
      const helpX = this.canvas.width - 30, helpY = 30;
      const overHelp = (hcx - helpX) ** 2 + (hcy - helpY) ** 2 < 225;
      const overLeaderboard = hcx < 200 && hcy < 24;
      this._hoverUI = overBar || overHelp || overLeaderboard;

      if (this.placementMode && ['farm','mine','mill','factory'].includes(this.placementMode)) {
        if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H)
          this.worker.postMessage({ type: 'preview_econ', gx, gy, buildType: this.placementMode });
      } else if (!this._mouseIsDown) {
        if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
          const allBuildings = [...(this.econBuildings || []), ...(this.cities || []).map(c => ({ ...c, type: 'city' }))];
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
          } else { this._lastInspectIdx = -1; this._inspectData = null; }
        }
      }

      if (!this._mouseIsDown) return;
      const dx = e.clientX - this._mouseDownX, dy = e.clientY - this._mouseDownY;
      if (!this._didDrag && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) this._didDrag = true;
      if (this._didDrag) {
        const r = this.canvas.getBoundingClientRect();
        this.camX = this._camStartX - dx / r.width * this.canvas.width / this.zoom;
        this.camY = this._camStartY - dy / r.height * this.canvas.height / this.zoom;
        this.clampCamera();
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (this._draggingSlider) {
        if (this._tutorialActive) this._checkTutorialCompletion('slider');
        this._draggingSlider = false; return;
      }

      if (this._contextMenu && this._contextMenuClick) {
        this._contextMenuClick = false;
        const cm = this._contextMenu;
        const { cx, cy } = this.screenToCanvas(e.clientX, e.clientY);
        const cmCanvas = this.screenToCanvas(cm.screenX, cm.screenY);
        const btnX = cmCanvas.cx, btnY = cmCanvas.cy - 40;
        if (cx >= btnX - 18 && cx <= btnX + 18 && cy >= btnY - 14 && cy <= btnY + 14) {
          if (this._tutorialActive) {
            // Tutorial filtering for right-click boat
            const step = this._tutorialSteps[this._tutorialStep];
            if (!step || step.id !== 'boats') { this._contextMenu = null; return; }
          }
          this.worker.postMessage({ type: 'rightclick', gx: cm.gx, gy: cm.gy });
        }
        this._contextMenu = null; return;
      }

      if (this._mouseIsDown && !this._didDrag && !this.gameOver) {
        const { gx, gy } = this.screenToGame(e.clientX, e.clientY);
        if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
          // Tutorial click detection (before processing)
          if (this._tutorialActive) this._checkTutorialCompletion('click', { gx, gy });

          // Tutorial input filtering
          if (this._tutorialActive) {
            const step = this._tutorialSteps[this._tutorialStep];
            if (step) {
              // Block all clicks during welcome/camera/complete
              if (step.id === 'welcome' || step.id === 'camera' || step.id === 'complete') {
                this._mouseIsDown = false; this._didDrag = false;
                return;
              }
              // Only allow wilderness clicks during expand step
              if (step.id === 'expand' && this.grid) {
                const idx = gy * GRID_W + gx;
                if (this.grid[idx] !== -1) {
                  this._mouseIsDown = false; this._didDrag = false;
                  return;
                }
              }
            }
          }

          if (this.placementMode === 'city') {
            this.worker.postMessage({ type: 'place_city', gx, gy }); this.placementMode = null;
          } else if (this.placementMode === 'defense_post') {
            this.worker.postMessage({ type: 'place_defense_post', gx, gy }); this.placementMode = null;
          } else if (['farm','mine','mill','factory'].includes(this.placementMode)) {
            this.worker.postMessage({ type: 'place_econ', gx, gy, buildType: this.placementMode });
            this.placementMode = null; this._buildPreview = null;
          } else {
            this.worker.postMessage({ type: 'click', gx, gy, ratio: this.attackRatio });
          }
        }
      }
      this._mouseIsDown = false; this._didDrag = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.placementMode) { this.placementMode = null; this._buildPreview = null; return; }
      const { gx, gy } = this.screenToGame(e.clientX, e.clientY);
      if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
        const idx = gy * GRID_W + gx;
        if (this.terrain && this.terrain[idx] > 0 && this.grid && this.grid[idx] !== 0) {
          this._contextMenu = { screenX: e.clientX, screenY: e.clientY, gx, gy }; return;
        }
      }
      this._contextMenu = null;
      this.worker.postMessage({ type: 'rightclick' });
    });

    this.canvas.addEventListener('click', (e) => { e.stopPropagation(); }, true);
  }

  _getBottomBarLayout() {
    const bw = Math.min(500, this.canvas.width - 40), bh = 108;
    return { x: (this.canvas.width - bw) / 2, y: this.canvas.height - bh - 10, w: bw, h: bh };
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
      } else {
        const pd = this.playerData[0];
        if (this._hoverUI) {
          this.canvas.style.cursor = 'pointer';
        } else if (this.placementMode) {
          this.canvas.style.cursor = 'cell';
        } else if (pd && pd.expanding && pd.attackTarget !== null) {
          this.canvas.style.cursor = 'crosshair';
        } else {
          this.canvas.style.cursor = 'default';
        }
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

      if (!this.spectateMode) this.renderOverlays();
    }
    requestAnimationFrame(() => this.render());
  }

  renderOverlays() {
    if (!this.playerData.length) return;
    const ctx = this.ctx, ps = this.playerData[0] || {};

    // === GAME-WORLD OVERLAYS (zoomed) ===
    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    // Cities
    for (const city of this.cities) {
      const cx2 = city.idx % GRID_W, cy2 = (city.idx / GRID_W) | 0;
      const r = Math.max(2, 3 / Math.max(1, this.zoom * 0.3));
      ctx.fillStyle = '#ffd700'; ctx.fillRect(cx2 - r, cy2 - r, r * 2, r * 2);
      ctx.strokeStyle = PLAYER_COLORS[city.owner] || '#fff';
      ctx.lineWidth = Math.max(0.5, 1 / this.zoom);
      ctx.strokeRect(cx2 - r, cy2 - r, r * 2, r * 2);
    }

    // Defense posts
    let hoveringDpost = false;
    const hgx = this._hoverGx, hgy = this._hoverGy;
    if (hgx !== undefined && hgy !== undefined) {
      for (const dp of (this.defensePosts || [])) {
        const dx = dp.idx % GRID_W, dy = (dp.idx / GRID_W) | 0;
        if (Math.abs(hgx - dx) + Math.abs(hgy - dy) <= Math.max(3, Math.ceil(5 / this.zoom))) { hoveringDpost = true; break; }
      }
    }
    for (const dp of (this.defensePosts || [])) {
      const dx = dp.idx % GRID_W, dy = (dp.idx / GRID_W) | 0;
      const r = Math.max(2, 2.5 / Math.max(1, this.zoom * 0.3));
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = PLAYER_COLORS[dp.owner] || '#fff';
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.3, 0.7 / this.zoom);
      ctx.strokeRect(-r, -r, r * 2, r * 2); ctx.restore();
      if (hoveringDpost && dp.owner === 0) {
        ctx.beginPath(); ctx.arc(dx, dy, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(0.5, 1 / this.zoom); ctx.stroke();
      }
    }

    // Destroy animations
    const now = performance.now();
    for (let i = this.animations.length - 1; i >= 0; i--) {
      const anim = this.animations[i];
      const elapsed = now - anim.startTime;
      if (elapsed >= anim.duration) { this.animations.splice(i, 1); continue; }
      const t = elapsed / anim.duration;
      if (anim.type === 'dpost_destroy') {
        const ax = anim.idx % GRID_W, ay = (anim.idx / GRID_W) | 0;
        const color = PLAYER_COLORS[anim.owner] || '#ff4444';
        for (let p = 0; p < 8; p++) {
          const angle = (p / 8) * Math.PI * 2, dist = t * 12;
          const px = ax + Math.cos(angle) * dist, py = ay + Math.sin(angle) * dist;
          const size = Math.max(0.5, (1 - t) * 3);
          ctx.globalAlpha = 1 - t; ctx.fillStyle = color;
          ctx.fillRect(px - size / 2, py - size / 2, size, size);
        }
        const flash = Math.max(0, 1 - t * 3);
        if (flash > 0) { ctx.globalAlpha = flash * 0.5; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ax, ay, (1 - flash) * 8 + 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }

    // Economy buildings
    for (const eb of (this.econBuildings || [])) {
      const ex = eb.idx % GRID_W, ey = (eb.idx / GRID_W) | 0;
      const r = Math.max(1.5, 2 / Math.max(1, this.zoom * 0.3));
      const econColors = { farm: '#66aa44', mine: '#aa7744', mill: '#88aa55', factory: '#aa8855' };
      ctx.fillStyle = econColors[eb.type] || '#888';
      ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PLAYER_COLORS[eb.owner] || '#fff'; ctx.lineWidth = Math.max(0.3, 0.6 / this.zoom); ctx.stroke();
    }

    // Boats
    for (const boat of (this.boats || [])) {
      const path = boat.path; if (!path || path.length < 2) continue;
      const pColor = PLAYER_COLORS[boat.owner] || '#fff';
      ctx.strokeStyle = pColor + '66'; ctx.lineWidth = Math.max(0.5, 1 / this.zoom);
      ctx.setLineDash([Math.max(1, 3 / this.zoom), Math.max(1, 3 / this.zoom)]);
      ctx.beginPath();
      for (let j = 0; j < path.length; j++) { const px = path[j] % GRID_W, py = (path[j] / GRID_W) | 0; j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke(); ctx.setLineDash([]);
      const ci = Math.min(boat.pathIdx, path.length - 1);
      const bx = path[ci] % GRID_W, by = (path[ci] / GRID_W) | 0;
      const bs = Math.max(2, 3 / Math.max(1, this.zoom * 0.3));
      let angle = 0;
      if (ci < path.length - 1) { const nx = path[ci+1] % GRID_W, ny = (path[ci+1] / GRID_W) | 0; angle = Math.atan2(ny - by, nx - bx); }
      ctx.save(); ctx.translate(bx, by); ctx.rotate(angle);
      ctx.fillStyle = pColor; ctx.beginPath(); ctx.moveTo(bs, 0); ctx.lineTo(-bs, -bs*0.7); ctx.lineTo(-bs*0.4, 0); ctx.lineTo(-bs, bs*0.7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.3, 0.5 / this.zoom); ctx.stroke(); ctx.restore();
      if (this.zoom > 1) { ctx.fillStyle = '#fff'; ctx.font = `${Math.max(3, 6 / this.zoom)}px monospace`; ctx.textAlign = 'center'; ctx.fillText(formatTroops(boat.troops), bx, by - bs - 2); }
    }

    // Placement previews (defense post, city, econ) — keep existing logic
    if (this.placementMode === 'defense_post' && this._hoverGx !== undefined) {
      const hx = this._hoverGx, hy = this._hoverGy, hIdx = hy * GRID_W + hx;
      const valid = hx >= 0 && hx < GRID_W && hy >= 0 && hy < GRID_H && this.terrain[hIdx] > 0 && this.grid[hIdx] === 0;
      for (const dp of (this.defensePosts || [])) { if (dp.owner !== 0) continue; const ex = dp.idx % GRID_W, ey = (dp.idx / GRID_W) | 0; ctx.beginPath(); ctx.arc(ex, ey, 20, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(0.5, 1 / this.zoom); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(hx, hy, 20, 0, Math.PI * 2); ctx.fillStyle = valid ? 'rgba(255,255,255,0.15)' : 'rgba(255,68,68,0.2)'; ctx.fill(); ctx.strokeStyle = valid ? 'rgba(255,255,255,0.7)' : '#ff4444cc'; ctx.lineWidth = Math.max(1, 2 / this.zoom); ctx.stroke();
      const r = Math.max(2, 2.5 / Math.max(1, this.zoom * 0.3)); ctx.save(); ctx.translate(hx, hy); ctx.rotate(Math.PI / 4); ctx.fillStyle = valid ? PLAYER_COLORS[0] : '#ff4444'; ctx.fillRect(-r, -r, r*2, r*2); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.3, 0.7 / this.zoom); ctx.strokeRect(-r, -r, r*2, r*2); ctx.restore();
      if (valid) { ctx.globalAlpha = 0.3; for (let dy = -20; dy <= 20; dy++) for (let dx = -20; dx <= 20; dx++) { if (Math.abs(dx)+Math.abs(dy) > 20) continue; const tx = hx+dx, ty = hy+dy; if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) continue; const ti = ty*GRID_W+tx; if (this.borderMap[ti] && this.grid[ti] === 0) { ctx.fillStyle = (tx+ty)%2===0 ? '#4488ff' : '#2244aa'; ctx.fillRect(tx, ty, 1, 1); } } ctx.globalAlpha = 1; }
    }
    if (this.placementMode === 'city' && this._hoverGx !== undefined) {
      const hx = this._hoverGx, hy = this._hoverGy, hIdx = hy * GRID_W + hx;
      const onOwn = hx >= 0 && hx < GRID_W && hy >= 0 && hy < GRID_H && this.terrain[hIdx] > 0 && this.grid[hIdx] === 0;
      let tooClose = false; const conf = [];
      for (const c of this.cities) { const cx2 = c.idx % GRID_W, cy2 = (c.idx / GRID_W) | 0; if (Math.abs(hx-cx2)+Math.abs(hy-cy2) < 15) { tooClose = true; conf.push(c); } }
      const valid = onOwn && !tooClose;
      const r = Math.max(2, 3 / Math.max(1, this.zoom * 0.3));
      ctx.fillStyle = valid ? '#ffd700' : '#ff4444'; ctx.fillRect(hx-r, hy-r, r*2, r*2);
      ctx.strokeStyle = valid ? PLAYER_COLORS[0] : '#ff4444'; ctx.lineWidth = Math.max(0.5, 1/this.zoom); ctx.strokeRect(hx-r, hy-r, r*2, r*2);
      for (const c of conf) { const cx2 = c.idx % GRID_W, cy2 = (c.idx / GRID_W) | 0; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cx2, cy2); ctx.strokeStyle = '#ff4444aa'; ctx.lineWidth = Math.max(0.5, 1/this.zoom); ctx.stroke(); }
      if (valid) { ctx.fillStyle = '#ffd700'; ctx.font = `${Math.max(4, 8/this.zoom)}px monospace`; ctx.textAlign = 'center'; ctx.fillText('+100 max troops', hx, hy-r-3); }
    }
    if (this._buildPreview && this.placementMode) {
      const pv = this._buildPreview, hx = this._hoverGx, hy = this._hoverGy;
      if (pv.type === 'farm' || pv.type === 'mine') {
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#44ff44'; for (const t of (pv.claimable||[])) ctx.fillRect(t%GRID_W,(t/GRID_W)|0,1,1);
        ctx.fillStyle = '#ff4444'; for (const t of (pv.claimed||[])) ctx.fillRect(t%GRID_W,(t/GRID_W)|0,1,1); ctx.globalAlpha = 1;
        if (hx !== undefined) { ctx.beginPath(); ctx.arc(hx, hy, pv.radius, 0, Math.PI*2); ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = Math.max(0.3, 0.5/this.zoom); ctx.stroke(); }
        ctx.globalAlpha = 0.6; for (const cidx of (pv.connectedProcessors||[])) { const cx2 = cidx%GRID_W, cy2 = (cidx/GRID_W)|0; ctx.fillStyle = '#44ffff'; ctx.beginPath(); ctx.arc(cx2, cy2, 3, 0, Math.PI*2); ctx.fill(); if (hx !== undefined) { ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(cx2,cy2); ctx.strokeStyle = '#44ffffaa'; ctx.lineWidth = Math.max(0.5, 1/this.zoom); ctx.stroke(); } } ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 0.6; for (const cidx of (pv.connected||[])) { const cx2 = cidx%GRID_W, cy2 = (cidx/GRID_W)|0; ctx.fillStyle = '#44ffff'; ctx.beginPath(); ctx.arc(cx2, cy2, 3, 0, Math.PI*2); ctx.fill(); if (hx !== undefined) { ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(cx2,cy2); ctx.strokeStyle = '#44ffffaa'; ctx.lineWidth = Math.max(0.5, 1/this.zoom); ctx.stroke(); } } ctx.globalAlpha = 1;
        if (hx !== undefined) { ctx.beginPath(); ctx.arc(hx,hy,pv.radius,0,Math.PI*2); ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = Math.max(0.3, 0.5/this.zoom); ctx.stroke(); }
        if (pv.stackCount > 0 && hx !== undefined) { ctx.fillStyle = '#ff4444'; ctx.font = `${Math.max(4,8/this.zoom)}px monospace`; ctx.textAlign = 'center'; ctx.fillText(`-${Math.round(pv.stackCount*40)}% penalty`, hx, hy-pv.radius-3); }
      }
    }

    // Inspect overlay
    if (this._inspectData && !this.placementMode) {
      const chain = this._inspectData;
      const tileColor = (chain.type === 'farm' || chain.type === 'mill') ? '#44ff44' : '#cc8844';
      ctx.globalAlpha = 0.3; ctx.fillStyle = tileColor; for (const t of (chain.allClaimedTiles||[])) ctx.fillRect(t%GRID_W,(t/GRID_W)|0,1,1); ctx.globalAlpha = 1;
      for (const prod of (chain.producers||[])) { const px = prod.idx%GRID_W, py = (prod.idx/GRID_W)|0; ctx.beginPath(); ctx.arc(px,py,Math.max(2,3/this.zoom),0,Math.PI*2); ctx.fillStyle = tileColor+'aa'; ctx.fill(); ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = Math.max(0.3,0.6/this.zoom); ctx.stroke(); }
      for (const proc of (chain.processors||[])) { const mx = proc.idx%GRID_W, my = (proc.idx/GRID_W)|0; ctx.beginPath(); ctx.arc(mx,my,Math.max(2,3/this.zoom),0,Math.PI*2); ctx.fillStyle = '#44ffffaa'; ctx.fill(); ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = Math.max(0.3,0.6/this.zoom); ctx.stroke(); ctx.beginPath(); ctx.arc(mx,my,proc.radius,0,Math.PI*2); ctx.strokeStyle = '#ffffff44'; ctx.lineWidth = Math.max(0.3,0.5/this.zoom); ctx.stroke(); ctx.globalAlpha = 0.5; for (const prod of (chain.producers||[])) { const px = prod.idx%GRID_W, py = (prod.idx/GRID_W)|0; ctx.beginPath(); ctx.moveTo(mx,my); ctx.lineTo(px,py); ctx.strokeStyle = '#44ffffaa'; ctx.lineWidth = Math.max(0.5,1/this.zoom); ctx.stroke(); } ctx.globalAlpha = 1; }
      const hbx = chain.idx%GRID_W, hby = (chain.idx/GRID_W)|0; ctx.beginPath(); ctx.arc(hbx,hby,chain.radius,0,Math.PI*2); ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = Math.max(0.5,1/this.zoom); ctx.stroke();
    }

    // Player labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < this.playerData.length; i++) {
      const p = this.playerData[i]; if (!p.alive || p.cn === 0) continue;
      const name = i === 0 ? this.playerName : PLAYER_NAMES[i];
      const sz = Math.max(8, Math.min(18, Math.sqrt(p.cn) * 0.06)) / Math.max(1, this.zoom * 0.5);
      ctx.font = `bold ${sz}px sans-serif`;
      ctx.fillStyle = '#ffffff'; ctx.fillText(name, p.cx, p.cy - sz * 0.35);
      ctx.font = `${(sz * 0.85)|0}px monospace`;
      ctx.fillStyle = '#ffffffcc'; ctx.fillText(formatTroops(p.troops), p.cx, p.cy + sz * 0.5);
    }
    ctx.restore();

    // === SCREEN-SPACE HUD ===
    const max = maxTroopsForTiles(ps.cellCount || 0, ps.cityCount || 0);
    const gold = ps.gold || 0;
    const troops = ps.troops || 0;

    // --- Status text (top center) ---
    let st = 'IDLE', sc = '#44cc88';
    if (ps.expanding && ps.attackTarget !== null) {
      if (ps.attackTarget === -1) { st = 'TAKING WILDERNESS'; sc = '#cccc44'; }
      else { st = 'ATTACKING ' + PLAYER_NAMES[ps.attackTarget].toUpperCase(); sc = '#ff6644'; }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = 'bold 13px monospace'; ctx.fillStyle = sc;
    ctx.fillText(st, this.canvas.width / 2, 12);
    if (this.placementMode) {
      const labels = { city: 'PLACING CITY', defense_post: 'PLACING DEFENSE POST', farm: 'PLACING FARM', mine: 'PLACING MINE', mill: 'PLACING MILL', factory: 'PLACING FACTORY' };
      ctx.fillStyle = '#ffd700'; ctx.font = '11px monospace';
      ctx.fillText((labels[this.placementMode] || 'PLACING') + ' — click to place, Esc to cancel', this.canvas.width / 2, 28);
    }

    // --- Bottom bar ---
    const bar = this._getBottomBarLayout();
    ctx.fillStyle = 'rgba(31, 41, 55, 0.92)';
    ctx.beginPath(); ctx.roundRect(bar.x, bar.y, bar.w, bar.h, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bar.x, bar.y, bar.w, bar.h, 10); ctx.stroke();

    // Row 1: troop rate pill | troop bar | gold pill
    const row1Y = bar.y + 8;
    const pillH = 22, pillR = 6;

    // Troop rate pill (left)
    const rateStr = `+${Math.max(0, this._troopRate).toFixed(0)}/s`;
    ctx.font = 'bold 11px monospace';
    const rateW = ctx.measureText(rateStr).width + 16;
    const rateColor = this._troopRate > 0 ? '#44bb44' : '#888';
    ctx.strokeStyle = rateColor; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(bar.x + 10, row1Y, rateW, pillH, pillR); ctx.stroke();
    ctx.fillStyle = rateColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(rateStr, bar.x + 10 + rateW / 2, row1Y + pillH / 2);

    // Gold pill (right)
    const goldRateStr = ` +${this._goldRate.toFixed(0)}/m`;
    const goldStr = `${Math.floor(gold)}g${goldRateStr}`;
    const goldW = ctx.measureText(goldStr).width + 20;
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(bar.x + bar.w - 10 - goldW, row1Y, goldW, pillH, pillR); ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.fillText(goldStr, bar.x + bar.w - 10 - goldW / 2, row1Y + pillH / 2);

    // Troop bar (center)
    const tbX = bar.x + 10 + rateW + 10, tbW = bar.w - 20 - rateW - goldW - 20;
    ctx.fillStyle = '#1a1a2e'; ctx.beginPath(); ctx.roundRect(tbX, row1Y + 2, tbW, pillH - 4, 4); ctx.fill();
    const f = Math.min(1, troops / Math.max(1, max));
    ctx.fillStyle = f < 0.2 ? '#cc4444' : f < 0.45 ? '#4488ff' : '#ccaa22';
    ctx.beginPath(); ctx.roundRect(tbX, row1Y + 2, tbW * f, pillH - 4, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '10px monospace';
    ctx.fillText(`${formatTroops(troops)} / ${formatTroops(max)}`, tbX + tbW / 2, row1Y + pillH / 2);

    // Row 2: attack slider
    const row2Y = bar.y + 38;
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath(); ctx.roundRect(bar.x + 10, row2Y, bar.w - 20, 14, 4); ctx.fill();
    ctx.fillStyle = '#335588';
    ctx.beginPath(); ctx.roundRect(bar.x + 10, row2Y, (bar.w - 20) * this.attackRatio, 14, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`⚔ Attack: ${Math.round(this.attackRatio * 100)}%`, bar.x + bar.w / 2, row2Y + 7);

    // Row 3: build buttons
    const row3Y = bar.y + 58;
    const btnW = (bar.w - 20) / BUILD_ITEMS.length, btnH = 42;
    for (let i = 0; i < BUILD_ITEMS.length; i++) {
      const item = BUILD_ITEMS[i];
      const bx = bar.x + 10 + i * btnW;
      const cost = this.getBuildCost(item.key);
      const canAfford = gold >= cost;
      const selected = this.placementMode === item.key;

      ctx.fillStyle = selected ? 'rgba(68,136,255,0.25)' : 'rgba(26,26,46,0.8)';
      ctx.beginPath(); ctx.roundRect(bx + 2, row3Y, btnW - 4, btnH, 5); ctx.fill();
      ctx.strokeStyle = selected ? '#4488ff' : 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx + 2, row3Y, btnW - 4, btnH, 5); ctx.stroke();

      ctx.globalAlpha = canAfford ? 1 : 0.35;
      ctx.fillStyle = item.color; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(item.icon, bx + btnW / 2, row3Y + 14);
      ctx.fillStyle = '#ccc'; ctx.font = '8px monospace';
      ctx.fillText(item.label, bx + btnW / 2, row3Y + 26);
      ctx.fillStyle = '#ffd700'; ctx.font = '8px monospace';
      ctx.fillText(`${cost}g [${item.hotkey}]`, bx + btnW / 2, row3Y + 36);
      ctx.globalAlpha = 1;
    }

    // --- Leaderboard (top-left) ---
    const lb = this.playerData.map((s, i) => ({ id: i, name: i === 0 ? this.playerName : PLAYER_NAMES[i], ...s })).filter(p => p.alive).sort((a, b) => b.cellCount - a.cellCount);
    const lbX = 10, lbY = 10;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    if (this._leaderboardOpen) {
      const lbW = 200, lbRowH = 18, lbH = 24 + Math.min(lb.length, 8) * lbRowH;
      ctx.fillStyle = 'rgba(31,41,55,0.88)'; ctx.beginPath(); ctx.roundRect(lbX, lbY, lbW, lbH, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(lbX, lbY, lbW, lbH, 8); ctx.stroke();
      ctx.fillStyle = '#e6edf3'; ctx.font = 'bold 11px monospace';
      ctx.fillText('Leaderboard  [▲]', lbX + 8, lbY + 6);
      for (let i = 0; i < Math.min(lb.length, 8); i++) {
        const p = lb[i], y = lbY + 24 + i * lbRowH;
        ctx.fillStyle = PLAYER_COLORS[p.id]; ctx.fillRect(lbX + 8, y + 3, 8, 8);
        ctx.fillStyle = p.id === 0 ? '#e6edf3' : '#8b949e'; ctx.font = `${p.id === 0 ? 'bold ' : ''}10px monospace`;
        ctx.fillText(`${p.name}: ${p.cellCount}`, lbX + 20, y + 2);
        ctx.fillStyle = '#8b949e'; ctx.font = '9px monospace';
        const tStr = formatTroops(p.troops);
        ctx.fillText(tStr, lbX + lbW - 10 - ctx.measureText(tStr).width, y + 2);
      }
    } else {
      ctx.fillStyle = 'rgba(31,41,55,0.88)'; ctx.beginPath(); ctx.roundRect(lbX, lbY, 140, 22, 6); ctx.fill();
      ctx.fillStyle = '#8b949e'; ctx.font = '10px monospace';
      ctx.fillText('Leaderboard [▼]', lbX + 8, lbY + 6);
    }

    // --- Help button (top-right) ---
    const helpX = this.canvas.width - 30, helpY = 30;
    ctx.beginPath(); ctx.arc(helpX, helpY, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(31,41,55,0.88)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#8b949e'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', helpX, helpY);

    if (this._helpOpen) {
      const hpX = this.canvas.width - 220, hpY = 50, hpW = 200, hpH = 120;
      ctx.fillStyle = 'rgba(31,41,55,0.95)'; ctx.beginPath(); ctx.roundRect(hpX, hpY, hpW, hpH, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(hpX, hpY, hpW, hpH, 8); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '10px monospace'; ctx.fillStyle = '#c9d1d9';
      const lines = [
        'Click: expand/attack', 'Right-click: boat / cancel',
        'WASD: pan camera', 'Scroll: zoom',
        '1-6: select building', 'Tab: toggle leaderboard',
        'Esc: cancel placement',
        '■ Plains  ■ Highland  ■ Mountain'
      ];
      lines.forEach((l, i) => ctx.fillText(l, hpX + 10, hpY + 10 + i * 13));
    }

    // --- Boat count (top, near status) ---
    const boatCount = (this.boats || []).filter(b => b.owner === 0).length;
    if (boatCount > 0) {
      ctx.fillStyle = '#4488ff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`Boats: ${boatCount}/3`, this.canvas.width / 2, this.placementMode ? 44 : 28);
    }

    // --- Context menu (boat popup) ---
    if (this._contextMenu) {
      const cm = this._contextMenu;
      const cmCanvas = this.screenToCanvas(cm.screenX, cm.screenY);
      const btnX = cmCanvas.cx, btnY = cmCanvas.cy - 40;
      ctx.fillStyle = 'rgba(22,27,34,0.92)'; ctx.strokeStyle = '#4488ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(btnX - 18, btnY - 14, 36, 28, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4488ff'; ctx.beginPath(); ctx.moveTo(btnX+8,btnY); ctx.lineTo(btnX-6,btnY-6); ctx.lineTo(btnX-3,btnY); ctx.lineTo(btnX-6,btnY+6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#4488ff88'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(btnX-8,btnY+10); ctx.quadraticCurveTo(btnX-4,btnY+7,btnX,btnY+10); ctx.quadraticCurveTo(btnX+4,btnY+13,btnX+8,btnY+10); ctx.stroke();
      ctx.strokeStyle = '#4488ff44'; ctx.lineWidth = 1; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(btnX,btnY+14); ctx.lineTo(cmCanvas.cx,cmCanvas.cy); ctx.stroke(); ctx.setLineDash([]);
    }

    // --- Game over ---
    if (this.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 48px sans-serif';
      ctx.fillStyle = this.winner === 0 ? '#44ff44' : '#ff4444';
      ctx.fillText(this.winner === 0 ? 'VICTORY!' : 'DEFEATED', this.canvas.width / 2, this.canvas.height / 2 - 20);
      ctx.font = '18px sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText('Refresh to play again', this.canvas.width / 2, this.canvas.height / 2 + 30);
    }

    if (this._tutorialActive) this.renderTutorial();
  }

  _initTutorial() {
    this._tutorialStep = 0;
    this._tutorialCompleted = {};
  }

  renderTutorial() {
    if (this.gameOver) {
      this._tutorialActive = false;
      return;
    }

    const ctx = this.ctx;
    const step = this._tutorialSteps[this._tutorialStep];
    if (!step) return;

    // Text box dimensions and position
    const boxW = 420, boxH = 100;
    const boxX = (this.canvas.width - boxW) / 2;
    const boxY = 60;

    // Draw text box background
    ctx.fillStyle = 'rgba(22, 27, 34, 0.95)';
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    // Step counter
    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${this._tutorialStep + 1}/${this._tutorialSteps.length}`, boxX + boxW - 12, boxY + 8);

    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(step.title, boxX + 12, boxY + 12);

    // Body text with wrapping
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    const maxWidth = boxW - 24;
    const words = step.text.split(' ');
    let line = '';
    let y = boxY + 38;
    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line !== '') {
        ctx.fillText(line, boxX + 12, y);
        line = word + ' ';
        y += 18;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, boxX + 12, y);

    // Highlight region if specified
    if (step.highlight) {
      let highlightRect = null;

      if (step.highlight === 'border' || step.highlight === 'enemy_border') {
        // Compute from player centroids
        const pd = this.playerData[0];
        if (pd && pd.centroid) {
          const screenX = (pd.centroid.x - this.camX) * this.zoom;
          const screenY = (pd.centroid.y - this.camY) * this.zoom;
          const size = Math.max(100, 200 / this.zoom);
          highlightRect = { x: screenX - size/2, y: screenY - size/2, w: size, h: size };
        }
      } else if (step.highlight === 'slider') {
        const bar = this._getBottomBarLayout();
        highlightRect = { x: bar.x + bar.w * 0.05, y: bar.y + bar.h * 0.55, w: bar.w * 0.9, h: 20 };
      } else if (step.highlight === 'build_btn_city') {
        const bar = this._getBottomBarLayout();
        const btnW = (bar.w - 20) / 4;
        highlightRect = { x: bar.x + 10, y: bar.y + bar.h * 0.7, w: btnW, h: 40 };
      } else if (step.highlight === 'build_btn_dpost') {
        const bar = this._getBottomBarLayout();
        const btnW = (bar.w - 20) / 4;
        highlightRect = { x: bar.x + 10 + btnW + 5, y: bar.y + bar.h * 0.7, w: btnW, h: 40 };
      }

      if (highlightRect) {
        // Dim everything except highlight region (draw 4 dark rects)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        // Top
        ctx.fillRect(0, 0, this.canvas.width, highlightRect.y);
        // Bottom
        ctx.fillRect(0, highlightRect.y + highlightRect.h, this.canvas.width, this.canvas.height - (highlightRect.y + highlightRect.h));
        // Left
        ctx.fillRect(0, highlightRect.y, highlightRect.x, highlightRect.h);
        // Right
        ctx.fillRect(highlightRect.x + highlightRect.w, highlightRect.y, this.canvas.width - (highlightRect.x + highlightRect.w), highlightRect.h);

        // Pulsing gold border
        const pulse = Math.sin(performance.now() / 500) * 0.3 + 0.7;
        ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.rect(highlightRect.x, highlightRect.y, highlightRect.w, highlightRect.h);
        ctx.stroke();

        // Arrow from text box to highlight
        this._drawArrow(ctx, boxX + boxW / 2, boxY + boxH, highlightRect.x + highlightRect.w / 2, highlightRect.y);
      }
    }
  }

  _drawArrow(ctx, fromX, fromY, toX, toY) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const headLen = 12;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  _checkTutorialCompletion(trigger, data) {
    if (!this._tutorialActive) return;
    const step = this._tutorialSteps[this._tutorialStep];
    if (!step) return;

    let shouldAdvance = false;

    switch (step.completionType) {
      case 'click_anywhere':
        if (trigger === 'click') shouldAdvance = true;
        break;
      case 'camera_controls':
        if (trigger === 'wasd') this._tutorialCompleted.wasd = true;
        if (trigger === 'scroll') this._tutorialCompleted.scroll = true;
        if (this._tutorialCompleted.wasd && this._tutorialCompleted.scroll) shouldAdvance = true;
        break;
      case 'expand_click':
        if (trigger === 'click' && data && this.grid) {
          const idx = data.gy * GRID_W + data.gx;
          if (this.grid[idx] === -1) shouldAdvance = true;
        }
        break;
      case 'attack_click':
        if (trigger === 'click' && data && this.grid) {
          const idx = data.gy * GRID_W + data.gx;
          if (this.grid[idx] >= 1) shouldAdvance = true;
        }
        break;
      case 'slider_drag':
        if (trigger === 'slider') shouldAdvance = true;
        break;
      case 'city_placed':
      case 'defense_post_placed':
      case 'boat_launched':
        // These are checked in the tick handler
        if (trigger === 'tick') {
          if (step.completionType === 'city_placed' && this.cities.filter(c => c.owner === 0).length > (this._tutorialCompleted.cityCount || 0)) {
            shouldAdvance = true;
          }
          if (step.completionType === 'defense_post_placed' && this.defensePosts.filter(d => d.owner === 0).length > (this._tutorialCompleted.dpostCount || 0)) {
            shouldAdvance = true;
          }
          if (step.completionType === 'boat_launched' && this.boats.filter(b => b.owner === 0).length > (this._tutorialCompleted.boatCount || 0)) {
            shouldAdvance = true;
          }
        }
        break;
    }

    if (shouldAdvance) this._advanceTutorial();
  }

  _advanceTutorial() {
    this._tutorialStep++;
    this._tutorialCompleted = {};

    // Save baseline counts for tick-based detection
    this._tutorialCompleted.cityCount = this.cities.filter(c => c.owner === 0).length;
    this._tutorialCompleted.dpostCount = this.defensePosts.filter(d => d.owner === 0).length;
    this._tutorialCompleted.boatCount = this.boats.filter(b => b.owner === 0).length;

    // Grant gold for building steps
    const step = this._tutorialSteps[this._tutorialStep];
    if (step && (step.id === 'city' || step.id === 'defense_post')) {
      if (this.worker) this.worker.postMessage({ type: 'grant_gold', amount: 200 });
    }

    // End tutorial on final step completion
    if (this._tutorialStep >= this._tutorialSteps.length) {
      this._tutorialActive = false;
    }
  }
}

// --- Landing page ---
window.addEventListener('load', () => {
  const canvas = document.getElementById('game-canvas');
  const overlay = document.getElementById('landing-overlay');
  const nameInput = document.getElementById('player-name');
  const playBtn = document.getElementById('play-btn');

  // Start background spectate game
  const bgRenderer = new GameRenderer(canvas, 'india_small', null);
  bgRenderer.render();

  function startGame() {
    const name = nameInput.value.trim() || 'Player';
    bgRenderer.destroy();
    overlay.classList.add('hidden');
    const renderer = new GameRenderer(canvas, 'india_small', name);
    renderer.render();
  }

  function startTutorialGame() {
    const name = nameInput.value.trim() || 'Player';
    bgRenderer.destroy();
    overlay.classList.add('hidden');
    const renderer = new GameRenderer(canvas, 'india_small', name);
    renderer._tutorialActive = true;
    renderer._initTutorial();
    renderer.render();
  }

  playBtn.addEventListener('click', startGame);
  const tutorialBtn = document.getElementById('tutorial-btn');
  tutorialBtn.addEventListener('click', startTutorialGame);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startGame(); });
  nameInput.focus();
});
