#!/usr/bin/env bash
# Jumeau numérique de Kinshasa — étape 2 : tuiles vectorielles (PMTiles).
# Entrée : build/jumeau/sources/*.geojsonl (voir extraire_donnees.py)
# Sortie : web/kinshasa/donnees/kinshasa.pmtiles (un seul fichier, lu par
#          morceaux via des requêtes HTTP « Range » : la ville n'est jamais
#          chargée entièrement en mémoire).
# Nécessite : tippecanoe (>= 2.17) et tile-join.
set -euo pipefail
SRC=${1:-build/jumeau/sources}
TMP=${2:-build/jumeau/tuiles}
OUT=${3:-web/kinshasa/donnees}
mkdir -p "$TMP" "$OUT"

# Bâtiments : à partir du zoom 13 (quartier), tous conservés au zoom 15.
tippecanoe -q --force --generate-ids -o "$TMP/batiments.pmtiles" -l batiments -Z13 -z15 \
  --drop-densest-as-needed --extend-zooms-if-still-dropping -P "$SRC/batiments.geojsonl"

# Routes : grands axes visibles de loin, rues de quartier à partir du zoom 13.
python3 - "$SRC/routes.geojsonl" "$TMP" <<'EOF'
import json, sys
src, tmp = sys.argv[1], sys.argv[2]
minz = {"motorway": 8, "trunk": 8, "primary": 9, "secondary": 10, "tertiary": 11,
        "unclassified": 12, "residential": 13, "living_street": 13, "service": 14,
        "track": 14, "path": 14, "footway": 14, "pedestrian": 14, "steps": 15, "cycleway": 15}
with open(src, encoding="utf-8") as f, open(tmp + "/routes_z.geojsonl", "w", encoding="utf-8") as o:
    for line in f:
        ft = json.loads(line)
        ft["tippecanoe"] = {"minzoom": minz.get(ft["properties"].get("classe"), 14)}
        o.write(json.dumps(ft, ensure_ascii=False) + "\n")
EOF
tippecanoe -q --force -o "$TMP/routes.pmtiles" -l routes -Z8 -z15 --no-feature-limit --no-tile-size-limit \
  -P "$TMP/routes_z.geojsonl"

tippecanoe -q --force -o "$TMP/eau.pmtiles" -l eau -Z8 -z15 --no-tile-size-limit -P "$SRC/eau.geojsonl"
tippecanoe -q --force -o "$TMP/sol.pmtiles" -l sol -Z10 -z15 --no-tile-size-limit -P "$SRC/sol.geojsonl"
tippecanoe -q --force -o "$TMP/lieux.pmtiles" -l lieux -Z12 -z15 -r1 --no-feature-limit -P "$SRC/lieux.geojsonl"
tippecanoe -q --force -o "$TMP/limites.pmtiles" -l limites -Z8 -z15 --no-tile-size-limit "$SRC/limites.geojsonl"

tile-join -q --force -o "$OUT/kinshasa.pmtiles" --no-tile-size-limit \
  -n "Jumeau numérique de Kinshasa" \
  -A "© les contributeurs d'OpenStreetMap (ODbL) · © Overture Maps Foundation · Google Open Buildings (CC BY 4.0)" \
  "$TMP/batiments.pmtiles" "$TMP/routes.pmtiles" "$TMP/eau.pmtiles" "$TMP/sol.pmtiles" \
  "$TMP/lieux.pmtiles" "$TMP/limites.pmtiles"
ls -la "$OUT/kinshasa.pmtiles"
