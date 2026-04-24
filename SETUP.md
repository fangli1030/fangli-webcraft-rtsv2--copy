# Setup & Deployment

## Prerequisites

- Node.js >= 14 (only used to run a static file server — no compile step)
- A modern browser (Chrome, Safari, Firefox)

## Local Development

This is a fully static site with no build step. Serve the directory with any static file server:

```bash
npx serve -l 3000
```

Then open `http://localhost:3000` in your browser. The game starts immediately.

That's it — no `npm install`, no env vars, no backend.

## Project Structure

```
.
├── index.html          # Entry point — minimal HTML shell
├── style.css           # Landing overlay styles only (in-game UI is canvas-rendered)
├── game.js             # Main thread: rendering, input, HUD, animations
├── game-worker.js      # Web Worker: game simulation, bot AI, expansion logic
├── icons/              # SVG iconography (city, defense_post, gold, troop)
├── maps/usa/           # USA map binary + manifest with nation spawn points
│   ├── map.bin         # 1 byte/tile terrain data (1440x810 = 1.16 MB)
│   └── manifest.json   # Map dimensions, land tile count, nation spawn coords
├── tools/              # Offline map generation scripts (Python)
└── vercel.json         # Vercel static deployment config
```

## Environment Variables

None. The game runs entirely client-side with no API keys, accounts, or external services.

## Deployment

Deployed to Vercel as a static site:

```bash
vercel --prod --yes
```

Live URL: https://anujvarma-webcraft-rts-claude.vercel.app

## External Services

None.

## Browser Compatibility

- Tested on Chrome and Safari (desktop)
- Touch support: pan/tap and pinch-to-zoom on mobile
- Requires Canvas 2D and Web Workers (universally supported in modern browsers)
