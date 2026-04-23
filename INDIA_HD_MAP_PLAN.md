# India HD Map — Implementation Plan

**Goal**: Replace the current low-fidelity India map (hand-drawn polygon + JSON terrain) with a real DEM-derived map produced via OpenFront's existing map-generator pipeline. Same in-game format/feel as OpenFront's `sanfrancisco`/`newyorkcity` maps.

**Scope decided with user**:
- **Option A** — *replace*, don't add alongside. Delete `INDIA_OUTLINE`, `SRI_LANKA_OUTLINE`, `terrain_data.js`, `india_terrain.json`.
- Bbox **stretches east to include Andaman & Nicobar Islands**.
- Spawns are **historical empire capitals** (Maurya → Pataliputra, etc.).

---

## Critical pre-verified facts (don't rediscover these)

### 1. Use OpenFront's prebuilt generator binary — DON'T write your own bit-packer
- **Binary**: `/Users/anujvarma/desktop/website/OpenFrontIO/map-generator/map-generator` (Mach-O arm64, prebuilt, runs on this machine — verified). Go is **not** installed; use the binary.
- It takes `assets/maps/<name>/image.png` + `info.json` and emits `map.bin`, `map4x.bin`, `map16x.bin`, `manifest.json`, `thumbnail.webp` into `OpenFrontIO/resources/maps/<name>/`.
- Source code reference: `OpenFrontIO/map-generator/map_generator.go`. README: `OpenFrontIO/map-generator/README.md`.

### 2. Bit format (verified against `OpenFrontIO/src/core/game/GameMap.ts:91-95` AND raw `sanfrancisco/map16x.bin` bytes)
Each byte: `[is_land:bit7] [shoreline:bit6] [ocean:bit5] [magnitude:bits0-4]`
- **Magnitude is 0–30**, NOT 0–31 (31 reserved).
- Water tiles' magnitude = **distance to nearest land** (computed by generator's `processWater`), not 0.
- Shoreline bit can be on either land or water tiles (marks the boundary).

### 3. Generator input format (PNG, blue-channel encoding only)
From `map_generator.go` lines ~54-66:
- `alpha < 20` OR `blue == 106` → water
- `blue 140–158` → plains (mag 0–9)
- `blue 159–178` → highlands (mag 10–19)
- `blue 179–200` → mountains (mag 20–30)
- `blue < 140` clamps to plains; `blue > 200` clamps to mountains
- Red and green channels are ignored — grayscale works too.

### 4. Pixel budget
Recommended PNG size: **2–3 million pixels area** (`minRecommendedPixelSize`/`maxRecommendedPixelSize` in `map_generator.go`). **Target: 1600×1600 = 2.56M.** Generator auto-crops to multiples of 4. Max ~3M land tiles for performance.

### 5. info.json schema (verified from sanfrancisco)
```json
{
  "name": "IndiaHD",
  "nations": [
    { "coordinates": [x, y], "name": "Maurya", "flag": "in" }
  ]
}
```
- `coordinates`: pixel x/y, origin top-left, 0-indexed.
- `flag`: ISO 3166 code from `OpenFrontIO/src/client/data/countries.json`. `"in"` = India, supported.

---

## Python environment gotcha

**Verified**: this machine's `python3` (`/usr/local/bin/python3`) is Meta's `fbcode platform010` Python 3.12 with **no `pip` module**. `pip3` (`/usr/bin/pip3`) is Xcode's bundled Python 3.9 — installs to a different env, not visible to `python3`.

**Resolution path** (try in order, stop at first success):
1. `brew install python@3.12` then use `/opt/homebrew/bin/python3.12 -m pip install Pillow numpy requests` and run script with `/opt/homebrew/bin/python3.12`. **Note**: this was started during planning and interrupted — may already be partially installed.
2. If brew install fails, use `/usr/bin/python3` (Xcode's 3.9) directly: `pip3 install --user Pillow numpy requests` then `/usr/bin/python3 build_india_map.py`. Pillow 10+ requires Python 3.8+ so 3.9 is fine.
3. Last resort: `python3 -m ensurepip --user` to bootstrap pip into the fbcode Python.

---

## Bbox & geographic parameters

**Lat/lon extent**: 6.0°N to 37.0°N, 67.0°E to **94.0°E** (extended east from 95°E plan to ~94°E to keep aspect manageable; need to verify Andaman covered).

**Andaman & Nicobar coverage**: Andaman Islands ~6.7°N–13.7°N, ~92.2°E–94.0°E. Nicobars ~6.5°N–9.2°N, ~92.7°E–93.9°E. **Both fit within bbox above.** Indian mainland east edge is ~92.5°E (Arunachal). So bbox 67°E–94°E captures everything.

**Aspect ratio**: 27° lon × 31° lat. At 23°N mean latitude, lon-degree ≈ 102 km, lat-degree ≈ 111 km, so **~2754 km × 3441 km** ≈ **0.80:1** (W:H).
- Target PNG: **1440×1800** (2.59M pixels, fits budget). Both divisible by 4 (generator requirement).
- Resolution: ~1.9 km/px. Mumbai metro ≈ 30 px wide; Andaman main island ≈ 100 px tall. Acceptable for continental scale.

**Linear lat/lon → pixel** (origin top-left, y increases south):
```
x_px = (lon - 67.0) / 27.0 * 1440
y_px = (37.0 - lat) / 31.0 * 1800
```

This is approximate (no Mercator/UTM correction) — fine at this scale, the visual distortion across India is <2%.

---

## Historical capital spawns (11 entries, matches NUM_BOTS=10 + player)

Mapped via the formula above. **Verify these against the rendered PNG before locking in** — if any land on water due to coastline rasterization noise, nudge by ±2 px.

| Empire        | Capital       | Lat (°N)  | Lon (°E)  | Pixel (x, y) |
|---------------|---------------|-----------|-----------|--------------|
| You (default) | Mumbai        | 19.08     | 72.88     | (313, 1041)  |
| Maurya        | Pataliputra (Patna) | 25.59 | 85.14   | (967, 663)   |
| Chola         | Thanjavur     | 10.79     | 79.14     | (647, 1523)  |
| Mughal        | Delhi         | 28.61     | 77.21     | (544, 488)   |
| Maratha       | Pune          | 18.52     | 73.86     | (366, 1074)  |
| Gupta         | Ujjain        | 23.18     | 75.78     | (468, 803)   |
| Rajput        | Chittorgarh   | 24.88     | 74.63     | (407, 704)   |
| Vijayanagara  | Hampi         | 15.33     | 76.46     | (504, 1259)  |
| Pallava       | Kanchipuram   | 12.84     | 79.70     | (677, 1404)  |
| Sikh Empire   | Amritsar      | 31.63     | 74.87     | (419, 313)   |
| Pandya        | Madurai       | 9.93      | 78.12     | (593, 1573)  |

These **replace** `STARTING_POSITIONS` and `PLAYER_NAMES` in `game.js:20-29`. Names already match — they were chosen to match these empires originally.

---

## Pipeline (execution steps)

### Step 1: Write `tools/build_india_map.py`
Location: `/Users/anujvarma/desktop/website/anujvarma-webcraft-rts/tools/build_india_map.py`

Logic:
1. Compute Web Mercator tile range for bbox at zoom 6 (gives ~64 tiles, plenty of detail when downsampled to 1440×1800).
2. Fetch Terrarium tiles from `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. Public domain (Mapzen → AWS). No API key. Tile size 256×256.
3. Decode elevation per pixel: `elev_m = (R * 256 + G + B / 256.0) - 32768.0`
4. Stitch tiles into mosaic, project-crop to bbox, resample to **1440×1800** with `Pillow.Image.Resampling.LANCZOS`.
5. Build output RGBA where:
   - Water (`elev <= 0`): RGBA `(0, 0, 0, 0)` — transparent triggers water.
   - Land: RGB where blue = `int(np.clip(140 + elev * (60.0 / max_elev), 140, 200))`. R=G=blue (grayscale), A=255.
   - Use `max_elev = 4000.0` (truncates Himalayan extremes a bit but spreads detail across populated elevations; Mt. Everest at 8848m would otherwise compress lowland detail to nothing).
6. Save as `OpenFrontIO/map-generator/assets/maps/indiahd/image.png`.

### Step 2: Write `info.json`
Path: `OpenFrontIO/map-generator/assets/maps/indiahd/info.json`
Use the 11 spawns table above. Name = `"IndiaHD"`. All flags = `"in"`.

### Step 3: Register the map in OpenFront's generator
Edit `/Users/anujvarma/desktop/website/OpenFrontIO/map-generator/main.go` — add `{Name: "indiahd"},` to the `maps` slice. Or skip this and run `--maps=indiahd` directly (the binary may require registration; if so, edit main.go and the prebuilt binary won't see the change → would need Go to rebuild → fall back to editing main.go and using Go via `brew install go`). **Verify if prebuilt binary accepts unregistered map names via `--maps=` flag first** — if yes, skip the source edit.

### Step 4: Run the generator
```bash
cd /Users/anujvarma/desktop/website/OpenFrontIO/map-generator
./map-generator --maps=indiahd --verbose
```
Output lands in `OpenFrontIO/resources/maps/indiahd/`.

Sanity-check expected output:
- `map.bin` should be ~1440 × 1800 = 2.6 MB (1 byte/tile)
- `map4x.bin` ~648 KB
- `map16x.bin` ~162 KB
- `manifest.json` should report `num_land_tiles` ≈ 1.0–1.4M (India landmass / total area ratio × 2.6M, minus oceans)
- `thumbnail.webp` should visually look like India

### Step 5: Copy assets into the game
```bash
mkdir -p /Users/anujvarma/desktop/website/anujvarma-webcraft-rts/maps/indiahd
cp /Users/anujvarma/desktop/website/OpenFrontIO/resources/maps/indiahd/* \
   /Users/anujvarma/desktop/website/anujvarma-webcraft-rts/maps/indiahd/
```

### Step 6: Replace map loading in `game.js`

**⚠️ COORDINATE BEFORE TOUCHING `game.js`** — another session may be editing this file. Confirm with the user before this step.

Required edits:
1. **Delete** `INDIA_OUTLINE` constant (`game.js:30-73`) and `SRI_LANKA_OUTLINE` (`game.js:74-78`).
2. **Delete** `STARTING_POSITIONS` constant (`game.js:24-29`) — coordinates come from manifest now.
3. **Delete** the `<script src="terrain_data.js">` reference in `index.html` and the file itself.
4. **Change** `CONFIG.WIDTH/HEIGHT` (`game.js:1-11`) from constants to values loaded from `manifest.json`. The grid sizes (`GRID_W`/`GRID_H` at `game.js:13-14`) need to be initialized after manifest loads, not at module load time.
5. **Add** an async loader:
   ```js
   async function loadMap(name) {
     const manifest = await fetch(`maps/${name}/manifest.json`).then(r => r.json());
     const buf = await fetch(`maps/${name}/map.bin`).then(r => r.arrayBuffer());
     return { manifest, terrain: new Uint8Array(buf) };
   }
   ```
6. **Replace** terrain initialization. Currently the code rasterizes `INDIA_OUTLINE` polygon into a grid. New flow: decode each byte of `terrain` Uint8Array:
   ```js
   const IS_LAND = (b) => (b >> 7) & 1;
   const IS_SHORELINE = (b) => (b >> 6) & 1;
   const IS_OCEAN = (b) => (b >> 5) & 1;
   const MAGNITUDE = (b) => b & 0x1f;
   ```
   Map land/water → existing `terrainC` colors. Use magnitude to interpolate between flat green and mountain tan/white if desired.
7. **Replace** spawn position logic. Read `manifest.nations[]`, use `coordinates[0]` as gx, `coordinates[1]` as gy. Map manifest indices to existing PLAYER_NAMES (Mumbai/You first, then Maurya/Chola/etc. in the order in info.json — verify order matches).
8. **Worker side** (`game-worker.js`): the worker receives the terrain via `postMessage` from the main thread (see `game.js:213` for the existing init message shape). Add `terrain: <Uint8Array>` to that message; remove `indiaOutline`/`sriLankaOutline`/`mapScale`/`mapOffsetX`. Worker side rebuilds its grid from the bytes.

### Step 7: Cleanup
After Step 6 verified working:
- Delete `india_terrain.json`
- Delete `terrain_data.js`
- Remove `<script src="terrain_data.js">` from `index.html`
- Remove `MAP_SCALE`/`MAP_OFFSET_X` (`game.js:79-80`) if unused after polygon rasterizer is gone

---

## Verification checklist after running

- [ ] `manifest.json` width=1440, height=1800
- [ ] `num_land_tiles` between 800K and 1.5M (sanity range for India landmass)
- [ ] `thumbnail.webp` opens and looks like India (subcontinental shape, Sri Lanka teardrop, Andaman dots)
- [ ] All 11 spawn coords land on `is_land=1` tiles in `map.bin` (write a quick verifier — load .bin, check byte at `y*1440+x` for each spawn, bit 7 should be set)
- [ ] In-game: zoom-to-fit shows full subcontinent, Sri Lanka visible, can see Western Ghats and Himalayan elevation as color variation
- [ ] Each empire spawns at its historical capital (Mughal in Delhi, Chola in Thanjavur, etc.)
- [ ] Lake Wular / Chilika Lake render as inland water (not ocean) — confirms `processWater` flood-fill worked

---

## License/attribution

Add to a `CREDITS.md` or similar in the project:
- Elevation data: AWS Terrain Tiles (Terrarium format), public domain (Mapzen, released to public domain via CC0).
- Map generator: OpenFrontIO (GPL-3.0). Since we're using their *binary* to bake assets but not redistributing the binary, and the resulting `.bin` is just data derived from PD elevation, the asset itself is PD. Verify this interpretation if planning to open-source.

---

## Open items left for the executor

1. **Confirm the prebuilt `map-generator` binary accepts `--maps=indiahd` without source edit.** Try first; if it errors with "unknown map," fall back to editing `main.go` + `brew install go` + `go run .`.
2. **Verify spawn pixel coords land on land tiles** (post-generation check). Adjust by ±5 px if any falls in water due to coastline rasterization noise.
3. **`max_elev` tuning** in the PNG bake (suggested 4000m) — visualize the thumbnail and adjust if mountains look too washed out or lowlands look monotone.
4. **Coordinate with user on `game.js` edits** if another session is touching that file.
5. **Decide on map orientation conventions** — manifest origin is top-left (y increases south). Confirm `game.js` rendering expects the same. Current `INDIA_OUTLINE` uses y-down too (Patna at y≈80, Kanyakumari at y≈700), so it should match.
