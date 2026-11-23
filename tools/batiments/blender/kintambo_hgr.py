"""Hôpital Général de Référence de Kintambo — modèle individuel (volumétrie seulement).

Identité vérifiée : OpenStreetMap way 404843994 « Hôpital Général de Référence de Kintambo »
(health_facility:CD = hgr) ; rapport MCSP 2019 « Hôpital général de Kintambo » ; maternité voisine
(way 539014983, « Maternité de Kintambo », building:levels = 1).

AUCUNE photo libre trouvée (Wikimedia Commons, recherche web) : seuls le plan et les empreintes sont réels.
L'apparence (murs clairs, fenêtres, toits de tôle en croupe) est une HYPOTHÈSE neutre, signalée comme telle
dans le jeu. Hauteur : 1 niveau (documenté pour la maternité, supposé pour les autres pavillons).

Lancement : blender -b --factory-startup --python tools/batiments/blender/kintambo_hgr.py
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun as C  # noqa: E402

SORTIE = os.path.join(C.ICI, "..", "..", "..", "web", "kinshasa", "jeu", "assets", "batiments", "kintambo_hgr.glb")
d = C.charger("kintambo_hgr")
SITES = [C._sans_doublon([tuple(p) for p in v["p"]]) for v in d["contours"].values()]
M = C.Modele("kintambo_hgr")
T, T01 = ("LOD0", "LOD1", "LOD2"), ("LOD0", "LOD1")
mur = M.mat("mur_neutre", (255, 255, 255), 0.85, texture="pavillon_neutre.jpg")
mur2 = M.mat("mur_neutre_loin", (222, 214, 196), 0.85)
toit = M.mat("toit_tole", (255, 255, 255), 0.55, 0.4, texture="tole.jpg")
sol = M.mat("cour", (176, 160, 136), 0.95)

for s in SITES:
    M.face(T01, sol, [(p[0], 0.03, p[1]) for p in s], None, (0, 1, 0))

nb = 0
for b in d["batiments"]:
    cx, cz = C.centre(b["p"])
    if b["aire"] < 15 or not any(C.dans(cx, cz, s) for s in SITES):
        continue
    nb += 1
    p = C._sans_doublon([tuple(q) for q in b["p"]])
    h = 3.6
    M.prisme(T01, mur, toit, p, 0, h, (3.2, 3.6), toit=len(p) != 4)
    M.prisme("LOD2", mur2, mur2, p, 0, h)
    M.prisme("COLLISION", "col", "col", p, 0, h)
    if len(p) == 4:
        # Toit en croupe (hypothèse) : faîtage le long du grand côté, pente ≈ 20°.
        c, hl, hw, a = C.rect_oriente(p)
        hf = h + hw * 0.36
        e = 0.6
        A_, B_, Cc, D_ = C.rect(c, hl + e, hw + e, a)
        f0, f1 = C.local(c, a, -(hl - hw), 0), C.local(c, a, hl - hw, 0)
        P3 = lambda q, y: (q[0], y, q[1])
        for niv in T01:
            M.face(niv, toit, [P3(A_, h), P3(B_, h), P3(f1, hf), P3(f0, hf)], [(0, 0), (hl / 2, 0), (hl / 2, 1.5), (0, 1.5)], (0, 1, 0))
            M.face(niv, toit, [P3(Cc, h), P3(D_, h), P3(f0, hf), P3(f1, hf)], [(0, 0), (hl / 2, 0), (hl / 2, 1.5), (0, 1.5)], (0, 1, 0))
            M.face(niv, toit, [P3(B_, h), P3(Cc, h), P3(f1, hf)], [(0, 0), (1, 0), (0.5, 1)], (0, 1, 0))
            M.face(niv, toit, [P3(D_, h), P3(A_, h), P3(f0, hf)], [(0, 0), (1, 0), (0.5, 1)], (0, 1, 0))
        M.face("LOD2", toit, [P3(A_, h + 0.3), P3(B_, h + 0.3), P3(Cc, h + 0.3), P3(D_, h + 0.3)], None, (0, 1, 0))
print(f"Kintambo : {nb} bâtiments")
M.exporter(os.path.abspath(SORTIE))
