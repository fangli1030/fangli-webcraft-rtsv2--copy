#!/usr/bin/env python3
"""Python map generator that produces the same binary format as OpenFront's Go generator."""

import json
import numpy as np
from PIL import Image
from collections import deque
import sys
import os

MAP_DIR = "/Users/anujvarma/Desktop/website/OpenFrontIO/map-generator/assets/maps/indiahd"
OUT_DIR = "/Users/anujvarma/Desktop/website/anujvarma-webcraft-rts/maps/indiahd"
MIN_LAKE_SIZE = 20
MIN_ISLAND_SIZE = 50

def load_image(path):
    img = Image.open(path)
    arr = np.array(img)
    h, w = arr.shape[:2]
    # Ensure multiples of 4
    w = w - (w % 4)
    h = h - (h % 4)
    arr = arr[:h, :w]
    print(f"Image: {w}x{h} ({w*h:,} pixels)")
    return arr, w, h

def classify_terrain(img, w, h):
    """Classify each pixel as land/water with magnitude from blue channel."""
    # terrain[x][y] stored as (type, magnitude) where type: 0=land, 1=water
    is_land = np.zeros((w, h), dtype=bool)
    magnitude = np.zeros((w, h), dtype=np.float64)

    for y in range(h):
        for x in range(w):
            if img.shape[2] == 4:
                alpha = img[y, x, 3]
            else:
                alpha = 255
            blue = img[y, x, 2]

            if alpha < 20 or blue == 106:
                is_land[x, y] = False
            else:
                is_land[x, y] = True
                mag = min(200, max(140, float(blue))) - 140
                magnitude[x, y] = mag / 2.0

    land_count = np.sum(is_land)
    print(f"Land: {land_count:,}, Water: {w*h - land_count:,}")
    return is_land, magnitude

def flood_fill(is_land, w, h, target_land):
    """Find connected components of land or water."""
    visited = np.zeros((w, h), dtype=bool)
    components = []

    for x in range(w):
        for y in range(h):
            if visited[x, y] or is_land[x, y] != target_land:
                continue
            # BFS
            queue = deque([(x, y)])
            comp = []
            while queue:
                cx, cy = queue.popleft()
                if cx < 0 or cx >= w or cy < 0 or cy >= h:
                    continue
                if visited[cx, cy] or is_land[cx, cy] != target_land:
                    continue
                visited[cx, cy] = True
                comp.append((cx, cy))
                queue.extend([(cx-1, cy), (cx+1, cy), (cx, cy-1), (cx, cy+1)])
            components.append(comp)

    return components

def remove_small_islands(is_land, magnitude, w, h):
    """Remove land masses smaller than MIN_ISLAND_SIZE."""
    islands = flood_fill(is_land, w, h, target_land=True)
    removed = 0
    for island in islands:
        if len(island) < MIN_ISLAND_SIZE:
            removed += 1
            for x, y in island:
                is_land[x, y] = False
                magnitude[x, y] = 0
    print(f"Removed {removed} small islands (<{MIN_ISLAND_SIZE} tiles)")

def process_water(is_land, magnitude, w, h):
    """Find ocean (largest water body), remove small lakes, compute shoreline + distance."""
    water_bodies = flood_fill(is_land, w, h, target_land=False)
    water_bodies.sort(key=len, reverse=True)

    ocean = np.zeros((w, h), dtype=bool)
    shoreline = np.zeros((w, h), dtype=bool)

    if not water_bodies:
        print("No water bodies found")
        return ocean, shoreline

    # Largest = ocean
    for x, y in water_bodies[0]:
        ocean[x, y] = True
    print(f"Ocean: {len(water_bodies[0]):,} tiles, {len(water_bodies)} total water bodies")

    # Remove small lakes
    removed = 0
    for wb in water_bodies[1:]:
        if len(wb) < MIN_LAKE_SIZE:
            removed += 1
            for x, y in wb:
                is_land[x, y] = True
                magnitude[x, y] = 0
    print(f"Removed {removed} small lakes (<{MIN_LAKE_SIZE} tiles)")

    # Compute shorelines (water tile adjacent to land, or land tile adjacent to water)
    for x in range(w):
        for y in range(h):
            if is_land[x, y]:
                continue
            for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and is_land[nx, ny]:
                    shoreline[x, y] = True
                    break

    # BFS distance from land for water tiles
    dist = np.full((w, h), 999999, dtype=np.int32)
    queue = deque()
    for x in range(w):
        for y in range(h):
            if shoreline[x, y]:
                dist[x, y] = 0
                queue.append((x, y))

    while queue:
        cx, cy = queue.popleft()
        for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and not is_land[nx, ny] and dist[nx, ny] > dist[cx, cy] + 1:
                dist[nx, ny] = dist[cx, cy] + 1
                queue.append((nx, ny))

    # Set water magnitude to distance/2
    for x in range(w):
        for y in range(h):
            if not is_land[x, y]:
                magnitude[x, y] = dist[x, y] / 2.0

    # Also mark land shorelines
    for x in range(w):
        for y in range(h):
            if not is_land[x, y]:
                continue
            for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and not is_land[nx, ny]:
                    shoreline[x, y] = True
                    break

    return ocean, shoreline

def pack_terrain(is_land, shoreline, ocean, magnitude, w, h):
    """Pack terrain into 1 byte per tile: [land:7][shore:6][ocean:5][mag:0-4]"""
    data = bytearray(w * h)
    land_count = 0
    for x in range(w):
        for y in range(h):
            b = 0
            if is_land[x, y]:
                b |= 0x80
                land_count += 1
                b |= min(31, int(np.ceil(magnitude[x, y])))
            else:
                b |= min(31, int(np.ceil(magnitude[x, y])))
            if shoreline[x, y]:
                b |= 0x40
            if ocean[x, y]:
                b |= 0x20
            data[y * w + x] = b
    return bytes(data), land_count

def downsample(is_land, magnitude, shoreline_in, ocean_in, w, h):
    """Create a 2x downsampled version."""
    nw, nh = w // 2, h // 2
    new_land = np.zeros((nw, nh), dtype=bool)
    new_mag = np.zeros((nw, nh), dtype=np.float64)

    for x in range(nw):
        for y in range(nh):
            sx, sy = x * 2, y * 2
            land_count = 0
            mag_sum = 0.0
            for dx in range(2):
                for dy in range(2):
                    if is_land[sx+dx, sy+dy]:
                        land_count += 1
                        mag_sum += magnitude[sx+dx, sy+dy]
            if land_count >= 2:
                new_land[x, y] = True
                new_mag[x, y] = mag_sum / max(1, land_count)

    return new_land, new_mag, nw, nh

def verify_spawns(data, w, spawns):
    """Check that all spawn points land on land tiles."""
    ok = True
    for s in spawns:
        x, y = s["coordinates"]
        if x < 0 or x >= w or y < 0 or y * w + x >= len(data):
            print(f"  WARN: {s['name']} ({x},{y}) out of bounds!")
            ok = False
            continue
        byte = data[y * w + x]
        if byte & 0x80:
            print(f"  OK: {s['name']} ({x},{y}) on land, mag={byte & 0x1f}")
        else:
            print(f"  WARN: {s['name']} ({x},{y}) on WATER! Needs adjustment.")
            ok = False
    return ok

def main():
    print("=== India HD Map Generator ===\n")

    img_path = os.path.join(MAP_DIR, "image.png")
    info_path = os.path.join(MAP_DIR, "info.json")

    img, w, h = load_image(img_path)
    with open(info_path) as f:
        info = json.load(f)

    print("\nStep 1: Classify terrain...")
    is_land, magnitude = classify_terrain(img, w, h)

    print("\nStep 2: Remove small islands...")
    remove_small_islands(is_land, magnitude, w, h)

    print("\nStep 3: Process water (ocean, lakes, shoreline, distance)...")
    ocean, shoreline = process_water(is_land, magnitude, w, h)

    print("\nStep 4: Pack terrain (1x)...")
    data_1x, land_1x = pack_terrain(is_land, shoreline, ocean, magnitude, w, h)
    print(f"  1x: {w}x{h}, {land_1x:,} land tiles, {len(data_1x):,} bytes")

    print("\nStep 5: Downsample 4x...")
    land_4x, mag_4x, w4, h4 = downsample(is_land, magnitude, shoreline, ocean, w, h)
    ocean_4x, shore_4x = process_water_simple(land_4x, mag_4x, w4, h4)
    data_4x, lt_4x = pack_terrain(land_4x, shore_4x, ocean_4x, mag_4x, w4, h4)
    print(f"  4x: {w4}x{h4}, {lt_4x:,} land tiles")

    print("\nStep 6: Downsample 16x...")
    land_16x, mag_16x, w16, h16 = downsample(land_4x, mag_4x, shore_4x, ocean_4x, w4, h4)
    ocean_16x, shore_16x = process_water_simple(land_16x, mag_16x, w16, h16)
    data_16x, lt_16x = pack_terrain(land_16x, shore_16x, ocean_16x, mag_16x, w16, h16)
    print(f"  16x: {w16}x{h16}, {lt_16x:,} land tiles")

    print("\nStep 7: Verify spawn points...")
    verify_spawns(data_1x, w, info["nations"])

    print("\nStep 8: Write output files...")
    os.makedirs(OUT_DIR, exist_ok=True)

    with open(os.path.join(OUT_DIR, "map.bin"), "wb") as f:
        f.write(data_1x)
    with open(os.path.join(OUT_DIR, "map4x.bin"), "wb") as f:
        f.write(data_4x)
    with open(os.path.join(OUT_DIR, "map16x.bin"), "wb") as f:
        f.write(data_16x)

    manifest = {
        "width": w,
        "height": h,
        "num_land_tiles": land_1x,
        "nations": info["nations"],
        "name": info["name"],
    }
    with open(os.path.join(OUT_DIR, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    # Simple thumbnail as PNG (skip webp since we don't need it for our game)
    thumb_w, thumb_h = w4 // 2, h4 // 2
    thumb = Image.new('RGB', (thumb_w, thumb_h))
    for tx in range(thumb_w):
        for ty in range(thumb_h):
            sx, sy = tx * 2, ty * 2
            if sx < w4 and sy < h4 and land_4x[sx, sy]:
                m = mag_4x[sx, sy]
                if m < 10:
                    thumb.putpixel((tx, ty), (110, 158, 72))
                elif m < 20:
                    thumb.putpixel((tx, ty), (186, 166, 108))
                else:
                    thumb.putpixel((tx, ty), (210, 206, 198))
            else:
                thumb.putpixel((tx, ty), (15, 30, 55))
    thumb.save(os.path.join(OUT_DIR, "thumbnail.png"))

    print(f"\nDone! Files written to {OUT_DIR}")
    print(f"  map.bin: {len(data_1x):,} bytes")
    print(f"  map4x.bin: {len(data_4x):,} bytes")
    print(f"  map16x.bin: {len(data_16x):,} bytes")
    print(f"  manifest.json")
    print(f"  thumbnail.png")

def process_water_simple(is_land, magnitude, w, h):
    """Simplified water processing for downsampled maps."""
    ocean = np.zeros((w, h), dtype=bool)
    shoreline = np.zeros((w, h), dtype=bool)

    # BFS for water components
    visited = np.zeros((w, h), dtype=bool)
    largest_water = []
    all_components = []

    for x in range(w):
        for y in range(h):
            if visited[x, y] or is_land[x, y]:
                continue
            queue = deque([(x, y)])
            comp = []
            while queue:
                cx, cy = queue.popleft()
                if cx < 0 or cx >= w or cy < 0 or cy >= h or visited[cx, cy] or is_land[cx, cy]:
                    continue
                visited[cx, cy] = True
                comp.append((cx, cy))
                queue.extend([(cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)])
            all_components.append(comp)
            if len(comp) > len(largest_water):
                largest_water = comp

    for x, y in largest_water:
        ocean[x, y] = True

    # Shoreline
    for x in range(w):
        for y in range(h):
            if is_land[x, y]:
                for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < w and 0 <= ny < h and not is_land[nx, ny]:
                        shoreline[x, y] = True
                        break
            else:
                for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < w and 0 <= ny < h and is_land[nx, ny]:
                        shoreline[x, y] = True
                        break

    # Distance from land for water
    dist = np.full((w, h), 999999, dtype=np.int32)
    queue = deque()
    for x in range(w):
        for y in range(h):
            if not is_land[x, y] and shoreline[x, y]:
                dist[x, y] = 0
                queue.append((x, y))
    while queue:
        cx, cy = queue.popleft()
        for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
            nx, ny = cx+dx, cy+dy
            if 0 <= nx < w and 0 <= ny < h and not is_land[nx, ny] and dist[nx, ny] > dist[cx, cy] + 1:
                dist[nx, ny] = dist[cx, cy] + 1
                queue.append((nx, ny))

    for x in range(w):
        for y in range(h):
            if not is_land[x, y]:
                magnitude[x, y] = dist[x, y] / 2.0

    return ocean, shoreline

if __name__ == "__main__":
    main()
