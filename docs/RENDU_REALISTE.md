# Rendu réaliste du mode jeu — audit, travaux, limites

Ce document répond à la demande « transformer le rendu low-poly en ville 3D photoréaliste ».

Il présente quatre choses :
- l'état du moteur avant les travaux ;
- ce qui a réellement été changé ;
- les mesures avant/après ;
- les limites restantes.

Il évalue aussi les technologies possibles : Unreal Engine 5, CesiumJS, WebGPU.

> **Résumé honnête.**
>
> Le rendu est passé de **blocs unis** à des **bâtiments texturés et détaillés** : toitures, fenêtres en relief, grilles, portes, balcons, réservoirs, climatiseurs. S'y ajoutent des rues réalistes, de la vraie végétation 3D, des reflets, un sol mouillé et des véhicules détaillés.
>
> Ce n'est **pas** encore la qualité de GTA V ni d'Unreal Engine 5. Ce niveau demande des milliers de modèles faits à la main par des artistes, ce qu'aucun générateur automatique ne remplace. La section 5 explique ce qui manque et comment s'en approcher.

---

## 1. Audit du moteur (avant)

| Élément | État avant | Fichier |
|---|---|---|
| Bâtiments | Prismes extrudés depuis le contour réel. Une couleur unie par bâtiment, toit plat de couleur unie, fenêtres **peintes par un shader** (sans relief). | `js/monde.js` (`_batiments`) |
| Matériaux | Aucune texture. `MeshStandardMaterial` avec couleurs de sommets. | `js/monde.js` |
| Rues | Rubans de couleur unie (gris ou terre), tirets blancs. Pas de trottoirs ni de bordures. | `js/monde.js` (`_routes`) |
| Sol | Relief réel (Copernicus) de couleur unie « terre battue » | `js/monde.js` (`_creerSol`) |
| Arbres | Un seul modèle : un cylindre et une boule à facettes | `js/monde.js` (`_arbres`) |
| Éclairage | Ciel physique (`Sky`), soleil à la bonne position pour Kinshasa, ombres, brume, pluie. **Pas de reflets** (pas de carte d'environnement). | `js/environnement.js` |
| Véhicules | Assemblages de boîtes, roues cylindriques | `js/vehicules.js` |
| Personnages | Modèles riggés Quaternius (CC0), environ 30 animations, vêtements par shader. Pas d'expressions faciales. | `js/personnages.js` |

Mesures avant/après : voir la section 3.

---

## 2. Ce qui a été fait

### 2.1 Matériaux PBR photographiques

Source : Poly Haven, licence CC0, outil `tools/jumeau/telecharger_textures.py`.

Il y a **16 matériaux**, chacun avec 3 images : couleur, normale (relief fin), et ARM (occlusion, rugosité, métal).
- Façades : crépi clair (teinté), crépi sali, parpaings apparents, brique rouge, béton.
- Toitures : tôle ondulée neuve, tôle ancienne, tuiles.
- Sols et rues : asphalte fissuré, latérite rouge (rues en terre), terre rouge, pavés, herbe.
- Divers : rideau métallique de boutique, métal rouillé, écorce de palmier.

Détails techniques :
- Les coordonnées de texture sont en mètres : une brique garde sa taille réelle sur toutes les façades.
- **Deux résolutions** : 1024 px (PC), et 512 px sans cartes de normales (qualité « basse », téléphone).
- **Imperfections** :
  - pied des murs sali par la terre rouge (éclaboussures de latérite) ;
  - bords de chaussée assombris ;
  - tôles neuves, grises ou rouillées ;
  - variations de teinte des rues en terre.

### 2.2 Générateur architectural (`js/architecture.js`)

Chaque emprise réelle est classée selon sa taille, sa hauteur et sa catégorie (Overture/OSM) :

| Type | Règle | Rendu |
|---|---|---|
| Maison populaire | Hauteur inférieure à 5,5 m, moins de 170 m² | Crépi coloré ou sali, ou parpaings apparents. Toit en tôle à 1 ou 2 pentes avec débord, ou dalle béton avec « fers en attente » et réservoir. Porte métallique, fenêtres à grilles. |
| Villa | Plus de 170 m², un niveau | Toit en tôle ou en tuiles, fenêtres à cadre |
| Maison à étage | 5,5 à 12 m | Bandeaux d'étage, balcons et garde-corps, climatiseurs, dalle et réservoirs. Parfois des boutiques au rez-de-chaussée (rideaux métalliques et enseignes). |
| Immeuble | 12 à 30 m | Grille de fenêtres, bandeaux, balcons, climatiseurs, réservoirs, paraboles |
| Tour | 30 m et plus | Mur-rideau vitré réfléchissant, socle en béton, édicule technique |
| Commerce | Catégorie commerce | Rideaux métalliques et enseignes génériques (ALIMENTATION, PHARMACIE, NGANDA - TERRASSE…) |
| Entrepôt | Industriel, ou plus de 1500 m² et bas | Bardage en tôle, soubassement en parpaings, portes roulantes |
| Marché couvert | Catégorie marché ou nom « Marché… » | Toiture sur poteaux, sans murs |
| Administratif, église | Catégorie | Crépi clair, grandes fenêtres, toiture à pentes |

Couleurs de façade : une palette de peintures relevées sur des photos de rues kinoises.

**Niveaux de détail (LOD)** :
- Les tuiles proches (autour du joueur) reçoivent les **détails en vrai relief** : fenêtres à cadre et vitre réfléchissante, grilles en fer forgé, portes, rideaux, enseignes, climatiseurs, réservoirs, paraboles, garde-corps, fers d'attente. Ce sont des objets instanciés : peu d'appels de dessin.
- Les tuiles plus lointaines gardent les murs texturés, les toitures et les balcons, avec des fenêtres simplifiées.

### 2.3 Rues

- **Revêtement réel quand il est cartographié.** Le champ `road_surface` d'Overture est maintenant extrait par `decouper_zone.py`. À Limete, 403 tronçons sur 1998 ont un revêtement connu.
- Sinon, le revêtement est **estimé par la classe** : grands axes asphaltés, rues de quartier en latérite rouge.
- Chaussée en 3 bandes, avec bords salis.
- Marquages : axe discontinu, lignes de rive sur les grands axes.
- **Trottoirs pavés surélevés de 14 cm, avec bordure en béton**, le long des axes asphaltés. Ils s'interrompent aux carrefours, qui sont détectés depuis le réseau réel.

### 2.4 Végétation (`js/vegetation.js`)

Trois arbres en vrais modèles 3D :
- **manguier** : houppier dense et irrégulier ;
- **palmier** : stipe courbé avec texture d'écorce réelle, 10 palmes ;
- **acacia / flamboyant** : en parasol.

Origine des arbres :
- **Positions réelles** : les arbres cartographiés dans OSM.
- **Positions estimées**, signalées dans l'aide du jeu :
  - zones arborées vues par satellite ;
  - arbres d'alignement des grandes avenues ;
  - arbres des cours (environ un pour 900 m² de terrain libre). OSM ne cartographie que 43 arbres dans tout Limete.

Les espèces sont choisies par le jeu : aucune donnée d'espèce n'existe.

### 2.5 Éclairage et atmosphère

- **Reflets** : une carte d'environnement est calculée depuis le ciel physique. Elle est mise à jour selon l'heure et la météo, et sert aux vitres, à la tôle, aux carrosseries et à l'eau.
- **Sol mouillé** sous la pluie : asphalte, latérite, pavés et béton deviennent plus sombres et plus brillants, puis sèchent lentement.
- Les fenêtres des bâtiments proches s'allument au hasard la nuit.
- Exposition et lumière d'ambiance sont réajustées pour tenir compte de l'éclairage du ciel.

### 2.6 Véhicules

Toujours des modèles construits en code, mais beaucoup plus détaillés :
- carrosserie **profilée aux arêtes arrondies** ;
- vitrage réfléchissant et montants ;
- pare-chocs, calandre, bas de caisse ;
- rétroviseurs, poignées et lignes de portes ;
- phares, feux et clignotants ;
- **plaques** (numéro fictif) ;
- pneus avec flancs, jantes à 5 rayons.

Éléments typiques de Kinshasa :
- **taxi** jaune à bande bleue, avec enseigne de toit ;
- **minibus « 207 »** avec bande bleue, porte coulissante ouverte et galerie de toit ;
- **bus** avec girouette ;
- **ambulance** et **police** avec gyrophares ;
- **moto** avec réservoir, fourche, phare rond et pot d'échappement.

---

## 3. Mesures (avant / après)

Conditions :
- même machine de test ;
- Chromium **sans carte graphique** (rendu logiciel SwiftShader, donc très lent) ;
- 1280 × 720, qualité « moyenne », 10 h, temps dégagé.

Les images par seconde n'ont de sens qu'en **comparaison** : sur un vrai PC ou téléphone, le processeur graphique fait ce travail beaucoup plus vite.

| Vue | Avant : images/s, triangles, appels | Après (moyenne) : images/s, triangles, appels |
|---|---|---|
| Limete, rue de quartier (Rue Kanga) | 1,3 · 742 000 · 394 | 0,7 · 1 845 000 · 658 |
| Limete, ruelle | 1,3 · 566 000 · 151 | 0,7 · 1 579 000 · 355 |
| Limete, vue aérienne | 1,3 · 770 000 · 242 | 0,7 · 1 519 000 · 485 |
| Gombe, avenue du Bandundu | 1,3 · 705 000 · 204 | 0,7 · 1 771 000 · 491 |
| Gombe, avenue des Aviateurs | 1,3 · 774 000 · 359 | 0,7 · 2 436 000 · 804 |
| Gombe, vue aérienne | 1,3 · 855 000 · 197 | 0,7 · 1 865 000 · 425 |
| Lingwala / Kasa-Vubu, rue | 1,3 · 764 000 · 357 | 0,7 · 1 812 000 · 833 |

Les triangles comptent aussi ceux des ombres. Le temps de chargement d'une zone passe de 4–6 s à 7–12 s, à cause des textures et de la génération des bâtiments.

**Qualité « basse » (téléphone)** : sans détails en relief, textures 512 px, sans normales ni ombres.
- Limete, rue : 1,3 image/s, 723 000 triangles.
- Gombe, avenue : 1,7 image/s, 907 000 triangles.

C'est la **même vitesse qu'avant**, avec les textures, les toitures et les nouveaux arbres.

**Interprétation.**
- En qualité « moyenne », la charge est environ 2 fois plus élevée dans ce rendu logiciel. Les textures et les objets à dessiner ont augmenté.
- Pour limiter les appels de dessin, les pièces fixes des véhicules sont fusionnées par matériau, et les roues partagent leur géométrie. Une rue de Limete est passée de 953 à 658 appels.
- Sur un PC à carte graphique intégrée (Intel UHD 620), les mesures restent à faire sur la vraie machine. Si c'est trop lent, la qualité « basse » reste disponible (`?qualite=basse`).
- L'ancien rendu reste accessible pour comparer : `?rendu=simple`.

---

### Captures avant / après (mêmes points de vue, même heure)

![Limete, ruelle](images/rendu/comparaison_limete_ruelle.jpg)
![Limete, vue aérienne](images/rendu/comparaison_limete_aerien.jpg)
![Gombe, avenue des Aviateurs](images/rendu/comparaison_gombe_aviateurs.jpg)
![Gombe, avenue du Bandundu](images/rendu/comparaison_gombe_avenue.jpg)

---

### Tests

- `npm test` : **22 sur 22**. Les modèles de véhicules restent compatibles avec la physique.
- Test navigateur `tests/e2e_navigateur.cjs` : **25 sur 25**, 2 passages consécutifs, aucune erreur JavaScript. Un défaut a été trouvé et corrigé en route : sur le camion, des coordonnées invalides (NaN) venaient d'un montant de cabine inexistant.

Dans ce rendu logiciel, le jeu tourne plus lentement qu'avec l'ancien rendu. Mesuré en marchant à Gombe pendant 6 s :
- ancien rendu : 1,9 m parcourus ;
- nouveau rendu : 1,2 m parcourus.

Les durées de marche et de conduite des tests ont donc été allongées (2 → 4 s, 3 → 5 s, 3 → 6 s), sans changer les seuils de distance.

---

## 4. Technologies évaluées

| Option | Qualité possible | Compatibilité avec le projet | Conclusion |
|---|---|---|---|
| **Three.js / WebGL 2** (actuel) | Bonne avec des matériaux PBR, des modèles glTF faits main, des reflets et un post-traitement léger | Fonctionne déjà sur PC et téléphone, dans le navigateur, sans installation | **Conservé.** Tout ce qui précède est fait avec. |
| **Three.js / WebGPU** | Ombres et éclairage plus riches, plus d'objets à l'écran | Pris en charge dans Chrome. Safari iOS et beaucoup de téléphones Android d'entrée de gamme restent en retrait. | À activer plus tard comme **option**, en gardant WebGL. Le moteur Three.js a un rendu WebGPU qui accepte les mêmes scènes. |
| **Unreal Engine 5** (Lumen, Nanite) | La meilleure (proche de GTA V) | Ne tourne **pas** dans un navigateur ni sur un téléphone moyen. Il faut une carte graphique dédiée. Votre PC (i5-8265U, carte graphique intégrée, 8 Go) le ferait tourner très lentement. La seule voie web est le *Pixel Streaming* : un serveur GPU loué par joueur, environ 0,5 à 1 $ de l'heure. | **Non retenu** : incompatible avec une application web gratuite pour PC et téléphone. Ce serait un projet séparé, en version PC. |
| **CesiumJS + Google Photorealistic 3D Tiles** | Photogrammétrie réelle, très réaliste vue du ciel | Il faut une **clé Google Maps Platform** (facturation), et la couverture de Kinshasa n'est pas garantie. Les conditions d'utilisation **interdisent** d'en extraire la géométrie pour un jeu. La photogrammétrie est floue au niveau de la rue et n'a pas de collisions. | Possible **uniquement pour le mode carte (Google Earth)**, avec votre accord et une clé. Inadapté au mode jeu. |
| **Modèles glTF/GLB faits à la main** | Le vrai saut vers GTA V | Compatible avec le moteur actuel (déjà utilisé pour les personnages) | **Recommandé** pour la suite : monuments, façades typiques, véhicules, mobilier, à partir de vos photos |

---

## 5. Limites restantes (à ne pas sous-estimer)

- **Hauteurs** : la plupart sont **estimées** d'après la surface au sol (moins de 2 % sont documentées). Le centre de la Gombe paraît donc plus bas qu'en réalité.
- **Styles générés** : le type, la couleur et la toiture sont **déduits**, pas relevés bâtiment par bâtiment. Une maison peut avoir une autre couleur ou un autre toit qu'en vrai.
- **Ouvertures non découpées** : les fenêtres sont posées sur le mur (cadre et vitre en saillie) et non découpées dans le mur. Il n'y a pas d'intérieurs.
- **Parcelles et clôtures** : les murs de clôture et portails des parcelles ne sont **pas** générés, car aucune donnée de parcelles n'est disponible.
- **Véhicules** : ils restent construits en code. Pour atteindre le niveau GTA V, il faut des modèles faits par un artiste 3D, sous une licence qui permet leur usage.
- **Personnages** : il n'existe pas de modèles « AAA » libres d'utilisation. Les modèles Quaternius (CC0) n'ont pas d'expressions faciales. Il faudrait des modèles de type MetaHuman, mais leur licence est réservée à Unreal Engine, ou des personnages faits sur commande.
- **Post-traitement** : il n'y a pas encore d'occlusion ambiante d'écran ni de halo lumineux (bloom). C'est possible en qualité « haute » sur PC, mais coûteux pour un ordinateur à carte graphique intégrée.
- **Performances** : aucun test sur un vrai téléphone ni sur un vrai PC. Le rendu logiciel de test est d'environ 2 fois plus lent qu'avant, à cause des textures et des détails. En qualité « basse » (téléphone), les détails en relief sont désactivés et les textures sont réduites.
