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
  python3 tools/jumeau/decouper_zone.py <id> <lat> <lon> <demi> <dem.tif> <sortie>
  <demi> : demi-côté en mètres (zone carrée) ou « est-ouest x nord-sud »
  (zone rectangulaire, ex. 4600x2000).
Exemples :
  python3 tools/jumeau/decouper_zone.py limete -4.374384 15.345467 1600 \
      data/kinshasa/relief_copernicus_glo30.tif web/kinshasa/jeu/zones/limete
  python3 tools/jumeau/decouper_zone.py gombe -4.3120 15.30485 4600x2000 \
      data/kinshasa/relief_copernicus_glo30.tif web/kinshasa/jeu/zones/gombe
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


def main(zid, lat0, lon0, hx, hz, dem_path, out):
    P = Projection(lat0, lon0)
    os.makedirs(out, exist_ok=True)
    lon_a, lat_a = P.lonlat(-hx, hz)
    lon_b, lat_b = P.lonlat(hx, -hz)
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
    nx = int(2 * hx / STEP) + 1
    nz = int(2 * hz / STEP) + 1
    src = rasterio.open(dem_path)
    dem = src.read(1).astype(np.float32)
    dem = gaussian_filter(dem, sigma=2.0)          # ~60 m : efface en partie bâtiments et arbres
    grid = np.zeros((nz, nx), np.float32)
    for j in range(nz):
        for i in range(nx):
            lon, lat = P.lonlat(-hx + i * STEP, -hz + j * STEP)
            r, c = src.index(lon, lat)
            grid[j, i] = dem[r, c]
    # Grandes étendues d'eau (fleuve Congo) : surface mise à plat au niveau de l'eau (10e centile du
    # modèle de surface sur l'étendue), pour que l'eau dessinée par le jeu recouvre bien le sol.
    import shapely
    xs = -hx + np.arange(nx) * STEP
    zs = -hz + np.arange(nz) * STEP
    gx, gz = np.meshgrid(xs, zs)
    for g, sub, name in eau:
        geom = wkb.loads(bytes(g))
        if geom.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        geom = to_local(geom, P).intersection(box(-hx, -hz, hx, hz))
        if geom.is_empty or geom.area < 50_000:
            continue
        dedans = shapely.contains_xy(geom, gx, gz)
        if dedans.sum() >= 4:
            grid[dedans] = np.percentile(grid[dedans], 10)
    base = float(np.median(grid))
    grid -= base
    grid.astype("<f4").tofile(os.path.join(out, "relief.bin"))

    def height_at(x, z):
        fx = (x + hx) / STEP
        fz = (z + hz) / STEP
        i0 = int(np.clip(math.floor(fx), 0, nx - 2))
        j0 = int(np.clip(math.floor(fz), 0, nz - 2))
        tx, tz = np.clip(fx - i0, 0, 1), np.clip(fz - j0, 0, 1)
        a = grid[j0, i0] * (1 - tx) + grid[j0, i0 + 1] * tx
        b = grid[j0 + 1, i0] * (1 - tx) + grid[j0 + 1, i0 + 1] * tx
        return float(a * (1 - tz) + b * tz)

    ncx = int(math.ceil(2 * hx / CHUNK))
    ncz = int(math.ceil(2 * hz / CHUNK))
    chunks = {(i, j): {"b": [], "r": [], "l": [], "w": [], "s": [], "t": []} for i in range(ncx) for j in range(ncz)}

    def key(x, z):
        return (min(ncx - 1, max(0, int((x + hx) // CHUNK))), min(ncz - 1, max(0, int((z + hz) // CHUNK))))

    zone_box = box(-hx, -hz, hx, hz)

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
            bx0, bz0, bx1, bz1 = part.bounds
            for i in range(max(0, int((bx0 + hx) // CHUNK)), min(ncx, int((bx1 + hx) // CHUNK) + 1)):
                for j in range(max(0, int((bz0 + hz) // CHUNK)), min(ncz, int((bz1 + hz) // CHUNK) + 1)):
                    cb = box(-hx + i * CHUNK, -hz + j * CHUNK, -hx + (i + 1) * CHUNK, -hz + (j + 1) * CHUNK)
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
        """Polygone découpé sur CHAQUE tuile qu'il recouvre (un fleuve de plusieurs km reste visible partout)."""
        geom = to_local(geom, P).intersection(zone_box)
        if geom.is_empty:
            return
        bx0, bz0, bx1, bz1 = geom.bounds
        for i in range(max(0, int((bx0 + hx) // CHUNK)), min(ncx, int((bx1 + hx) // CHUNK) + 1)):
            for j in range(max(0, int((bz0 + hz) // CHUNK)), min(ncz, int((bz1 + hz) // CHUNK) + 1)):
                cb = box(-hx + i * CHUNK, -hz + j * CHUNK, -hx + (i + 1) * CHUNK, -hz + (j + 1) * CHUNK)
                piece = geom.intersection(cb)
                for pg in (piece.geoms if hasattr(piece, "geoms") else [piece]):
                    if pg.geom_type != "Polygon" or pg.area < 20:
                        continue
                    # Les îlots (trous) sont ignorés : le jeu ne trace que le contour extérieur.
                    ring = list(pg.simplify(0.5).exterior.coords)[:-1]
                    if len(ring) >= 3:
                        chunks[(i, j)][lst].append({"p": [r1(v) for xy in ring for v in xy], **extra})

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
        "id": zid, "origine": [lat0, lon0], "demi": max(hx, hz), "demi_x": hx, "demi_z": hz,
        "tuile": CHUNK, "n": max(ncx, ncz), "nx": ncx, "nz": ncz,
        "relief": {"pas": STEP, "n": nx, "nx": nx, "nz": nz, "base_m": round(base, 1)},
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
    dims = [float(v) for v in sys.argv[4].lower().split("x")]
    main(sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), dims[0], dims[-1], sys.argv[5], sys.argv[6])
