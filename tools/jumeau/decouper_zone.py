#!/usr/bin/env python3
"""
Jumeau numérique de Kinshasa — préparation d'une ZONE JOUABLE (mode « GTA »).

Découpe une zone réelle en tuiles carrées (par défaut 200 m) chargées à la
demande par le jeu web : seule la zone autour du joueur est en mémoire.

Données (toutes réelles, avec leur niveau de confiance) :
  - bâtiments, routes, lieux, eau, occupation du sol : Overture Maps
    (OpenStreetMap, Google Open Buildings, Microsoft) ;
  - arbres isolés : OpenStreetMap (natural=tree) via Overture « land » ;
  - zones arborées : ESA WorldCover (via Overture « land_cover ») — les arbres y
    sont PLACÉS PAR LE JEU (positions estimées, marquées "e": 1) ;
  - relief : Copernicus DEM GLO-30, lissé (modèle de surface -> sol approché).

Repère local : x = est (m), z = sud (m), y = altitude relative (m).

Usage :
  python3 tools/jumeau/decouper_zone.py <id> <lat> <lon> <demi_largeur_m> <dem.tif> <sortie>
Exemple (Limete, Tour de l'Échangeur) :
  python3 tools/jumeau/decouper_zone.py limete -4.374384 15.345467 1600 \
      data/kinshasa/relief_copernicus_glo30.tif web/kinshasa/jeu/zones/limete
"""
import json
import math
import os
import random
import sys

import duckdb
import numpy as np
import rasterio
from scipy.ndimage import gaussian_filter
from shapely import wkb
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, mapping, shape
from shapely.strtree import STRtree

RELEASE = "2026-11-18.0"
CHUNK = 200.0
M_LAT = 111_320.0


class Projection:
    def __init__(self, lat0, lon0):
        self.lat0, self.lon0 = lat0, lon0
        self.m_lon = M_LAT * math.cos(math.radians(lat0))

    def xz(self, lon, lat):
        return (lon - self.lon0) * self.m_lon, -(lat - self.lat0) * M_LAT

    def lonlat(self, x, z):
        return self.lon0 + x / self.m_lon, self.lat0 - z / M_LAT


def to_local(geom, P):
    """Convertit une géométrie lon/lat (shapely) en mètres locaux (x, z)."""
    from shapely.ops import transform
    return transform(lambda lon, lat, *_: P.xz(lon, lat), geom)


def r1(v):
    return round(float(v), 1)


def main(zid, lat0, lon0, half, dem_path, out):
    P = Projection(lat0, lon0)
    os.makedirs(out, exist_ok=True)
    lon_a, lat_a = P.lonlat(-half, half)
    lon_b, lat_b = P.lonlat(half, -half)
    W, S, E, N = min(lon_a, lon_b), min(lat_a, lat_b), max(lon_a, lon_b), max(lat_a, lat_b)
    for k in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE"):
        os.environ.pop(k, None)
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    con.execute("CREATE SECRET anon (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2');")
    con.execute("SET geometry_always_xy = true;")
    R = f"s3://overturemaps-us-west-2/release/{RELEASE}"
    BB = f"bbox.xmin BETWEEN {W} AND {E} AND bbox.ymin BETWEEN {S} AND {N}"

    def q(sql):
        return con.execute(sql).fetchall()

    print("Téléchargement Overture…")
    bats = q(f"""SELECT ST_AsWKB(geometry), sources[1].dataset, height, num_floors, names.primary, COALESCE(class, subtype)
                 FROM read_parquet('{R}/theme=buildings/type=building/*', hive_partitioning=1) WHERE {BB}""")
    # sens unique : accès interdit « en arrière » pour tous les usagers (Overture access_restrictions).
    routes = q(f"""SELECT ST_AsWKB(geometry), class, names.primary,
                   COALESCE(len(list_filter(access_restrictions, lambda x: x.access_type = 'denied'
                        AND x."when".heading = 'backward' AND x."when".mode IS NULL)) > 0, false)
                   FROM read_parquet('{R}/theme=transportation/type=segment/*', hive_partitioning=1)
                   WHERE {BB} AND subtype='road'""")
    lieux = q(f"""SELECT ST_AsWKB(geometry), names.primary, basic_category, confidence FROM read_parquet('{R}/theme=places/type=place/*', hive_partitioning=1)
                  WHERE {BB} AND names.primary IS NOT NULL""")
    eau = q(f"""SELECT ST_AsWKB(geometry), subtype, names.primary FROM read_parquet('{R}/theme=base/type=water/*', hive_partitioning=1)
                WHERE bbox.xmax >= {W} AND bbox.xmin <= {E} AND bbox.ymax >= {S} AND bbox.ymin <= {N}""")
    sol = q(f"""SELECT ST_AsWKB(geometry), subtype, class FROM read_parquet('{R}/theme=base/type=land_use/*', hive_partitioning=1) WHERE {BB}""")
    arbres = q(f"""SELECT ST_AsWKB(geometry) FROM read_parquet('{R}/theme=base/type=land/*', hive_partitioning=1)
                   WHERE {BB} AND class IN ('tree')""")
    couvert = q(f"""SELECT ST_AsWKB(geometry) FROM read_parquet('{R}/theme=base/type=land_cover/*', hive_partitioning=1)
                    WHERE bbox.xmax >= {W} AND bbox.xmin <= {E} AND bbox.ymax >= {S} AND bbox.ymin <= {N} AND subtype = 'forest'""")
    print(f"  bâtiments {len(bats)}, routes {len(routes)}, lieux {len(lieux)}, eau {len(eau)}, sol {len(sol)}, "
          f"arbres {len(arbres)}, zones arborées {len(couvert)}")

    # --- Relief : grille de 16 m, lissée (le DEM Copernicus est un modèle de surface) ---
    STEP = 16.0
    n = int(2 * half / STEP) + 1
    src = rasterio.open(dem_path)
    dem = src.read(1).astype(np.float32)
    dem = gaussian_filter(dem, sigma=2.0)          # ~60 m : efface en partie bâtiments et arbres
    grid = np.zeros((n, n), np.float32)
    for j in range(n):
        for i in range(n):
            lon, lat = P.lonlat(-half + i * STEP, -half + j * STEP)
            r, c = src.index(lon, lat)
            grid[j, i] = dem[r, c]
    base = float(np.median(grid))
    grid -= base
    grid.astype("<f4").tofile(os.path.join(out, "relief.bin"))

    def height_at(x, z):
        fx = (x + half) / STEP
        fz = (z + half) / STEP
        i0 = int(np.clip(math.floor(fx), 0, n - 2))
        j0 = int(np.clip(math.floor(fz), 0, n - 2))
        tx, tz = np.clip(fx - i0, 0, 1), np.clip(fz - j0, 0, 1)
        a = grid[j0, i0] * (1 - tx) + grid[j0, i0 + 1] * tx
        b = grid[j0 + 1, i0] * (1 - tx) + grid[j0 + 1, i0 + 1] * tx
        return float(a * (1 - tz) + b * tz)

    nc = int(math.ceil(2 * half / CHUNK))
    chunks = {(i, j): {"b": [], "r": [], "l": [], "w": [], "s": [], "t": []} for i in range(nc) for j in range(nc)}

    def key(x, z):
        return (min(nc - 1, max(0, int((x + half) // CHUNK))), min(nc - 1, max(0, int((z + half) // CHUNK))))

    zone_box = box(-half, -half, half, half)

    # --- Bâtiments ---
    stats = {"confirmee": 0, "satellite": 0, "hauteur_documentee": 0, "ignores": 0}
    for g, src_name, height, floors, name, cat in bats:
        geom = to_local(wkb.loads(bytes(g)), P)
        polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]
        for pg in polys:
            if not pg.is_valid:
                pg = pg.buffer(0)
            if pg.is_empty or pg.area < 6 or not zone_box.contains(pg.centroid):
                continue
            c = pg.centroid
            # L'esplanade de la Tour de l'Échangeur est modélisée à part par le jeu.
            if zid == "limete" and math.hypot(c.x, c.y) < 60 and pg.area > 2000:
                stats["ignores"] += 1
                continue
            conf = 1 if src_name == "OpenStreetMap" else 0
            if height:
                h, hd = float(height), 1
            elif floors:
                h, hd = floors * 3.2 + 0.8, 1
            else:
                a = pg.area
                h = 3.6 if a < 120 else 4.5 if a < 350 else 7.5 if a < 1200 else 10.5
                hd = 0
            ring = list(pg.simplify(0.15).exterior.coords)[:-1]
            if len(ring) < 3:
                continue
            item = {"p": [r1(v) for xy in ring for v in xy], "h": r1(h), "y": r1(height_at(c.x, c.y)),
                    "c": conf, "hd": hd, "v": random.Random(hash(tuple(ring[0]))).randint(0, 7)}
            if name:
                item["n"] = name
            if cat:
                item["k"] = cat
            chunks[key(c.x, c.y)]["b"].append(item)
            stats["confirmee" if conf else "satellite"] += 1
            stats["hauteur_documentee"] += hd

    # --- Routes (découpées par tuile, drapées sur le relief) ---
    WIDTH = {"motorway": 12, "trunk": 14, "primary": 12, "secondary": 9, "tertiary": 7.5, "unclassified": 6,
             "residential": 5.5, "living_street": 4.5, "service": 3.8, "track": 3.5, "path": 1.8,
             "footway": 2.0, "pedestrian": 4, "steps": 2.0, "cycleway": 2.0}
    reseau = []
    for g, cls, name, sens_unique in routes:
        line = to_local(wkb.loads(bytes(g)), P)
        if line.is_empty:
            continue
        line = line.intersection(zone_box)
        parts = list(line.geoms) if hasattr(line, "geoms") else [line]
        for part in parts:
            if part.length < 2 or part.geom_type != "LineString":
                continue
            if cls in ("motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential"):
                item_r = {"p": [r1(v) for xy in part.coords for v in xy], "k": cls}
                if sens_unique:
                    item_r["u"] = 1
                if name:
                    item_r["n"] = name
                reseau.append(item_r)
            for i in range(nc):
                for j in range(nc):
                    cb = box(-half + i * CHUNK, -half + j * CHUNK, -half + (i + 1) * CHUNK, -half + (j + 1) * CHUNK)
                    if not part.intersects(cb):
                        continue
                    piece = part.intersection(cb)
                    for pp in (piece.geoms if hasattr(piece, "geoms") else [piece]):
                        if pp.geom_type != "LineString" or pp.length < 0.5:
                            continue
                        # Densifie tous les 8 m pour épouser le relief.
                        d = 0.0
                        pts = []
                        while d < pp.length:
                            q_ = pp.interpolate(d)
                            pts.append((q_.x, q_.y))
                            d += 8.0
                        q_ = pp.coords[-1]
                        pts.append(q_)
                        flat = []
                        for x, z in pts:
                            flat += [r1(x), r1(height_at(x, z)), r1(z)]
                        item = {"p": flat, "k": cls, "w": WIDTH.get(cls, 4)}
                        if name:
                            item["n"] = name
                        chunks[(i, j)]["r"].append(item)

    # --- Lieux ---
    for g, name, cat, confd in lieux:
        p = to_local(wkb.loads(bytes(g)), P)
        if not zone_box.contains(p):
            continue
        chunks[key(p.x, p.y)]["l"].append({"x": r1(p.x), "z": r1(p.y), "n": name, "k": cat or "", "f": round(confd or 0, 2)})

    # --- Eau, occupation du sol ---
    def add_poly(lst, geom, extra):
        geom = to_local(geom, P).intersection(zone_box)
        for pg in (geom.geoms if hasattr(geom, "geoms") else [geom]):
            if pg.geom_type != "Polygon" or pg.area < 20:
                continue
            c = pg.representative_point()
            ring = list(pg.simplify(0.5).exterior.coords)[:-1]
            chunks[key(c.x, c.y)][lst].append({"p": [r1(v) for xy in ring for v in xy], **extra})

    for g, sub, name in eau:
        geom = wkb.loads(bytes(g))
        if geom.geom_type in ("Polygon", "MultiPolygon"):
            add_poly("w", geom, {"n": name} if name else {})
        elif geom.geom_type in ("LineString", "MultiLineString"):
            add_poly("w", geom.buffer(0.00004), {"n": name} if name else {})   # ruisseaux ~8 m de large
    for g, sub, cls in sol:
        add_poly("s", wkb.loads(bytes(g)), {"k": sub or cls or ""})

    # --- Végétation ---
    obstacles = []
    for (i, j), ch in chunks.items():
        for b in ch["b"]:
            p = b["p"]
            obstacles.append(Polygon([(p[k], p[k + 1]) for k in range(0, len(p), 2)]).buffer(2.0))
    for r in reseau:
        p = r["p"]
        obstacles.append(LineString([(p[k], p[k + 1]) for k in range(0, len(p), 2)]).buffer(WIDTH.get(r["k"], 5) / 2 + 1))
    tree_obs = STRtree(obstacles)
    reels = 0
    for (g,) in arbres:
        p = to_local(wkb.loads(bytes(g)), P)
        if p.geom_type != "Point" or not zone_box.contains(p):
            continue
        chunks[key(p.x, p.y)]["t"].append([r1(p.x), r1(height_at(p.x, p.y)), r1(p.y), 0])
        reels += 1
    rng = random.Random(42)
    estimes = 0
    for (g,) in couvert:
        geom = to_local(wkb.loads(bytes(g)), P).intersection(zone_box)
        for pg in (geom.geoms if hasattr(geom, "geoms") else [geom]):
            if pg.geom_type != "Polygon" or pg.area < 50:
                continue
            minx, miny, maxx, maxy = pg.bounds
            for _ in range(int(pg.area / 180)):
                pt = Point(rng.uniform(minx, maxx), rng.uniform(miny, maxy))
                if not pg.contains(pt) or any(obstacles[k].contains(pt) for k in tree_obs.query(pt)):
                    continue
                chunks[key(pt.x, pt.y)]["t"].append([r1(pt.x), r1(height_at(pt.x, pt.y)), r1(pt.y), 1])
                estimes += 1

    # --- Écriture ---
    liste = []
    for (i, j), ch in chunks.items():
        if not any(ch.values()):
            continue
        name = f"c_{i}_{j}.json"
        json.dump(ch, open(os.path.join(out, name), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        liste.append({"i": i, "j": j, "f": name, "nb": len(ch["b"])})
    json.dump(reseau, open(os.path.join(out, "reseau.json"), "w", encoding="utf-8"), separators=(",", ":"))
    manifest = {
        "id": zid, "origine": [lat0, lon0], "demi": half, "tuile": CHUNK, "n": nc,
        "relief": {"pas": STEP, "n": n, "base_m": round(base, 1)},
        "tuiles": liste,
        "stats": {**stats, "arbres_reels": reels, "arbres_estimes": estimes, "routes": len(reseau), "lieux": len(lieux)},
        "attribution": "© contributeurs OpenStreetMap (ODbL) · © Overture Maps Foundation · Google Open Buildings (CC BY 4.0) "
                       "· ESA WorldCover · Copernicus DEM GLO-30",
    }
    json.dump(manifest, open(os.path.join(out, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(manifest["stats"], ensure_ascii=False))
    print(f"{len(liste)} tuiles -> {out}")


if __name__ == "__main__":
    if len(sys.argv) != 7:
        sys.exit(__doc__)
    main(sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5], sys.argv[6])
