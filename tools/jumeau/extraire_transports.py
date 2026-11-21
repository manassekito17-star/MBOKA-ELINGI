#!/usr/bin/env python3
"""
Jumeau numérique de Kinshasa — transports RÉELS d'une zone jouable.

Depuis OpenStreetMap (API officielle) :
  - lignes de bus (relations route=bus) : tracé et nom (ex. ligne 02 Transco
    « Royal – Masina sans fil ») ;
  - arrêts de bus (highway=bus_stop, public_transport=platform/stop_position) ;
  - gares routières (amenity=bus_station) ;
  - passages piétons (highway=crossing) et feux (highway=traffic_signals).

Sortie : <zone>/transports.json (repère local de la zone, mètres).
Tout ce qui est écrit ici est RÉEL (cartographié). Le jeu ajoute ensuite, en
les marquant « simulé », des lignes de minibus, des arrêts et des feux là où
la carte n'en a pas.

Usage :
  python3 tools/jumeau/extraire_transports.py web/kinshasa/jeu/zones/limete
"""
import json
import math
import os
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

from shapely.geometry import LineString, Point, box
from shapely.ops import linemerge

M_LAT = 111_320.0


def api(chemin):
    req = urllib.request.Request("https://api.openstreetmap.org/api/0.6/" + chemin,
                                 headers={"User-Agent": "MbokaElengi-map-tool/0.3"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return ET.fromstring(r.read())


def main(dossier):
    man = json.load(open(os.path.join(dossier, "manifest.json"), encoding="utf-8"))
    lat0, lon0 = man["origine"]
    demi = man["demi"]
    m_lon = M_LAT * math.cos(math.radians(lat0))

    def xz(lat, lon):
        return (lon - lon0) * m_lon, -(lat - lat0) * M_LAT

    dlon, dlat = demi / m_lon, demi / M_LAT
    W, E, S, N = lon0 - dlon, lon0 + dlon, lat0 - dlat, lat0 + dlat
    zone = box(-demi, -demi, demi, demi)

    # 1. Points d'intérêt transport de la zone (3 × 3 requêtes pour respecter la limite de l'API).
    noeuds, relations = {}, {}
    for i in range(3):
        for j in range(3):
            w, e = W + (E - W) * i / 3, W + (E - W) * (i + 1) / 3
            s, n = S + (N - S) * j / 3, S + (N - S) * (j + 1) / 3
            root = api(f"map?bbox={w:.6f},{s:.6f},{e:.6f},{n:.6f}")
            for nd in root.iter("node"):
                t = {x.get("k"): x.get("v") for x in nd.iter("tag")}
                if t:
                    noeuds[nd.get("id")] = (float(nd.get("lat")), float(nd.get("lon")), t)
            for rl in root.iter("relation"):
                t = {x.get("k"): x.get("v") for x in rl.iter("tag")}
                if t.get("route") == "bus":
                    relations[rl.get("id")] = t
            time.sleep(1)

    arrets, passages, feux, gares = [], [], [], []
    for nid, (lat, lon, t) in noeuds.items():
        x, z = xz(lat, lon)
        if not zone.contains(Point(x, z)):
            continue
        item = {"id": "n" + nid, "x": round(x, 1), "z": round(z, 1)}
        if t.get("name"):
            item["nom"] = t["name"]
        if t.get("highway") == "bus_stop" or t.get("public_transport") in ("platform", "stop_position"):
            arrets.append(item)
        elif t.get("highway") == "crossing" or "crossing" in t:
            passages.append(item)
        elif t.get("highway") == "traffic_signals":
            feux.append(item)
        elif t.get("amenity") == "bus_station":
            gares.append(item)

    # 2. Lignes de bus : relation complète, tracé fusionné puis découpé à la zone.
    lignes = []
    for rid, t in relations.items():
        full = api(f"relation/{rid}/full")
        nd = {n.get("id"): (float(n.get("lat")), float(n.get("lon"))) for n in full.iter("node")}
        ways = {w.get("id"): [nd[r.get("ref")] for r in w.iter("nd") if r.get("ref") in nd] for w in full.iter("way")}
        rel = next(r for r in full.iter("relation") if r.get("id") == rid)
        segs = [LineString([xz(*p) for p in ways[m.get("ref")]]) for m in rel.iter("member")
                if m.get("type") == "way" and m.get("ref") in ways and len(ways[m.get("ref")]) >= 2]
        trace = linemerge(segs).intersection(zone)
        parts = [g for g in (trace.geoms if hasattr(trace, "geoms") else [trace]) if g.geom_type == "LineString"]
        if not parts:
            continue
        principal = max(parts, key=lambda g: g.length)
        arrets_ligne = sorted(
            [a for a in arrets if principal.distance(Point(a["x"], a["z"])) < 35],
            key=lambda a: principal.project(Point(a["x"], a["z"])))
        lignes.append({
            "id": "osm" + rid, "ref": t.get("ref", ""), "nom": t.get("name", ""), "operateur": t.get("operator", ""),
            "depart": t.get("from", ""), "terminus": t.get("to", ""), "reel": True,
            "trace": [round(v, 1) for xy in principal.coords for v in xy],
            "longueur_m": round(principal.length), "arrets": [a["id"] for a in arrets_ligne],
        })
        time.sleep(1)

    out = {"source": "OpenStreetMap (ODbL) — récupéré le " + time.strftime("%Y-%m-%d"),
           "lignes": lignes, "arrets": arrets, "passages": passages, "feux": feux, "gares": gares}
    json.dump(out, open(os.path.join(dossier, "transports.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"lignes {len(lignes)}, arrêts {len(arrets)}, passages {len(passages)}, feux {len(feux)}, gares {len(gares)}")
    for l in lignes:
        print(f"  ligne {l['ref']} {l['nom']} : {l['longueur_m']} m dans la zone, {len(l['arrets'])} arrêts")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
