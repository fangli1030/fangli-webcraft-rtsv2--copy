// colors.js — Pre-computed color palettes for terrain, players, borders, and defended tiles

import { PLAYER_COLORS, hexToRgb, lerpColor, toU32, hash } from './config.js';

export class ColorPalette {
  constructor() {
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
      const dk = c2 => toU32((c2.r * 0.8) | 0, (c2.g * 0.8) | 0, (c2.b * 0.8) | 0);
      return [0, dk(c), dk(lerpColor(c, tan, 0.15)), dk(lerpColor(c, white, 0.25))];
    });

    this.playerDefBCDark = PLAYER_COLORS.map(hex => {
      const c = hexToRgb(hex);
      const dk = c2 => toU32((c2.r * 0.6) | 0, (c2.g * 0.6) | 0, (c2.b * 0.6) | 0);
      return [0, dk(c), dk(lerpColor(c, tan, 0.15)), dk(lerpColor(c, white, 0.25))];
    });

    const terrainRgb = [null, { r: 110, g: 158, b: 72 }, { r: 186, g: 166, b: 108 }, { r: 210, g: 206, b: 198 }];
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
}

/**
 * Initialize the water color buffer for an entire map.
 */
export function buildWaterColors(terrain, GRID_W, GRID_H) {
  const waterC = new Uint32Array(GRID_W * GRID_H);
  const coast = new Uint8Array(GRID_W * GRID_H);
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const i = y * GRID_W + x; if (terrain[i] > 0) continue;
    if ((x > 0 && terrain[i - 1] > 0) || (x < GRID_W - 1 && terrain[i + 1] > 0) ||
      (y > 0 && terrain[i - GRID_W] > 0) || (y < GRID_H - 1 && terrain[i + GRID_W] > 0)) coast[i] = 1;
  }
  const coast2 = new Uint8Array(coast);
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const i = y * GRID_W + x; if (terrain[i] > 0 || coast[i]) continue;
    if ((x > 0 && coast[i - 1]) || (x < GRID_W - 1 && coast[i + 1]) ||
      (y > 0 && coast[i - GRID_W]) || (y < GRID_H - 1 && coast[i + GRID_W])) coast2[i] = 1;
  }
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const i = y * GRID_W + x; if (terrain[i] > 0) continue;
    if (coast[i]) waterC[i] = toU32(70, 115, 155);
    else if (coast2[i]) waterC[i] = toU32(55, 95, 140);
    else { const v = (hash(x * 3, y * 3) * 6) | 0, d = (hash(x, y) * 4) | 0; waterC[i] = toU32(40 + v, 75 + v + d, 120 + v + d); }
  }
  return waterC;
}
