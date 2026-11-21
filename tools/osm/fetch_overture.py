#!/usr/bin/env python3
"""
Télécharge les bâtiments d'Overture Maps (licence ODbL) pour une zone, en ne
gardant que ceux qui NE viennent PAS d'OpenStreetMap (déjà présents) : surtout
Google Open Buildings, détectés par satellite. Ils comblent les vides d'OSM.

Usage :
  python3 tools/osm/fetch_overture.py <ouest> <sud> <est> <nord> <sortie.geojson> [release]
Nécessite : pip install duckdb   (accès anonyme au stockage public d'Overture)
Attribution : © Overture Maps Foundation ; Google Open Buildings (CC BY 4.0 / ODbL).
"""
import json
import os
import sys

import duckdb

if len(sys.argv) < 6:
    sys.exit(__doc__)
w, s, e, n = map(float, sys.argv[1:5])
out = sys.argv[5]
release = sys.argv[6] if len(sys.argv) > 6 else "2026-11-18.0"
for k in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE"):
    os.environ.pop(k, None)
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
con.execute("CREATE SECRET anon (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2');")
rows = con.execute(f"""
  SELECT id, height, num_floors, sources[1].dataset AS src, ST_AsGeoJSON(geometry) AS g
  FROM read_parquet('s3://overturemaps-us-west-2/release/{release}/theme=buildings/type=building/*', hive_partitioning=1)
  WHERE bbox.xmin BETWEEN {w} AND {e} AND bbox.ymin BETWEEN {s} AND {n}
    AND sources[1].dataset <> 'OpenStreetMap'
""").fetchall()
feats = [{"type": "Feature", "properties": {"id": r[0], "height": r[1], "levels": r[2], "src": r[3]},
          "geometry": json.loads(r[4])} for r in rows]
json.dump({"type": "FeatureCollection", "features": feats}, open(out, "w"))
print(len(feats), "bâtiments ->", out)
