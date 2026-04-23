#!/usr/bin/env python3
"""Build India HD heightmap PNG from AWS Terrarium elevation tiles."""

import math
import io
import numpy as np
from PIL import Image
import requests

# --- Config ---
LAT_MIN, LAT_MAX = 6.0, 37.0
LON_MIN, LON_MAX = 67.0, 94.0
OUT_W, OUT_H = 1440, 1800
ZOOM = 6
TILE_SIZE = 256
MAX_ELEV = 4000.0
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
OUT_PATH = "/Users/anujvarma/Desktop/website/OpenFrontIO/map-generator/assets/maps/indiahd/image.png"

def lat_lon_to_tile(lat, lon, zoom):
    n = 2 ** zoom
    x = int((lon + 180) / 360 * n)
    lat_rad = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n)
    return x, y

def tile_to_lat_lon(x, y, zoom):
    n = 2 ** zoom
    lon = x / n * 360 - 180
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * y / n)))
    lat = math.degrees(lat_rad)
    return lat, lon

def fetch_tile(z, x, y):
    url = TILE_URL.format(z=z, x=x, y=y)
    print(f"  Fetching tile z={z} x={x} y={y}...")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content))

def main():
    print(f"Building India HD map: {OUT_W}x{OUT_H}")
    print(f"Bbox: lat [{LAT_MIN}, {LAT_MAX}], lon [{LON_MIN}, {LON_MAX}]")

    # Compute tile range
    tx_min, ty_max = lat_lon_to_tile(LAT_MIN, LON_MIN, ZOOM)
    tx_max, ty_min = lat_lon_to_tile(LAT_MAX, LON_MAX, ZOOM)
    # ty is inverted (0 = north pole)
    print(f"Tile range: x=[{tx_min},{tx_max}], y=[{ty_min},{ty_max}]")

    # Fetch and stitch tiles
    mosaic_w = (tx_max - tx_min + 1) * TILE_SIZE
    mosaic_h = (ty_max - ty_min + 1) * TILE_SIZE
    print(f"Mosaic size: {mosaic_w}x{mosaic_h} from {(tx_max-tx_min+1)*(ty_max-ty_min+1)} tiles")

    mosaic = np.zeros((mosaic_h, mosaic_w, 3), dtype=np.uint8)

    for ty in range(ty_min, ty_max + 1):
        for tx in range(tx_min, tx_max + 1):
            try:
                tile_img = fetch_tile(ZOOM, tx, ty)
                tile_arr = np.array(tile_img.convert('RGB'))
                py = (ty - ty_min) * TILE_SIZE
                px = (tx - tx_min) * TILE_SIZE
                mosaic[py:py+TILE_SIZE, px:px+TILE_SIZE] = tile_arr
            except Exception as e:
                print(f"  Warning: failed to fetch tile {tx},{ty}: {e}")

    # Decode elevation: elev = (R * 256 + G + B / 256) - 32768
    print("Decoding elevation...")
    elev = mosaic[:,:,0].astype(np.float64) * 256.0 + mosaic[:,:,1].astype(np.float64) + mosaic[:,:,2].astype(np.float64) / 256.0 - 32768.0

    # Compute pixel coords for bbox in the mosaic
    top_lat, left_lon = tile_to_lat_lon(tx_min, ty_min, ZOOM)
    bot_lat, right_lon = tile_to_lat_lon(tx_max + 1, ty_max + 1, ZOOM)
    print(f"Mosaic covers: lat [{bot_lat:.2f}, {top_lat:.2f}], lon [{left_lon:.2f}, {right_lon:.2f}]")

    # Map our bbox to pixel coords in the mosaic
    def lon_to_px(lon):
        return (lon - left_lon) / (right_lon - left_lon) * mosaic_w
    def lat_to_py(lat):
        # Need to account for Mercator projection
        def merc(l):
            return math.log(math.tan(math.pi/4 + math.radians(l)/2))
        merc_top = merc(top_lat)
        merc_bot = merc(bot_lat)
        return (merc_top - merc(lat)) / (merc_top - merc_bot) * mosaic_h

    x0 = int(lon_to_px(LON_MIN))
    x1 = int(lon_to_px(LON_MAX))
    y0 = int(lat_to_py(LAT_MAX))
    y1 = int(lat_to_py(LAT_MIN))
    print(f"Crop region in mosaic: x=[{x0},{x1}], y=[{y0},{y1}]")

    # Crop elevation to bbox
    elev_crop = elev[max(0,y0):min(mosaic_h,y1), max(0,x0):min(mosaic_w,x1)]
    print(f"Cropped elevation shape: {elev_crop.shape}")

    # Resize to target
    elev_img = Image.fromarray(elev_crop)
    elev_img = elev_img.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
    elev_final = np.array(elev_img)
    print(f"Resized to {OUT_W}x{OUT_H}")
    print(f"Elevation range: {elev_final.min():.1f} to {elev_final.max():.1f} meters")

    # Build output RGBA
    out = np.zeros((OUT_H, OUT_W, 4), dtype=np.uint8)

    # Water: transparent (alpha=0)
    water = elev_final <= 0
    land = ~water

    # Land: blue channel encodes elevation
    # blue = clip(140 + elev * 60 / MAX_ELEV, 140, 200)
    blue = np.clip(140 + elev_final * (60.0 / MAX_ELEV), 140, 200).astype(np.uint8)
    out[land, 0] = blue[land]  # R
    out[land, 1] = blue[land]  # G
    out[land, 2] = blue[land]  # B
    out[land, 3] = 255         # A = opaque

    # Water stays RGBA(0,0,0,0)

    # Stats
    land_count = np.sum(land)
    water_count = np.sum(water)
    print(f"Land pixels: {land_count:,} ({land_count/(OUT_W*OUT_H)*100:.1f}%)")
    print(f"Water pixels: {water_count:,}")

    # Save
    img_out = Image.fromarray(out, 'RGBA')
    img_out.save(OUT_PATH)
    print(f"Saved to {OUT_PATH}")

    # Quick visual verification
    print("\nElevation stats on land:")
    land_elev = elev_final[land]
    print(f"  Min: {land_elev.min():.1f}m")
    print(f"  Mean: {land_elev.mean():.1f}m")
    print(f"  Max: {land_elev.max():.1f}m")
    print(f"  Plains (0-200m): {np.sum(land_elev < 200):,}")
    print(f"  Highland (200-1000m): {np.sum((land_elev >= 200) & (land_elev < 1000)):,}")
    print(f"  Mountain (>1000m): {np.sum(land_elev >= 1000):,}")

if __name__ == "__main__":
    main()
