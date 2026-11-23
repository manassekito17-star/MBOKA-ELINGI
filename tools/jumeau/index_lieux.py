#!/usr/bin/env python3
"""
Index des lieux d'une zone jouable (pour la mini-carte, la grande carte et les missions).

Rassemble les lieux RÉELS (et l'eau, dans eau.json) (Overture / OSM) de toutes les tuiles d'une zone dans
<zone>/lieux.json : liste compacte [x, z, nom, catégorie, confiance].
Usage : python3 tools/jumeau/index_lieux.py web/kinshasa/jeu/zones/<zone> [...]
"""
import glob
import json
import os
import sys

for dossier in sys.argv[1:]:
    vus, lieux = set(), []
    for f in sorted(glob.glob(os.path.join(dossier, "c_*.json"))):
        for l in json.load(open(f, encoding="utf-8"))["l"]:
            cle = (round(l["x"]), round(l["z"]), l["n"])
            if cle in vus:
                continue
            vus.add(cle)
            lieux.append([l["x"], l["z"], l["n"], l.get("k", ""), l.get("f", 0)])
    json.dump(lieux, open(os.path.join(dossier, "lieux.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    # Eau de toute la zone (fleuve, rivières), fusionnée et simplifiée à 4 m : pour la grande carte.
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    polys = []
    for f in sorted(glob.glob(os.path.join(dossier, "c_*.json"))):
        for w in json.load(open(f, encoding="utf-8"))["w"]:
            p = w["p"]
            if len(p) >= 6:
                pg = Polygon(list(zip(p[::2], p[1::2]))).buffer(0.5)
                if pg.is_valid and pg.area > 30:
                    polys.append(pg)
    eau = []
    if polys:
        u = unary_union(polys).simplify(4)
        for g in (u.geoms if hasattr(u, "geoms") else [u]):
            if g.geom_type == "Polygon" and g.area > 60:
                eau.append([round(v, 1) for xy in g.exterior.coords for v in xy])
    json.dump(eau, open(os.path.join(dossier, "eau.json"), "w"), separators=(",", ":"))
    print(dossier, len(lieux), "lieux,", len(eau), "étendues d'eau")
