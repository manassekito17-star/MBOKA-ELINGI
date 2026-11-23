"""Extrait les données RÉELLES d'un site remarquable pour sa modélisation dans Blender.

Sortie : tools/batiments/donnees/<id>.json, en mètres autour d'un point d'ancrage GPS
(repère : x = est, z = sud, comme le jeu) :
  - empreintes des bâtiments (tuiles de la zone : OSM, Overture, Google Open Buildings),
    avec leur hauteur (documentée ou estimée) et leur source ;
  - contour du terrain (OpenStreetMap) si fourni ;
  - routes proches (réseau de la zone) avec leur nom.

Usage :
  python3 tools/batiments/extraire_site.py <id> <zone> <lat> <lon> <rayon_m> [osm_site ...]
Exemple :
  python3 tools/batiments/extraire_site.py cinquantenaire centre -4.34169 15.29633 230 way:102422512
"""
import glob
import json
import math
import os
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

RACINE = os.path.join(os.path.dirname(__file__), "..", "..")
M_LAT = 111_320.0


def contour_osm(ref):
    """Contour (lat, lon) d'un chemin OSM (API officielle)."""
    genre, ident = ref.split(":")
    url = f"https://api.openstreetmap.org/api/0.6/{genre}/{ident}/full"
    req = urllib.request.Request(url, headers={"User-Agent": "KinshasaDigitalTwin/1.0 (outil de modelisation)"})
    for essai in range(5):
        try:
            x = ET.fromstring(urllib.request.urlopen(req, timeout=60).read())
            break
        except Exception as e:  # réseau capricieux : on réessaie
            print("  nouvel essai OSM :", e, file=sys.stderr)
            time.sleep(3 * (essai + 1))
    noeuds = {n.get("id"): (float(n.get("lat")), float(n.get("lon"))) for n in x.iter("node")}
    if genre == "way":
        w = x.find("way")
        tags = {t.get("k"): t.get("v") for t in w.iter("tag")}
        return [noeuds[n.get("ref")] for n in w.iter("nd")], tags
    raise ValueError("seuls les chemins (way:) sont gérés ici")


def main(ident, zone, lat, lon, rayon, sites):
    dz = os.path.join(RACINE, "web", "kinshasa", "jeu", "zones", zone)
    man = json.load(open(os.path.join(dz, "manifest.json"), encoding="utf-8"))
    lat0, lon0 = man["origine"]
    m_lon = M_LAT * math.cos(math.radians(lat0))
    ax, az = (lon - lon0) * m_lon, -(lat - lat0) * M_LAT          # ancre dans le repère de la zone
    loc = lambda x, z: [round(x - ax, 2), round(z - az, 2)]
    ll2 = lambda la, lo: loc((lo - lon0) * m_lon, -(la - lat0) * M_LAT)

    batiments = []
    for f in glob.glob(os.path.join(dz, "c_*.json")):
        for b in json.load(open(f))["b"]:
            p = b["p"]
            n = len(p) // 2
            cx, cz = sum(p[0::2]) / n, sum(p[1::2]) / n
            if math.hypot(cx - ax, cz - az) > rayon:
                continue
            pts = [loc(p[2 * i], p[2 * i + 1]) for i in range(n)]
            a = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n)) / 2
            batiments.append({"p": pts, "h": b["h"], "aire": round(abs(a)), "source": "osm" if b.get("c") else "satellite",
                              "hauteur": "documentee" if b.get("hd") else "estimee"})
    batiments.sort(key=lambda b: -b["aire"])

    routes = []
    for a in json.load(open(os.path.join(dz, "reseau.json"))):
        p = a["p"]
        pts = [loc(p[i], p[i + 1]) for i in range(0, len(p), 2)]
        if any(math.hypot(x, z) < rayon * 1.3 for x, z in pts):
            routes.append({"p": pts, "classe": a.get("k"), "nom": a.get("n")})

    contours = {}
    for ref in sites:
        ring, tags = contour_osm(ref)
        contours[ref] = {"p": [ll2(la, lo) for la, lo in ring], "nom": tags.get("name"), "tags": tags}

    sortie = {
        "id": ident, "zone": zone, "ancre": {"lat": lat, "lon": lon},
        "repere": "x = est, z = sud, en mètres autour de l'ancre",
        "sources": "Empreintes : tuiles de la zone (OpenStreetMap, Overture Maps, Google Open Buildings). "
                   "Contours de terrain : OpenStreetMap (ODbL). Hauteurs « estimee » : estimation, pas une mesure.",
        "contours": contours, "batiments": batiments, "routes": routes,
    }
    os.makedirs(os.path.join(os.path.dirname(__file__), "donnees"), exist_ok=True)
    chemin = os.path.join(os.path.dirname(__file__), "donnees", f"{ident}.json")
    json.dump(sortie, open(chemin, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{ident} : {len(batiments)} bâtiments, {len(routes)} tronçons de route, {len(contours)} contour(s) -> {chemin}")


if __name__ == "__main__":
    if len(sys.argv) < 6:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), sys.argv[6:])
