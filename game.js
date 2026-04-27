const CONFIG = {
  WIDTH: 1440,
  HEIGHT: 1800,
  CELL_SIZE: 1,
  NUM_BOTS: 20,
  STARTING_RADIUS: 10,
  STARTING_TROOPS: 200,
  EXPANSION_TICK_MS: 35,
  CELLS_PER_TICK: 20,
  BOT_THINK_MS: 2000,
  BOATS_ENABLED: false,
};

let GRID_W = CONFIG.WIDTH;
let GRID_H = CONFIG.HEIGHT;

const PLAYER_COLORS = [
  '#4488ff', '#ff4444', '#44bb44', '#ffaa22', '#cc44cc',
  '#44cccc', '#ff6699', '#bbbb22', '#8855dd', '#cc8844', '#44cc88',
  '#ff8833', '#6644cc', '#cc4488', '#88cc44', '#4466cc',
  '#dd6655', '#55bbaa', '#aa66cc', '#ccaa44', '#6699cc',
];
const AVAILABLE_MAPS = [
  { id: 'usa', name: 'USA', desc: '1440x810', playerNames: ['You', 'Washington', 'California', 'Montana', 'Colorado', 'Texas', 'Minnesota', 'Illinois', 'Georgia', 'New York', 'Mexico', 'Oregon', 'Idaho', 'Arizona', 'Kansas', 'Ohio', 'Virginia', 'Maine', 'Nebraska', 'Nevada', 'Florida'] },
  { id: 'usa', name: 'India (Small)', desc: '480x600', playerNames: ['You', 'Maurya', 'Chola', 'Mughal', 'Maratha', 'Gupta', 'Rajput', 'Vijayanagara', 'Pallava', 'Sikh Empire', 'Pandya'] },
  { id: 'indiahd', name: 'India (HD)', desc: '1440x1800', playerNames: ['You', 'Maurya', 'Chola', 'Mughal', 'Maratha', 'Gupta', 'Rajput', 'Vijayanagara', 'Pallava', 'Sikh Empire', 'Pandya'] },
  { id: 'europe', name: 'Europe', desc: '1520x960', playerNames: ['You', 'Roman Empire', 'Byzantine', 'Frankish', 'Viking', 'Castile', 'Habsburg', 'Prussian', 'Kievan Rus', 'Ottoman', 'Polish'] },
];

let PLAYER_NAMES = AVAILABLE_MAPS[0].playerNames;
let STARTING_POSITIONS = [];

function hexToRgb(hex) { return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }; }
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; return (((h ^ (h >> 13)) * 1274126177) & 0x7fffffff) / 0x7fffffff; }
const toU32 = (r, g, b) => (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
function lerpColor(a, b, t) { return { r: (a.r * (1 - t) + b.r * t) | 0, g: (a.g * (1 - t) + b.g * t) | 0, b: (a.b * (1 - t) + b.b * t) | 0 }; }
function maxTroopsForTiles(t, cityCount) { return Math.floor(Math.pow(t, 0.6) * 12 + 150 + (cityCount || 0) * 500); }
function formatTroops(n) { n = Math.floor(n); if (n >= 10000) return (n / 1000).toFixed(0) + 'K'; if (n >= 1000) return (n / 1000).toFixed(1) + 'K'; return '' + n; }

const BUILD_ITEMS = [
  { key: 'city', label: 'City', icon: '■', hotkey: '1', color: '#ffd700' },
  { key: 'defense_post', label: 'Fort', icon: '◆', hotkey: '2', color: '#ffffff' },
];

class GameRenderer {
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
    this.waterColors = null;
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
    this._tutorialStep = 0;
    this._tutorialSteps = [
      { id: 'welcome', title: 'Welcome to Meta RTS!', text: "Let's learn the basics. Click to continue.", completionType: 'click_anywhere', highlight: null, arrowTarget: null },
      { id: 'camera', title: 'Camera Controls', text: 'Use WASD to pan and scroll to zoom.', completionType: 'camera_controls', highlight: null, arrowTarget: null },
      { id: 'expand', title: 'Expand Your Territory', text: 'Click unclaimed land near your border to expand.', completionType: 'expand_click', highlight: 'border', arrowTarget: null },
      { id: 'attack', title: 'Attack Enemies', text: 'Click enemy territory to attack!', completionType: 'attack_click', highlight: 'enemy_border', arrowTarget: null },
      { id: 'city_select', title: 'Build a City', text: 'Click the City button or press 1.', completionType: 'city_selected', highlight: 'build_btn_city', arrowTarget: null },
      { id: 'city_place', title: 'Place Your City', text: 'Click inside your territory to place it. Cities increase max troops.', completionType: 'city_placed', highlight: null, arrowTarget: null },
      { id: 'dpost_select', title: 'Build a Defense Post', text: 'Click the Def Post button or press 2.', completionType: 'dpost_selected', highlight: 'build_btn_dpost', arrowTarget: null },
      { id: 'dpost_place', title: 'Place Your Defense Post', text: 'Click on your border to place it. They protect your territory.', completionType: 'defense_post_placed', highlight: null, arrowTarget: null },
    ];
    if (CONFIG.BOATS_ENABLED) {
      this._tutorialSteps.push({ id: 'boats', title: 'Send Boats', text: 'Right-click enemy territory across water to send troops by boat. Pan around to find enemy territory across water.', completionType: 'boat_launched', highlight: null, arrowTarget: null });
    }
    this._tutorialSteps.push({ id: 'complete', title: 'Tutorial Complete!', text: "You're ready! Good luck. Click to dismiss.", completionType: 'click_anywhere', highlight: null, arrowTarget: null });
    this._tutorialCompleted = {};

    this.resizeCanvas();
    this.zoom = this.fitZoom || this.minZoom;
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.placementMode = null; this._buildPreview = null; this._contextMenu = null; }
    });
    this.initColors();
    this._icons = {};
    for (const name of ['gold', 'city', 'defense_post', 'troop']) {
      const img = new Image();
      img.src = `icons/${name}.svg`;
      this._icons[name] = img;
    }
    this.startWorker(mapId || 'usa');
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
    const blendAmounts = [1.0, 0.85, 0.65, 0.5];
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

    // Shuffle starting positions for bots (Fisher-Yates)
    const shuffled = [...STARTING_POSITIONS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    STARTING_POSITIONS = shuffled;

    const R = CONFIG.STARTING_RADIUS;
    const startIdx = 1;
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

    this.worker = new Worker('game-worker.js?v=2');
    this.worker.onerror = (e) => console.error('[worker error]', e);
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
        if (!this.spectateMode) {
          this.setupInput();
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
        for (let i = 0; i < msg.changesLen; i += 2) this.applyChange(ch[i], ch[i + 1]);
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
      if (msg.type === 'inspect_result') {
        if (this._inspectAllPending > 0 && msg.result) {
          this._inspectAllChains.push(msg.result);
          this._inspectAllPending--;
        } else {
          this._inspectData = msg.result;
        }
      }
      if (msg.type === 'inspect_all_type_result') this._inspectAllData = msg.result;
    };
    this.worker.postMessage({
      type: 'init', gridW: GRID_W, gridH: GRID_H, numBots: CONFIG.NUM_BOTS,
      cellSize: CONFIG.CELL_SIZE, cellsPerTick: CONFIG.CELLS_PER_TICK,
      expansionTickMs: CONFIG.EXPANSION_TICK_MS, botThinkMs: CONFIG.BOT_THINK_MS,
      startingTroops: CONFIG.STARTING_TROOPS, startingRadius: CONFIG.STARTING_RADIUS,
      startingPositions: STARTING_POSITIONS,
      terrain: Array.from(this.terrain), waterMag: Array.from(this.waterMag), grid: Array.from(this.grid),
      playerName: this.playerName,
      spectateMode: this.spectateMode,
      boatsEnabled: CONFIG.BOATS_ENABLED,
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
    if (key === 'city') return Math.min(500, Math.floor(50 * Math.pow(2, ps.cityCount || 0)));
    if (key === 'defense_post') return Math.min(150, 25 + (ps.dpostCount || 0) * 25);
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
      const hotkeyMap = { '1': 'city', '2': 'defense_post' };
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

      // Scroll leaderboard if cursor is over it
      if (this._leaderboardOpen) {
        const { cx: scx, cy: scy } = this.screenToCanvas(e.clientX, e.clientY);
        if (scx < 240 && scy < 300) {
          this._lbScroll = (this._lbScroll || 0) + (deltaY > 0 ? 1 : -1);
          return;
        }
      }

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
      if (e.button === 2) return;  // Right-click handled by contextmenu listener

      if (this._contextMenu) { this._contextMenuClick = true; e.preventDefault(); return; }

      // Check bottom bar clicks
      const { cx, cy } = this.screenToCanvas(e.clientX, e.clientY);
      const barInfo = this._getBottomBarLayout();

      // Check build buttons (right of bar)
      for (const item of BUILD_ITEMS) {
        const bp = this._uiPositions.buildButtons && this._uiPositions.buildButtons[item.key];
        if (bp && cx >= bp.x && cx <= bp.x + bp.w && cy >= bp.y && cy <= bp.y + bp.h) {
          const cost = this.getBuildCost(item.key);
          const gold = (this.playerData[0] || {}).gold || 0;
          if (gold >= cost) {
            this.placementMode = this.placementMode === item.key ? null : item.key;
            this._buildPreview = null;
          }
          e.preventDefault(); return;
        }
      }

      if (barInfo && cy >= barInfo.y && cy <= barInfo.y + barInfo.h && cx >= barInfo.x && cx <= barInfo.x + barInfo.w) {
        e.preventDefault(); return;
      }

      // Check help button (mostly mobile — desktop uses hover)
      const helpX = this.canvas.width - 30, helpY = 30;
      if ((cx - helpX) ** 2 + (cy - helpY) ** 2 < 225) {
        this._helpOpen = !this._helpOpen; e.preventDefault(); return;
      }

      // Check leaderboard toggle (top-left area)
      if (cx >= 10 && cx < 310 && cy >= 10 && cy < 30) {
        this._leaderboardOpen = !this._leaderboardOpen; e.preventDefault(); return;
      }

      this._mouseIsDown = true;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const { gx, gy } = this.screenToGame(e.clientX, e.clientY);
      this._hoverGx = gx; this._hoverGy = gy;

      const { cx: hcx, cy: hcy } = this.screenToCanvas(e.clientX, e.clientY);
      const hBarInfo = this._getBottomBarLayout();
      const overBar = hBarInfo && hcy >= hBarInfo.y && hcy <= hBarInfo.y + hBarInfo.h && hcx >= hBarInfo.x && hcx <= hBarInfo.x + hBarInfo.w;
      const helpX = this.canvas.width - 30, helpY = 30;
      const overHelp = (hcx - helpX) ** 2 + (hcy - helpY) ** 2 < 225;
      this._hoverHelp = overHelp;
      const overLeaderboard = hcx >= 10 && hcx < 310 && hcy >= 10 && hcy < 30;

      // Detect hovered build button (now outside the bar)
      let overBuildBtn = false;
      let newHoverBuildKey = null;
      const bps = this._uiPositions.buildButtons || {};
      for (const item of BUILD_ITEMS) {
        const bp = bps[item.key];
        if (bp && hcx >= bp.x && hcx <= bp.x + bp.w && hcy >= bp.y && hcy <= bp.y + bp.h) {
          newHoverBuildKey = item.key;
          overBuildBtn = true;
          break;
        }
      }
      this._hoverBuildKey = newHoverBuildKey;

      const gp = this._goldPillRect;
      this._hoverGoldPill = gp && hcx >= gp.x && hcx <= gp.x + gp.w && hcy >= gp.y && hcy <= gp.y + gp.h;

      const tb = this._troopBarRect;
      this._hoverTroopBar = tb && hcx >= tb.x && hcx <= tb.x + tb.w && hcy >= tb.y && hcy <= tb.y + tb.h;

      const terr = this._territoryBarRect;
      this._hoverTerritoryBar = terr && hcx >= terr.x && hcx <= terr.x + terr.w && hcy >= terr.y && hcy <= terr.y + terr.h;

      const ob = this._outboundPillRect;
      this._hoverOutbound = ob && hcx >= ob.x && hcx <= ob.x + ob.w && hcy >= ob.y && hcy <= ob.y + ob.h;

      this._hoverUI = overBuildBtn || overHelp || overLeaderboard;

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
      if (this._contextMenu && this._contextMenuClick) {
        this._contextMenuClick = false;
        const cm = this._contextMenu;
        const { cx, cy } = this.screenToCanvas(e.clientX, e.clientY);
        const cmCanvas = this.screenToCanvas(cm.screenX, cm.screenY);
        const btnX = cmCanvas.cx, btnY = cmCanvas.cy - 40;
        if (cx >= btnX - 18 && cx <= btnX + 18 && cy >= btnY - 14 && cy <= btnY + 14) {
          if (CONFIG.BOATS_ENABLED && this._tutorialActive) {
            // Tutorial filtering for right-click boat
            const step = this._tutorialSteps[this._tutorialStep];
            if (!step || step.id !== 'boats') { this._contextMenu = null; return; }
          }
          this.worker.postMessage({ type: 'rightclick', gx: cm.gx, gy: cm.gy });
        }
        this._contextMenu = null; return;
      }

      if (this._mouseIsDown && !this._didDrag && this.gameOver && this._restartBtn) {
        const { cx, cy } = this.screenToCanvas(e.clientX, e.clientY);
        const rb = this._restartBtn;
        if (cx >= rb.x && cx <= rb.x + rb.w && cy >= rb.y && cy <= rb.y + rb.h) {
          location.reload();
          return;
        }
      }

      if (this._mouseIsDown && !this._didDrag && !this.gameOver) {
        const { gx, gy } = this.screenToGame(e.clientX, e.clientY);
        if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
          // Location selection mode
          if (this._selectingLocation) {
            if (this._cloudIntro) { this._mouseIsDown = false; this._didDrag = false; return; }
            const idx = gy * GRID_W + gx;
            if (this.terrain[idx] > 0 && this.grid[idx] === -1) {
              const R = CONFIG.STARTING_RADIUS;
              for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
                if (dx * dx + dy * dy > R * R) continue;
                const x = gx + dx, y = gy + dy;
                if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
                const ci = y * GRID_W + x;
                if (this.terrain[ci] > 0 && this.grid[ci] < 0) this.grid[ci] = 0;
              }
              this.fullRedraw();
              this.worker.postMessage({ type: 'place_player', gx, gy, radius: R });
              this._selectingLocation = false;
              const targetZoom = Math.max(this.fitZoom * 1.5, 3);
              const toCamX = gx - this.canvas.width / targetZoom / 2;
              const toCamY = gy - this.canvas.height / targetZoom / 2;
              this._placeAnim = {
                start: performance.now(), duration: 1200,
                fromZoom: this.zoom, toZoom: targetZoom,
                fromCamX: this.camX, fromCamY: this.camY,
                toCamX, toCamY,
              };
            }
            this._mouseIsDown = false; this._didDrag = false;
            return;
          }

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
      if (CONFIG.BOATS_ENABLED && gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
        const idx = gy * GRID_W + gx;
        if (this.terrain && this.terrain[idx] > 0 && this.grid && this.grid[idx] !== 0) {
          this._contextMenu = { screenX: e.clientX, screenY: e.clientY, gx, gy }; return;
        }
      }
      this._contextMenu = null;
      this.worker.postMessage({ type: 'rightclick' });
    });

    this.canvas.addEventListener('click', (e) => { e.stopPropagation(); }, true);

    // Touch support
    let touchStartTime = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchStartTime = performance.now();
        this._mouseDownX = t.clientX; this._mouseDownY = t.clientY;
        this._didDrag = false; this._camStartX = this.camX; this._camStartY = this.camY;
        this._mouseIsDown = true;
        this._touchId = t.identifier;
      } else if (e.touches.length === 2) {
        this._mouseIsDown = false; this._didDrag = true;
        const t0 = e.touches[0], t1 = e.touches[1];
        this._pinchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        this._pinchZoom = this.zoom;
        const mx = (t0.clientX + t1.clientX) / 2, my = (t0.clientY + t1.clientY) / 2;
        const { cx, cy } = this.screenToCanvas(mx, my);
        this._pinchGameX = cx / this.zoom + this.camX;
        this._pinchGameY = cy / this.zoom + this.camY;
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const scale = dist / this._pinchDist;
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this._pinchZoom * scale));
        const mx = (t0.clientX + t1.clientX) / 2, my = (t0.clientY + t1.clientY) / 2;
        const { cx, cy } = this.screenToCanvas(mx, my);
        this.camX = this._pinchGameX - cx / this.zoom;
        this.camY = this._pinchGameY - cy / this.zoom;
        this.clampCamera();
        return;
      }
      if (!this._mouseIsDown || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - this._mouseDownX, dy = t.clientY - this._mouseDownY;
      if (!this._didDrag && Math.abs(dx) + Math.abs(dy) > 10) this._didDrag = true;
      if (this._didDrag) {
        const r = this.canvas.getBoundingClientRect();
        this.camX = this._camStartX - dx / r.width * this.canvas.width / this.zoom;
        this.camY = this._camStartY - dy / r.height * this.canvas.height / this.zoom;
        this.clampCamera();
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (e.touches.length > 0) return;
      if (this._mouseIsDown && !this._didDrag) {
        const t = e.changedTouches[0];
        const { cx: tcx, cy: tcy } = this.screenToCanvas(t.clientX, t.clientY);

        // Tap on leaderboard header → toggle
        if (tcx >= 10 && tcx < 310 && tcy >= 10 && tcy < 30) {
          this._leaderboardOpen = !this._leaderboardOpen;
          this._mouseIsDown = false; this._didDrag = false; return;
        }
        // Tap on build button → select placement mode
        const bps = this._uiPositions.buildButtons || {};
        for (const item of BUILD_ITEMS) {
          const bp = bps[item.key];
          if (bp && tcx >= bp.x && tcx <= bp.x + bp.w && tcy >= bp.y && tcy <= bp.y + bp.h) {
            const cost = this.getBuildCost(item.key);
            const gold = (this.playerData[0] || {}).gold || 0;
            if (gold >= cost) {
              this.placementMode = this.placementMode === item.key ? null : item.key;
              this._buildPreview = null;
            }
            this._mouseIsDown = false; this._didDrag = false; return;
          }
        }
        // Tap on help button
        const helpX = this.canvas.width - 30, helpY = 30;
        if ((tcx - helpX) ** 2 + (tcy - helpY) ** 2 < 225) {
          this._helpOpen = !this._helpOpen;
          this._mouseIsDown = false; this._didDrag = false; return;
        }

        // Simulate click via mouseup handler logic
        const { gx, gy } = this.screenToGame(t.clientX, t.clientY);
        if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H && !this.gameOver) {
          if (this._selectingLocation) {
            if (!this._cloudIntro) {
              const idx = gy * GRID_W + gx;
              if (this.terrain[idx] > 0 && this.grid[idx] === -1) {
                const R = CONFIG.STARTING_RADIUS;
                for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
                  if (dx * dx + dy * dy > R * R) continue;
                  const x = gx + dx, y = gy + dy;
                  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
                  const ci = y * GRID_W + x;
                  if (this.terrain[ci] > 0 && this.grid[ci] < 0) this.grid[ci] = 0;
                }
                this.fullRedraw();
                this.worker.postMessage({ type: 'place_player', gx, gy, radius: R });
                this._selectingLocation = false;
                const targetZoom = Math.max(this.fitZoom * 1.5, 3);
                const toCamX = gx - this.canvas.width / targetZoom / 2;
                const toCamY = gy - this.canvas.height / targetZoom / 2;
                this._placeAnim = {
                  start: performance.now(), duration: 1200,
                  fromZoom: this.zoom, toZoom: targetZoom,
                  fromCamX: this.camX, fromCamY: this.camY,
                  toCamX, toCamY,
                };
              }
            }
          } else if (this.placementMode === 'city') {
            this.worker.postMessage({ type: 'place_city', gx, gy }); this.placementMode = null;
          } else if (this.placementMode === 'defense_post') {
            this.worker.postMessage({ type: 'place_defense_post', gx, gy }); this.placementMode = null;
          } else {
            this.worker.postMessage({ type: 'click', gx, gy, ratio: this.attackRatio });
          }
        }
        if (this.gameOver && this._restartBtn) {
          const { cx, cy } = this.screenToCanvas(t.clientX, t.clientY);
          const rb = this._restartBtn;
          if (cx >= rb.x && cx <= rb.x + rb.w && cy >= rb.y && cy <= rb.y + rb.h) {
            location.reload();
          }
        }
      }
      this._mouseIsDown = false; this._didDrag = false;
    }, { passive: false });
  }

  _isMobile() { return this.canvas.width < 700; }

  _getBottomBarLayout() {
    const mobile = this._isMobile();
    if (mobile) {
      // Compact 2-row bar pinned above bottom safe area. Buttons floated to right side.
      const safeBottom = 50; // for browser chrome
      const bw = this.canvas.width - 16, bh = 80;
      return { x: 8, y: this.canvas.height - bh - safeBottom, w: bw, h: bh, mobile: true };
    }
    const bw = Math.min(440, this.canvas.width - 40), bh = 60;
    return { x: (this.canvas.width - bw) / 2, y: this.canvas.height - bh - 10, w: bw, h: bh, mobile: false };
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
        const pd = this.playerData[0];
        if (this._hoverUI) {
          this.canvas.style.cursor = 'pointer';
        } else if (this.placementMode) {
          this.canvas.style.cursor = 'cell';
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

      if (this._cloudIntro) this.renderCloudIntro();
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
    const cityIcon = this._icons.city;
    for (const city of this.cities) {
      const cx2 = city.idx % GRID_W, cy2 = (city.idx / GRID_W) | 0;
      const sz = Math.max(6, 10 / Math.max(1, this.zoom * 0.3));
      // Owner color ring
      ctx.beginPath(); ctx.arc(cx2, cy2, sz * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_COLORS[city.owner] || '#fff'; ctx.fill();
      if (cityIcon && cityIcon.complete) {
        ctx.drawImage(cityIcon, cx2 - sz / 2, cy2 - sz / 2, sz, sz);
      } else {
        ctx.fillStyle = '#ffd700'; ctx.fillRect(cx2 - sz / 2, cy2 - sz / 2, sz, sz);
      }
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
    const dpostIcon = this._icons.defense_post;
    for (const dp of (this.defensePosts || [])) {
      const dx = dp.idx % GRID_W, dy = (dp.idx / GRID_W) | 0;
      const sz = Math.max(5, 9 / Math.max(1, this.zoom * 0.3));
      ctx.beginPath(); ctx.arc(dx, dy, sz * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_COLORS[dp.owner] || '#fff'; ctx.fill();
      if (dpostIcon && dpostIcon.complete) {
        ctx.drawImage(dpostIcon, dx - sz / 2, dy - sz / 2, sz, sz);
      } else {
        ctx.save(); ctx.translate(dx, dy); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#fff'; ctx.fillRect(-sz/2, -sz/2, sz, sz); ctx.restore();
      }
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

    // Boats
    if (CONFIG.BOATS_ENABLED) {
      const tickInterval = this.spectateMode ? 16 : 50;
      const progress = Math.min(1, (now - this._lastTickTime) / tickInterval);
      
      for (const boat of (this.boats || [])) {
        const path = boat.path; if (!path || path.length < 2) continue;
        const pColor = PLAYER_COLORS[boat.owner] || '#fff';
        const ci = Math.min(boat.pathIdx, path.length - 1);

        // Wake trail — solid line behind the boat, dashed line ahead
        if (ci > 0) {
          ctx.strokeStyle = pColor + '55'; ctx.lineWidth = Math.max(1, 2 / this.zoom);
          ctx.beginPath();
          for (let j = 0; j <= ci; j++) { const px = path[j] % GRID_W, py = (path[j] / GRID_W) | 0; j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
          ctx.stroke();
        }
        // Dashed path ahead
        if (ci < path.length - 1) {
          ctx.strokeStyle = pColor + '33'; ctx.lineWidth = Math.max(0.5, 1 / this.zoom);
          ctx.setLineDash([Math.max(1, 3 / this.zoom), Math.max(1, 3 / this.zoom)]);
          ctx.beginPath();
          for (let j = ci; j < path.length; j++) { const px = path[j] % GRID_W, py = (path[j] / GRID_W) | 0; j === ci ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
          ctx.stroke(); ctx.setLineDash([]);
        }

        // Boat sprite with interpolation
        const currIdx = path[ci];
        const nextIdx = path[Math.min(ci + 1, path.length - 1)];
        const cx = currIdx % GRID_W, cy = (currIdx / GRID_W) | 0;
        const nx = nextIdx % GRID_W, ny = (nextIdx / GRID_W) | 0;
        const bx = cx + (nx - cx) * progress;
        const by = cy + (ny - cy) * progress;
        const bs = Math.max(2, 3 / Math.max(1, this.zoom * 0.3));
        let angle = 0;
        if (ci < path.length - 1) { angle = Math.atan2(ny - cy, nx - cx); }
        ctx.save(); ctx.translate(bx, by); ctx.rotate(angle);
        ctx.fillStyle = pColor; ctx.beginPath(); ctx.moveTo(bs, 0); ctx.lineTo(-bs, -bs*0.7); ctx.lineTo(-bs*0.4, 0); ctx.lineTo(-bs, bs*0.7); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.3, 0.5 / this.zoom); ctx.stroke(); ctx.restore();
        if (this.zoom > 1) { ctx.fillStyle = '#fff'; ctx.font = `${Math.max(3, 6 / this.zoom)}px monospace`; ctx.textAlign = 'center'; ctx.fillText(formatTroops(boat.troops), bx, by - bs - 2); }
      }
    }

    // Beachhead indicators
    const bhData = this.playerData[0];
    if (bhData && bhData.beachheads) {
      for (const bh of bhData.beachheads) {
        const bx = bh.landingIdx % GRID_W, by = (bh.landingIdx / GRID_W) | 0;
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 300);
        const r = Math.max(3, 5 / Math.max(1, this.zoom * 0.3)) * pulse;
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.strokeStyle = PLAYER_COLORS[0]; ctx.lineWidth = Math.max(0.5, 1 / this.zoom);
        ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `${Math.max(3, 6 / this.zoom)}px monospace`;
        ctx.textAlign = 'center'; ctx.fillText(formatTroops(bh.troops), bx, by - r - 2);
      }
    }

    // Placement previews (defense post, city)
    if (this.placementMode === 'defense_post' && this._hoverGx !== undefined) {
      const hx = this._hoverGx, hy = this._hoverGy, hIdx = hy * GRID_W + hx;
      const valid = hx >= 0 && hx < GRID_W && hy >= 0 && hy < GRID_H && this.terrain[hIdx] > 0 && this.grid[hIdx] === 0;
      for (const dp of (this.defensePosts || [])) { if (dp.owner !== 0) continue; const ex = dp.idx % GRID_W, ey = (dp.idx / GRID_W) | 0; ctx.beginPath(); ctx.arc(ex, ey, 20, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(0.5, 1 / this.zoom); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(hx, hy, 20, 0, Math.PI * 2); ctx.fillStyle = valid ? 'rgba(255,255,255,0.15)' : 'rgba(255,68,68,0.2)'; ctx.fill(); ctx.strokeStyle = valid ? 'rgba(255,255,255,0.7)' : '#ff4444cc'; ctx.lineWidth = Math.max(1, 2 / this.zoom); ctx.stroke();
      const sz = Math.max(5, 9 / Math.max(1, this.zoom * 0.3));
      ctx.beginPath(); ctx.arc(hx, hy, sz * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = valid ? PLAYER_COLORS[0] : '#ff4444'; ctx.fill();
      const dpIcon = this._icons.defense_post;
      if (dpIcon && dpIcon.complete) ctx.drawImage(dpIcon, hx - sz / 2, hy - sz / 2, sz, sz);
      if (valid) { ctx.globalAlpha = 0.3; for (let dy = -20; dy <= 20; dy++) for (let dx = -20; dx <= 20; dx++) { if (Math.abs(dx)+Math.abs(dy) > 20) continue; const tx = hx+dx, ty = hy+dy; if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) continue; const ti = ty*GRID_W+tx; if (this.borderMap[ti] && this.grid[ti] === 0) { ctx.fillStyle = (tx+ty)%2===0 ? '#4488ff' : '#2244aa'; ctx.fillRect(tx, ty, 1, 1); } } ctx.globalAlpha = 1; }
    }
    if (this.placementMode === 'city' && this._hoverGx !== undefined) {
      const hx = this._hoverGx, hy = this._hoverGy, hIdx = hy * GRID_W + hx;
      const onOwn = hx >= 0 && hx < GRID_W && hy >= 0 && hy < GRID_H && this.terrain[hIdx] > 0 && this.grid[hIdx] === 0;
      let tooClose = false; const conf = [];
      for (const c of this.cities) { const cx2 = c.idx % GRID_W, cy2 = (c.idx / GRID_W) | 0; if (Math.abs(hx-cx2)+Math.abs(hy-cy2) < 15) { tooClose = true; conf.push(c); } }
      const valid = onOwn && !tooClose;
      const sz = Math.max(6, 10 / Math.max(1, this.zoom * 0.3));
      ctx.beginPath(); ctx.arc(hx, hy, sz * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = valid ? PLAYER_COLORS[0] : '#ff4444'; ctx.fill();
      const cIcon = this._icons.city;
      if (cIcon && cIcon.complete) ctx.drawImage(cIcon, hx - sz / 2, hy - sz / 2, sz, sz);
      for (const c of conf) { const cx2 = c.idx % GRID_W, cy2 = (c.idx / GRID_W) | 0; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cx2, cy2); ctx.strokeStyle = '#ff4444aa'; ctx.lineWidth = Math.max(0.5, 1/this.zoom); ctx.stroke(); }
      if (valid) { ctx.fillStyle = '#ffd700'; ctx.font = `${Math.max(4, 8/this.zoom)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('+500 max troops', hx, hy - sz / 2 - 3); }
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

    // Location selection overlay (before HUD)
    if (this._selectingLocation) {
      const cloudsActive = !!this._cloudIntro;
      const cloudT = cloudsActive ? (performance.now() - this._cloudIntro.start) / this._cloudIntro.duration : 1;
      const textFade = cloudsActive ? Math.max(0, (cloudT - 0.6) / 0.4) : 1;

      if (textFade > 0) {
        ctx.globalAlpha = textFade;

        // Dark backdrop box — adapt to viewport
        const isMobile = this._isMobile();
        const boxW = Math.min(560, this.canvas.width - 24);
        const boxH = isMobile ? 130 : 110;
        const boxX = (this.canvas.width - boxW) / 2, boxY = this.canvas.height / 2 - boxH / 2 - 10;
        ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
        ctx.beginPath(); ctx.roundRect(boxX, boxY, boxW, boxH, 12); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(boxX, boxY, boxW, boxH, 12); ctx.stroke();

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const titleSz = isMobile ? 22 : 32;
        const subSz = isMobile ? 14 : 18;
        const hintSz = isMobile ? 12 : 14;
        ctx.font = `bold ${titleSz}px sans-serif`; ctx.fillStyle = '#ffd700';
        const titleText = isMobile ? 'Tap to choose your start' : 'Click anywhere to choose your start';
        ctx.fillText(titleText, this.canvas.width / 2, boxY + (isMobile ? 32 : 30));
        ctx.font = `bold ${subSz}px sans-serif`; ctx.fillStyle = '#e6edf3';
        if (isMobile) {
          ctx.fillText('Conquer 80% of the map to win.', this.canvas.width / 2, boxY + 62);
          ctx.fillText('Good luck!', this.canvas.width / 2, boxY + 84);
        } else {
          ctx.fillText('Conquer 80% of the map to win. Good luck!', this.canvas.width / 2, boxY + 62);
        }
        ctx.font = `${hintSz}px sans-serif`; ctx.fillStyle = '#8b949e';
        ctx.fillText('Pick your starting location wisely', this.canvas.width / 2, boxY + (isMobile ? 110 : 90));
        ctx.globalAlpha = 1;
      }

      if (!cloudsActive && this._hoverGx !== undefined && this._hoverGy !== undefined) {
        const hx = this._hoverGx, hy = this._hoverGy;
        const hIdx = hy * GRID_W + hx;
        if (hx >= 0 && hx < GRID_W && hy >= 0 && hy < GRID_H && this.terrain && this.terrain[hIdx] > 0 && this.grid[hIdx] === -1) {
          ctx.save(); ctx.scale(this.zoom, this.zoom); ctx.translate(-this.camX, -this.camY);
          const R = CONFIG.STARTING_RADIUS;
          ctx.beginPath(); ctx.arc(hx, hy, R, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(68,136,255,0.25)'; ctx.fill();
          ctx.strokeStyle = '#4488ff'; ctx.lineWidth = Math.max(1, 2 / this.zoom); ctx.stroke();
          ctx.restore();
        }
      }
      if (this._tutorialActive) this.renderTutorial();
      return;
    }

    const max = maxTroopsForTiles(ps.cellCount || 0, ps.cityCount || 0);
    const gold = ps.gold || 0;
    const troops = ps.troops || 0;

    // --- Placement text (top center, only when placing) ---
    if (this.placementMode) {
      const labels = { city: 'PLACING CITY', defense_post: 'PLACING FORT' };
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 14px sans-serif';
      ctx.fillText((labels[this.placementMode] || 'PLACING') + ' — click to place, Esc to cancel', this.canvas.width / 2, 12);
    }

    // --- Bottom bar ---
    const bar = this._getBottomBarLayout();
    ctx.fillStyle = 'rgba(31, 41, 55, 0.92)';
    ctx.beginPath(); ctx.roundRect(bar.x, bar.y, bar.w, bar.h, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bar.x, bar.y, bar.w, bar.h, 10); ctx.stroke();

    // Row 0: status + territory progress
    const row0Y = bar.y + 6;
    let st = 'IDLE', sc = '#44cc88';
    if (ps.expanding && ps.attackTarget !== null) {
      if (ps.attackTarget === -1) { st = 'TAKING WILDERNESS'; sc = '#cccc44'; }
      else { st = 'ATTACKING ' + PLAYER_NAMES[ps.attackTarget].toUpperCase(); sc = '#ff6644'; }
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = sc;
    ctx.fillText(st, bar.x + 12, row0Y + 10);
    const stW = ctx.measureText(st).width;

    // Outbound troops pill (desktop only — mobile is too cramped)
    if (!bar.mobile) {
      const outbound = Math.floor(ps.attackTroops || 0) + (ps.beachheads || []).reduce((s, b) => s + Math.floor(b.troops), 0);
      const outStr = `Outbound: ${formatTroops(outbound)}`;
      ctx.font = 'bold 11px sans-serif';
      const outW = ctx.measureText(outStr).width + 14;
      const outX = bar.x + 12 + stW + 12;
      const outH = 18;
      this._outboundPillRect = { x: outX, y: row0Y + 1, w: outW, h: outH };
      ctx.fillStyle = outbound > 0 ? 'rgba(255,102,68,0.15)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.roundRect(outX, row0Y + 1, outW, outH, 4); ctx.fill();
      ctx.strokeStyle = outbound > 0 ? '#ff6644' : 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(outX, row0Y + 1, outW, outH, 4); ctx.stroke();
      ctx.fillStyle = outbound > 0 ? '#ff8866' : '#9ca3af';
      ctx.fillText(outStr, outX + 7, row0Y + 10);
    } else {
      this._outboundPillRect = null;
    }

    if (this.totalLandTiles > 0) {
      const myPct = (ps.cellCount || 0) / this.totalLandTiles;
      const progW = 140, progH = 10, progX = bar.x + bar.w - 12 - progW;
      this._territoryBarRect = { x: progX, y: row0Y + 4, w: progW, h: progH };
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath(); ctx.roundRect(progX, row0Y + 4, progW, progH, 4); ctx.fill();
      const fillW = Math.min(1, myPct) * progW;
      ctx.fillStyle = myPct >= 0.8 ? '#44ff44' : myPct >= 0.5 ? '#ccaa22' : '#4488ff';
      ctx.beginPath(); ctx.roundRect(progX, row0Y + 4, fillW, progH, 4); ctx.fill();
      // 80% marker line
      const markerX = progX + 0.8 * progW;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(markerX, row0Y + 3); ctx.lineTo(markerX, row0Y + 4 + progH + 1); ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#ddd';
      ctx.fillText(`${Math.round(myPct * 100)}%`, progX + progW / 2, row0Y + 9);
    }

    // Row 1: troop bar | gold pill
    const row1Y = bar.y + 30;
    const pillH = 26, pillR = 6;

    // Gold pill
    const goldRateStr = ` +${this._goldRate.toFixed(0)}/m`;
    const goldStr = `${Math.floor(gold)}g${goldRateStr}`;
    ctx.font = 'bold 14px sans-serif';
    const iconSz = pillH - 6;
    const goldW = ctx.measureText(goldStr).width + 22 + iconSz + 2;
    const goldPillX = bar.x + bar.w - 10 - goldW;
    this._goldPillRect = { x: goldPillX, y: row1Y, w: goldW, h: pillH };
    ctx.strokeStyle = this._hoverGoldPill ? '#ffe866' : '#ffd700'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(goldPillX, row1Y, goldW, pillH, pillR); ctx.stroke();
    if (this._hoverGoldPill) { ctx.fillStyle = 'rgba(255,215,0,0.08)'; ctx.fill(); }
    if (this._icons.gold.complete) ctx.drawImage(this._icons.gold, goldPillX + 6, row1Y + 3, iconSz, iconSz);
    ctx.fillStyle = '#ffd700'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(goldStr, goldPillX + iconSz + 6 + (goldW - iconSz - 6) / 2, row1Y + pillH / 2);

    // Troop bar
    const tbX = bar.x + 10, tbW = bar.w - 20 - goldW - 10;
    this._troopBarRect = { x: tbX, y: row1Y, w: tbW, h: pillH };
    ctx.fillStyle = '#1a1a2e'; ctx.beginPath(); ctx.roundRect(tbX, row1Y + 1, tbW, pillH - 2, 5); ctx.fill();
    const f = Math.min(1, troops / Math.max(1, max));
    // Gradient: red (low) -> green (peak ~50%) -> yellow (near cap)
    const grad = ctx.createLinearGradient(tbX, 0, tbX + tbW, 0);
    grad.addColorStop(0, '#cc4444');
    grad.addColorStop(0.5, '#44bb44');
    grad.addColorStop(1, '#ccaa22');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(tbX, row1Y + 1, tbW * f, pillH - 2, 5); ctx.fill();
    if (this._icons.troop.complete) ctx.drawImage(this._icons.troop, tbX + 4, row1Y + 3, iconSz, iconSz);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${formatTroops(troops)} / ${formatTroops(max)}`, tbX + tbW / 2 + iconSz / 2, row1Y + pillH / 2);

    // Build buttons: right side of bar (desktop) or floating right edge above bar (mobile)
    this._uiPositions.buildButtons = {};
    const mobile = bar.mobile;
    const btnW = mobile ? 56 : 54;
    const btnH = mobile ? 56 : bar.h;
    let btnStartX, btnStartY, btnDx, btnDy;
    if (mobile) {
      // Vertical column on right edge, just above the bar
      btnStartX = this.canvas.width - btnW - 8;
      btnStartY = bar.y - (BUILD_ITEMS.length * (btnH + 4)) - 4;
      btnDx = 0; btnDy = btnH + 4;
    } else {
      btnStartX = bar.x + bar.w + 6;
      btnStartY = bar.y;
      btnDx = btnW + 4; btnDy = 0;
    }
    for (let i = 0; i < BUILD_ITEMS.length; i++) {
      const item = BUILD_ITEMS[i];
      const bx = btnStartX + i * btnDx;
      const by = btnStartY + i * btnDy;
      const cost = this.getBuildCost(item.key);
      const canAfford = gold >= cost;
      const selected = this.placementMode === item.key;
      const hovered = this._hoverBuildKey === item.key && !selected;

      ctx.fillStyle = selected ? 'rgba(68,136,255,0.25)' : hovered ? 'rgba(0,0,0,0.45)' : 'rgba(31,41,55,0.92)';
      ctx.beginPath(); ctx.roundRect(bx, by, btnW, btnH, 8); ctx.fill();
      ctx.strokeStyle = selected ? '#4488ff' : hovered ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, by, btnW, btnH, 8); ctx.stroke();

      ctx.globalAlpha = canAfford ? 1 : 0.35;
      const btnIcon = this._icons[item.key];
      const iconYOffset = 4;
      const iconSize = mobile ? 24 : 22;
      if (btnIcon && btnIcon.complete) {
        ctx.drawImage(btnIcon, bx + btnW / 2 - iconSize / 2, by + iconYOffset, iconSize, iconSize);
      } else {
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = item.color; ctx.font = '16px sans-serif';
        ctx.fillText(item.icon, bx + btnW / 2, by + 6);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 10px sans-serif';
      ctx.fillText(`${cost}g`, bx + btnW / 2, by + iconYOffset + iconSize + 4);
      if (!mobile) {
        ctx.fillStyle = '#ddd'; ctx.font = 'bold 9px sans-serif';
        ctx.fillText(item.label, bx + btnW / 2, by + iconYOffset + iconSize + 17);
      }
      ctx.globalAlpha = 1;

      this._uiPositions.buildButtons[item.key] = { x: bx, y: by, w: btnW, h: btnH };
    }

    // --- Build button tooltip ---
    if (this._hoverBuildKey && !this.placementMode) {
      const ttPad = 10;
      const tooltips = {
        city: ['+500 max troop capacity', 'Place inside your territory', 'Hotkey: 1'],
        defense_post: ['4x attack cost for enemies in range', 'Place on your border to defend', 'Hotkey: 2'],
      };
      const lines = tooltips[this._hoverBuildKey] || [];
      if (lines.length) {
        ctx.font = '10px monospace';
        let maxW = 0;
        for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
        const ttW = ttPad * 2 + maxW, ttH = ttPad * 2 + lines.length * 16;
        const bp = this._uiPositions.buildButtons[this._hoverBuildKey];
        const ttX = Math.max(10, Math.min(this.canvas.width - ttW - 10, bp.x + bp.w / 2 - ttW / 2));
        const ttY = bp.y - ttH - 8;
        ctx.fillStyle = 'rgba(31, 41, 55, 0.95)';
        ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#c9d1d9';
        for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], ttX + ttPad, ttY + ttPad + i * 16);
      }
    }

    // --- Gold tooltip ---
    if (this._hoverGoldPill) {
      const ttPad = 10;
      const cellCount = ps.cellCount || 0;
      const landPerMin = (0.008 + cellCount * 0.00004) * 600;
      const lines = [
        { text: `Gold income`, color: '#ffd700', bold: true },
        { text: '', color: '' },
        { text: `Territory: +${landPerMin.toFixed(1)}/min`, color: '#88cc88' },
        { text: '', color: '' },
        { text: `Spend on Cities and Forts.`, color: '#9ca3af' },
      ];
      ctx.font = 'bold 11px sans-serif';
      let maxW = 0;
      for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l.text).width);
      const ttW = ttPad * 2 + maxW, ttH = ttPad * 2 + lines.length * 15;
      const gp = this._goldPillRect;
      let ttX = gp.x + gp.w / 2 - ttW / 2;
      ttX = Math.max(10, Math.min(this.canvas.width - ttW - 10, ttX));
      const ttY = gp.y - ttH - 8;
      ctx.fillStyle = 'rgba(31, 41, 55, 0.95)';
      ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,0,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].text) continue;
        ctx.font = lines[i].bold ? 'bold 11px sans-serif' : '11px sans-serif';
        ctx.fillStyle = lines[i].color;
        ctx.fillText(lines[i].text, ttX + ttPad, ttY + ttPad + i * 15);
      }
    }

    // --- Troop bar tooltip ---
    if (this._hoverTroopBar) {
      const ttPad = 10;
      const cellCount = ps.cellCount || 0;
      const cityCount = ps.cityCount || 0;
      const landCap = Math.floor(Math.pow(cellCount, 0.6) * 12 + 150);
      const cityCap = cityCount * 500;
      const lines = [
        { text: `Land cap: ${formatTroops(landCap)}`, color: '#88cc88' },
        { text: `Cities (×${cityCount}): +${formatTroops(cityCap)}`, color: '#ffd700' },
        { text: '', color: '' },
        { text: `Troops/sec: +${Math.max(0, this._troopRate).toFixed(0)}`, color: '#e6edf3' },
        { text: '', color: '' },
        { text: 'Red: low troops, fast regen', color: '#cc4444' },
        { text: 'Green: optimal troop gain', color: '#44bb44' },
        { text: 'Yellow: near cap, diminishing', color: '#ccaa22' },
      ];
      ctx.font = 'bold 11px sans-serif';
      let maxW = 0;
      for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l.text).width);
      const ttW = ttPad * 2 + maxW, ttH = ttPad * 2 + lines.length * 15;
      const tb = this._troopBarRect;
      let ttX = tb.x + tb.w / 2 - ttW / 2;
      ttX = Math.max(10, Math.min(this.canvas.width - ttW - 10, ttX));
      const ttY = tb.y - ttH - 8;
      ctx.fillStyle = 'rgba(31, 41, 55, 0.95)';
      ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].text) continue;
        ctx.fillStyle = lines[i].color;
        ctx.fillText(lines[i].text, ttX + ttPad, ttY + ttPad + i * 15);
      }
    }

    // --- Outbound tooltip ---
    if (this._hoverOutbound) {
      const ttPad = 10;
      const lines = [];
      for (const a of (ps.attacks || [])) {
        if (a.troops < 1) continue;
        const tName = a.target === -1 ? 'Wilderness' : (PLAYER_NAMES[a.target] || 'Unknown');
        lines.push(`${tName}: ${formatTroops(Math.floor(a.troops))}`);
      }
      for (const bh of (ps.beachheads || [])) {
        const tName = bh.target === -1 ? 'Wilderness' : (PLAYER_NAMES[bh.target] || 'Unknown');
        lines.push(`${tName} (beachhead): ${formatTroops(Math.floor(bh.troops))}`);
      }
      if (lines.length === 0) lines.push('No active attacks');
      ctx.font = 'bold 11px sans-serif';
      let maxW = ctx.measureText('Outbound Troops').width;
      for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
      const ttW = ttPad * 2 + maxW;
      const ttH = ttPad * 2 + 16 + lines.length * 15;
      const ob = this._outboundPillRect;
      // Center horizontally on the pill
      let ttX = ob.x + ob.w / 2 - ttW / 2;
      ttX = Math.max(10, Math.min(this.canvas.width - ttW - 10, ttX));
      const ttY = ob.y - ttH - 6;
      ctx.fillStyle = 'rgba(31,41,55,0.96)';
      ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,102,68,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#ff8866'; ctx.font = 'bold 11px sans-serif';
      ctx.fillText('Outbound Troops', ttX + ttPad, ttY + ttPad);
      ctx.fillStyle = '#c9d1d9'; ctx.font = '11px sans-serif';
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], ttX + ttPad, ttY + ttPad + 16 + i * 15);
    }

    // --- Territory bar tooltip ---
    if (this._hoverTerritoryBar) {
      const ttPad = 10;
      const lines = [
        'Your territory as % of the total map.',
        'Reach 80% to claim victory!',
      ];
      ctx.font = '10px monospace';
      let maxW = 0;
      for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
      const ttW = ttPad * 2 + maxW, ttH = ttPad * 2 + lines.length * 16;
      const terr = this._territoryBarRect;
      const ttX = Math.min(terr.x + terr.w / 2 - ttW / 2, this.canvas.width - ttW - 10);
      const ttY = terr.y - ttH - 8;
      ctx.fillStyle = 'rgba(31, 41, 55, 0.95)';
      ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(68,136,255,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#c9d1d9';
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], ttX + ttPad, ttY + ttPad + i * 16);
    }

    // --- Leaderboard (top-left) ---
    const lb = this.playerData.map((s, i) => ({ id: i, name: i === 0 ? this.playerName : PLAYER_NAMES[i], ...s })).filter(p => p.alive).sort((a, b) => b.cellCount - a.cellCount);
    const lbX = 10, lbY = 10;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    if (!this._lbScroll) this._lbScroll = 0;
    if (this._leaderboardOpen) {
      const lbW = 320, lbRowH = 22, maxVisible = 10;
      const visCount = Math.min(lb.length, maxVisible);
      const headerH = 18;
      const listH = visCount * lbRowH;
      const playerRank = lb.findIndex(p => p.id === 0);
      const colNameX = lbX + 28;
      const colOwnedX = lbX + lbW - 130;
      const colMaxX = lbX + lbW - 16;

      const scrollMax = Math.max(0, lb.length - maxVisible);
      this._lbScroll = Math.max(0, Math.min(scrollMax, this._lbScroll));
      const dataStartY = lbY + 28 + headerH;
      const playerVisible = playerRank >= 0 && playerRank >= this._lbScroll && playerRank < this._lbScroll + visCount;
      const stickyH = (playerRank >= 0 && !playerVisible) ? lbRowH + 4 : 0;
      const lbH = 28 + headerH + listH + 4 + stickyH;

      ctx.fillStyle = 'rgba(31,41,55,0.92)'; ctx.beginPath(); ctx.roundRect(lbX, lbY, lbW, lbH, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(lbX, lbY, lbW, lbH, 8); ctx.stroke();
      ctx.fillStyle = '#e6edf3'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText('Leaderboard  [▲]', lbX + 8, lbY + 8);

      // Column headers
      const headY = lbY + 26;
      ctx.fillStyle = '#9ca3af'; ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left'; ctx.fillText('Player', colNameX, headY);
      ctx.textAlign = 'right';
      ctx.fillText('Owned %', colOwnedX, headY);
      ctx.fillText('Max Troops', colMaxX, headY);
      ctx.textAlign = 'left';

      const drawRow = (p, rankIdx, y, highlight) => {
        if (highlight) {
          ctx.fillStyle = 'rgba(68,136,255,0.18)';
          ctx.beginPath(); ctx.roundRect(lbX + 4, y, lbW - 8, lbRowH - 1, 4); ctx.fill();
          ctx.strokeStyle = '#4488ff'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.roundRect(lbX + 4, y, lbW - 8, lbRowH - 1, 4); ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = highlight ? '#bcd3ff' : '#6b7280'; ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`${rankIdx + 1}.`, lbX + 8, y + 4);
        ctx.fillStyle = PLAYER_COLORS[p.id]; ctx.fillRect(colNameX, y + 5, 10, 10);
        ctx.fillStyle = highlight ? '#ffffff' : (p.id === 0 ? '#ffffff' : '#d0d7de'); ctx.font = `bold 12px sans-serif`;
        ctx.fillText(p.name, colNameX + 16, y + 4);
        const pct = this.totalLandTiles > 0 ? Math.round(p.cellCount / this.totalLandTiles * 100) : 0;
        ctx.fillStyle = highlight ? '#ffffff' : '#c9d1d9'; ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${pct}%`, colOwnedX, y + 5);
        const maxT = maxTroopsForTiles(p.cellCount, p.cityCount || 0);
        ctx.fillStyle = highlight ? '#ffffff' : '#9ca3af';
        ctx.fillText(formatTroops(maxT), colMaxX, y + 5);
        ctx.textAlign = 'left';
      };

      for (let i = 0; i < visCount; i++) {
        const pi = i + this._lbScroll;
        if (pi >= lb.length) break;
        const p = lb[pi], y = dataStartY + i * lbRowH;
        drawRow(p, pi, y, p.id === 0);
      }

      // Sticky player row at bottom if off-screen
      if (stickyH > 0) {
        const stickyY = dataStartY + listH + 4;
        // separator
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(lbX + 8, stickyY - 2); ctx.lineTo(lbX + lbW - 8, stickyY - 2); ctx.stroke();
        drawRow(lb[playerRank], playerRank, stickyY, true);
      }
      // Scrollbar
      if (lb.length > maxVisible) {
        const sbX = lbX + lbW - 8, sbY = dataStartY, sbH = listH;
        const thumbH = Math.max(20, sbH * (maxVisible / lb.length));
        const thumbY = sbY + (sbH - thumbH) * (this._lbScroll / scrollMax);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath(); ctx.roundRect(sbX, sbY, 4, sbH, 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.roundRect(sbX, thumbY, 4, thumbH, 2); ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(31,41,55,0.88)'; ctx.beginPath(); ctx.roundRect(lbX, lbY, 160, 24, 6); ctx.fill();
      ctx.fillStyle = '#9ca3af'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText('Leaderboard [▼]', lbX + 8, lbY + 7);
    }

    // --- Help button (top-right) ---
    const helpX = this.canvas.width - 30, helpY = 30;
    ctx.beginPath(); ctx.arc(helpX, helpY, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(31,41,55,0.88)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#8b949e'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', helpX, helpY);

    if (this._helpOpen || this._hoverHelp) {
      const isMobile = this._isMobile();
      const lines = isMobile ? [
        'Tap land: expand / attack',
        'Drag: pan map',
        'Pinch: zoom',
        'Tap building: select to place',
      ] : [
        'Click: expand/attack', CONFIG.BOATS_ENABLED ? 'Right-click: boat / cancel' : 'Right-click: cancel',
        'WASD: pan camera', 'Scroll: zoom',
        '1-2: select building', 'Tab: toggle leaderboard',
        'Esc: cancel placement',
      ];
      ctx.font = 'bold 11px sans-serif';
      let maxW = 0;
      for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
      const hpW = maxW + 24, hpH = lines.length * 16 + 16;
      const hpX = Math.max(8, this.canvas.width - hpW - 10), hpY = 50;
      ctx.fillStyle = 'rgba(31,41,55,0.95)'; ctx.beginPath(); ctx.roundRect(hpX, hpY, hpW, hpH, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(hpX, hpY, hpW, hpH, 8); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#c9d1d9';
      lines.forEach((l, i) => ctx.fillText(l, hpX + 12, hpY + 10 + i * 16));
    }

    // --- Boat count (top, near status) ---
    if (CONFIG.BOATS_ENABLED) {
      const boatCount = (this.boats || []).filter(b => b.owner === 0).length;
      if (boatCount > 0) {
        ctx.fillStyle = '#4488ff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
        ctx.fillText(`Boats: ${boatCount}/3`, this.canvas.width / 2, this.placementMode ? 58 : 44);
      }
    }

    // --- Context menu (boat popup) ---
    if (CONFIG.BOATS_ENABLED && this._contextMenu) {
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
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

      if (this.winner === 0) {
        ctx.font = 'bold 56px sans-serif'; ctx.fillStyle = '#44ff44';
        ctx.fillText('VICTORY!', this.canvas.width / 2, this.canvas.height / 2 - 50);
        const pct = this.playerData[0] ? Math.round(this.playerData[0].cellCount / Math.max(1, this.totalLandTiles) * 100) : 0;
        ctx.font = '20px sans-serif'; ctx.fillStyle = '#ccc';
        ctx.fillText(`You conquered ${pct}% of the map`, this.canvas.width / 2, this.canvas.height / 2);
      } else {
        ctx.font = 'bold 56px sans-serif'; ctx.fillStyle = '#ff4444';
        ctx.fillText('DEFEATED', this.canvas.width / 2, this.canvas.height / 2 - 50);
        ctx.font = '20px sans-serif'; ctx.fillStyle = '#ccc';
        ctx.fillText('Your territory was conquered', this.canvas.width / 2, this.canvas.height / 2);
      }

      // Play Again button
      const btnW2 = 200, btnH2 = 50;
      const btnX2 = (this.canvas.width - btnW2) / 2, btnY2 = this.canvas.height / 2 + 40;
      this._restartBtn = { x: btnX2, y: btnY2, w: btnW2, h: btnH2 };
      ctx.fillStyle = '#4488ff';
      ctx.beginPath(); ctx.roundRect(btnX2, btnY2, btnW2, btnH2, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
      ctx.fillText('Play Again', this.canvas.width / 2, btnY2 + btnH2 / 2);
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

    // Calculate highlight rect first (before drawing anything)
    let highlightRect = null;
    if (step.highlight) {
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
        highlightRect = { x: bar.x + 10, y: bar.y + 38, w: bar.w - 20, h: 14 };
      } else if (step.highlight === 'build_btn_city') {
        const bp = this._uiPositions.buildButtons && this._uiPositions.buildButtons['city'];
        if (bp) highlightRect = { x: bp.x, y: bp.y, w: bp.w, h: bp.h };
      } else if (step.highlight === 'build_btn_dpost') {
        const bp = this._uiPositions.buildButtons && this._uiPositions.buildButtons['defense_post'];
        if (bp) highlightRect = { x: bp.x, y: bp.y, w: bp.w, h: bp.h };
      }
    }

    // Draw dimming overlay (excluding highlight rect and tutorial box)
    if (highlightRect) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.canvas.width, this.canvas.height);
      ctx.rect(boxX, boxY + boxH, boxW, -(boxH));
      ctx.rect(highlightRect.x, highlightRect.y + highlightRect.h, highlightRect.w, -(highlightRect.h));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fill('evenodd');
      ctx.restore();
    }

    // Draw text box background (always on top, not dimmed)
    ctx.fillStyle = 'rgba(22, 27, 34, 0.95)';
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    // Step counter
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${this._tutorialStep + 1}/${this._tutorialSteps.length}`, boxX + boxW - 12, boxY + 10);

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

    // Draw highlight border and arrow (on top of everything)
    if (highlightRect) {
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
      case 'city_selected':
        if (trigger === 'tick' && this.placementMode === 'city') shouldAdvance = true;
        break;
      case 'dpost_selected':
        if (trigger === 'tick' && this.placementMode === 'defense_post') shouldAdvance = true;
        break;
      case 'city_placed':
      case 'defense_post_placed':
      case 'boat_launched':
        if (trigger === 'tick') {
          if (step.completionType === 'city_placed' && this.cities.filter(c => c.owner === 0).length > (this._tutorialCompleted.cityCount || 0)) {
            shouldAdvance = true;
          }
          if (step.completionType === 'defense_post_placed' && this.defensePosts.filter(d => d.owner === 0).length > (this._tutorialCompleted.dpostCount || 0)) {
            shouldAdvance = true;
          }
          if (CONFIG.BOATS_ENABLED && step.completionType === 'boat_launched' && this.boats.filter(b => b.owner === 0).length > (this._tutorialCompleted.boatCount || 0)) {
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
    if (CONFIG.BOATS_ENABLED) {
      this._tutorialCompleted.boatCount = this.boats.filter(b => b.owner === 0).length;
    }

    // Grant gold for building steps
    const step = this._tutorialSteps[this._tutorialStep];
    if (step && (step.id === 'city_select' || step.id === 'dpost_select')) {
      if (this.worker) this.worker.postMessage({ type: 'grant_gold', amount: 200 });
    }

    // End tutorial on final step completion
    if (this._tutorialStep >= this._tutorialSteps.length) {
      this._tutorialActive = false;
    }
  }

  _initCloudIntro() {
    this._cloudIntro = { start: performance.now(), duration: 3000, puffs: [] };
    const cw = this.canvas.width, ch = this.canvas.height;
    const cx = cw / 2, cy = ch / 2;
    // Grid of clouds covering the entire screen, then drift outward
    const cols = 8, rows = 6;
    const idx = [];
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) idx.push([gx, gy]);
    // Add extra random puffs for density
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

// --- Landing page ---
window.addEventListener('load', () => {
  const canvas = document.getElementById('game-canvas');
  const overlay = document.getElementById('landing-overlay');
  const nameInput = document.getElementById('player-name');
  const playBtn = document.getElementById('play-btn');

  // Start background spectate game
  const bgRenderer = new GameRenderer(canvas, 'usa', null);
  bgRenderer.render();

  function startGame() {
    const name = nameInput.value.trim() || 'Player';
    bgRenderer.destroy();
    overlay.classList.add('hidden');
    const renderer = new GameRenderer(canvas, 'usa', name);
    renderer.render();
  }

  function startTutorialGame() {
    const name = nameInput.value.trim() || 'Player';
    bgRenderer.destroy();
    overlay.classList.add('hidden');
    const renderer = new GameRenderer(canvas, 'usa', name);
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
