// worker/bots.js — Bot AI: target selection, attack decisions, building placement

import { state as s } from './state.js';
import { maxTroopsForTiles } from './constants.js';
import { tryPlaceCity, cityCost, tryPlaceDefensePost, dpostCost } from './buildings.js';

const BOT_STRATEGIES = [
  null, 'aggressive', 'aggressive', 'aggressive', 'aggressive',
  'defensive', 'defensive', 'defensive', 'balanced', 'balanced', 'balanced',
  'aggressive', 'aggressive', 'defensive', 'defensive', 'balanced',
  'balanced', 'aggressive', 'defensive', 'balanced', 'aggressive',
];

export function botThinkAllAt(now) {
  const bordered = Array.from({ length: s.playerStates.length }, () => new Set());
  let needsBorders = false;
  const startIdx = s.isSpectateMode ? 0 : 1;
  for (let i = startIdx; i <= s.NUM_BOTS; i++) {
    const ps = s.playerStates[i];
    if (ps.alive && now >= ps.nextAttackTick) needsBorders = true;
  }
  if (!needsBorders) return;

  for (let i = 0; i < s.playerStates.length; i++) {
    const ps = s.playerStates[i]; if (!ps.alive) continue;
    for (const idx of ps.borderTiles) {
      const x = idx % s.GRID_W, y = (idx / s.GRID_W) | 0;
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || nx >= s.GRID_W || ny < 0 || ny >= s.GRID_H) continue;
        const no = s.grid[ny * s.GRID_W + nx];
        if (no !== i && s.terrain[ny * s.GRID_W + nx] > 0) bordered[i].add(no);
      }
    }
  }
  for (let i = startIdx; i <= s.NUM_BOTS; i++) {
    if (now >= s.playerStates[i].nextAttackTick) botThinkSingle(i, bordered[i], now);
  }
}

export function botThinkAll() {
  botThinkAllAt(performance.now());
}

function botThinkSingle(id, borders, now) {
  const ps = s.playerStates[id]; if (!ps.alive) return;
  ps.nextAttackTick = now + ps.attackCooldown;

  let max = maxTroopsForTiles(ps.cellCount, ps.cityCount);
  max = Math.floor(max * 0.7);

  if (ps.gold >= cityCost(ps.cityCount) && ps.cellCount > (s.isSpectateMode ? 20 : 50)) tryPlaceCity(id);
  const dpCost = dpostCost(ps.dpostCount);
  if (ps.gold >= dpCost && ps.cellCount > (s.isSpectateMode ? 15 : 30) && Math.random() < (s.isSpectateMode ? 0.6 : 0.3)) tryPlaceDefensePost(id);

  if (ps.expanding && ps.attackTarget !== null) {
    if (ps.attackTroops < 1 || !borders.has(ps.attackTarget)) {
      ps.troops += ps.attackTroops; ps.attackTroops = 0;
      ps.expanding = false; ps.attackTarget = null;
    }
    if (ps.attackTarget !== null && ps.attackTarget >= 0 && ps.attackTarget < s.playerStates.length && !s.playerStates[ps.attackTarget].alive) {
      ps.troops += ps.attackTroops; ps.attackTroops = 0;
      ps.expanding = false; ps.attackTarget = null;
    }
    return;
  }

  const hasWild = borders.has(-1);

  if (s.isSpectateMode) {
    const enemies = [...borders]
      .filter(o => o >= 0 && o < s.playerStates.length && s.playerStates[o].alive)
      .sort((a, b) => s.playerStates[a].troops - s.playerStates[b].troops);

    if (enemies.length > 0 && ps.troops > max * 0.05) {
      const target = Math.random() < 0.4 && enemies.length > 1
        ? enemies[Math.floor(Math.random() * enemies.length)]
        : enemies[0];
      botSetAttack(ps, target, Math.max(1, Math.floor(ps.troops * 0.85)));
      return;
    }

    if (hasWild && ps.troops > 1) {
      botSetAttack(ps, -1, Math.floor(ps.troops * 0.9));
    }
    return;
  }

  if (hasWild && ps.troops > max * 0.1) {
    const wildRatio = 0.08;
    const send = Math.floor(ps.troops * wildRatio);
    if (send >= 1) {
      botSetAttack(ps, -1, send);
      return;
    }
  }

  if (ps.troops < max * ps.reserveRatio) return;
  if (ps.troops < max * ps.triggerRatio && Math.random() > 0.1) return;

  const enemies = [...borders]
    .filter(o => o >= 0 && s.playerStates[o].alive && s.playerStates[o].troops < ps.troops)
    .sort((a, b) => s.playerStates[a].troops - s.playerStates[b].troops);

  if (enemies.length === 0) return;

  const target = enemies[0];
  const reserve = Math.floor(max * ps.reserveRatio);
  const send = Math.max(1, Math.floor(ps.troops - reserve));
  botSetAttack(ps, target, send);
}

function botSetAttack(ps, target, send) {
  for (const a of ps.attacks) ps.troops += a.troops;
  ps.attacks = [];
  if (send >= 1 && ps.troops >= send) {
    ps.troops -= send;
    ps.attacks.push({ target, troops: send });
  }
}
