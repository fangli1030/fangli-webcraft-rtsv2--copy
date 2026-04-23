#!/usr/bin/env python3
"""Rebuild small India map using Natural Earth river shapefiles for accurate rivers."""

import math, io, numpy as np, requests, os, json, shapefile
from PIL import Image
from collections import deque

LAT_MIN, LAT_MAX = 6.0, 37.0
LON_MIN, LON_MAX = 67.0, 94.0
OUT_W, OUT_H = 480, 600
ZOOM = 6
TILE_SIZE = 256
MAX_ELEV = 1800.0
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
OUT_DIR = "/Users/anujvarma/Desktop/website/anujvarma-webcraft-rts/maps/india_small"
SHAPEFILE = "/tmp/rivers_shp/ne_10m_rivers_lake_centerlines"

# Major rivers to include (by name in Natural Earth dataset)
MAJOR_RIVERS = {
    'Ganges', 'Brahmaputra', 'Indus', 'Yamuna', 'Godävari', 'Krishna',
    'Narmada', 'Cauvery', 'Mahäna Nadï', 'Chambal', 'Ghäghara', 'Son',
    'Sutlej', 'Chenab', 'Ravi', 'Beas', 'Jhelum', 'Tapi', 'Mahi',
    'Bhima', 'Tungabhadra', 'Penner', 'Betwa', 'Gandak', 'Tista',
    'Brahmani', 'Wainganga', 'Kolidam', 'Sapt', 'Manas', 'Palar',
    'Indravati', 'Banas', 'Tel', 'Sankh',
}

def lat_lon_to_tile(lat, lon, zoom):
    n = 2 ** zoom
    x = int((lon + 180) / 360 * n)
    lat_rad = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_rad) + 1/math.cos(lat_rad)) / math.pi) / 2 * n)
    return x, y

def tile_to_lat_lon(x, y, zoom):
    n = 2 ** zoom
    lon = x / n * 360 - 180
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2*y/n)))), lon

def fetch_tile(z, x, y):
    resp = requests.get(TILE_URL.format(z=z, x=x, y=y), timeout=30)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content))

def geo_to_px(lat, lon):
    return int((lon - LON_MIN)/(LON_MAX - LON_MIN)*OUT_W), int((LAT_MAX - lat)/(LAT_MAX - LAT_MIN)*OUT_H)

def draw_line_px(mask, x0, y0, x1, y1):
    """Bresenham with diagonal gap fill, 1px wide."""
    dx, dy = abs(x1-x0), abs(y1-y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    while True:
        if 0 <= x0 < OUT_W and 0 <= y0 < OUT_H:
            mask[y0, x0] = True
        if x0 == x1 and y0 == y1: break
        e2 = 2 * err
        mx = e2 > -dy
        my = e2 < dx
        if mx: err -= dy; x0 += sx
        if my: err += dx; y0 += sy
        if mx and my:
            if 0 <= x0-sx < OUT_W and 0 <= y0 < OUT_H:
                mask[y0, x0-sx] = True

def main():
    print(f"Building Small India with Natural Earth rivers: {OUT_W}x{OUT_H}")

    # Fetch elevation tiles
    tx_min, ty_max = lat_lon_to_tile(LAT_MIN, LON_MIN, ZOOM)
    tx_max, ty_min = lat_lon_to_tile(LAT_MAX, LON_MAX, ZOOM)
    mosaic_w = (tx_max-tx_min+1)*TILE_SIZE
    mosaic_h = (ty_max-ty_min+1)*TILE_SIZE
    print(f"Fetching {(tx_max-tx_min+1)*(ty_max-ty_min+1)} tiles...")
    mosaic = np.zeros((mosaic_h, mosaic_w, 3), dtype=np.uint8)
    for ty in range(ty_min, ty_max+1):
        for tx in range(tx_min, tx_max+1):
            try:
                tile = fetch_tile(ZOOM, tx, ty)
                arr = np.array(tile.convert('RGB'))
                mosaic[(ty-ty_min)*TILE_SIZE:(ty-ty_min+1)*TILE_SIZE, (tx-tx_min)*TILE_SIZE:(tx-tx_min+1)*TILE_SIZE] = arr
            except: pass

    elev = mosaic[:,:,0].astype(np.float64)*256 + mosaic[:,:,1].astype(np.float64) + mosaic[:,:,2].astype(np.float64)/256 - 32768
    top_lat, left_lon = tile_to_lat_lon(tx_min, ty_min, ZOOM)
    bot_lat, right_lon = tile_to_lat_lon(tx_max+1, ty_max+1, ZOOM)
    def merc(l): return math.log(math.tan(math.pi/4 + math.radians(l)/2))
    mt, mb = merc(top_lat), merc(bot_lat)
    x0 = int((LON_MIN-left_lon)/(right_lon-left_lon)*mosaic_w)
    x1 = int((LON_MAX-left_lon)/(right_lon-left_lon)*mosaic_w)
    y0 = int((mt-merc(LAT_MAX))/(mt-mb)*mosaic_h)
    y1 = int((mt-merc(LAT_MIN))/(mt-mb)*mosaic_h)
    elev_crop = elev[max(0,y0):min(mosaic_h,y1), max(0,x0):min(mosaic_w,x1)]
    elev_img = Image.fromarray(elev_crop).resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
    elev_final = np.array(elev_img)
    print(f"Elevation: {elev_final.min():.0f} to {elev_final.max():.0f}m")

    # Read Natural Earth rivers
    print("Loading Natural Earth river shapefiles...")
    sf = shapefile.Reader(SHAPEFILE)
    river_mask = np.zeros((OUT_H, OUT_W), dtype=bool)
    rivers_drawn = 0

    for sr in sf.shapeRecords():
        name = sr.record['name'] or ''
        if name not in MAJOR_RIVERS:
            continue

        pts = sr.shape.points
        # Filter to points in our bbox (with small margin)
        px_pts = []
        for lon, lat in pts:
            if LON_MIN - 1 <= lon <= LON_MAX + 1 and LAT_MIN - 1 <= lat <= LAT_MAX + 1:
                px, py = geo_to_px(lat, lon)
                px_pts.append((px, py))

        if len(px_pts) < 2:
            continue

        # Draw line segments, skipping long jumps (disconnected parts)
        MAX_SEG_PX = 30
        for j in range(len(px_pts) - 1):
            dx = abs(px_pts[j][0] - px_pts[j+1][0])
            dy = abs(px_pts[j][1] - px_pts[j+1][1])
            if dx + dy > MAX_SEG_PX:
                continue
            draw_line_px(river_mask, px_pts[j][0], px_pts[j][1], px_pts[j+1][0], px_pts[j+1][1])

        rivers_drawn += 1

    print(f"Drew {rivers_drawn} rivers")

    land = elev_final > 0

    # Rivers are water tiles — use river_mask directly, not masked by land.
    # This way rivers naturally connect to ocean since both are water.
    # Only exclude river pixels that are deep ocean (far from any land).
    river_on_land = river_mask.copy()
    print(f"River tiles: {np.sum(river_on_land):,}")

    # Build RGBA
    out = np.zeros((OUT_H, OUT_W, 4), dtype=np.uint8)
    elev_norm = np.clip(elev_final / MAX_ELEV, 0, 1)
    blue = np.clip(140 + np.sqrt(elev_norm) * 60, 140, 200).astype(np.uint8)
    out[land, 0] = blue[land]; out[land, 1] = blue[land]; out[land, 2] = blue[land]; out[land, 3] = 255
    out[river_on_land, :] = 0  # rivers = transparent = water

    ln = land & ~river_on_land
    mg = (blue[ln].astype(float) - 140) / 2
    print(f"Plains: {np.sum(mg<10):,}, Highland: {np.sum((mg>=10)&(mg<20)):,}, Mountain: {np.sum(mg>=20):,}")

    # Generate map.bin
    w, h = OUT_W-(OUT_W%4), OUT_H-(OUT_H%4)
    out = out[:h, :w]
    is_land = np.zeros((w,h), dtype=bool)
    magnitude = np.zeros((w,h), dtype=np.float64)
    for y2 in range(h):
        for x2 in range(w):
            a, b = out[y2,x2,3], out[y2,x2,2]
            if a >= 20 and b != 106:
                is_land[x2,y2] = True
                magnitude[x2,y2] = (min(200,max(140,float(b)))-140)/2

    # Remove small islands
    vis = np.zeros((w,h), dtype=bool)
    for x2 in range(w):
        for y2 in range(h):
            if vis[x2,y2] or not is_land[x2,y2]: continue
            q = deque([(x2,y2)]); c = []
            while q:
                cx,cy = q.popleft()
                if cx<0 or cx>=w or cy<0 or cy>=h or vis[cx,cy] or not is_land[cx,cy]: continue
                vis[cx,cy]=True; c.append((cx,cy))
                q.extend([(cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)])
            if len(c) < 15:
                for cx,cy in c: is_land[cx,cy]=False

    # Water bodies
    vis = np.zeros((w,h), dtype=bool); wbs = []
    for x2 in range(w):
        for y2 in range(h):
            if vis[x2,y2] or is_land[x2,y2]: continue
            q = deque([(x2,y2)]); c = []
            while q:
                cx,cy = q.popleft()
                if cx<0 or cx>=w or cy<0 or cy>=h or vis[cx,cy] or is_land[cx,cy]: continue
                vis[cx,cy]=True; c.append((cx,cy))
                q.extend([(cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)])
            wbs.append(c)
    wbs.sort(key=len, reverse=True)
    ocean = np.zeros((w,h), dtype=bool)
    if wbs:
        for cx,cy in wbs[0]: ocean[cx,cy]=True
        for wb in wbs[1:]:
            if len(wb) < 5:
                for cx,cy in wb: is_land[cx,cy]=True; magnitude[cx,cy]=0

    # Shoreline + distance
    shore = np.zeros((w,h), dtype=bool)
    for x2 in range(w):
        for y2 in range(h):
            for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                nx,ny = x2+dx, y2+dy
                if 0<=nx<w and 0<=ny<h and is_land[x2,y2]!=is_land[nx,ny]: shore[x2,y2]=True; break
    dist = np.full((w,h), 999999, dtype=np.int32); q = deque()
    for x2 in range(w):
        for y2 in range(h):
            if not is_land[x2,y2] and shore[x2,y2]: dist[x2,y2]=0; q.append((x2,y2))
    while q:
        cx,cy = q.popleft()
        for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]:
            nx,ny = cx+dx,cy+dy
            if 0<=nx<w and 0<=ny<h and not is_land[nx,ny] and dist[nx,ny]>dist[cx,cy]+1: dist[nx,ny]=dist[cx,cy]+1; q.append((nx,ny))
    for x2 in range(w):
        for y2 in range(h):
            if not is_land[x2,y2]: magnitude[x2,y2] = dist[x2,y2]/2

    # Pack
    data = bytearray(w*h); lc = 0
    for x2 in range(w):
        for y2 in range(h):
            b2 = 0
            if is_land[x2,y2]: b2|=0x80; lc+=1; b2|=min(31,int(np.ceil(magnitude[x2,y2])))
            else: b2|=min(31,int(np.ceil(magnitude[x2,y2])))
            if shore[x2,y2]: b2|=0x40
            if ocean[x2,y2]: b2|=0x20
            data[y2*w+x2] = b2

    # Spawns
    sx_f, sy_f = OUT_W/1440, OUT_H/1800
    hd = [([313,1041],"Mumbai"),([967,663],"Maurya"),([647,1523],"Chola"),([544,488],"Mughal"),([366,1074],"Maratha"),([468,803],"Gupta"),([407,704],"Rajput"),([504,1259],"Vijayanagara"),([677,1404],"Pallava"),([419,313],"Sikh Empire"),([593,1573],"Pandya")]
    nations = []
    for coords, name in hd:
        sx2, sy2 = int(coords[0]*sx_f), int(coords[1]*sy_f)
        if sy2*w+sx2 < len(data) and not (data[sy2*w+sx2] & 0x80):
            for r in range(1,30):
                f = False
                for dy2 in range(-r,r+1):
                    for dx2 in range(-r,r+1):
                        nx2,ny2 = sx2+dx2, sy2+dy2
                        if 0<=nx2<w and 0<=ny2<h and data[ny2*w+nx2]&0x80: sx2,sy2=nx2,ny2; f=True; break
                    if f: break
                if f: break
        nations.append({"coordinates":[sx2,sy2],"name":name,"flag":"in"})
        print(f"  {name}: ({sx2},{sy2}) -> {'LAND' if data[sy2*w+sx2]&0x80 else 'WATER'}")

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR,"map.bin"),"wb") as f: f.write(bytes(data))
    with open(os.path.join(OUT_DIR,"manifest.json"),"w") as f: json.dump({"width":w,"height":h,"num_land_tiles":lc,"nations":nations,"name":"India (Small)"},f,indent=2)
    print(f"\nDone! {w}x{h}, {lc:,} land tiles")

if __name__ == "__main__":
    main()
