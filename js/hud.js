// hud.js — Screen-space HUD rendering: bottom bar, leaderboard, tooltips, game-over, etc.

import { CONFIG, PLAYER_COLORS, BUILD_ITEMS, gameState, maxTroopsForTiles, formatTroops } from './config.js';
import { OverlayRenderer } from './overlays.js';

export class HudRenderer {
  constructor(renderer) {
    this.r = renderer;
    this.overlays = new OverlayRenderer(renderer);
  }

  _isMobile() { return this.r.canvas.width < 700; }

  _getBottomBarLayout() {
    const mobile = this._isMobile();
    if (mobile) {
      const safeBottom = 50;
      const bw = this.r.canvas.width - 16, bh = 80;
      return { x: 8, y: this.r.canvas.height - bh - safeBottom, w: bw, h: bh, mobile: true };
    }
    const bw = Math.min(440, this.r.canvas.width - 40), bh = 60;
    return { x: (this.r.canvas.width - bw) / 2, y: this.r.canvas.height - bh - 10, w: bw, h: bh, mobile: false };
  }

  render() {
    const r = this.r;
    if (!r.playerData.length) return;
    const ctx = r.ctx, ps = r.playerData[0] || {};
    const GRID_W = r.GRID_W, GRID_H = r.GRID_H;
    const PLAYER_NAMES = gameState.PLAYER_NAMES;

    // === GAME-WORLD OVERLAYS (zoomed) ===
    ctx.save();
    ctx.scale(r.zoom, r.zoom);
    ctx.translate(-r.camX, -r.camY);
    this.overlays.render(ctx, GRID_W, GRID_H, PLAYER_NAMES);
    ctx.restore();

    // === SCREEN-SPACE HUD ===
    if (r._selectingLocation) {
      this._renderLocationSelection(ctx, GRID_W, GRID_H);
      if (r._tutorialActive) r.tutorial.render();
      return;
    }

    const max = maxTroopsForTiles(ps.cellCount || 0, ps.cityCount || 0);
    const gold = ps.gold || 0;
    const troops = ps.troops || 0;

    if (r.placementMode) this._renderPlacementText(ctx);

    this._renderBottomBar(ctx, ps, max, gold, troops, PLAYER_NAMES);
    this._renderBuildButtons(ctx, gold);
    this._renderBuildTooltip(ctx);
    this._renderGoldTooltip(ctx, ps);
    this._renderTroopTooltip(ctx, ps);
    this._renderOutboundTooltip(ctx, ps, PLAYER_NAMES);
    this._renderTerritoryTooltip(ctx);
    this._renderLeaderboard(ctx, PLAYER_NAMES);
    this._renderHelpButton(ctx);
    if (CONFIG.BOATS_ENABLED) this._renderBoatCount(ctx);
    if (CONFIG.BOATS_ENABLED && r._contextMenu) this._renderContextMenu(ctx);
    if (r.gameOver) this._renderGameOver(ctx);
    if (r._tutorialActive) r.tutorial.render();
  }

  _renderLocationSelection(ctx, GRID_W, GRID_H) {
    const r = this.r;
    const cloudsActive = !!r._cloudIntro;
    const cloudT = cloudsActive ? (performance.now() - r._cloudIntro.start) / r._cloudIntro.duration : 1;
    const textFade = cloudsActive ? Math.max(0, (cloudT - 0.6) / 0.4) : 1;

    if (textFade > 0) {
      ctx.globalAlpha = textFade;
      const isMobile = this._isMobile();
      const boxW = Math.min(560, r.canvas.width - 24);
      const boxH = isMobile ? 130 : 110;
      const boxX = (r.canvas.width - boxW) / 2, boxY = r.canvas.height / 2 - boxH / 2 - 10;
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
      ctx.fillText(titleText, r.canvas.width / 2, boxY + (isMobile ? 32 : 30));
      ctx.font = `bold ${subSz}px sans-serif`; ctx.fillStyle = '#e6edf3';
      if (isMobile) {
        ctx.fillText('Conquer 80% of the map to win.', r.canvas.width / 2, boxY + 62);
        ctx.fillText('Good luck!', r.canvas.width / 2, boxY + 84);
      } else {
        ctx.fillText('Conquer 80% of the map to win. Good luck!', r.canvas.width / 2, boxY + 62);
      }
      ctx.font = `${hintSz}px sans-serif`; ctx.fillStyle = '#8b949e';
      ctx.fillText('Pick your starting location wisely', r.canvas.width / 2, boxY + (isMobile ? 110 : 90));
      ctx.globalAlpha = 1;
    }

    if (!cloudsActive && r._hoverGx !== undefined && r._hoverGy !== undefined) {
      const hx = r._hoverGx, hy = r._hoverGy;
      const hIdx = hy * GRID_W + hx;
      if (hx >= 0 && hx < GRID_W && hy >= 0 && hy < GRID_H && r.terrain && r.terrain[hIdx] > 0 && r.grid[hIdx] === -1) {
        ctx.save(); ctx.scale(r.zoom, r.zoom); ctx.translate(-r.camX, -r.camY);
        const R = CONFIG.STARTING_RADIUS;
        ctx.beginPath(); ctx.arc(hx, hy, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(68,136,255,0.25)'; ctx.fill();
        ctx.strokeStyle = '#4488ff'; ctx.lineWidth = Math.max(1, 2 / r.zoom); ctx.stroke();
        ctx.restore();
      }
    }
  }

  _renderPlacementText(ctx) {
    const labels = { city: 'PLACING CITY', defense_post: 'PLACING FORT' };
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffd700'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText((labels[this.r.placementMode] || 'PLACING') + ' — click to place, Esc to cancel', this.r.canvas.width / 2, 12);
  }

  _renderBottomBar(ctx, ps, max, gold, troops, PLAYER_NAMES) {
    const r = this.r;
    const bar = this._getBottomBarLayout();
    ctx.fillStyle = 'rgba(31, 41, 55, 0.92)';
    ctx.beginPath(); ctx.roundRect(bar.x, bar.y, bar.w, bar.h, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bar.x, bar.y, bar.w, bar.h, 10); ctx.stroke();

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

    if (!bar.mobile) {
      const outbound = Math.floor(ps.attackTroops || 0) + (ps.beachheads || []).reduce((s, b) => s + Math.floor(b.troops), 0);
      const outStr = `Outbound: ${formatTroops(outbound)}`;
      ctx.font = 'bold 11px sans-serif';
      const outW = ctx.measureText(outStr).width + 14;
      const outX = bar.x + 12 + stW + 12;
      const outH = 18;
      r._outboundPillRect = { x: outX, y: row0Y + 1, w: outW, h: outH };
      ctx.fillStyle = outbound > 0 ? 'rgba(255,102,68,0.15)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.roundRect(outX, row0Y + 1, outW, outH, 4); ctx.fill();
      ctx.strokeStyle = outbound > 0 ? '#ff6644' : 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(outX, row0Y + 1, outW, outH, 4); ctx.stroke();
      ctx.fillStyle = outbound > 0 ? '#ff8866' : '#9ca3af';
      ctx.fillText(outStr, outX + 7, row0Y + 10);
    } else {
      r._outboundPillRect = null;
    }

    if (r.totalLandTiles > 0) {
      const myPct = (ps.cellCount || 0) / r.totalLandTiles;
      const progW = 140, progH = 10, progX = bar.x + bar.w - 12 - progW;
      r._territoryBarRect = { x: progX, y: row0Y + 4, w: progW, h: progH };
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath(); ctx.roundRect(progX, row0Y + 4, progW, progH, 4); ctx.fill();
      const fillW = Math.min(1, myPct) * progW;
      ctx.fillStyle = myPct >= 0.8 ? '#44ff44' : myPct >= 0.5 ? '#ccaa22' : '#4488ff';
      ctx.beginPath(); ctx.roundRect(progX, row0Y + 4, fillW, progH, 4); ctx.fill();
      const markerX = progX + 0.8 * progW;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(markerX, row0Y + 3); ctx.lineTo(markerX, row0Y + 4 + progH + 1); ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#ddd';
      ctx.fillText(`${Math.round(myPct * 100)}%`, progX + progW / 2, row0Y + 9);
    }

    // Row 1: troop bar + gold pill
    const row1Y = bar.y + 30;
    const pillH = 26, pillR = 6;

    const goldRateStr = ` +${r._goldRate.toFixed(0)}/m`;
    const goldStr = `${Math.floor(gold)}g${goldRateStr}`;
    ctx.font = 'bold 14px sans-serif';
    const iconSz = pillH - 6;
    const goldW = ctx.measureText(goldStr).width + 22 + iconSz + 2;
    const goldPillX = bar.x + bar.w - 10 - goldW;
    r._goldPillRect = { x: goldPillX, y: row1Y, w: goldW, h: pillH };
    ctx.strokeStyle = r._hoverGoldPill ? '#ffe866' : '#ffd700'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(goldPillX, row1Y, goldW, pillH, pillR); ctx.stroke();
    if (r._hoverGoldPill) { ctx.fillStyle = 'rgba(255,215,0,0.08)'; ctx.fill(); }
    if (r._icons.gold.complete) ctx.drawImage(r._icons.gold, goldPillX + 6, row1Y + 3, iconSz, iconSz);
    ctx.fillStyle = '#ffd700'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(goldStr, goldPillX + iconSz + 6 + (goldW - iconSz - 6) / 2, row1Y + pillH / 2);

    const tbX = bar.x + 10, tbW = bar.w - 20 - goldW - 10;
    r._troopBarRect = { x: tbX, y: row1Y, w: tbW, h: pillH };
    ctx.fillStyle = '#1a1a2e'; ctx.beginPath(); ctx.roundRect(tbX, row1Y + 1, tbW, pillH - 2, 5); ctx.fill();
    const f = Math.min(1, troops / Math.max(1, max));
    const grad = ctx.createLinearGradient(tbX, 0, tbX + tbW, 0);
    grad.addColorStop(0, '#cc4444');
    grad.addColorStop(0.5, '#44bb44');
    grad.addColorStop(1, '#ccaa22');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(tbX, row1Y + 1, tbW * f, pillH - 2, 5); ctx.fill();
    if (r._icons.troop.complete) ctx.drawImage(r._icons.troop, tbX + 4, row1Y + 3, iconSz, iconSz);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${formatTroops(troops)} / ${formatTroops(max)}`, tbX + tbW / 2 + iconSz / 2, row1Y + pillH / 2);
  }

  _renderBuildButtons(ctx, gold) {
    const r = this.r;
    const bar = this._getBottomBarLayout();
    r._uiPositions.buildButtons = {};
    const mobile = bar.mobile;
    const btnW = mobile ? 56 : 54;
    const btnH = mobile ? 56 : bar.h;
    let btnStartX, btnStartY, btnDx, btnDy;
    if (mobile) {
      btnStartX = r.canvas.width - btnW - 8;
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
      const cost = r.getBuildCost(item.key);
      const canAfford = gold >= cost;
      const selected = r.placementMode === item.key;
      const hovered = r._hoverBuildKey === item.key && !selected;

      ctx.fillStyle = selected ? 'rgba(68,136,255,0.25)' : hovered ? 'rgba(0,0,0,0.45)' : 'rgba(31,41,55,0.92)';
      ctx.beginPath(); ctx.roundRect(bx, by, btnW, btnH, 8); ctx.fill();
      ctx.strokeStyle = selected ? '#4488ff' : hovered ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, by, btnW, btnH, 8); ctx.stroke();

      ctx.globalAlpha = canAfford ? 1 : 0.35;
      const btnIcon = r._icons[item.key];
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
      r._uiPositions.buildButtons[item.key] = { x: bx, y: by, w: btnW, h: btnH };
    }
  }

  _renderBuildTooltip(ctx) {
    if (!this.r._hoverBuildKey || this.r.placementMode) return;
    const ttPad = 10;
    const tooltips = {
      city: ['+500 max troop capacity', 'Place inside your territory', 'Hotkey: 1'],
      defense_post: ['4x attack cost for enemies in range', 'Place on your border to defend', 'Hotkey: 2'],
    };
    const lines = tooltips[this.r._hoverBuildKey] || [];
    if (!lines.length) return;
    ctx.font = '10px monospace';
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
    const ttW = ttPad * 2 + maxW, ttH = ttPad * 2 + lines.length * 16;
    const bp = this.r._uiPositions.buildButtons[this.r._hoverBuildKey];
    const ttX = Math.max(10, Math.min(this.r.canvas.width - ttW - 10, bp.x + bp.w / 2 - ttW / 2));
    const ttY = bp.y - ttH - 8;
    ctx.fillStyle = 'rgba(31, 41, 55, 0.95)';
    ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#c9d1d9';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], ttX + ttPad, ttY + ttPad + i * 16);
  }

  _renderGoldTooltip(ctx, ps) {
    if (!this.r._hoverGoldPill) return;
    const ttPad = 10;
    const cellCount = ps.cellCount || 0;
    const landPerMin = (0.008 + cellCount * 0.00004) * 600;
    const lines = [
      { text: 'Gold income', color: '#ffd700', bold: true },
      { text: '', color: '' },
      { text: `Territory: +${landPerMin.toFixed(1)}/min`, color: '#88cc88' },
      { text: '', color: '' },
      { text: 'Spend on Cities and Forts.', color: '#9ca3af' },
    ];
    ctx.font = 'bold 11px sans-serif';
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l.text).width);
    const ttW = ttPad * 2 + maxW, ttH = ttPad * 2 + lines.length * 15;
    const gp = this.r._goldPillRect;
    let ttX = gp.x + gp.w / 2 - ttW / 2;
    ttX = Math.max(10, Math.min(this.r.canvas.width - ttW - 10, ttX));
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

  _renderTroopTooltip(ctx, ps) {
    if (!this.r._hoverTroopBar) return;
    const ttPad = 10;
    const cellCount = ps.cellCount || 0, cityCount = ps.cityCount || 0;
    const landCap = Math.floor(Math.pow(cellCount, 0.6) * 12 + 150);
    const cityCap = cityCount * 500;
    const lines = [
      { text: `Land cap: ${formatTroops(landCap)}`, color: '#88cc88' },
      { text: `Cities (×${cityCount}): +${formatTroops(cityCap)}`, color: '#ffd700' },
      { text: '', color: '' },
      { text: `Troops/sec: +${Math.max(0, this.r._troopRate).toFixed(0)}`, color: '#e6edf3' },
      { text: '', color: '' },
      { text: 'Red: low troops, fast regen', color: '#cc4444' },
      { text: 'Green: optimal troop gain', color: '#44bb44' },
      { text: 'Yellow: near cap, diminishing', color: '#ccaa22' },
    ];
    ctx.font = 'bold 11px sans-serif';
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l.text).width);
    const ttW = ttPad * 2 + maxW, ttH = ttPad * 2 + lines.length * 15;
    const tb = this.r._troopBarRect;
    let ttX = tb.x + tb.w / 2 - ttW / 2;
    ttX = Math.max(10, Math.min(this.r.canvas.width - ttW - 10, ttX));
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

  _renderOutboundTooltip(ctx, ps, PLAYER_NAMES) {
    if (!this.r._hoverOutbound) return;
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
    const ttW = ttPad * 2 + maxW, ttH = ttPad * 2 + 16 + lines.length * 15;
    const ob = this.r._outboundPillRect;
    let ttX = ob.x + ob.w / 2 - ttW / 2;
    ttX = Math.max(10, Math.min(this.r.canvas.width - ttW - 10, ttX));
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

  _renderTerritoryTooltip(ctx) {
    if (!this.r._hoverTerritoryBar) return;
    const ttPad = 10;
    const lines = ['Your territory as % of the total map.', 'Reach 80% to claim victory!'];
    ctx.font = '10px monospace';
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
    const ttW = ttPad * 2 + maxW, ttH = ttPad * 2 + lines.length * 16;
    const terr = this.r._territoryBarRect;
    const ttX = Math.min(terr.x + terr.w / 2 - ttW / 2, this.r.canvas.width - ttW - 10);
    const ttY = terr.y - ttH - 8;
    ctx.fillStyle = 'rgba(31, 41, 55, 0.95)';
    ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(68,136,255,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(ttX, ttY, ttW, ttH, 8); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#c9d1d9';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], ttX + ttPad, ttY + ttPad + i * 16);
  }

  _renderLeaderboard(ctx, PLAYER_NAMES) {
    const r = this.r;
    const lb = r.playerData.map((s, i) => ({ id: i, name: i === 0 ? r.playerName : PLAYER_NAMES[i], ...s })).filter(p => p.alive).sort((a, b) => b.cellCount - a.cellCount);
    const lbX = 10, lbY = 10;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (!r._lbScroll) r._lbScroll = 0;

    if (r._leaderboardOpen) {
      const lbW = 320, lbRowH = 22, maxVisible = 10;
      const visCount = Math.min(lb.length, maxVisible);
      const headerH = 18;
      const listH = visCount * lbRowH;
      const playerRank = lb.findIndex(p => p.id === 0);
      const colNameX = lbX + 28;
      const colOwnedX = lbX + lbW - 130;
      const colMaxX = lbX + lbW - 16;
      const scrollMax = Math.max(0, lb.length - maxVisible);
      r._lbScroll = Math.max(0, Math.min(scrollMax, r._lbScroll));
      const dataStartY = lbY + 28 + headerH;
      const playerVisible = playerRank >= 0 && playerRank >= r._lbScroll && playerRank < r._lbScroll + visCount;
      const stickyH = (playerRank >= 0 && !playerVisible) ? lbRowH + 4 : 0;
      const lbH = 28 + headerH + listH + 4 + stickyH;

      ctx.fillStyle = 'rgba(31,41,55,0.92)'; ctx.beginPath(); ctx.roundRect(lbX, lbY, lbW, lbH, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(lbX, lbY, lbW, lbH, 8); ctx.stroke();
      ctx.fillStyle = '#e6edf3'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText('Leaderboard  [▲]', lbX + 8, lbY + 8);
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
        ctx.fillStyle = highlight ? '#ffffff' : (p.id === 0 ? '#ffffff' : '#d0d7de'); ctx.font = 'bold 12px sans-serif';
        ctx.fillText(p.name, colNameX + 16, y + 4);
        const pct = r.totalLandTiles > 0 ? Math.round(p.cellCount / r.totalLandTiles * 100) : 0;
        ctx.fillStyle = highlight ? '#ffffff' : '#c9d1d9'; ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${pct}%`, colOwnedX, y + 5);
        const maxT = maxTroopsForTiles(p.cellCount, p.cityCount || 0);
        ctx.fillStyle = highlight ? '#ffffff' : '#9ca3af';
        ctx.fillText(formatTroops(maxT), colMaxX, y + 5);
        ctx.textAlign = 'left';
      };

      for (let i = 0; i < visCount; i++) {
        const pi = i + r._lbScroll;
        if (pi >= lb.length) break;
        drawRow(lb[pi], pi, dataStartY + i * lbRowH, lb[pi].id === 0);
      }
      if (stickyH > 0) {
        const stickyY = dataStartY + listH + 4;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(lbX + 8, stickyY - 2); ctx.lineTo(lbX + lbW - 8, stickyY - 2); ctx.stroke();
        drawRow(lb[playerRank], playerRank, stickyY, true);
      }
      if (lb.length > maxVisible) {
        const sbX = lbX + lbW - 8, sbY = dataStartY, sbH = listH;
        const thumbH = Math.max(20, sbH * (maxVisible / lb.length));
        const thumbY = sbY + (sbH - thumbH) * (r._lbScroll / scrollMax);
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
  }

  _renderHelpButton(ctx) {
    const r = this.r;
    const helpX = r.canvas.width - 30, helpY = 30;
    ctx.beginPath(); ctx.arc(helpX, helpY, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(31,41,55,0.88)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#8b949e'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', helpX, helpY);

    if (r._helpOpen || r._hoverHelp) {
      const isMobile = this._isMobile();
      const lines = isMobile ? [
        'Tap land: expand / attack', 'Drag: pan map', 'Pinch: zoom', 'Tap building: select to place',
      ] : [
        'Click: expand/attack', CONFIG.BOATS_ENABLED ? 'Right-click: boat / cancel' : 'Right-click: cancel',
        'WASD: pan camera', 'Scroll: zoom', '1-2: select building', 'Tab: toggle leaderboard', 'Esc: cancel placement',
      ];
      ctx.font = 'bold 11px sans-serif';
      let maxW = 0;
      for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
      const hpW = maxW + 24, hpH = lines.length * 16 + 16;
      const hpX = Math.max(8, r.canvas.width - hpW - 10), hpY = 50;
      ctx.fillStyle = 'rgba(31,41,55,0.95)'; ctx.beginPath(); ctx.roundRect(hpX, hpY, hpW, hpH, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(hpX, hpY, hpW, hpH, 8); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#c9d1d9';
      lines.forEach((l, i) => ctx.fillText(l, hpX + 12, hpY + 10 + i * 16));
    }
  }

  _renderBoatCount(ctx) {
    const boatCount = (this.r.boats || []).filter(b => b.owner === 0).length;
    if (boatCount > 0) {
      ctx.fillStyle = '#4488ff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`Boats: ${boatCount}/3`, this.r.canvas.width / 2, this.r.placementMode ? 58 : 44);
    }
  }

  _renderContextMenu(ctx) {
    const cm = this.r._contextMenu;
    const cmCanvas = this.r.screenToCanvas(cm.screenX, cm.screenY);
    const btnX = cmCanvas.cx, btnY = cmCanvas.cy - 40;
    ctx.fillStyle = 'rgba(22,27,34,0.92)'; ctx.strokeStyle = '#4488ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(btnX - 18, btnY - 14, 36, 28, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4488ff'; ctx.beginPath(); ctx.moveTo(btnX + 8, btnY); ctx.lineTo(btnX - 6, btnY - 6); ctx.lineTo(btnX - 3, btnY); ctx.lineTo(btnX - 6, btnY + 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4488ff88'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(btnX - 8, btnY + 10); ctx.quadraticCurveTo(btnX - 4, btnY + 7, btnX, btnY + 10); ctx.quadraticCurveTo(btnX + 4, btnY + 13, btnX + 8, btnY + 10); ctx.stroke();
    ctx.strokeStyle = '#4488ff44'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(btnX, btnY + 14); ctx.lineTo(cmCanvas.cx, cmCanvas.cy); ctx.stroke(); ctx.setLineDash([]);
  }

  _renderGameOver(ctx) {
    const r = this.r;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, r.canvas.width, r.canvas.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (r.winner === 0) {
      ctx.font = 'bold 56px sans-serif'; ctx.fillStyle = '#44ff44';
      ctx.fillText('VICTORY!', r.canvas.width / 2, r.canvas.height / 2 - 50);
      const pct = r.playerData[0] ? Math.round(r.playerData[0].cellCount / Math.max(1, r.totalLandTiles) * 100) : 0;
      ctx.font = '20px sans-serif'; ctx.fillStyle = '#ccc';
      ctx.fillText(`You conquered ${pct}% of the map`, r.canvas.width / 2, r.canvas.height / 2);
    } else {
      ctx.font = 'bold 56px sans-serif'; ctx.fillStyle = '#ff4444';
      ctx.fillText('DEFEATED', r.canvas.width / 2, r.canvas.height / 2 - 50);
      ctx.font = '20px sans-serif'; ctx.fillStyle = '#ccc';
      ctx.fillText('Your territory was conquered', r.canvas.width / 2, r.canvas.height / 2);
    }
    const btnW2 = 200, btnH2 = 50;
    const btnX2 = (r.canvas.width - btnW2) / 2, btnY2 = r.canvas.height / 2 + 40;
    r._restartBtn = { x: btnX2, y: btnY2, w: btnW2, h: btnH2 };
    ctx.fillStyle = '#4488ff';
    ctx.beginPath(); ctx.roundRect(btnX2, btnY2, btnW2, btnH2, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Play Again', r.canvas.width / 2, btnY2 + btnH2 / 2);
  }
}
