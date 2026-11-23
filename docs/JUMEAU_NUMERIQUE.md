# Kinshasa 3D : jumeau numérique et mode jeu

> État au 21 novembre 2026. Ce document distingue toujours :
> - ce qui est **réel** (issu d'une source vérifiable) ;
> - ce qui est **estimé** (déduit de données réelles) ;
> - ce qui est **simulé** (inventé par le programme et signalé comme tel).

## 1. Ce qui existe aujourd'hui

| Mode | Couverture | Contenu |
|---|---|---|
| **Carte 3D** (type Google Earth), `web/kinshasa/` | **Toute l'agglomération** : 15,15–15,62 °E et 4,27–4,62 °S, soit environ 52 × 39 km | 1 381 865 bâtiments, 112 127 tronçons de route, 7 409 lieux nommés, fleuve et cours d'eau, limites des communes et quartiers, relief réel, image satellite, recherche, fiche de chaque bâtiment avec son niveau de confiance |
| **Jeu** (type GTA), `web/kinshasa/jeu/` | **Quatre zones** : Limete (3,2 × 3,2 km autour de la Tour de l'Échangeur), la Gombe (9,2 × 4 km le long du fleuve, Barumbu et Grand Marché compris), Lingwala / Kasa-Vubu (2,8 × 4,6 km) et Kalamu (2,6 × 4,5 km) | Limete : 28 636 bâtiments réels ; Gombe : 42 933 ; Lingwala / Kasa-Vubu : 31 674 ; Kalamu : 37 971 ; marche, course et saut ; 6 véhicules conduisibles (berline, taxi, minibus 207, bus, camion, moto) ; circulation et piétons ; cycle jour/nuit ; pluie ; son ; sauvegarde |

**Le mode jeu ne couvre pas encore toute la ville.** Seules les zones de Limete, de la Gombe, de Lingwala / Kasa-Vubu et de Kalamu sont jouables. Le bouton « ▶ Jouer » de la carte ouvre la zone où l'on se trouve, ou propose d'aller à la plus proche. Dans le jeu, le bouton « Changer de zone » (touche J) passe de l'une à l'autre.

Le jeu Godot (`game/`) reste en place et fonctionnel. Il n'a pas été modifié.

## 2. Résultats de la recherche (mesurés, pas supposés)

Toutes les mesures ont été faites le 21/11/2026 sur les données ouvertes **Overture Maps, version 2026-11-18.0**.

### Bâtiments

Zone mesurée : 15,15–15,60 °E et 4,28–4,60 °S.

| Source | Bâtiments | Hauteur connue | Nombre d'étages connu | Nom connu |
|---|---|---|---|---|
| OpenStreetMap (contours dessinés à la main) | 651 790 | 90 | 3 381 | 3 718 |
| Google Open Buildings (contours détectés par satellite) | 697 570 | 0 | 0 | 0 |
| Microsoft ML Buildings | 434 | 0 | 0 | 0 |

**Ce qu'il faut retenir :**
- Le **contour au sol** est connu pour la quasi-totalité de la ville.
- La **hauteur réelle n'est connue que pour environ 0,25 % des bâtiments**. Toutes les autres hauteurs sont **estimées** à partir de la surface au sol : 3,6 m, 4,5 m, 7,5 m ou 10,5 m.
- La **fonction** du bâtiment (maison, école, bureau…) est presque toujours inconnue.

### Routes

Tronçons de route : 88 804 rues résidentielles, 6 042 non classées, 3 744 voies de desserte, 3 282 tertiaires, 1 144 grands axes (trunk), 978 secondaires, 891 principales, et des chemins.

### Lieux

7 409 lieux nommés au total. Les catégories principales :
- 637 églises et 459 organisations religieuses ;
- 289 restaurants ;
- 186 établissements d'enseignement supérieur ;
- 156 hôtels ;
- 81 hôpitaux ;
- 56 stations-service.

### Limites administratives

Les **24 communes** de Kinshasa sont présentes, avec leur surface : Gombe 12,3 km², Limete 28,8 km², Lingwala 2,8 km², Kasa-Vubu 3,8 km², Ngaliema 67,1 km², Mont-Ngafula 477,6 km², Maluku 8 639,5 km², etc.

S'y ajoutent environ 220 quartiers. Fichier : `data/kinshasa/communes_overture.geojson`.

### Relief

Source : **Copernicus DEM GLO-30**, 30 m par pixel. Les altitudes vont de 218 à 729 m, avec une moyenne de 369 m.

Fichier : `data/kinshasa/relief_copernicus_glo30.tif`.

C'est un modèle de **surface**, qui inclut en partie les bâtiments et les arbres. Le jeu le **lisse** pour obtenir un sol approché.

### Images satellite

| Source | Utilisable ? | Explication |
|---|---|---|
| **Sentinel-2 cloudless 2016** (EOX) | ✅ Oui, intégrée | Licence CC BY 4.0, 10 m par pixel |
| Années 2018 à 2025 de la même source | ❌ Non | Licence non commerciale |
| Année 2017 de la même source | ❌ Non | Le serveur renvoie des images vides |
| Google Maps / Google Earth | ❌ Non | Leurs conditions interdisent d'extraire les données ou de les utiliser hors des produits Google |
| Google Photorealistic 3D Tiles | ⚠️ Possible plus tard | Utilisables dans CesiumJS avec une clé API Google, une facturation et l'affichage obligatoire du logo, mais jamais comme données pour le jeu |
| Bing Maps | ❌ Non | Même interdiction |

### Arbres

Dans la zone de Limete, **seulement 43 arbres** sont cartographiés dans OpenStreetMap, alors qu'il y en a bien plus en réalité. Le jeu n'en invente pas.

### Données manquantes, par ordre d'importance

1. **Hauteurs** des bâtiments.
2. **Apparence** des bâtiments : couleurs, toits, clôtures.
3. **Fonction** des bâtiments.
4. **Noms des rues** : partiels.
5. Feux de signalisation et passages piétons : non extraits pour l'instant.
6. **Intérieurs** des bâtiments.
7. Arbres.

Les **photos du terrain** et les **contributions dans OpenStreetMap** sont les meilleurs moyens de combler ces manques.

## 3. Architecture retenue (et pourquoi)

```
Overture Maps / OSM / Copernicus ──► tools/jumeau/*.py (extraction, découpage)
        │
        ├─► web/kinshasa/donnees/kinshasa.pmtiles (58 Mo, toute la ville)
        │      └─► CARTE 3D : MapLibre GL JS (WebGL), tuiles lues par morceaux (requêtes HTTP Range)
        │
        └─► web/kinshasa/jeu/zones/<zone>/ (tuiles de 200 m, ~4 Mo pour 10 km²)
               └─► JEU : Three.js (rendu) + Rapier (physique WebAssembly)
```

| Technologie | Décision | Raison |
|---|---|---|
| **MapLibre GL JS** + **PMTiles** | ✅ Retenue | Affiche 1,4 million de bâtiments sur un téléphone ; un seul fichier statique ; pas de serveur ni de clé API |
| **Three.js** | ✅ Retenue | Rendu 3D libre, léger et fonctionnel sur mobile |
| **Rapier** | ✅ Retenue | Moteur physique en WebAssembly : collisions, personnage, véhicules ; testé automatiquement |
| CesiumJS | ⏸ Écarté pour l'instant | Plus lourd ; jeu de base dépendant de Cesium ion (jeton) ; coordonnées géocentriques difficiles à combiner avec la physique du jeu. Pertinent plus tard pour les tuiles photoréalistes Google, si vous acceptez une clé payante et les conditions de Google |
| PostgreSQL / PostGIS | ⏸ Pas encore | Des fichiers statiques suffisent pour la lecture. Utile plus tard pour les contributions, les annotations ou le multijoueur (Supabase est déjà connecté) |
| React / Next.js | ⏸ Pas nécessaire | Des modules JavaScript sans étape de compilation suffisent |

### Performances

- **Carte** : les tuiles vectorielles n'affichent les bâtiments qu'à partir du zoom 13. Seules les tuiles visibles sont téléchargées.
- **Jeu** :
  - seules les 25 tuiles autour du joueur sont chargées (9 sur mobile) ; les autres sont déchargées (géométrie et collisions) ;
  - une seule géométrie par tuile ;
  - arbres et lampadaires instanciés ;
  - fenêtres dessinées par le shader, sans texture ;
  - circulation limitée à un rayon de 260 m ;
  - piétons animés seulement à moins de 90 m ;
  - 3 niveaux de qualité (`?qualite=basse|moyenne|haute`), avec choix automatique sur mobile ;
  - physique à pas fixe de 1/60 s.

## 4. Mode jeu : ce qui est réel, estimé ou simulé

| Élément | Statut |
|---|---|
| Contours et positions des bâtiments, tracé des routes, lieux, cours d'eau, occupation du sol | **Réel** : OSM, Overture, Google Open Buildings |
| Hauteurs de 301 bâtiments | **Réel** (documentées) |
| Hauteurs des 28 335 autres bâtiments | **Estimé** |
| Relief | **Réel**, puis lissé |
| Tour de l'Échangeur | **Position réelle** ; forme reproduite d'après photos et vidéos ; proportions estimées |
| Arbres | **Réels** (43 arbres OSM) |
| Couleurs des façades, fenêtres, toits | **Simulé** (apparence générique) |
| Lampadaires | **Simulé** : placés tous les 35 m sur les grands axes |
| Circulation, piétons, klaxons | **Simulé** : ce n'est pas le trafic réel |
| Prix, carburant, services | **Simulé** : simulation de jeu |
| Soleil | **Calculé** à la latitude de Kinshasa (−4,35°) |

## 5. Plan de réalisation par communes

Chaque commune suit les mêmes 5 étapes :
1. découpage de la zone (`decouper_zone.py`) ;
2. modélisation des monuments d'après photos ;
3. correction des hauteurs connues ;
4. tests automatiques ;
5. vérification visuelle par rapport aux photos.

| Ordre | Zone | Monuments prévus | État |
|---|---|---|---|
| 1 | **Limete** (Échangeur) | Tour de l'Échangeur, boulevard Lumumba, passerelles, FIKIN | ✅ Prototype jouable |
| 2 | **Gombe** | Boulevard du 30 Juin, Tour Sozacom, Hôtel du Fleuve, gare centrale, port, Palais de la Nation, bord du fleuve | ✅ Prototype jouable : bâtiments, rues, fleuve et transports réels. Les monuments ne sont pas encore modélisés à part (ce sont les volumes génériques des données). |
| 3 | **Lingwala / Kasa-Vubu** | Stade des Martyrs, Palais du Peuple, Hôpital du Cinquantenaire | ✅ Prototype jouable : les trois monuments sont modélisés sur leurs contours OSM réels (formes d'après photos, hauteurs estimées) |
| 4 | **Barumbu / Kinshasa / Kalamu** | Marché central, Matonge, Rond-point Victoire | ✅ Barumbu et le Grand Marché sont dans la zone de la Gombe ; Kalamu (Matonge, Rond-point Victoire) est une zone à part. Pas de monument modélisé à part. |
| 5 | **Lemba / Mont-Ngafula** | Université de Kinshasa (UNIKIN), collines | À faire |
| 6 | **N'djili / Masina** | Aéroport international de N'djili | À faire |
| 7 | Autres communes | Uniquement des zones urbaines denses ; Maluku et Nsele sont surtout rurales | À faire |

**Pour aller plus loin que des zones séparées**, il faudra charger les tuiles de la ville entière comme une seule zone continue, au lieu de zones de 3 km. C'est faisable avec le même format, en passant à une grille globale. Volume estimé : environ 600 km² urbanisés, soit **environ 250 Mo** de tuiles de jeu.

## 6. Stockage et coûts estimés

| Élément | Taille |
|---|---|
| Carte de toute la ville (`kinshasa.pmtiles`) | 58 Mo |
| Relief (tuiles) | 15 Mo |
| Index de recherche | 1,1 Mo |
| Zone de jeu de Limete (10 km²) | 4,4 Mo |
| Zone de jeu de la Gombe (37 km², dont une partie de fleuve) | 9,6 Mo |
| Zone de jeu de Lingwala / Kasa-Vubu (13 km²) | 5,3 Mo |
| Zone de jeu de Kalamu (12 km²) | 5,8 Mo |
| Personnages et animations | 17 Mo |

**Hébergement** : ce sont uniquement des fichiers statiques, sans serveur à faire tourner.
- Cloudflare R2 : 10 Go gratuits, sans frais de sortie.
- GitHub Pages : limite de 1 Go par site.
- Vercel : quotas gratuits limités.

Pour le prototype, le coût est de **0 €**.

## 7. Lancer et tester

```
# 1. Serveur local (gère les requêtes « Range » nécessaires aux fichiers PMTiles)
python tools/jumeau/serveur_local.py 8080
#    puis ouvrir http://localhost:8080/        (carte)
#             ou http://localhost:8080/jeu/    (jeu)

# 2. Tests de la physique (Node.js 20 ou plus)
cd web/kinshasa/jeu && npm install && npm test

# 3. Test de bout en bout dans un navigateur (Playwright)
node web/kinshasa/jeu/tests/e2e_navigateur.cjs http://localhost:8080
```

### Reconstruire les données

```
python tools/jumeau/extraire_donnees.py build/jumeau/sources
bash   tools/jumeau/construire_tuiles.sh
python tools/jumeau/construire_relief.py data/kinshasa/relief_copernicus_glo30.tif web/kinshasa/donnees/relief
python tools/jumeau/construire_index.py build/jumeau/sources web/kinshasa/donnees/index.json
python tools/jumeau/decouper_zone.py limete -4.374384 15.345467 1600 data/kinshasa/relief_copernicus_glo30.tif web/kinshasa/jeu/zones/limete
python tools/jumeau/decouper_zone.py gombe -4.3120 15.30485 4600x2000 data/kinshasa/relief_copernicus_glo30.tif web/kinshasa/jeu/zones/gombe
python tools/jumeau/decouper_zone.py centre -4.3328 15.3034 1400x2300 data/kinshasa/relief_copernicus_glo30.tif web/kinshasa/jeu/zones/centre tools/jumeau/monuments/centre.json
python tools/jumeau/extraire_transports.py web/kinshasa/jeu/zones/limete
python tools/jumeau/decouper_zone.py kalamu -4.3496 15.3164 1300x2250 data/kinshasa/relief_copernicus_glo30.tif web/kinshasa/jeu/zones/kalamu
python tools/jumeau/extraire_transports.py web/kinshasa/jeu/zones/centre
python tools/jumeau/extraire_transports.py web/kinshasa/jeu/zones/kalamu
python tools/jumeau/extraire_transports.py web/kinshasa/jeu/zones/gombe
```

### Tests effectués le 21/11/2026

**Tests de physique (10/10 réussis)** :
- projection géographique ;
- relief ;
- trajets ;
- chacun des 6 véhicules roule, tourne et freine ;
- un véhicule est arrêté par un mur.

**Test navigateur (10/10 réussis)** :
- la carte se charge sans erreur ;
- les tuiles se chargent ;
- la circulation et les piétons apparaissent ;
- le personnage marche ;
- il monte dans un véhicule, roule, freine et descend ;
- la partie est sauvegardée ;
- aucune erreur JavaScript.

**Téléphone simulé (Pixel 7)** : le joystick tactile déplace bien le personnage.

**Non testé** : vrais téléphones, vraies cartes graphiques, iPhone.

## 8. Limites connues

- **Physique** : Rapier 0.14 ignore la commande de frein des roues. Le freinage est donc appliqué au châssis. Testé.
- **Moto** : la physique interdit la chute ; l'inclinaison dans les virages est seulement visuelle.
- **Bâtiments** : pas d'intérieurs ; hauteurs majoritairement estimées.
- **Personnages** : aucune coiffure pour le joueur dans la version web (crâne rasé).
- **Circulation** : les véhicules ne respectent pas encore de feux ni de priorités aux carrefours.
