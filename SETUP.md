# Setup & Deployment

## Walkthrough video

Screen capture of the game: https://pxl.cl/b4SkM

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
├── index.html          # Entry point — loads js/main.js as ES module
├── style.css           # Landing overlay styles (in-game UI is canvas-rendered)
├── js/                 # Modularized client code (ES modules)
│   ├── main.js         # Entry point: landing page, Play/Tutorial buttons
│   ├── config.js       # Constants, maps, shared state, utility functions
│   ├── colors.js       # Pre-computed terrain/player/border color palettes
│   ├── grid.js         # Border detection, defended map, distance map, cell painting
│   ├── overlays.js     # Game-world overlays: cities, forts, boats, labels (zoom-space)
│   ├── tutorial.js     # Tutorial steps, completion checks, tooltip rendering
│   ├── input.js        # Mouse, keyboard, touch, wheel event handling
│   ├── hud.js          # Screen-space UI: bottom bar, leaderboard, tooltips, game-over
│   └── renderer.js     # Orchestrator: worker comms, camera, render loop
├── game-worker.js      # Web Worker: game simulation, bot AI, expansion logic
├── icons/              # SVG iconography (city, defense_post, gold, troop)
├── maps/               # Map binaries + manifests with nation spawn points
│   ├── usa/            # USA map (1440×810)
│   ├── indiahd/        # India HD map (1440×1800)
│   └── europe/         # Europe map (1520×960)
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
