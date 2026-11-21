# Simulation de la vie urbaine — Limete et Gombe (Kinshasa)

Module « vie urbaine » du mode jeu web (`web/kinshasa/jeu/`).
Ce document dit **ce qui est réel, ce qui est simulé, ce qui est testé, et ce qui manque**.

> **Zones couvertes : Limete — Tour de l'Échangeur (3,2 × 3,2 km) et la Gombe (9,2 × 4 km).**
> Le reste de Kinshasa n'est pas encore jouable en mode GTA.
>
> La zone « Gombe » est un rectangle qui couvre toute la commune de la Gombe (12,3 km²), une partie du fleuve Congo
> et le bord des communes voisines (Barumbu, Lingwala, Kinshasa, Ngaliema).
> Ouvrir : `jeu/?zone=gombe`, ou bouton « 🗺️ Changer de zone » (touche J) dans le jeu.

---

## 1. Sources consultées sur les transports de Kinshasa

Ces sources ont servi à choisir les types de véhicules, leur part dans le trafic et leur comportement.
Elles ne donnent **pas** d'horaires officiels ni de comptages par rue, donc ces chiffres restent simulés.

| Sujet | Source |
|---|---|
| Bus « esprit de mort » (Mercedes 207) et minibus | [le360 Afrique](https://afrique.le360.ma/economie/rdc-esprit-de-mort-ces-bus-qui-menent-la-vie-dure-aux-kinois_24MXUK3JCJCE7E5AIRBCTPNPT4/) |
| Déplacements quotidiens, embouteillages | [phys.org (AFP, 2019)](https://phys.org/news/2019-06-kinshasa-commuting-hell-dr-congo.html) |
| Moto-taxis « wewa » | [afrik.com — les wewa](https://www.afrik.com/rdc-a-la-rencontre-des-wewa-ces-moto-taximen-de-kinshasa) |
| Taxis et taxis collectifs | [afrik.com — taxis](https://www.afrik.com/hep-taxi) |
| Transco, bus urbains, actualité des transports | [allafrica 2025-01](https://fr.allafrica.com/stories/202501150472.html), [allafrica 2026-01](https://fr.allafrica.com/stories/202601260534.html), [allafrica 2026-03](https://fr.allafrica.com/stories/202603060745.html), [allafrica 2026-09](https://fr.allafrica.com/stories/202609080482.html) |
| Mobilité urbaine (étude) | [Université d'Anvers](https://repository.uantwerpen.be/docman/irua/ee3566/160703.pdf) |
| Plan directeur des transports de Kinshasa | [JICA (1)](https://openjicareport.jica.go.jp/pdf/10297596_02.pdf), [JICA (2)](https://openjicareport.jica.go.jp/pdf/12340337.pdf) |

Données cartographiques :
- **OpenStreetMap** (ODbL), via l'API officielle, avec `tools/jumeau/extraire_transports.py`.
- **Overture Maps** (release 2026-11-18.0), pour les routes et les sens uniques (`tools/jumeau/decouper_zone.py`).

---

## 2. Réel ou simulé

| Élément | Statut | Détail |
|---|---|---|
| Routes, classes de routes, noms de rues | **Réel** | Overture/OSM : 1637 segments, dont 895 nommés |
| Sens uniques | **Réel** | 130 segments marqués « sens unique » dans Overture |
| **Limete** : ligne de bus **02 « Royal – Masina sans fil »** (Transco) | **Réel** (tracé) | Relation OSM, 2289 m dans la zone |
| **Gombe** : lignes **02**, **06B « Bandal Tshibangu – ONATRA »** et **11 « Clinique Ngaliema – Yolo/Kapela »** | **Réel** (tracés) | Relations OSM : 4413 m, 10 834 m (aller-retour en boucle) et 2862 m dans la zone |
| Arrêts nommés | **Réel** | Limete : 7 arrêts OSM (un seul, « 14ème Rue », sur la ligne 02). Gombe : 31 points d'arrêt OSM. Les points de même nom à moins de 80 m (quai, poteau, chaque côté) comptent pour un seul arrêt. |
| Passages piétons | **Réel** + simulés | Limete : 6 réels. Gombe : 40 réels. Des passages simulés sont ajoutés aux carrefours à feux. |
| Feux tricolores | **Réel** à la Gombe, sinon **simulé** | Limete : OSM n'en contient **aucun**. Gombe : 7 feux OSM, regroupés en **4 carrefours à feux réels**. Les autres feux (81 à la Gombe) sont placés par le jeu aux croisements de grands axes. |
| Lignes de minibus **M1** (boulevard Lumumba), **G1** (boulevard du 30 Juin), **G2** (avenue des Huileries) | **Simulé** | Lignes inventées, signalées comme telles dans le jeu |
| Arrêts « Arrêt N (simulé) » | **Simulé** | Un arrêt tous les 400 m environ là où OSM n'en a pas |
| Horaires, prix (500 / 1000 / 1500 FC) | **Simulé** | Estimés en direct à partir des véhicules. Ce ne sont pas des horaires officiels. |
| Nombre de véhicules, mélange, embouteillages | **Simulé** | Calé sur les sources ci-dessus. Aucun comptage réel. |

Les mêmes étiquettes s'affichent dans le jeu :
- l'aide (Échap) ;
- le panneau des lignes (B), avec « tracé réel » en vert et « simulé » en orange ;
- l'indicateur « Trafic … (simulé) ».

---

## 3. Ce qui fonctionne

### Véhicules

Neuf types de véhicules :
- taxi (jaune), minibus, voiture, moto-taxi, camion, camionnette de livraison ;
- ambulance et police, avec gyrophares et sirène ;
- bus Transco.

Chaque véhicule a :
- un modèle 3D et un conducteur visible à moins de 70 m ;
- un profil de conduite : calme, normal ou pressé ;
- une vitesse limitée par la classe de route ;
- une destination et un itinéraire calculé par A* sur le vrai réseau. Le coût tient compte des bouchons.

Ce qui gère la conduite :
- **Suivi de véhicule** : modèle IDM. Le véhicule freine et accélère selon celui qui est devant.
- **Changement de voie** : de type MOBIL, avec annulation s'il y a conflit.
- **Carrefours** :
  - feux ;
  - priorité à la route la plus importante ;
  - « ne pas bloquer le carrefour » : un véhicule n'entre que si la sortie est libre ;
  - patience limitée, pour éviter les blocages éternels.
- **Motos** : elles remontent les files (« interfile »).
- **Accidents** (touche K) : la voie est bloquée, les autres véhicules sont déviés, puis l'accident est dégagé.
- **Niveaux** : faible, moyen ou intense (touche G).
- **Heure** : la demande suit un profil horaire, avec des pointes de 6 h à 9 h et de 16 h à 19 h.

### Transports en commun

- **Bus de ligne**, à chaque arrêt :
  - le bus s'arrête ;
  - les passagers descendent un par un, puis les autres montent ;
  - le bus repart ;
  - au terminus, il fait demi-tour.
- **Panneau des lignes (B)** : arrêts, terminus, personnes en attente, prochain passage, véhicules en service.
- **Moto-taxi et taxi** : un piéton appelle un véhicule, qui vient le chercher, le transporte et le dépose près de sa destination.
- **Le joueur peut prendre les transports** (touche E) :
  - un bus arrêté, pour 500 FC ;
  - une moto-taxi, pour 1000 FC ;
  - un taxi, pour 1500 FC.

### Piétons

Les piétons :
- marchent sur les trottoirs ;
- attendent au bord avant de traverser, et traversent sur les passages ;
- attendent aux arrêts ;
- appellent une moto ou un taxi ;
- montent à bord.

Les véhicules s'arrêtent devant un passage occupé.

### Personnage principal

Le personnage vient de Quaternius (CC0), avec la bibliothèque d'animations Universal Animation Library. Animations :
- immobile, puis attente « en parlant » après 8 s ;
- marche lente (Alt), marche, course, sprint (après 1,5 s de course) ;
- saut, accroupi (immobile et en marche) ;
- assis, en conduisant ou en passager ;
- geste d'interaction.

### Éditeur de personnage (U)

L'éditeur permet de choisir :
- le sexe, le teint (6 teintes), la coiffure, la barbe ;
- les couleurs du haut, du bas et des chaussures ;
- le motif du haut (dont le wax), les manches longues, le col ou la veste, le pagne ;
- des accessoires : casquette, lunettes, sac à dos, chaîne.

Six styles sont prêts à l'emploi : Chemise en wax, Sapeur, Maillot des Léopards, Étudiant, Mama en pagne, Tenue de ville.

Le choix est enregistré dans le navigateur.

### Caméras (V)

- À pied : 3e personne, 1re personne, aérienne, libre.
- En véhicule : poursuite, intérieure, aérienne.

La caméra ne traverse pas les murs : un rayon détecte le mur et rapproche la caméra.

### Optimisation

- La simulation complète tourne sur toute la zone. Le rendu 3D, lui, se limite à ce qui est proche :
  - véhicules à moins de 220 m ;
  - conducteurs à moins de 70 m ;
  - piétons à moins de 110 m ;
  - décor à moins de 260 m.
- Les objets 3D sont réutilisés (« pooling ») au lieu d'être recréés.
- Les collisions physiques avec les véhicules simulés ne sont actives qu'à moins de 45 m du joueur.
- Une « bulle » de population garde des piétons et des véhicules autour du joueur.
- Un véhicule bloqué plus de 60 s, loin du joueur, est retiré.

---

## 4. Scénarios de test (exécutés)

Commande : `cd web/kinshasa/jeu && npm test`.
Résultat au 21/11/2026 : **21 tests sur 21 réussis**. Il y a 13 tests de physique et de géographie (dont le relief des zones rectangulaires), et 8 scénarios de simulation.

Les scénarios sont dans `tests/simulation.test.js`. Chacun vérifie aussi qu'**aucun véhicule n'en chevauche un autre**.

| Scénario | Ce qui est vérifié | Résultat |
|---|---|---|
| **A** — Bus de la ligne réelle 02 | Le bus arrive à un arrêt, un passager monte, le bus repart, puis le passager descend plus loin | ✅ |
| **B** — Moto-taxi | Un client est pris en charge puis déposé à moins de 80 m de sa destination, après plus de 300 m de trajet | ✅ |
| **C** — Carrefour à feux, 30 véhicules | Les 30 véhicules passent. Aucune entrée au rouge, au plus 20 % à l'orange, une file d'au moins 5 véhicules se forme. | ✅ |
| **D** — Bouchon derrière un bus | Une file d'au moins 3 véhicules se forme derrière le bus arrêté. 30 s après son départ, tout le monde roule. | ✅ |
| **E** — Joueur dans la ville (navigateur) | Voir ci-dessous | ✅ |
| **F** — Piétons qui traversent | 16 piétons différents traversent. Aucun véhicule sur le passage pendant qu'il est occupé. | ✅ |
| **G** — Heures de pointe | Il y a plus de véhicules à 8 h qu'à 13 h, et plus à 13 h qu'à 3 h. La vitesse est plus élevée la nuit qu'en pointe. | ✅ |
| **H** — Accident | Le véhicule accidenté est immobile en 5 s, l'accident est ensuite dégagé, sans chevauchement | ✅ |
| **I** — Zone de la Gombe | Les 3 lignes réelles sont créées (dont la 06B en boucle), au moins un carrefour à feux réel, 12 min à 8 h sans chevauchement, chaque bus a avancé pendant les 5 dernières minutes, plus de 250 véhicules et vitesse sur les axes supérieure à 11 km/h | ✅ |

**Scénario E (navigateur).** Test `tests/e2e_navigateur.cjs`, avec Chromium et Playwright (rendu logiciel). **22 vérifications sur 22 réussies.**
- Carte sans erreur, tuiles chargées, circulation et piétons affichés autour du joueur.
- Marche et accroupi.
- Conduite : monter, avancer, freiner, descendre.
- Quatre changements de caméra, puis retour à la 3e personne.
- Éditeur de personnage : l'apparence est appliquée et enregistrée.
- Moto-taxi prise par le joueur : montée comme passager, puis descente.
- Sauvegarde, et aucune erreur JavaScript.
- Gombe : zone chargée, lignes réelles 02, 06B et 11, circulation affichée, le joueur marche, sauvegarde séparée de celle de Limete.
- Changement de zone depuis le jeu (retour à Limete).

### Performances mesurées (machine de test, simulation seule)

| Niveau | Véhicules | Piétons | Temps de calcul pour 1 s simulée | Stable sur |
|---|---|---|---|---|
| Moyen | 394 | 307 | ≈ 17 ms | 1 h simulée |
| Intense | 667 | 522 | ≈ 30 ms | 1 h simulée |
| Gombe, moyen, 8 h (pointe) | ≈ 510 | ≈ 420 | ≈ 30 à 40 ms | 30 min simulées |
| Gombe, intense, 17 h (pointe) | ≈ 886 | ≈ 700 | ≈ 60 à 85 ms | 20 min simulées |

Vitesse moyenne sur les grands axes, au niveau moyen : environ 26 à 34 km/h à Limete, environ 25 à 29 km/h à la Gombe en heure de pointe.

Chargement de la Gombe dans le navigateur de test : environ 7 s. Rendu : environ 11 images/s en rendu logiciel (sans carte graphique), comme à Limete.

---

## 5. Limites connues

- **Pas d'expressions faciales** ni d'animation séparée des doigts : le modèle de base ne les a pas.
- **Pas d'intérieurs de bâtiments ni de portes ouvrables.** La caméra « intérieure » n'existe que dans les véhicules.
- L'inclinaison des motos est **visuelle**. Leur physique simulée reste celle de la trajectoire.
- Les feux non cartographiés et les lignes M1, G1 et G2 sont **simulés** (voir la section 2).
- **Deux zones** sont jouables : Limete et la Gombe. Elles sont séparées : on passe de l'une à l'autre par le menu, pas en roulant.
- Gombe :
  - les monuments (Tour Sozacom, gare centrale, Palais de la Nation, Hôtel Fleuve Congo…) ne sont **pas modélisés à part** : ce sont les volumes génériques des données ;
  - seuls 609 bâtiments sur 42 933 ont une hauteur documentée. Les autres ont une hauteur **estimée** d'après leur surface, si bien que le centre-ville paraît plus bas qu'en réalité. J'ai essayé d'estimer les hauteurs avec le relief satellite Copernicus, mais il sous-estime fortement les tours connues (42 m au lieu de 90 m pour l'Hôtel Fleuve Congo), donc cette piste n'a pas été retenue ;
  - les îlots du fleuve ne sont pas dessinés (seul le contour extérieur de l'eau est tracé).
- Le jeu n'a **pas encore été testé sur un vrai téléphone ni sur une vraie carte graphique**. Les tests ont été faits en navigateur sans carte graphique et sur un téléphone émulé.
- Les modèles de véhicules sont simplifiés. Ce sont des créations originales, pas des copies de GTA.

---

## 6. Fichiers

**Outils**
- `tools/jumeau/decouper_zone.py` : découpe d'une zone carrée ou rectangulaire (ex. `4600x2000`), avec mise à plat du fleuve dans le relief.
- `tools/jumeau/extraire_transports.py` : extraction OSM des arrêts, lignes, passages et feux.

**Zones**
- `web/kinshasa/jeu/js/zones.js` : réglages par zone (nom, point de départ, lignes simulées).

**Simulation**
- `web/kinshasa/jeu/js/simulation/reseau.js` : graphe routier et itinéraires A*.
- `web/kinshasa/jeu/js/simulation/circulation.js` : véhicules, lignes, piétons, carrefours, accidents.
- `web/kinshasa/jeu/js/simulation/rendu.js` : affichage 3D, LOD et pooling.

**Jeu**
- `web/kinshasa/jeu/js/personnages.js` et `joueur.js` : personnages, éditeur, animations.
- `web/kinshasa/jeu/js/interface.js` : panneaux Personnage et Lignes.

**Tests**
- `web/kinshasa/jeu/tests/simulation.test.js` et `tests/e2e_navigateur.cjs`.
