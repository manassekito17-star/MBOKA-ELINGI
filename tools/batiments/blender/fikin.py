"""Foire internationale de Kinshasa (FIKIN), Limete — modèle individuel.

Références :
  - Site : OpenStreetMap way 4708901 (≈ 28 ha, « surface : unpaved »).
  - Photo : « Monument de la Foire internationale de Kinshasa (FIKIN) » (Fiston bamela, CC0, 2 décembre 2025) :
    statue blanche monumentale sur socle sombre, hangar à toit de tôle avec banderole « Bienvenue à la 46e édition
    FIKIN », drapeaux de la RDC, grille noire, parking en terre ; conteneurs et silos au loin (zone industrielle,
    à l'est du site d'après OpenStreetMap) -> la photo regarde vers l'est, vers l'entrée.
  - Pavillons : empreintes détectées par satellite (Google Open Buildings / Overture). AUCUNE photo libre :
    apparence non vérifiée (murs clairs, toits de tôle à deux pans : hypothèse).

Lancement : blender -b --factory-startup --python tools/batiments/blender/fikin.py
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun as C  # noqa: E402

SORTIE = os.path.join(C.ICI, "..", "..", "..", "web", "kinshasa", "jeu", "assets", "batiments", "fikin.glb")
d = C.charger("fikin")
SITE = C._sans_doublon([tuple(p) for p in d["contours"]["way:4708901"]["p"]])
M = C.Modele("fikin")
T, T01 = ("LOD0", "LOD1", "LOD2"), ("LOD0", "LOD1")

statue = M.mat("statue", (238, 236, 230), 0.55)
socle = M.mat("socle", (44, 42, 40), 0.8)
tole = M.mat("tole", (255, 255, 255), 0.5, 0.5, texture="tole.jpg", double=True)
banniere = M.mat("banniere", (255, 255, 255), 0.8, texture="fikin_banniere.jpg", double=True)
acier = M.mat("acier", (70, 72, 74), 0.5, 0.7)
noir = M.mat("grille", (24, 24, 24), 0.5, 0.6)
mur = M.mat("mur_pavillon", (226, 220, 204), 0.85)          # [hypothèse]
toit_pav = M.mat("toit_pavillon", (255, 255, 255), 0.55, 0.4, texture="tole.jpg")
terre = M.mat("terre", (255, 255, 255), 0.95, texture="terre.jpg")
drapeau = M.mat("drapeau", (255, 255, 255), 0.8, texture="drapeau_rdc.jpg", double=True)
blanc = M.mat("blanc", (240, 240, 236), 0.6)
sombre = M.mat("interieur", (52, 50, 48), 0.9)

# --- Sol en terre du site [OSM : surface non revêtue ; photo] ------------------------------------
M.face(T, terre, [(p[0], 0.04, p[1]) for p in SITE], [(p[0] / 5, p[1] / 5) for p in SITE], (0, 1, 0))

# --- Hangar d'entrée : plus grande empreinte au bord est du site [photo + satellite] -------------
cands = [b for b in d["batiments"] if C.dans(*C.centre(b["p"]), SITE) and C.centre(b["p"])[0] > 300]
hangar = max(cands, key=lambda b: b["aire"])
hangar["_fait"] = True
hc, hhl, hhw, ha = C.rect_oriente(hangar["p"])
# Repère du hangar : u = long côté ; la façade ouverte regarde vers l'ouest (côté intérieur du site).
H = lambda u, w: C.local(hc, ha, u, w)
ouest = -1 if H(0, 1)[0] > H(0, -1)[0] else 1          # signe de w côté ouest
EAVE, FAITE = 5.6, 7.4
wf, wb = ouest * hhw, -ouest * hhw                       # façade (ouest) et arrière
for niv, pas in (("LOD0", 6.0), ("LOD1", 12.0)):
    k = -hhl
    while k <= hhl + 0.01:
        for w in (wf, 0, wb):
            x, z = H(k, w)
            M.barre(niv, acier, (x, 0, z), (x, EAVE if w != 0 else FAITE, z), 0.14, 4)
        k += pas
# Toit de tôle à deux pans, débordant.
for (w0, w1, y0) in ((wf * 1.08, 0, EAVE - 0.3), (wb * 1.08, 0, EAVE - 0.3)):
    a0, a1 = H(-hhl - 1, w0), H(hhl + 1, w0)
    b0, b1 = H(-hhl - 1, w1), H(hhl + 1, w1)
    M.face(T, tole, [(a0[0], y0, a0[1]), (a1[0], y0, a1[1]), (b1[0], FAITE, b1[1]), (b0[0], FAITE, b0[1])],
           [(0, 0), (hhl / 4, 0), (hhl / 4, 2), (0, 2)], (0, 1, 0))
# Fond fermé (côté industriel) et pignons.
M.mur(T, sombre, H(-hhl, wb), H(hhl, wb), 0, EAVE, dehors=H(0, wb * 3))
for s in (-1, 1):
    M.mur(T01, sombre, H(s * hhl, wf), H(s * hhl, wb), 0, EAVE, dehors=H(s * hhl * 2, 0))
# Banderole sur la rive de la façade [photo, décembre 2025].
b0, b1 = H(-hhl * 0.55, wf * 1.09), H(hhl * 0.55, wf * 1.09)
Lb = math.dist(b0, b1)
M.face(T01, banniere, [(b0[0], EAVE - 2.6, b0[1]), (b1[0], EAVE - 2.6, b1[1]), (b1[0], EAVE - 0.4, b1[1]), (b0[0], EAVE - 0.4, b0[1])],
       [(0, 0), (1, 0), (1, 1), (0, 1)], (H(0, wf * 3)[0] - hc[0], 0, H(0, wf * 3)[1] - hc[1]))
M.prisme("COLLISION", "col", "col", C.rect(hc, hhl, hhw * 0.2, ha), 0, EAVE)
# Grille noire devant le hangar [photo].
g0, g1 = H(-hhl, wf * 1.35), H(hhl, wf * 1.35)
Lg = math.dist(g0, g1)
for y in (0.3, 2.0):
    M.barre(T01, noir, (g0[0], y, g0[1]), (g1[0], y, g1[1]), 0.04, 4)
for kk in range(int(Lg / 0.5)):
    t = kk * 0.5 / Lg
    x, z = g0[0] + (g1[0] - g0[0]) * t, g0[1] + (g1[1] - g0[1]) * t
    M.barre("LOD0", noir, (x, 0.2, z), (x, 2.2, z), 0.02, 3)

# --- Monument : statue blanche sur socle sombre, devant le hangar [photo] -------------------------
# Dimensions estimées d'après les voitures de la photo (statue ≈ 6,5 m au-dessus d'un socle de 1,8 m).
sx, sz = H(0, wf * 1.35 + ouest * 38)
fx, fz = (H(0, wf * 3)[0] - hc[0], H(0, wf * 3)[1] - hc[1])          # vers l'ouest (face de la statue)
Lf = math.hypot(fx, fz); fx, fz = fx / Lf, fz / Lf
rx, rz = -fz, fx                                                      # côté droit de la statue
if (rx * 0 + rz * -1) < 0:                                            # la main levée est côté nord [photo]
    rx, rz = -rx, -rz
Y0 = 1.8
M.boite(T, socle, (sx, Y0 / 2, sz), (4.6, Y0, 4.6), math.atan2(fz, fx))
M.boite("COLLISION", "col", (sx, 4, sz), (4.6, 8, 4.6), math.atan2(fz, fx))


def S(a, y, s):
    """Repère de la statue : a vers l'avant, s vers sa droite."""
    return (sx + a * fx + s * rx, Y0 + y, sz + a * fz + s * rz)


# Silhouette d'après la photo : homme très musclé, buste penché en avant, tête chauve baissée, main droite
# levée paume vers l'avant, main gauche tenant un objet rond devant la hanche, pagne. Proportions : estimées
# (statue ≈ 6,5 m sur un socle de 1,8 m, d'après la taille des voitures de la photo).
F, U, R = (fx, 0, fz), (0, 1, 0), (rx, 0, rz)
def axes_incl(t):
    """Axes du buste penché de t radians vers l'avant."""
    c, s_ = math.cos(t), math.sin(t)
    return ((fx * c, -s_, fz * c), (fx * s_, c, fz * s_), R)
for niv, n in (("LOD0", 14), ("LOD1", 8), ("LOD2", 6)):
    E = lambda c, r, ax=(F, U, R): M.ellipsoide(niv, statue, S(*c), r, ax, n)
    Mb = lambda a, b, r0, r1: M.membre(niv, statue, S(*a), S(*b), r0, r1, n)
    E((0.0, 2.85, 0), (0.55, 0.5, 0.78))                                   # bassin
    E((0.15, 3.5, 0), (0.55, 0.62, 0.72), axes_incl(0.25))                  # abdomen
    E((0.38, 4.35, 0), (0.66, 0.78, 1.02), axes_incl(0.35))                 # thorax
    for s_ in (-1, 1):
        E((0.78, 4.5, 0.44 * s_), (0.36, 0.42, 0.46))                       # pectoraux
        E((0.42, 4.95, 1.08 * s_), (0.5, 0.5, 0.5))                         # deltoïdes
    Mb((0.5, 4.95, 0), (0.78, 5.45, 0), 0.36, 0.32)                         # cou
    E((0.9, 5.82, 0), (0.44, 0.5, 0.4), axes_incl(0.3))                      # tête chauve
    Mb((0.42, 4.95, 1.08), (0.62, 4.15, 1.38), 0.42, 0.32)                  # bras droit
    E((0.5, 4.55, 1.28), (0.34, 0.46, 0.34))                                # biceps
    Mb((0.62, 4.15, 1.38), (1.25, 4.8, 0.95), 0.31, 0.24)                   # avant-bras levé
    E((1.38, 5.12, 0.88), (0.13, 0.36, 0.27))                               # main ouverte, paume en avant
    Mb((0.42, 4.95, -1.08), (0.5, 3.95, -1.4), 0.42, 0.32)                  # bras gauche
    E((0.46, 4.45, -1.3), (0.34, 0.46, 0.34))
    Mb((0.5, 3.95, -1.4), (0.88, 3.18, -1.08), 0.31, 0.24)                  # avant-bras
    for s_ in (-1, 1):
        Mb((0.0, 2.6, 0.5 * s_), (0.3, 1.38, 0.6 * s_), 0.58, 0.38)         # cuisses
        Mb((0.3, 1.38, 0.6 * s_), (0.12, 0.28, 0.58 * s_), 0.37, 0.22)      # mollets
        E((0.38, 0.13, 0.6 * s_), (0.46, 0.13, 0.21))                       # pieds
# Pagne et objet rond (disque sombre) tenu à la main gauche [photo].
c = S(0.05, 0, 0)
M.cylindre(T01, statue, c[0], c[2], Y0 + 2.15, Y0 + 3.1, 0.98, 16, 0.86)
o = S(1.08, 3.05, -0.88)
M.ellipsoide(T01, socle, o, (0.13, 0.55, 0.55), (F, U, R), 16)
# --- Drapeaux de la RDC sur mâts, de part et d'autre [photo] ---------------------------------------
for s in (-9, 9):
    x, y, z = S(-3, -Y0, s)
    M.barre(T01, acier, (x, 0, z), (x, 11, z), 0.07, 6)
    p0 = (x, 10.8, z)
    M.face(T01, drapeau, [p0, (x + fx * 0.1 - rx * 3.0 * (1 if s > 0 else 1), 10.8, z + fz * 0.1 - rz * 3.0), (x - rx * 3.0, 8.8, z - rz * 3.0), (x, 8.8, z)],
           [(0, 1), (1, 1), (1, 0), (0, 0)])

# --- Pavillons : empreintes satellite réelles, apparence non vérifiée ------------------------------
# Parvis devant le hangar : la photo de décembre 2025 y montre un parking en terre dégagé (voitures, statue).
# Les empreintes satellite qui s'y trouvent (date d'image inconnue, stands de foire temporaires possibles)
# ne sont pas construites. Le nombre retiré est affiché ci-dessous et documenté.
PARVIS = [H(-38, wf * 1.0), H(38, wf * 1.0), H(38, wf + ouest * 70), H(-38, wf + ouest * 70)]
nb = retires = 0
for b in d["batiments"]:
    cxb, czb = C.centre(b["p"])
    if b.get("_fait") or not C.dans(cxb, czb, SITE) or b["aire"] < 20:
        continue
    if C.dans(cxb, czb, PARVIS):
        retires += 1
        continue
    nb += 1
    p = C._sans_doublon([tuple(q) for q in b["p"]])
    h = min(b["h"], 9.0) if b["aire"] > 400 else min(b["h"], 4.5)
    M.prisme(T, mur, toit_pav, p, 0, h)
    M.prisme("COLLISION", "col", "col", p, 0, h)
    if b["aire"] > 400 and len(p) == 4:      # grands pavillons : toit de tôle à deux pans (hypothèse)
        cc, l2, w2, a2 = C.rect_oriente(p)
        for s in (-1, 1):
            q0, q1 = C.local(cc, a2, -l2, s * w2), C.local(cc, a2, l2, s * w2)
            r0, r1 = C.local(cc, a2, -l2, 0), C.local(cc, a2, l2, 0)
            M.face(T01, toit_pav, [(q0[0], h, q0[1]), (q1[0], h, q1[1]), (r1[0], h + w2 * 0.2, r1[1]), (r0[0], h + w2 * 0.2, r0[1])],
                   [(0, 0), (l2 / 3, 0), (l2 / 3, w2 / 6), (0, w2 / 6)], (0, 1, 0))
            M.face(T01, mur, [(q0[0], h, q0[1]), (r0[0], h + w2 * 0.2, r0[1]), (C.local(cc, a2, -l2, -s * w2)[0], h, C.local(cc, a2, -l2, -s * w2)[1])], None,
                   (q0[0] - cc[0] - (q1[0] - q0[0]), 0, q0[1] - cc[1] - (q1[1] - q0[1])))
print(f"FIKIN : hangar {2 * hhl:.0f} × {2 * hhw:.0f} m, pavillons : {nb}, empreintes non construites sur le parvis : {retires}")
M.exporter(os.path.abspath(SORTIE))
