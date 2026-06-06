// tutorial.js — Tutorial system with step-by-step guidance

import { CONFIG, gameState } from './config.js';

export class TutorialManager {
  constructor(renderer) {
    this.r = renderer;
    this._step = 0;
    this._completed = {};
    this._steps = [
      { id: 'welcome', title: 'Welcome to Meta RTS!', text: "Let's learn the basics. Click to continue.", completionType: 'click_anywhere', highlight: null },
      { id: 'camera', title: 'Camera Controls', text: 'Use WASD to pan and scroll to zoom.', completionType: 'camera_controls', highlight: null },
      { id: 'expand', title: 'Expand Your Territory', text: 'Click unclaimed land near your border to expand.', completionType: 'expand_click', highlight: 'border' },
      { id: 'attack', title: 'Attack Enemies', text: 'Click enemy territory to attack!', completionType: 'attack_click', highlight: 'enemy_border' },
      { id: 'city_select', title: 'Build a City', text: 'Click the City button or press 1.', completionType: 'city_selected', highlight: 'build_btn_city' },
      { id: 'city_place', title: 'Place Your City', text: 'Click inside your territory to place it. Cities increase max troops.', completionType: 'city_placed', highlight: null },
      { id: 'dpost_select', title: 'Build a Defense Post', text: 'Click the Def Post button or press 2.', completionType: 'dpost_selected', highlight: 'build_btn_dpost' },
      { id: 'dpost_place', title: 'Place Your Defense Post', text: 'Click on your border to place it. They protect your territory.', completionType: 'defense_post_placed', highlight: null },
    ];
    if (CONFIG.BOATS_ENABLED) {
      this._steps.push({ id: 'boats', title: 'Send Boats', text: 'Right-click enemy territory across water to send troops by boat. Pan around to find enemy territory across water.', completionType: 'boat_launched', highlight: null });
    }
    this._steps.push({ id: 'complete', title: 'Tutorial Complete!', text: "You're ready! Good luck. Click to dismiss.", completionType: 'click_anywhere', highlight: null });
  }

  init() {
    this._step = 0;
    this._completed = {};
  }

  currentStep() {
    return this._steps[this._step] || null;
  }

  checkCompletion(trigger, data) {
    if (!this.r._tutorialActive) return;
    const step = this.currentStep();
    if (!step) return;

    let shouldAdvance = false;

    switch (step.completionType) {
      case 'click_anywhere':
        if (trigger === 'click') shouldAdvance = true;
        break;
      case 'camera_controls':
        if (trigger === 'wasd') this._completed.wasd = true;
        if (trigger === 'scroll') this._completed.scroll = true;
        if (this._completed.wasd && this._completed.scroll) shouldAdvance = true;
        break;
      case 'expand_click':
        if (trigger === 'click' && data && this.r.grid) {
          const idx = data.gy * this.r.GRID_W + data.gx;
          if (this.r.grid[idx] === -1) shouldAdvance = true;
        }
        break;
      case 'attack_click':
        if (trigger === 'click' && data && this.r.grid) {
          const idx = data.gy * this.r.GRID_W + data.gx;
          if (this.r.grid[idx] >= 1) shouldAdvance = true;
        }
        break;
      case 'slider_drag':
        if (trigger === 'slider') shouldAdvance = true;
        break;
      case 'city_selected':
        if (trigger === 'tick' && this.r.placementMode === 'city') shouldAdvance = true;
        break;
      case 'dpost_selected':
        if (trigger === 'tick' && this.r.placementMode === 'defense_post') shouldAdvance = true;
        break;
      case 'city_placed':
      case 'defense_post_placed':
      case 'boat_launched':
        if (trigger === 'tick') {
          if (step.completionType === 'city_placed' && this.r.cities.filter(c => c.owner === 0).length > (this._completed.cityCount || 0)) shouldAdvance = true;
          if (step.completionType === 'defense_post_placed' && this.r.defensePosts.filter(d => d.owner === 0).length > (this._completed.dpostCount || 0)) shouldAdvance = true;
          if (CONFIG.BOATS_ENABLED && step.completionType === 'boat_launched' && this.r.boats.filter(b => b.owner === 0).length > (this._completed.boatCount || 0)) shouldAdvance = true;
        }
        break;
    }

    if (shouldAdvance) this._advance();
  }

  _advance() {
    this._step++;
    this._completed = {};

    // Save baseline counts for tick-based detection
    this._completed.cityCount = this.r.cities.filter(c => c.owner === 0).length;
    this._completed.dpostCount = this.r.defensePosts.filter(d => d.owner === 0).length;
    if (CONFIG.BOATS_ENABLED) {
      this._completed.boatCount = this.r.boats.filter(b => b.owner === 0).length;
    }

    // Grant gold for building steps
    const step = this.currentStep();
    if (step && (step.id === 'city_select' || step.id === 'dpost_select')) {
      if (this.r.worker) this.r.worker.postMessage({ type: 'grant_gold', amount: 200 });
    }

    // End tutorial on final step completion
    if (this._step >= this._steps.length) {
      this.r._tutorialActive = false;
    }
  }

  render() {
    if (this.r.gameOver) {
      this.r._tutorialActive = false;
      return;
    }

    const ctx = this.r.ctx;
    const step = this.currentStep();
    if (!step) return;

    // Text box dimensions and position
    const boxW = 420, boxH = 100;
    const boxX = (this.r.canvas.width - boxW) / 2;
    const boxY = 60;

    // Calculate highlight rect
    let highlightRect = null;
    if (step.highlight) {
      if (step.highlight === 'border' || step.highlight === 'enemy_border') {
        const pd = this.r.playerData[0];
        if (pd && pd.centroid) {
          const screenX = (pd.centroid.x - this.r.camX) * this.r.zoom;
          const screenY = (pd.centroid.y - this.r.camY) * this.r.zoom;
          const size = Math.max(100, 200 / this.r.zoom);
          highlightRect = { x: screenX - size / 2, y: screenY - size / 2, w: size, h: size };
        }
      } else if (step.highlight === 'build_btn_city') {
        const bp = this.r._uiPositions.buildButtons && this.r._uiPositions.buildButtons['city'];
        if (bp) highlightRect = { x: bp.x, y: bp.y, w: bp.w, h: bp.h };
      } else if (step.highlight === 'build_btn_dpost') {
        const bp = this.r._uiPositions.buildButtons && this.r._uiPositions.buildButtons['defense_post'];
        if (bp) highlightRect = { x: bp.x, y: bp.y, w: bp.w, h: bp.h };
      }
    }

    // Draw dimming overlay
    if (highlightRect) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.r.canvas.width, this.r.canvas.height);
      ctx.rect(boxX, boxY + boxH, boxW, -(boxH));
      ctx.rect(highlightRect.x, highlightRect.y + highlightRect.h, highlightRect.w, -(highlightRect.h));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fill('evenodd');
      ctx.restore();
    }

    // Draw text box background
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
    ctx.fillText(`${this._step + 1}/${this._steps.length}`, boxX + boxW - 12, boxY + 10);

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

    // Draw highlight border and arrow
    if (highlightRect) {
      const pulse = Math.sin(performance.now() / 500) * 0.3 + 0.7;
      ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.rect(highlightRect.x, highlightRect.y, highlightRect.w, highlightRect.h);
      ctx.stroke();
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
}
