"""Textures de façade des bâtiments remarquables, dessinées d'après les photos de référence
(tools/batiments/references.json). Une texture = un module de façade (une travée × un niveau),
répété par les coordonnées UV dans Blender.

Usage : python3 tools/batiments/textures.py   (écrit tools/batiments/textures/*.png)
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

DOSSIER = os.path.join(os.path.dirname(__file__), "textures")
POLICE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SS = 2  # suréchantillonnage (anticrénelage)


def toile(l, h, fond):
    return Image.new("RGBA", (l * SS, h * SS), fond)


def finir(im, nom, l, h, flou=0):
    im = im.resize((l, h), Image.LANCZOS)
    if flou:
        im = im.filter(ImageFilter.GaussianBlur(flou))
    chemin = os.path.join(DOSSIER, nom)
    if nom.endswith(".jpg"):
        im.convert("RGB").save(chemin, quality=90)
    else:
        im.save(chemin)
    print("  ", nom)


def grain(d, l, h, couleur, n=900, graine=1):
    """Léger bruit d'enduit (taches)."""
    import random
    r = random.Random(graine)
    for _ in range(n):
        x, y = r.random() * l * SS, r.random() * h * SS
        s = r.random() * 3 * SS
        d.ellipse((x, y, x + s, y + s), fill=couleur)


# --- Hôpital du Cinquantenaire --------------------------------------------------------------
# Photo de référence : Wikimedia Commons, « HÔPITAL DU CINQUANTENAIRE.jpg », Tite koya, CC BY-SA 4.0.

def cinq_hublots():
    """Module du grand bloc : mur blanc à reliefs en losange, hublot ovale gris foncé cerclé,
    barres horizontales reliant les hublots voisins (photo 2025). 3,2 m × 3,3 m."""
    L, H = 512, 528
    im = toile(L, H, (232, 232, 226, 255)); d = ImageDraw.Draw(im)
    grain(d, L, H, (222, 222, 215, 255))
    S = SS
    # Losanges (rainures) autour de chaque hublot.
    for c in [(255, 255, 250, 255), (196, 196, 190, 255)]:
        dec = 0 if c[0] == 255 else 3
        pts = [(L / 2 * S, (6 + dec) * S), ((L - 8 + dec) * S, H / 2 * S), (L / 2 * S, (H - 6 + dec) * S), ((8 + dec) * S, H / 2 * S)]
        d.line(pts + [pts[0]], fill=c, width=3 * S)
    cx, cy, rx, ry = L / 2, H / 2, 128, 182
    # Barre horizontale (traverse les bords : se raccorde au module voisin).
    d.rectangle((0, (cy - 16) * S, L * S, (cy + 16) * S), fill=(70, 72, 72, 255))
    d.rectangle((0, (cy - 16) * S, L * S, (cy - 11) * S), fill=(110, 112, 112, 255))
    # Cerclage puis vitrage sombre.
    d.ellipse(((cx - rx - 20) * S, (cy - ry - 20) * S, (cx + rx + 20) * S, (cy + ry + 20) * S), fill=(58, 60, 60, 255))
    d.ellipse(((cx - rx - 8) * S, (cy - ry - 8) * S, (cx + rx + 8) * S, (cy + ry + 8) * S), fill=(150, 152, 150, 255))
    d.ellipse(((cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S), fill=(48, 54, 58, 255))
    # Reflet du ciel dans le vitrage.
    d.ellipse(((cx - rx + 22) * S, (cy - ry + 18) * S, (cx + rx - 60) * S, (cy - 20) * S), fill=(78, 88, 96, 255))
    finir(im, "cinq_hublots.jpg", L, H)


def cinq_fenetres(nom="cinq_fenetres.jpg", mur=(234, 234, 228), clim=True):
    """Mur blanc et fenêtre rectangulaire (extrémité du grand bloc, blocs voisins). 3,2 × 3,3 m."""
    L, H = 256, 264
    im = toile(L, H, mur + (255,)); d = ImageDraw.Draw(im)
    grain(d, L, H, tuple(v - 10 for v in mur) + (255,), 300)
    S = SS
    x0, y0, x1, y1 = 78, 70, 178, 190
    d.rectangle(((x0 - 6) * S, (y0 - 6) * S, (x1 + 6) * S, (y1 + 10) * S), fill=(205, 205, 200, 255))
    d.rectangle((x0 * S, y0 * S, x1 * S, y1 * S), fill=(52, 60, 66, 255))
    d.line(((x0 + x1) / 2 * S, y0 * S, (x0 + x1) / 2 * S, y1 * S), fill=(205, 205, 200, 255), width=4 * S)
    d.rectangle((x0 * S, y0 * S, x1 * S, (y0 + 35) * S), outline=(205, 205, 200, 255), width=3 * S)
    if clim:  # climatiseur sous la fenêtre (visible sur la photo)
        d.rectangle((150 * S, 204 * S, 190 * S, 228 * S), fill=(214, 214, 210, 255), outline=(150, 150, 148, 255), width=S)
    finir(im, nom, L, H)


def cinq_escalier():
    """Tour d'escalier : grille de petites baies (photo). Module 3,5 × 3,3 m."""
    L, H = 256, 240
    im = toile(L, H, (226, 226, 220, 255)); d = ImageDraw.Draw(im); S = SS
    for i in range(3):
        for j in range(2):
            x0, y0 = 22 + i * 76, 22 + j * 108
            d.rectangle((x0 * S, y0 * S, (x0 + 56) * S, (y0 + 82) * S), fill=(74, 80, 84, 255), outline=(190, 190, 186, 255), width=3 * S)
    finir(im, "cinq_escalier.jpg", L, H)


def cinq_aile():
    """Aile basse gris anthracite : fenêtres carrées à cadre blanc, pilastre blanc. Module 3,6 × 3,5 m."""
    L, H = 256, 248
    im = toile(L, H, (40, 41, 40, 255)); d = ImageDraw.Draw(im); S = SS
    grain(d, L, H, (52, 53, 52, 255), 400)
    d.rectangle((0, 0, 14 * S, H * S), fill=(214, 214, 208, 255))           # pilastre
    x0, y0 = 84, 70
    d.rectangle((x0 * S, y0 * S, (x0 + 96) * S, (y0 + 96) * S), fill=(226, 226, 222, 255))
    d.rectangle(((x0 + 9) * S, (y0 + 9) * S, (x0 + 87) * S, (y0 + 87) * S), fill=(60, 70, 76, 255))
    d.line(((x0 + 48) * S, (y0 + 9) * S, (x0 + 48) * S, (y0 + 87) * S), fill=(226, 226, 222, 255), width=4 * S)
    finir(im, "cinq_aile.jpg", L, H)


def cinq_bandeau():
    """Couronnement de l'aile basse : bandeau clair, grands disques gris (petite baie carrée au centre)
    reliés par une fente sombre, demi-disques en bas (photo). Module 6 × 3 m."""
    L, H = 512, 256
    im = toile(L, H, (205, 206, 200, 255)); d = ImageDraw.Draw(im); S = SS
    d.rectangle((0, 112 * S, L * S, 132 * S), fill=(64, 66, 66, 255))          # fente horizontale
    for cx in (L / 2,):
        r = 98
        d.ellipse(((cx - r) * S, (122 - r) * S, (cx + r) * S, (122 + r) * S), fill=(118, 120, 118, 255))
        d.ellipse(((cx - r + 8) * S, (122 - r + 8) * S, (cx + r - 8) * S, (122 + r - 8) * S), fill=(132, 134, 132, 255))
        d.rectangle(((cx - 22) * S, (100) * S, (cx + 22) * S, (144) * S), fill=(236, 236, 232, 255))
        d.rectangle(((cx - 15) * S, (107) * S, (cx + 15) * S, (137) * S), fill=(70, 78, 82, 255))
    for cx in (0, L):  # demi-disques au bas, entre deux grands disques
        d.ellipse(((cx - 70) * S, (H - 52) * S, (cx + 70) * S, (H + 88) * S), fill=(118, 120, 118, 255))
    d.rectangle((0, (H - 10) * S, L * S, H * S), fill=(150, 150, 146, 255))
    finir(im, "cinq_bandeau.jpg", L, H)


def lettres(texte, nom, couleur, contour, hauteur=160, marge=30):
    """Lettres sur fond transparent (enseigne)."""
    f = ImageFont.truetype(POLICE, hauteur * SS)
    b = f.getbbox(texte)
    l, h = b[2] - b[0] + 2 * marge * SS, b[3] - b[1] + 2 * marge * SS
    im = Image.new("RGBA", (l, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.text((marge * SS - b[0], marge * SS - b[1]), texte, font=f, fill=couleur, stroke_width=4 * SS, stroke_fill=contour)
    im = im.resize((l // SS, h // SS), Image.LANCZOS)
    im.save(os.path.join(DOSSIER, nom))
    print("  ", nom, im.size)
    return im.size


# --- Stade des Martyrs -------------------------------------------------------------------------
# Photos : SDM Kinshasa.jpg (CC0), Leopard RDC, Kinshasa.jpg (CC BY-SA 4.0), Stade des martyrs Protest.jpg (CC BY-SA 2.0).

def stade_sieges():
    """Gradins : contremarches en béton, sièges bleus et jaunes (photo). 1 module = 8 rangs × 4 m."""
    L, H = 256, 512
    im = toile(L, H, (120, 116, 104, 255)); d = ImageDraw.Draw(im); S = SS
    for r in range(8):
        y = r * 64
        d.rectangle((0, y * S, L * S, (y + 22) * S), fill=(176, 168, 140, 255))        # contremarche
        coul = (30, 80, 190, 255) if r % 8 not in (3, 4) else (240, 196, 30, 255)
        for k in range(8):
            x = k * 32 + 4
            d.rounded_rectangle((x * S, (y + 26) * S, (x + 24) * S, (y + 56) * S), radius=5 * S, fill=coul)
            d.rectangle((x * S, (y + 26) * S, (x + 24) * S, (y + 32) * S), fill=tuple(min(255, v + 40) for v in coul[:3]) + (255,))
    finir(im, "stade_sieges.jpg", L, H)


def stade_panneaux():
    """Couronne extérieure : panneaux verticaux nervurés (photo noir et blanc : teinte non vérifiée)."""
    L, H = 256, 256
    im = toile(L, H, (198, 194, 182, 255)); d = ImageDraw.Draw(im); S = SS
    for k in range(4):
        x = k * 64
        d.rectangle((x * S, 0, (x + 6) * S, H * S), fill=(150, 146, 136, 255))
        d.rectangle(((x + 6) * S, 0, (x + 12) * S, H * S), fill=(220, 216, 206, 255))
    grain(d, L, H, (186, 182, 170, 255), 500, 3)
    finir(im, "stade_panneaux.jpg", L, H)


def piste():
    """Piste d'athlétisme : couloirs rouges, lignes blanches. 1 module = 8 couloirs (9,8 m) × 10 m."""
    L, H = 256, 256
    im = toile(L, H, (168, 66, 48, 255)); d = ImageDraw.Draw(im); S = SS
    grain(d, L, H, (150, 58, 42, 255), 1500, 5)
    for k in range(9):
        y = int(k * (L - 4) / 8) + 2
        d.rectangle((0, y * S, L * S, (y + 2) * S), fill=(240, 240, 236, 255))
    finir(im, "piste.jpg", L, H)


def pelouse():
    L, H = 256, 256
    im = toile(L, H, (64, 118, 46, 255)); d = ImageDraw.Draw(im); S = SS
    d.rectangle((0, 0, L * S, H / 2 * S), fill=(74, 132, 52, 255))      # bandes de tonte
    grain(d, L, H, (56, 104, 40, 255), 2500, 7)
    finir(im, "pelouse.jpg", L, H)


# --- FIKIN -------------------------------------------------------------------------------------
# Photo : Monument de la Foire internationale de Kinshasa (FIKIN) (Fiston bamela, CC0), décembre 2025.

def fikin_banniere():
    """Banderole du hangar d'entrée (photo de décembre 2025)."""
    L, H = 2048, 192
    im = Image.new("RGBA", (L, H), (36, 44, 60, 255)); d = ImageDraw.Draw(im)
    f1 = ImageFont.truetype(POLICE, 92)
    f2 = ImageFont.truetype(POLICE, 44)
    d.text((40, 46), "BIENVENUE", font=f1, fill=(236, 236, 236, 255))
    d.text((690, 40), "À LA", font=f2, fill=(236, 236, 236, 255))
    d.text((690, 96), "46ème ÉDITION", font=f2, fill=(236, 236, 236, 255))
    d.text((1130, 36), "FIKIN", font=ImageFont.truetype(POLICE, 120), fill=(250, 250, 250, 255), stroke_width=4, stroke_fill=(20, 20, 30))
    im.convert("RGB").save(os.path.join(DOSSIER, "fikin_banniere.jpg"), quality=90)
    print("   fikin_banniere.jpg")


def tole():
    """Tôle ondulée (toits de hangars)."""
    L, H = 128, 128
    im = toile(L, H, (150, 152, 150, 255)); d = ImageDraw.Draw(im); S = SS
    for k in range(8):
        x = k * 16
        d.rectangle((x * S, 0, (x + 5) * S, H * S), fill=(176, 178, 176, 255))
        d.rectangle(((x + 10) * S, 0, (x + 14) * S, H * S), fill=(124, 126, 124, 255))
    finir(im, "tole.jpg", L, H)


def drapeau_rdc():
    """Drapeau de la RDC (bleu ciel, bande rouge bordée de jaune, étoile jaune)."""
    import math
    L, H = 384, 288
    im = toile(L, H, (0, 127, 255, 255)); d = ImageDraw.Draw(im); S = SS
    for e, c in ((70, (247, 216, 23, 255)), (50, (206, 16, 33, 255))):
        d.polygon([(0, (H - e * 1.0) * S), (0, H * S), (e * 1.2 * S, H * S), (L * S, e * S), (L * S, 0), ((L - e * 1.2) * S, 0)], fill=c)
    cx, cy, r = 62, 58, 40
    pts = [((cx + (r if k % 2 == 0 else r * 0.4) * math.cos(math.pi / 2 + k * math.pi / 5)) * S,
            (cy - (r if k % 2 == 0 else r * 0.4) * math.sin(math.pi / 2 + k * math.pi / 5)) * S) for k in range(10)]
    d.polygon(pts, fill=(247, 216, 23, 255))
    finir(im, "drapeau_rdc.jpg", L, H)


def terre():
    L, H = 256, 256
    im = toile(L, H, (150, 120, 92, 255)); d = ImageDraw.Draw(im)
    grain(d, L, H, (132, 104, 80, 255), 2500, 9)
    grain(d, L, H, (168, 140, 110, 255), 1500, 11)
    finir(im, "terre.jpg", L, H)


def pavillon_neutre():
    """Mur neutre générique (aucune photo du bâtiment : apparence NON vérifiée)."""
    cinq_fenetres("pavillon_neutre.jpg", mur=(222, 214, 196), clim=False)


if __name__ == "__main__":
    os.makedirs(DOSSIER, exist_ok=True)
    cinq_hublots(); cinq_fenetres(); cinq_escalier(); cinq_aile(); cinq_bandeau()
    lettres("HÔPITAL DU CINQUANTENAIRE", "cinq_lettres.png", (232, 186, 40, 255), (120, 84, 10, 255))
    stade_sieges(); stade_panneaux(); piste(); pelouse()
    fikin_banniere(); tole(); drapeau_rdc(); terre(); pavillon_neutre()
