#!/usr/bin/env python3
"""
Jumeau numérique de Kinshasa — relief réel en tuiles « Terrarium » (PNG).

Source : Copernicus DEM GLO-30 (© DLR e.V. 2010-2014 et © Airbus Defence and
Space GmbH 2014-2018, fourni dans le cadre du programme Copernicus ; licence
d'utilisation gratuite). Résolution 30 m ; c'est un modèle de SURFACE : en ville
il inclut en partie la hauteur des bâtiments et des arbres.

Encodage Terrarium : altitude = (R * 256 + G + B / 256) - 32768
Usage :
  python3 tools/jumeau/construire_relief.py data/kinshasa/relief_copernicus_glo30.tif web/kinshasa/donnees/relief
Nécessite : pip install rasterio pillow numpy
"""
import math
import os
import sys

import numpy as np
import rasterio
from PIL import Image
from rasterio.warp import Resampling, reproject

src_path, out = sys.argv[1], sys.argv[2]
ZMIN, ZMAX = 8, 13
src = rasterio.open(src_path)
dem = src.read(1).astype(np.float32)
W, S, E, N = src.bounds.left, src.bounds.bottom, src.bounds.right, src.bounds.top


def tile_bounds(x, y, z):
    n = 2 ** z
    lon0 = x / n * 360 - 180
    lon1 = (x + 1) / n * 360 - 180
    lat0 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat1 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return lon0, lat1, lon1, lat0


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


count = 0
for z in range(ZMIN, ZMAX + 1):
    x0, y0 = tile_xy(W, N, z)
    x1, y1 = tile_xy(E, S, z)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            b = tile_bounds(x, y, z)
            dst = np.full((256, 256), np.nan, np.float32)
            tr = rasterio.transform.from_bounds(*b, 256, 256)
            reproject(dem, dst, src_transform=src.transform, src_crs=src.crs, dst_transform=tr,
                      dst_crs="EPSG:4326", resampling=Resampling.bilinear, src_nodata=-32768, dst_nodata=np.nan)
            if np.all(np.isnan(dst)):
                continue
            dst = np.nan_to_num(dst, nan=float(np.nanmin(dst)))
            v = dst + 32768.0
            r = np.floor(v / 256)
            g = np.floor(v - r * 256)
            bb = np.floor((v - r * 256 - g) * 256)
            img = np.stack([r, g, bb], -1).clip(0, 255).astype(np.uint8)
            d = os.path.join(out, str(z), str(x))
            os.makedirs(d, exist_ok=True)
            Image.fromarray(img, "RGB").save(os.path.join(d, f"{y}.png"), optimize=True)
            count += 1
print(count, "tuiles de relief ->", out)
