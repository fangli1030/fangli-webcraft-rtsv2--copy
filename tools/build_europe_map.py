#!/usr/bin/env python3
"""Build Europe HD heightmap PNG from AWS Terrarium elevation tiles."""

import math
import io
import numpy as np
from PIL import Image
import requests

# Europe bbox: Iceland to Urals, North Africa coast to Scandinavia
LAT_MIN, LAT_MAX = 35.0, 71.0
LON_MIN, LON_MAX = -12.0, 45.0
OUT_W, OUT_H = 1520, 960  # ~57 lon x 36 lat, landscape
ZOOM = 5
TILE_SIZE = 256
MAX_ELEV = 3500.0
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
OUT_PATH = "/Users/anujvarma/Desktop/website/OpenFrontIO/map-generator/assets/maps/europe/image.png"

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
    return math.degrees(lat_rad), lon

def fetch_tile(z, x, y):
    url = TILE_URL.format(z=z, x=x, y=y)
    print(f"  Fetching tile z={z} x={x} y={y}...")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content))

def main():
    print(f"Building Europe map: {OUT_W}x{OUT_H}")

    tx_min, ty_max = lat_lon_to_tile(LAT_MIN, LON_MIN, ZOOM)
    tx_max, ty_min = lat_lon_to_tile(LAT_MAX, LON_MAX, ZOOM)
    print(f"Tile range: x=[{tx_min},{tx_max}], y=[{ty_min},{ty_max}]")

    mosaic_w = (tx_max - tx_min + 1) * TILE_SIZE
    mosaic_h = (ty_max - ty_min + 1) * TILE_SIZE
    print(f"Mosaic: {mosaic_w}x{mosaic_h} from {(tx_max-tx_min+1)*(ty_max-ty_min+1)} tiles")

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
                print(f"  Warning: tile {tx},{ty} failed: {e}")

    print("Decoding elevation...")
    elev = mosaic[:,:,0].astype(np.float64) * 256 + mosaic[:,:,1].astype(np.float64) + mosaic[:,:,2].astype(np.float64) / 256 - 32768

    top_lat, left_lon = tile_to_lat_lon(tx_min, ty_min, ZOOM)
    bot_lat, right_lon = tile_to_lat_lon(tx_max + 1, ty_max + 1, ZOOM)
    print(f"Mosaic covers: lat [{bot_lat:.1f},{top_lat:.1f}], lon [{left_lon:.1f},{right_lon:.1f}]")

    def lon_to_px(lon):
        return (lon - left_lon) / (right_lon - left_lon) * mosaic_w
    def lat_to_py(lat):
        def merc(l): return math.log(math.tan(math.pi/4 + math.radians(l)/2))
        return (merc(top_lat) - merc(lat)) / (merc(top_lat) - merc(bot_lat)) * mosaic_h

    x0, x1 = int(lon_to_px(LON_MIN)), int(lon_to_px(LON_MAX))
    y0, y1 = int(lat_to_py(LAT_MAX)), int(lat_to_py(LAT_MIN))
    elev_crop = elev[max(0,y0):min(mosaic_h,y1), max(0,x0):min(mosaic_w,x1)]
    print(f"Crop: {elev_crop.shape}")

    elev_img = Image.fromarray(elev_crop)
    elev_img = elev_img.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
    elev_final = np.array(elev_img)
    print(f"Resized to {OUT_W}x{OUT_H}, elev range: {elev_final.min():.0f} to {elev_final.max():.0f}m")

    out = np.zeros((OUT_H, OUT_W, 4), dtype=np.uint8)
    land = elev_final > 0
    blue = np.clip(140 + elev_final * (60.0 / MAX_ELEV), 140, 200).astype(np.uint8)
    out[land, 0] = blue[land]
    out[land, 1] = blue[land]
    out[land, 2] = blue[land]
    out[land, 3] = 255

    land_count = np.sum(land)
    print(f"Land: {land_count:,} ({land_count/(OUT_W*OUT_H)*100:.1f}%), Water: {OUT_W*OUT_H - land_count:,}")

    import os
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    Image.fromarray(out, 'RGBA').save(OUT_PATH)
    print(f"Saved to {OUT_PATH}")

if __name__ == "__main__":
    main()
