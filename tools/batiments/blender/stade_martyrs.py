"""Stade des Martyrs de la Pentecôte (Kinshasa) — modèle individuel.

Références :
  - Contour : OpenStreetMap way 4402561 (296 × 228 m, grand axe presque nord-sud).
  - Pelouse : OpenStreetMap way 612365315 (terrain synthétique, 7 140 m² = 105 × 68 m).
  - Photos : « SDM Kinshasa.jpg » (Fiston bamela, CC0, 2025) : extérieur sans façade fermée, dessous incliné de la
    tribune haute, poteaux obliques, poutre annulaire, couronne de panneaux nervurés ;
    « Leopard RDC, Kinshasa.jpg » (Mikebrown7, CC BY-SA 4.0, 2022) : sièges bleus et jaunes, béton ocre-jaune,
    galerie couverte en haut des tribunes, rive de toiture en dents de scie ;
    « Stade des martyrs Protest.jpg » (MONUSCO, CC BY-SA 2.0, 2017) : deux niveaux, bandeau intermédiaire,
    garde-corps blanc en bord de pelouse.
  - Hauteurs : estimées (≈ 35 m au sommet de la galerie), aucune cote publiée trouvée.

Lancement : blender -b --factory-startup --python tools/batiments/blender/stade_martyrs.py
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commun as C  # noqa: E402

SORTIE = os.path.join(C.ICI, "..", "..", "..", "web", "kinshasa", "jeu", "assets", "batiments", "stade_martyrs.glb")
d = C.charger("stade_martyrs")
CONTOUR = C._sans_doublon([tuple(p) for p in d["contours"]["way:4402561"]["p"]])
OSM = json.load(open(os.path.join(C.ICI, "..", "donnees", "stade_martyrs_osm.json"), encoding="utf-8"))
M = C.Modele("stade_martyrs")

# --- Matériaux --------------------------------------------------------------------------------
sieges = M.mat("sieges", (255, 255, 255), 0.6, texture="stade_sieges.jpg")
ocre = M.mat("beton_ocre", (205, 160, 62), 0.85)                  # [photo 2022]
beton = M.mat("beton_ext", (196, 192, 182), 0.9)                   # [photo noir et blanc : teinte non vérifiée]
beton_sombre = M.mat("beton_sombre", (120, 116, 108), 0.9)
panneaux = M.mat("couronne", (255, 255, 255), 0.85, texture="stade_panneaux.jpg")
blanc = M.mat("garde_corps", (236, 236, 232), 0.5, double=True)
piste = M.mat("piste", (255, 255, 255), 0.9, texture="piste.jpg")
gazon = M.mat("gazon_synthetique", (255, 255, 255), 0.85, texture="pelouse.jpg")
herbe = M.mat("herbe", (88, 122, 60), 0.95)
lignes = M.mat("lignes", (240, 240, 236), 0.8)
dalle = M.mat("dalle", (168, 164, 156), 0.95)
toit = M.mat("toit_galerie", (150, 146, 138), 0.8, double=True)
noir = M.mat("ouverture", (26, 26, 26), 1.0)

# --- Repère du stade -----------------------------------------------------------------------------
n = len(CONTOUR)
cx = sum(p[0] for p in CONTOUR) / n
cz = sum(p[1] for p in CONTOUR) / n
sxx = sum((p[0] - cx) ** 2 for p in CONTOUR) / n
szz = sum((p[1] - cz) ** 2 for p in CONTOUR) / n
sxz = sum((p[0] - cx) * (p[1] - cz) for p in CONTOUR) / n
AXE = 0.5 * math.atan2(2 * sxz, sxx - szz)              # grand axe (le terrain est dans cet axe)
CA, SA = math.cos(AXE), math.sin(AXE)
LOC = lambda u, w: (cx + u * CA - w * SA, cz + u * SA + w * CA)

# Piste de 400 m (norme IAAF) : lignes droites 84,39 m, rayon intérieur 36,5 m, 8 couloirs de 1,22 m.
DROITE, R_INT, R_EXT = 84.39 / 2, 36.5, 36.5 + 8 * 1.22
R_GRADIN = R_EXT + 4.0                                   # pied de la tribune basse (estimé)


def forme_piste(theta, r):
    """Point (u, w) sur le « stade » (deux droites + deux demi-cercles) de rayon r, dans la direction theta."""
    du, dw = math.cos(theta), math.sin(theta)
    lo, hi = 0.0, 400.0
    for _ in range(40):  # dichotomie : premier point hors de la forme
        m = (lo + hi) / 2
        u, w = du * m, dw * m
        uu = max(0.0, abs(u) - DROITE)
        (lo, hi) = (m, hi) if math.hypot(uu, w) < r else (lo, m)
    return du * lo, dw * lo


def rayon_contour(theta):
    """Distance du centre au contour OSM dans la direction theta (repère du stade)."""
    dx, dz = math.cos(theta + AXE), math.sin(theta + AXE)
    best = None
    for i in range(n):
        (x1, z1), (x2, z2) = CONTOUR[i], CONTOUR[(i + 1) % n]
        ex, ez = x2 - x1, z2 - z1
        den = dx * ez - dz * ex
        if abs(den) < 1e-9:
            continue
        t = ((x1 - cx) * ez - (z1 - cz) * ex) / den
        s = ((x1 - cx) * dz - (z1 - cz) * dx) / den
        if t > 0 and 0 <= s <= 1:
            best = t if best is None else min(best, t)
    return best


def anneau(N):
    """Pour chaque direction : point intérieur (pied des gradins) et point extérieur (contour OSM)."""
    out = []
    for i in range(N):
        th = 2 * math.pi * i / N
        ui, wi = forme_piste(th, R_GRADIN)
        ro = rayon_contour(th)
        out.append(((ui, wi), (math.cos(th) * ro, math.sin(th) * ro)))
    return out


def pt(a, k, y):
    """Point à la fraction k (0 = pied des gradins, 1 = contour extérieur) et à la hauteur y."""
    (ui, wi), (uo, wo) = a
    x, z = LOC(ui + (uo - ui) * k, wi + (wo - wi) * k)
    return (x, y, z)


# Profil de la cuvette (k, y) — hauteurs ESTIMÉES.
BAS = ((0.0, 1.0), (0.42, 13.0))         # tribune basse
BANDEAU = ((0.42, 13.0), (0.44, 15.2))   # bandeau ocre entre les niveaux [photo]
HAUT = ((0.44, 15.2), (0.92, 31.0))      # tribune haute
GALERIE_Y, TOIT_Y = 31.0, 34.6           # galerie couverte au sommet [photo]
COURONNE = (26.5, 35.4)                  # panneaux nervurés extérieurs [photo]


def bande(niv, mat, A, k0, y0, k1, y1, module=None, longueur_v=None, normale_haut=True):
    N = len(A)
    u = 0.0
    for i in range(N):
        a, b = A[i], A[(i + 1) % N]
        p00, p10, p11, p01 = pt(a, k0, y0), pt(b, k0, y0), pt(b, k1, y1), pt(a, k1, y1)
        L = math.dist((p00[0], p00[2]), (p10[0], p10[2]))
        uvs = None
        if module:
            lv = longueur_v or math.dist(p00, p01)
            uvs = [(u, 0), (u + L / module[0], 0), (u + L / module[0], lv / module[1]), (u, lv / module[1])]
        u += L / module[0] if module else 0
        # Normale : vers l'intérieur et le haut (gradins) ou vers l'extérieur.
        mx, mz = (p00[0] + p10[0]) / 2, (p00[2] + p10[2]) / 2
        nrm = (cx - mx, 4.0, cz - mz) if normale_haut else (mx - cx, -2.0, mz - cz)
        M.face(niv, mat, [p00, p10, p11, p01], uvs, nrm)


def cuvette(niv, N, detail):
    A = anneau(N)
    # Mur de bord de pelouse + garde-corps blanc [photo 2017].
    bande(niv, beton_sombre, A, 0.0, 0.0, 0.0, 1.0, normale_haut=True)
    bande(niv, sieges, A, *BAS[0], *BAS[1], module=(4.0, 6.4))
    bande(niv, ocre, A, *BANDEAU[0], *BANDEAU[1])
    bande(niv, sieges, A, *HAUT[0], *HAUT[1], module=(4.0, 6.4))
    # Fond de galerie, sol de galerie et toit (de la galerie à l'extérieur).
    bande(niv, ocre, A, 0.92, GALERIE_Y, 0.985, GALERIE_Y)
    bande(niv, ocre, A, 0.985, GALERIE_Y, 0.985, TOIT_Y)
    bande(niv, toit, A, 0.90, TOIT_Y, 1.0, TOIT_Y + 0.4)
    # Extérieur : couronne nervurée, dessous incliné de la tribune haute [photo 2025].
    bande(niv, panneaux, A, 1.0, COURONNE[0], 1.0, COURONNE[1], module=(4.0, 9.0), normale_haut=False)
    bande(niv, beton, A, 0.44, 13.4, 1.0, COURONNE[0], normale_haut=False)
    # Mur extérieur de la tribune basse (coursive du rez-de-chaussée) : béton plus sombre.
    bande(niv, beton_sombre, A, 0.44, 0.0, 0.44, 13.4, normale_haut=False)
    if detail >= 1:
        # Rive de toiture en dents de scie (ocre) côté pelouse [photo 2022].
        for i in range(N):
            a, b = A[i], A[(i + 1) % N]
            p0, p1 = pt(a, 0.90, TOIT_Y), pt(b, 0.90, TOIT_Y)
            m = ((p0[0] + p1[0]) / 2, TOIT_Y + 2.2, (p0[2] + p1[2]) / 2)
            M.face(niv, ocre, [p0, p1, m], None, (cx - m[0], 0, cz - m[2]))
            M.face(niv, ocre, [(p0[0], TOIT_Y - 0.9, p0[2]), (p1[0], TOIT_Y - 0.9, p1[2]), p1, p0], None, (cx - m[0], 0, cz - m[2]))
    for i in range(N):
        a = A[i]
        # Poteaux obliques : du sol (k = 0,62) jusque sous la couronne (k = 0,985) [photo 2025].
        if detail >= 1 or i % 2 == 0:
            M.barre(niv, beton, pt(a, 0.62, 0.0), pt(a, 0.985, COURONNE[0] - 0.2), 0.75 if detail >= 1 else 0.9, 4)
        if detail >= 1:
            # Poteaux de la galerie couverte.
            M.barre(niv, ocre, pt(a, 0.905, GALERIE_Y), pt(a, 0.905, TOIT_Y), 0.3, 4)
        if detail >= 2:
            # Nervures radiales sous la tribune haute.
            M.barre(niv, beton_sombre, pt(a, 0.46, 13.1), pt(a, 0.995, COURONNE[0] - 0.4), 0.35, 4)
    # Poutre annulaire à mi-hauteur [photo 2025].
    yb = 12.0
    kb = 0.62 + (0.985 - 0.62) * yb / (COURONNE[0] - 0.2)
    bande(niv, beton, A, kb, yb - 0.7, kb, yb + 0.7, normale_haut=False)
    bande(niv, beton, A, kb, yb - 0.7, kb, yb + 0.7, normale_haut=True)
    return A


A0 = cuvette("LOD0", 96, 2)
cuvette("LOD1", 64, 1)
cuvette("LOD2", 40, 0)

# Garde-corps blanc (LOD0) : main courante et montants.
for i in range(96):
    a, b = A0[i], A0[(i + 1) % 96]
    p0, p1 = pt(a, -0.004, 2.1), pt(b, -0.004, 2.1)
    M.barre("LOD0", blanc, p0, p1, 0.04, 4)
    M.barre("LOD0", blanc, (p0[0], 1.0, p0[2]), p0, 0.035, 4)

# --- Piste, pelouse, abords ---------------------------------------------------------------------
for niv, N in (("LOD0", 120), ("LOD1", 64), ("LOD2", 40)):
    pi_, pe_, pg_ = [], [], []
    for i in range(N):
        th = 2 * math.pi * i / N
        pi_.append(LOC(*forme_piste(th, R_INT)))
        pe_.append(LOC(*forme_piste(th, R_EXT)))
        pg_.append(LOC(*forme_piste(th, R_GRADIN)))
    u = 0.0
    for i in range(N):
        j = (i + 1) % N
        L = math.dist(pi_[i], pi_[j])
        M.face(niv, piste, [(pi_[i][0], 0.06, pi_[i][1]), (pi_[j][0], 0.06, pi_[j][1]), (pe_[j][0], 0.06, pe_[j][1]), (pe_[i][0], 0.06, pe_[i][1])],
               [(u, 0), (u + L / 10, 0), (u + L / 10, 1), (u, 1)], (0, 1, 0))
        u += L / 10
        M.face(niv, dalle, [(pe_[i][0], 0.05, pe_[i][1]), (pe_[j][0], 0.05, pe_[j][1]), (pg_[j][0], 0.05, pg_[j][1]), (pg_[i][0], 0.05, pg_[i][1])], None, (0, 1, 0))
    M.face(niv, herbe, [(p[0], 0.04, p[1]) for p in pi_], None, (0, 1, 0))

# Pelouse synthétique : contour OSM réel 105 × 68 m, marquage FIFA.
pel = C._sans_doublon([tuple(p) for p in OSM["pelouse"]])
M.face(("LOD0", "LOD1", "LOD2"), gazon, [(p[0], 0.08, p[1]) for p in pel], [(p[0] / 12, p[1] / 12) for p in pel], (0, 1, 0))
pc, phl, phw, pa = C.rect_oriente(pel)
Lp = lambda u, w: C.local(pc, pa, u, w)


def ligne(a, b, lar=0.12):
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dz) or 1
    nx, nz = -dz / L * lar / 2, dx / L * lar / 2
    M.face("LOD0", lignes, [(a[0] + nx, 0.1, a[1] + nz), (b[0] + nx, 0.1, b[1] + nz), (b[0] - nx, 0.1, b[1] - nz), (a[0] - nx, 0.1, a[1] - nz)], None, (0, 1, 0))


hl_, hw_ = phl - 1.0, phw - 1.0
coins = [Lp(-hl_, -hw_), Lp(hl_, -hw_), Lp(hl_, hw_), Lp(-hl_, hw_)]
for i in range(4):
    ligne(coins[i], coins[(i + 1) % 4])
ligne(Lp(0, -hw_), Lp(0, hw_))
for s in (-1, 1):
    for (l, w) in ((16.5, 20.16), (5.5, 9.16)):
        a, b, c_, d_ = Lp(s * hl_, -w), Lp(s * (hl_ - l), -w), Lp(s * (hl_ - l), w), Lp(s * hl_, w)
        ligne(a, b); ligne(b, c_); ligne(c_, d_)
cercle = [Lp(9.15 * math.cos(2 * math.pi * k / 40), 9.15 * math.sin(2 * math.pi * k / 40)) for k in range(41)]
for k in range(40):
    ligne(cercle[k], cercle[k + 1])

# --- Collisions : mur extérieur de la tribune basse, avec 4 accès (positions estimées) ----------
A = anneau(48)
for i in range(48):
    if i % 12 in (0, 11):     # accès dans l'axe et perpendiculairement
        continue
    a, b = A[i], A[(i + 1) % 48]
    p0, p1 = pt(a, 0.44, 0), pt(b, 0.44, 0)
    L = math.dist((p0[0], p0[2]), (p1[0], p1[2]))
    M.boite("COLLISION", "col", ((p0[0] + p1[0]) / 2, 7, (p0[2] + p1[2]) / 2), (L + 0.5, 14, 1.5), math.atan2(p1[2] - p0[2], p1[0] - p0[0]))
    q0, q1 = pt(a, 0.0, 0), pt(b, 0.0, 0)
    M.boite("COLLISION", "col", ((q0[0] + q1[0]) / 2, 1.0, (q0[2] + q1[2]) / 2), (L + 0.5, 2.2, 0.6), math.atan2(q1[2] - q0[2], q1[0] - q0[0]))
# Ouvertures visibles des accès (tunnels sombres).
for i in (0, 12, 24, 36):
    a = A[i]
    for niv in ("LOD0", "LOD1"):
        p0, p1 = pt(A[(i - 1) % 48], 0.445, 0), pt(A[(i + 1) % 48], 0.445, 0)
        M.face(niv, noir, [(p0[0], 0.1, p0[2]), (p1[0], 0.1, p1[2]), (p1[0], 5.5, p1[2]), (p0[0], 5.5, p0[2])], None,
               ((p0[0] + p1[0]) / 2 - cx, 0, (p0[2] + p1[2]) / 2 - cz))

print(f"stade : centre ({cx:.1f}, {cz:.1f}), grand axe {math.degrees(AXE):.1f}°")
M.exporter(os.path.abspath(SORTIE))
