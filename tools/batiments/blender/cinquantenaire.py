"""Hôpital du Cinquantenaire (Kasa-Vubu, Kinshasa) — modèle individuel.

Références :
  - Photo : Wikimedia Commons « HÔPITAL DU CINQUANTENAIRE.jpg » (Tite koya, CC BY-SA 4.0, 12/11/2025),
    prise depuis l'avenue de la Libération (ouest), appareil à (-4.342322, 15.294408).
  - Empreintes : tuiles de la zone « centre » (Google Open Buildings / Overture, détectées par satellite).
  - Terrain : OpenStreetMap way 102422512.
Ce qui vient de la photo [photo] et ce qui est déduit [déduit] est noté à chaque élément.

Lancement : blender -b --factory-startup --python tools/batiments/blender/cinquantenaire.py
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun as C  # noqa: E402

SORTIE = os.path.join(C.ICI, "..", "..", "..", "web", "kinshasa", "jeu", "assets", "batiments", "cinquantenaire.glb")
d = C.charger("cinquantenaire")
SITE = [tuple(p) for p in d["contours"]["way:102422512"]["p"]][:-1]
BAT = d["batiments"]
M = C.Modele("cinquantenaire")
T = ("LOD0", "LOD1", "LOD2")
T01 = ("LOD0", "LOD1")
COL = "COLLISION"

# --- Matériaux (couleurs relevées sur la photo de 2025) --------------------------------------
hublots = M.mat("hublots", (255, 255, 255), 0.75, texture="cinq_hublots.jpg")
fenetres = M.mat("fenetres", (255, 255, 255), 0.8, texture="cinq_fenetres.jpg")
escalier = M.mat("escalier", (255, 255, 255), 0.8, texture="cinq_escalier.jpg")
aile = M.mat("aile", (255, 255, 255), 0.85, texture="cinq_aile.jpg")
bandeau = M.mat("bandeau", (255, 255, 255), 0.8, texture="cinq_bandeau.jpg")
blanc = M.mat("blanc", (232, 232, 226), 0.7)
gris_toit = M.mat("toit", (168, 168, 162), 0.9)
anthracite = M.mat("anthracite", (42, 43, 42), 0.8)
or_ = M.mat("lettres_or", (232, 186, 40), 0.35, 0.8)
verre = M.mat("verre", (60, 72, 80), 0.15, 0.2)
noir = M.mat("ferronnerie", (24, 24, 24), 0.5, 0.6)
globe = M.mat("globe", (250, 250, 240), 0.3, emission=((255, 247, 220), 0.6))
pierre = M.mat("pilier", (60, 60, 58), 0.8)
toile = M.mat("auvent", (52, 54, 56), 0.6, 0.3, double=True)
asphalte = M.mat("asphalte", (70, 70, 68), 0.95)
pelouse = M.mat("pelouse", (255, 255, 255), 0.95, texture="pelouse.jpg")
palmier_tronc = M.mat("palmier_tronc", (110, 96, 80), 0.9)
palmier_feuille = M.mat("palmier_feuille", (58, 96, 40), 0.8, double=True)


def pieds(i):
    b = BAT[i]
    return C.rect_oriente(b["p"])


def facade(niv, mat, a, b, y0, y1, n_modules, h_module, dehors):
    """Mur dont la texture est répétée exactement n_modules fois en largeur."""
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    M.mur(niv, mat, a, b, y0, y1, (L / n_modules, h_module), dehors=dehors)


# =============================================================================================
# 1. Grand bloc à hublots (empreinte 0 : 65,7 × 54,2 m) — 8 niveaux ≈ 27,3 m [photo : façade ouest ;
#    hauteur estimée en comptant les rangées visibles + celles masquées par l'aile basse].
# =============================================================================================
c, hl, hw, ang = pieds(0)
RDC, ETAGE, NIV = 4.2, 3.3, 8
H0 = RDC + ETAGE * (NIV - 1)
P = lambda u, w: C.local(c, ang, u, w)
loin = P(-500, 0)            # point très à l'ouest (côté avenue)
# Ouest (face à l'avenue), du nord (w = -hw) au sud : partie à fenêtres 9,6 m, hublots A (7 modules),
# tour d'escalier 6,4 m (en saillie de 1,4 m), hublots B (5 modules). [photo]
w = -hw
for largeur, mat, n in ((9.6, fenetres, 3), (22.4, hublots, 7), (6.4, None, 0), (hw * 2 - 38.4, hublots, 5)):
    a, b = P(-hl, w), P(-hl, w + largeur)
    if mat is None:  # tour d'escalier en saillie, jusqu'au toit + édicule
        e0, e1 = P(-hl - 1.4, w), P(-hl - 1.4, w + largeur)
        facade(T, escalier, e0, e1, 0, H0 + 2.4, 2, ETAGE, loin)
        M.mur(T, blanc, a, e0, 0, H0 + 2.4, dehors=P(-hl - 1, w - 5))
        M.mur(T, blanc, e1, b, 0, H0 + 2.4, dehors=P(-hl - 1, w + largeur + 5))
        M.face(T, gris_toit, [(p[0], H0 + 2.4, p[1]) for p in (a, e0, e1, b)], None, (0, 1, 0))
    else:
        facade(T, fenetres, a, b, 0, RDC, n, RDC, loin)                  # rez-de-chaussée
        facade(T, mat, a, b, RDC, H0, n, ETAGE, loin)
    w += largeur
# Autres faces : fenêtres rectangulaires [déduit : non visibles sur la photo].
for (a, b, o) in ((P(-hl, hw), P(hl, hw), P(0, 500)), (P(hl, hw), P(hl, -hw), P(500, 0)), (P(hl, -hw), P(-hl, -hw), P(0, -500))):
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    facade(T, fenetres, a, b, 0, H0, round(L / 3.2), ETAGE, o)
coins = [P(-hl, -hw), P(hl, -hw), P(hl, hw), P(-hl, hw)]
M.face(T, gris_toit, [(p[0], H0, p[1]) for p in coins], None, (0, 1, 0))
# Acrotère et garde-corps du toit [photo : fine rambarde visible en haut du bloc].
for i in range(4):
    a, b = coins[i], coins[(i + 1) % 4]
    M.mur(T01, blanc, a, b, H0, H0 + 0.6, dehors=c)
    M.mur(T01, blanc, a, b, H0, H0 + 0.6)
    M.barre("LOD0", noir, (a[0], H0 + 1.5, a[1]), (b[0], H0 + 1.5, b[1]), 0.04, 4)
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    for k in range(int(L / 2.5) + 1):
        t = k * 2.5 / L
        x, z = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        M.barre("LOD0", noir, (x, H0 + 0.6, z), (x, H0 + 1.5, z), 0.035, 4)
# Édicules techniques sur le toit [déduit].
for (u, ww, lx, lz) in ((10, -6, 8, 6), (-8, 12, 6, 5)):
    M.boite(T01, blanc, (*P(u, ww)[:1], H0 + 1.4, P(u, ww)[1]), (lx, 2.8, lz), ang)
M.boite(COL, "col", (c[0], H0 / 2, c[1]), (hl * 2 + 2.8, H0, hw * 2), ang)

# =============================================================================================
# 2. Blocs blancs voisins (empreintes 2, 5, 6) — fenêtres rectangulaires. Sud : 6 niveaux et mât
#    [photo : bloc blanc à fenêtres et mât à droite du bloc à hublots] ; est : 5 niveaux, dernier niveau
#    à petits hublots [photo : bloc du fond, à droite] ; nord : 6 niveaux [déduit].
# =============================================================================================
for i, niv, haut_hublots, mat_ in ((2, 6, False, True), (5, 5, True, False), (6, 6, False, False)):
    cc, l2, w2, a2 = pieds(i)
    H = RDC + ETAGE * (niv - 1)
    poly = C.rect(cc, l2, w2, a2)
    for k in range(4):
        a, b = poly[k], poly[(k + 1) % 4]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        o = (m[0] + (m[0] - cc[0]), m[1] + (m[1] - cc[1]))
        if haut_hublots:
            facade(T, fenetres, a, b, 0, H - ETAGE, round(L / 3.2), ETAGE, o)
            facade(T, hublots, a, b, H - ETAGE, H, round(L / 3.2), ETAGE, o)
        else:
            facade(T, fenetres, a, b, 0, H, round(L / 3.2), ETAGE, o)
        M.mur(T01, blanc, a, b, H, H + 0.6, dehors=o)
    M.face(T, gris_toit, [(p[0], H, p[1]) for p in poly], None, (0, 1, 0))
    M.boite(COL, "col", (cc[0], H / 2, cc[1]), (l2 * 2, H, w2 * 2), a2)
    if mat_:  # mât d'antenne [photo]
        M.barre("LOD0", noir, (cc[0] + 6, H, cc[1]), (cc[0] + 6, H + 9, cc[1]), 0.12, 6)
        M.barre(T01, blanc, (cc[0] + 6, H, cc[1]), (cc[0] + 6, H + 2.2, cc[1]), 0.6, 8)

# =============================================================================================
# 3. Aile basse ouest (empreintes 26 et 13) : 2 niveaux gris anthracite à fenêtres cadrées de blanc ;
#    partie sud couronnée du bandeau à grands disques [photo]. Ailes nord (8, 24, 11, 9) et corps de
#    liaison (19, 27, 30) : même style [déduit].
# =============================================================================================
H_AILE = 7.4
for i in (26, 13, 8, 24, 11, 9, 19, 27, 30):
    p = [tuple(q) for q in BAT[i]["p"]]
    M.prisme(T, aile, gris_toit, p, 0, H_AILE, (3.6, 3.5))
    M.prisme(COL, "col", "col", p, 0, H_AILE)
    if i == 13:
        M.prisme(T, bandeau, gris_toit, p, H_AILE, H_AILE + 3.0, (6.0, 3.0))
    else:
        M.prisme(T01, blanc, gris_toit, p, H_AILE, H_AILE + 0.7)

# =============================================================================================
# 4. Hall d'entrée (empreinte 25) et portique [photo] : dalle épaisse claire sur poteaux, portes vitrées,
#    bandeau clair portant les lettres dorées « HÔPITAL DU CINQUANTENAIRE » et un médaillon rond.
# =============================================================================================
ch, lh, wh, ah = pieds(25)
PH = lambda u, w: C.local(ch, ah, u, w)
# Repère du hall : u ~ sud, w ~ ouest (face avant = w = +wh).
ouest = PH(0, 300)
poly_h = C.rect(ch, lh, wh, ah)
M.prisme(T, aile, gris_toit, poly_h, 0, H_AILE, (3.6, 3.5))
M.prisme(T, blanc, gris_toit, poly_h, H_AILE, H_AILE + 2.6)
M.prisme(COL, "col", "col", poly_h, 0, H_AILE + 2.6)
# Portes vitrées sous le portique.
a, b = PH(-5, wh + 0.05), PH(5, wh + 0.05)
M.mur(T01, verre, a, b, 0.0, 3.2, dehors=ouest)
# Portique : dalle 18 × 7 m, épaisseur 1,1 m, à 4,4 m ; 4 poteaux carrés.
dalle = [PH(-9, wh - 0.5), PH(9, wh - 0.5), PH(9, wh + 7), PH(-9, wh + 7)]
M.prisme(T, blanc, blanc, dalle, 4.4, 5.5, dessous=True)
for u in (-7.6, -2.6, 2.6, 7.6):
    x, z = PH(u, wh + 6.2)
    M.boite(T01, pierre, (x, 2.2, z), (0.8, 4.4, 0.8), ah)
    M.boite(COL, "col", (x, 2.2, z), (0.8, 4.4, 0.8), ah)
M.boite("LOD2", pierre, (PH(0, wh + 6.2)[0], 2.2, PH(0, wh + 6.2)[1]), (16, 4.4, 0.8), ah)
# Lettres dorées en relief sur le bandeau, lisibles depuis l'avenue.
# Le texte se lit du nord vers le sud quand on regarde vers l'est : direction = +u du hall.
du = (math.cos(ah), math.sin(ah))
x, z = PH(1.2, wh + 0.12)
M.texte(T01, or_, "HÔPITAL DU CINQUANTENAIRE", (x, H_AILE + 0.75, z), du, 1.05, 0.18)
xm, zm = PH(-8.6, wh + 0.1)
# Médaillon rond (logo, contenu non lisible sur la photo : disque uni).
for k in range(16):
    a0, a1 = 2 * math.pi * k / 16, 2 * math.pi * (k + 1) / 16
    r = 0.95
    yc = H_AILE + 1.3
    p0 = (xm + du[0] * r * math.cos(a0), yc + r * math.sin(a0), zm + du[1] * r * math.cos(a0))
    p1 = (xm + du[0] * r * math.cos(a1), yc + r * math.sin(a1), zm + du[1] * r * math.cos(a1))
    M.face(T01, or_, [(xm, yc, zm), p0, p1], None, (math.cos(ah + math.pi / 2), 0, math.sin(ah + math.pi / 2)))

# =============================================================================================
# 5. Auvents voûtés du parking (empreintes ~22,6 × 6,4 m au nord-ouest) [photo : arcs sombres à gauche].
# =============================================================================================
nb_auvents = 0
for i, bt in enumerate(BAT):
    cx, cz = C.centre(bt["p"])
    if not C.dans(cx, cz, SITE):
        continue
    cc, l2, w2, a2 = C.rect_oriente(bt["p"])
    if cx < -80 and -75 < cz < 15 and w2 < 3.8 and 9 < l2 < 13:
        nb_auvents += 1
        bt["_fait"] = True
        for niv, seg in (("LOD0", 10), ("LOD1", 5)):
            for k in range(seg):
                t0, t1 = math.pi * k / seg, math.pi * (k + 1) / seg
                q = []
                for t in (t0, t1):
                    ww, yy = -math.cos(t) * w2, 2.3 + math.sin(t) * 1.6
                    q.append((ww, yy))
                a0, a1 = C.local(cc, a2, -l2, q[0][0]), C.local(cc, a2, l2, q[0][0])
                b0, b1 = C.local(cc, a2, -l2, q[1][0]), C.local(cc, a2, l2, q[1][0])
                M.face(niv, toile, [(a0[0], q[0][1], a0[1]), (a1[0], q[0][1], a1[1]), (b1[0], q[1][1], b1[1]), (b0[0], q[1][1], b0[1])])
        for u in (-l2 + 0.5, 0, l2 - 0.5):
            for s in (-1, 1):
                x, z = C.local(cc, a2, u, s * (w2 - 0.2))
                M.barre("LOD0", noir, (x, 0, z), (x, 2.3, z), 0.06, 4)
        M.boite("LOD2", toile, (cc[0], 3.0, cc[1]), (l2 * 2, 1.6, w2 * 2), a2)
for i in (0, 2, 5, 6, 26, 13, 8, 24, 11, 9, 19, 27, 30, 25):
    BAT[i]["_fait"] = True
# Petites empreintes dans le parking couvert (sous les auvents) : la photo n'y montre que les auvents.
for bt in BAT:
    cx, cz = C.centre(bt["p"])
    if not bt.get("_fait") and C.dans(cx, cz, SITE) and cx < -80 and -75 < cz < 15 and bt["aire"] < 160:
        bt["_fait"] = True

# =============================================================================================
# 6. Autres bâtiments du site : annexes blanches d'1 ou 2 niveaux [déduit : empreintes réelles,
#    apparence non vérifiée].
# =============================================================================================
nb_annexes = 0
for i, bt in enumerate(BAT):
    cx, cz = C.centre(bt["p"])
    if bt.get("_fait") or not C.dans(cx, cz, SITE) or bt["aire"] < 12:
        continue
    nb_annexes += 1
    h = 7.2 if bt["aire"] >= 300 else 3.8
    p = [tuple(q) for q in bt["p"]]
    M.prisme(T01, fenetres, gris_toit, p, 0, h, (3.2, 3.5 if h > 4 else 3.8))
    M.prisme("LOD2", blanc, gris_toit, p, 0, h)
    M.prisme(COL, "col", "col", p, 0, h)

# =============================================================================================
# 7. Clôture côté avenue de la Libération [photo] : grille noire, piliers sombres surmontés de globes
#    blancs ; portail face au hall ; allée goudronnée ; pelouse ; palmier devant l'aile.
# =============================================================================================
A, Bf = SITE[1], SITE[2]                      # bord ouest du terrain (sud-ouest -> nord-ouest)
Lf = math.hypot(Bf[0] - A[0], Bf[1] - A[1])
dirf = ((Bf[0] - A[0]) / Lf, (Bf[1] - A[1]) / Lf)
# Point du bord le plus proche de l'axe d'entrée.
xg, zg = PH(0, 300)
t_portail = max(0, min(Lf, ((ch[0] - A[0]) * dirf[0] + (ch[1] - A[1]) * dirf[1])))
for (t0, t1) in ((0, t_portail - 5), (t_portail + 5, Lf)):
    a = (A[0] + dirf[0] * t0, A[1] + dirf[1] * t0)
    b = (A[0] + dirf[0] * t1, A[1] + dirf[1] * t1)
    for y in (0.35, 2.1):
        M.barre(T01, noir, (a[0], y, a[1]), (b[0], y, b[1]), 0.05, 4)
    L = t1 - t0
    for k in range(int(L / 0.6)):
        x, z = a[0] + dirf[0] * k * 0.6, a[1] + dirf[1] * k * 0.6
        M.barre("LOD0", noir, (x, 0.3, z), (x, 2.2, z), 0.022, 3)
    for k in range(int(L / 12) + 1):
        x, z = a[0] + dirf[0] * min(L, k * 12), a[1] + dirf[1] * min(L, k * 12)
        M.boite(T01, pierre, (x, 1.3, z), (0.6, 2.6, 0.6), math.atan2(dirf[1], dirf[0]))
        M.sphere(T01, globe, (x, 2.95, z), 0.34, 10)
    M.boite(COL, "col", ((a[0] + b[0]) / 2, 1.2, (a[1] + b[1]) / 2), (L, 2.4, 0.3), math.atan2(dirf[1], dirf[0]))
# Allée : du portail au portique.
xp, zp = A[0] + dirf[0] * t_portail, A[1] + dirf[1] * t_portail
xe, ze = PH(0, wh + 7)
da = math.atan2(ze - zp, xe - xp)
La = math.hypot(xe - xp, ze - zp)
allee = C.rect(((xp + xe) / 2, (zp + ze) / 2), La / 2 + 3, 3.6, da)
M.face(T, asphalte, [(p[0], 0.07, p[1]) for p in allee], None, (0, 1, 0))
# Pelouse entre la grille et l'aile ouest.
pel = [A, Bf, (Bf[0] + 60, Bf[1] + 8), C.local(ch, ah, 60, wh + 2), C.local(ch, ah, -80, wh + 2), (A[0] + 70, A[1] - 6)]
M.face(T01, pelouse, [(p[0], 0.05, p[1]) for p in pel], [(p[0] / 10, p[1] / 10) for p in pel], (0, 1, 0))
# Palmier devant l'aile basse [photo].
for (u, ww) in ((22, wh + 14),):
    x, z = PH(u, ww)
    M.cylindre(T01, palmier_tronc, x, z, 0, 7.5, 0.28, 8, 0.2)
    for k in range(9):
        a0 = 2 * math.pi * k / 9
        fx, fz = math.cos(a0), math.sin(a0)
        M.face(T01, palmier_feuille, [(x, 7.6, z), (x + fx * 3.6 - fz * 0.5, 6.6, z + fz * 3.6 + fx * 0.5),
                                      (x + fx * 4.4, 5.6, z + fz * 4.4), (x + fx * 3.6 + fz * 0.5, 6.6, z + fz * 3.6 - fx * 0.5)])

print(f"auvents : {nb_auvents}, annexes : {nb_annexes}")
M.exporter(os.path.abspath(SORTIE))
