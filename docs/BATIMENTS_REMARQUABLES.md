# Bâtiments remarquables — reconstruction individuelle

Objectif : qu'une personne qui connaît Kinshasa **reconnaisse** les bâtiments qu'elle voit dans le jeu. Chaque bâtiment emblématique est modélisé **un par un**, à sa **vraie position GPS**, d'après des **références vérifiables**. Sa fiche dit clairement ce qui vient d'une photo, d'une carte, d'une estimation ou d'une hypothèse.

État au 23/11/2026 : **4 lieux modélisés** (Hôpital du Cinquantenaire, Stade des Martyrs, FIKIN, Hôpital Général de Référence de Kintambo) et **1 093 lieux inventoriés** à reproduire.

## 1. Méthode

1. **Identité vérifiée.** Nom exact, adresse et contour du terrain viennent d'OpenStreetMap (Nominatim et API officielle), avec Wikidata et Wikipédia.
2. **Photos de référence.** Seules des photos sous **licence libre** (Wikimedia Commons) sont copiées dans le dépôt, avec leur auteur et leur licence. Elles sont listées dans `tools/batiments/references.json`. Les articles de presse et les autres pages sont cités par lien seulement.
3. **Empreintes réelles.** Le plan des bâtiments du site vient de `tools/batiments/extraire_site.py` :
   - OpenStreetMap ;
   - Google Open Buildings et Overture, pour les empreintes détectées par satellite.
4. **Modélisation dans Blender 4.2**, par scripts reproductibles (`tools/batiments/blender/*.py`) :
   - géométrie posée sur les empreintes réelles ;
   - façades dessinées d'après les photos (`tools/batiments/textures.py`) ;
   - lettres en relief ;
   - export **GLB** avec quatre nœuds : `LOD0`, `LOD1`, `LOD2` et `COLLISION`.
5. **Contrôle qualité.** On compare le modèle à la photo **depuis le même point de vue**, avec la visionneuse `jeu/visionneuse.html` (vues face, côté, aérienne, « comme la photo »). Chaque élément reçoit un statut, consigné dans `jeu/donnees/batiments.json`.

| Statut | Signification |
|---|---|
| **photo** | Vu sur une photo libre |
| **osm** | OpenStreetMap |
| **satellite** | Empreinte détectée par satellite |
| **estimé** | Mesure estimée (hauteur, proportions) |
| **déduit** | Hypothèse cohérente, **non vérifiée** |
| **absent** | Non reproduit, faute de référence |

**Google Images, Google Maps, Google Earth et Bing ne sont pas utilisés comme source de modélisation.** Leurs conditions d'utilisation interdisent d'extraire et de réutiliser leurs images et leurs modèles 3D. Je n'ai pas non plus d'accès automatisé à ces services. Les vues aériennes de comparaison sont donc des rendus du modèle, pas des images satellites.

## 2. Les quatre lieux

### Hôpital du Cinquantenaire — fidélité **moyenne**

![Comparaison](images/batiments/cinquantenaire_comparaison.jpg)
![Vues](images/batiments/cinquantenaire_vues.jpg)

- **Identité.**
  - Hôpital du Cinquantenaire, avenue de la Libération (ex-boulevard du 24 Novembre), Kasa-Vubu.
  - GPS −4,34169 ; 15,29633 ([OSM way 102422512](https://www.openstreetmap.org/way/102422512)).
  - Inauguré le 22 mars 2014 ; devenu « CHU du Cinquantenaire (CHU-50) » en 2026 selon l'ACP.
- **Référence.** [« HÔPITAL DU CINQUANTENAIRE.jpg »](https://commons.wikimedia.org/wiki/File:H%C3%94PITAL_DU_CINQUANTENAIRE.jpg), par Tite koya, CC BY-SA 4.0, 12/11/2025. Seule photo libre trouvée.
- **Reproduit d'après la photo** :
  - grand bloc blanc d'environ 8 niveaux, à **hublots ovales** reliés par des barres horizontales et reliefs en losange ;
  - **tour d'escalier** à petites baies. L'empreinte satellite montre une saillie de 9,4 m exactement de ce côté.
  - **aile basse gris anthracite** à fenêtres cadrées de blanc, couronnée d'un **bandeau à grands disques** ;
  - **portique** et **lettres dorées « HÔPITAL DU CINQUANTENAIRE »** avec médaillon ;
  - **grille noire à piliers surmontés de globes** ;
  - pelouse, palmier, **auvents voûtés** du parking ;
  - bloc blanc à fenêtres et mât d'antenne.
- **Corrections apportées par cette recherche.**
  - La photo de 2025 ne montre **aucun rouge**. Les « hublots cerclés de rouge » et les « ailes en brique rouge » de la version précédente ont été retirés.
  - Les ambulances et la verrière inventées ont été supprimées.
- **Non vérifié.**
  - Les faces nord, est et sud des bâtiments.
  - Le bloc nord, les annexes (21 empreintes) et les hauteurs exactes.
  - La position GPS enregistrée par le téléphone semble décalée d'environ 120 m. Le point de vue de comparaison est placé là où la disposition correspond, perpendiculairement à la grille comme sur la photo.

### Stade des Martyrs de la Pentecôte — fidélité **moyenne**

![Comparaison](images/batiments/stade_martyrs_comparaison.jpg)
![Vues](images/batiments/stade_martyrs_vues.jpg)

- **Identité.**
  - Avenue de la Région, Lingwala ; GPS −4,33018 ; 15,31036 ([OSM way 4402561](https://www.openstreetmap.org/way/4402561)).
  - Construit avec la coopération chinoise (1988-1993), inauguré en septembre 1994, environ 80 000 places.
- **Références.** Les quatre photos libres de Commons :
  - extérieur : Fiston bamela, CC0 ;
  - tribunes : Mikebrown7, CC BY-SA 4.0 ;
  - tribune principale : MONUSCO, CC BY-SA 2.0 ;
  - terrain annexe : Alphonse Masandi, CC BY-SA 4.0.
- **Reproduit.**
  - Contour réel (296 × 228 m) et pelouse synthétique réelle (105 × 68 m, OSM).
  - Cuvette **sans façade fermée** : dessous incliné de la tribune haute, **poteaux obliques**, **poutre annulaire**, couronne de **panneaux nervurés**.
  - Deux niveaux séparés par un **bandeau ocre**, avec des **sièges bleus et jaunes**.
  - **Galerie couverte** au sommet, dont la rive de toiture est **en dents de scie**.
  - Garde-corps blanc ; piste de 400 m.
- **Estimé ou absent.**
  - Hauteur (environ 35 m), nombre de travées, couleur extérieure (photo en noir et blanc) et accès.
  - Écran géant, éclairage, terrain annexe : non reproduits.

### FIKIN (Foire internationale de Kinshasa) — fidélité **faible**

![Comparaison](images/batiments/fikin_comparaison.jpg)
![Vues](images/batiments/fikin_vues.jpg)

- **Identité.** Masiala, Limete ; GPS −4,37202 ; 15,33781 ([OSM way 4708901](https://www.openstreetmap.org/way/4708901), environ 28 ha). Ouverte le 30 juin 1969.
- **Référence.** [Monument de la FIKIN](https://commons.wikimedia.org/wiki/File:Monument_de_la_Foire_internationale_de_Kinshasa_(FIKIN),_R%C3%A9publique_d%C3%A9mocratique_du_Congo.jpg), par Fiston bamela, CC0, 2/12/2025.
- **Reproduit d'après la photo.**
  - La **grande statue blanche** : homme musclé, main droite levée, objet rond tenu à la main gauche, pagne, socle sombre. Ses proportions sont estimées d'après les voitures.
  - Le **hangar** à toit de tôle, avec la banderole « Bienvenue à la 46e édition FIKIN », la grille et les drapeaux de la RDC.
  - Le sol en terre.
- **Déduit.**
  - La **position de l'entrée** (côté est) : route « Entrée FIKIN » d'OSM et conteneurs et silos de la zone industrielle visibles derrière le hangar sur la photo.
  - Les 263 pavillons sont placés sur leurs empreintes satellite réelles, mais leur **apparence n'est pas vérifiée** : aucune photo libre.
  - 14 empreintes du parvis ne sont pas construites. La photo de 2025 y montre un parking dégagé ; l'image satellite (non datée) contenait peut-être des stands temporaires.

### Hôpital Général de Référence de Kintambo — niveau **volumétrie**

![Vues](images/batiments/kintambo_hgr_vues.jpg)

- **Identité vérifiée.**
  - « Hôpital de Kintambo » désigne l'**Hôpital Général de Référence de Kintambo** ([OSM way 404843994](https://www.openstreetmap.org/way/404843994), `health_facility:CD = hgr`). Le [rapport MCSP 2019](https://www.mcsprogram.org/wp-content/uploads/dlm_uploads/2019/06/DRC-Model-Training-Center-Case-Study-FINAL_French.pdf) le nomme « Hôpital général de Kintambo ».
  - Ce n'est pas un hôpital pédiatrique distinct.
  - La Maternité de Kintambo est voisine ([OSM way 539014983](https://www.openstreetmap.org/way/539014983), un niveau).
- **Reproduit.** Le **plan réel** des 51 bâtiments : des pavillons parallèles d'un seul niveau, disposés en peigne.
- **Non vérifié.** **Aucune photo libre trouvée**. Façades, toits, couleurs, entrées et enseignes sont une hypothèse neutre, signalée dans le jeu. **Ce modèle n'est pas considéré comme terminé.**
- **Zone de jeu.** Une nouvelle zone **Kintambo** (2 × 2 km) a été créée pour l'accueillir. Elle compte 10 601 bâtiments, la ligne de bus réelle 06B et 158 lieux.

## 3. Dans le jeu

- **Position réelle.** Chaque modèle est placé à son point GPS dans la zone (`js/batiments.js`).
- **Site dégagé et terrassé.**
  - Les bâtiments génériques de l'emprise sont retirés du rendu et des collisions. La carte garde leurs empreintes réelles.
  - Les arbres *estimés* y sont retirés ; les arbres réels d'OSM restent.
  - Le relief est mis à niveau sous le site, avec un raccord progressif sur 40 m.
- **Niveaux de détail** (`THREE.LOD`). Ils changent selon la distance (par exemple 180 m et 600 m pour l'hôpital).
  - **LOD0** : modèle détaillé, avec garde-corps, barreaux, lettres et statue lisse.
  - **LOD1** : intermédiaire.
  - **LOD2** : silhouette texturée. Elle reste reconnaissable de loin et depuis la caméra aérienne.
  - En qualité « basse », LOD1 et LOD2 seulement.
- **Reconnaissance.**
  - À l'approche, le nom s'affiche discrètement, sur trois lignes :
    ```
    HÔPITAL DU CINQUANTENAIRE
    Établissement hospitalier
    Kasa-Vubu, Kinshasa, RDC
    ```
  - Le menu d'interaction propose alors **« Fiche »** et **« Regarder le bâtiment »**. Cette vue cinématique fait tourner la caméra autour du bâtiment ; un mouvement rend la main au joueur.
- **Menu pause → Lieux.**
  - Fiche complète : noms, adresse, commune, GPS, distance, description, fidélité élément par élément, photos de référence créditées, sources, date de vérification.
  - Boutons : **Destination GPS** (itinéraire sur le réseau réel), **Y aller** (charge la zone et place le joueur à l'entrée, face au bâtiment), **Regarder le bâtiment**, **Modèle 3D et comparaison** (visionneuse).
- **Cartes.** Les bâtiments remarquables y apparaissent avec une emprise dorée et une étoile ; la grande carte affiche aussi leur nom.

## 4. Reconstruction à grande échelle

`tools/batiments/inventaire.py` interroge les lieux nommés d'Overture Maps sur toute l'agglomération. Il les classe selon l'ordre de priorité demandé, leur attribue leur commune et marque ceux déjà modélisés. Le résultat est écrit dans `jeu/donnees/inventaire_batiments.json` et résumé dans le menu Lieux.

| Priorité | Catégorie | Lieux | Modélisés |
|---|---|---|---|
| 1 | Emblématiques (monuments, sites historiques, musées, places) | 166 | 0 * |
| 2 | Hôpitaux et cliniques | 101 | 4 entrées (2 établissements) |
| 3 | Stades | 15 | 2 entrées (1 stade) |
| 4 | Universités et instituts | 174 | 0 |
| 5 | Hôtels | 217 | 0 |
| 6 | Centres commerciaux et marchés | 80 | 0 |
| 7 | Administrations, ambassades, gares, aéroport, banques | 340 | 0 |
| 8-9 | Immeubles et maisons | 1,38 million d'empreintes réelles | apparence générique |

\* La FIKIN est modélisée, mais Overture ne la classe pas comme « emblématique ». Les doublons de noms (« Hôpital du Cinquantenaire » / « L'hôpital du Cinquantenaire de Kinshasa ») sont conservés dans cette liste de travail.

**Ajouter un bâtiment** :

1. Vérifier son identité dans OSM et rassembler ses photos libres. Les ajouter à `tools/batiments/references.json`.
2. Extraire le site : `python3 tools/batiments/extraire_site.py <id> <zone> <lat> <lon> <rayon> way:<id_osm>`.
3. Écrire `tools/batiments/blender/<id>.py`, en s'inspirant des quatre modèles existants, puis lancer `blender -b --factory-startup --python …`.
4. Ajouter sa fiche dans `tools/batiments/construire_registre.py`, puis lancer `python3 tools/batiments/construire_registre.py`.
5. Contrôler le résultat dans `jeu/visionneuse.html?id=<id>` et lancer `tests/e2e_batiments.cjs`.

## 5. Photogrammétrie : évaluation

| Outil | Besoin | Situation |
|---|---|---|
| Meshroom (AliceVision, libre) | 30 à 200 photos qui se recouvrent, prises tout autour du bâtiment | **Impossible** : 1 à 4 photos libres par bâtiment, prises à des dates et sous des angles différents |
| RealityCapture | Idem, et licence commerciale | Idem |
| Données aériennes | Images obliques ou nuages de points légalement réutilisables | Aucune source libre trouvée. Les tuiles 3D Google sont interdites d'extraction. |

Ces bâtiments sont donc **modélisés à la main** d'après les références disponibles. Les parties invisibles sont marquées « déduit », jamais présentées comme exactes.

**Pour aller plus loin**, il faudrait une campagne de prise de vue sur place :

- une vidéo au téléphone en faisant le tour du bâtiment, ou un drone avec autorisation ;
- traitée ensuite dans Meshroom, nettoyée dans Blender, puis exportée en GLB avec trois niveaux de détail, comme ici.

## 6. Limites honnêtes

- **Pas d'intérieurs** : on ne peut pas entrer dans les bâtiments.
- **Couleurs et hauteurs** : estimées quand la photo ne suffit pas (photo en noir et blanc du stade, hauteurs sans cote publiée).
- **Comparaisons** :
  - le modèle est rendu dans la visionneuse avec un éclairage simple ;
  - le cadrage de la photo de l'hôpital n'est reproduit qu'approximativement, car la focale du téléphone est inconnue et sa position GPS est décalée.
- **Statue de la FIKIN** : stylisée (volumes anatomiques), pas sculptée. Elle est reconnaissable par sa posture, mais le visage et la musculature fine ne sont pas reproduits.
- **Kintambo** : volumétrie seulement, tant qu'aucune photo libre n'est disponible.

## 7. Tests

```
node web/kinshasa/jeu/tests/e2e_batiments.cjs http://localhost:8080
```

Le test vérifie, dans le navigateur :

- **registre** : fiches complètes ; références libres et créditées ;
- **modèles** : chacun chargé à sa position GPS avec 3 niveaux de détail ;
- **terrain** : relief plat sous le stade ; bâtiments génériques retirés du rendu mais gardés sur la carte ;
- **reconnaissance** : nom affiché à l'approche ; actions « Fiche » et « Regarder » ;
- **fiche** : statuts de fidélité, photo créditée, inventaire, destination GPS ;
- **navigation** : vue cinématique, puis reprise en main ; silhouette au loin et détail de près ; « Y aller » vers la FIKIN (changement de zone, départ à l'entrée) ;
- **Kintambo** : zone chargée ;
- **visionneuse** : les quatre modèles s'ouvrent.

Résultat du 23/11/2026 (serveur local, Chromium sans carte graphique) : **32 vérifications sur 32**, aucune erreur JavaScript.

Le test du jeu (`e2e_navigateur.cjs`) vérifie aussi que le mur du stade arrête un joueur qui court vers la piste.
