"""Construit le registre des bâtiments remarquables : web/kinshasa/jeu/donnees/batiments.json.

Chaque fiche réunit : identité (noms, catégorie, adresse, commune, GPS), modèle 3D, emprise (où les
bâtiments génériques sont retirés), entrée (destination GPS), références photographiques, sources,
niveau de fidélité ÉLÉMENT PAR ÉLÉMENT, date de vérification, vues de contrôle.

Statuts des éléments : photo (vu sur une photo libre), osm (OpenStreetMap), satellite (empreinte
détectée par satellite), estime (mesure estimée), deduit (hypothèse cohérente, non vérifiée),
absent (pas reproduit, faute de référence).

Usage : python3 tools/batiments/construire_registre.py
"""
import json
import math
import os

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(ICI, "..", "..", "web", "kinshasa", "jeu", "donnees", "batiments.json")
DATE = "2026-11-23"


def donnees(i):
    return json.load(open(os.path.join(ICI, "donnees", f"{i}.json"), encoding="utf-8"))


def contour(d, ref):
    p = [tuple(q) for q in d["contours"][ref]["p"]]
    return [list(q) for q in (p[:-1] if p[0] == p[-1] else p)]


def agrandir(poly, m):
    cx = sum(p[0] for p in poly) / len(poly)
    cz = sum(p[1] for p in poly) / len(poly)
    out = []
    for x, z in poly:
        d = math.hypot(x - cx, z - cz) or 1
        out.append([round(x + (x - cx) / d * m, 1), round(z + (z - cz) / d * m, 1)])
    return out


def route_proche(d, x, z):
    best, bp = 1e9, None
    for r in d["routes"]:
        for a, b in zip(r["p"], r["p"][1:]):
            dx, dz = b[0] - a[0], b[1] - a[1]
            l2 = dx * dx + dz * dz or 1
            t = max(0, min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2))
            px, pz = a[0] + dx * t, a[1] + dz * t
            dd = math.hypot(px - x, pz - z)
            if dd < best:
                best, bp = dd, [round(px, 1), round(pz, 1)]
    return bp


E = lambda element, statut: {"element": element, "statut": statut}

# --- Hôpital du Cinquantenaire --------------------------------------------------------------------
dc = donnees("cinquantenaire")
site_c = contour(dc, "way:102422512")
A, B = site_c[1], site_c[2]
L = math.dist(A, B)
u = ((B[0] - A[0]) / L, (B[1] - A[1]) / L)
hall = (-54.4, 23.8)
t = (hall[0] - A[0]) * u[0] + (hall[1] - A[1]) * u[1]
portail = [round(A[0] + u[0] * t - u[1] * 6, 1), round(A[1] + u[1] * t + u[0] * 6, 1)]

cinquantenaire = {
    "id": "cinquantenaire", "version": 2,
    "nom_officiel": "Hôpital du Cinquantenaire",
    "nom_courant": "Hôpital du Cinquantenaire",
    "autres_noms": ["CHU du Cinquantenaire (CHU-50, depuis 2026)", "ancien Hôpital cardiologique"],
    "categorie": "hopital", "categorie_libelle": "Établissement hospitalier", "priorite": 2,
    "adresse": "Avenue de la Libération (ex-boulevard du 24 Novembre)", "commune": "Kasa-Vubu", "zone": "centre",
    "gps": {"lat": -4.34169, "lon": 15.29633},
    "modele": "assets/batiments/cinquantenaire.glb", "lod": [180, 600],
    "emprise": [site_c], "entree": portail,
    "description": "Grand hôpital public (515 lits selon Wikipédia), dont la construction a commencé en 1954 et qui a été inauguré "
                   "le 22 mars 2014. Grand bloc blanc à hublots ovales, blocs blancs à fenêtres, longue aile basse gris "
                   "anthracite couronnée d'un bandeau à grands disques, portique d'entrée aux lettres dorées.",
    "references": ["cinquantenaire_ouest_2025"],
    "sources": ["https://fr.wikipedia.org/wiki/H%C3%B4pital_du_Cinquantenaire",
                "https://acp.cd/science-sante-environnement/les-innovations-sanitaires-du-centre-hospitalier-du-cinquantenaire-presentees-aux-journalistes/",
                "https://medialab.sciencespo.fr/productions/2022-the-brand-new-ruins-of-public-health-a-tale-of-two-buildings-kinshasa-drc",
                "https://www.openstreetmap.org/way/102422512"],
    "fidelite": {
        "niveau": "moyenne",
        "resume": "Façade ouest (côté avenue) reproduite d'après une photo libre de 2025 ; plan d'après les empreintes satellite ; "
                  "hauteurs estimées ; faces non photographiées déduites.",
        "elements": [
            E("Position et contour du terrain", "osm"),
            E("Plan des bâtiments (49 empreintes)", "satellite"),
            E("Façade ouest du grand bloc : hublots ovales reliés par des barres, reliefs en losange, tour d'escalier", "photo"),
            E("Aile basse gris anthracite, fenêtres à cadre blanc, pilastres", "photo"),
            E("Bandeau à grands disques et demi-disques", "photo"),
            E("Portique d'entrée et lettres dorées « HÔPITAL DU CINQUANTENAIRE »", "photo"),
            E("Grille noire à piliers surmontés de globes, pelouse, palmier", "photo"),
            E("Auvents voûtés du parking", "photo"),
            E("Bloc blanc à fenêtres et mât (sud)", "photo"),
            E("Hauteur du grand bloc : 8 niveaux ≈ 27 m", "estime"),
            E("Faces nord, est et sud du grand bloc ; bloc nord ; annexes ; ailes nord", "deduit"),
            E("Couleurs : gris et blanc (photo de 2025) — les « hublots rouges » d'une version précédente ne sont pas confirmés", "photo"),
            E("Intérieurs, enseignes secondaires, parking réel", "absent"),
        ],
    },
    "date_verification": DATE,
    "notes": ["La position GPS enregistrée par le téléphone de la photo semble décalée d'environ 120 m : la vue de comparaison "
              "est placée là où la disposition des bâtiments correspond (point de vue perpendiculaire à la grille).",
              "L'empreinte satellite du grand bloc (saillie de 9,4 m côté ouest) correspond à la tour d'escalier de la photo."],
    "vues": {
        "photo": {"nom": "Comme la photo", "pos": [-241, 1.7, -48], "cible": [-40, 11, 28], "fov": 12, "photo": "cinquantenaire_ouest_2025"},
        "face": {"nom": "Face (avenue)", "pos": [-175, 18, 26], "cible": [0, 10, 30], "fov": 50},
        "cote": {"nom": "Côté (nord)", "pos": [-40, 35, -230], "cible": [30, 5, 40], "fov": 50},
        "aerien": {"nom": "Aérien", "pos": [-230, 300, 280], "cible": [0, 0, 20], "fov": 45},
    },
}

# --- Stade des Martyrs ------------------------------------------------------------------------------
ds = donnees("stade_martyrs")
cont_s = contour(ds, "way:4402561")
stade = {
    "id": "stade_martyrs", "version": 2,
    "nom_officiel": "Stade des Martyrs de la Pentecôte", "nom_courant": "Stade des Martyrs",
    "autres_noms": ["Stade Kamanyola (nom d'origine)"],
    "categorie": "stade", "categorie_libelle": "Stade", "priorite": 3,
    "adresse": "Avenue de la Région, Djalo", "commune": "Lingwala", "zone": "centre",
    "gps": {"lat": -4.33018, "lon": 15.31036},
    "modele": "assets/batiments/stade_martyrs.glb", "lod": [260, 900],
    "emprise": [agrandir(cont_s, 8)], "entree": [-128.0, 20.0],
    "description": "Stade national de la RDC, environ 80 000 places, construit avec la coopération chinoise (1988-1993) "
                   "et inauguré en septembre 1994. Cuvette ovale à deux niveaux, sans façade fermée : de l'extérieur on voit "
                   "le dessous incliné de la tribune haute, porté par des poteaux obliques.",
    "references": ["stade_exterieur_2025", "stade_tribunes_2022", "stade_tribune_principale_2017", "stade_petit_terrain_2024"],
    "sources": ["https://fr.wikipedia.org/wiki/Stade_des_Martyrs", "https://www.openstreetmap.org/way/4402561",
                "https://www.openstreetmap.org/way/612365315"],
    "fidelite": {
        "niveau": "moyenne",
        "resume": "Contour et pelouse réels (OpenStreetMap) ; structure extérieure et tribunes d'après quatre photos libres ; "
                  "hauteurs, nombre de travées et couleur extérieure estimés.",
        "elements": [
            E("Contour (296 × 228 m) et orientation", "osm"),
            E("Pelouse synthétique 105 × 68 m", "osm"),
            E("Cuvette sans façade fermée, dessous incliné de la tribune haute, poteaux obliques, poutre annulaire", "photo"),
            E("Couronne de panneaux verticaux nervurés", "photo"),
            E("Deux niveaux de tribunes, bandeau ocre intermédiaire", "photo"),
            E("Sièges bleus et jaunes, béton ocre-jaune à l'intérieur", "photo"),
            E("Galerie couverte au sommet, rive de toiture en dents de scie", "photo"),
            E("Garde-corps blanc en bord de pelouse", "photo"),
            E("Piste d'athlétisme de 400 m (8 couloirs, rouge)", "deduit"),
            E("Hauteur (≈ 35 m), nombre de travées (96), répartition des couleurs de sièges", "estime"),
            E("Couleur extérieure (photo noir et blanc)", "estime"),
            E("Emplacement des accès (4)", "deduit"),
            E("Écran géant, éclairage, terrain annexe, salle omnisports", "absent"),
        ],
    },
    "date_verification": DATE,
    "vues": {
        "exterieur": {"nom": "Extérieur (comme la photo)", "pos": [-150, 3, -205], "cible": [0, 18, -40], "fov": 40, "photo": "stade_exterieur_2025"},
        "tribunes": {"nom": "Tribunes", "pos": [20, 4, 10], "cible": [-60, 22, -30], "fov": 70, "photo": "stade_tribunes_2022"},
        "face": {"nom": "Face", "pos": [-300, 40, 0], "cible": [0, 12, 0], "fov": 50},
        "aerien": {"nom": "Aérien", "pos": [-260, 300, 260], "cible": [0, 0, 0], "fov": 45},
    },
}

# --- FIKIN --------------------------------------------------------------------------------------------
df = donnees("fikin")
site_f = contour(df, "way:4708901")
fikin = {
    "id": "fikin", "version": 2,
    "nom_officiel": "Foire internationale de Kinshasa", "nom_courant": "FIKIN",
    "autres_noms": ["Foire internationale du Congo"],
    "categorie": "foire", "categorie_libelle": "Parc des expositions", "priorite": 1,
    "adresse": "Masiala, accès par la route vers la FIKIN", "commune": "Limete", "zone": "limete",
    "gps": {"lat": -4.37202, "lon": 15.33781},
    "modele": "assets/batiments/fikin.glb", "lod": [220, 750],
    "emprise": [site_f], "entree": [285.0, -72.0],
    "description": "Parc des expositions ouvert le 30 juin 1969 (environ 18 à 28 ha), pillé en 1991 et 1993, en cours de "
                   "réhabilitation. À l'entrée est : grande statue blanche sur socle sombre et hangar à banderole.",
    "references": ["fikin_monument_2025"],
    "sources": ["https://fr.wikipedia.org/wiki/Foire_internationale_de_Kinshasa", "https://www.openstreetmap.org/way/4708901",
                "https://kosubaawate.blogspot.com/2015/03/kinshasa-1969-fikin-puts-congo-on-new.html",
                "https://www.mediacongo.net/article-actualite-62122_en_marge_de_9e_jeux_de_la_francophonie_prevus_a_kinshasa_1_34_millions_usd_decaisses_pour_rehabiliter_neuf_pavillons_de_la_fikin.html"],
    "fidelite": {
        "niveau": "faible",
        "resume": "Seule l'entrée (statue, hangar, drapeaux) est documentée par une photo libre ; les pavillons sont "
                  "placés sur leurs empreintes satellite mais leur apparence n'est pas vérifiée.",
        "elements": [
            E("Contour du site, sol en terre", "osm"),
            E("Statue monumentale blanche (main levée, objet rond, pagne) sur socle sombre", "photo"),
            E("Hangar à toit de tôle, banderole « Bienvenue à la 46e édition FIKIN », grille, drapeaux de la RDC", "photo"),
            E("Position de l'entrée (est) : route « Entrée FIKIN » d'OSM et arrière-plan industriel de la photo", "deduit"),
            E("Proportions de la statue (≈ 6,5 m + socle 1,8 m)", "estime"),
            E("Pavillons : position et forme", "satellite"),
            E("Pavillons : murs clairs, toits de tôle (apparence)", "deduit"),
            E("14 empreintes du parvis non construites (la photo de 2025 y montre un parking dégagé)", "deduit"),
            E("Noms et architecture des pavillons, parc d'attractions, décorations temporaires « 2025 »", "absent"),
        ],
    },
    "date_verification": DATE,
    "vues": {
        "monument": {"nom": "Monument (comme la photo)", "pos": [245, 1.6, -71], "cible": [309, 4.8, -72], "fov": 20, "photo": "fikin_monument_2025"},
        "entree": {"nom": "Entrée", "pos": [250, 14, -130], "cible": [350, 4, -62], "fov": 45},
        "aerien": {"nom": "Aérien", "pos": [-350, 420, 420], "cible": [0, 0, 0], "fov": 45},
    },
}

# --- Hôpital Général de Référence de Kintambo ----------------------------------------------------------
dk = donnees("kintambo_hgr")
sites_k = [contour(dk, "way:404843994"), contour(dk, "way:539014983")]
kintambo = {
    "id": "kintambo_hgr", "version": 1,
    "nom_officiel": "Hôpital Général de Référence de Kintambo", "nom_courant": "Hôpital de Kintambo",
    "autres_noms": ["Hôpital général de Kintambo", "Maternité de Kintambo (bâtiment voisin)"],
    "categorie": "hopital", "categorie_libelle": "Établissement hospitalier", "priorite": 2,
    "adresse": "Avenue de l'OUA / avenue de l'Hôpital, Lisala", "commune": "Kintambo", "zone": "kintambo",
    "gps": {"lat": -4.33460, "lon": 15.27099},
    "modele": "assets/batiments/kintambo_hgr.glb", "lod": [160, 480],
    "emprise": sites_k, "entree": route_proche(dk, -40, 0),
    "description": "Hôpital général de référence de la commune de Kintambo : pavillons parallèles d'un seul niveau (plan "
                   "réel). La maternité de Kintambo est voisine. « Hôpital de Kintambo » désigne cet établissement ; il ne "
                   "s'agit pas d'un hôpital pédiatrique distinct (vérifié : rapport MCSP 2019, OpenStreetMap).",
    "references": [],
    "sources": ["https://www.openstreetmap.org/way/404843994", "https://www.openstreetmap.org/way/539014983",
                "https://www.mcsprogram.org/wp-content/uploads/dlm_uploads/2019/06/DRC-Model-Training-Center-Case-Study-FINAL_French.pdf"],
    "fidelite": {
        "niveau": "volumetrie",
        "resume": "Aucune photo libre trouvée : le plan (51 bâtiments) est réel, l'apparence est une hypothèse neutre. "
                  "Le modèle n'est PAS considéré comme terminé.",
        "elements": [
            E("Nom exact et identité de l'établissement", "osm"),
            E("Contours du site et de la maternité", "osm"),
            E("Plan des pavillons", "osm"),
            E("Un seul niveau (documenté pour la maternité)", "osm"),
            E("Hauteur des autres pavillons (1 niveau)", "estime"),
            E("Murs clairs, fenêtres, toits de tôle en croupe", "deduit"),
            E("Façades, entrées, enseignes, galeries couvertes, couleurs réelles", "absent"),
        ],
    },
    "date_verification": DATE,
    "vues": {
        "face": {"nom": "Face", "pos": [-150, 25, 40], "cible": [0, 2, 0], "fov": 50},
        "aerien": {"nom": "Aérien", "pos": [-180, 230, 220], "cible": [0, 0, 0], "fov": 45},
    },
}

refs = json.load(open(os.path.join(ICI, "references.json"), encoding="utf-8"))
registre = {
    "version": 2,
    "genere": DATE,
    "note": "Registre des bâtiments remarquables de Kinshasa 3D (généré par tools/batiments/construire_registre.py). "
            "Repère des emprises, entrées et vues : mètres autour du point GPS (x = est, y = haut, z = sud).",
    "statuts": {"photo": "vu sur une photo libre", "osm": "OpenStreetMap", "satellite": "empreinte satellite",
                "estime": "valeur estimée", "deduit": "hypothèse non vérifiée", "absent": "non reproduit"},
    "photos": refs["photos"],
    "batiments": [cinquantenaire, stade, fikin, kintambo],
}
json.dump(registre, open(SORTIE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(registre['batiments'])} fiches -> {SORTIE}")
