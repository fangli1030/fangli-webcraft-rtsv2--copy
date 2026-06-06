// config.js — Game constants, colors, maps, and utility functions

export const CONFIG = {
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

export const PLAYER_COLORS = [
  '#4488ff', '#ff4444', '#44bb44', '#ffaa22', '#cc44cc',
  '#44cccc', '#ff6699', '#bbbb22', '#8855dd', '#cc8844', '#44cc88',
  '#ff8833', '#6644cc', '#cc4488', '#88cc44', '#4466cc',
  '#dd6655', '#55bbaa', '#aa66cc', '#ccaa44', '#6699cc',
];

export const AVAILABLE_MAPS = [
  { id: 'usa', name: 'USA', desc: '1440x810', playerNames: ['You', 'Washington', 'California', 'Montana', 'Colorado', 'Texas', 'Minnesota', 'Illinois', 'Georgia', 'New York', 'Mexico', 'Oregon', 'Idaho', 'Arizona', 'Kansas', 'Ohio', 'Virginia', 'Maine', 'Nebraska', 'Nevada', 'Florida'] },
  { id: 'usa', name: 'India (Small)', desc: '480x600', playerNames: ['You', 'Maurya', 'Chola', 'Mughal', 'Maratha', 'Gupta', 'Rajput', 'Vijayanagara', 'Pallava', 'Sikh Empire', 'Pandya'] },
  { id: 'indiahd', name: 'India (HD)', desc: '1440x1800', playerNames: ['You', 'Maurya', 'Chola', 'Mughal', 'Maratha', 'Gupta', 'Rajput', 'Vijayanagara', 'Pallava', 'Sikh Empire', 'Pandya'] },
  { id: 'europe', name: 'Europe', desc: '1520x960', playerNames: ['You', 'Roman Empire', 'Byzantine', 'Frankish', 'Viking', 'Castile', 'Habsburg', 'Prussian', 'Kievan Rus', 'Ottoman', 'Polish'] },
];

export const BUILD_ITEMS = [
  { key: 'city', label: 'City', icon: '■', hotkey: '1', color: '#ffd700' },
  { key: 'defense_post', label: 'Fort', icon: '◆', hotkey: '2', color: '#ffffff' },
];

// Mutable shared state (mutations visible to all importers via object reference)
export const gameState = {
  GRID_W: CONFIG.WIDTH,
  GRID_H: CONFIG.HEIGHT,
  PLAYER_NAMES: [...AVAILABLE_MAPS[0].playerNames],
  STARTING_POSITIONS: [],
};

// --- Utility functions ---

export function hexToRgb(hex) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

export function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  return (((h ^ (h >> 13)) * 1274126177) & 0x7fffffff) / 0x7fffffff;
}

export const toU32 = (r, g, b) => (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;

export function lerpColor(a, b, t) {
  return { r: (a.r * (1 - t) + b.r * t) | 0, g: (a.g * (1 - t) + b.g * t) | 0, b: (a.b * (1 - t) + b.b * t) | 0 };
}

export function maxTroopsForTiles(t, cityCount) {
  return Math.floor(Math.pow(t, 0.6) * 12 + 150 + (cityCount || 0) * 500);
}

export function formatTroops(n) {
  n = Math.floor(n);
  if (n >= 10000) return (n / 1000).toFixed(0) + 'K';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return '' + n;
}
