// overlays.js — Game-world overlays drawn in zoom space: cities, forts, boats, labels, placement previews

import { CONFIG, PLAYER_COLORS, formatTroops } from './config.js';

export class OverlayRenderer {
  constructor(renderer) {
    this.r = renderer;
  }

  render(ctx, GRID_W, GRID_H, PLAYER_NAMES) {
    this.renderCities(ctx, GRID_W);
    this.renderDefensePosts(ctx, GRID_W);
    this.renderAnimations(ctx, GRID_W);
    if (CONFIG.BOATS_ENABLED) this.renderBoats(ctx, GRID_W, GRID_H, PLAYER_NAMES);
    this.renderBeachheads(ctx, GRID_W);
    this.renderPlacementPreviews(ctx, GRID_W, GRID_H);
    this.renderPlayerLabels(ctx, GRID_W, PLAYER_NAMES);
  }

  renderCities(ctx, GRID_W) {
    const cityIcon = this.r._icons.city;
    for (const city of this.r.cities) {
      const cx2 = city.idx % GRID_W, cy2 = (city.idx / GRID_W) | 0;
      const sz = Math.max(6, 10 / Math.max(1, this.r.zoom * 0.3));
      ctx.beginPath(); ctx.arc(cx2, cy2, sz * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_COLORS[city.owner] || '#fff'; ctx.fill();
      if (cityIcon && cityIcon.complete) {
        ctx.drawImage(cityIcon, cx2 - sz / 2, cy2 - sz / 2, sz, sz);
      } else {
        ctx.fillStyle = '#ffd700'; ctx.fillRect(cx2 - sz / 2, cy2 - sz / 2, sz, sz);
      }
    }
  }

  renderDefensePosts(ctx, GRID_W) {
    let hoveringDpost = false;
    const hgx = this.r._hoverGx, hgy = this.r._hoverGy;
    if (hgx !== undefined && hgy !== undefined) {
      for (const dp of (this.r.defensePosts || [])) {
        const dx = dp.idx % GRID_W, dy = (dp.idx / GRID_W) | 0;
        if (Math.abs(hgx - dx) + Math.abs(hgy - dy) <= Math.max(3, Math.ceil(5 / this.r.zoom))) { hoveringDpost = true; break; }
      }
    }
    const dpostIcon = this.r._icons.defense_post;
    for (const dp of (this.r.defensePosts || [])) {
      const dx = dp.idx % GRID_W, dy = (dp.idx / GRID_W) | 0;
      const sz = Math.max(5, 9 / Math.max(1, this.r.zoom * 0.3));
      ctx.beginPath(); ctx.arc(dx, dy, sz * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_COLORS[dp.owner] || '#fff'; ctx.fill();
      if (dpostIcon && dpostIcon.complete) {
        ctx.drawImage(dpostIcon, dx - sz / 2, dy - sz / 2, sz, sz);
      } else {
        ctx.save(); ctx.translate(dx, dy); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#fff'; ctx.fillRect(-sz / 2, -sz / 2, sz, sz); ctx.restore();
      }
      if (hoveringDpost && dp.owner === 0) {
        ctx.beginPath(); ctx.arc(dx, dy, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(0.5, 1 / this.r.zoom); ctx.stroke();
      }
    }
  }

  renderAnimations(ctx, GRID_W) {
    const now = performance.now();
    for (let i = this.r.animations.length - 1; i >= 0; i--) {
      const anim = this.r.animations[i];
      const elapsed = now - anim.startTime;
      if (elapsed >= anim.duration) { this.r.animations.splice(i, 1); continue; }
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
  }

  renderBoats(ctx, GRID_W, GRID_H, PLAYER_NAMES) {
    const now = performance.now();
    const tickInterval = this.r.spectateMode ? 16 : 50;
    const progress = Math.min(1, (now - this.r._lastTickTime) / tickInterval);
    for (const boat of (this.r.boats || [])) {
      const path = boat.path; if (!path || path.length < 2) continue;
      const pColor = PLAYER_COLORS[boat.owner] || '#fff';
      const ci = Math.min(boat.pathIdx, path.length - 1);
      if (ci > 0) {
        ctx.strokeStyle = pColor + '55'; ctx.lineWidth = Math.max(1, 2 / this.r.zoom);
        ctx.beginPath();
        for (let j = 0; j <= ci; j++) { const px = path[j] % GRID_W, py = (path[j] / GRID_W) | 0; j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
        ctx.stroke();
      }
      if (ci < path.length - 1) {
        ctx.strokeStyle = pColor + '33'; ctx.lineWidth = Math.max(0.5, 1 / this.r.zoom);
        ctx.setLineDash([Math.max(1, 3 / this.r.zoom), Math.max(1, 3 / this.r.zoom)]);
        ctx.beginPath();
        for (let j = ci; j < path.length; j++) { const px = path[j] % GRID_W, py = (path[j] / GRID_W) | 0; j === ci ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      const currIdx = path[ci];
      const nextIdx = path[Math.min(ci + 1, path.length - 1)];
      const cx = currIdx % GRID_W, cy = (currIdx / GRID_W) | 0;
      const nx = nextIdx % GRID_W, ny = (nextIdx / GRID_W) | 0;
      const bx = cx + (nx - cx) * progress;
      const by = cy + (ny - cy) * progress;
      const bs = Math.max(2, 3 / Math.max(1, this.r.zoom * 0.3));
      let angle = 0;
      if (ci < path.length - 1) angle = Math.atan2(ny - cy, nx - cx);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(angle);
      ctx.fillStyle = pColor; ctx.beginPath(); ctx.moveTo(bs, 0); ctx.lineTo(-bs, -bs * 0.7); ctx.lineTo(-bs * 0.4, 0); ctx.lineTo(-bs, bs * 0.7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.3, 0.5 / this.r.zoom); ctx.stroke(); ctx.restore();
      if (this.r.zoom > 1) { ctx.fillStyle = '#fff'; ctx.font = `${Math.max(3, 6 / this.r.zoom)}px monospace`; ctx.textAlign = 'center'; ctx.fillText(formatTroops(boat.troops), bx, by - bs - 2); }
    }
  }

  renderBeachheads(ctx, GRID_W) {
    const bhData = this.r.playerData[0];
    if (bhData && bhData.beachheads) {
      for (const bh of bhData.beachheads) {
        const bx = bh.landingIdx % GRID_W, by = (bh.landingIdx / GRID_W) | 0;
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 300);
        const rad = Math.max(3, 5 / Math.max(1, this.r.zoom * 0.3)) * pulse;
        ctx.beginPath(); ctx.arc(bx, by, rad, 0, Math.PI * 2);
        ctx.strokeStyle = PLAYER_COLORS[0]; ctx.lineWidth = Math.max(0.5, 1 / this.r.zoom);
        ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `${Math.max(3, 6 / this.r.zoom)}px monospace`;
        ctx.textAlign = 'center'; ctx.fillText(formatTroops(bh.troops), bx, by - rad - 2);
      }
    }
  }

  renderPlacementPreviews(ctx, GRID_W, GRID_H) {
    const r = this.r;
    if (r.placementMode === 'defense_post' && r._hoverGx !== undefined) {
      const hx = r._hoverGx, hy = r._hoverGy, hIdx = hy * GRID_W + hx;
      const valid = hx >= 0 && hx < GRID_W && hy >= 0 && hy < GRID_H && r.terrain[hIdx] > 0 && r.grid[hIdx] === 0;
      for (const dp of (r.defensePosts || [])) { if (dp.owner !== 0) continue; const ex = dp.idx % GRID_W, ey = (dp.idx / GRID_W) | 0; ctx.beginPath(); ctx.arc(ex, ey, 20, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(0.5, 1 / r.zoom); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(hx, hy, 20, 0, Math.PI * 2); ctx.fillStyle = valid ? 'rgba(255,255,255,0.15)' : 'rgba(255,68,68,0.2)'; ctx.fill(); ctx.strokeStyle = valid ? 'rgba(255,255,255,0.7)' : '#ff4444cc'; ctx.lineWidth = Math.max(1, 2 / r.zoom); ctx.stroke();
      const sz = Math.max(5, 9 / Math.max(1, r.zoom * 0.3));
      ctx.beginPath(); ctx.arc(hx, hy, sz * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = valid ? PLAYER_COLORS[0] : '#ff4444'; ctx.fill();
      const dpIcon = r._icons.defense_post;
      if (dpIcon && dpIcon.complete) ctx.drawImage(dpIcon, hx - sz / 2, hy - sz / 2, sz, sz);
      if (valid) { ctx.globalAlpha = 0.3; for (let dy = -20; dy <= 20; dy++) for (let dx = -20; dx <= 20; dx++) { if (Math.abs(dx) + Math.abs(dy) > 20) continue; const tx = hx + dx, ty = hy + dy; if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) continue; const ti = ty * GRID_W + tx; if (r.borderMap[ti] && r.grid[ti] === 0) { ctx.fillStyle = (tx + ty) % 2 === 0 ? '#4488ff' : '#2244aa'; ctx.fillRect(tx, ty, 1, 1); } } ctx.globalAlpha = 1; }
    }
    if (r.placementMode === 'city' && r._hoverGx !== undefined) {
      const hx = r._hoverGx, hy = r._hoverGy, hIdx = hy * GRID_W + hx;
      const onOwn = hx >= 0 && hx < GRID_W && hy >= 0 && hy < GRID_H && r.terrain[hIdx] > 0 && r.grid[hIdx] === 0;
      let tooClose = false; const conf = [];
      for (const c of r.cities) { const cx2 = c.idx % GRID_W, cy2 = (c.idx / GRID_W) | 0; if (Math.abs(hx - cx2) + Math.abs(hy - cy2) < 15) { tooClose = true; conf.push(c); } }
      const valid = onOwn && !tooClose;
      const sz = Math.max(6, 10 / Math.max(1, r.zoom * 0.3));
      ctx.beginPath(); ctx.arc(hx, hy, sz * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = valid ? PLAYER_COLORS[0] : '#ff4444'; ctx.fill();
      const cIcon = r._icons.city;
      if (cIcon && cIcon.complete) ctx.drawImage(cIcon, hx - sz / 2, hy - sz / 2, sz, sz);
      for (const c of conf) { const cx2 = c.idx % GRID_W, cy2 = (c.idx / GRID_W) | 0; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cx2, cy2); ctx.strokeStyle = '#ff4444aa'; ctx.lineWidth = Math.max(0.5, 1 / r.zoom); ctx.stroke(); }
      if (valid) { ctx.fillStyle = '#ffd700'; ctx.font = `${Math.max(4, 8 / r.zoom)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('+500 max troops', hx, hy - sz / 2 - 3); }
    }
  }

  renderPlayerLabels(ctx, GRID_W, PLAYER_NAMES) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < this.r.playerData.length; i++) {
      const p = this.r.playerData[i]; if (!p.alive || p.cn === 0) continue;
      const name = i === 0 ? this.r.playerName : PLAYER_NAMES[i];
      const sz = Math.max(8, Math.min(18, Math.sqrt(p.cn) * 0.06)) / Math.max(1, this.r.zoom * 0.5);
      ctx.font = `bold ${sz}px sans-serif`;
      ctx.fillStyle = '#ffffff'; ctx.fillText(name, p.cx, p.cy - sz * 0.35);
      ctx.font = `${(sz * 0.85) | 0}px monospace`;
      ctx.fillStyle = '#ffffffcc'; ctx.fillText(formatTroops(p.troops), p.cx, p.cy + sz * 0.5);
    }
  }
}
