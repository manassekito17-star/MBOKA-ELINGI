#!/usr/bin/env python3
"""
MBOKA ELENGI — Convertisseur OpenStreetMap -> données de ville pour le jeu.

Lit un extrait OpenStreetMap (.osm, XML) et produit un fichier JSON compact
utilisé par Godot pour générer la ville en 3D (bâtiments, routes, espaces verts,
lieux nommés).

Repère du jeu : origine = centre de la Tour de l'Échangeur (Limete, Kinshasa).
  x = mètres vers l'est, y = mètres vers le nord (Godot : z = -y).

Données : © les contributeurs d'OpenStreetMap, licence ODbL 1.0.
          https://www.openstreetmap.org/copyright

Usage :
  python3 tools/osm/build_city_data.py <extrait.osm> game/data/limete_echangeur.json
"""
import json
import math
import sys
import xml.etree.ElementTree as ET
import zlib

# Centre de la Tour de l'Échangeur (way OSM 57890331).
ORIGIN_LAT = -4.374384
ORIGIN_LON = 15.345467
M_PER_DEG = 111_320.0

# Éléments OSM traités à part (modélisés à la main dans le jeu).
SKIP_BUILDINGS = {"57890331"}  # esplanade de la Tour de l'Échangeur

ROADS = {
    # type OSM : (largeur m, revêtement par défaut)
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
POI_KEYS = ("amenity", "shop", "tourism", "historic", "man_made", "leisure", "office", "government", "craft")


def stable_rand(osm_id: str, salt: str) -> float:
    """Nombre pseudo-aléatoire stable (0..1) : même bâtiment = même aspect à chaque génération."""
    return (zlib.crc32(f"{salt}:{osm_id}".encode()) & 0xFFFFFFFF) / 0xFFFFFFFF


def project(lat: float, lon: float):
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


def building_height(osm_id, tags, area):
    if "height" in tags:
        try:
            h = float(tags["height"].replace("m", "").strip())
            if h > 1:
                return h
        except ValueError:
            pass
    levels = None
    if "building:levels" in tags:
        try:
            levels = max(1, int(float(tags["building:levels"])))
        except ValueError:
            levels = None
    if levels is None:
        kind = tags.get("building", "yes")
        if kind in ("industrial", "warehouse", "hangar"):
            return 7.0 + stable_rand(osm_id, "h") * 4
        if area > 900:
            return 6.0 + stable_rand(osm_id, "h") * 5
        r = stable_rand(osm_id, "lv")
        # Kinshasa : majorité de maisons de plain-pied, quelques étages.
        levels = 1 if r < 0.80 else 2 if r < 0.94 else 3 if r < 0.985 else 4
    return levels * 3.1 + 0.6


def main(src, dst):
    root = ET.parse(src).getroot()
    nodes = {}
    pois = []
    for n in root.iter("node"):
        lat, lon = float(n.get("lat")), float(n.get("lon"))
        nodes[n.get("id")] = project(lat, lon)
        tags = {t.get("k"): t.get("v") for t in n.iter("tag")}
        if tags.get("name") and any(k in tags for k in POI_KEYS):
            cat = next(tags[k] for k in POI_KEYS if k in tags)
            x, y = nodes[n.get("id")]
            pois.append({"id": "n" + n.get("id"), "name": tags["name"], "cat": cat, "x": x, "y": y})

    buildings, roads, greens = [], [], []
    for w in root.iter("way"):
        tags = {t.get("k"): t.get("v") for t in w.iter("tag")}
        wid = w.get("id")
        pts = [nodes[nd.get("ref")] for nd in w.iter("nd") if nd.get("ref") in nodes]
        if len(pts) < 2:
            continue
        closed = len(pts) > 3 and pts[0] == pts[-1]

        if "building" in tags and closed and wid not in SKIP_BUILDINGS:
            ring = pts[:-1]
            area, (cx, cy) = area_and_centroid(ring)
            if area < 0:
                ring.reverse()  # sens anti-horaire (vu du ciel)
            area = abs(area)
            if area < 6:
                continue
            h = building_height(wid, tags, area)
            buildings.append({
                "p": [c for p in ring for c in p],
                "h": round(h, 1),
                "w": int(stable_rand(wid, "wall") * 1000),   # graine couleur de mur
                "r": int(stable_rand(wid, "roof") * 1000),   # graine couleur de toit
                "k": tags.get("building", "yes"),
            })
            if tags.get("name") and any(k in tags for k in POI_KEYS + ("building",)):
                cat = next((tags[k] for k in POI_KEYS if k in tags), tags.get("building"))
                pois.append({"id": "w" + wid, "name": tags["name"], "cat": cat,
                             "x": round(cx, 1), "y": round(cy, 1)})
            continue

        hw = tags.get("highway")
        if hw in ROADS and not tags.get("area") == "yes":
            width, surf = ROADS[hw]
            if "width" in tags:
                try:
                    width = float(tags["width"].replace("m", ""))
                except ValueError:
                    pass
            if "surface" in tags:
                surf = "asphalt" if tags["surface"] in PAVED else "dirt"
            lanes_one_way = tags.get("oneway") == "yes"
            roads.append({
                "p": [c for p in pts for c in p],
                "w": width if lanes_one_way or hw not in ("trunk", "primary") else width * 1.4,
                "s": surf, "t": hw, "n": tags.get("name", ""),
                "b": 1 if tags.get("bridge") == "yes" else 0,
            })
            continue

        if closed and any((k, tags.get(k)) in GREEN for k in ("landuse", "leisure", "natural")):
            ring = pts[:-1]
            area, _ = area_and_centroid(ring)
            if area < 0:
                ring.reverse()
            greens.append({"p": [c for p in ring for c in p]})
            if tags.get("name"):
                _, (cx, cy) = area_and_centroid(ring)
                pois.append({"id": "w" + wid, "name": tags["name"], "cat": "park",
                             "x": round(cx, 1), "y": round(cy, 1)})
            continue

        if closed and tags.get("name") and tags.get("landuse") in ("commercial", "industrial", "retail") \
                or (closed and tags.get("amenity") in ("university", "school", "hospital")):
            _, (cx, cy) = area_and_centroid(pts[:-1])
            if tags.get("name"):
                pois.append({"id": "w" + wid, "name": tags["name"],
                             "cat": tags.get("amenity", tags.get("landuse")),
                             "x": round(cx, 1), "y": round(cy, 1)})

    xs = [v[0] for v in nodes.values()]
    ys = [v[1] for v in nodes.values()]
    b = root.find("bounds")
    bx0, by0 = project(float(b.get("minlat")), float(b.get("minlon")))
    bx1, by1 = project(float(b.get("maxlat")), float(b.get("maxlon")))
    out = {
        "name": "Limete — Échangeur, Kinshasa",
        "attribution": "© les contributeurs d'OpenStreetMap (ODbL 1.0)",
        "origin": {"lat": ORIGIN_LAT, "lon": ORIGIN_LON},
        "bounds": [bx0, by0, bx1, by1],
        "buildings": buildings,
        "roads": roads,
        "greens": greens,
        "pois": pois,
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(buildings)} bâtiments, {len(roads)} routes, {len(greens)} espaces verts, "
          f"{len(pois)} lieux -> {dst}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
