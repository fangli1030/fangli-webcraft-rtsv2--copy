const CONFIG = {
  WIDTH: 726,
  HEIGHT: 418,
  CELL_SIZE: 1,
  NUM_BOTS: 10,
  STARTING_RADIUS: 10,
  STARTING_TROOPS: 200,
  EXPANSION_TICK_MS: 50,
  CELLS_PER_TICK: 10,
  BOT_THINK_MS: 2000,
};

const GRID_W = Math.floor(CONFIG.WIDTH / CONFIG.CELL_SIZE);
const GRID_H = Math.floor(CONFIG.HEIGHT / CONFIG.CELL_SIZE);

const PLAYER_COLORS = [
  '#4488ff', '#ff4444', '#44bb44', '#ffaa22', '#cc44cc',
  '#44cccc', '#ff6699', '#bbbb22', '#8855dd', '#cc8844', '#44cc88',
];
const PLAYER_NAMES = [
  'You', 'Maurya', 'Chola', 'Mughal', 'Maratha',
  'Gupta', 'Rajput', 'Vijayanagara', 'Pallava', 'Sikh Empire', 'Pandya',
];
const STARTING_POSITIONS = [
  { gx: 283, gy: 102 }, { gx: 266, gy: 38 }, { gx: 235, gy: 143 },
  { gx: 215, gy: 192 }, { gx: 331, gy: 124 }, { gx: 397, gy: 143 },
  { gx: 491, gy: 140 }, { gx: 270, gy: 233 }, { gx: 325, gy: 248 },
  { gx: 280, gy: 295 }, { gx: 317, gy: 340 },
];
const INDIA_OUTLINE = [
  [133, 20], [157, 12], [193, 8], [210, 24], [220, 48],
  [235, 72], [241, 97], [248, 121], [253, 133],
  [270, 150], [290, 157],
  [314, 169], [338, 190], [362, 205], [386, 217],
  [410, 229], [434, 238], [447, 242],
  [465, 250], [478, 248], [483, 235], [485, 220],
  [490, 210], [495, 205],
  [510, 210], [531, 217], [555, 224], [567, 229],
  [591, 218], [616, 205], [640, 200], [664, 208], [688, 217],
  [680, 235], [670, 250], [660, 270], [652, 285],
  [645, 300], [635, 320], [625, 335], [616, 345],
  [604, 355], [591, 365], [579, 374],
  [555, 370], [531, 365], [519, 362],
  [507, 368], [495, 374], [488, 382], [483, 390],
  [471, 392], [459, 390], [447, 400],
  [434, 415], [422, 428], [410, 440],
  [398, 455], [386, 468], [374, 483],
  [362, 495], [350, 510], [338, 520],
  [326, 535], [314, 548], [306, 560], [302, 572],
  [296, 590], [292, 610], [290, 630], [290, 655],
  [288, 670], [282, 685], [272, 695],
  [260, 700], [248, 698], [238, 695],
  [229, 690], [222, 682], [217, 672],
  [212, 660], [207, 648], [200, 635],
  [195, 620], [190, 600], [182, 585],
  [175, 570], [169, 555], [163, 540],
  [157, 525], [150, 512], [145, 500],
  [138, 488], [133, 475], [128, 462],
  [123, 448], [118, 435], [113, 420],
  [109, 405], [105, 395], [100, 388],
  [97, 382], [90, 375], [80, 368],
  [70, 360], [60, 352], [48, 345],
  [36, 338], [24, 330], [16, 322],
  [12, 315], [14, 305], [20, 296],
  [28, 286], [36, 278], [44, 270],
  [48, 260], [52, 250], [56, 242],
  [60, 230], [64, 218], [68, 208],
  [72, 198], [78, 185], [85, 175],
  [92, 165], [100, 155], [108, 145],
  [115, 135], [121, 120], [121, 105],
  [121, 90], [124, 75], [127, 60],
  [130, 45], [133, 30], [133, 20],
];
const SRI_LANKA_OUTLINE = [
  [320, 715], [330, 708], [345, 706], [358, 712], [365, 725],
  [368, 740], [365, 758], [358, 772], [348, 782], [335, 786],
  [325, 780], [318, 768], [314, 750], [313, 735], [315, 722], [320, 715],
];
const MAP_SCALE = CONFIG.HEIGHT / 786;
const MAP_OFFSET_X = Math.floor((CONFIG.WIDTH - 700 * MAP_SCALE) / 2);

function hexToRgb(hex) { return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }; }
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; return (((h ^ (h >> 13)) * 1274126177) & 0x7fffffff) / 0x7fffffff; }
const toU32 = (r, g, b) => (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
function lerpColor(a, b, t) { return { r: (a.r * (1 - t) + b.r * t) | 0, g: (a.g * (1 - t) + b.g * t) | 0, b: (a.b * (1 - t) + b.b * t) | 0 }; }
function maxTroopsForTiles(t, cityCount) { return Math.floor(Math.pow(t, 0.6) * 12 + 150 + (cityCount || 0) * 100); }
function formatTroops(n) { n = Math.floor(n); if (n >= 10000) return (n / 1000).toFixed(0) + 'K'; if (n >= 1000) return (n / 1000).toFixed(1) + 'K'; return '' + n; }

class GameRenderer {
  constructor(canvas) {
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
    this.minZoom = 1;
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
    this.gameOver = false;
    this.winner = null;
    this.ready = false;
    this.infoPanelTimer = 0;
    this.attackRatio = 0.5;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.initColors();
    this.startWorker();
  }

  resizeCanvas() {
    const panel = document.getElementById('info-panel');
    const panelW = panel ? panel.offsetWidth + 32 : 260;
    const w = window.innerWidth - panelW;
    const h = window.innerHeight - 32;
    const aspect = CONFIG.WIDTH / CONFIG.HEIGHT;
    let dw, dh;
    if (w / h > aspect) { dh = h; dw = h * aspect; }
    else { dw = w; dh = w / aspect; }
    this.canvas.width = Math.floor(dw);
    this.canvas.height = Math.floor(dh);
    this.canvas.style.width = Math.floor(dw) + 'px';
    this.canvas.style.height = Math.floor(dh) + 'px';
    this.ctx.imageSmoothingEnabled = false;
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
  }

  startWorker() {
    this.worker = new Worker('game-worker.js');
    this.worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'init_done') {
        this.terrain = new Uint8Array(msg.terrain);
        this.grid = new Int8Array(msg.grid);
        this.borderMap = new Uint8Array(GRID_W * GRID_H);
        this.initWater();
        this.fullRedraw();
        this.setupInput();
        this.ready = true;
      }
      if (msg.type === 'tick') {
        const ch = new Int32Array(msg.changes);
        for (let i = 0; i < msg.changesLen; i += 2) this.applyChange(ch[i], ch[i + 1]);
        this.playerData = msg.players;
        this.cities = msg.cities || [];
        this.gameOver = msg.gameOver;
        this.winner = msg.winner;
      }
    };
    this.worker.postMessage({
      type: 'init', gridW: GRID_W, gridH: GRID_H, numBots: CONFIG.NUM_BOTS,
      cellSize: CONFIG.CELL_SIZE,
      cellsPerTick: CONFIG.CELLS_PER_TICK, expansionTickMs: CONFIG.EXPANSION_TICK_MS,
      botThinkMs: CONFIG.BOT_THINK_MS, startingTroops: CONFIG.STARTING_TROOPS,
      startingRadius: CONFIG.STARTING_RADIUS, startingPositions: STARTING_POSITIONS,
      mapScale: MAP_SCALE, mapOffsetX: MAP_OFFSET_X, indiaOutline: INDIA_OUTLINE, sriLankaOutline: SRI_LANKA_OUTLINE,
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
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x; if (this.terrain[i] > 0) continue;
      if (coast[i]) this.waterC[i] = toU32(22, 42, 72);
      else { const v = (hash(x*3,y*3)*8)|0, d = (hash(x,y)*5)|0; this.waterC[i] = toU32(10+v, 22+v+d, 48+v+d); }
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

  paintCell(idx) {
    const o = this.grid[idx], t = this.terrain[idx];
    if (t === 0) this.data32[idx] = this.waterC[idx];
    else if (o === -1) this.data32[idx] = this.terrainC[t];
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
      this.paintCell(i);
    }
  }

  fullRedraw() {
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      if (this.grid[i] >= 0) this.borderMap[i] = this.calcBorder(i) ? 1 : 0;
      this.paintCell(i);
    }
  }

  setupInput() {
    const DRAG_THRESHOLD = 5;

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { cx, cy } = this.screenToCanvas(e.clientX, e.clientY);
      const gameX = cx / this.zoom + this.camX;
      const gameY = cy / this.zoom + this.camY;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * delta));
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

      if (this._mouseIsDown && !this._didDrag) {
        // It was a click, not a drag
        if (!this.gameOver) {
          const { cx, cy } = this.screenToCanvas(e.clientX, e.clientY);
          const sx = 10, sy = this.canvas.height - 50, sw = 200, sh = 12;
          if (!(cx >= sx && cx <= sx + sw && cy >= sy && cy <= sy + sh)) {
            const { gx, gy } = this.screenToGame(e.clientX, e.clientY);
            if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
              if (e.shiftKey) {
                this.worker.postMessage({ type: 'place_city', gx, gy });
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
      this.worker.postMessage({ type: 'rightclick' });
    });

    // Prevent click event from also firing after drag
    this.canvas.addEventListener('click', (e) => { e.stopPropagation(); }, true);
  }

  render() {
    if (this.ready) {
      // Draw game buffer to the offscreen canvas
      this.bufCtx.putImageData(this.imageData, 0, 0);

      // Draw zoomed/panned view to display canvas
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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

    // Gold display
    const goldStr = `Gold: ${Math.floor(ps.gold || 0)}  Cities: ${ps.cityCount || 0}`;
    ctx.font = '11px monospace'; ctx.fillStyle = '#ffd700'; ctx.fillText(goldStr, 26, 36);
    ctx.fillStyle = '#8b949e'; ctx.font = '10px monospace'; ctx.fillText('Shift+click own territory to build city (cost: 100)', 26, 50);

    const bx = 10, by = this.canvas.height - 20;
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(bx, by, 200, 8);
    const f = Math.min(1, (ps.troops || 0) / Math.max(1, max));
    ctx.fillStyle = f > 0.5 ? PLAYER_COLORS[0] : '#cc4444'; ctx.fillRect(bx, by, 200 * f, 8);
    ctx.font = '11px monospace'; ctx.fillStyle = '#fff';
    ctx.fillText(`Troops: ${formatTroops(ps.troops||0)} / ${formatTroops(max)}`, bx, by - 5);

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
    panel.innerHTML = `
      <div class="panel-header"><span style="color:${PLAYER_COLORS[0]}">&#9632;</span> You
        <div>Territory: ${ps.cellCount} cells</div>
        <div>Troops: ${formatTroops(ps.troops)} / ${formatTroops(max)}${ps.attackTroops > 0 ? ` <span style="color:#ff6644">(${formatTroops(ps.attackTroops)} attacking)</span>` : ''}</div>
        <div style="color:#ffd700">Gold: ${Math.floor(ps.gold || 0)} | Cities: ${ps.cityCount || 0}</div>
        <div>Attack ratio: ${Math.round(this.attackRatio * 100)}%</div>
        <div>Target: ${tgt}</div></div>
      <div class="info-section"><div class="info-hint">Click wilderness: expand<br>Click enemy: attack<br>Click again: send more troops<br>Click own / Right-click: cancel<br>Shift+click own: build city (100g)<br>Slider (bottom-left): attack %</div></div>
      <div class="info-section"><div class="info-title">Terrain</div>
        <div class="terrain-row"><span class="ter-swatch" style="background:#6e9e48"></span> Plains</div>
        <div class="terrain-row"><span class="ter-swatch" style="background:#baa66c"></span> Highland</div>
        <div class="terrain-row"><span class="ter-swatch" style="background:#d2cec6"></span> Mountain</div></div>
      <div class="leaderboard"><div class="info-title">Leaderboard</div>
        ${lb.map(p => `<div class="lb-row${p.id===0?' lb-player':''}"><span style="color:${PLAYER_COLORS[p.id]}">&#9632;</span> ${p.name}: ${p.cellCount} <span style="color:#8b949e">(${formatTroops(p.troops)})</span>${p.expanding?(p.attackTarget===-1?'<span style="color:#cccc44;font-size:10px"> [wild]</span>':'<span style="color:#ff6644;font-size:10px"> [atk]</span>'):''}</div>`).join('')}</div>`;
  }
}

window.addEventListener('load', () => { new GameRenderer(document.getElementById('game-canvas')).render(); });
