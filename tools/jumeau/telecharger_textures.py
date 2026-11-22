#!/usr/bin/env python3
"""
Matériaux PBR photographiques (licence CC0, Poly Haven — https://polyhaven.com) pour le mode jeu.

Pour chaque matériau : couleur (albédo), normale (convention OpenGL) et « ARM »
(R = occlusion ambiante, G = rugosité, B = métal), recompressés en JPEG 1024 px
(ou 512 px pour la qualité basse) pour rester légers sur téléphone.
Écrit web/kinshasa/jeu/assets/textures/<nom>/{couleur,normale,arm}[_512].jpg
et materiaux.json (taille réelle en mètres, source, auteur).

Usage : python3 tools/jumeau/telecharger_textures.py
"""
import io
import json
import os
import urllib.request

from PIL import Image

SORTIE = "web/kinshasa/jeu/assets/textures"
# nom dans le jeu -> identifiant Poly Haven (choisis pour ressembler aux matériaux de Kinshasa)
MATERIAUX = {
    "crepi": "plastered_wall_02",          # crépi clair, teinté par bâtiment (façades peintes)
    "crepi_use": "grey_plaster_02",        # crépi sali (maisons populaires)
    "beton": "concrete_wall_008",          # béton / dalles
    "parpaing": "concrete_block_wall",     # murs de clôture et chantiers en parpaings
    "brique": "red_bricks_04",             # brique rouge
    "tole": "corrugated_iron",             # toiture en tôle ondulée
    "tole_rouille": "corrugated_iron_02",  # tôle ancienne
    "tuile": "clay_roof_tiles_02",         # villas
    "asphalte": "asphalt_02",              # grands axes
    "laterite": "red_laterite_soil_stones",# rues en terre rouge
    "terre": "red_dirt_mud_01",            # sol nu
    "paves": "concrete_pavers",            # trottoirs
    "herbe": "leafy_grass",                # pelouses et terrains
    "rideau": "painted_metal_shutter",     # rideaux métalliques des boutiques
    "metal": "green_metal_rust",           # portails et grilles
    "ecorce_palmier": "palm_tree_bark",
}


def telecharger(url):
    req = urllib.request.Request(url, headers={"User-Agent": "MbokaElengi-texture-tool/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def api(chemin):
    return json.loads(telecharger("https://api.polyhaven.com/" + chemin))


def main():
    os.makedirs(SORTIE, exist_ok=True)
    catalogue = {}
    for nom, ident in MATERIAUX.items():
        fichiers, info = api(f"files/{ident}"), api(f"info/{ident}")
        dossier = os.path.join(SORTIE, nom)
        os.makedirs(dossier, exist_ok=True)
        for cle, fichier in (("Diffuse", "couleur"), ("nor_gl", "normale"), ("arm", "arm")):
            img = Image.open(io.BytesIO(telecharger(fichiers[cle]["1k"]["jpg"]["url"]))).convert("RGB")
            img = img.resize((1024, 1024), Image.LANCZOS)
            img.save(os.path.join(dossier, fichier + ".jpg"), quality=80, optimize=True)
            img.resize((512, 512), Image.LANCZOS).save(os.path.join(dossier, fichier + "_512.jpg"), quality=78, optimize=True)
        largeur_m = (info.get("dimensions") or [2000, 2000])[0] / 1000
        catalogue[nom] = {"source": f"https://polyhaven.com/a/{ident}", "auteurs": list((info.get("authors") or {}).keys()),
                          "licence": "CC0", "taille_m": round(largeur_m, 2)}
        print(f"{nom:15s} {ident:28s} {largeur_m} m")
    json.dump(catalogue, open(os.path.join(SORTIE, "materiaux.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
