#!/usr/bin/env python3
"""
Jumeau numérique de Kinshasa — index de recherche (communes, quartiers,
avenues, lieux). Fichier JSON compact chargé par la page web.

Usage :
  python3 tools/jumeau/construire_index.py build/jumeau/sources web/kinshasa/donnees/index.json
"""
import json
import sys
from collections import defaultdict

from shapely.geometry import shape

src, out = sys.argv[1], sys.argv[2]
COMMUNES = {"Gombe", "Lingwala", "Barumbu", "Kinshasa", "Kintambo", "Ngaliema", "Bandalungwa", "Kasa-Vubu",
            "Kasa Vubu", "Kalamu", "Makala", "Ngiri-Ngiri", "Bumbu", "Selembao", "Mont Ngafula", "Lemba", "Matete",
            "Limete", "Masina", "N'djili", "Kimbanseke", "Kisenso", "Nsele", "Maluku", "Ngaba"}
entries = []

# Communes et quartiers (limites administratives).
seen = set()
for line in open(f"{src}/limites.geojsonl", encoding="utf-8"):
    f = json.loads(line)
    p = f["properties"]
    if not p.get("nom"):
        continue
    g = shape(f["geometry"])
    c = g.representative_point()
    kind = "commune" if p["nom"] in COMMUNES else "quartier"
    key = (p["nom"], kind)
    if key in seen:
        continue
    seen.add(key)
    minx, miny, maxx, maxy = g.bounds
    entries.append({"n": p["nom"], "t": kind, "c": [round(c.x, 5), round(c.y, 5)],
                    "b": [round(minx, 4), round(miny, 4), round(maxx, 4), round(maxy, 4)]})

# Avenues et boulevards : un point par nom (milieu du plus long tronçon).
best = {}
lengths = defaultdict(float)
for line in open(f"{src}/routes.geojsonl", encoding="utf-8"):
    f = json.loads(line)
    name = f["properties"].get("nom")
    if not name:
        continue
    g = shape(f["geometry"])
    lengths[name] += g.length
    if name not in best or g.length > best[name][0]:
        m = g.interpolate(0.5, normalized=True)
        best[name] = (g.length, m.x, m.y, f["properties"].get("classe"))
for name, (_, x, y, cls) in best.items():
    entries.append({"n": name, "t": "rue", "s": cls, "c": [round(x, 5), round(y, 5)],
                    "l": round(lengths[name] * 111.3, 2)})

# Lieux : hôpitaux, écoles, marchés, hôtels...
for line in open(f"{src}/lieux.geojsonl", encoding="utf-8"):
    f = json.loads(line)
    p = f["properties"]
    x, y = f["geometry"]["coordinates"][:2]
    entries.append({"n": p["nom"], "t": "lieu", "s": p.get("categorie") or "", "c": [round(x, 5), round(y, 5)],
                    "f": p.get("fiabilite")})

json.dump(entries, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(entries), "entrées ->", out)
