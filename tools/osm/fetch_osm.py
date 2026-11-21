#!/usr/bin/env python3
"""
Télécharge un extrait OpenStreetMap (zone rectangulaire) via l'API officielle.

Usage :
  python3 tools/osm/fetch_osm.py <ouest> <sud> <est> <nord> <sortie.osm>
Exemple (zone pilote Limete / Échangeur) :
  python3 tools/osm/fetch_osm.py 15.336 -4.385 15.356 -4.366 echangeur.osm

L'API limite chaque requête à 0,25 degré carré et 50 000 points : pour une zone
plus grande, découper en plusieurs morceaux. Respecter la politique d'usage :
https://operations.osmfoundation.org/policies/api/
"""
import sys
import urllib.request

if len(sys.argv) != 6:
    sys.exit(__doc__)
w, s, e, n, out = sys.argv[1:]
url = f"https://api.openstreetmap.org/api/0.6/map?bbox={w},{s},{e},{n}"
req = urllib.request.Request(url, headers={"User-Agent": "MbokaElengi-map-tool/0.1"})
with urllib.request.urlopen(req, timeout=180) as r, open(out, "wb") as f:
    f.write(r.read())
print("OK ->", out)
