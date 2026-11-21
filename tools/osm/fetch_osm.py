#!/usr/bin/env python3
"""
Télécharge un extrait OpenStreetMap (zone rectangulaire) via l'API officielle.
La zone est découpée automatiquement en tuiles (l'API refuse les zones de plus
de 50 000 points), puis les tuiles sont fusionnées (sans doublons).

Usage :
  python3 tools/osm/fetch_osm.py <ouest> <sud> <est> <nord> <sortie.osm> [tuiles_par_côté]
Exemple (Limete, de l'Échangeur à la 7e rue) :
  python3 tools/osm/fetch_osm.py 15.328 -4.385 15.356 -4.345 limete.osm 3

Politique d'usage de l'API : https://operations.osmfoundation.org/policies/api/
"""
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

if len(sys.argv) < 6:
    sys.exit(__doc__)
w, s, e, n = map(float, sys.argv[1:5])
out = sys.argv[5]
k = int(sys.argv[6]) if len(sys.argv) > 6 else 1
seen = {"node": {}, "way": {}, "relation": {}}
for i in range(k):
    for j in range(k):
        tw, te = w + (e - w) * i / k, w + (e - w) * (i + 1) / k
        ts, tn = s + (n - s) * j / k, s + (n - s) * (j + 1) / k
        url = f"https://api.openstreetmap.org/api/0.6/map?bbox={tw:.6f},{ts:.6f},{te:.6f},{tn:.6f}"
        req = urllib.request.Request(url, headers={"User-Agent": "MbokaElengi-map-tool/0.2"})
        with urllib.request.urlopen(req, timeout=300) as r:
            root = ET.fromstring(r.read())
        for el in root:
            if el.tag in seen:
                seen[el.tag][el.get("id")] = el
        print(f"tuile {i},{j} OK")
        time.sleep(1)
osm = ET.Element("osm", version="0.6", generator="MbokaElengi")
ET.SubElement(osm, "bounds", minlat=str(s), minlon=str(w), maxlat=str(n), maxlon=str(e))
for tag in ("node", "way", "relation"):
    for el in seen[tag].values():
        osm.append(el)
ET.ElementTree(osm).write(out, encoding="utf-8", xml_declaration=True)
print(f"{len(seen['node'])} points, {len(seen['way'])} lignes -> {out}")
