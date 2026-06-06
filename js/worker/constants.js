// worker/constants.js — Shared constants and utility functions for the game worker

export const T_WATER = 0, T_PLAINS = 1, T_HIGHLAND = 2, T_MOUNTAIN = 3;
export const WILD_COST = [0, 0.05, 0.1, 0.2];
export const ENEMY_BASE_COST = [0, 0.3, 0.5, 0.9];
export const CITY_COST = 50;
export const CITY_TROOP_BONUS = 500;
export const CITY_MIN_DIST = 15;
export const DPOST_RANGE = 20;
export const DPOST_DEFENSE_MULT = 4;
export const DPOST_SPEED_PENALTY = 2;
export const FARM_COST = 30;
export const MINE_COST = 50;
export const MILL_COST = 60;
export const FACTORY_COST = 80;
export const ECON_RADIUS = 12;
export const MILL_RADIUS = 15;
export const FARM_BASE_GOLD = 0.02;
export const MINE_BASE_GOLD = 0.03;
export const MILL_BOOST = 0.5;
export const FACTORY_BOOST = 0.5;
export const MILL_STACK_PENALTY = 0.4;
export const FACTORY_STACK_PENALTY = 0.4;
export const MAX_BOATS = 3;
export const BOAT_TROOP_FRACTION = 0.2;
export const COST_SCALE = 100;

export function maxTroopsForTiles(t, cityCount) {
  return Math.floor(Math.pow(t, 0.6) * 12 + 150 + (cityCount || 0) * CITY_TROOP_BONUS);
}

export function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  return (((h ^ (h >> 13)) * 1274126177) & 0x7fffffff) / 0x7fffffff;
}

export function smoothNoise(x, y, s) {
  const sx = x / s, sy = y / s, ix = Math.floor(sx), iy = Math.floor(sy);
  const fx = sx - ix, fy = sy - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function isPointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
