#!/usr/bin/env python3
"""
Jumeau numérique de Kinshasa — étape 1 : extraction des données réelles.

Source : Overture Maps (release fixée ci-dessous), qui rassemble
  - OpenStreetMap (ODbL)                       bâtiments, routes, eau, limites
  - Google Open Buildings (CC BY 4.0 / ODbL)   bâtiments détectés par satellite
  - Microsoft ML Buildings (ODbL)              bâtiments détectés par satellite
  - Lieux Overture (CDLA Permissive 2.0)       commerces, hôpitaux, écoles...

Chaque bâtiment reçoit un NIVEAU DE CONFIANCE :
  empreinte : "confirmee" (cartographiée à la main dans OSM)
              "satellite" (détectée automatiquement sur image satellite)
  hauteur   : "documentee" (hauteur ou nombre d'étages présent dans la source)
              "estimee"    (déduite de la surface au sol : à vérifier)
Aucun bâtiment n'est inventé dans ce jeu de données.

Sortie : fichiers GeoJSONSeq (un objet par ligne) dans <dossier_sortie>.
Usage :
  python3 tools/jumeau/extraire_donnees.py <dossier_sortie>
Nécessite : pip install duckdb ; accès Internet (stockage public d'Overture).
"""
import os
import sys
import time

import duckdb

RELEASE = "2026-11-18.0"
# Agglomération de Kinshasa (zone urbaine continue + abords du fleuve).
W, S, E, N = 15.15, -4.62, 15.62, -4.27

OUT = next((a for a in sys.argv[1:] if not a.startswith("--")), "build/jumeau/sources")
os.makedirs(OUT, exist_ok=True)
for k in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE"):
    os.environ.pop(k, None)

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
con.execute("CREATE SECRET anon (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2');")
con.execute("SET preserve_insertion_order=false; SET geometry_always_xy = true;")
R = f"s3://overturemaps-us-west-2/release/{RELEASE}"
BBOX = f"bbox.xmin BETWEEN {W} AND {E} AND bbox.ymin BETWEEN {S} AND {N}"


def export(name, sql):
    t = time.time()
    path = os.path.join(OUT, name + ".geojsonl")
    if os.path.exists(path):
        os.remove(path)
    con.execute(f"COPY ({sql}) TO '{path}' (FORMAT GDAL, DRIVER 'GeoJSONSeq')")
    n = sum(1 for _ in open(path, encoding="utf-8"))
    print(f"{name:12s} {n:>9} objets  {os.path.getsize(path) / 1e6:7.1f} Mo  {time.time() - t:5.0f} s")


# --- Bâtiments ---------------------------------------------------------------
export("batiments", f"""
SELECT
  geometry,
  CASE sources[1].dataset WHEN 'OpenStreetMap' THEN 'confirmee' ELSE 'satellite' END AS empreinte,
  CASE sources[1].dataset WHEN 'OpenStreetMap' THEN 'OSM'
       WHEN 'Google Open Buildings' THEN 'Google' ELSE 'Microsoft' END AS source,
  CASE WHEN height IS NOT NULL OR num_floors IS NOT NULL THEN 'documentee' ELSE 'estimee' END AS hauteur_statut,
  round(COALESCE(height, num_floors * 3.2 + 0.8,
        -- Estimation prudente d'après la surface au sol (maisons basses majoritaires).
        CASE WHEN ST_Area_Spheroid(geometry) < 120 THEN 3.6
             WHEN ST_Area_Spheroid(geometry) < 350 THEN 4.5
             WHEN ST_Area_Spheroid(geometry) < 1200 THEN 7.5
             ELSE 10.5 END), 1) AS hauteur,
  num_floors AS etages,
  COALESCE(class, subtype) AS categorie,
  names.primary AS nom,
  CAST(hash(id) % 8 AS INTEGER) AS v   -- variante d'apparence (couleur de façade)
FROM read_parquet('{R}/theme=buildings/type=building/*', hive_partitioning=1)
WHERE {BBOX}
""")

import sys as _s
if "--batiments-seulement" in _s.argv:
    raise SystemExit(0)

# --- Routes -------------------------------------------------------------------
export("routes", f"""
SELECT geometry, class AS classe, names.primary AS nom,
       CASE WHEN road_surface IS NOT NULL THEN road_surface[1].value END AS revetement
FROM read_parquet('{R}/theme=transportation/type=segment/*', hive_partitioning=1)
WHERE {BBOX} AND subtype = 'road'
""")

# --- Lieux (points d'intérêt) -------------------------------------------------
export("lieux", f"""
SELECT geometry, names.primary AS nom, basic_category AS categorie,
       round(confidence, 2) AS fiabilite,
       addresses[1].freeform AS adresse
FROM read_parquet('{R}/theme=places/type=place/*', hive_partitioning=1)
WHERE {BBOX} AND names.primary IS NOT NULL
""")

# --- Eau (fleuve, rivières) ---------------------------------------------------
export("eau", f"""
SELECT geometry, subtype AS type, class AS classe, names.primary AS nom
FROM read_parquet('{R}/theme=base/type=water/*', hive_partitioning=1)
WHERE bbox.xmax >= {W} AND bbox.xmin <= {E} AND bbox.ymax >= {S} AND bbox.ymin <= {N}
""")

# --- Occupation du sol (parcs, zones industrielles, cimetières...) ------------
export("sol", f"""
SELECT geometry, subtype AS type, class AS classe, names.primary AS nom
FROM read_parquet('{R}/theme=base/type=land_use/*', hive_partitioning=1)
WHERE {BBOX}
""")

# --- Communes et quartiers ----------------------------------------------------
export("limites", f"""
SELECT geometry, subtype AS niveau, names.primary AS nom
FROM read_parquet('{R}/theme=divisions/type=division_area/*', hive_partitioning=1)
WHERE bbox.xmin > 15.0 AND bbox.xmax < 16.7 AND bbox.ymin > -5.2 AND bbox.ymax < -3.8
  AND subtype IN ('locality', 'neighborhood', 'microhood')
""")
print("Terminé ->", OUT)
