"""Inventaire automatique des bâtiments à reproduire, pour toute l'agglomération de Kinshasa.

Source : lieux nommés d'Overture Maps (release 2026-11-18.0, sans compte, via DuckDB), communes d'Overture.
Chaque lieu reçoit une priorité (ordre demandé) :
  1 emblématiques (sites historiques, monuments, musées, places, centres culturels, foires)
  2 hôpitaux et cliniques      3 stades        4 universités et instituts supérieurs
  5 hôtels                      6 centres commerciaux, grands magasins, marchés
  7 administrations, ambassades, gares, aéroport, banques, sièges d'entreprise
  (8 immeubles résidentiels et 9 maisons : déjà couverts par les 1,38 million d'empreintes réelles
   du jumeau, avec une apparence générique — non listés ici.)
Statut : « modélisé » (modèle individuel dans donnees/batiments.json) ou « à modéliser ».

Sortie : web/kinshasa/jeu/donnees/inventaire_batiments.json
Usage  : python3 tools/batiments/inventaire.py
"""
import json
import math
import os
import re
import unicodedata

import duckdb

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.join(ICI, "..", "..")
SORTIE = os.path.join(RACINE, "web", "kinshasa", "jeu", "donnees", "inventaire_batiments.json")
RELEASE = "2026-11-18.0"
W, E, S, N = 15.10, 15.65, -4.60, -4.25          # agglomération de Kinshasa (zone urbaine)

PRIORITES = {
    1: ("Emblématique", {"historic_site", "monument", "museum", "public_plaza", "cultural_center", "art_gallery", "amusement_park"}),
    2: ("Hôpital ou clinique", {"hospital"}),
    3: ("Stade", {"stadium_arena"}),
    4: ("Université ou institut", {"college_university", "campus_building"}),
    5: ("Hôtel", {"hotel", "resort"}),
    6: ("Centre commercial ou marché", {"shopping_mall", "department_store", "warehouse_club_store"}),
    7: ("Administration, transport, banque", {"government_office", "embassy", "courthouse", "community_and_government", "train_station",
                                               "airport", "bank_or_credit_union", "corporate_or_business_office"}),
}
RE_HOPITAL = re.compile(r"h[oô]pital|clinique|centre hospitalier|cliniques|maternit", re.I)
RE_MARCHE = re.compile(r"\bmarch[ée]\b|supermarch|market", re.I)


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn")).strip()


def priorite(nom, cat):
    for p, (_, cats) in PRIORITES.items():
        if cat in cats:
            return p
    if cat in ("health_care", "outpatient_care_facility") and RE_HOPITAL.search(nom):
        return 2
    if cat in ("shopping", "food_and_beverage_store") and RE_MARCHE.search(nom):
        return 6
    return None


def communes():
    g = json.load(open(os.path.join(RACINE, "data", "kinshasa", "communes_overture.geojson"), encoding="utf-8"))
    out = []
    for f in g["features"]:
        geom = f["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        pr = f["properties"]
        if (pr.get("km2") or 0) > 500:          # la province entière, pas une commune
            continue
        out.append((pr.get("commune") or pr.get("nom") or pr.get("name"), [p[0] for p in polys]))
    return out


def dans(lon, lat, ring):
    c = False
    for i in range(len(ring)):
        x1, y1 = ring[i - 1][:2]
        x2, y2 = ring[i][:2]
        if (y2 > lat) != (y1 > lat) and lon < (x1 - x2) * (lat - y2) / (y1 - y2) + x2:
            c = not c
    return c


def main():
    for k in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE"):
        os.environ.pop(k, None)
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    con.execute("CREATE SECRET anon (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2');")
    R = f"s3://overturemaps-us-west-2/release/{RELEASE}"
    rows = con.execute(f"""SELECT names.primary, basic_category, confidence, ST_X(geometry), ST_Y(geometry)
        FROM read_parquet('{R}/theme=places/type=place/*', hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {W} AND {E} AND bbox.ymin BETWEEN {S} AND {N} AND names.primary IS NOT NULL""").fetchall()
    print(f"{len(rows)} lieux nommés")
    registre = json.load(open(os.path.join(RACINE, "web", "kinshasa", "jeu", "donnees", "batiments.json"), encoding="utf-8"))
    VIDES = {"de", "du", "des", "la", "le", "les", "l", "d", "et", "hopital", "general", "reference", "stade", "foire", "internationale", "kinshasa"}
    mots = lambda b: {m for m in norm(" ".join([b["nom_courant"], b["nom_officiel"], *b.get("autres_noms", [])])).split() if len(m) > 3 and m not in VIDES}
    modeles = [(b["id"], b["gps"]["lat"], b["gps"]["lon"], mots(b)) for b in registre["batiments"] if b.get("modele")]
    cs = communes()
    vus, liste = {}, []
    for nom, cat, conf, lon, lat in rows:
        p = priorite(nom, cat or "")
        if p is None or (conf or 0) < 0.4:
            continue
        cle = norm(nom)
        # Doublons : même nom à moins de 250 m.
        if any(math.hypot((lon - o[0]) * 111000, (lat - o[1]) * 111000) < 250 for o in vus.get(cle, [])):
            continue
        vus.setdefault(cle, []).append((lon, lat))
        commune = next((c for c, rings in cs if any(dans(lon, lat, r) for r in rings)), None)
        statut, ident = "à modéliser", None
        for i, la, lo, mm in modeles:
            if math.hypot((lon - lo) * 111000, (lat - la) * 111000) < 400 and mm & set(cle.split()):
                statut, ident = "modélisé", i
        liste.append({"nom": nom, "priorite": p, "categorie": PRIORITES[p][0], "categorie_overture": cat,
                      "lat": round(lat, 6), "lon": round(lon, 6), "commune": commune, "confiance": round(conf or 0, 2),
                      "statut": statut, "modele": ident})
    liste.sort(key=lambda x: (x["statut"] != "modélisé", x["priorite"], -x["confiance"], x["nom"]))
    resume = {}
    for x in liste:
        r = resume.setdefault(x["categorie"], {"priorite": x["priorite"], "total": 0, "modelises": 0})
        r["total"] += 1
        r["modelises"] += x["statut"] == "modélisé"
    sortie = {
        "genere": "2026-11-23", "source": f"Overture Maps Foundation, lieux, release {RELEASE} (CDLA Permissive 2.0 / ODbL selon la source)",
        "note": "Liste de travail : un lieu « à modéliser » garde pour l'instant son empreinte réelle et une apparence générique. "
                "Les catégories et positions viennent d'Overture et peuvent contenir des erreurs (à vérifier avant modélisation).",
        "resume": dict(sorted(resume.items(), key=lambda kv: kv[1]["priorite"])), "lieux": liste}
    json.dump(sortie, open(SORTIE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    for k, v in sortie["resume"].items():
        print(f"  {v['priorite']}. {k} : {v['total']} (modélisés : {v['modelises']})")
    print(f"{len(liste)} lieux -> {SORTIE}")


if __name__ == "__main__":
    main()
