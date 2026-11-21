#!/usr/bin/env python3
"""
MBOKA ELENGI — Convertisseur carte -> données de ville pour le jeu.

Entrées :
  - un extrait OpenStreetMap (.osm, XML) : bâtiments, routes, espaces verts,
    eau, arbres, lieux nommés ;
  - (option) des bâtiments Overture Maps / Google Open Buildings (GeoJSON,
    voir fetch_overture.py) pour combler les vides d'OSM ;
  - (option --fill) densification : ajoute des maisons de parcelle typiques
    de Kinshasa dans les îlots résidentiels restés vides, alignées sur les rues.
    Ces maisons sont GÉNÉRÉES (marquées "s":"gen") et non relevées sur le
    terrain : elles donnent la densité réelle des quartiers en attendant une
    cartographie complète.

Repère du jeu : origine = centre de la Tour de l'Échangeur (Limete, Kinshasa).
  x = mètres vers l'est, y = mètres vers le nord (Godot : z = -y).

Données : © les contributeurs d'OpenStreetMap (ODbL 1.0) ;
          © Overture Maps Foundation ; Google Open Buildings (CC BY 4.0 / ODbL).

Usage :
  python3 tools/osm/build_city_data.py <extrait.osm> <sortie.json> [--zone tools/osm/zones/x.json]
                                       [--extra overture.geojson] [--fill]
Nécessite : pip install shapely (pour --extra et --fill)
"""
import json
import math
import random
import sys
import xml.etree.ElementTree as ET
import zlib

ORIGIN_LAT = -4.374384     # remplacé par la configuration de zone (--zone)
ORIGIN_LON = 15.345467
M_PER_DEG = 111_320.0
SKIP_BUILDINGS = {"57890331"}   # esplanade de la Tour de l'Échangeur (modélisée à part)
ESPLANADE_RADIUS = 90.0

ROADS = {
    "motorway": (10.0, "asphalt"), "trunk": (9.0, "asphalt"), "trunk_link": (6.0, "asphalt"),
    "primary": (9.0, "asphalt"), "primary_link": (6.0, "asphalt"),
    "secondary": (8.0, "asphalt"), "secondary_link": (6.0, "asphalt"),
    "tertiary": (7.0, "asphalt"), "tertiary_link": (5.0, "asphalt"),
    "unclassified": (6.0, "dirt"), "residential": (5.5, "dirt"),
    "living_street": (4.5, "dirt"), "service": (3.5, "dirt"),
    "pedestrian": (4.0, "paving"), "footway": (1.8, "paving"),
    "path": (1.5, "dirt"), "track": (3.0, "dirt"),
}
PAVED = {"asphalt", "paved", "concrete", "paving_stones", "sett", "concrete:plates"}
GREEN = {("landuse", "grass"), ("landuse", "village_green"), ("landuse", "recreation_ground"),
         ("landuse", "forest"), ("landuse", "meadow"), ("leisure", "park"), ("leisure", "pitch"),
         ("leisure", "garden"), ("natural", "wood"), ("natural", "scrub"), ("natural", "grassland")}
WOODED = {("landuse", "forest"), ("natural", "wood"), ("natural", "scrub")}
POI_KEYS = ("amenity", "shop", "tourism", "historic", "man_made", "leisure", "office", "government", "craft")
FILL_ROADS = {"residential", "unclassified", "living_street", "service", "tertiary"}


def stable_rand(osm_id: str, salt: str) -> float:
    return (zlib.crc32(f"{salt}:{osm_id}".encode()) & 0xFFFFFFFF) / 0xFFFFFFFF


def project(lat, lon):
    x = (lon - ORIGIN_LON) * M_PER_DEG * math.cos(math.radians(ORIGIN_LAT))
    y = (lat - ORIGIN_LAT) * M_PER_DEG
    return round(x, 1), round(y, 1)


def area_and_centroid(pts):
    a = cx = cy = 0.0
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        cr = x0 * y1 - x1 * y0
        a += cr
        cx += (x0 + x1) * cr
        cy += (y0 + y1) * cr
    a *= 0.5
    if abs(a) < 1e-6:
        return 0.0, (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)
    return a, (cx / (6 * a), cy / (6 * a))


def ccw(ring):
    area, _ = area_and_centroid(ring)
    return ring[::-1] if area < 0 else ring


def building_height(bid, tags, area):
    if "height" in tags:
        try:
            h = float(str(tags["height"]).replace("m", "").strip())
            if h > 1:
                return h
        except ValueError:
            pass
    levels = None
    if tags.get("building:levels"):
        try:
            levels = max(1, int(float(tags["building:levels"])))
        except ValueError:
            levels = None
    if levels is None:
        kind = tags.get("building", "yes")
        if kind in ("industrial", "warehouse", "hangar"):
            return 7.0 + stable_rand(bid, "h") * 4
        if area > 900:
            return 6.0 + stable_rand(bid, "h") * 5
        r = stable_rand(bid, "lv")
        levels = 1 if r < 0.80 else 2 if r < 0.94 else 3 if r < 0.985 else 4
    return levels * 3.1 + 0.6


def make_building(bid, ring, tags, src):
    ring = ccw(ring)
    area = abs(area_and_centroid(ring)[0])
    return {
        "p": [c for p in ring for c in p],
        "h": round(building_height(bid, tags, area), 1),
        "w": int(stable_rand(bid, "wall") * 1000),
        "r": int(stable_rand(bid, "roof") * 1000),
        "k": tags.get("building", "yes"),
        "s": src,
    }


def main(src, dst, extra=None, fill=False, zone=None):
    global ORIGIN_LAT, ORIGIN_LON, SKIP_BUILDINGS
    zone = zone or {}
    if zone.get("origin"):
        ORIGIN_LAT, ORIGIN_LON = zone["origin"]
    if "skip_ways" in zone:
        SKIP_BUILDINGS = set(zone["skip_ways"])
    clear_circles = zone.get("clear", [[0, 0, ESPLANADE_RADIUS]])
    root = ET.parse(src).getroot()
    nodes, pois, trees = {}, [], []
    for n in root.iter("node"):
        nodes[n.get("id")] = project(float(n.get("lat")), float(n.get("lon")))
        tags = {t.get("k"): t.get("v") for t in n.iter("tag")}
        if tags.get("natural") == "tree":
            trees.append(list(nodes[n.get("id")]))
        if tags.get("name") and any(k in tags for k in POI_KEYS):
            cat = next(tags[k] for k in POI_KEYS if k in tags)
            x, y = nodes[n.get("id")]
            pois.append({"id": "n" + n.get("id"), "name": tags["name"], "cat": cat, "x": x, "y": y})

    buildings, roads, greens, water, woods, steps, open_areas = [], [], [], [], [], [], []
    for w in root.iter("way"):
        tags = {t.get("k"): t.get("v") for t in w.iter("tag")}
        wid = w.get("id")
        pts = [nodes[nd.get("ref")] for nd in w.iter("nd") if nd.get("ref") in nodes]
        if len(pts) < 2:
            continue
        closed = len(pts) > 3 and pts[0] == pts[-1]

        if "building" in tags and closed and wid not in SKIP_BUILDINGS:
            ring = pts[:-1]
            if abs(area_and_centroid(ring)[0]) < 6:
                continue
            buildings.append(make_building(wid, ring, tags, "osm"))
            if tags.get("name") and any(k in tags for k in POI_KEYS + ("building",)):
                cat = next((tags[k] for k in POI_KEYS if k in tags), tags.get("building"))
                _, (cx, cy) = area_and_centroid(ring)
                pois.append({"id": "w" + wid, "name": tags["name"], "cat": cat, "x": round(cx, 1), "y": round(cy, 1)})
            continue

        if tags.get("highway") == "steps":
            steps.append(pts)
            continue

        if tags.get("natural") == "tree_row":
            for p in pts:
                trees.append(list(p))
            continue

        hw = tags.get("highway")
        if hw in ROADS and tags.get("area") != "yes":
            width, surf = ROADS[hw]
            if "width" in tags:
                try:
                    width = float(tags["width"].replace("m", ""))
                except ValueError:
                    pass
            if "surface" in tags:
                surf = "asphalt" if tags["surface"] in PAVED else "dirt"
            one_way = tags.get("oneway") == "yes"
            roads.append({
                "p": [c for p in pts for c in p],
                "w": width if one_way or hw not in ("trunk", "primary") else width * 1.4,
                "s": surf, "t": hw, "n": tags.get("name", ""), "b": 1 if tags.get("bridge") == "yes" else 0,
            })
            continue

        if closed and tags.get("natural") == "water" or (closed and tags.get("leisure") == "swimming_pool"):
            water.append({"p": [c for p in ccw(pts[:-1]) for c in p]})
            continue

        if closed and any((k, tags.get(k)) in GREEN for k in ("landuse", "leisure", "natural")):
            ring = ccw(pts[:-1])
            greens.append({"p": [c for p in ring for c in p]})
            if any((k, tags.get(k)) in WOODED for k in ("landuse", "natural")):
                woods.append(ring)
            if tags.get("name"):
                _, (cx, cy) = area_and_centroid(ring)
                pois.append({"id": "w" + wid, "name": tags["name"], "cat": "park", "x": round(cx, 1), "y": round(cy, 1)})
            continue

        if closed and (tags.get("landuse") in ("commercial", "industrial", "retail", "railway", "cemetery")
                       or tags.get("amenity") in ("university", "school", "hospital", "college", "parking")):
            open_areas.append(pts[:-1])

        if closed and ((tags.get("name") and tags.get("landuse") in ("commercial", "industrial", "retail"))
                       or tags.get("amenity") in ("university", "school", "hospital")):
            _, (cx, cy) = area_and_centroid(pts[:-1])
            if tags.get("name"):
                pois.append({"id": "w" + wid, "name": tags["name"], "cat": tags.get("amenity", tags.get("landuse")),
                             "x": round(cx, 1), "y": round(cy, 1)})

    # Formes de monuments (stade, palais...) demandées par la zone.
    shapes = {}
    ways_by_id = {w.get("id"): w for w in root.iter("way")}
    rels_by_id = {r.get("id"): r for r in root.iter("relation")}
    for key, ref in zone.get("shapes", {}).items():
        kind, oid = ref.split(":")
        way_ids = [oid] if kind == "way" else [m.get("ref") for m in rels_by_id.get(oid, []) if m.tag == "member"
                                                and m.get("type") == "way" and m.get("role") in ("outer", "")]
        ring = []
        for wid2 in way_ids:
            w2 = ways_by_id.get(wid2)
            if w2 is None:
                continue
            pts2 = [nodes[nd.get("ref")] for nd in w2.iter("nd") if nd.get("ref") in nodes]
            if ring and pts2 and ring[-1] != pts2[0] and ring[-1] == pts2[-1]:
                pts2 = pts2[::-1]
            ring += pts2 if not ring else pts2[1:]
        if len(ring) >= 3:
            if ring[0] == ring[-1]:
                ring = ring[:-1]
            shapes[key] = [c for p in ccw(ring) for c in p]
            # Les monuments modélisés à la main ne reçoivent pas de maisons.
            if key != "hopital_site":
                open_areas.append(ccw(ring))

    b = root.find("bounds")
    bx0, by0 = project(float(b.get("minlat")), float(b.get("minlon")))
    bx1, by1 = project(float(b.get("maxlat")), float(b.get("maxlon")))
    stats = {"osm": len(buildings)}

    if extra or fill or woods:
        from shapely.geometry import LineString, Point, Polygon, box
        from shapely.strtree import STRtree
        from shapely.affinity import rotate, translate

        def poly_of(bld):
            p = bld["p"]
            return Polygon([(p[i], p[i + 1]) for i in range(0, len(p), 2)])

        # Bâtiments satellites (Google Open Buildings via Overture).
        if extra:
            fc = json.load(open(extra))
            ex_geoms = [poly_of(bd).buffer(0) for bd in buildings]
            existing = STRtree(ex_geoms)
            added = 0
            for f in fc["features"]:
                geom = f["geometry"]
                rings = geom["coordinates"] if geom["type"] == "Polygon" else geom["coordinates"][0]
                ring = [project(lat, lon) for lon, lat in rings[0]][:-1]
                if len(ring) < 3:
                    continue
                pg = Polygon(ring).buffer(0)
                if pg.area < 8 or any(math.hypot(pg.centroid.x - cx0, pg.centroid.y - cy0) < rad
                                      for cx0, cy0, rad in clear_circles):
                    continue
                if any(pg.intersection(ex_geoms[i]).area > 0.3 * pg.area for i in existing.query(pg)):
                    continue
                props = f["properties"]
                tags = {}
                if props.get("height"):
                    tags["height"] = props["height"]
                if props.get("levels"):
                    tags["building:levels"] = props["levels"]
                buildings.append(make_building(str(props["id"])[:16], ring, tags, "google"))
                added += 1
            stats["google"] = added

        # Obstacles : routes (avec trottoir), bâtiments, verdure, eau, esplanade.
        road_geoms = []
        for r in roads:
            p = r["p"]
            line = LineString([(p[i], p[i + 1]) for i in range(0, len(p), 2)])
            road_geoms.append((line, r))
        obstacles = [line.buffer(r["w"] / 2 + 1.5) for line, r in road_geoms]
        obstacles += [poly_of(bd).buffer(1.2) for bd in buildings]
        obstacles += [Polygon([(g["p"][i], g["p"][i + 1]) for i in range(0, len(g["p"]), 2)]).buffer(0) for g in greens + water]
        for cx0, cy0, rad in clear_circles:
            obstacles.append(Point(cx0, cy0).buffer(rad))
        # Grandes emprises (hôpital, écoles, zones industrielles...) : pas de maison générée.
        for r_ in open_areas:
            if len(r_) >= 3:
                obstacles.append(Polygon(r_).buffer(0))
        for key, flat in shapes.items():
            if key != "hopital_site":
                obstacles.append(Polygon([(flat[i], flat[i + 1]) for i in range(0, len(flat), 2)]).buffer(
                    zone.get("monument_clearance", {}).get(key, 3)))
        tree_idx = STRtree(obstacles)
        area_box = box(bx0 + 5, by0 + 5, bx1 - 5, by1 - 5)

        def free(pg):
            if not area_box.contains(pg):
                return False
            return not any(obstacles[i].intersects(pg) for i in tree_idx.query(pg))

        if fill:
            rng = random.Random(2026)
            new = []
            for line, r in road_geoms:
                if r["t"] not in FILL_ROADS or line.length < 12:
                    continue
                d = 4.0
                while d < line.length - 4.0:
                    a = line.interpolate(d - 1.0)
                    c = line.interpolate(d + 1.0)
                    ang = math.degrees(math.atan2(c.y - a.y, c.x - a.x))
                    mid = line.interpolate(d)
                    nx, ny = -(c.y - a.y) / 2.0, (c.x - a.x) / 2.0
                    for side in (1, -1):
                        depth_off = r["w"] / 2 + 2.5
                        for row in range(2):   # 1re et 2e rangée de parcelles
                            wdt = rng.uniform(7.5, 12.0)
                            dep = rng.uniform(8.0, 13.0)
                            off = depth_off + dep / 2 + row * rng.uniform(13.0, 17.0)
                            cx = mid.x + nx * off * side + rng.uniform(-0.8, 0.8)
                            cy = mid.y + ny * off * side + rng.uniform(-0.8, 0.8)
                            pg = rotate(translate(box(-wdt / 2, -dep / 2, wdt / 2, dep / 2), cx, cy), ang + rng.uniform(-3, 3))
                            if free(pg):
                                bid = f"g{len(new)}"
                                ring = [(round(x, 1), round(y, 1)) for x, y in list(pg.exterior.coords)[:-1]]
                                new.append(make_building(bid, ring, {}, "gen"))
                                obstacles.append(pg.buffer(1.8))
                                tree_idx = STRtree(obstacles) if len(new) % 200 == 0 else tree_idx
                    d += rng.uniform(10.0, 14.0)
            # Remplissage des îlots restés vides : grille de parcelles orientées
            # vers la rue la plus proche (hors grandes emprises réelles).
            excl = [Polygon(r).buffer(0) for r in open_areas if len(r) >= 3]
            excl_tree = STRtree(excl) if excl else None
            lines = [l for l, r in road_geoms if r["t"] not in ("footway", "path", "steps")]
            line_tree = STRtree(lines)
            step = 12.5
            gx = bx0 + 8
            while gx < bx1 - 8:
                gy = by0 + 8
                while gy < by1 - 8:
                    p = Point(gx + rng.uniform(-2, 2), gy + rng.uniform(-2, 2))
                    li = lines[line_tree.nearest(p)]
                    if li.distance(p) < 160 and not (excl_tree and any(excl[i].contains(p) for i in excl_tree.query(p))):
                        t = li.project(p)
                        q0, q1 = li.interpolate(max(t - 1, 0)), li.interpolate(min(t + 1, li.length))
                        ang = math.degrees(math.atan2(q1.y - q0.y, q1.x - q0.x)) + rng.uniform(-4, 4)
                        wdt, dep = rng.uniform(7.0, 11.0), rng.uniform(7.5, 11.5)
                        pg = rotate(translate(box(-wdt / 2, -dep / 2, wdt / 2, dep / 2), p.x, p.y), ang)
                        if free(pg):
                            ring = [(round(x, 1), round(y, 1)) for x, y in list(pg.exterior.coords)[:-1]]
                            new.append(make_building(f"g{len(new)}", ring, {}, "gen"))
                            obstacles.append(pg.buffer(1.6))
                            if len(new) % 300 == 0:
                                tree_idx = STRtree(obstacles)
                    gy += step
                gx += step
            # Contrôle final des chevauchements entre maisons générées.
            final, grid = [], {}
            for bd in new:
                pg = poly_of(bd)
                cx, cy = int(pg.centroid.x // 25), int(pg.centroid.y // 25)
                near = [o for gx in (cx - 1, cx, cx + 1) for gy in (cy - 1, cy, cy + 1) for o in grid.get((gx, gy), [])]
                if any(pg.intersects(o) for o in near):
                    continue
                grid.setdefault((cx, cy), []).append(pg.buffer(1.0))
                final.append(bd)
            buildings.extend(final)
            stats["gen"] = len(final)

        # Arbres dans les bois et broussailles cartographiés.
        rng = random.Random(7)
        for ring in woods:
            pg = Polygon(ring)
            minx, miny, maxx, maxy = pg.bounds
            for _ in range(int(pg.area / 120)):
                p = Point(rng.uniform(minx, maxx), rng.uniform(miny, maxy))
                if pg.contains(p):
                    trees.append([round(p.x, 1), round(p.y, 1)])

    # Passerelles piétonnes : deux escaliers distants de 30 à 80 m, de part et
    # d'autre d'une route principale (ex. boulevard Lumumba).
    footbridges = []
    used = set()
    big = [r for r in roads if r["t"] in ("trunk", "primary", "secondary")]
    for i, a in enumerate(steps):
        for j, b in enumerate(steps):
            if j <= i or i in used or j in used:
                continue
            ca = ((a[0][0] + a[-1][0]) / 2, (a[0][1] + a[-1][1]) / 2)
            cb = ((b[0][0] + b[-1][0]) / 2, (b[0][1] + b[-1][1]) / 2)
            d = math.dist(ca, cb)
            if not 30 <= d <= 80:
                continue
            # Une grande route doit passer entre les deux escaliers.
            mid = ((ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2)
            near = False
            for r in big:
                p = r["p"]
                for k in range(0, len(p) - 2, 2):
                    ax, ay, bx, by = p[k], p[k + 1], p[k + 2], p[k + 3]
                    dx, dy = bx - ax, by - ay
                    t = max(0.0, min(1.0, ((mid[0] - ax) * dx + (mid[1] - ay) * dy) / max(dx * dx + dy * dy, 1e-9)))
                    if math.dist(mid, (ax + t * dx, ay + t * dy)) < 25:
                        near = True
                        break
                if near:
                    break
            if near:
                footbridges.append({"a": [round(v, 1) for v in ca], "b": [round(v, 1) for v in cb]})
                used.update((i, j))

    # Façade principale : le mur qui regarde la rue la plus proche ("fe" = index
    # du côté), pour y placer la porte d'entrée et le garage.
    try:
        from shapely.geometry import LineString as _L, Point as _Q
        from shapely.strtree import STRtree as _T
        rl = [_L([(r["p"][i], r["p"][i + 1]) for i in range(0, len(r["p"]), 2)])
              for r in roads if r["t"] not in ("footway", "path", "steps")]
        rt = _T(rl)
        for bd in buildings:
            p = bd["p"]
            n = len(p) // 2
            if n > 12:
                continue
            best, best_d = 0, 1e9
            for i in range(n):
                ax, ay = p[2 * i], p[2 * i + 1]
                bx, by = p[(2 * i + 2) % (2 * n)], p[(2 * i + 3) % (2 * n)]
                length = math.hypot(bx - ax, by - ay)
                if length < 2.5:
                    continue
                # Normale extérieure (polygone anti-horaire) : (dy, -dx).
                nx, ny = (by - ay) / length, -(bx - ax) / length
                q = _Q((ax + bx) / 2 + nx * 2.0, (ay + by) / 2 + ny * 2.0)
                d = rl[rt.nearest(q)].distance(q)
                if d < best_d:
                    best, best_d = i, d
            if best_d < 60:
                bd["fe"] = best
    except ImportError:
        pass

    # Pas de bâtiment sur l'emprise d'un monument modélisé à la main.
    if shapes:
        from shapely.geometry import Polygon as _P0, Point as _Pt
        # Dégagement autour des monuments (parvis, parkings) : réglable par zone.
        clr = zone.get("monument_clearance", {})
        mon = [_P0([(f[i], f[i + 1]) for i in range(0, len(f), 2)]).buffer(clr.get(k, 2)) for k, f in shapes.items() if k != "hopital_site"]
        def _c(bd):
            p = bd["p"]
            n = len(p) // 2
            return _Pt(sum(p[0::2]) / n, sum(p[1::2]) / n)
        buildings = [bd for bd in buildings if not any(m.contains(_c(bd)) for m in mon)]

    # Réglages manuels (hauteurs, couleurs) pour les bâtiments d'un site connu.
    if zone.get("overrides"):
        from shapely.geometry import Polygon as _P
        for ov in zone["overrides"]:
            flat = shapes.get(ov["within"])
            if not flat:
                continue
            site = _P([(flat[i], flat[i + 1]) for i in range(0, len(flat), 2)])
            for bd in buildings:
                p = bd["p"]
                pg = _P([(p[i], p[i + 1]) for i in range(0, len(p), 2)])
                if not site.contains(pg.centroid):
                    continue
                for rule in ov["rules"]:
                    if pg.area >= rule["min_area"]:
                        bd["h"] = round(rule["levels"] * 3.4 + 0.8, 1)
                        bd["wc"] = rule["wall"]
                        if rule.get("flat"):
                            bd["rf"] = 1
                        if rule.get("tag"):
                            bd["tag"] = rule["tag"]
                        if rule.get("style"):
                            bd["st"] = rule["style"]
                        break

    out = {
        "id": zone.get("id", "limete"),
        "shapes": shapes,
        "name": zone.get("name", "Limete — Échangeur, Kinshasa"),
        "attribution": "© les contributeurs d'OpenStreetMap (ODbL 1.0) ; © Overture Maps Foundation ; Google Open Buildings",
        "origin": {"lat": ORIGIN_LAT, "lon": ORIGIN_LON},
        "bounds": [bx0, by0, bx1, by1],
        "buildings": buildings,
        "roads": roads,
        "greens": greens,
        "water": water,
        "trees": trees,
        "footbridges": footbridges,
        "pois": pois,
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"bâtiments {stats} total {len(buildings)}, routes {len(roads)}, verts {len(greens)}, "
          f"eau {len(water)}, arbres {len(trees)}, passerelles {len(footbridges)}, lieux {len(pois)} -> {dst}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    extra = zone = None
    if "--extra" in sys.argv:
        extra = sys.argv[sys.argv.index("--extra") + 1]
        args.remove(extra)
    if "--zone" in sys.argv:
        zpath = sys.argv[sys.argv.index("--zone") + 1]
        args.remove(zpath)
        zone = json.load(open(zpath, encoding="utf-8"))
    if len(args) != 2:
        sys.exit(__doc__)
    main(args[0], args[1], extra=extra, fill="--fill" in sys.argv, zone=zone)
